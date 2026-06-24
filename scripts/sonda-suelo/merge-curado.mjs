// Combina catálogo (GPS+spread) + verificación web (3 lotes) → catálogo curado con veredicto.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const R = (f) => JSON.parse(readFileSync(join(__dirname, f), 'utf8'));

const cat = R('catalogo-condominios-zn.json').catalogo;
let web = [];
for (const n of [1, 2, 3]) { try { web = web.concat(R(`web-out-${n}.json`)); } catch {} }
const webByName = new Map(web.map(w => [w.nombre, w]));

const RAD = x => x * Math.PI / 180, ER = 6371000;
const dist = (a, b, c, d) => { const x = Math.sin(RAD(c - a) / 2) ** 2 + Math.cos(RAD(a)) * Math.cos(RAD(c)) * Math.sin(RAD(d - b) / 2) ** 2; return Math.round(ER * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))); };
// clave para unir duplicados: sin acentos, sin genéricos, sin numeral final
const key = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\b(i{1,3}|iv|v|\d+)\b\s*$/,'').replace(/\s+/g, ' ').trim();

// agrupar el catálogo por clave-sin-numeral (une Paraíso Norte 1/Paraíso Norte, San Rafael II/2)
const grupos = new Map();
for (const c of cat) {
  const k = key(c.nombre);
  if (!grupos.has(k)) grupos.set(k, []);
  grupos.get(k).push(c);
}

const curado = [];
for (const [k, items] of grupos) {
  const nombre = items.map(i => i.nombre).sort((a, b) => b.length - a.length)[0];
  const n_casas = items.reduce((s, i) => s + i.n_casas, 0);
  const lats = items.map(i => i.gps_centroide.lat), lons = items.map(i => i.gps_centroide.lon);
  const gps = { lat: +(lats.reduce((a, b) => a + b) / lats.length).toFixed(6), lon: +(lons.reduce((a, b) => a + b) / lons.length).toFixed(6) };
  const spread = Math.max(...items.map(i => i.bbox ? dist(i.bbox.S, i.bbox.O, i.bbox.N, i.bbox.E) : 0),
    items.length > 1 ? dist(Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)) : 0);
  const amenLLM = new Set(items.flatMap(i => i.amenidades_comunes));
  // datos web (de cualquiera de los nombres del grupo)
  const ws = items.map(i => webByName.get(i.nombre)).filter(Boolean);
  const existe = ws.some(w => w.existe === true);
  const cerradoVals = ws.map(w => w.es_cerrado);
  const es_cerrado = cerradoVals.includes(true) ? true : cerradoVals.includes('dudoso') ? 'dudoso' : cerradoVals.length ? false : null;
  const amenWeb = new Set(ws.flatMap(w => w.amenidades_web || []));
  const ubic = ws.map(w => w.ubicacion_web).filter(Boolean)[0] || '';
  const url = ws.map(w => w.url).filter(Boolean)[0] || '';
  const nota = ws.map(w => w.nota).filter(Boolean).join(' | ');

  let veredicto;
  if (existe === false || (!existe && !es_cerrado)) veredicto = 'no_encontrado';
  else if (es_cerrado === false) veredicto = 'abierto_descartar';
  else if (spread > 3000) veredicto = 'gps_disperso_descartar';
  else if (es_cerrado === 'dudoso' || spread > 1200) veredicto = 'dudoso_revisar';
  else veredicto = 'verificado';

  curado.push({ nombre, n_casas, veredicto, gps_centroide: gps, spread_m: spread,
    existe_web: existe, es_cerrado_web: es_cerrado,
    amenidades: [...new Set([...amenLLM, ...amenWeb])], ubicacion_web: ubic, url, nota,
    duplicados_unidos: items.length > 1 ? items.map(i => i.nombre) : undefined });
}

const orden = { verificado: 0, dudoso_revisar: 1, abierto_descartar: 2, gps_disperso_descartar: 3, no_encontrado: 4 };
curado.sort((a, b) => (orden[a.veredicto] - orden[b.veredicto]) || (b.n_casas - a.n_casas));

const cuenta = curado.reduce((m, c) => (m[c.veredicto] = (m[c.veredicto] || 0) + 1, m), {});
writeFileSync(join(__dirname, 'catalogo-condominios-zn-curado.json'), JSON.stringify({ generado: new Date().toISOString(), resumen: cuenta, total: curado.length, catalogo: curado }, null, 2));

console.log(`\n📋 CATÁLOGO CURADO — ${curado.length} condominios (tras unir duplicados)`);
console.log('   ' + Object.entries(cuenta).map(([k, v]) => `${k}: ${v}`).join(' · ') + '\n');
for (const c of curado) {
  const ic = { verificado: '✅', dudoso_revisar: '🟡', abierto_descartar: '🔴', gps_disperso_descartar: '🔴', no_encontrado: '⚫' }[c.veredicto];
  console.log(`${ic} ${c.nombre} (${c.n_casas}c) — ${c.veredicto}${c.spread_m > 1200 ? ' spread ' + c.spread_m + 'm' : ''}`);
  if (c.veredicto === 'verificado' && c.amenidades.length) console.log(`     ${c.amenidades.slice(0, 6).join(', ')}`);
}
console.log(`\n💾 catalogo-condominios-zn-curado.json`);
