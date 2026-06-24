// Extracción BARATA de nombre-candidato de condominio (slug + primeras líneas) para las 264 casas ZN.
// El regex NO es el juez — solo provee el string; el juez es matchear_condominio() (SQL) + el LLM en dudosos.
// Baja detalle (con cache), extrae candidato, escribe candidatos.json + matchear-casas-zn.sql.
// Uso: node enrich-casas-zn.mjs
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { c21Detalle, remaxDetalle } from './lib/portales.mjs';
import { sleep } from './lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const casas = JSON.parse(readFileSync(join(__dirname, 'output/2026-06-18-15-40-53/raw/casas.json')))
  .filter(c => c.zona === 'zona-norte' && c.unico && c.url);

// cache: reusar detalles ya bajados (los 30 de casas-zn-detalle.json + corridas previas de este script)
const cache = {};
for (const f of ['casas-zn-detalle.json', 'casas-zn-full.json']) {
  const p = join(__dirname, f);
  if (existsSync(p)) for (const d of JSON.parse(readFileSync(p))) if (d.url && d.descripcion != null) cache[d.url] = d.descripcion;
}

// --- extractor de nombre-candidato (heurístico, tolerante a ruido; el matcher filtra) ---
const RUIDO_FIN = /\s*(?:,|\.|\n|\r|\(|"|·|\||-|–|:|;|km\b|zona\b|santa\s*cruz|ubicad|de\s+\d|con\s+\d|\d{2,}\s*m|townhouse|av\.|avenida|entre\s|ingres|por\s+mainter).*/iu;
const STOP_INI = /^(?:cerrado|privado|exclusivo|residencial|el|la|los|las|de|del)\s+/iu;
function extraerNombre(slug, desc) {
  // NFKC convierte el unicode "bold" de Remax (𝐂𝐨𝐧𝐝…) a ASCII; minúsculas de slug a espacios
  const blob = (slug.replace(/[-_]/g, ' ') + ' . ' + (desc || '').slice(0, 240)).normalize('NFKC');
  const m = blob.match(/(?:condomin\w*|cond\.|conjunto|urbanizaci[oó]n|urb\.|barrio)[\s:."'`]+([\p{L}\p{N}][\p{L}\p{N}\s.]{2,40})/iu);
  if (!m) return '';
  let n = m[1].trim();
  for (let i = 0; i < 2; i++) n = n.replace(STOP_INI, '').trim();   // quitar "cerrado/privado/el/la…" hasta 2x
  n = n.replace(RUIDO_FIN, '').replace(/\s+/g, ' ').trim();          // cortar ruido + colapsar espacios/saltos
  return n.length >= 3 ? n : '';
}

// --- bajar detalle faltante + extraer ---
const out = [];
let bajados = 0;
for (const [i, c] of casas.entries()) {
  let desc = cache[c.url];
  if (desc == null) {
    try { const d = c.fuente === 'c21' ? await c21Detalle(c.url) : await remaxDetalle(c.url);
      desc = (d?.descripcion || d?.description_website || d?.marketing_description || '').trim(); }
    catch { desc = ''; }
    bajados++; await sleep(800);
    if (bajados % 25 === 0) console.log(`  …bajados ${bajados}`);
  }
  const slug = c.url.split('/').pop();
  out.push({ idx: i, fuente: c.fuente, url: c.url, lat: c.lat, lon: c.lon,
    area_const_m2: c.area_const_m2, dorms: c.dorms, precio_raw: c.precio_raw, moneda: c.moneda,
    descripcion: desc, nombre_candidato: extraerNombre(slug, desc) });
}

writeFileSync(join(__dirname, 'casas-zn-full.json'), JSON.stringify(out, null, 2));

// --- generar SQL del matcher (LEFT JOIN LATERAL para ver también las sin match) ---
const esc = s => (s || '').replace(/'/g, "''");
const filas = out.map(c => `  (${c.idx}, ${c.lat}, ${c.lon}, '${esc(c.nombre_candidato)}')`).join(',\n');
const sql = `-- Matcher sobre las ${out.length} casas ZN (nombre-candidato del slug/1ª línea). Read-only.
WITH casas(idx, lat, lon, nombre) AS (VALUES\n${filas}\n)
SELECT c.idx, c.nombre AS candidato, m.nombre_oficial AS condominio, m.metodo, m.score, m.distancia_m, m.n_en_radio
FROM casas c
LEFT JOIN LATERAL matchear_condominio(c.lat, c.lon, NULLIF(c.nombre,'')) m ON true
ORDER BY m.score DESC NULLS LAST, c.idx;`;
writeFileSync(join(__dirname, 'matchear-casas-zn.sql'), sql);

// SQL reducido: solo las que tienen nombre-candidato (validan el matcher por nombre)
const conN = out.filter(c => c.nombre_candidato);
const filasN = conN.map(c => `  (${c.idx}, ${c.lat}, ${c.lon}, '${esc(c.nombre_candidato)}')`).join(',\n');
const sqlN = `-- Matcher sobre las ${conN.length} casas ZN CON nombre-candidato. Read-only.
WITH casas(idx, lat, lon, nombre) AS (VALUES\n${filasN}\n)
SELECT m.metodo,
  CASE WHEN m.score>=0.85 THEN 'A_fuerte' WHEN m.score>=0.55 THEN 'B_aprox'
       WHEN m.score>=0.30 THEN 'C_gps_ambiguo' ELSE 'D_otro' END AS bucket,
  COUNT(*) AS n, string_agg(DISTINCT m.nombre_oficial, ', ' ORDER BY m.nombre_oficial) AS condominios
FROM casas c LEFT JOIN LATERAL matchear_condominio(c.lat, c.lon, NULLIF(c.nombre,'')) m ON true
GROUP BY 1,2 ORDER BY 2,1;`;
writeFileSync(join(__dirname, 'matchear-con-nombre.sql'), sqlN);

const conNombre = out.filter(c => c.nombre_candidato).length;
console.log(`\n💾 casas-zn-full.json (${out.length} casas, ${bajados} bajados ahora)`);
console.log(`   nombre-candidato extraído: ${conNombre}/${out.length} (${Math.round(100*conNombre/out.length)}%)`);
console.log(`   matchear-casas-zn.sql generado → correr vía MCP`);
