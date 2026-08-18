// Precarga la memoria de rechazos (por URL) desde los materiales YA procesados.
// One-off: adelanta una noche el efecto del fix. No inventa nada — lee las URLs
// reales de los materiales que el pipeline ya guardó en output/.
// Uso:  node precargar-rechazos.mjs [--apply]
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const OUT = `${ROOT}/scripts/deptos-equipetrol/output`;
const APPLY = process.argv.includes('--apply');

// 🔴 GUARDA CRÍTICA: una URL que HOY está en shadow fue ACEPTADA en alguna corrida
// posterior al rechazo, así que NO debe entrar a la memoria de rechazos.
// Caso real que la motivó: el aviso C21 `112448` (Nano Tec) se rechazó por gate 10
// noches seguidas por un ejemplo mal congelado en el spec; el 31-jul, con el spec
// corregido (aviso MIXTO → aceptar), entró al feed. Precargarlo lo habría sacado
// de nuevo por 30 días — el "descartar de más" que este fix existe para evitar.
const { data: enShadow } = await sb.from('propiedades_v2').select('url');
const URLS_ACEPTADAS = new Set((enShadow || []).map((r) => r.url).filter(Boolean));

// Copia EXACTA del criterio de cargar-deptos-shadow.mjs:380-387.
// La basura estructural (baulera/parqueo suelto) NO va a rechazados: se materializa
// como fila de DESCARTE en shadow, así que ya la filtra `urlsShadow`.
const _RE_OTRA_OP = /\btipead|alquiler|anticr[eé]tico/i;
const _RE_ANEXO = /\b(baulera|parqueo|garaje|dep[oó]sito)\b/i;
const esBasuraEstructural = (v) => {
  const r = v?.razon_gate || '';
  if (_RE_OTRA_OP.test(r)) return false;
  const area = v?.area_m2 ?? null;
  return _RE_ANEXO.test(r) || (area != null && area < 20);
};

const fechaDe = (doc, nombre) => {
  const g = doc?.generado && String(doc.generado).slice(0, 10);
  if (g && /^\d{4}-\d{2}-\d{2}$/.test(g)) return g;
  const m = nombre.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

const archivos = readdirSync(OUT).filter((f) => /^material-(alq-)?nuevas-.*\.json$/.test(f)).sort();
const buckets = { venta: new Map(), alquiler: new Map() };
let materiales = 0, sinVeredicto = 0, basura = 0, sinUrl = 0;
const rescatadas = [];   // rechazadas alguna vez, pero HOY están en shadow → NO precargar

for (const f of archivos) {
  let doc;
  try { doc = JSON.parse(readFileSync(join(OUT, f), 'utf8')); } catch { continue; }
  if (!Array.isArray(doc?.entradas)) continue;
  materiales++;
  const op = /^material-alq-/.test(f) ? 'alquiler' : 'venta';
  const fecha = fechaDe(doc, f);
  for (const e of doc.entradas) {
    const v = e?.veredicto;
    if (!v) { sinVeredicto++; continue; }
    if (v.gate !== 'rechazar') continue;
    if (esBasuraEstructural(v)) { basura++; continue; }
    const url = e?._apply?.url ?? e?.url ?? null;
    if (!url) { sinUrl++; continue; }
    if (URLS_ACEPTADAS.has(url)) { rescatadas.push({ url, razon: v.razon_gate, op }); continue; }
    const b = buckets[op];
    const ya = b.get(url);
    b.set(url, {
      url, id: e.id ?? ya?.id ?? null,
      razon: v.razon_gate ?? ya?.razon ?? null,
      primera_vez: ya?.primera_vez && ya.primera_vez < fecha ? ya.primera_vez : (fecha ?? ya?.primera_vez ?? null),
      ultima_vez: ya?.ultima_vez && ya.ultima_vez > fecha ? ya.ultima_vez : (fecha ?? ya?.ultima_vez ?? null),
      veces: (ya?.veces ?? 0) + 1,
      origen: 'precarga-2026-08-02',
    });
  }
}

console.log(`\n📂 ${materiales} materiales leídos de output/`);
console.log(`   descartados del conteo: ${basura} basura estructural (ya son DESCARTE en shadow) · ${sinUrl} sin URL · ${sinVeredicto} sin veredicto`);
if (rescatadas.length) {
  const u = [...new Map(rescatadas.map((r) => [r.url, r])).values()];
  console.log(`\n   🛟 ${u.length} aviso(s) NO se precargan: fueron rechazados alguna vez pero HOY ESTÁN EN SHADOW`);
  console.log(`      (o sea: una corrida posterior los aceptó — precargarlos los sacaría del feed)`);
  for (const r of u) console.log(`      · [${r.op}] ${r.url.replace(/^https?:\/\/[^/]+\//, '')}`);
}
console.log('');

for (const [op, file] of [['venta', 'rechazados.json'], ['alquiler', 'rechazados-alquiler.json']]) {
  const path = join(OUT, file);
  const nuevas = buckets[op];
  let prev = { version: 2, entradas: [] };
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    prev = Array.isArray(raw)
      ? { version: 2, entradas: raw.map((id) => ({ id, url: null })) }   // v1 → se conserva
      : raw;
  }
  const porClave = new Map();
  for (const e of prev.entradas || []) porClave.set(e.url || `id:${e.id}`, e);
  let agregadas = 0, yaEstaban = 0;
  for (const [url, e] of nuevas) {
    if (porClave.has(url)) { yaEstaban++; continue; }
    porClave.set(url, e); agregadas++;
  }
  const entradas = [...porClave.values()];
  const repetidos = [...nuevas.values()].filter((e) => e.veces > 1);

  console.log(`── ${op} (${file})`);
  console.log(`   antes: ${(prev.entradas || []).length} entradas (${(prev.entradas || []).filter((e) => e.url).length} con URL)`);
  console.log(`   URLs de rechazo encontradas en los materiales: ${nuevas.size}  → ${agregadas} nuevas, ${yaEstaban} ya estaban`);
  if (repetidos.length) {
    console.log(`   🔁 ${repetidos.length} aviso(s) rechazados en MÁS DE UNA corrida (la prueba del bug):`);
    for (const r of repetidos.sort((a, b) => b.veces - a.veces).slice(0, 8)) {
      console.log(`      ${r.veces}× ${r.url.replace(/^https?:\/\/[^/]+\//, '')}  [${(r.razon || '').slice(0, 55)}]`);
    }
  }
  console.log(`   después: ${entradas.length} entradas (${entradas.filter((e) => e.url).length} con URL)`);
  if (APPLY) {
    writeFileSync(path, JSON.stringify({ version: 2, actualizado: new Date().toISOString().slice(0, 10), entradas }, null, 1));
    console.log(`   ✅ escrito\n`);
  } else {
    console.log(`   (dry-run — pasar --apply para escribir)\n`);
  }
}
