// Orquestador audit mensual feed /alquileres.
// 3 capas: drift fetcher (curl) + inconsistencias internas + audit matching.
// Persiste a Supabase (audit_descripciones_runs/items con tipo_operacion='alquiler').

import { config as loadEnv } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { getSupabaseClient, getPropsViejasFromFeed } from './lib/db.mjs';
import { fetchBatch } from './lib/fetcher.mjs';
import { extraerDescripcion, extraerTitle } from './lib/extractor.mjs';
import { compararDescripciones } from './lib/similarity.mjs';
import { runChecks as runInternalChecks, extraerPreciosBobDeTexto } from './lib/internal-checks.mjs';
import { checkMatching } from './lib/matching-checks.mjs';
import { detectarDuplicados } from './lib/dup-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const args = parseArgs(process.argv.slice(2));
const USE_CACHED = args['use-cached'];
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 6;
const SKIP_INSERT = !!args['skip-insert'];

// Las 6 zonas canónicas de Equipetrol. Aislar de Zona Norte (que también vive en
// v_mercado_alquiler / propiedades_v2 desde que ZN entró a prod). Principio P1:
// filtrar en CONSUMIDORES, nunca en las vistas. Ver ticket #15 del backlog ZN.
const EQ_ZONAS = [
  'Equipetrol Centro',
  'Equipetrol Norte',
  'Sirari',
  'Villa Brigida',
  'Equipetrol Oeste',
  'Eq. 3er Anillo',
];

// --macrozona: alcance del audit (default equipetrol).
//   equipetrol  -> solo las 6 zonas canónicas de EQ (modo 'in')
//   zona-norte  -> todo lo que NO es Equipetrol (modo 'notin')
//   todas       -> sin filtro (EQ + ZN)
const MACROZONA = (args.macrozona || 'equipetrol').toLowerCase();
const ZONA_FILTER = (() => {
  if (MACROZONA === 'equipetrol') return { modo: 'in', zonas: EQ_ZONAS, label: 'Equipetrol' };
  if (['zona-norte', 'zonanorte', 'zn'].includes(MACROZONA)) return { modo: 'notin', zonas: EQ_ZONAS, label: 'Zona Norte' };
  if (MACROZONA === 'todas') return { modo: 'none', zonas: [], label: 'todas (EQ + ZN)' };
  console.error(`✖ --macrozona desconocida: "${MACROZONA}". Usá: equipetrol | zona-norte | todas`);
  process.exit(1);
})();

// Aplica el filtro de macrozona a cualquier query builder de supabase (capas 2 y 3).
function aplicarZona(q) {
  if (ZONA_FILTER.modo === 'in') return q.in('zona', ZONA_FILTER.zonas);
  if (ZONA_FILTER.modo === 'notin') return q.not('zona', 'in', `(${ZONA_FILTER.zonas.map((z) => `"${z}"`).join(',')})`);
  return q;
}

// Diff de PRECIO en portal (Capa 1): compara el precio escrito en la cruda guardada
// (vieja) vs el del portal hoy, en BOB. Caza rebajas/subas que la Capa 2 no ve
// (Capa 2 compara precio_mensual_bob vs la cruda vieja, no el portal). Piso 1%.
function calcularPrecioDrift(descBd, descScraped) {
  const pv = extraerPreciosBobDeTexto(descBd);
  const pn = extraerPreciosBobDeTexto(descScraped);
  if (!pv.length || !pn.length) return null;
  // En alquiler el precio principal suele ser el mayor monto plausible (el resto
  // son expensas/depósito, menores). Tomar el máximo de cada texto.
  const viejo = Math.max(...pv);
  const nuevo = Math.max(...pn);
  if (!viejo || !nuevo) return null;
  const diff = (nuevo - viejo) / viejo;
  const abs = Math.abs(diff);
  if (abs < 0.01) return null;
  return {
    viejo, nuevo,
    diff_pct: Math.round(diff * 1000) / 10,
    direccion: nuevo > viejo ? 'suba' : 'rebaja',
    severidad: abs >= 0.1 ? 'alta' : abs >= 0.03 ? 'media' : 'baja',
  };
}

