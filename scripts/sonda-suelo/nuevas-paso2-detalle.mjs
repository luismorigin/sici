// Paso 2: fetch DETALLE de las candidatas nuevas → descripción (para MOAT) + contacto + precio fuente.
// Combina con los físicos del listado (que ya venían en la candidata).
import fs from 'node:fs';
const DIR = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const cand = JSON.parse(fs.readFileSync(`${DIR}/nuevas-candidatas.json`, 'utf8'));
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const telNorm = (t) => { if (!t) return null; let d = String(t).replace(/[^0-9]/g, ''); if (d.startsWith('591')) d = d.slice(3); d = d.replace(/^0+/, ''); return d.length >= 7 ? `+591${d}` : null; };
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const idDeUrl = (u) => { const mc = u.match(/c21\.com\.bo\/propiedad\/(\d+)/); if (mc) return `c21:${mc[1]}`; const mr = u.match(/(\d{6,}-\d+)(?:$|\?)/); if (mr) return `remax:${mr[1]}`; return u; };
function pickPrecioC21(e) {
  const m2 = Number(e.m2C) || Number(e.m2T) || 0;
  const c = [Number(e.precio), Number(e.precioVenta), Number(e.precioVenta) / 6.96].filter((v) => v > 1000);
  if (!m2) return c.sort((a, b) => b - a)[0] ?? null;
  const ok = c.filter((v) => v / m2 >= 400 && v / m2 <= 2500);
  return (ok.length ? ok.sort((a, b) => b - a)[0] : (c.sort((a, b) => b - a)[0] ?? null));
}

async function c21(url) {
  const r = await fetch(`${url}?json=true`, { headers: UA }); const j = await r.json();
  const e = j.entity || j.data?.entity || j;
  const tel = telNorm(e.whatsapp || e.usuatelMovil);
  return {
    descripcion: e.descripcion || j.descripcionMeta || '',
    area_const_m2: Number(e.m2C) || null, area_terreno_m2: Number(e.m2T) || null,
    dorms: Number(e.recamaras) || null, banos: Number(e.banios) || null,
    agente_nombre: [e.usname, e.apellidoP, e.apellidoM].filter(Boolean).join(' ').trim() || null,
    agente_telefono: tel, url_whatsapp: tel ? `https://wa.me/${tel.replace('+', '')}` : null,
    oficina_nombre: e.nombreOfna || null, contacto_visible: e.mostrarTelCelularEnInternet !== false,
    precio_fuente_usd: pickPrecioC21(e),
  };
}
async function remax(url) {
  const r = await fetch(url, { headers: UA }); const html = await r.text();
  const m = html.match(/data-page="([^"]+)"/); if (!m) throw new Error('sin data-page');
  const props = JSON.parse(dec(m[1])).props; const l = props.listing || {}; const a = props.agent || {};
  const li = l.listing_information || {};
  const tel = telNorm(a.user?.phone_number);
  return {
    descripcion: l.description_website || l.marketing_description || '',
    area_const_m2: Number(li.construction_area_m) || null, area_terreno_m2: Number(li.land_m2) || null,
    dorms: Number(li.number_bedrooms) || null, banos: Number(li.number_bathrooms) || null,
    agente_nombre: a.user?.name_to_show || null, agente_telefono: tel,
    url_whatsapp: tel ? `https://wa.me/${tel.replace('+', '')}` : null,
    oficina_nombre: a.office?.name || null, contacto_visible: true,
    precio_fuente_usd: l.price != null ? Number(l.price) : null,
  };
}

const out = []; let ok = 0, fail = 0;
for (const c of cand) {
  try {
    const d = c.fuente === 'c21' ? await c21(c.url) : await remax(c.url);
    out.push({
      key: idDeUrl(c.url), url: c.url, fuente: c.fuente, lat: c.lat, lon: c.lon,
      // físicos: detalle > listado
      area_const_m2: d.area_const_m2 ?? c.area_const_m2 ?? null,
      area_terreno_m2: d.area_terreno_m2 ?? c.area_terreno_m2 ?? null,
      dorms: d.dorms ?? c.dorms ?? null, banos: d.banos ?? c.banos ?? null,
      precio_raw: c.precio_raw, moneda: c.moneda, precio_fuente_usd: d.precio_fuente_usd ?? c.precio_usd ?? null,
      descripcion: d.descripcion, agente_nombre: d.agente_nombre, agente_telefono: d.agente_telefono,
      url_whatsapp: d.url_whatsapp, oficina_nombre: d.oficina_nombre, contacto_visible: d.contacto_visible,
      fetch_ok: !!(d.descripcion && d.agente_telefono),
    });
    if (d.agente_telefono) ok++; else fail++;
  } catch (e) { out.push({ key: idDeUrl(c.url), url: c.url, fuente: c.fuente, fetch_ok: false, error: e.message }); fail++; }
  await new Promise((res) => setTimeout(res, 250));
}
fs.writeFileSync(`${DIR}/nuevas-base.json`, JSON.stringify(out, null, 1), 'utf8');
console.log(`Detalle: ${out.length} | con tel: ${ok} | sin/fallo: ${fail}`);
console.log(`con descripción >50: ${out.filter((o) => (o.descripcion || '').length > 50).length}`);
