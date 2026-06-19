// Completa las amenidades de los condominios nuevos (amen-out-A/B) en el catálogo FINAL.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = (f) => JSON.parse(readFileSync(join(__dirname, f), 'utf8'));

const data = R('catalogo-condominios-zn-FINAL.json');
let amen = [];
for (const f of ['amen-out-A.json', 'amen-out-B.json']) { try { amen = amen.concat(R(f)); } catch {} }

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(condominio|cond|urbanizacion|urb)\b/g, '').replace(/sevillas/g, 'sevilla')
  .replace(/\bii\b/g, '2').replace(/\biii\b/g, '3').replace(/\bi\b/g, '1')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const webMap = new Map(amen.map(a => [norm(a.nombre), a]));

let completados = 0, dudosos = [];
for (const c of data.catalogo) {
  if (!c.amenidades.length) {
    const w = webMap.get(norm(c.nombre));
    if (w && (w.amenidades_web || []).length) {
      c.amenidades = w.amenidades_web;
      c.fuente_amenidades = 'web';
      c.nuevo = false;
      completados++;
    }
    if (w && w.es_cerrado === false) dudosos.push(c.nombre);
    if (w?.url) c.url = w.url;
  }
}

data.con_amenidades = data.catalogo.filter(c => c.amenidades.length).length;
data.nuevos_sin_amenidades = data.catalogo.filter(c => !c.amenidades.length).length;
data.generado = new Date().toISOString();
writeFileSync(join(__dirname, 'catalogo-condominios-zn-FINAL.json'), JSON.stringify(data, null, 2));

console.log(`\n✅ Amenidades completadas: ${completados}`);
console.log(`   Catálogo: ${data.total} condominios · con amenidades: ${data.con_amenidades} · aún sin: ${data.nuevos_sin_amenidades}`);
if (dudosos.length) console.log(`   ⚠️ La web los marcó NO-cerrados (revisar): ${dudosos.join(', ')}`);
console.log('\n   Nuevos completados:');
for (const c of data.catalogo.filter(c => c.fuente_amenidades === 'web')) console.log(`   • ${c.nombre}: ${c.amenidades.slice(0, 6).join(', ')}${c.amenidades.length > 6 ? '…' : ''}`);
const sin = data.catalogo.filter(c => !c.amenidades.length);
if (sin.length) console.log(`\n   Sin amenidades aún: ${sin.map(c => c.nombre).join(', ')}`);
console.log(`\n💾 catalogo-condominios-zn-FINAL.json`);
