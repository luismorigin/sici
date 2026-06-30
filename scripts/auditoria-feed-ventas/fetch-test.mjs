// PRUEBA — fetcher directo ($0) vs Firecrawl para el feed de ventas.
// Toma una muestra del feed, trae la descripción con el fetcher del híbrido ZN
// (C21 ?json=true / Remax data-page) y la compara contra la cruda guardada en BD.
// 100% read-only, NO usa Firecrawl, NO escribe nada. Decide si vale migrar el
// audit mensual a $0. Ver fetch-test.command.md.
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

import { getSupabaseClient, getPropsViejasFromFeed } from './lib/db.mjs';
import { compararDescripciones } from './lib/similarity.mjs';
import { c21Detalle, remaxDetalle } from '../sonda-suelo/lib/portales.mjs';
import { pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_CANDIDATES = [
  resolve(__dirname, '../../simon-mvp/.env.local'),
  resolve(__dirname, '../../../sici/simon-mvp/.env.local'),
  process.env.ENV_FILE,
].filter(Boolean);
const ENV_PATH = ENV_CANDIDATES.find((p) => existsSync(p));
if (ENV_PATH) loadEnv({ path: ENV_PATH });

const args = parseArgs(process.argv.slice(2));
const N = args.n ? parseInt(args.n, 10) : 20;
const FUENTE = (args.fuente || 'ambos').toLowerCase();
const MACROZONA = (args.macrozona || 'equipetrol').toLowerCase();

const EQ_ZONAS = [
  'Equipetrol Centro', 'Equipetrol Norte', 'Sirari',
  'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo',
];
const ZONA_FILTER = (() => {
  if (MACROZONA === 'equipetrol') return { modo: 'in', zonas: EQ_ZONAS, label: 'Equipetrol' };
  if (['zona-norte', 'zonanorte', 'zn'].includes(MACROZONA)) return { modo: 'notin', zonas: EQ_ZONAS, label: 'Zona Norte' };
  if (MACROZONA === 'todas') return { modo: 'none', zonas: [], label: 'todas' };
  console.error(`✖ --macrozona desconocida: "${MACROZONA}". Usá: equipetrol | zona-norte | todas`);
  process.exit(1);
})();

const esC21 = (f) => /c21|century/i.test(f || '');
const esRemax = (f) => /remax/i.test(f || '');

async function main() {
  console.log('▶ PRUEBA fetcher directo ($0) vs BD — feed ventas');
  console.log(`  Macrozona: ${ZONA_FILTER.label} | fuente: ${FUENTE} | muestra: ${N}`);
  console.log(`  (NO usa Firecrawl, NO escribe nada)\n`);

  const supabase = getSupabaseClient();
  const pool = await getPropsViejasFromFeed(supabase, 300, 0, [], [], ZONA_FILTER);

  // Armar muestra balanceada por fuente (salvo que se pida una sola)
  let muestra;
  if (FUENTE === 'c21' || FUENTE === 'century21') muestra = pool.filter((p) => esC21(p.fuente)).slice(0, N);
  else if (FUENTE === 'remax') muestra = pool.filter((p) => esRemax(p.fuente)).slice(0, N);
  else {
    const c21 = pool.filter((p) => esC21(p.fuente)).slice(0, Math.ceil(N / 2));
    const rmx = pool.filter((p) => esRemax(p.fuente)).slice(0, Math.floor(N / 2));
    muestra = [...c21, ...rmx];
  }

  if (muestra.length === 0) {
    console.error('✖ No hay props en el pool para esa combinación de filtros.');
    process.exit(1);
  }

  const out = [];
  for (const p of muestra) {
    if (circuit.tripped) {
      console.warn('  🛑 Circuit breaker disparado — IP probablemente bloqueada. Corte temprano.');
      break;
    }
    let det = null;
    try {
      if (esC21(p.fuente)) det = await c21Detalle(p.url);
      else if (esRemax(p.fuente)) det = await remaxDetalle(p.url);
    } catch {
      det = null;
    }
    const descFetch = (det?.descripcion || '').trim();
    const ok = descFetch.length > 0;
    const cmp = compararDescripciones(p.descripcion_bd || '', descFetch);
    out.push({
      id: p.id,
      fuente: esC21(p.fuente) ? 'c21' : esRemax(p.fuente) ? 'remax' : p.fuente,
      ok,
      len_bd: (p.descripcion_bd || '').length,
      len_fetch: descFetch.length,
      sim: cmp.similitud_pct,
    });
    await pace(800); // amable con el portal + jitter (anti-bloqueo)
  }

  render(out);
}

function render(out) {
  console.log('\n=== Resultado por prop ===');
  console.log('id\tfuente\tok\tlen_bd\tlen_fetch\tsim%');
  for (const r of out) {
    console.log(`${r.id}\t${r.fuente}\t${r.ok ? '✓' : '✗'}\t${r.len_bd}\t${r.len_fetch}\t${r.sim}`);
  }

  const byFuente = {};
  for (const r of out) {
    const f = (byFuente[r.fuente] ??= { total: 0, ok: 0, simSum: 0, simN: 0 });
    f.total++;
    if (r.ok) f.ok++;
    if (r.ok) { f.simSum += r.sim; f.simN++; }
  }

  console.log('\n=== Resumen por fuente ===');
  console.log('fuente\ttotal\téxito\t%éxito\tsim_prom (de los ok)');
  for (const [f, s] of Object.entries(byFuente)) {
    const pct = Math.round((s.ok / s.total) * 100);
    const simProm = s.simN ? Math.round((s.simSum / s.simN) * 10) / 10 : 0;
    console.log(`${f}\t${s.total}\t${s.ok}\t${pct}%\t${simProm}%`);
  }

  const totalOk = out.filter((r) => r.ok).length;
  const pctTotal = Math.round((totalOk / out.length) * 100);
  console.log('\n=== Veredicto ===');
  console.log(`  Éxito global: ${totalOk}/${out.length} (${pctTotal}%) — costo: $0 (sin Firecrawl)`);
  if (pctTotal >= 90) console.log('  ✅ El fetcher directo recupera bien las descripciones de ventas. Vale migrar el audit mensual a $0.');
  else if (pctTotal >= 70) console.log('  🟡 Recupera la mayoría pero hay fallos — revisar los ✗ (¿bloqueo? ¿URLs raras?) antes de migrar.');
  else console.log('  🔴 Tasa de éxito baja — NO migrar todavía. Revisar qué falla (¿anti-bot? ¿formato cambió?).');
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    }
  }
  return out;
}

main().catch((err) => {
  console.error('✖ Error fatal:', err);
  process.exit(1);
});
