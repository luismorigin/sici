// ============================================================================
// MEDIR RELECTURA — ¿qué aporta pasar el reader sobre data del pipeline viejo?
// ----------------------------------------------------------------------------
// Compara, propiedad por propiedad, el veredicto del lector contra lo que decía
// el pipeline viejo (viene en `senales.n8n` de cada entrada del material) y
// cuenta los campos que el viejo NO capturaba y ahora existen por primera vez.
//
// Read-only: no toca ninguna base. Se corre DESPUÉS de inyectar los veredictos
// y ANTES de decidir si se aplica.
//
// Uso: node medir-relectura.mjs output/material-<ts>-<zona>.json
// ============================================================================
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Uso: node medir-relectura.mjs <material-*.json>'); process.exit(1); }
const doc = JSON.parse(readFileSync(file, 'utf8'));
const con = doc.entradas.filter((e) => e.veredicto);
const sin = doc.entradas.length - con.length;

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');
const num = (v) => (v == null ? null : Number(v));

let aceptadas = 0, rechazadas = 0;
const rechazos = {}, cambiosPrecio = [], cambiosTc = [], cambiosDorms = [], nombresNuevos = [];
let nuevoPiso = 0, nuevoAmoblado = 0, nuevoEquipado = 0, nuevoExtra = 0, nuevoEquipOtros = 0, multiproyecto = 0;

for (const e of con) {
  const v = e.veredicto, viejo = e.senales?.n8n || {};
  if (v.gate === 'rechazar') {
    rechazadas++;
    rechazos[v.razon_gate || 'sin razón'] = (rechazos[v.razon_gate || 'sin razón'] || 0) + 1;
    continue;
  }
  aceptadas++;

  const pv = num(viejo.precio_usd), pn = num(v.precio_usd);
  if (pv && pn && Math.abs(pn - pv) / pv > 0.02) {
    cambiosPrecio.push({ id: e.id, viejo: pv, nuevo: pn, pctCambio: Math.round((100 * (pn - pv)) / pv) });
  }
  if (viejo.tc && v.tipo_cambio_detectado && viejo.tc !== v.tipo_cambio_detectado) {
    cambiosTc.push({ id: e.id, de: viejo.tc, a: v.tipo_cambio_detectado });
  }
  if (viejo.dorm != null && v.dormitorios != null && Number(viejo.dorm) !== Number(v.dormitorios)) {
    cambiosDorms.push({ id: e.id, de: viejo.dorm, a: v.dormitorios });
  }
  if (v.nombre_edificio_canonico && !viejo.edif) nombresNuevos.push({ id: e.id, nombre: v.nombre_edificio_canonico });

  if (v.piso != null) nuevoPiso++;
  if (v.amoblado != null) nuevoAmoblado++;
  if (v.equipado != null) nuevoEquipado++;
  if (Array.isArray(v.amenidades_extra) && v.amenidades_extra.length) nuevoExtra++;
  if (Array.isArray(v.equipamiento_otros) && v.equipamiento_otros.length) nuevoEquipOtros++;
  if (v.es_multiproyecto) multiproyecto++;
}

const L = (s = '') => console.log(s);
L(`\n📊 QUÉ APORTÓ LA RELECTURA  ·  zona: ${doc.zona || 'equipetrol'}  ·  origen del material: ${doc.origen || 'portal'}`);
L('='.repeat(70));
L(`\nLeídas: ${con.length}/${doc.entradas.length}${sin ? `  ⚠️ ${sin} SIN veredicto (el lector no las cubrió)` : ''}`);
L(`  ✅ aceptadas: ${aceptadas}   ❌ rechazadas por el gate: ${rechazadas}`);
for (const [r, n] of Object.entries(rechazos).sort((a, b) => b[1] - a[1])) L(`       · ${n} — ${r}`);
if (multiproyecto) L(`  🏗️  marcadas multiproyecto (se taguean, no se rechazan): ${multiproyecto}`);

L(`\n🆕 CAMPOS QUE EL PIPELINE VIEJO NO CAPTURABA (existen por primera vez):`);
L(`     piso                    ${nuevoPiso}/${aceptadas}  (${pct(nuevoPiso, aceptadas)})`);
L(`     amoblado                ${nuevoAmoblado}/${aceptadas}  (${pct(nuevoAmoblado, aceptadas)})`);
L(`     equipado                ${nuevoEquipado}/${aceptadas}  (${pct(nuevoEquipado, aceptadas)})`);
L(`     "lo que la hace especial" ${nuevoExtra}/${aceptadas}  (${pct(nuevoExtra, aceptadas)})`);
L(`     equipamiento extra      ${nuevoEquipOtros}/${aceptadas}  (${pct(nuevoEquipOtros, aceptadas)})`);

L(`\n🔧 CORRECCIONES SOBRE LO QUE YA HABÍA:`);
L(`     precio distinto (>2%):  ${cambiosPrecio.length}`);
for (const c of cambiosPrecio.slice(0, 12)) L(`       · ${c.id}: $${c.viejo.toLocaleString()} → $${c.nuevo.toLocaleString()}  (${c.pctCambio > 0 ? '+' : ''}${c.pctCambio}%)`);
if (cambiosPrecio.length > 12) L(`       … y ${cambiosPrecio.length - 12} más`);
L(`     tipo de cambio re-clasificado: ${cambiosTc.length}`);
for (const c of cambiosTc.slice(0, 8)) L(`       · ${c.id}: ${c.de} → ${c.a}`);
if (cambiosTc.length > 8) L(`       … y ${cambiosTc.length - 8} más`);
L(`     dormitorios corregidos: ${cambiosDorms.length}`);
for (const c of cambiosDorms) L(`       · ${c.id}: ${c.de} → ${c.a}`);
L(`     nombre de edificio que antes no había: ${nombresNuevos.length}`);
for (const n of nombresNuevos.slice(0, 10)) L(`       · ${n.id}: ${n.nombre}`);
if (nombresNuevos.length > 10) L(`       … y ${nombresNuevos.length - 10} más`);
L(`\n${'='.repeat(70)}`);
L('Read-only: no se escribió nada. El --apply es una decisión aparte.\n');
