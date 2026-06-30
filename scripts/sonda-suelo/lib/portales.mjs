// Adaptadores C21 + Remax: listado (volumen) y detalle (campos ricos).
import { fetchRetry, sleep, pace, circuit } from './fetcher.mjs';
import { bboxDe } from './zonas.mjs';

const TC = 6.96; // TC oficial para conversión BOB→USD del listado (aproximado; el detalle refina)
const STEP = 0.02;
export const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

// ---------------- CENTURY21 ----------------
const C21_HEADERS = () => ({
  'accept': 'application/json, text/plain, */*',
  'accept-language': 'es-US,es-419;q=0.9,es;q=0.8',
  'cookie': `PHPSESSID=sici_sonda_${Math.random().toString(36).slice(2, 12)}`,
});

export async function c21Listado(zonaKey, tipo, { rateMs = 1500, log = () => {} } = {}) {
  const b = bboxDe(zonaKey);
  const cuadrantes = [];
  for (let lat = b.S; lat < b.N; lat += STEP)
    for (let lon = b.O; lon < b.E; lon += STEP)
      cuadrantes.push({ N: Math.min(lat + STEP, b.N), E: Math.min(lon + STEP, b.E), S: lat, O: lon });

  const vistos = new Set(), out = [];
  for (const [idx, c] of cuadrantes.entries()) {
    if (circuit.tripped) { log(`    🛑 C21 ${zonaKey}/${tipo}: circuit breaker (${circuit.fails} fallos seguidos) — corte temprano, IP probablemente bloqueada`); break; }
    const coord = `coordenadas_${c.N.toFixed(6)},${c.E.toFixed(6)},${c.S.toFixed(6)},${c.O.toFixed(6)}`;
    const url = `https://c21.com.bo/v/resultados/tipo_${tipo}/operacion_venta/layout_mapa/${coord},15?json=true`;
    const j = await fetchRetry(url, { json: true, headers: C21_HEADERS() });
    let props = [];
    if (Array.isArray(j)) props = j; else if (j?.results) props = j.results; else if (j?.datas?.results) props = j.datas.results;
    for (const p of props) {
      const id = String(p.id ?? '');
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
      const moneda = (p.moneda || '').toUpperCase();
      const raw = num(p.precio);
      out.push({
        fuente: 'c21', id, lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
        area_terreno_m2: num(p.m2T), area_const_m2: num(p.m2C),
        dorms: num(p.recamaras), banos: num(p.banos), garage: num(p.estacionamientos),
        precio_raw: raw, moneda: moneda || null,
        precio_usd: raw ? (moneda === 'BOB' ? Math.round(raw / TC) : raw) : null,
        tipo_portal: p.tipoPropiedad ?? null,
        url: p.urlCorrectaPropiedad ? `https://c21.com.bo${p.urlCorrectaPropiedad}` : null,
      });
    }
    if ((idx + 1) % 15 === 0) log(`    C21 ${zonaKey}/${tipo}: ${idx + 1}/${cuadrantes.length} cuadrantes, ${out.length} props`);
    await pace(rateMs);
  }
  return out;
}

export async function c21Detalle(url) {
  const j = await fetchRetry(url + '?json=true', { json: true, headers: C21_HEADERS() });
  const e = j?.entity;
  if (!e) return null;
  const fotos = Array.isArray(j.fotos) ? j.fotos.length : Array.isArray(j.fotosNew) ? j.fotosNew.length : null;
  return {
    descripcion: e.descripcion || j.descripcionMeta || '',
    metrosFrente: num(e.metrosFrente), metrosFondo: num(e.metrosFondo),
    tipoTerreno: e.tipoTerreno || null, // "regular" | "esquina" | ...
    m2T: num(e.m2T), m2C: num(e.m2C),
    dorms: num(e.recamaras), banos: num(e.banos), garage: num(e.estacionamientos),
    jardin_m2: num(e.m2Jardin),
    precioVenta: num(e.precioVenta), moneda: e.moneda || null, precioFormat: e.precioFormat || null,
    amenities: e.amenitiesTxt || null, fotos,
  };
}

// ---------------- REMAX ----------------
// Trae TODO Santa Cruz por tipo (el filtro por zona se aplica afuera con GPS).
export async function remaxListadoSC(tipo, { rateMs = 1200, maxPages = 60, log = () => {} } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    if (circuit.tripped) { log(`    🛑 Remax ${tipo}: circuit breaker (${circuit.fails} fallos seguidos) — corte temprano, IP probablemente bloqueada`); break; }
    const j = await fetchRetry(`https://remax.bo/api/search/${tipo}/santa-cruz-de-la-sierra?page=${page}`, { json: true });
    const data = j?.data ?? [];
    if (!data.length) { log(`    Remax ${tipo}: fin en pág ${page} (${out.length} props SC)`); break; }
    for (const p of data) {
      const op = (p.transaction_type?.name || '').toLowerCase();
      if (!op.includes('venta')) continue;
      const lat = parseFloat(p.location?.latitude), lon = parseFloat(p.location?.longitude);
      const cur = p.price?.currency_id;
      const li = p.listing_information || {};
      out.push({
        fuente: 'remax', id: String(p.MLSID ?? ''),
        lat: Number.isFinite(lat) ? lat : null, lon: Number.isFinite(lon) ? lon : null,
        area_terreno_m2: num(li.land_m2), area_const_m2: num(li.construction_area_m),
        dorms: num(li.number_bedrooms), banos: num(li.number_bathrooms), garage: num(li.number_parking),
        precio_raw: num(p.price?.amount), moneda: cur === 1 ? 'BOB' : cur === 2 ? 'USD' : null,
        precio_usd: num(p.price?.price_in_dollars),
        tipo_portal: li.subtype_property?.name ?? null,
        quality_score: num(p.quality_score),
        url: p.slug ? `https://remax.bo/propiedad/${p.slug}` : null,
      });
    }
    if (page % 10 === 0) log(`    Remax ${tipo}: ${page} págs, ${out.length} props venta`);
    await pace(rateMs);
  }
  return out;
}

// Remax expone 2 campos de texto: description_website (principal) y
// marketing_description (copy secundario, a veces duplicado o con data vieja —
// ej. precio desactualizado). Evitar concatenar a ciegas (duplica/mezcla):
//   - si uno contiene al otro → el más largo
//   - si son distintos → priorizar description_website (el actualizado)
function elegirDescRemax(website, marketing) {
  const w = (website || '').trim();
  const m = (marketing || '').trim();
  if (!w) return m;
  if (!m) return w;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, '');
  const nw = norm(w), nm = norm(m);
  if (nw.includes(nm)) return w;
  if (nm.includes(nw)) return m;
  return w; // distintos: el principal manda (marketing suele estar desactualizado)
}

export async function remaxDetalle(url) {
  const html = await fetchRetry(url, { json: false });
  if (!html) return null;
  const m = html.match(/data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const dec = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const obj = JSON.parse(dec);
    const l = obj?.props?.listing;
    if (!l) return null;
    const li = l.listing_information || {};
    const fotos = Array.isArray(l.multimedias) ? l.multimedias.length : null;
    return {
      descripcion: elegirDescRemax(l.description_website, l.marketing_description),
      metrosFrente: null, metrosFondo: null, tipoTerreno: null,
      m2T: num(li.land_m2), m2C: num(li.construction_area_m),
      dorms: num(li.number_bedrooms), banos: num(li.number_bathrooms), garage: num(li.number_parking),
      jardin_m2: null,
      precioVenta: null, moneda: null, precioFormat: null, amenities: null, fotos,
    };
  } catch { return null; }
}
