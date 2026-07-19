// ============================================================================
// VERIFICADOR de alquiler SHADOW (híbrido) — status-code-only + 2 señales
// ----------------------------------------------------------------------------
// Espeja verificador-casas.mjs (el molde que a /cron-deptos le FALTA). Un PASO de
// /cron-deptos-alquiler: corre DESPUÉS del discovery, lee sus `desaparecidas`, y confirma
// las bajas por HTTP en propiedades_v2_shadow (tipo_operacion='alquiler'). AISLADO.
//
// STATUS-CODE-ONLY (como deptos/casas): NUNCA parsea el HTML/JSON del aviso — solo
// mira el código. Inmune a placeholders / mantenimiento / bloqueos (200/403/503 NO
// son baja). C21 → 404/4xx = baja; Remax → 301/302 (redirect manual) = baja.
//
// DOS SEÑALES (una baja necesita AMBAS, sostenidas > gracia):
//   1. ausencia del crawl: la URL activa NO apareció en el discovery de hoy.
//   2. HTTP status-code: GET a la URL, solo el código.
// Gracia 2d (contador en primera_ausencia_at, la prop SIGUE en feed durante la gracia).
// Disyuntor: si > 40% de las activas "desaparecen", el crawl fue parcial → NO baja nada.
//
// SHADOW: escribe SOLO propiedades_v2_shadow (service_role), filtrado a alquiler. La
// tabla shadow NO tiene triggers (LIKE INCLUDING ALL no los copia) → escribir status/
// es_activa es seguro. PROD (n8n) intacto.
//
// Uso:  node verificador-alquiler.mjs          -> DRY-RUN (reporta, no escribe)
//       node verificador-alquiler.mjs --apply  -> aplica contador / baja confirmada
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep } from '../sonda-suelo/lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const GRACE_DAYS = 2, GRACE_MS = GRACE_DAYS * 86400000;
const CB_RATIO = 0.4;
const OUT = join(__dirname, 'output');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

const parseUTC = (s) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
const fuenteDeUrl = (u) => (String(u).includes('remax.bo') ? 'remax' : 'century21');

// HTTP check: SOLO status code. 'caida'=borrado (C21 4xx · Remax redirect) · 'viva'=200 · 'ambiguo'=5xx/timeout
async function chequear(url, fuente) {
  try {
    const signal = AbortSignal.timeout(15000);
    const r = await fetch(fuente === 'remax' ? url : `${url}?json=true`, { headers: UA, redirect: 'manual', signal });
    if (r.status >= 300 && r.status < 400) return fuente === 'remax' ? 'caida' : 'ambiguo'; // Remax borra→redirect
    if (r.status >= 400 && r.status < 500) return 'caida';   // 404/410 = aviso borrado
    if (r.status === 200) return 'viva';
    return 'ambiguo';                                         // 5xx u otros → transitorio
  } catch { return 'ambiguo'; }
}

// --- Señal 1: desaparecidas del discovery-alquiler de hoy (las calcula y guarda el discovery) ---
const discFile = readdirSync(OUT).filter(x => x.startsWith('discovery-alquiler')).sort().pop();
if (!discFile) { console.error('No hay output de discovery-alquiler. Corré discovery-alquiler.mjs primero (el verificador usa su lista de desaparecidas).'); process.exit(1); }
const disc = JSON.parse(readFileSync(join(OUT, discFile), 'utf8'));
const desap = disc.desaparecidas || [];
const desapIds = new Set(desap.map(d => d.id));

// --- Universo: las desaparecidas que están EN shadow + las con contador (siempre alquiler) ---
const ids = [...desapIds];
const { data: rows, error: selErr } = await sb.from('propiedades_v2_shadow')
  .select('id, url, fuente, status, primera_ausencia_at, es_activa')
  .eq('tipo_operacion', 'alquiler')
  .or(`id.in.(${ids.length ? ids.join(',') : 0}),primera_ausencia_at.not.is.null`);
if (selErr) { console.error('ERROR leyendo shadow:', selErr.message); process.exit(1); }

// --- Disyuntor: ¿el crawl fue confiable? ---
const { count: activas } = await sb.from('propiedades_v2_shadow').select('*', { count: 'exact', head: true })
  .eq('tipo_operacion', 'alquiler').eq('es_activa', true);
