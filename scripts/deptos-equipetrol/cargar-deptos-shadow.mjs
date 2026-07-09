// ============================================================================
// CARGADOR DEPTOS SHADOW — reader-integrado, UNA pasada (sin baseline ni patch)
// ----------------------------------------------------------------------------
// Flujo en 2 fases con el LECTOR en el medio (no se escribe nada malo, ni transitorio):
//
//   1) node cargar-deptos-shadow.mjs --prep [N | --ids a,b,c]
//        Fetchea material ($0): slug + título + descripción + señales estructuradas +
//        candidatos de matching (buscar_proyecto_fuzzy). NO escribe a la BD. Vuelca
//        output/material-<ts>.json con `veredicto: null` por depto.
//
//   2) EL LECTOR (yo hoy / API mañana) lee el material y llena `veredicto` en cada uno
//        siguiendo READER_SPEC.md (precio/TC/dorms/nombre_canónico/gate).
//
//   3) node cargar-deptos-shadow.mjs --apply output/material-<ts>.json
//        Arma la fila CORRECTA de una (estructurado auto + veredicto) y resuelve el
//        match name-first (matcher.mjs). Escribe UN upsert a propiedades_v2_shadow.
//
// 🔒 PROD INTACTO. Solo muta `propiedades_v2_shadow` (service_role). A prod: solo SELECT
//    + RPC read-only (buscar_proyecto_fuzzy). Los alias sugeridos se REGISTRAN, no se
//    escriben a proyectos_master (invariante fase-shadow: cero escritura a prod).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';
import { fetchDetalleDepto } from './lib/detalle-deptos.mjs';
import { matchearPorNombre } from './lib/matcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const SCRAPER_VERSION = 'hibrido-shadow-v3';  // v3 = reader extendido (amenidades/extra/equipamiento/baños/piso/estado/fecha/amoblado/multiproyecto)
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const MODE = argv.includes('--prep') ? 'prep' : argv.includes('--apply') ? 'apply' : null;
const idsArg = (() => { const i = argv.indexOf('--ids'); return i >= 0 ? (argv[i + 1] || '').split(',').map((x) => Number(x.trim())).filter(Boolean) : null; })();
const N = Number(argv.find((a) => /^\d+$/.test(a))) || 4;
const applyFile = MODE === 'apply' ? argv[argv.indexOf('--apply') + 1] : null;

// ---- amenidades canónicas (deriva `lista`; cero drift de vocabulario) ----
const CANON = [
  [/piscina|pool/i, 'Piscina'], [/gimnasio|gym/i, 'Gimnasio'], [/sauna|jacuzzi/i, 'Sauna/Jacuzzi'],
  [/churrasq|parrill|barbacoa|quincho/i, 'Churrasquera'], [/co-?work/i, 'Co-working'],
  [/seguridad|vigilancia|24 ?\/ ?7/i, 'Seguridad 24/7'], [/ascensor|elevador/i, 'Ascensor'],
  [/recepci|lobby/i, 'Recepción'], [/sal[oó]n.*event|eventos/i, 'Salón de Eventos'],
  [/[aá]rea social|social/i, 'Área Social'], [/pet ?friendly|mascota/i, 'Pet Friendly'],
  [/parque infantil|juegos/i, 'Parque Infantil'], [/terraza|balc[oó]n/i, 'Terraza/Balcón'],
  [/estacionamiento.*visita|parqueo.*visita/i, 'Estacionamiento para Visitas'],
  [/lavander|lavado/i, 'Lavandería'], [/c[aá]mara/i, 'Cámaras de seguridad'],
];
const canonizar = (arr) => { const s = new Set(); for (const a of arr || []) for (const [re, k] of CANON) if (re.test(a)) s.add(k); return [...s]; };
const slugDe = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '') : null);
// fecha_publicacion protegida: la más ANTIGUA gana (nunca pisar hacia adelante — anti re-scrape/bump)
const fechaDia = (v) => (v ? String(v).slice(0, 10) : null);
const fechaMin = (a, b) => { const xs = [fechaDia(a), fechaDia(b)].filter(Boolean); return xs.length ? xs.sort()[0] : null; };
// Memoria de rechazados (gate) → no reaparecen en lotes frescos (basura: anticrético/baulera/parqueo/multiproyecto)
const REJ_FILE = join(OUT, 'rechazados.json');
const leerRechazados = () => { try { return new Set(JSON.parse(readFileSync(REJ_FILE, 'utf8'))); } catch { return new Set(); } };