async function main() {
  const tStart = Date.now();
  const runDir = resolve(
    __dirname,
    'reports',
    'mensual-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  );
  await mkdir(runDir, { recursive: true });

  console.log('▶ Audit mensual ALQUILER — orquestador');
  console.log(`  Macrozona: ${ZONA_FILTER.label} (--macrozona ${MACROZONA})`);
  console.log(`  Modo: ${USE_CACHED ? 'CACHED (--use-cached ' + USE_CACHED + ')' : 'NORMAL (curl directo)'}`);
  console.log(`  Run dir: ${runDir}`);

  const supabase = getSupabaseClient();

  // === FASE 1: Drift fetcher (capa 1) ===
  console.log('\n▶ Capa 1: Drift fetcher (curl)');
  const capa1Items = USE_CACHED
    ? await loadCapa1FromCached(USE_CACHED)
    : await runCapa1Fresh(supabase);
  console.log(`  ${capa1Items.length} props procesadas en capa 1`);
  const scrapeOk = capa1Items.filter((c) => c.scrape_status === 'ok').length;
  const scrapeFail = capa1Items.length - scrapeOk;

  // === FASE 2: Inconsistencias internas (capa 2) ===
  console.log('\n▶ Capa 2: Inconsistencias internas');
  const capa2Items = await runCapa2(supabase);
  console.log(`  ${capa2Items.size} props con issues internos`);

  // === FASE 3: Audit matching (capa 3) ===
  console.log('\n▶ Capa 3: Audit matching');
  const capa3Items = await runCapa3(supabase, capa1Items);
  console.log(`  ${capa3Items.size} props con issues de matching`);

  // === FASE 4: Detector de duplicados (apart-hoteles / re-publicaciones) ===
  console.log('\n▶ Duplicados (nombre+precio+área + desc similar)');
  const clustersDup = await runDuplicados(supabase, capa1Items);
  console.log(`  ${clustersDup.length} clusters de posibles duplicados`);

  // === Combinar resultados ===
  const combined = combinarResultados(capa1Items, capa2Items, capa3Items);

  // === Stats ===
  const stats = computeStats(combined);
  stats.clusters_duplicados = clustersDup.length;
  stats.props_duplicadas = clustersDup.reduce((s, c) => s + c.duplicados.length, 0);
  console.log('\n=== Stats globales ===');
  Object.entries(stats).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  const costoFirecrawl = 0; // curl directo, sin Firecrawl

  // === Persistir a Supabase ===
  let runId = null;
  if (!SKIP_INSERT) {
    runId = await persistRunAndItems(supabase, {
      modo: USE_CACHED ? 'cached' : 'normal',
      cached_run_dir: USE_CACHED || null,
      total_props: combined.length,
      scrape_ok: scrapeOk,
      scrape_failed: scrapeFail,
      summary_stats: stats,
      costo_firecrawl: costoFirecrawl,
      items: combined,
    });
  }

  // === Reportes locales ===
  await writeFile(join(runDir, 'combined.json'), JSON.stringify(combined, null, 2), 'utf8');
  await writeFile(
    join(runDir, 'meta.json'),
    JSON.stringify({ runId, stats, costoFirecrawl, modo: USE_CACHED ? 'cached' : 'normal', cachedFrom: USE_CACHED || null, durationMs: Date.now() - tStart }, null, 2),
    'utf8'
  );
  await writeFile(join(runDir, 'summary.md'), renderSummary(combined, stats, runId, USE_CACHED, clustersDup), 'utf8');
  await writeFile(join(runDir, 'duplicados.json'), JSON.stringify(clustersDup, null, 2), 'utf8');

  console.log(`\n✔ Reportes en ${runDir}`);
  console.log(`  - combined.json: detalle completo de ${combined.length} props`);
  console.log(`  - summary.md: reporte ejecutivo (esto es lo que la skill lee)`);
  if (runId) console.log(`  - DB run_id: ${runId}`);
}

// ============================================================
// CAPA 1
// ============================================================

async function runCapa1Fresh(supabase) {
  const props = await getPropsViejasFromFeed(supabase, 1000, 0, [], [], ZONA_FILTER);
  console.log(`  ${props.length} props desde v_mercado_alquiler (${ZONA_FILTER.label})`);

  let lastPct = -1;
  const fetched = await fetchBatch(props, {
    concurrency: CONCURRENCY,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        console.log(`  fetching ${done}/${total} (${pct}%)`);
        lastPct = pct;
      }
    },
  });

  return fetched.map((s) => {
    if (!s.ok) {
      const descBd = s.descripcion_bd || '';
      return {
        id: s.id,
        fuente: s.fuente,
        url: s.url,
        descripcion_bd: descBd,
        descripcion_scraped: '',
        title_scraped: '',
        scrape_status: 'failed',
        error: s.error,
        ...emptyCmp(),
        len_bd: descBd.length,  // preservar — la cruda BD existe aunque el fetch falló
        precio_drift: null,
      };
    }
    const descScraped = extraerDescripcion(s.html, s.fuente);
    const titleScraped = extraerTitle(s.html, s.fuente);
    const cmp = compararDescripciones(s.descripcion_bd || '', descScraped);
    return {
      id: s.id,
      fuente: s.fuente,
      url: s.url,
      descripcion_bd: s.descripcion_bd || '',
      descripcion_scraped: descScraped,
      title_scraped: titleScraped,
      scrape_status: 'ok',
      ...cmp,
      precio_drift: calcularPrecioDrift(s.descripcion_bd || '', descScraped),
    };
  });
}

