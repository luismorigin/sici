#!/usr/bin/env node
// ============================================================================
// REFRESCAR EL TEXTO GUARDADO DE LOS AVISOS QUE CORRIGIÓ EL DRIFT
// ----------------------------------------------------------------------------
// EL PROBLEMA (29-sep-2026): el audit de drift corrige el PRECIO leyendo el aviso
// recién traído del portal, pero `datos_json.contenido.descripcion` queda con el
// texto de la CAPTURA — viejo. Después `/audit-cola-shadow`, que NO sale al portal
// por diseño, lee ese texto viejo y propone DESHACER la corrección, con evidencia
// que parece sólida (cita el precio anterior).
// Pasó el 29-sep con la prop 3678: el audit pidió volverla a bolivianos citando
// "Bs. 1.100.000" mientras el portal ya decía "$us 79.000".
// 🔑 El procedimiento de /audit-deptos-shadow ya lo pedía ("refrescar la descripción
// con la de hoy, para que no reaparezca en cada corrida") y se pasó por alto.
//
// READ-ONLY sobre la base: emite SQL en bloques, lo aplica el humano.
// Uso: node refrescar-texto-corregidos.mjs "audit_drift_zn_2026-09-28"
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { fetchDetalleDepto } from './lib/detalle-deptos.mjs';
import { pace, trafico } from '../sonda-suelo/lib/fetcher.mjs';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MARCA = process.argv[2] || 'audit_drift_zn_2026-09-28';
const HOY = new Date().toISOString().slice(0, 10);
const POR_BLOQUE = 15;   // la UI de Supabase se corta con archivos grandes (medido el 28-sep)

const { data, error } = await sb.from('propiedades_v2')
  .select('id, url, fuente, nombre_edificio, guardado:datos_json->contenido->>descripcion')
  .eq('datos_json->trazabilidad->>drift_corregido_por', MARCA);
if (error) { console.error(error.message); process.exit(1); }
console.log(`🔄 REFRESCAR TEXTO — ${data.length} props corregidas por "${MARCA}"\n`);

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();
const cambiaron = [], iguales = [], fallaron = [];
for (const p of data) {
  let h = null;
  try { h = await fetchDetalleDepto(p.fuente, p.url); } catch { h = null; }
  if (!h?.descripcion) { fallaron.push(p.id); console.log(`   ${p.id} ✗ sin respuesta`); await pace(500); continue; }
  if (norm(h.descripcion) === norm(p.guardado)) { iguales.push(p.id); }
  else { cambiaron.push({ ...p, nuevo: h.descripcion }); console.log(`   ${p.id} 🔄 el texto cambió (${norm(p.guardado).length} → ${norm(h.descripcion).length} chars)`); }
  await pace(500);
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
let n = 0;
for (let i = 0; i < cambiaron.length; i += POR_BLOQUE) {
  n++;
  const parte = cambiaron.slice(i, i + POR_BLOQUE);
  const L = [`-- Refresco del texto guardado — parte ${n} (${parte.length} avisos) — ${HOY}`,
    `-- Corregidos por "${MARCA}". Sin esto, /audit-cola-shadow lee el texto VIEJO y propone deshacer la corrección.`, ''];
  for (const p of parte) {
    L.push(`-- ${p.id} · ${p.nombre_edificio || '—'}`);
    L.push(`UPDATE propiedades_v2 SET datos_json = jsonb_set(jsonb_set(coalesce(datos_json,'{}'::jsonb),`);
    L.push(`  '{contenido,descripcion}', to_jsonb(${q(p.nuevo)}::text), true),`);
    L.push(`  '{trazabilidad,texto_refrescado}', to_jsonb(${q(`${HOY}: re-leído del portal tras la corrección de precio (${MARCA})`)}::text), true),`);
    L.push(`  fecha_actualizacion = NOW() WHERE id = ${p.id};`);
  }
  L.push('', `SELECT count(*) AS refrescadas FROM propiedades_v2 WHERE datos_json->'trazabilidad'->>'texto_refrescado' LIKE '${HOY}%';`);
  const f = `output/refrescar-texto-${HOY}-parte${n}.sql`;
  writeFileSync(f, L.join('\n') + '\n');
  console.log(`   📄 ${f}`);
}
console.log(`\n── RESUMEN ──`);
console.log(`   texto CAMBIÓ (hay que refrescar): ${cambiaron.length}`);
console.log(`   texto idéntico (nada que hacer):  ${iguales.length}`);
console.log(`   no respondieron:                  ${fallaron.length}${fallaron.length ? ' → ' + fallaron.join(',') : ''}`);
console.log(`   📊 ${trafico.resumen()}`);