const COLS = 'id,fuente,url,tipo_propiedad_original,estado_construccion,precio_usd,tipo_cambio_detectado,' +
  'moneda_original,area_total_m2,dormitorios,banos,piso,estacionamientos,latitud,longitud,zona,microzona,' +
  'id_proyecto_master,nombre_edificio,fecha_publicacion,score_calidad_dato,es_multiproyecto,duplicado_de,' +
  'baulera,solo_tc_paralelo,datos_json_discovery,datos_json_enrichment';

async function traerLote() {
  let q = sb.from('propiedades_v2').select(COLS)
    .eq('tipo_operacion', 'venta').ilike('tipo_propiedad_original', 'departamento').in('fuente', ['century21', 'remax']);
  if (idsArg) { const { data, error } = await q.in('id', idsArg); if (error) throw error; return data; }
  q = q.in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true)
    .not('datos_json_enrichment->>agente_telefono', 'is', null).order('id', { ascending: false }).limit(600);
  const { data, error } = await q; if (error) throw error;
  // Excluir los ya cargados en shadow → los lotes sucesivos AVANZAN sobre deptos nuevos.
  const { data: yaEn } = await sb.from('propiedades_v2_shadow').select('id');
  const cargados = new Set([...(yaEn || []).map((r) => r.id), ...leerRechazados()]);
  const frescos = data.filter((d) => !cargados.has(d.id));
  // N = TOTAL agnóstico a la fuente (NO N-por-portal): si un portal tiene mucho más inventario
  // que el otro (C21 278 vs Remax 124), el cap simétrico dejaba la fuente grande atrás. Así drena parejo.
  return frescos.slice(0, N);
}

