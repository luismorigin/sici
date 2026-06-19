// Sonda de suelo — PASO 0 (preprueba)
// Zona Norte + terrenos, fuentes C21 + Remax. Standalone, read-only respecto a producción.
// NO toca propiedades_v2, workflows, ni nada del pipeline. Solo GET a APIs públicas + archivo local.
//
// Uso:  node scripts/sonda-suelo/probe.mjs
//       node scripts/sonda-suelo/probe.mjs --zona equipetrol   (cross-check de conteo)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Zonas (bbox) ----------
const ZONAS = {
  'zona-norte': { nombre: 'Zona Norte', N: -17.664008, S: -17.771792, E: -63.111311, O: -63.194850 },
  // Cross-check: bbox aproximado de Equipetrol (del workflow C21 actual) para validar el método
  'equipetrol': { nombre: 'Equipetrol', N: -17.750, S: -17.775, E: -63.185, O: -63.205 },
};

const args = process.argv.slice(2);
const zonaKey = (() => {
  const i = args.indexOf('--zona');
  return i >= 0 && args[i + 1] ? args[i + 1] : 'zona-norte';
})();
const ZONA = ZONAS[zonaKey];
if (!ZONA) { console.error(`Zona desconocida: ${zonaKey}. Opciones: ${Object.keys(ZONAS).join(', ')}`); process.exit(1); }

const TIPO = 'terreno';
const STEP = 0.02;        // ~2.2 km por cuadrante (grid GPS para C21)
const RATE_MS = 2000;     // respeto a servidores públicos
const REMAX_MAX_PAGES = 40;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const inBbox = (lat, lon, z) => lat <= z.N && lat >= z.S && lon <= z.E && lon >= z.O;
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

async function fetchJson(url, headers = {}) {
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (intento === 3) { console.warn(`  ⚠️  fallo (${err.message}) tras 3 intentos: ${url.slice(0, 90)}…`); return null; }
      await sleep(1500);
    }
  }
}

// ---------- C21: grid GPS ----------
async function probeC21(z) {
  const cookie = `PHPSESSID=sici_probe_${Math.random().toString(36).slice(2, 12)}`;
  const headers = {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'es-US,es-419;q=0.9,es;q=0.8,en;q=0.7',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) SICI-Sonda/0.1',
    'cookie': cookie,
  };
  const cuadrantes = [];
  for (let lat = z.S; lat < z.N; lat += STEP) {
    for (let lon = z.O; lon < z.E; lon += STEP) {
      const N = Math.min(lat + STEP, z.N), S = lat, E = Math.min(lon + STEP, z.E), O = lon;
      cuadrantes.push({ N, E, S, O });
    }
  }
  console.log(`  C21: ${cuadrantes.length} cuadrantes (step ${STEP}°)…`);

  const vistos = new Set();
  const out = [];
  for (const [idx, c] of cuadrantes.entries()) {
    const coord = `coordenadas_${c.N.toFixed(6)},${c.E.toFixed(6)},${c.S.toFixed(6)},${c.O.toFixed(6)}`;
    const url = `https://c21.com.bo/v/resultados/tipo_${TIPO}/operacion_venta/layout_mapa/${coord},15?json=true`;
    const json = await fetchJson(url, headers);
    let props = [];
    if (Array.isArray(json)) props = json;
    else if (json?.results) props = json.results;
    else if (json?.datas?.results) props = json.datas.results;

    for (const p of props) {
      const id = String(p.id ?? '');
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
      const moneda = (p.moneda || '').toUpperCase();
      const precioRaw = num(p.precio);
      const precioUsd = precioRaw ? (moneda === 'BOB' ? Math.round(precioRaw / 6.96) : precioRaw) : null;
      out.push({
        fuente: 'c21', id,
        lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
        dentro_zona: Number.isFinite(lat) && Number.isFinite(lon) ? inBbox(lat, lon, z) : false,
        area_terreno_m2: num(p.m2T), area_const_m2: num(p.m2C),
        precio_raw: precioRaw, moneda: moneda || null, precio_usd: precioUsd,
        tipo_portal: p.tipoPropiedad ?? null,
        url: p.urlCorrectaPropiedad ? `https://c21.com.bo${p.urlCorrectaPropiedad}` : null,
      });
    }
    if ((idx + 1) % 10 === 0) console.log(`    …${idx + 1}/${cuadrantes.length} cuadrantes, ${out.length} props únicas`);
    await sleep(RATE_MS);
  }
  return out;
}

