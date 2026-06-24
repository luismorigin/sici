// Agrupa las extracciones de condominios (cat-out-*.json) por nombre + GPS → catálogo con polígono.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = (f) => JSON.parse(readFileSync(join(__dirname, f), 'utf8'));

// GPS por id (de las descripciones que tienen lat/lon)
const gps = new Map();
for (const c of R('descripciones-casas-zn-cat.json')) gps.set(String(c.id), { lat: c.lat, lon: c.lon });

// merge extracciones
let ext = [];
for (const n of [1, 2, 3, 4]) { try { ext = ext.concat(R(`cat-out-${n}.json`)); } catch {} }

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(condominio|cond|urbanizacion|urb|barrio|residencial|el|la|los|las|de|del)\b/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const enCond = ext.filter(e => e.es_condominio_cerrado);
const conNombre = enCond.filter(e => e.nombre_condominio && norm(e.nombre_condominio).length >= 3);
const sinNombre = enCond.length - conNombre.length;

// agrupar por nombre normalizado
const grupos = new Map();
for (const e of conNombre) {
  const k = norm(e.nombre_condominio);
  if (!grupos.has(k)) grupos.set(k, { nombres: [], ids: [], amen: new Set(), pts: [] });
  const g = grupos.get(k);
  g.nombres.push(e.nombre_condominio);
  g.ids.push(String(e.id));
  (e.amenidades_condominio || []).forEach(a => g.amen.add(a));
  const p = gps.get(String(e.id));
  if (p && Number.isFinite(p.lat) && Number.isFinite(p.lon)) g.pts.push(p);
}

const catalogo = [...grupos.values()].map(g => {
  const lats = g.pts.map(p => p.lat), lons = g.pts.map(p => p.lon);
  const nombre = g.nombres.sort((a, b) => b.length - a.length)[0]; // el más descriptivo
  return {
    nombre, n_casas: g.ids.length,
    gps_centroide: lats.length ? { lat: +(lats.reduce((a, b) => a + b) / lats.length).toFixed(6), lon: +(lons.reduce((a, b) => a + b) / lons.length).toFixed(6) } : null,
    bbox: lats.length >= 2 ? { N: Math.max(...lats), S: Math.min(...lats), E: Math.max(...lons), O: Math.min(...lons) } : null,
    tiene_poligono: lats.length >= 2,
    amenidades_comunes: [...g.amen],
    ids: g.ids,
  };
}).sort((a, b) => b.n_casas - a.n_casas);

const conPoligono = catalogo.filter(c => c.tiene_poligono);
writeFileSync(join(__dirname, 'catalogo-condominios-zn.json'), JSON.stringify({
  generado: new Date().toISOString(),
  total_casas_analizadas: ext.length,
  casas_en_condominio: enCond.length,
  casas_individuales: ext.length - enCond.length,
  condominios_detectados: catalogo.length,
  condominios_con_poligono: conPoligono.length,
  condominios_sin_nombre: sinNombre,
  catalogo,
}, null, 2));

console.log(`\n📍 CATÁLOGO CONDOMINIOS ZN (de ${ext.length} casas)`);
console.log(`   En condominio: ${enCond.length} · individuales: ${ext.length - enCond.length}`);
console.log(`   Condominios únicos: ${catalogo.length} (con ≥2 casas/polígono: ${conPoligono.length}) · sin nombre: ${sinNombre}\n`);
console.log('   Top por nº de casas:');
for (const c of catalogo.slice(0, 20)) {
  console.log(`   ${c.n_casas}x  ${c.nombre}${c.tiene_poligono ? ' 🟢poly' : ''}  [${c.amenidades_comunes.slice(0, 4).join(', ')}${c.amenidades_comunes.length > 4 ? '…' : ''}]`);
}
console.log(`\n💾 catalogo-condominios-zn.json`);