// ===========================================================================
// FASE 1 — PREP: arma el material de lectura (NO escribe a la BD)
// ===========================================================================
async function prep() {
  const lote = await traerLote();
  // Tasa paralelo ACTUAL (Binance) — una sola para TODO el lote → los lectores convierten
  // el BOB con la MISMA tasa (mata la divergencia C21-BOB). Fuente: config_global.
  const { data: tcRow } = await sb.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single();
  const tasaParalelo = tcRow?.valor != null ? Number(tcRow.valor) : null;
  console.log(`\n🔎 PREP — material de lectura para ${lote.length} deptos${idsArg ? ' (--ids)' : ` (hasta ${N} frescos, agnóstico a fuente)`}. tasa_paralelo=${tasaParalelo}. NO escribe a la BD.\n`);
  const entradas = [];
  for (const p of lote) {
    if (circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    try { h = await fetchDetalleDepto(p.fuente, p.url); } catch (e) { err = String(e.message); }
    if (!h) { console.log(`   ${p.id} ${p.fuente} ✗ fetch: ${err || ''}`); await pace(400); continue; }

    const disc = p.datos_json_discovery || {};
    // nombre-guess (solo para traer candidatos de referencia; el lector da el canónico)
    const nombreGuess = p.nombre_edificio || (p.datos_json_enrichment?.llm_output?.nombre_edificio) || null;
    let candidatos = [];
    if (nombreGuess) {
      const { data } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: nombreGuess, p_umbral_minimo: 0.3, p_limite: 5 });
      candidatos = (data || []).map((c) => ({ pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score) }));
    }

    entradas.push({
      id: p.id, fuente: p.fuente, zona: p.zona,
      // --- PARA LEER (READER_SPEC.md) ---
      slug: slugDe(p.url),
      titulo: disc.encabezado || null, subtitulo: disc.subtitulo || null,
      descripcion: h.descripcion || null,
      senales: {
        precio_candidato: h.precio_fuente_usd, precio_bob_portal: h.precio_bob_portal ?? null,
        tasa_paralelo: tasaParalelo,  // ← tasa Binance del lote; para C21-BOB-sin-precio: precio_usd = precio_bob_portal / tasa_paralelo
        tc_portal: h.tc_portal ?? null, moneda: h.moneda,
        recamaras: h.dormitorios, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        area: p.area_total_m2 != null ? Number(p.area_total_m2) : (h.area_const_m2 ?? h.area_texto ?? null),
        n8n: { precio_usd: p.precio_usd != null ? Number(p.precio_usd) : null, tc: p.tipo_cambio_detectado, dorm: p.dormitorios, pm: p.id_proyecto_master, edif: p.nombre_edificio },
      },
      nombre_guess: nombreGuess, match_candidatos: candidatos,
      // --- PARA APLICAR (no hace falta leerlo) ---
      _apply: {
        url: p.url, tipo_propiedad_original: p.tipo_propiedad_original, estado_construccion: p.estado_construccion,
        latitud: p.latitud, longitud: p.longitud, microzona: p.microzona,
        // fecha REAL del anuncio: Remax del extractor (date_of_listing); C21 no la trae en el
        // detalle → viene de la DISCOVERY (fecha_alta). Hoy fallback a prod (=discovery de n8n).
        fecha_publicacion: h.fecha_publicacion ?? (p.datos_json_discovery?.fecha_alta) ?? p.fecha_publicacion,
        score_calidad_dato: p.score_calidad_dato,
        es_multiproyecto: p.es_multiproyecto, duplicado_de: p.duplicado_de, baulera: p.baulera, solo_tc_paralelo: p.solo_tc_paralelo,
        area: p.area_total_m2 != null ? Number(p.area_total_m2) : (h.area_const_m2 ?? h.area_texto ?? null),
        moneda: h.moneda, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        agente: { nombre: h.agente_nombre, telefono: h.agente_telefono, oficina_nombre: h.oficina_nombre },
        fotos_urls: h.fotos_urls || [], cantidad_fotos: h.cantidad_fotos || 0,
        amenities: canonizar(h.amenities), parqueo_incluido: !!h.parqueo_incluido, expensas: h.expensas ?? null,
      },
      // --- EL LECTOR LLENA ESTO (schema READER_SPEC.md) ---
      veredicto: null,
    });
    console.log(`   ${p.id} ${p.fuente}  guess="${nombreGuess || '—'}"  cands:${candidatos.length}  slug:${(slugDe(p.url) || '').slice(0, 42)}`);
    await pace(500);
  }
  const file = join(OUT, `material-${TS}.json`);
  writeFileSync(file, JSON.stringify({ generado: TS, spec: 'READER_SPEC.md', total: entradas.length, entradas }, null, 2));
  console.log(`\n💾 ${file}`);
  console.log(`   → LÉELO y llená "veredicto" en cada depto (READER_SPEC.md), después: node cargar-deptos-shadow.mjs --apply ${file}\n`);
}

