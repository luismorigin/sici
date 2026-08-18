// ============================================================================
// VERIFICADOR de deptos VENTA SHADOW (híbrido) — status-code-only + 2 señales
// ----------------------------------------------------------------------------
// Incremento 3 de /cron-deptos-ventas (el paso que le faltaba). Gemelo de
// verificador-alquiler.mjs: mismo motor, cambia el discovery de origen
// (discovery-deptos) y el filtro (tipo_operacion='venta'). Corre DESPUÉS del
// discovery, lee sus `desaparecidas`, y confirma bajas por HTTP en
// propiedades_v2_shadow (tipo_operacion='venta'). AISLADO de alquiler.
//
// STATUS-CODE-ONLY (como n8n/casas): NUNCA parsea el HTML/JSON — solo el código.
// Inmune a placeholders / mantenimiento / bloqueos (200/403/503 NO son baja).
// C21 → 404/4xx = baja; Remax → 301/302 (redirect manual) = baja.
//
// DOS SEÑALES (una baja necesita AMBAS, sostenidas > gracia):
//   1. ausencia del crawl: la URL activa NO apareció en el discovery de hoy.
//   2. HTTP status-code: GET a la URL, solo el código.
// Gracia 2d (contador en primera_ausencia_at, la prop SIGUE en feed durante gracia).
// Disyuntor: si > 40% de las activas "desaparecen", el crawl fue parcial → NO baja nada.
//
// SHADOW: escribe SOLO propiedades_v2_shadow (service_role), filtrado a VENTA. La
// tabla shadow NO tiene triggers (LIKE INCLUDING ALL no los copia) → seguro. PROD intacto.
//
// Uso:  node verificador-deptos.mjs          -> DRY-RUN (reporta, no escribe)
//       node verificador-deptos.mjs --apply  -> aplica contador / baja confirmada
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sleep, crearAgente, cerrarProxy, rotarSesion, trafico } from '../sonda-suelo/lib/fetcher.mjs';
import { ZONAS_HIBRIDO, resolverZona } from './lib/zonas-hibrido.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const GRACE_DAYS = 2, GRACE_MS = GRACE_DAYS * 86400000;
const CB_RATIO = 0.4;
const OUT = join(__dirname, 'output');
const ZONA = resolverZona();   // default equipetrol → sin flags, igual que antes
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

const parseUTC = (s) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
const fuenteDeUrl = (u) => (String(u).includes('remax.bo') ? 'remax' : 'century21');

// HTTP check: SOLO status code. 'caida'=borrado (C21 4xx · Remax redirect) · 'viva'=200 · 'ambiguo'=5xx/timeout
async function chequear(url, fuente) {
  const agente = await crearAgente();   // agente del LOTE sticky (reusado); NO cerrar acá — lo gestiona el lote
  try {
    const signal = AbortSignal.timeout(15000);
    // 🔴 NO usar `?json=true` acá (bug cazado 29-jul-2026). Ese endpoint sirve el registro de la BD
    // de Century21 y devuelve **200 con el aviso completo aunque la página pública esté 404**:
    // medido 3 veces seguidas sobre el aviso 105863 (borrado) → 200 · 86 KB · `entity.id: 105863`,
    // idéntico a uno vivo. Con esa señal el verificador NUNCA podía confirmar una baja de C21.
    // La PÁGINA sí distingue: 404 el borrado, 200 el vivo — y encima pesa menos (24 KB vs 86 KB).
    const r = await fetch(url, { headers: UA, redirect: 'manual', signal, ...(agente ? { dispatcher: agente } : {}) });
    // Cuenta el request + ESTIMA los bytes por `content-length` (el status-check NO lee el body, así que
    // sin esto el 📊 reportaba "0 MB" aunque el proxy sí transfiere → medición engañosa de los GB).
    trafico.requests++;
    trafico.bytes += Number(r.headers.get('content-length')) || 0;
    if (r.status >= 300 && r.status < 400) return fuente === 'remax' ? 'caida' : 'ambiguo'; // Remax borra→redirect
    if (r.status >= 400 && r.status < 500) return 'caida';   // 404/410 = aviso borrado
    if (r.status === 200) return 'viva';
    return 'ambiguo';                                         // 5xx u otros → transitorio
  } catch { rotarSesion(); return 'ambiguo'; }   // IP mala → nueva en el próximo chequeo
}

// --- Señal 1: desaparecidas del discovery-deptos de hoy (las calcula y guarda el discovery) ---
// El discovery YA es shadow-aware de fábrica (mide desaparecidas vs shadow, no vs prod) y guarda
// como `discovery-deptos-<ts>.json`. Elegir SIEMPRE el más reciente por TIMESTAMP del nombre.
// 🔴 Antes se filtraba por `-shadowaware` (parche de cuando había 2 variantes por corrida): con un
// archivo viejo de esos en output/, el verificador agarraba un crawl de días atrás e ignoraba el de
// hoy (bug cazado 17-jul: usaba el del 13-jul). En empate de ts, preferir la variante shadowaware.
// 🔴 ZONA (28-jul-2026): `startsWith('discovery-deptos')` también matchea `discovery-deptos-zn-*`.
// Con dos zonas escribiendo en output/, el verificador de Equipetrol podía agarrar el crawl de ZN
// y tratar sus desaparecidas como propias → bajas masivas y falsas. Mismo agujero que tenía el
// diff del discovery. Se filtra por el prefijo de ESTA zona, excluyendo los de las otras.
const PREFIJO = `discovery-deptos${ZONA.sufijoArchivo}-`;
const PREFIJOS_AJENOS = Object.values(ZONAS_HIBRIDO)
  .filter((z) => z.id !== ZONA.id && z.sufijoArchivo)
  .map((z) => `discovery-deptos${z.sufijoArchivo}-`);
