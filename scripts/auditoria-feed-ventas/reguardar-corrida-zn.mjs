// ============================================================================
// Re-guardar al histórico una corrida del audit mensual que NO persistió
// (la del 30-jun ZN falló por el constraint modo='fetch' pre-mig 267).
// Lee combined.json + meta.json del run dir y hace el INSERT. NO re-scrapea.
//   node reguardar-corrida-zn.mjs <run-dir>          -> DRY-RUN
//   node reguardar-corrida-zn.mjs <run-dir> --apply  -> inserta (service_role)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const runDirArg = process.argv.find(a => a.startsWith('mensual-')) || 'mensual-2026-06-30-22-01-39';
const dir = join(__dirname, 'reports', runDirArg);
const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));
const c = JSON.parse(readFileSync(join(dir, 'combined.json'), 'utf8'));
const items = Array.isArray(c) ? c : Object.values(c).find(v => Array.isArray(v));

const stats = meta.stats;
const total = stats.total, failed = stats.scrape_failed || 0;
console.log(`\n💾 Re-guardar corrida — ${APPLY ? 'APPLY' : 'DRY-RUN'}  ·  ${runDirArg}`);
console.log(`   modo=${meta.modo} · total=${total} · scrape_ok=${total - failed} · failed=${failed} · items=${items.length}`);

if (!APPLY) { console.log(`\n   (DRY-RUN: no se escribió. Correr con --apply.)\n`); process.exit(0); }

const { data: runRow, error: e1 } = await sb.from('audit_descripciones_runs').insert({
  tipo_operacion: 'venta', modo: meta.modo, cached_run_dir: null,
  total_props: total, scrape_ok: total - failed, scrape_failed: failed,
  summary_stats: stats, costo_firecrawl: meta.costoFirecrawl || 0,
}).select('id').single();
if (e1) { console.error(`✖ run: ${e1.message}`); process.exit(1); }
const runId = runRow.id;

const rows = items.map(r => ({
  run_id: runId, tipo_operacion: 'venta', prop_id: r.id, fuente: r.fuente, url: r.url,
  bucket: r.capa1.bucket, similitud_pct: r.capa1.similitud_pct,
  descripcion_bd_snapshot: r.capa1.descripcion_bd, descripcion_scraped: r.capa1.descripcion_scraped,
  title_scraped: r.capa1.title_scraped || null, flags_semanticos: r.capa1.flags_semanticos || {},
  palabras_agregadas: r.capa1.palabras_agregadas || [], palabras_quitadas: r.capa1.palabras_quitadas || [],
  scrape_status: r.capa1.scrape_status, inconsistencias_internas: r.capa2 || [],
  severidad_max: r.severidad_max, matching_check: r.capa3?.check || null, matching_detalle: r.capa3?.detalle || null,
}));
let ins = 0;
for (let i = 0; i < rows.length; i += 100) {
  const { error: e2 } = await sb.from('audit_descripciones_items').insert(rows.slice(i, i + 100));
  if (e2) { console.error(`✖ items chunk ${i}: ${e2.message}`); process.exit(1); }
  ins += rows.slice(i, i + 100).length;
}
console.log(`   ✓ run_id=${runId} · items insertados=${ins}\n`);