// ===========================================================================
// FASE 3 — APPLY: escribe la fila correcta de una + resuelve match name-first
// ===========================================================================
function construirFila(e, v, match) {
  const a = e._apply;
  // AMENIDADES: el LECTOR manda (diferenciadores + extra + equipamiento). Fallback al
  // estructurado (canonizar) SOLO si el lector no trajo lista.
  const usaLector = Array.isArray(v.amenidades) && v.amenidades.length > 0;
  const amenLista = usaLector ? v.amenidades : (a.amenities || []);
  const estado_amenities = {};
  for (const k of amenLista) estado_amenities[k] = { valor: true, fuente: usaLector ? 'lector' : 'structured', confianza: 'alta' };
  // parqueo/baulera: el TEXTO (veredicto) manda sobre el estructurado
  const estac = v.estacionamientos_incluidos ?? a.estacionamientos ?? null;
  const bauleraIncl = v.baulera_incluida ?? a.baulera ?? null;
  const parqueoIncl = (estac != null && estac > 0) ? true : !!a.parqueo_incluido;
  return {
    id: e.id, url: a.url, fuente: e.fuente,
    tipo_operacion: 'venta', tipo_propiedad_original: a.tipo_propiedad_original || 'Departamento',
    estado_construccion: v.estado_construccion || a.estado_construccion,
    // tag "bob" → el crudo (precio_usd) está en BOLIVIANOS; moneda_original lo documenta y la normalización divide vivo.
    precio_usd: v.precio_usd, tipo_cambio_detectado: v.tipo_cambio_detectado,
    moneda_original: v.tipo_cambio_detectado === 'bob' ? 'BOB' : (a.moneda || null),
    area_total_m2: a.area, dormitorios: v.dormitorios,
    banos: v.banos ?? a.banos ?? null,                                          // ← veredicto manda
    piso: v.piso != null ? Number(v.piso)
          : (a.piso != null && /^\d+$/.test(String(a.piso)) ? Number(a.piso) : null),   // ← veredicto manda
    estacionamientos: estac,                                                    // ← veredicto manda
    latitud: a.latitud, longitud: a.longitud, zona: e.zona, microzona: a.microzona,
    id_proyecto_master: match.pm, nombre_edificio: v.nombre_edificio_canonico || null,
    fecha_publicacion: a.fecha_publicacion, score_calidad_dato: a.score_calidad_dato,
    es_multiproyecto: v.es_multiproyecto ?? a.es_multiproyecto ?? false,        // ← taguea multiproyecto (no rechaza)
    duplicado_de: a.duplicado_de ?? null,
    baulera: bauleraIncl, solo_tc_paralelo: a.solo_tc_paralelo ?? null, parqueo_incluido: parqueoIncl,
    status: 'completado', es_activa: true, es_para_matching: true, scraper_version: SCRAPER_VERSION,
    datos_json: {
      agente: a.agente,
      contenido: { fotos_urls: a.fotos_urls, descripcion: e.descripcion || '', cantidad_fotos: a.cantidad_fotos },
      // amenities: lista (diferenciadores) + estado + extra (no-canónicas) + equipamiento (canónico + otros)
      amenities: {
        lista: amenLista, estado_amenities, extra: v.amenidades_extra || [],
        equipamiento: v.equipamiento_canonico || v.equipamiento_unidad || [],   // canónico filtrable (fallback al viejo)
        equipamiento_otros: v.equipamiento_otros || [],                          // cola larga (mostrar, no filtrar)
      },
      parqueo_incluido: parqueoIncl, parqueo_precio_adicional: v.parqueo_precio_adicional_usd ?? null,
      baulera_incluido: bauleraIncl, baulera_precio_adicional: v.baulera_precio_adicional_usd ?? null,
      fecha_entrega: v.fecha_entrega_estimada ?? null,
      amoblado: v.amoblado ?? null, equipado: v.equipado ?? null,   // ← flags de decisión
      expensas: a.expensas,
      trazabilidad: { scraper_version: SCRAPER_VERSION, fuente_precio: 'lector', fuente_amenidades: usaLector ? 'lector' : 'structured', metodo_match: match.metodo },
    },
  };
}