async function loadCapa1FromCached(runDirName) {
  const runDir = resolve(__dirname, 'reports', runDirName);
  const resultsPath = join(runDir, 'results.json');
  if (!existsSync(resultsPath)) {
    throw new Error(`No existe ${resultsPath}`);
  }
  const items = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const rawDir = join(runDir, 'raw');
  if (existsSync(rawDir)) {
    const titlesById = new Map();
    for (const file of readdirSync(rawDir)) {
      try {
        const data = JSON.parse(readFileSync(join(rawDir, file), 'utf8'));
        if (data.id && data.title_scraped) titlesById.set(data.id, data.title_scraped);
      } catch {}
    }
    for (const item of items) {
      if (titlesById.has(item.id)) item.title_scraped = titlesById.get(item.id);
    }
  }
  for (const item of items) {
    if (item.precio_drift === undefined) {
      item.precio_drift = calcularPrecioDrift(item.descripcion_bd || '', item.descripcion_scraped || '');
    }
  }
  return items;
}

function emptyCmp() {
  return {
    similitud_pct: 0,
    len_bd: 0,
    len_scraped: 0,
    palabras_agregadas: [],
    palabras_quitadas: [],
    flags_semanticos: {},
    bucket: 'identicas',
    tiene_flag_semantico: false,
  };
}

// ============================================================
// CAPA 2
// ============================================================

async function runCapa2(supabase) {
  const { data: vista, error: eV } = await aplicarZona(
    supabase.from('v_mercado_alquiler').select('id, precio_mensual_bob, area_total_m2, zona')
  );
  if (eV) throw eV;
  const precioById = new Map(vista.map((v) => [v.id, parseFloat(v.precio_mensual_bob) || 0]));
  const areaById = new Map(vista.map((v) => [v.id, parseFloat(v.area_total_m2) || 0]));
  const ids = vista.map((v) => v.id);
  if (ids.length === 0) return new Map();

  const issuesByProp = new Map();
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('id, nombre_edificio, datos_json_enrichment')
      .in('id', chunk);
    if (error) throw error;
    for (const p of data) {
      const issues = runInternalChecks({
        precio_mensual_bob: precioById.get(p.id) || 0,
        area_total_m2: areaById.get(p.id) || 0,
        nombre_edificio: p.nombre_edificio,
        descripcion_cruda: p.datos_json_enrichment?.descripcion || '',
      });
      if (issues.length > 0) issuesByProp.set(p.id, issues);
    }
  }
  return issuesByProp;
}

// ============================================================
// CAPA 3
// ============================================================

async function runCapa3(supabase, capa1Items) {
  const { data: vista, error: eV } = await aplicarZona(
    supabase.from('v_mercado_alquiler').select('id, zona')
  );
  if (eV) throw eV;
  const ids = vista.map((v) => v.id);
  if (ids.length === 0) return new Map();

  const props = [];
  const chunkSize = 100;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('id, fuente, url, nombre_edificio, id_proyecto_master, datos_json_enrichment')
      .in('id', chunk);
    if (error) throw error;
    props.push(...data);
  }

  const proyectoIds = [...new Set(props.map((p) => p.id_proyecto_master).filter(Boolean))];
  const proyectosById = new Map();
  if (proyectoIds.length > 0) {
    const { data: proys, error: e2 } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial, alias_conocidos')
      .in('id_proyecto_master', proyectoIds);
    if (e2) throw e2;
    for (const pm of proys || []) proyectosById.set(pm.id_proyecto_master, pm);
  }

  const titlesByPropId = new Map();
  for (const c of capa1Items) {
    if (c.title_scraped) titlesByPropId.set(c.id, c.title_scraped);
  }

  const issuesByProp = new Map();
  for (const p of props) {
    const pm = p.id_proyecto_master ? proyectosById.get(p.id_proyecto_master) : null;
    const aliases = collectAliases(p, pm);
    const enriched = {
      id: p.id,
      url: p.url,
      nombre_edificio: p.nombre_edificio,
      aliases,
      descripcion_cruda: p.datos_json_enrichment?.descripcion || '',
    };
    const scraped = { title_scraped: titlesByPropId.get(p.id) || '' };
    const result = checkMatching(enriched, scraped);
    if (result.check !== 'ok') issuesByProp.set(p.id, result);
  }
  return issuesByProp;
}

