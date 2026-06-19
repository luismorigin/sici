// Sonda PASO 0+ — Suciedad del TEXTO del anuncio (terrenos ZN). $0, sin LLM, sin Firecrawl.
// Lee probe-output-zona-norte.json, baja og:description de una muestra y mide:
//  (a) presencia de atributos de desarrollador (frente×fondo, uso de suelo, esquina, demolible, servicios)
//  (b) suciedad de MONEDA: anuncios donde el texto dice USD pero el JSON los marcó BOB (o viceversa)

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const MUESTRA_POR_FUENTE = { c21: 30, remax: 20 };

const data = JSON.parse(readFileSync(join(__dirname, 'probe-output-zona-norte.json'), 'utf8'));
const conUrl = data.listings.filter(p => p.dentro_zona && p.url);

// muestreo determinista (cada N-ésimo) por fuente
function muestrear(fuente, n) {
  const arr = conUrl.filter(p => p.fuente === fuente);
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}
const muestra = [...muestrear('c21', MUESTRA_POR_FUENTE.c21), ...muestrear('remax', MUESTRA_POR_FUENTE.remax)];

async function ogDesc(url) {
  try {
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    const html = await r.text();
    const grab = (re) => { const m = html.match(re); return m ? m[1] : null; };
    const d = grab(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i)
           || grab(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i);
    return d ? d.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#039;/g, "'") : null;
  } catch { return null; }
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const has = (t, re) => re.test(t);

// detectores
const reFrenteFondo = /\d{1,3}([.,]\d+)?\s*[x×]\s*\d{1,3}([.,]\d+)?/;          // "7.67 x 26.49"
const reFrenteWord  = /frente\D{0,12}\d|de\s+frente|metros?\s+de\s+frente/;
const reUso         = /ideal para construir|uso de suelo|zonifica|construible|patron de asentamiento|comercial|residencial|edificable/;
const reEsquina     = /esquina/;
const reDemol       = /demol|a demoler|precio de terreno|para construir|casa vieja|casa antigua/;
const reServicios   = /agua|luz|alcantarillado|servicios basicos|energia electrica|cordon|pavimento/;
const reUSD         = /\$us|us\$|us\s*\$|d[o]lares|dolares|\busd\b/;
const reBOB         = /\bbs\.?\b|bolivianos/;
const reTC          = /\btc\s*\d|tipo de cambio|paralelo/;

const filas = [];
console.log(`\n🛰️  Suciedad de texto · ${muestra.length} terrenos ZN (${MUESTRA_POR_FUENTE.c21} C21 + ${MUESTRA_POR_FUENTE.remax} Remax)\n`);
for (const [i, p] of muestra.entries()) {
  const desc = await ogDesc(p.url);
  const t = desc ? norm(desc) : '';
  filas.push({
    fuente: p.fuente, id: p.id, url: p.url,
    moneda_json: p.moneda, precio_usd_json: p.precio_usd,
    descRecuperada: !!desc, len: desc?.length || 0,
    frenteFondo: !!desc && (has(t, reFrenteFondo) || has(t, reFrenteWord)),
    uso: !!desc && has(t, reUso),
    esquina: !!desc && has(t, reEsquina),
    demolible: !!desc && has(t, reDemol),
    servicios: !!desc && has(t, reServicios),
    txtUSD: !!desc && has(t, reUSD),
    txtBOB: !!desc && has(t, reBOB),
    txtTC: !!desc && has(t, reTC),
    desc: desc || null,
  });
  if ((i + 1) % 10 === 0) console.log(`  …${i + 1}/${muestra.length}`);
  await sleep(800);
}

// ---- métricas ----
const pct = (arr, f) => { const ok = arr.filter(f); return arr.length ? Math.round(100 * ok.length / arr.length) : 0; };
function bloque(label, arr) {
  const rec = arr.filter(x => x.descRecuperada);
  console.log(`\n── ${label} (${arr.length} muestreados, ${rec.length} con descripción recuperada) ──`);
  if (!rec.length) { console.log('  (sin descripciones recuperadas)'); return; }
  console.log(`  frente×fondo o "frente": ${pct(rec, x => x.frenteFondo)}%`);
  console.log(`  uso de suelo / "ideal para construir": ${pct(rec, x => x.uso)}%`);
  console.log(`  esquina   : ${pct(rec, x => x.esquina)}%`);
  console.log(`  demolible / "para construir": ${pct(rec, x => x.demolible)}%`);
  console.log(`  servicios : ${pct(rec, x => x.servicios)}%`);
  console.log(`  menciona USD en texto: ${pct(rec, x => x.txtUSD)}%   ·  menciona Bs: ${pct(rec, x => x.txtBOB)}%   ·  menciona TC: ${pct(rec, x => x.txtTC)}%`);
}
bloque('CENTURY21', filas.filter(x => x.fuente === 'c21'));
bloque('REMAX', filas.filter(x => x.fuente === 'remax'));

// ---- SUCIEDAD DE MONEDA: JSON dice BOB pero texto dice USD ----
const c21rec = filas.filter(x => x.fuente === 'c21' && x.descRecuperada);
const malEtiq = c21rec.filter(x => x.moneda_json === 'BOB' && x.txtUSD && !x.txtBOB);
console.log(`\n🚨 MONEDA C21: ${malEtiq.length}/${c21rec.length} con JSON='BOB' pero texto dice USD (→ subvaluados ~7× por mi conversión)`);
for (const m of malEtiq.slice(0, 5)) {
  console.log(`   · id ${m.id}: JSON $${m.precio_usd_json} (BOB) — texto: "${(m.desc || '').replace(/\s+/g, ' ').slice(0, 110)}…"`);
}

const out = join(__dirname, 'texto-output-zona-norte.json');
writeFileSync(out, JSON.stringify(filas, null, 2));
console.log(`\n💾 → ${out}\n`);
