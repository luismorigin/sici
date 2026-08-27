#!/usr/bin/env node
// ============================================================================
// REPARAR FOTOS — la portada guardada murió y la card sale VACÍA en el feed
// ----------------------------------------------------------------------------
//   node reparar-fotos.mjs output/audit-shadow-venta-<ts>.json [más JSONs...]
//
// READ-ONLY: no escribe en la base. Fetchea los avisos señalados por el audit,
// toma sus `fotos_urls` de HOY y **emite el SQL** para que lo aplique el humano.
//
// 🔴 QUÉ ARREGLA. El captador reemplaza las imágenes del aviso: las que teníamos
// dejan de existir en el CDN y la card queda en blanco. El aviso está VIVO (HTTP
// 200), la descripción no cambió, así que ni el verificador ni el drift de texto lo
// ven. Es el único hallazgo del audit que **un usuario nota hoy mismo**.
//
// 🔑 LO QUE DECIDE ES LA PORTADA, no el conjunto: el feed muestra `fotos_urls[0]`.
// Que sigan vivas 8 de 11 no sirve de nada si la primera está rota.
//
// ⚠️ SÓLO se reemplaza si el aviso devuelve fotos hoy. Si viene con cero — porque el
// captador las borró y no repuso — se DECLARA y no se toca: dejar la lista vieja
// (aunque esté rota) es mejor que vaciarla, porque una lista vacía se ve igual que
// "esta propiedad no tiene fotos" y perdemos la señal de que hay algo que arreglar.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { fetchDetalleDepto } from './lib/detalle-deptos.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
dotenv.config({ path: join(ROOT, 'simon-mvp', '.env.local') });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,
                        process.env.SUPABASE_SERVICE_ROLE_KEY,
                        { auth: { persistSession: false } });

const archivos = process.argv.slice(2).filter((a) => a.endsWith('.json'));
if (!archivos.length) {
  console.error('\nUso: node reparar-fotos.mjs output/audit-shadow-venta-<ts>.json [...]\n');
  process.exit(1);
}

// Los ids salen del `fotos_rotas` que ya calculó el audit — no se re-detecta acá.
const objetivos = [];
for (const f of archivos) {
  const j = JSON.parse(readFileSync(f, 'utf-8'));
  for (const r of (j.fotos_rotas || [])) objetivos.push({ ...r, op: j.operacion });
}
if (!objetivos.length) { console.log('\n✅ Ningún `fotos_rotas` en los archivos dados.\n'); process.exit(0); }

console.log(`\n📷 REPARAR FOTOS — ${objetivos.length} avisos señalados por el audit. READ-ONLY.\n`);

const sql = [], sinFotos = [], fallaron = [];
for (const o of objetivos) {
  const { data: p } = await sb.from('propiedades_v2')
    .select('id,url,fuente,nombre_edificio,datos_json').eq('id', o.id).maybeSingle();
  if (!p) { fallaron.push({ id: o.id, razon: 'no está en la base' }); continue; }

  let h = null;
  try { h = await fetchDetalleDepto(p.fuente, p.url); }
  catch (e) { fallaron.push({ id: o.id, razon: `fetch falló: ${e.message}` }); continue; }

  const hoy = Array.isArray(h?.fotos_urls) ? h.fotos_urls.filter(Boolean) : [];
  const antes = p.datos_json?.contenido?.fotos_urls || [];

  if (!hoy.length) {
    // Ver cabecera: no se vacía la lista. Sin fotos nuevas no hay nada que reponer.
    sinFotos.push({ id: o.id, edif: p.nombre_edificio, antes: antes.length });
    console.log(`   ${o.id} ${(p.nombre_edificio || '?').padEnd(22)} ⚠️  el portal NO devuelve fotos → NO se toca`);
    continue;
  }

  console.log(`   ${o.id} ${(p.nombre_edificio || '?').padEnd(22)} ${antes.length} → ${hoy.length} fotos`);
  sql.push(
    `-- ${o.id} · ${p.nombre_edificio || '(sin edificio)'} · ${p.fuente} · ${antes.length} → ${hoy.length} fotos\n` +
    `UPDATE propiedades_v2 SET datos_json = jsonb_set(\n` +
    `  jsonb_set(coalesce(datos_json,'{}'::jsonb), '{contenido,fotos_urls}', '${JSON.stringify(hoy).replace(/'/g, "''")}'::jsonb, true),\n` +
    `  '{trazabilidad,fotos_repuestas}', to_jsonb('${new Date().toISOString().slice(0, 10)}: portada rota, repuestas del portal'::text), true)\n` +
    `WHERE id = ${o.id};`
  );
}

const out = join(__dirname, 'output', `reparar-fotos-${new Date().toISOString().slice(0, 10)}.sql`);
writeFileSync(out, [
  '-- Fotos repuestas desde el portal — generado por reparar-fotos.mjs',
  '-- La portada guardada devolvía != 200 y la card salía VACÍA en el feed.',
  '-- Aplicar de a bloques y verificar el conteo: debe tocar 1 fila por UPDATE.',
  '', ...sql, '',
].join('\n'), 'utf-8');

console.log(`\n────────── RESUMEN ──────────`);
console.log(`  reparables: ${sql.length}  ·  sin fotos en el portal: ${sinFotos.length}  ·  fallaron: ${fallaron.length}`);
if (sinFotos.length) {
  console.log(`\n  ⚠️  El portal no devuelve fotos para estas — se DECLARAN, no se tocan:`);
  for (const s of sinFotos) console.log(`     ${s.id} ${s.edif ?? '?'} (tenía ${s.antes})`);
  console.log(`     Vaciar la lista sería peor: se vería igual que "no tiene fotos" y se pierde la señal.`);
}
if (fallaron.length) for (const f of fallaron) console.log(`  ❌ ${f.id}: ${f.razon}`);
console.log(`\n  📄 SQL → ${out}\n`);