function collectAliases(prop, pm) {
  const set = new Set();
  if (prop.nombre_edificio) set.add(prop.nombre_edificio);
  if (pm) {
    if (pm.nombre_oficial) set.add(pm.nombre_oficial);
    if (Array.isArray(pm.alias_conocidos)) {
      for (const a of pm.alias_conocidos) if (a) set.add(a);
    }
  }
  return [...set];
}

// ============================================================
// FASE 4: DUPLICADOS
// ============================================================

async function runDuplicados(supabase, capa1Items) {
  const { data, error } = await aplicarZona(
    supabase.from('v_mercado_alquiler').select('id, nombre_edificio, precio_mensual_bob, area_total_m2, zona')
  );
  if (error) throw error;

  const descById = new Map();
  for (const c of capa1Items) {
    descById.set(c.id, (c.descripcion_scraped || c.descripcion_bd || ''));
  }

  const props = (data || []).map((r) => ({
    id: r.id,
    nombre_edificio: r.nombre_edificio,
    precio: parseFloat(r.precio_mensual_bob) || 0,
    area: parseFloat(r.area_total_m2) || 0,
    descripcion: descById.get(r.id) || '',
  }));
  return detectarDuplicados(props);
}

// ============================================================
// COMBINAR
// ============================================================

function combinarResultados(capa1, capa2, capa3) {
  return capa1.map((c1) => {
    const c2 = capa2.get(c1.id) || [];
    const c3 = capa3.get(c1.id) || null;

    const sevC2 = c2.length > 0 ? maxSeveridad(c2.map((i) => i.severidad)) : null;
    const sevC3 = c3 ? c3.severidad : null;
    const sevDrift = c1.precio_drift ? c1.precio_drift.severidad : null;
    const sevMax = maxSeveridad([sevC2, sevC3, sevDrift]);

    return {
      id: c1.id,
      fuente: c1.fuente,
      url: c1.url,
      capa1: {
        bucket: c1.bucket,
        similitud_pct: c1.similitud_pct,
        scrape_status: c1.scrape_status,
        len_bd: c1.len_bd,
        len_scraped: c1.len_scraped,
        descripcion_bd: c1.descripcion_bd,
        descripcion_scraped: c1.descripcion_scraped,
        title_scraped: c1.title_scraped || '',
        flags_semanticos: c1.flags_semanticos,
        palabras_agregadas: c1.palabras_agregadas,
        palabras_quitadas: c1.palabras_quitadas,
        precio_drift: c1.precio_drift || null,
      },
      capa2: c2,
      capa3: c3,
      severidad_max: sevMax,
    };
  });
}

function maxSeveridad(arr) {
  const orden = { alta: 3, media: 2, baja: 1 };
  let max = null;
  let maxVal = 0;
  for (const s of arr) {
    if (s && (orden[s] || 0) > maxVal) {
      max = s;
      maxVal = orden[s];
    }
  }
  return max;
}

// ============================================================
// STATS
// ============================================================

