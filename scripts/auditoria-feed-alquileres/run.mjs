// Audit standalone solo capa 1 (drift fetcher curl).
// Útil para smoke tests rápidos antes de la corrida mensual completa.

import { config as loadEnv } from 'dotenv';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

import { getSupabaseClient, getPropsViejasFromFeed } from './lib/db.mjs';
import { fetchBatch } from './lib/fetcher.mjs';
import { extraerDescripcion, extraerTitle } from './lib/extractor.mjs';
import { compararDescripciones } from './lib/similarity.mjs';
import { generarReporte } from './lib/reporter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const args = parseArgs(process.argv.slice(2));
const LIMIT = args.limit ? parseInt(args.limit, 10) : 50;
const OFFSET = args.offset ? parseInt(args.offset, 10) : 0;
const CONCURRENCY = args.concurrency ? parseInt(args.concurrency, 10) : 6;

async function main() {
  console.log(`▶ Auditoría descripciones alquiler — limit=${LIMIT}, offset=${OFFSET}, concurrency=${CONCURRENCY}`);
  console.log(`  env: ${ENV_PATH || '(ninguno encontrado)'}`);

  const supabase = getSupabaseClient();
  const excludeIds = args['exclude-from-runs']
    ? loadIdsFromRuns(args['exclude-from-runs'].split(','))
    : [];
  const onlyIds = args['only-ids']
    ? args['only-ids'].split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean)
    : [];
  console.log(
    onlyIds.length > 0
      ? `▶ Re-scrapeando ${onlyIds.length} IDs específicos: ${onlyIds.slice(0, 5).join(',')}${onlyIds.length > 5 ? ',...' : ''}`
      : `▶ Buscando ${LIMIT} props más viejas en v_mercado_alquiler` +
          (excludeIds.length ? ` (excluyendo ${excludeIds.length} IDs)` : '') +
          (OFFSET ? `, offset=${OFFSET}` : '') +
          '...'
  );
  const props = await getPropsViejasFromFeed(supabase, LIMIT, OFFSET, excludeIds, onlyIds);
  console.log(`  ${props.length} props traídas. Ejemplo:`, {
    id: props[0]?.id,
    fuente: props[0]?.fuente,
    dias: props[0]?.dias_en_mercado,
    len_desc_bd: (props[0]?.descripcion_bd || '').length,
  });

  const runDir = resolve(
    __dirname,
    'reports',
    new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  );

  console.log(`▶ Fetcheando con curl directo (concurrencia ${CONCURRENCY})...`);
  let lastPct = -1;
  const fetched = await fetchBatch(props, {
    concurrency: CONCURRENCY,
    onProgress: (done, total) => {
      const pct = Math.floor((done / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        console.log(`  ${done}/${total} (${pct}%)`);
        lastPct = pct;
      }
    },
  });

  const okCount = fetched.filter((s) => s.ok).length;
  console.log(`  Fetch OK: ${okCount}/${fetched.length}`);

  console.log(`▶ Extrayendo descripciones y comparando...`);
  const resultados = fetched.map((s) => {
    if (!s.ok) {
      return {
        id: s.id,
        fuente: s.fuente,
        url: s.url,
        dias_en_mercado: s.dias_en_mercado,
        zona: s.zona,
        scraped_at: new Date().toISOString(),
        scrape_status: 'failed',
        error: s.error,
        descripcion_bd: s.descripcion_bd || '',
        descripcion_scraped: '',
        similitud_pct: 0,
        len_bd: (s.descripcion_bd || '').length,
        len_scraped: 0,
        palabras_agregadas: [],
        palabras_quitadas: [],
        flags_semanticos: {},
        bucket: 'identicas',
        tiene_flag_semantico: false,
      };
    }
    const descScraped = extraerDescripcion(s.html, s.fuente);
    const titleScraped = extraerTitle(s.html, s.fuente);
    const cmp = compararDescripciones(s.descripcion_bd || '', descScraped);
    return {
      id: s.id,
      fuente: s.fuente,
      url: s.url,
      dias_en_mercado: s.dias_en_mercado,
      zona: s.zona,
      scraped_at: new Date().toISOString(),
      scrape_status: 'ok',
      descripcion_bd: s.descripcion_bd || '',
      descripcion_scraped: descScraped,
      title_scraped: titleScraped,
      ...cmp,
    };
  });

  console.log(`▶ Generando reporte en ${runDir}...`);
  await generarReporte(resultados, runDir);

  printResumen(resultados);
  console.log(`✔ Listo. Abrí ${join(runDir, 'summary.md')}`);
}

function printResumen(rs) {
  const ok = rs.filter((r) => r.scrape_status === 'ok');
  const buckets = { reescrita: 0, cambio_relevante: 0, cambio_menor: 0, identicas: 0 };
  let conFlags = 0;
  let sinCruda = 0;
  for (const r of ok) {
    buckets[r.bucket]++;
    if (r.tiene_flag_semantico) conFlags++;
    if (r.len_bd === 0) sinCruda++;
  }
  console.log('\n=== Resumen ===');
  console.log(`  🔴 Reescrita (<70%):       ${buckets.reescrita}`);
  console.log(`  🟡 Cambio relevante 70-90%: ${buckets.cambio_relevante}`);
  console.log(`  🟢 Cambio menor 90-99%:    ${buckets.cambio_menor}`);
  console.log(`  ⚪ Idénticas (>=99%):       ${buckets.identicas}`);
  console.log(`  🚨 Con flags semánticos:    ${conFlags}`);
  console.log(`  ⚠ Sin cruda en BD:          ${sinCruda}`);
  console.log(`  ❌ Fetch fallidos:          ${rs.length - ok.length}`);
}

function loadIdsFromRuns(runDirs) {
  const reportsRoot = resolve(__dirname, 'reports');
  const ids = new Set();
  for (const dir of runDirs) {
    const path = dir.includes('reports') ? dir : join(reportsRoot, dir.trim());
    const file = join(path, 'results.json');
    if (!existsSync(file)) {
      console.warn(`  (warn) no existe ${file}, salteo`);
      continue;
    }
    const arr = JSON.parse(readFileSync(file, 'utf8'));
    for (const r of arr) ids.add(r.id);
  }
  return [...ids];
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
