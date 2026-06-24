// Geocoding de los condominios verificados (Nominatim/OSM) + contraste con el centroide de anuncios.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const UA = { 'user-agent': 'SICI-Sonda/1.0 (directorcasapatio@gmail.com)' };

const cur = JSON.parse(readFileSync(join(__dirname, 'catalogo-condominios-zn-curado.json'), 'utf8'));
const verificados = cur.catalogo.filter(c => c.veredicto === 'verificado');

const RAD = x => x * Math.PI / 180, ER = 6371000;
const dist = (a, b, c, d) => { const x = Math.sin(RAD(c - a) / 2) ** 2 + Math.cos(RAD(a)) * Math.cos(RAD(c)) * Math.sin(RAD(d - b) / 2) ** 2; return Math.round(ER * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))); };

// viewbox ZN para sesgar resultados (O,S,E,N)
const VIEWBOX = '-63.1950,-17.7718,-63.1113,-17.6640';

async function geocode(nombre) {
  for (const q of [`Condominio ${nombre}, Santa Cruz de la Sierra, Bolivia`, `${nombre}, Santa Cruz de la Sierra, Bolivia`]) {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=bo&limit=1&viewbox=${VIEWBOX}&q=${encodeURIComponent(q)}`;
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
      const j = await r.json();
      if (j[0]) return { lat: +j[0].lat, lon: +j[0].lon, dir: j[0].display_name };
    } catch {}
    await sleep(1200);
  }
  return null;
}

const out = [];
console.log(`\n🌍 Geocoding ${verificados.length} condominios verificados (Nominatim/OSM)\n`);
for (const c of verificados) {
  const g = await geocode(c.nombre);
  const d = g ? dist(c.gps_centroide.lat, c.gps_centroide.lon, g.lat, g.lon) : null;
  const estado = !g ? 'no en OSM' : d <= 600 ? `✅ coincide (${d}m)` : d <= 1500 ? `~ cerca (${d}m)` : `⚠️ discrepa (${d}m)`;
  out.push({ nombre: c.nombre, centroide: c.gps_centroide, osm: g ? { lat: g.lat, lon: g.lon } : null, dist_m: d, dir_osm: g?.dir || null, estado });
  console.log(`${estado.padEnd(22)} ${c.nombre}`);
  if (g && d > 600) console.log(`     centroide ${c.gps_centroide.lat},${c.gps_centroide.lon}  vs OSM ${g.lat},${g.lon}`);
  await sleep(1200);
}
writeFileSync(join(__dirname, 'geocode-condominios.json'), JSON.stringify(out, null, 2));
const ok = out.filter(o => o.dist_m != null && o.dist_m <= 600).length;
const noosm = out.filter(o => !o.osm).length;
console.log(`\nResumen: ${ok} confirmados por OSM (≤600m) · ${noosm} no están en OSM (queda el centroide de anuncios) · resto cerca/discrepa`);
console.log(`💾 geocode-condominios.json`);