function computeStats(combined) {
  const stats = {
    total: combined.length,
    identicas: 0,
    cambio_menor: 0,
    cambio_relevante: 0,
    reescritas: 0,
    listings_muertos: 0,
    sin_cruda_bd: 0,
    con_flag_semantico: 0,
    con_inconsistencia_interna: 0,
    con_mismatch_matching: 0,
    con_precio_drift_portal: 0,
    severidad_alta: 0,
    severidad_media: 0,
    severidad_baja: 0,
    scrape_failed: 0,
  };
  for (const r of combined) {
    if (r.capa1.scrape_status !== 'ok') stats.scrape_failed++;
    if (r.capa1.len_bd === 0) stats.sin_cruda_bd++;
    const b = r.capa1.bucket;
    if (b === 'identicas') stats.identicas++;
    else if (b === 'cambio_menor') stats.cambio_menor++;
    else if (b === 'cambio_relevante') stats.cambio_relevante++;
    else if (b === 'reescrita') {
      if (r.capa1.len_scraped === 0) stats.listings_muertos++;
      else stats.reescritas++;
    }
    if (r.capa1.flags_semanticos && Object.keys(r.capa1.flags_semanticos).length > 0) {
      stats.con_flag_semantico++;
    }
    if (r.capa2.length > 0) stats.con_inconsistencia_interna++;
    if (r.capa3 && r.capa3.check === 'mismatch_real') stats.con_mismatch_matching++;
    if (r.capa1.precio_drift) stats.con_precio_drift_portal++;
    if (r.severidad_max === 'alta') stats.severidad_alta++;
    else if (r.severidad_max === 'media') stats.severidad_media++;
    else if (r.severidad_max === 'baja') stats.severidad_baja++;
  }
  return stats;
}

// ============================================================
// PERSISTIR A SUPABASE
// ============================================================

async function persistRunAndItems(supabase, payload) {
  try {
    const { data: runRow, error: e1 } = await supabase
      .from('audit_descripciones_runs')
      .insert({
        tipo_operacion: 'alquiler',
        modo: payload.modo,
        cached_run_dir: payload.cached_run_dir,
        total_props: payload.total_props,
        scrape_ok: payload.scrape_ok,
        scrape_failed: payload.scrape_failed,
        summary_stats: payload.summary_stats,
        costo_firecrawl: payload.costo_firecrawl,
      })
      .select('id')
      .single();
    if (e1) throw e1;

    const runId = runRow.id;
    const itemsForInsert = payload.items.map((r) => ({
      run_id: runId,
      tipo_operacion: 'alquiler',
      prop_id: r.id,
      fuente: r.fuente,
      url: r.url,
      bucket: r.capa1.bucket,
      similitud_pct: r.capa1.similitud_pct,
      descripcion_bd_snapshot: r.capa1.descripcion_bd,
      descripcion_scraped: r.capa1.descripcion_scraped,
      title_scraped: r.capa1.title_scraped || null,
      flags_semanticos: r.capa1.flags_semanticos || {},
      palabras_agregadas: r.capa1.palabras_agregadas || [],
      palabras_quitadas: r.capa1.palabras_quitadas || [],
      scrape_status: r.capa1.scrape_status,
      inconsistencias_internas: r.capa2 || [],
      severidad_max: r.severidad_max,
      matching_check: r.capa3?.check || null,
      matching_detalle: r.capa3?.detalle || null,
    }));

    const chunkSize = 100;
    for (let i = 0; i < itemsForInsert.length; i += chunkSize) {
      const chunk = itemsForInsert.slice(i, i + chunkSize);
      const { error: e2 } = await supabase.from('audit_descripciones_items').insert(chunk);
      if (e2) throw e2;
    }
    console.log(`✓ Persistido en Supabase: run_id=${runId}, items=${itemsForInsert.length}`);
    return runId;
  } catch (err) {
    console.warn(`⚠ No se pudo persistir a Supabase: ${err.message}`);
    console.warn(`  (¿migración 244 aplicada? — el script siguió con el reporte local)`);
    return null;
  }
}

// ============================================================
// SUMMARY
// ============================================================

