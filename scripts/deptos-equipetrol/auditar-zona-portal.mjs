// ============================================================================
// auditar-zona-portal.mjs — ¿la zona que guardamos coincide con la que dice el
// portal en el propio aviso?
// ----------------------------------------------------------------------------
// POR QUÉ. El 22-ago lab-kapso encontró la 8001019: un aviso de la zona **Este**
// dentro del inventario de Equipetrol, fijando el piso del panorama del bot en
// 1.800 Bs cuando el real es 2.600.
//
// 🔑 Y la causa NO fue una mala zonificación: `get_zona_by_gps` sobre su GPS
// devuelve Equipetrol Centro, a 400 m del centro. La zona es COHERENTE con el
// GPS — el que miente es el PIN que puso el portal. Por eso ningún chequeo de
// "zona vs GPS" la ve (medido: 5 discrepancias en 1.135 activas, y esa no es una).
//
// La única fuente que la delata es lo que el aviso DICE de sí mismo, y eso no
// está guardado en la base: hay que ir a leerlo. Este script hace eso.
//
// CÓMO
//   · C21   → `?json=true` trae `entity.direccionFormat` ("..., Este, Santa Cruz,
//             Bolivia") y `propiedad.title` ("Alquiler de Departamento en Este,
//             Santa Cruz | ID: 119377").
//   · Remax → la zona ya viene en el SLUG de la URL (`...-sirari-...`,
//             `...-banzer-1er-a-3er-anillo-...`), así que sale GRATIS y sin tocar
//             el portal.
//
// NO JUZGA: extrae y agrupa. El veredicto lo da un humano mirando la salida —
// "Equipetrol", "Equipetrol Noroeste" y "Sirari" son todas legítimas y el script
// no tiene por qué saber el mapa de sinónimos de cada portal.
//
// Uso:  node scripts/deptos-equipetrol/auditar-zona-portal.mjs [--op alquiler|venta] [--limit N]
// Read-only. No escribe en la base.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const OP = arg('--op', 'alquiler');
const LIMIT = parseInt(arg('--limit', '0'), 10);

const VISTA = OP === 'venta' ? 'v_mercado_venta_shadow' : 'v_mercado_alquiler_shadow';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- zona declarada por el portal -----------------------------------------
function zonaDesdeSlugRemax(url) {
  // .../alquiler-departamento-santa-cruz-de-la-sierra-<ZONA>-<idlargo>-<n>
  const m = url.match(/santa-cruz-de-la-sierra-(.+?)-\d{6,}/);
  return m ? m[1].replace(/-/g, ' ') : null;
}

async function zonaDesdeC21(url) {
  const r = await fetch(`${url}?json=true`, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!r.ok) return { error: `HTTP ${r.status}` };
  const j = await r.json();
  const dir = j?.entity?.direccionFormat ?? null;
  const title = j?.propiedad?.title ?? j?.title ?? null;
  // "CALLE X, Este, Santa Cruz, Bolivia, 591" → la parte ANTES de "Santa Cruz"
  let zona = null;
  if (dir) {
    const partes = dir.split(',').map(s => s.trim());
    const i = partes.findIndex(p => /^santa\s*cruz$/i.test(p));
    if (i > 0) zona = partes[i - 1];
  }
  if (!zona && title) {
    const m = title.match(/\ben\s+(.+?),\s*Santa\s*Cruz/i);
    if (m) zona = m[1].trim();
  }
  return { zona, direccionFormat: dir, title };
}

// ---- main ------------------------------------------------------------------
const { data: props, error } = await sb
  .from(VISTA)
  .select('id, zona, fuente, url')
  .eq('zona_general', 'Equipetrol')
  .order('id');
if (error) { console.error('BD:', error.message); process.exit(1); }

const lista = LIMIT > 0 ? props.slice(0, LIMIT) : props;
console.log(`\n🔎 ZONA DEL PORTAL vs ZONA GUARDADA — ${OP} · ${lista.length} propiedades\n`);

const filas = [];
let n = 0;
for (const p of lista) {
  n++;
  let portal = null, extra = {};
  if (p.fuente === 'remax') {
    portal = zonaDesdeSlugRemax(p.url);
    extra = { metodo: 'slug' };
  } else {
    try {
      const r = await zonaDesdeC21(p.url);
      if (r.error) { extra = { metodo: 'fetch', error: r.error }; }
      else { portal = r.zona; extra = { metodo: 'fetch', direccionFormat: r.direccionFormat, title: r.title }; }
    } catch (e) { extra = { metodo: 'fetch', error: e.message }; }
    await sleep(700); // no golpear el portal
  }
  filas.push({ id: p.id, zona_sici: p.zona, zona_portal: portal, fuente: p.fuente, url: p.url, ...extra });
  if (n % 25 === 0) console.log(`   ... ${n}/${lista.length}`);
}

// ---- agrupar por lo que dice el portal --------------------------------------
const porZona = {};
for (const f of filas) {
  const k = (f.zona_portal || '(no se pudo leer)').toLowerCase();
  (porZona[k] ||= []).push(f);
}

console.log('\n── LO QUE DICE EL PORTAL (agrupado) ─────────────────────────────');
Object.entries(porZona)
  .sort((a, b) => b[1].length - a[1].length)
  .forEach(([z, arr]) => console.log(`  ${String(arr.length).padStart(4)}  ${z}`));

console.log('\n── PARA REVISAR: el portal NO menciona Equipetrol/Sirari/Noroeste ──');
const sospechosas = filas.filter(f => {
  const z = (f.zona_portal || '').toLowerCase();
  if (!z) return false;
  return !/equipetrol|sirari|noroeste|nor oeste|brigida|norte/.test(z);
});
if (!sospechosas.length) console.log('  (ninguna)');
sospechosas.forEach(f => {
  console.log(`\n  id ${f.id}  ·  ${f.fuente}`);
  console.log(`     SICI dice   : ${f.zona_sici}`);
  console.log(`     el aviso dice: ${f.zona_portal}`);
  if (f.direccionFormat) console.log(`     direccion    : ${f.direccionFormat}`);
  console.log(`     ${f.url}`);
});

const errores = filas.filter(f => f.error);
if (errores.length) {
  console.log(`\n⚠️  ${errores.length} no se pudieron leer (se declaran, no se ocultan):`);
  errores.slice(0, 10).forEach(f => console.log(`     id ${f.id}  ${f.error}`));
}

const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const file = join(OUT, `auditar-zona-portal-${OP}.json`);
writeFileSync(file, JSON.stringify({ op: OP, total: filas.length, sospechosas: sospechosas.length, errores: errores.length, filas }, null, 2));
console.log(`\n📄 ${file}`);
console.log(`\nRESUMEN: ${filas.length} revisadas · ${sospechosas.length} para revisar · ${errores.length} ilegibles\n`);