// ---------- Remax: todo SC paginado + filtro GPS ----------
async function probeRemax(z) {
  console.log(`  Remax: paginando todo SC (máx ${REMAX_MAX_PAGES} págs), filtrando por GPS…`);
  const out = [];
  let totalSC = 0;
  for (let page = 1; page <= REMAX_MAX_PAGES; page++) {
    const url = `https://remax.bo/api/search/${TIPO}/santa-cruz-de-la-sierra?page=${page}`;
    const json = await fetchJson(url);
    const data = json?.data ?? [];
    if (data.length === 0) { console.log(`    pág ${page} vacía → fin (${totalSC} props SC vistas)`); break; }
    totalSC += data.length;
    for (const p of data) {
      const op = (p.transaction_type?.name || '').toLowerCase();
      if (!(op.includes('venta'))) continue; // descartar alquiler/anticrético colados
      const lat = parseFloat(p.location?.latitude), lon = parseFloat(p.location?.longitude);
      if (!(Number.isFinite(lat) && Number.isFinite(lon) && inBbox(lat, lon, z))) continue;
      const currency = p.price?.currency_id; // 1=BOB, 2=USD
      out.push({
        fuente: 'remax', id: String(p.MLSID ?? ''),
        lat, lon, dentro_zona: true,
        area_terreno_m2: num(p.listing_information?.land_m2), // ← campo CORRECTO de la API search (discovery prod ya corregido 19-jun: land_area_m→land_m2)
        area_const_m2: num(p.listing_information?.construction_area_m),
        precio_raw: num(p.price?.amount), moneda: currency === 1 ? 'BOB' : currency === 2 ? 'USD' : null,
        precio_usd: num(p.price?.price_in_dollars),
        tipo_portal: p.listing_information?.subtype_property?.name ?? p.transaction_type?.name ?? null,
        url: p.slug ? `https://remax.bo/propiedad/${p.slug}` : null,
      });
    }
    await sleep(RATE_MS);
  }
  return out;
}

// ---------- Métricas ----------
const pct = (n, d) => d ? Math.round((100 * n) / d) : 0;
function mediana(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

function resumen(label, props) {
  const dentro = props.filter(p => p.dentro_zona);
  const conArea = dentro.filter(p => p.area_terreno_m2);
  const conPrecio = dentro.filter(p => p.precio_usd);
  const conMoneda = dentro.filter(p => p.moneda);
  const ppm2 = dentro.filter(p => p.precio_usd && p.area_terreno_m2).map(p => Math.round(p.precio_usd / p.area_terreno_m2));
  console.log(`\n  ── ${label} ──`);
  console.log(`  Total devuelto / dentro de zona: ${props.length} / ${dentro.length}`);
  console.log(`  Con área terreno : ${dentro.length ? pct(conArea.length, dentro.length) : 0}%  (${conArea.length})`);
  console.log(`  Con precio USD   : ${dentro.length ? pct(conPrecio.length, dentro.length) : 0}%  (${conPrecio.length})`);
  console.log(`  Con moneda ident.: ${dentro.length ? pct(conMoneda.length, dentro.length) : 0}%`);
  console.log(`  Precio/m² terreno: mediana $${mediana(ppm2) ?? '—'}  (p10 $${mediana(ppm2.slice(0, Math.ceil(ppm2.length/2))) ?? '—'} … n=${ppm2.length})`);
  return { total: props.length, dentro: dentro.length, conArea: conArea.length, conPrecio: conPrecio.length, ppm2_mediana: mediana(ppm2) };
}

// ---------- Main ----------
(async () => {
  console.log(`\n🛰️  SONDA PASO 0 — ${ZONA.nombre} · terrenos · C21 + Remax\n`);
  const c21 = await probeC21(ZONA);
  const remax = await probeRemax(ZONA);

  console.log(`\n${'='.repeat(60)}`);
  const rC21 = resumen('CENTURY21', c21);
  const rRemax = resumen('REMAX', remax);

  const todos = [...c21, ...remax];
  const dentro = todos.filter(p => p.dentro_zona);
  console.log(`\n  ══ TOTAL ${ZONA.nombre} (terrenos, dentro de zona): ${dentro.length} ══`);

  console.log(`\n  Ejemplos (5):`);
  for (const p of dentro.slice(0, 5)) {
    console.log(`   · [${p.fuente}] ${p.area_terreno_m2 ?? '?'}m² · $${p.precio_usd ?? '?'} (${p.moneda ?? '?'}) · ${p.lat?.toFixed(5)},${p.lon?.toFixed(5)}`);
    console.log(`     ${p.url ?? '(sin url)'}`);
  }

  const outFile = join(__dirname, `probe-output-${zonaKey}.json`);
  writeFileSync(outFile, JSON.stringify({ zona: ZONA, generado: new Date().toISOString(), c21: rC21, remax: rRemax, listings: todos }, null, 2));
  console.log(`\n💾 Crudo + métricas → ${outFile}\n`);
})();