function renderSummary(combined, stats, runId, modo, clustersDup = []) {
  const lines = [];
  lines.push(`# Audit mensual alquiler — ${new Date().toISOString().slice(0, 10)}`);
  lines.push('');
  lines.push(`**Macrozona:** ${ZONA_FILTER.label}`);
  if (runId) lines.push(`**DB run_id:** \`${runId}\``);
  if (modo) lines.push(`**Modo:** cached (${modo})`);
  lines.push('');
  lines.push('## Stats globales');
  lines.push('');
  lines.push('| Métrica | Cantidad |');
  lines.push('|---|---:|');
  lines.push(`| Total props | ${stats.total} |`);
  lines.push(`| Idénticas | ${stats.identicas} |`);
  lines.push(`| Cambio menor | ${stats.cambio_menor} |`);
  lines.push(`| Cambio relevante | ${stats.cambio_relevante} |`);
  lines.push(`| Reescritas | ${stats.reescritas} |`);
  lines.push(`| **Listings muertos** | ${stats.listings_muertos} |`);
  lines.push(`| Sin cruda en BD | ${stats.sin_cruda_bd} |`);
  lines.push(`| Con flag semántico | ${stats.con_flag_semantico} |`);
  lines.push(`| **Con inconsistencia interna** | ${stats.con_inconsistencia_interna} |`);
  lines.push(`| **Con mismatch matching** | ${stats.con_mismatch_matching} |`);
  lines.push(`| **💲 Cambio de precio en portal** | ${stats.con_precio_drift_portal} |`);
  lines.push(`| **🔁 Clusters duplicados** | ${stats.clusters_duplicados ?? 0} (${stats.props_duplicadas ?? 0} props) |`);
  lines.push(`| 🔴 Severidad alta | ${stats.severidad_alta} |`);
  lines.push(`| 🟡 Severidad media | ${stats.severidad_media} |`);
  lines.push(`| Scrape fallidos | ${stats.scrape_failed} |`);
  lines.push('');

  const altas = combined.filter((r) => r.severidad_max === 'alta');
  if (altas.length > 0) {
    lines.push(`## 🔴 Severidad alta (${altas.length})`);
    lines.push('');
    lines.push('| ID | Fuente | Bucket | C2 issues | C3 check |');
    lines.push('|---:|---|---|---|---|');
    for (const r of altas) {
      const c2 = r.capa2.map((i) => i.tipo).join(', ');
      const c3 = r.capa3 ? r.capa3.check : '-';
      lines.push(`| ${r.id} | ${r.fuente} | ${r.capa1.bucket} | ${c2 || '-'} | ${c3} |`);
    }
    lines.push('');
  }

  const conDrift = combined
    .filter((r) => r.capa1.precio_drift)
    .sort((a, b) => Math.abs(b.capa1.precio_drift.diff_pct) - Math.abs(a.capa1.precio_drift.diff_pct));
  if (conDrift.length > 0) {
    lines.push(`## 💲 Cambio de precio en portal (${conDrift.length})`);
    lines.push('');
    lines.push('| ID | Fuente | Bs guardado | Bs portal hoy | Δ% | Dirección |');
    lines.push('|---:|---|---:|---:|---:|---|');
    for (const r of conDrift) {
      const d = r.capa1.precio_drift;
      lines.push(`| ${r.id} | ${r.fuente} | ${d.viejo.toLocaleString()} | ${d.nuevo.toLocaleString()} | ${d.diff_pct > 0 ? '+' : ''}${d.diff_pct}% | ${d.direccion === 'rebaja' ? '🔻 rebaja' : '🔺 suba'} |`);
    }
    lines.push('');
  }

  if (clustersDup.length > 0) {
    lines.push(`## 🔁 Posibles duplicados (${clustersDup.length} clusters)`);
    lines.push('');
    lines.push('Mismo nombre+precio+área con descripción ≥90% similar (apart-hoteles / re-publicaciones que el pipeline no caza). Sobrevive 1, el resto → `duplicado_de`. **Confirmar por lectura** antes de aplicar.');
    lines.push('');
    lines.push('| Edificio | Bs | Sobrevive | Duplicados | SQL |');
    lines.push('|---|---:|---:|---|---|');
    for (const c of clustersDup) {
      lines.push(`| ${c.nombre_edificio} | ${Math.round(c.precio).toLocaleString()} | ${c.sobreviviente} | ${c.duplicados.join(', ')} | \`UPDATE propiedades_v2 SET duplicado_de=${c.sobreviviente}, fecha_actualizacion=NOW() WHERE id IN (${c.duplicados.join(',')});\` |`);
    }
    lines.push('');
  }

  const muertos = combined.filter((r) => r.capa1.bucket === 'reescrita' && r.capa1.len_scraped === 0);
  if (muertos.length > 0) {
    lines.push(`## ⚰️ Listings muertos (${muertos.length})`);
    lines.push('');
    lines.push('| ID | Fuente | URL |');
    lines.push('|---:|---|---|');
    for (const r of muertos) lines.push(`| ${r.id} | ${r.fuente} | ${r.url} |`);
    lines.push('');
  }

  return lines.join('\n');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    }
  }
  return out;
}

main().catch((err) => {
  console.error('✖ Error fatal:', err);
  process.exit(1);
});