async function apply(file) {
  const doc = JSON.parse(readFileSync(file, 'utf-8'));
  const conVer = doc.entradas.filter((e) => e.veredicto);
  const sinVer = doc.entradas.filter((e) => !e.veredicto);
  console.log(`\n✍️  APPLY — ${conVer.length}/${doc.entradas.length} con veredicto${sinVer.length ? ` (faltan ${sinVer.length}: ${sinVer.map((e) => e.id).join(',')})` : ''}\n`);

  const filas = [], rechazados = [], aliasSugeridos = [], reporte = [];
  for (const e of conVer) {
    const v = e.veredicto;
    if (v.gate === 'rechazar') { rechazados.push({ id: e.id, razon: v.razon_gate }); continue; }

    // MATCH name-first (matcher.mjs). El lector puede fijar pm a mano (id_proyecto_master).
    let match = { pm: null, metodo: 'sin_nombre', motivo: '', auto: false };
    if (v.id_proyecto_master != null) {
      match = { pm: v.id_proyecto_master, metodo: 'lector_fijo', motivo: 'pm fijado por el lector', auto: true };
    } else if (v.nombre_edificio_canonico) {
      match = await matchearPorNombre(sb, { nombre: v.nombre_edificio_canonico, zona: e.zona, lat: e._apply.latitud, lon: e._apply.longitud });
      if (!match.auto) match.pm = null; // ambiguo/débil → sin match (lo levanta el audit); no forzar
    }
    if (v.alias_sugerido && match.pm) aliasSugeridos.push({ pm: match.pm, alias: v.alias_sugerido, edif: v.nombre_edificio_canonico });

    filas.push(construirFila(e, v, match));
    reporte.push({ id: e.id, precio: v.precio_usd, tc: v.tipo_cambio_detectado, dorm: v.dormitorios, edif: v.nombre_edificio_canonico, pm: match.pm, match: match.metodo, motivo: match.motivo });
  }

  // Proteger fecha_publicacion: LEAST(existente en shadow, nueva) → nunca la pisa hacia adelante
  // (anti re-scrape y anti-bump del broker). El híbrido la canda, no confía en que nadie la toque.
  let protegidas = 0;
  if (filas.length) {
    const { data: prev } = await sb.from('propiedades_v2_shadow').select('id,fecha_publicacion').in('id', filas.map((f) => f.id));
    const prevById = new Map((prev || []).map((r) => [r.id, r.fecha_publicacion]));
    for (const f of filas) {
      const ex = prevById.get(f.id);
      const min = fechaMin(ex, f.fecha_publicacion);
      if (ex && min !== fechaDia(f.fecha_publicacion)) protegidas++;
      f.fecha_publicacion = min;
    }
  }
  if (filas.length) {
    const { error } = await sb.from('propiedades_v2_shadow').upsert(filas, { onConflict: 'id' });
    if (error) { console.error(`❌ upsert shadow:`, error.message); process.exit(1); }
  }
  if (rechazados.length) { const prev = leerRechazados(); for (const r of rechazados) prev.add(r.id); writeFileSync(REJ_FILE, JSON.stringify([...prev])); }
  console.log(`✅ ${filas.length} escritos en propiedades_v2_shadow.  Rechazados (gate): ${rechazados.length}${rechazados.length ? ' → ' + rechazados.map((r) => `${r.id}(${r.razon})`).join(', ') : ''}${protegidas ? `  ·  fecha_publicacion protegida (LEAST) en ${protegidas}` : ''}\n`);
  for (const r of reporte) console.log(`   ${r.id}  $${r.precio} ${r.tc}  ${r.dorm}d  edif="${r.edif || '—'}" → pm ${r.pm ?? '—'} [${r.match}]${r.motivo ? '  ·  ' + r.motivo : ''}`);
  if (aliasSugeridos.length) {
    console.log(`\n🏷️  Alias sugeridos (NO se escriben a prod en fase shadow — registrados para el cutover/audit):`);
    for (const a of aliasSugeridos) console.log(`   pm ${a.pm} (${a.edif}) ← alias "${a.alias}"`);
  }
  const sinMatch = reporte.filter((r) => r.pm == null && r.edif);
  if (sinMatch.length) console.log(`\n⚠️  Con nombre pero sin auto-match (revisar o al audit): ${sinMatch.map((r) => `${r.id}(${r.edif})`).join(', ')}`);
}

// ---------------------------------------------------------------------------
if (MODE === 'prep') await prep();
else if (MODE === 'apply') { if (!applyFile) { console.error('Falta la ruta: --apply <material.json>'); process.exit(1); } await apply(applyFile); }
else console.error('Uso: --prep [N | --ids a,b,c]   |   --apply <output/material-*.json>');
