// Sonda de ALQUILER de departamentos en Zona Norte — read-only, $0.
// Cuenta cuántos alquileres de depto hay PUBLICADOS HOY en C21+Remax dentro del
// polígono ZN, para compararlos contra los que tenemos en la BD (~118 activos).
// Reusa fetcher + filtro de polígono de la sonda de suelo.
// C21: operacion_renta (NO _alquiler). Remax: transaction_type.name === 'Alquiler'.
import { fetchRetry, sleep } from './lib/fetcher.mjs';
import { bboxDe, enZona } from './lib/zonas.mjs';

const STEP = 0.02;
const log = (...a) => console.log(...a);

// ---------------- C21 alquiler (operacion_renta) ----------------
async function c21RentaZN() {
  const b = bboxDe('zona-norte');
  const cuadrantes = [];
  for (let lat = b.S; lat < b.N; lat += STEP)
    for (let lon = b.O; lon < b.E; lon += STEP)
      cuadrantes.push({ N: Math.min(lat + STEP, b.N), E: Math.min(lon + STEP, b.E), S: lat, O: lon });

  const vistos = new Set(), out = [];
  for (const [idx, c] of cuadrantes.entries()) {
    const coord = `coordenadas_${c.N.toFixed(6)},${c.E.toFixed(6)},${c.S.toFixed(6)},${c.O.toFixed(6)}`;
    const url = `https://c21.com.bo/v/resultados/tipo_departamento/operacion_renta/layout_mapa/${coord},15?json=true`;
    let j;
    try { j = await fetchRetry(url, { json: true, headers: { 'accept':'application/json', 'cookie':`PHPSESSID=s${Math.random().toString(36).slice(2,12)}` } }); }
    catch { await sleep(1200); continue; }
    let props = Array.isArray(j) ? j : j?.results || j?.datas?.results || [];
    for (const p of props) {
      const id = String(p.id ?? '');
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
      if (!enZona(lat, lon, 'zona-norte')) continue; // polígono fino
      out.push({ fuente:'c21', id, lat, lon, precio:p.precio, moneda:p.moneda, url: p.urlCorrectaPropiedad ? `https://c21.com.bo${p.urlCorrectaPropiedad}` : null });
    }
    if ((idx+1) % 6 === 0) log(`  C21 ${idx+1}/${cuadrantes.length} cuadrantes, ${out.length} en polígono ZN`);
    await sleep(1300);
  }
  return out;
}

// ---------------- Remax alquiler depto (filtra Alquiler + polígono) ----------------
async function remaxRentaZN({ maxPages = 90 } = {}) {
  const out = [], vistos = new Set();
  for (let page = 1; page <= maxPages; page++) {
    let j;
    try { j = await fetchRetry(`https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra?page=${page}`, { json: true }); }
    catch { await sleep(1200); continue; }
    const data = j?.data ?? [];
    if (!data.length) { log(`  Remax fin en pág ${page}`); break; }
    for (const p of data) {
      const op = (p.transaction_type?.name || '').toLowerCase();
      if (op !== 'alquiler') continue;
      const id = String(p.MLSID ?? '');
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const lat = parseFloat(p.location?.latitude), lon = parseFloat(p.location?.longitude);
      if (!enZona(lat, lon, 'zona-norte')) continue;
      out.push({ fuente:'remax', id, lat, lon, precio:p.price?.amount, moneda:p.price?.currency_id===1?'BOB':'USD', url: p.slug ? `https://remax.bo/propiedad/${p.slug}` : null });
    }
    if (page % 15 === 0) log(`  Remax ${page} págs, ${out.length} alquiler en polígono ZN`);
    await sleep(1200);
  }
  return out;
}

// dedup cross-portal por GPS redondeado (~11m)
function dedup(props) {
  const seen = new Map();
  for (const p of props) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const k = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    if (!seen.has(k)) seen.set(k, p);
  }
  return [...seen.values()];
}

log('=== SONDA ALQUILER DEPTOS ZONA NORTE (portal en vivo) ===\n');
log('› C21 (operacion_renta)...');
const c21 = await c21RentaZN();
log(`  C21 total en polígono ZN: ${c21.length}\n`);
log('› Remax (transaction_type=Alquiler)...');
const remax = await remaxRentaZN();
log(`  Remax total en polígono ZN: ${remax.length}\n`);

const all = [...c21, ...remax];
const unicos = dedup(all);
log('=== RESULTADO ===');
log(`C21:   ${c21.length}`);
log(`Remax: ${remax.length}`);
log(`Suma cruda: ${all.length}`);
log(`Únicos (dedup GPS cross-portal): ${unicos.length}`);
log(`\nEn la BD tenemos ~118 alquileres ZN activos.`);
log(`Portal en vivo (únicos): ${unicos.length}`);

const fs = await import('node:fs');
fs.writeFileSync(new URL('./sonda-alquiler-zn-resultado.json', import.meta.url), JSON.stringify({ c21: c21.length, remax: remax.length, unicos: unicos.length, props: unicos }, null, 2));
log('\n› Guardado en sonda-alquiler-zn-resultado.json');
