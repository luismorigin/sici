// ============================================================================
// SONDEO casa × ALQUILER × Zona Norte — ¿cuántas hay discoverable? (read-only)
// ----------------------------------------------------------------------------
// Exploratorio: NO escribe BD, NO toca la lib de venta. Pega a C21 (operacion_alquiler)
// y Remax (filtro alquiler) sobre el polígono ZN para estimar volumen del tile.
//   node sondeo-alquiler-zn.mjs
// ============================================================================
import { bboxDe, enZona } from '../sonda-suelo/lib/zonas.mjs';
import { fetchRetry, pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';

const ZONA = 'zona-norte', STEP = 0.02, TC = 6.96;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const log = (m) => console.log(m);

async function c21Alquiler() {
  const b = bboxDe(ZONA), cuad = [];
  for (let lat = b.S; lat < b.N; lat += STEP) for (let lon = b.O; lon < b.E; lon += STEP)
    cuad.push({ N: Math.min(lat + STEP, b.N), E: Math.min(lon + STEP, b.E), S: lat, O: lon });
  const vistos = new Set(), out = [];
  for (const [idx, c] of cuad.entries()) {
    if (circuit.tripped) { log(`    🛑 C21: circuit breaker (${circuit.fails} fallos) — corte (IP probablemente bloqueada; conteo parcial)`); break; }
    const coord = `coordenadas_${c.N.toFixed(6)},${c.E.toFixed(6)},${c.S.toFixed(6)},${c.O.toFixed(6)}`;
    const url = `https://c21.com.bo/v/resultados/tipo_casa/operacion_renta/layout_mapa/${coord},15?json=true`; // C21 usa operacion_RENTA (no alquiler)
    const j = await fetchRetry(url, { json: true, headers: { accept: 'application/json', cookie: `PHPSESSID=sondeo_${Math.random().toString(36).slice(2, 10)}` } });
    let props = []; if (Array.isArray(j)) props = j; else if (j?.results) props = j.results; else if (j?.datas?.results) props = j.datas.results;
    for (const p of props) {
      const id = String(p.id ?? ''); if (!id || vistos.has(id)) continue; vistos.add(id);
      out.push({ fuente: 'century21', lat: parseFloat(p.lat), lon: parseFloat(p.lon), precio_raw: num(p.precio), moneda: (p.moneda || '').toUpperCase(), url: p.urlCorrectaPropiedad ? `https://c21.com.bo${p.urlCorrectaPropiedad}` : null });
    }
    if ((idx + 1) % 15 === 0) log(`    C21 alquiler: ${idx + 1}/${cuad.length} cuadrantes, ${out.length} props`);
    await pace(1500);
  }
  return out;
}

async function remaxAlquiler() {
  const out = [];
  for (let page = 1; page <= 60; page++) {
    if (circuit.tripped) { log(`    🛑 Remax: circuit breaker (${circuit.fails} fallos) — corte (conteo parcial)`); break; }
    const j = await fetchRetry(`https://remax.bo/api/search/casa/santa-cruz-de-la-sierra?page=${page}`, { json: true });
    const data = j?.data ?? []; if (!data.length) { log(`    Remax alquiler: fin pág ${page}`); break; }
    for (const p of data) {
      const op = (p.transaction_type?.name || '').toLowerCase(); if (!op.includes('alquiler')) continue;
      out.push({ fuente: 'remax', lat: parseFloat(p.location?.latitude), lon: parseFloat(p.location?.longitude), precio_raw: num(p.price?.amount), precio_usd: num(p.price?.price_in_dollars), moneda: p.price?.currency_id === 1 ? 'BOB' : 'USD', url: p.slug ? `https://remax.bo/propiedad/${p.slug}` : null });
    }
    if (page % 10 === 0) log(`    Remax alquiler: ${page} págs, ${out.length} props`);
    await pace(1200);
  }
  return out;
}

// ---------- main ----------
log(`\n🔎 SONDEO casa × alquiler × ${ZONA} (read-only, exploratorio)\n`);
log('1) C21 (operacion_renta, cuadrantes bbox ZN)…');
const c21 = await c21Alquiler();
log('2) Remax (filtro alquiler, SC completo)…');
const remax = await remaxAlquiler();

// Diagnóstico por fuente: total crudo · con GPS · en polígono ZN · sin GPS (se perderían)
function diag(arr) {
  const conGps = arr.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  const enZN = conGps.filter(p => p.url && enZona(p.lat, p.lon, ZONA));
  return { total: arr.length, conGps: conGps.length, sinGps: arr.length - conGps.length, enZN: enZN.length, znRows: enZN };
}
const dC21 = diag(c21), dRemax = diag(remax);
const znAll = [...dC21.znRows, ...dRemax.znRows];
const byUrl = new Map(); for (const p of znAll) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
const u = [...byUrl.values()];
const precios = u.map(p => p.moneda === 'USD' && p.precio_raw ? p.precio_raw * TC : p.precio_raw).filter(Boolean).sort((a, b) => a - b);
const med = precios.length ? precios[Math.floor(precios.length / 2)] : null;

log('\n' + '='.repeat(60));
log(`  DIAGNÓSTICO POR FUENTE (crudo → con GPS → en ZN · sin GPS=perdidas)`);
log(`   C21 (bbox ZN):  ${dC21.total} crudo · ${dC21.conGps} con GPS · ${dC21.enZN} en ZN · ${dC21.sinGps} sin GPS`);
log(`   Remax (SC):     ${dRemax.total} crudo · ${dRemax.conGps} con GPS · ${dRemax.enZN} en ZN · ${dRemax.sinGps} sin GPS`);
log(`   ⚠️ Bien Inmuebles: NO incluido aún (3er portal de alquiler — falta sumar)`);
log(`\n  CASAS ALQUILER ZN (C21+Remax, únicas por URL): ${u.length}`);
if (med) log(`   alquiler mensual aprox (Bs): mediana ~${Math.round(med).toLocaleString('en-US')} · rango ${Math.round(precios[0]).toLocaleString('en-US')}–${Math.round(precios[precios.length - 1]).toLocaleString('en-US')}`);
log(`\n  Muestra (6):`);
u.slice(0, 6).forEach(p => log(`   - ${p.fuente} · ${p.precio_raw ? (p.moneda || '?') + ' ' + p.precio_raw.toLocaleString('en-US') : 's/precio'} · ${p.url}`));
log('='.repeat(60) + '\n');
