// Inyecta los veredictos de los subagentes-lectores al material completo (por id),
// dejándolo listo para `cargar-alquiler-shadow.mjs --apply`.
// veredictos.json = array [{id, gate, precio_mensual, ...}] (el veredicto lleva su id).
// Uso: node inyectar-veredictos.mjs <material-alq-*.json> <veredictos.json>
import { readFileSync, writeFileSync } from 'node:fs';

const [, , matFile, ...verFiles] = process.argv;
if (!matFile || !verFiles.length) { console.error('Uso: node inyectar-veredictos.mjs <material.json> <veredictos-1.json> [veredictos-2.json ...]'); process.exit(1); }

const doc = JSON.parse(readFileSync(matFile, 'utf8'));
let arr = [];
for (const vf of verFiles) {
  const raw = JSON.parse(readFileSync(vf, 'utf8'));
  arr = arr.concat(Array.isArray(raw) ? raw : (raw.veredictos || raw.entradas || []));
}
const byId = new Map(arr.map((v) => [Number(v.id), v]));

let ok = 0, faltan = [];
for (const e of doc.entradas) {
  const v = byId.get(Number(e.id));
  if (v) { const { id, ...ver } = v; e.veredicto = ver; ok++; }
  else faltan.push(e.id);
}
writeFileSync(matFile, JSON.stringify(doc, null, 2));
console.log(`✅ ${ok}/${doc.entradas.length} veredictos inyectados a ${matFile}`);
if (faltan.length) console.log(`⚠️  sin veredicto (${faltan.length}): ${faltan.join(', ')}`);
console.log(`\n→ node cargar-alquiler-shadow.mjs --apply ${matFile}`);