const cbTripped = activas > 0 && desap.length > activas * CB_RATIO;

console.log(`\n🔎 VERIFICADOR alquiler SHADOW — ${APPLY ? 'APPLY' : 'DRY-RUN'}  ·  gracia ${GRACE_DAYS}d  ·  status-code-only + 2 señales`);
console.log(`   crawl: ${discFile}  ·  desaparecidas: ${desap.length}/${activas} activas shadow  ·  a evaluar: ${rows.length}`);
if (cbTripped) console.log(`   🛑 DISYUNTOR ACTIVADO: ${desap.length} > ${Math.round(CB_RATIO * 100)}% de ${activas} → crawl sospechoso, NO se confirman bajas.\n`);
else console.log('');

const ahora = Date.now();
const revive = [], setCounter = [], normaliza = [], confirma = [], defer = [];
for (const c of rows) {
  if (desapIds.has(c.id)) {
    let st = await chequear(c.url, c.fuente || fuenteDeUrl(c.url));
    if (st === 'caida') { await sleep(1500); st = await chequear(c.url, c.fuente || fuenteDeUrl(c.url)); } // doble-check
    if (st === 'viva') revive.push(c);                                    // el crawl la perdió pero está viva
    else if (st === 'caida') {
      if (!c.primera_ausencia_at) setCounter.push(c);                     // 1ra caída → arranca gracia (sigue en feed)
      else if (ahora - parseUTC(c.primera_ausencia_at).getTime() > GRACE_MS) (cbTripped ? defer : confirma).push(c);
      else if (c.status !== 'completado') normaliza.push(c);              // dentro de gracia → asegurar feed
    } else if (c.status !== 'completado') normaliza.push(c);              // ambiguo → NO es baja
    await sleep(150);
  } else revive.push(c);                                                  // tenía contador pero VOLVIÓ al crawl
}

console.log(`  → VIVAS / revividas (siguen/vuelven al feed):        ${revive.length}`);
console.log(`  → CONTADOR arrancado (1ra ausencia, sigue en feed):  ${setCounter.length}`);
console.log(`  → normalizadas a feed (estaban pending):             ${normaliza.length}`);
console.log(`  → BAJA confirmada (>${GRACE_DAYS}d, 2 señales → sale del feed): ${confirma.length}`);
if (defer.length) console.log(`  → bajas DIFERIDAS por disyuntor:                     ${defer.length}`);
confirma.forEach(c => console.log(`     baja id ${c.id} (${c.fuente || fuenteDeUrl(c.url)}) — ${c.url}`));

if (!APPLY) { console.log(`\n  (DRY-RUN: no se escribió nada. Correr con --apply.)\n`); process.exit(0); }

// ---------- escritura (solo shadow, filtrada a alquiler; status-only) ----------
const nowIso = new Date().toISOString();
async function upd(arr, patch, label) {
  if (!arr.length) return;
  const { error } = await sb.from('propiedades_v2_shadow').update(patch)
    .in('id', arr.map(c => c.id)).eq('tipo_operacion', 'alquiler');   // defensa extra: nunca fuera de alquiler
  console.log(error ? `   ✖ ${label}: ${error.message}` : `   ✓ ${label}: ${arr.length}`);
}
await upd(revive, { status: 'completado', primera_ausencia_at: null }, 'revividas');
await upd(setCounter, { status: 'completado', primera_ausencia_at: nowIso }, 'contador (sigue en feed)');
await upd(normaliza, { status: 'completado' }, 'normalizadas a feed');
for (const c of confirma) {
  const { error } = await sb.from('propiedades_v2_shadow').update({
    status: 'inactivo_confirmed', es_activa: false,
    fecha_inactivacion: c.primera_ausencia_at || nowIso, razon_inactiva: 'aviso_terminado',
  }).eq('id', c.id).eq('tipo_operacion', 'alquiler').eq('es_activa', true);
  if (error) console.error(`   ✖ baja id ${c.id}: ${error.message}`);
}
if (confirma.length) console.log(`   ✓ bajas confirmadas: ${confirma.length}`);
console.log('');
