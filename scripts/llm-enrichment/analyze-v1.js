const detail = require('./output/test-detail-v1.0-test-2026-03-10.json');
const raw = require('./output/test-raw-v1.0-test-2026-03-10.json');

// Analyze worst-performing fields
const byField = {};
for (const r of detail) {
  if (!byField[r.campo]) byField[r.campo] = { igual: 0, llm_agrega: 0, llm_no_detecta: 0, llm_difiere: 0, total: 0 };
  byField[r.campo][r.veredicto]++;
  byField[r.campo].total++;
}

console.log('=== V1 FIELD ANALYSIS (sorted by no_detecta + difiere) ===');
const sorted = Object.entries(byField)
  .map(([f, s]) => ({ field: f, ...s, problems: s.llm_no_detecta + s.llm_difiere }))
  .sort((a, b) => b.problems - a.problems);
for (const f of sorted) {
  console.log(f.field.padEnd(30), 'igual=' + f.igual, 'agrega=' + f.llm_agrega, 'NO_DETECTA=' + f.llm_no_detecta, 'DIFIERE=' + f.llm_difiere, '| problems=' + f.problems + '/' + f.total);
}

// Analyze tipo_cambio_detectado no_detecta
console.log('\n=== tipo_cambio: no_detecta cases ===');
const tcFails = detail.filter(r => r.campo === 'tipo_cambio_detectado' && r.veredicto === 'llm_no_detecta');
for (const r of tcFails) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// Analyze baulera failures
console.log('\n=== baulera: no_detecta cases ===');
const bauFails = detail.filter(r => r.campo === 'baulera' && r.veredicto === 'llm_no_detecta');
for (const r of bauFails) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// Check what BD has for baulera = false in no_detecta
console.log('\n=== baulera: BD values in no_detecta ===');
for (const r of bauFails) {
  console.log('ID', r.id_propiedad, 'BD:', r.valor_actual_bd, 'LLM:', r.valor_llm);
}

// Analyze acepta_permuta no_detecta
console.log('\n=== acepta_permuta: no_detecta ===');
const permFails = detail.filter(r => r.campo === 'acepta_permuta' && r.veredicto === 'llm_no_detecta');
for (const r of permFails) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// plan_pagos no_detecta
console.log('\n=== plan_pagos: no_detecta ===');
const planFails = detail.filter(r => r.campo === 'plan_pagos_desarrollador' && r.veredicto === 'llm_no_detecta');
for (const r of planFails) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// precio_negociable no_detecta
console.log('\n=== precio_negociable: no_detecta ===');
const pnFails = detail.filter(r => r.campo === 'precio_negociable' && r.veredicto === 'llm_no_detecta');
for (const r of pnFails) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// solo_tc_paralelo difiere
console.log('\n=== solo_tc_paralelo: difiere ===');
const tcpDiff = detail.filter(r => r.campo === 'solo_tc_paralelo' && r.veredicto === 'llm_difiere');
for (const r of tcpDiff) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// estado_construccion difiere
console.log('\n=== estado_construccion: difiere ===');
const ecDiff = detail.filter(r => r.campo === 'estado_construccion' && r.veredicto === 'llm_difiere');
for (const r of ecDiff) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm);
}

// Check what tipo_cambio BD has for no_especificado -> NULL conversions
console.log('\n=== tipo_cambio: BD no_especificado cases ===');
const tcNoEspec = detail.filter(r => r.campo === 'tipo_cambio_detectado' && r.valor_actual_bd === 'no_especificado');
for (const r of tcNoEspec) {
  console.log('ID', r.id_propiedad, r.portal, ':', r.valor_actual_bd, '->', r.valor_llm, '(' + r.veredicto + ')');
}
