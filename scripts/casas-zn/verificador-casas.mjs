// ============================================================================
// VERIFICADOR de casas ZN (híbrido) — modelo DEPTOS adaptado: status-code-only + 2 señales
// ----------------------------------------------------------------------------
// Un PASO de la routine /cron-casas (corre DESPUÉS del cron, lee su output).
//
// POR QUÉ ESTE REWRITE (vs la versión que parseaba contenido):
//   El verificador de deptos (n8n) NUNCA parsea el HTML/JSON del aviso: confía
//   SOLO en el status code (C21 → 404, Remax → 301/302 con maxRedirects:0). Así
//   es inmune a placeholders / páginas de mantenimiento / bloqueos / cambios de
//   markup, que devuelven 200/403/503 y NO son señal de baja. La versión vieja de
//   casas leía `entity`/`data-page` y confundía esos casos con "caída" → falsos
//   positivos masivos (vació el feed 294→103 el 26-jun). Acá copiamos el enfoque.
//
// DOS SEÑALES (deptos usa discovery-ausencia + audit-HTTP; acá las EXIGIMOS juntas
// porque el discovery de casas es VOLÁTIL — un crawl parcial no debe bajar nada):
//   · Señal 1 — ausencia del crawl: la casa activa NO apareció en el discovery de
//     hoy (lista `desaparecidas` que el cron ya calculó y guardó en su JSON).
//   · Señal 2 — HTTP status-code: GET a la URL, SOLO mirando el código.
//   Una casa baja únicamente si AMBAS coinciden de forma SOSTENIDA (>GRACE días).
//
// ESTADOS (clave para no dañar el sistema): el verificador de casas SOLO escribe
//   - status = 'completado'        (todo lo que NO es baja → queda/vuelve al feed)
//   - status = 'inactivo_confirmed' + es_activa=false (baja confirmada → sale del feed)
//   NUNCA usa 'inactivo_pending' (esa era la causa de que casas vivas salieran del
//   feed durante la gracia). El contador de gracia vive en primera_ausencia_at,
//   independiente del status → durante la gracia la casa SIGUE en 'completado'/feed.
//
// SEGURIDAD DE TRIGGERS (verificado 26-jun contra pg_get_triggerdef):
//   Solo tocamos status / es_activa / primera_ausencia_at / fecha_inactivacion /
//   razon_inactiva. Ningún trigger de propiedades_v2 hace daño con eso:
//   · trg_asignar_zona_venta/alquiler → solo en UPDATE OF lat/lon/zona/... (no las tocamos)
//   · trg_sync_sin_match → solo en UPDATE OF id_proyecto_master (no lo tocamos)
//   · trg_matchear_alquiler_fn → early-return si tipo_operacion != 'alquiler' (casas son venta)
//   · proteger_amenities_candados → solo actúa en transición 'actualizado'→'completado'
//     (nuestras transiciones son pending/completado→completado y completado→inactivo_confirmed)
//   AISLAMIENTO: todas las lecturas/escrituras filtran casas del híbrido
//   (tipo='casa' + metodo_match carga_% / cron_casas_zn). Nunca toca deptos.
//
// Uso:  node verificador-casas.mjs          -> DRY-RUN (reporta, no escribe)
//       node verificador-casas.mjs --apply  -> aplica revive / contador / baja confirmada
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
const GRACE_DAYS = 2;
const GRACE_MS = GRACE_DAYS * 86400000;
const CB_RATIO = 0.4;          // disyuntor: si > 40% de las activas "desaparecen", el crawl
                                // fue parcial / el portal está raro → NO confirmar bajas esta corrida.
const OUT = join(__dirname, 'output');
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const HYBRID = 'metodo_match.like.carga_%,metodo_match.eq.cron_casas_zn';

// timestamp without time zone → al leer no trae 'Z'; lo guardamos como UTC, así que
// lo parseamos como UTC (sin esto habría ~4h de skew en la gracia).
const parseUTC = (s) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
const fuenteDeUrl = (u) => (String(u).includes('remax.bo') ? 'remax' : 'century21');

// ---------- HTTP check: SOLO status code (status-code-only, como deptos) ----------
// 'caida'   = señal DURA de borrado (C21 4xx · Remax redirect/4xx)
// 'viva'    = 200 (responde OK; el crawl la perdió pero está arriba) — NO parseamos contenido
// 'ambiguo' = 5xx / timeout / red / cualquier otra cosa → NO es baja, se ignora
async function chequear(url, fuente) {
  try {
    const signal = AbortSignal.timeout(15000);
    const r = await fetch(fuente === 'remax' ? url : `${url}?json=true`,
      { headers: UA, redirect: 'manual', signal });   // manual = ver el 301/302 de Remax (no seguirlo)
    if (r.status >= 300 && r.status < 400) return fuente === 'remax' ? 'caida' : 'ambiguo'; // Remax borra→redirect
    if (r.status >= 400 && r.status < 500) return 'caida';   // 404/410 = aviso borrado
    if (r.status === 200) return 'viva';
    return 'ambiguo';                                         // 5xx u otros → transitorio
  } catch { return 'ambiguo'; }                               // timeout / red → transitorio (NO caída)
}

// ============================== MAIN ==============================
// --- Señal 1: desaparecidas del crawl de hoy (las calcula y guarda el cron) ---
const cronFile = readdirSync(OUT).filter(x => x.startsWith('cron-casas-dryrun')).sort().pop();
if (!cronFile) { console.error('No hay output del cron. Corré cron-casas-zn.mjs primero (el verificador usa su lista de desaparecidas).'); process.exit(1); }
const cron = JSON.parse(readFileSync(join(OUT, cronFile), 'utf8'));
const desap = cron.desaparecidas || [];
const desapIds = new Set(desap.map(d => d.id));

