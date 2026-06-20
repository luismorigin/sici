// Consolida escala: lote-escala-casas (fisicos/gps) + contacto-escala-all + moat A-E.
// Aplica precio (BOB->/6.96, USD directo), excluye excluir=true, marca sospechosos. NO carga: reporta.
import fs from 'node:fs';
const DIR = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const R = (f) => JSON.parse(fs.readFileSync(`${DIR}/${f}`, 'utf8'));
const casas = R('lote-escala-casas.json');
const contacto = new Map(R('contacto-escala-all.json').map((c) => [c.idx, c]));
const moat = new Map(['A', 'B', 'C', 'D', 'E'].flatMap((s) => R(`lote-escala-moat-${s}.json`)).map((m) => [m.idx, m]));

const filas = [], excluidas = [], sospechosas = [];
const tcCount = {}, monedaCount = {};
for (const c of casas) {
  const m = moat.get(c.idx), k = contacto.get(c.idx);
  if (!m) { sospechosas.push(`${c.idx}: sin moat`); continue; }
  if (m.excluir) { excluidas.push(c.idx); continue; }
  const moneda = m.precio_moneda || 'USD';
  let precio_usd = moneda === 'BOB'
    ? Math.round((Number(m.precio_valor) / 6.96) * 100) / 100
    : Math.round(Number(m.precio_valor) * 100) / 100;
  let tc = m.tc_detectado || 'no_especificado';
  if (moneda === 'BOB' && tc === 'paralelo') tc = 'no_especificado';
  // validaciones
  if (!precio_usd || precio_usd < 15000) sospechosas.push(`${c.idx}: precio ${precio_usd} (bajo)`);
  if (precio_usd > 2000000) sospechosas.push(`${c.idx}: precio ${precio_usd} (alto)`);
  let area = Number(m.area_construida_m2 ?? c.area_const_m2);
  if (!area || area < 20) area = null;
  tcCount[tc] = (tcCount[tc] || 0) + 1;
  monedaCount[moneda] = (monedaCount[moneda] || 0) + 1;
  filas.push({
    idx: c.idx, url: c.url, fuente: c.fuente, lat: c.lat, lon: c.lon,
    area_total_m2: area, area_terreno_m2: m.area_terreno_m2 ?? null,
    dormitorios: m.dormitorios ?? c.dorms ?? null, banos: m.banos ?? null,
    precio_usd, moneda_original: moneda, tipo_cambio_detectado: tc, depende_de_tc: tc === 'paralelo',
    es_cerrado: m.es_cerrado ?? null, amenidades: Array.isArray(m.amenidades) ? m.amenidades : [],
    estado_construccion: m.estado_construccion ?? null, nombre_condominio_detectado: m.nombre_condominio ?? null,
    agente_nombre: k?.agente_nombre ?? null, agente_telefono: k?.agente_telefono ?? null,
    url_whatsapp: k?.url_whatsapp ?? null, oficina_nombre: k?.oficina_nombre ?? null,
    contacto_visible: k?.contacto_visible ?? null,
  });
}
fs.writeFileSync(`${DIR}/carga-escala-final.json`, JSON.stringify(filas, null, 1), 'utf8');
console.log(`A CARGAR: ${filas.length} | excluidas (anticretico/alquiler): ${excluidas.length} [${excluidas.join(',')}]`);
console.log(`Sin contacto: ${filas.filter((f) => !f.agente_telefono).length}`);
console.log(`TC:`, tcCount);
console.log(`Moneda listado:`, monedaCount);
console.log(`es_cerrado=true: ${filas.filter((f) => f.es_cerrado === true).length}`);
console.log(`\nSOSPECHOSAS (${sospechosas.length}):\n` + sospechosas.join('\n'));
