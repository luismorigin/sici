// ============================================================================
// Alinear descripciones ZN con el portal — usa las descs ya fetcheadas por el audit mensual.
// Actualiza SOLO datos_json_enrichment->'descripcion' (jsonb_set, no toca otras keys).
// Selecciona: scrape ok + (texto cambió [bucket != identicas] O hubo precio_drift).
//   node alinear-descripciones-zn.mjs           -> DRY-RUN (lista, no escribe)
//   node alinear-descripciones-zn.mjs --apply    -> escribe (service_role)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const APPLY = process.argv.includes('--apply');

// último reporte mensual
const REP = join(__dirname, 'reports');
const runDir = readdirSync(REP).filter(x => x.startsWith('mensual-')).sort().pop();
const c = JSON.parse(readFileSync(join(REP, runDir, 'combined.json'), 'utf8'));
const arr = Array.isArray(c) ? c : Object.values(c).find(v => Array.isArray(v));

const sel = arr.filter(r => {
  const c1 = r.capa1 || {};
  if (c1.scrape_status !== 'ok') return false;
  const textoCambio = c1.bucket && c1.bucket !== 'identicas';
  const precioDrift = c1.precio_drift && c1.precio_drift.nuevo;
  const nueva = c1.descripcion_scraped, vieja = c1.descripcion_bd;
  return (textoCambio || precioDrift) && nueva && nueva.trim() && nueva.trim() !== (vieja || '').trim();
});

console.log(`\n📝 Alinear descripciones ZN — ${APPLY ? 'APPLY' : 'DRY-RUN'}  ·  reporte: ${runDir}`);
console.log(`   candidatas: ${sel.length}\n`);
for (const r of sel) {
  const c1 = r.capa1;
  const pd = c1.precio_drift ? ` · precio ${c1.precio_drift.viejo}→${c1.precio_drift.nuevo}` : '';
  console.log(`  ${r.id} (${r.fuente}) ${c1.bucket} sim=${c1.similitud_pct}%${pd}  ${c1.len_bd}→${c1.len_scraped} chars`);
}

if (!APPLY) { console.log(`\n  (DRY-RUN: no se escribió. Correr con --apply.)\n`); process.exit(0); }

console.log(`\n  Escribiendo (jsonb_set descripcion)…`);
let ok = 0, err = 0;
for (const r of sel) {
  // traer el enrichment actual y setear solo la key 'descripcion'
  const { data: row, error: e1 } = await sb.from('propiedades_v2').select('datos_json_enrichment').eq('id', r.id).single();
  if (e1) { console.error(`   ✖ ${r.id}: ${e1.message}`); err++; continue; }
  const enr = { ...(row.datos_json_enrichment || {}), descripcion: r.capa1.descripcion_scraped };
  const { error: e2 } = await sb.from('propiedades_v2').update({ datos_json_enrichment: enr }).eq('id', r.id);
  if (e2) { console.error(`   ✖ ${r.id}: ${e2.message}`); err++; } else ok++;
}
console.log(`   actualizadas: ${ok} · errores: ${err}\n`);