// --- Universo a evaluar: las desaparecidas + las que tienen contador/legacy-pending ---
// (un solo SELECT, siempre filtrado al híbrido para no tocar deptos jamás)
const ids = [...desapIds];
const { data: rows, error: selErr } = await sb.from('propiedades_v2')
  .select('id, url, fuente, status, primera_ausencia_at, es_activa')
  .eq('tipo_propiedad_original', 'casa').or(HYBRID)
  .or(`id.in.(${ids.length ? ids.join(',') : 0}),primera_ausencia_at.not.is.null,status.eq.inactivo_pending`);
if (selErr) { console.error('ERROR leyendo casas:', selErr.message); process.exit(1); }

// --- Disyuntor: ¿el crawl fue confiable? ---
const { count: activas } = await sb.from('propiedades_v2').select('*', { count: 'exact', head: true })
  .eq('tipo_propiedad_original', 'casa').eq('es_activa', true).or(HYBRID);
const cbTripped = activas > 0 && desap.length > activas * CB_RATIO;

console.log(`\n🔎 VERIFICADOR casas ZN — ${APPLY ? 'APPLY' : 'DRY-RUN'}  ·  gracia ${GRACE_DAYS}d  ·  status-code-only + 2 señales`);
console.log(`   crawl: ${cronFile}  ·  desaparecidas: ${desap.length}/${activas} activas  ·  a evaluar: ${rows.length}`);
if (cbTripped) console.log(`   🛑 DISYUNTOR ACTIVADO: ${desap.length} desaparecidas > ${Math.round(CB_RATIO*100)}% de ${activas} → crawl sospechoso, NO se confirman bajas esta corrida.\n`);
else console.log('');

const ahora = Date.now();
const revive = [], setCounter = [], normaliza = [], confirma = [], defer = [];

for (const c of rows) {
  if (desapIds.has(c.id)) {
    // Señal 1 cumplida (ausente del crawl) → confirmar con Señal 2 (HTTP status-code)
    let st = await chequear(c.url, c.fuente || fuenteDeUrl(c.url));
    if (st === 'caida') { await sleep(1500); st = await chequear(c.url, c.fuente || fuenteDeUrl(c.url)); } // doble-check
    if (st === 'viva') {
      revive.push(c);                                                  // el crawl la perdió pero está viva
    } else if (st === 'caida') {
      if (!c.primera_ausencia_at) setCounter.push(c);                  // 1ra caída confirmada → arranca gracia (sigue en feed)
      else if (ahora - parseUTC(c.primera_ausencia_at).getTime() > GRACE_MS) {
        (cbTripped ? defer : confirma).push(c);                        // gracia vencida → baja (salvo disyuntor)
      } else if (c.status !== 'completado') normaliza.push(c);          // dentro de gracia: asegurar que esté en feed
    } else { // ambiguo (placeholder/bloqueo/timeout) → NO es baja
      if (c.status !== 'completado') normaliza.push(c);                 // si estaba pending, devolver al feed (no la escondemos)
    }
    await sleep(150);
  } else {
    // Tenía contador/legacy-pending pero VOLVIÓ a aparecer en el crawl → revive (sin HTTP)
    revive.push(c);
  }
}

console.log(`  → VIVAS / revividas (vuelven o siguen en feed):   ${revive.length}`);
console.log(`  → CONTADOR arrancado (1ra ausencia, sigue en feed): ${setCounter.length}`);
console.log(`  → normalizadas a feed (estaban pending, inciertas): ${normaliza.length}`);
console.log(`  → BAJA confirmada (>${GRACE_DAYS}d, 2 señales → sale del feed): ${confirma.length}`);
if (defer.length) console.log(`  → bajas DIFERIDAS por disyuntor (no se confirman hoy):   ${defer.length}`);
confirma.forEach(c => console.log(`     baja id ${c.id} (${c.fuente || fuenteDeUrl(c.url)}) — ${c.url}`));

if (!APPLY) { console.log(`\n  (DRY-RUN: no se escribió nada. Correr con --apply.)\n`); process.exit(0); }

// ---------- escritura (toda filtrada al híbrido por id; status-only) ----------
const nowIso = new Date().toISOString();
async function upd(arr, patch, label) {
  if (!arr.length) return;
  const { error } = await sb.from('propiedades_v2').update(patch)
    .in('id', arr.map(c => c.id))
    .eq('tipo_propiedad_original', 'casa');                 // defensa extra: nunca fuera de casas
  console.log(error ? `   ✖ ${label}: ${error.message}` : `   ✓ ${label}: ${arr.length}`);
}
// revive + grupoB: vuelven a 'completado' y se limpia el contador
await upd(revive, { status: 'completado', primera_ausencia_at: null }, 'revividas');
// 1ra ausencia: arranca contador, status='completado' (sigue en feed)
await upd(setCounter, { status: 'completado', primera_ausencia_at: nowIso }, 'contador (sigue en feed)');
// dentro de gracia / ambiguo legacy: solo asegurar 'completado' (mantener contador)
await upd(normaliza, { status: 'completado' }, 'normalizadas a feed');
// baja confirmada: la única transición a inactivo (es_activa=false → sale del feed)
for (const c of confirma) {
  const { error } = await sb.from('propiedades_v2').update({
    status: 'inactivo_confirmed', es_activa: false,
    fecha_inactivacion: c.primera_ausencia_at || nowIso, razon_inactiva: 'aviso_terminado',
  }).eq('id', c.id).eq('tipo_propiedad_original', 'casa').eq('es_activa', true);
  if (error) console.error(`   ✖ baja id ${c.id}: ${error.message}`);
}
if (confirma.length) console.log(`   ✓ bajas confirmadas: ${confirma.length}`);
console.log('');