const tsDe = (f) => (f.match(/(\d{4}-\d{2}-\d{2}T[\d-]+)/)?.[1] || '');
const rank = (f) => (f.includes('-shadowaware') ? 1 : 0);
const discFiles = readdirSync(OUT).filter((x) =>
  x.startsWith(PREFIJO) && !PREFIJOS_AJENOS.some((p) => x.startsWith(p)) && x.endsWith('.json'));
const discFile = discFiles.sort((a, b) => tsDe(a).localeCompare(tsDe(b)) || rank(a) - rank(b)).pop();
if (!discFile) { console.error(`No hay output de discovery-deptos para ${ZONA.nombre}. Corré discovery-deptos.mjs${ZONA.id === 'equipetrol' ? '' : ` --zona=${ZONA.id}`} primero (el verificador usa su lista de desaparecidas).`); process.exit(1); }
const disc = JSON.parse(readFileSync(join(OUT, discFile), 'utf8'));
// Cinturón además del tirante: el discovery escribe su zona DENTRO del archivo. Si no coincide,
// parar — dar de baja con la lista equivocada es destructivo y no se nota hasta que el feed vacía.
if (disc.zona && disc.zona !== ZONA.id) {
  console.error(`🛑 El discovery elegido (${discFile}) es de la zona "${disc.zona}" y este verificador corre "${ZONA.id}". Abortado para no dar bajas falsas.`);
  process.exit(1);
}
const desap = disc.desaparecidas || [];
const desapIds = new Set(desap.map(d => d.id));

// --- Universo: las desaparecidas que están EN shadow + las con contador (siempre venta) ---
const ids = [...desapIds];
// Acotado a la ZONA por dos motivos distintos, los dos serios:
//  (a) `primera_ausencia_at.not.is.null` traía las props CON CONTADOR de cualquier zona → el
//      verificador de una zona podía confirmar bajas de la otra, sin haberla crawleado nunca.
//  (b) el disyuntor compara desaparecidas contra activas: si el denominador incluye otra zona,
//      el umbral del 40% se diluye y la protección contra un crawl parcial se afloja sola.
const { data: rows, error: selErr } = await sb.from('propiedades_v2')
  .select('id, url, fuente, status, primera_ausencia_at, es_activa')
  .eq('tipo_operacion', 'venta')
  .in('zona', ZONA.zonas)
  .or(`id.in.(${ids.length ? ids.join(',') : 0}),primera_ausencia_at.not.is.null`);
if (selErr) { console.error('ERROR leyendo shadow:', selErr.message); process.exit(1); }

// --- Disyuntor: ¿el crawl fue confiable? --- (denominador de ESTA zona, ver (b) arriba)
const { count: activas } = await sb.from('propiedades_v2').select('*', { count: 'exact', head: true })
  .eq('tipo_operacion', 'venta').eq('es_activa', true).in('zona', ZONA.zonas);
const cbTripped = activas > 0 && desap.length > activas * CB_RATIO;

console.log(`\n🔎 VERIFICADOR deptos VENTA SHADOW — ${APPLY ? 'APPLY' : 'DRY-RUN'}  ·  gracia ${GRACE_DAYS}d  ·  status-code-only + 2 señales`);
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
// 📊 status-code-only NO lee el body y los portales usan chunked (sin `content-length`) → los bytes no son
// medibles sin descargarlo (lo que sumaría tráfico real y anularía el sentido del check). Se reporta lo que
// SÍ se sabe (requests) y se dice explícitamente que los bytes no se miden — antes decía "0 MB", engañoso.
const _bytesNota = trafico.bytes > 0 ? `${trafico.mb} MB` : 'bytes no medidos (status-only, sin content-length)';
console.log(`  📊 Tráfico verificador: ${trafico.requests} requests · ${_bytesNota}${process.env.PROXY_URL ? ' (por proxy)' : ' (IP directa, $0)'}`);
await cerrarProxy();   // cierra la conexión del último lote (todos los chequeos ya corrieron arriba)

if (!APPLY) { console.log(`\n  (DRY-RUN: no se escribió nada. Correr con --apply.)\n`); process.exit(0); }

// ---------- escritura (solo shadow, filtrada a venta; status-only) ----------
const nowIso = new Date().toISOString();
async function upd(arr, patch, label) {
  if (!arr.length) return;
  const { error } = await sb.from('propiedades_v2').update(patch)
    .in('id', arr.map(c => c.id)).eq('tipo_operacion', 'venta');       // defensa extra: nunca fuera de venta
  console.log(error ? `   ✖ ${label}: ${error.message}` : `   ✓ ${label}: ${arr.length}`);
}
await upd(revive, { status: 'completado', primera_ausencia_at: null }, 'revividas');
await upd(setCounter, { status: 'completado', primera_ausencia_at: nowIso }, 'contador (sigue en feed)');
await upd(normaliza, { status: 'completado' }, 'normalizadas a feed');
for (const c of confirma) {
  const { error } = await sb.from('propiedades_v2').update({
    status: 'inactivo_confirmed', es_activa: false,
    fecha_inactivacion: c.primera_ausencia_at || nowIso, razon_inactiva: 'aviso_terminado',
  }).eq('id', c.id).eq('tipo_operacion', 'venta').eq('es_activa', true);
  if (error) console.error(`   ✖ baja id ${c.id}: ${error.message}`);
}
if (confirma.length) console.log(`   ✓ bajas confirmadas: ${confirma.length}`);
console.log('');
