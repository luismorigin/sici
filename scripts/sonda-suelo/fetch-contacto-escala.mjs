// Fetch del CONTACTO del captador (+ precio C21 entity) para las casas a escalar.
// C21: {url}?json=true -> entity (campos planos). Remax: HTML -> data-page -> props.agent.
// Uso: node fetch-contacto-escala.mjs [sublote]   (sin arg = todas)
import fs from 'node:fs';
const DIR = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const casas = JSON.parse(fs.readFileSync(`${DIR}/lote-escala-casas.json`, 'utf8'));
const soloSub = process.argv[2] != null ? Number(process.argv[2]) : null;
const objetivo = soloSub != null ? casas.filter((c) => c.sublote === soloSub) : casas;

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const telNorm = (t) => {
  if (!t) return null;
  let d = String(t).replace(/[^0-9]/g, '');
  if (d.startsWith('591')) d = d.slice(3);
  d = d.replace(/^0+/, '');
  return d.length >= 7 ? `+591${d}` : null;
};
const decodeEnt = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

// C21 entity tiene precio/precioVenta cuyo significado VARIA (uno USD, otro BOB, a veces corrupto:
// caso 3040 entity.precio=17959 basura vs precioVenta=125000 real; caso idx5 precio=250000 USD vs precioVenta=1740000 BOB).
// No confiar en ninguno solo: elegir el candidato con $/m2 coherente (rango casas ZN ~400-2500). El texto manda; esto es respaldo.
function pickPrecioC21(e) {
  const m2 = Number(e.m2C) || Number(e.m2T) || 0;
  const cand = [Number(e.precio), Number(e.precioVenta), Number(e.precioVenta) / 6.96].filter((v) => v > 1000);
  if (!m2) return cand.sort((a, b) => b - a)[0] ?? null; // sin area: el mayor plausible
  const coherente = cand.filter((v) => v / m2 >= 400 && v / m2 <= 2500);
  return (coherente.length ? coherente.sort((a, b) => b - a)[0] : (cand.sort((a, b) => b - a)[0] ?? null));
}
async function c21(url) {
  const r = await fetch(`${url}?json=true`, { headers: UA });
  const j = await r.json();
  const e = j.entity || j.data?.entity || j;
  const nombre = [e.usname, e.apellidoP, e.apellidoM].filter(Boolean).join(' ').trim() || e.asesor?.nombre || null;
  const tel = telNorm(e.whatsapp || e.usuatelMovil || e.asesor?.whatsapp || e.asesor?.celular);
  return {
    agente_nombre: nombre, agente_telefono: tel,
    url_whatsapp: tel ? `https://wa.me/${tel.replace('+', '')}` : null,
    oficina_nombre: e.nombreOfna || e.oficina?.nombre || null,
    contacto_visible: e.mostrarTelCelularEnInternet !== false,
    precio_fuente_usd: pickPrecioC21(e),                  // candidato coherente por $/m2 (no e.precio crudo)
    precio_c21_diag: { precio: e.precio, precioVenta: e.precioVenta, m2C: e.m2C }, // diagnostico
  };
}
async function remax(url) {
  const r = await fetch(url, { headers: UA });
  const html = await r.text();
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) throw new Error('sin data-page');
  const props = JSON.parse(decodeEnt(m[1])).props;
  const a = props.agent || props.listing?.agents?.[0] || {};
  const tel = telNorm(a.user?.phone_number);
  return {
    agente_nombre: a.user?.name_to_show || [a.user?.first_name, a.user?.last_name].filter(Boolean).join(' ') || null,
    agente_telefono: tel,
    url_whatsapp: tel ? `https://wa.me/${tel.replace('+', '')}` : null,
    oficina_nombre: a.office?.name || null,
    contacto_visible: true,
    precio_fuente_usd: props.listing?.price != null ? Number(props.listing.price) : null,
  };
}

const out = [];
let ok = 0, fail = 0;
for (const c of objetivo) {
  try {
    const data = c.fuente === 'c21' ? await c21(c.url) : await remax(c.url);
    out.push({ idx: c.idx, url: c.url, fuente: c.fuente, ...data, fetch_ok: !!data.agente_telefono });
    if (data.agente_telefono) ok++; else fail++;
  } catch (err) {
    out.push({ idx: c.idx, url: c.url, fuente: c.fuente, fetch_ok: false, error: String(err.message) });
    fail++;
  }
  await new Promise((res) => setTimeout(res, 250));
}
const suf = soloSub != null ? `-sub${soloSub}` : '-all';
fs.writeFileSync(`${DIR}/contacto-escala${suf}.json`, JSON.stringify(out, null, 1), 'utf8');
console.log(`Procesadas: ${out.length} | con tel: ${ok} | sin/fallo: ${fail} -> contacto-escala${suf}.json`);
