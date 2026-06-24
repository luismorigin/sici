// Baja el DETALLE (descripción) de una tanda de casas ZN, para enrichment manual (lo leo yo, no API).
// Prioriza casas cerca de un condominio conocido (GPS) → maximiza matches en la validación.
// Standalone, read-only sobre portales. Uso: node detalle-casas-zn.mjs [--n 30]
import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { c21Detalle, remaxDetalle } from './lib/portales.mjs';
import { sleep } from './lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const N = parseInt(arg('--n', '30'), 10);

const casas = JSON.parse(readFileSync(join(__dirname, 'output/2026-06-18-15-40-53/raw/casas.json')))
  .filter(c => c.zona === 'zona-norte' && c.unico && c.url);
const catalogo = JSON.parse(readFileSync(join(__dirname, 'catalogo-condominios-zn-FINAL.json'))).catalogo;

// distancia haversine (m)
const distM = (la1, lo1, la2, lo2) => {
  const R = 6371000, rad = x => x * Math.PI / 180;
  const dla = rad(la2 - la1), dlo = rad(lo2 - lo1);
  const h = Math.sin(dla / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// pre-match GPS: condominio más cercano (solo pista, el matcher real es SQL nombre+GPS)
for (const c of casas) {
  let best = null;
  for (const cond of catalogo) {
    const d = distM(c.lat, c.lon, cond.gps.lat, cond.gps.lon);
    if (!best || d < best.dist) best = { nombre: cond.nombre, dist: Math.round(d) };
  }
  c.cond_cercano = best;
}

// tanda: las N más cercanas a un condominio (las "interesantes" para validar match)
const tanda = casas.sort((a, b) => a.cond_cercano.dist - b.cond_cercano.dist).slice(0, N);
console.log(`Bajando detalle de ${tanda.length} casas ZN (más cercanas a condominio)…`);

const out = [];
for (const [i, c] of tanda.entries()) {
  let det = null;
  try { det = c.fuente === 'c21' ? await c21Detalle(c.url) : await remaxDetalle(c.url); }
  catch (e) { console.log(`  ✗ ${c.url} — ${e.message}`); }
  out.push({
    fuente: c.fuente, url: c.url, lat: c.lat, lon: c.lon,
    area_const_m2: c.area_const_m2, area_terreno_m2: c.area_terreno_m2,
    dorms: c.dorms, banos: c.banos, garage: c.garage,
    precio_raw: c.precio_raw, moneda: c.moneda,
    cond_cercano: c.cond_cercano,
    descripcion: (det?.descripcion || det?.description_website || det?.marketing_description || '').trim(),
  });
  if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${tanda.length}`);
  await sleep(800);
}

const dest = join(__dirname, 'casas-zn-detalle.json');
writeFileSync(dest, JSON.stringify(out, null, 2));
const conDesc = out.filter(c => c.descripcion.length > 30).length;
console.log(`\n💾 ${dest}\n   ${out.length} casas · ${conDesc} con descripción usable (>30 chars)`);
