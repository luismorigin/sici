import { config as loadEnv } from 'dotenv';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { getSupabaseClient } from './lib/db.mjs';
import { checkMatching } from './lib/matching-checks.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const args = parseArgs(process.argv.slice(2));
const FIRECRAWL_RUN_DIR = args['firecrawl-run']
  ? resolve(__dirname, 'reports', args['firecrawl-run'])
  : null;

async function main() {
  console.log('▶ Audit matching (capa 3) — verificación de nombre_edificio en slug/title/desc');
  if (FIRECRAWL_RUN_DIR) {
    console.log(`  Usando titles scrapeados de: ${FIRECRAWL_RUN_DIR}`);
  } else {
    console.log(`  Sin firecrawl run — solo se usa slug + descripción guardada`);
  }

  const supabase = getSupabaseClient();

  const { data: props, error } = await supabase
    .from('propiedades_v2')
    .select('id, fuente, url, nombre_edificio, id_proyecto_master, status, datos_json')
    .eq('status', 'completado')
    .eq('tipo_operacion', 'venta');
  if (error) throw error;

  console.log(`  ${props.length} props cargadas`);

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
  console.log(`  ${proyectosById.size} proyectos master cargados`);

  const titlesByPropId = loadTitlesFromFirecrawlRun(FIRECRAWL_RUN_DIR);

  const results = [];
  for (const p of props) {
    const pm = p.id_proyecto_master ? proyectosById.get(p.id_proyecto_master) : null;
    const aliases = collectAliases(p, pm);
    const enriched = {
      id: p.id,
      url: p.url,
      nombre_edificio: p.nombre_edificio,
      aliases,
      contenido_desc: p.datos_json?.contenido?.descripcion || '',
    };
    const scraped = {
      title_scraped: titlesByPropId.get(p.id) || '',
    };
    const result = checkMatching(enriched, scraped);
    if (result.check !== 'ok') {
      results.push({
        id: p.id,
        fuente: p.fuente,
        url: p.url,
        nombre_edificio_bd: p.nombre_edificio,
        id_proyecto_master: p.id_proyecto_master,
        ...result,
      });
    }
  }

  results.sort((a, b) => {
    const sevOrder = { alta: 0, media: 1, baja: 2 };
    return (sevOrder[a.severidad] ?? 9) - (sevOrder[b.severidad] ?? 9);
  });

  const runDir = resolve(
    __dirname,
    'reports',
    'matching-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  );
  await mkdir(runDir, { recursive: true });
  await writeFile(join(runDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');

  const md = renderReport(results, props.length);
  await writeFile(join(runDir, 'summary.md'), md, 'utf8');

  console.log('\n=== Resumen ===');
  console.log(`  Total props auditadas: ${props.length}`);
  console.log(`  Con issues de matching: ${results.length}`);
  const porTipo = {};
  for (const r of results) porTipo[r.check] = (porTipo[r.check] || 0) + 1;
  for (const [t, n] of Object.entries(porTipo)) console.log(`  ${t}: ${n}`);
  console.log(`✔ Reporte: ${join(runDir, 'summary.md')}`);
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

function loadTitlesFromFirecrawlRun(runDir) {
  const map = new Map();
  if (!runDir || !existsSync(runDir)) return map;
  const rawDir = join(runDir, 'raw');
  if (!existsSync(rawDir)) return map;
  for (const file of readdirSync(rawDir)) {
    try {
      const data = JSON.parse(readFileSync(join(rawDir, file), 'utf8'));
      if (data.id && data.title_scraped) {
        map.set(data.id, data.title_scraped);
      }
    } catch {}
  }
  return map;
}

function renderReport(results, totalProps) {
  const lines = [];
  lines.push(`# Audit matching — ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`**Props auditadas:** ${totalProps}`);
  lines.push(`**Con issues:** ${results.length} (${((results.length / totalProps) * 100).toFixed(1)}%)`);
  lines.push('');

  const porTipo = {};
  for (const r of results) porTipo[r.check] = (porTipo[r.check] || 0) + 1;
  lines.push('## Por tipo de check');
  lines.push('');
  for (const [t, n] of Object.entries(porTipo).sort((a, b) => b[1] - a[1])) {
    lines.push(`- **${t}**: ${n}`);
  }
  lines.push('');

  for (const sev of ['alta', 'media']) {
    const filtered = results.filter((r) => r.severidad === sev);
    if (filtered.length === 0) continue;
    lines.push(`## ${sev === 'alta' ? '🔴' : '🟡'} Severidad ${sev} (${filtered.length})`);
    lines.push('');
    lines.push('| ID | Fuente | nombre_edificio BD | Check | Mensaje |');
    lines.push('|---:|---|---|---|---|');
    for (const r of filtered) {
      lines.push(
        `| ${r.id} | ${r.fuente} | ${r.nombre_edificio_bd || '-'} | ${r.check} | ${r.msg} |`
      );
    }
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
  console.error('✖ Error:', err);
  process.exit(1);
});
