#!/usr/bin/env node
// ============================================================================
// SELLAR PRECIO DE PORTAL — cierra el caso de un cambio de precio ya juzgado.
//
// EL PROBLEMA QUE RESUELVE (27-ago-2026)
// El chequeo de "cambio de precio en portal" de auditar-shadow.mjs compara el portal de
// HOY contra `datos_json.senales_portal`, que es el testigo del día que se CAPTURÓ la
// propiedad. Ese testigo lo escriben sólo los cargadores y nada lo refresca nunca.
// Resultado: una vez que el portal se mueve, el caso se repite EN CADA CORRIDA para
// siempre — aunque ya lo hayas juzgado y corregido. Medido: 8000642 se corrigió a los
// 120.000 que pedía el portal y volvió a marcar "suba 26,3%" en la corrida siguiente.
// Con cadencia mensual la lista arrastra todo el mes anterior y la alarma muere de ruido.
//
// 🔴 POR QUÉ NO SE REFRESCA senales_portal: en VENTA-USD ese campo (`precio_candidato`) lo
// comparte el chequeo §COPIA MAL ("¿copiamos mal al leer?"), que es ciego al portal de hoy
// A PROPÓSITO — corre antes del fetch, porque el error que busca nació entre el portal y el
// lector el día de la captura. Pisarlo lo dejaría midiendo otra cosa. Por eso la memoria
// vive en un campo PROPIO: `datos_json.precio_portal_revisado`.
//
// 🔑 SE AUTO-INVALIDA: guarda el valor del portal en el momento de juzgarlo. El audit usa
// ese número como baseline nuevo, así que si el portal vuelve a moverse más que el umbral,
// el caso REAPARECE solo. No es una marca de "ya revisado" incondicional — esas tapan un
// problema nuevo en algo que miraste hace meses.
//
// READ-ONLY: no escribe en la base. Emite SQL para que lo aplique el humano.
//
// Uso:
//   node sellar-precio-portal.mjs output/audit-shadow-venta-<ts>.json [más JSONs...]
//   node sellar-precio-portal.mjs output/audit-...json --solo 3974,8000642
//     --solo  sella únicamente esos ids (para cuando NO juzgaste todos)
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'output');
const args = process.argv.slice(2);
const soloArg = args.find((a) => a.startsWith('--solo'));
const solo = soloArg
  ? new Set((soloArg.includes('=') ? soloArg.split('=')[1] : args[args.indexOf(soloArg) + 1] || '')
      .split(',').map((s) => Number(s.trim())).filter(Boolean))
  : null;
const files = args.filter((a) => a.endsWith('.json'));

if (!files.length) {
  console.error('Uso: node sellar-precio-portal.mjs output/audit-shadow-<op>-<ts>.json [--solo 123,456]');
  process.exit(1);
}

const hoy = new Date().toISOString().slice(0, 10);
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const filas = [];
let omitidos = 0;

for (const f of files) {
  let j;
  try { j = JSON.parse(readFileSync(f, 'utf8')); }
  catch (e) { console.error(`✖ no pude leer ${f}: ${e.message}`); process.exit(1); }
  const cambios = j.cambios_precio || j.precios_cambio || j.preciosCambio || null;
  if (!cambios) {
    // Los JSON viejos no persisten la lista; se reconstruye desde el material.
    const desdeMaterial = (j.material || []).filter((m) => m.precio_portal).map((m) => ({ id: m.id, ...m.precio_portal }));
    if (!desdeMaterial.length) { console.error(`⚠️  ${f}: sin cambios de precio que sellar`); continue; }
    for (const c of desdeMaterial) { if (solo && !solo.has(c.id)) { omitidos++; continue; } filas.push({ ...c, op: j.operacion }); }
    continue;
  }
  for (const c of cambios) { if (solo && !solo.has(c.id)) { omitidos++; continue; } filas.push({ ...c, op: j.operacion }); }
}

if (!filas.length) { console.log('\n  Nada que sellar.\n'); process.exit(0); }

const L = [];
L.push('-- ══════════════════════════════════════════════════════════════════');
L.push(`-- SELLAR PRECIO DE PORTAL — ${filas.length} casos ya juzgados (${hoy})`);
L.push('-- Generado por sellar-precio-portal.mjs. READ-ONLY hasta que lo apliques.');
L.push('--');
L.push('-- Guarda el valor que el portal muestra HOY como baseline nuevo del chequeo de');
L.push('-- cambio de precio. Sin esto, estos casos vuelven IDENTICOS en la proxima corrida.');
L.push('-- NO toca senales_portal (lo comparte el chequeo de "copiamos mal", que debe seguir');
L.push('-- viendo el testigo del dia de la captura).');
L.push('--');
L.push('-- 🔑 Se auto-invalida: si el portal vuelve a moverse mas que el umbral, reaparece solo.');
L.push('-- ⚠️  Sellar SIN haber juzgado el caso apaga una alarma real. Aplicar despues del juez.');
L.push('-- ══════════════════════════════════════════════════════════════════\n');

for (const c of filas) {
  const nota = `el portal paso de ${c.base} a ${c.hoy} (${c.dir} ${c.pct}%${c.moneda ? ', ' + c.moneda : ''}); juzgado en el audit del ${hoy}`;
  L.push(`-- ${c.id} · ${c.op} · ${c.dir} ${c.pct}%  ${c.base} → ${c.hoy}${c.baseline === 'revisado' ? '  (ya venia sellado: el portal se movio DE NUEVO)' : ''}`);
  L.push(`UPDATE propiedades_v2 SET`);
  L.push(`  datos_json = jsonb_set(coalesce(datos_json,'{}'::jsonb), '{precio_portal_revisado}',`);
  L.push(`    jsonb_build_object('portal', ${c.hoy}, 'cuando', ${q(hoy)}, 'quien', 'audit drift (juez)',`);
  L.push(`                       'base_anterior', ${c.base}, 'nota', ${q(nota)}), true),`);
  L.push(`  fecha_actualizacion = NOW() WHERE id = ${c.id};`);
}
L.push(`\n-- Total: ${filas.length} UPDATEs, 1 fila cada uno.`);

mkdirSync(OUT, { recursive: true });
const dest = join(OUT, `sellar-precio-portal-${hoy}.sql`);
writeFileSync(dest, L.join('\n') + '\n');

const re = filas.filter((c) => c.baseline === 'revisado').length;
console.log(`\n🔒 SELLAR PRECIO DE PORTAL — ${filas.length} casos${solo ? ` (--solo activo: ${omitidos} omitidos)` : ''}`);
if (re) console.log(`   ⚠️  ${re} ya venían sellados y el portal se movió DE NUEVO — esos son cambios reales, no ruido.`);
console.log(`   📄 SQL → ${dest}`);
console.log(`   Aplicalo DESPUÉS de las correcciones. Sin esto, los ${filas.length} vuelven la próxima corrida.\n`);
