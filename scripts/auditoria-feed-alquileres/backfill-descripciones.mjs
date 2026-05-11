// Backfill de descripcion cruda para props alquiler completadas pre-9-may-2026.
//
// Hasta el 9-may, el workflow Enrichment LLM Alquiler v2.0 NO persistía la
// descripción cruda del agente. Solo guardaba `descripcion_limpia` (resumen LLM).
// Desde el v2.1.0 (9-may) ya se persiste en `datos_json_enrichment.descripcion`.
//
// Este script trae la cruda HOY desde cada portal con curl directo, usando
// los MISMOS extractores que el workflow productivo, y la persiste en BD.
// Costo: $0 (sin Firecrawl). Sin LLM. Sin tocar otras keys del JSON.
//
// Uso:
//   node backfill-descripciones.mjs --dry-run                → solo reporta, no escribe
//   node backfill-descripciones.mjs                          → escribe a BD
//   node backfill-descripciones.mjs --limit 10               → solo N props (test)
//   node backfill-descripciones.mjs --only-ids 1438,1546,... → solo esos IDs (reintento)

import { config as loadEnv } from 'dotenv';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';

import {
  getSupabaseClient,
  getPropsAlquilerSinCruda,
  persistirDescripcionCruda,
} from './lib/db.mjs';
import { fetchBatch } from './lib/fetcher.mjs';
import { extraerDescripcion } from './lib/extractor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const args = parseArgs(process.argv.slice(2));
const DRY_RUN = !!args['dry-run'];
const LIMIT = args.limit ? parseInt(args.limit, 10) : null;
const ONLY_IDS = args['only-ids']
  ? args['only-ids'].split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean)
  : null;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 6;

async function main() {
  const tStart = Date.now();
  console.log(`▶ Backfill descripción cruda alquiler — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`  env: ${ENV_PATH || '(ninguno encontrado)'}`);
  console.log(`  concurrency: ${CONCURRENCY}${LIMIT ? `, limit: ${LIMIT}` : ''}`);

  const supabase = getSupabaseClient();
  let props = await getPropsAlquilerSinCruda(supabase);
  console.log(`\n  ${props.length} props del feed alquiler sin cruda en BD`);

  if (ONLY_IDS) {
    const set = new Set(ONLY_IDS);
    props = props.filter((p) => set.has(p.id));
    console.log(`  Filtro --only-ids: ${props.length}/${ONLY_IDS.length} matchearon en sin-cruda`);
    const missing = ONLY_IDS.filter((id) => !props.find((p) => p.id === id));
    if (missing.length > 0) {
      console.log(`  ⚠ IDs no encontrados en sin-cruda: ${missing.join(',')}`);
    }
  }
  if (LIMIT) props = props.slice(0, LIMIT);

  const porFuente = {};
  for (const p of props) porFuente[p.fuente] = (porFuente[p.fuente] || 0) + 1;
  console.log(`  Por fuente: ${JSON.stringify(porFuente)}`);

  // Filtrar las que no tienen URL — no podemos backfilliar sin URL
  const conUrl = props.filter((p) => p.url);
  const sinUrl = props.length - conUrl.length;
  if (sinUrl > 0) console.log(`  ⚠ ${sinUrl} props sin URL — se saltean`);

  console.log(`\n▶ Fetcheando ${conUrl.length} URLs...`);
  let lastPct = -1;
  const fetched = await fetchBatch(conUrl, {
    concurrency: CONCURRENCY,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        console.log(`  ${done}/${total} (${pct}%)`);
        lastPct = pct;
      }
    },
  });

  // Extraer y clasificar
  const results = [];
  let okFetch = 0;
  let okExtract = 0;
  let crudaVacia = 0;
  for (const f of fetched) {
    if (!f.ok) {
      results.push({ id: f.id, fuente: f.fuente, url: f.url, status: 'fetch_failed', error: f.error });
      continue;
    }
    okFetch++;
    const cruda = extraerDescripcion(f.html, f.fuente);
    if (!cruda) {
      crudaVacia++;
      results.push({ id: f.id, fuente: f.fuente, url: f.url, status: 'cruda_vacia', len: 0 });
    } else {
      okExtract++;
      results.push({ id: f.id, fuente: f.fuente, url: f.url, status: 'ready', len: cruda.length, cruda });
    }
  }

  console.log(`\n=== Extracción ===`);
  console.log(`  Fetch OK: ${okFetch}/${fetched.length}`);
  console.log(`  Cruda extraída OK: ${okExtract}`);
  console.log(`  Cruda vacía (extractor no encontró): ${crudaVacia}`);
  console.log(`  Fetch fallidos: ${fetched.length - okFetch}`);

  // Distribución de longitud
  const lens = results.filter((r) => r.status === 'ready').map((r) => r.len);
  if (lens.length > 0) {
    lens.sort((a, b) => a - b);
    const min = lens[0];
    const max = lens[lens.length - 1];
    const med = lens[Math.floor(lens.length / 2)];
    const avg = Math.round(lens.reduce((s, n) => s + n, 0) / lens.length);
    console.log(`  Longitud cruda: min=${min}, mediana=${med}, avg=${avg}, max=${max}`);
  }

  // Por fuente
  const statByFuente = {};
  for (const r of results) {
    statByFuente[r.fuente] ||= { ready: 0, vacia: 0, fail: 0 };
    if (r.status === 'ready') statByFuente[r.fuente].ready++;
    else if (r.status === 'cruda_vacia') statByFuente[r.fuente].vacia++;
    else statByFuente[r.fuente].fail++;
  }
  console.log(`  Por fuente:`);
  for (const [f, s] of Object.entries(statByFuente)) {
    console.log(`    ${f}: ${s.ready} ready, ${s.vacia} cruda vacía, ${s.fail} fetch fail`);
  }

  // Persistir reporte
  const runDir = resolve(
    __dirname,
    'reports',
    'backfill-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  );
  await mkdir(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'results.json'),
    JSON.stringify(results, null, 2),
    'utf8'
  );
  console.log(`\n  Reporte: ${runDir}/results.json`);

  // Aplicar updates
  if (DRY_RUN) {
    console.log(`\n✋ DRY RUN — no se aplicó ningún UPDATE.`);
    console.log(`   Para aplicar: re-correr SIN --dry-run.`);
    console.log(`   Cambios pendientes: ${okExtract} props recibirían descripcion cruda.`);
  } else {
    console.log(`\n▶ Aplicando UPDATES a BD...`);
    let okWrite = 0;
    let failWrite = 0;
    let i = 0;
    for (const r of results) {
      if (r.status !== 'ready') continue;
      const out = await persistirDescripcionCruda(supabase, r.id, r.cruda);
      i++;
      if (out.ok) okWrite++;
      else {
        failWrite++;
        console.warn(`  ✖ #${r.id}: ${out.error}`);
      }
      if (i % 25 === 0) console.log(`  ${i} updates ejecutados...`);
    }
    console.log(`\n=== UPDATE ===`);
    console.log(`  ✔ OK: ${okWrite}`);
    console.log(`  ✖ Failed: ${failWrite}`);
  }

  console.log(`\n  Duración total: ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
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
