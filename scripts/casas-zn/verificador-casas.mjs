// ============================================================================
// VERIFICADOR de casas ZN (híbrido) — con CONTADOR + GRACIA (no baja al primer fallo)
// ----------------------------------------------------------------------------
// Pensado como UN PASO de la routine nocturna (mismo schedule que el discovery),
// NO un cron separado. El contador vive en la BD (primera_ausencia_at), así que
// funciona perfecto con una sola corrida por noche.
//
// Por cada casa ACTIVA del híbrido (carga_* + cron_casas_zn):
//   - VIVA  → si estaba pendiente, REVIVE (limpia primera_ausencia_at, status=completado).
//   - CAÍDA (404 / sin entity / redirect Home):
//       · 1ra ausencia:   sella primera_ausencia_at (CONTADOR). status SIGUE 'completado'
//                         → la casa NO sale del feed mientras está dentro de la gracia.
//       · >GRACE días:    status=inactivo_confirmed + es_activa=false (BAJA final → sale del feed)
//       · dentro gracia:  espera (no toca nada, sigue en feed)
//   - ERROR transitorio (timeout / 5xx / red) → se IGNORA (no cuenta como caída).
//
// PRINCIPIO (por qué la 1ra ausencia NO esconde la casa): el discovery/HTTP de los
// portales es volátil y puede BLOQUEAR una corrida entera (Remax devuelve 'Home' para
// URLs válidas cuando rate-limitea) → marcaría como caídas decenas de casas VIVAS. Si
// eso sacara del feed al toque, vaciaríamos el feed por un glitch. Nunca escondemos una
// casa de la que NO estamos seguros que cayó: solo sale tras ausencia SOSTENIDA (>2d).
//
// Uso:  node verificador-casas.mjs          -> DRY-RUN (reporta, no escribe)
//       node verificador-casas.mjs --apply  -> aplica pending / confirmed / revive
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { sleep } from '../sonda-suelo/lib/fetcher.mjs';
dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const GRACE_DAYS = 2;
const GRACE_MS = GRACE_DAYS * 86400000;
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };

// HTTP check → 'viva' | 'caida' | 'error'. Distingue 404 (caída) de 5xx/timeout (transitorio).
async function chequear(c) {
  try {
    const signal = AbortSignal.timeout(30000);
    if (c.url.includes('c21.com.bo')) {
      const r = await fetch(`${c.url}?json=true`, { headers: UA, signal });
      if (r.status >= 400 && r.status < 500) return 'caida';   // 404 = aviso borrado
      if (!r.ok) return 'error';                                // 5xx = transitorio
      const j = await r.json();
      const e = j.entity || j.data?.entity || j;
      return (e && (e.id || e.precio || e.precioVenta)) ? 'viva' : 'caida';
    } else { // remax
      const r = await fetch(c.url, { headers: UA, redirect: 'follow', signal });
      if (r.status >= 400 && r.status < 500) return 'caida';
      if (!r.ok) return 'error';
      const html = await r.text();
      const m = html.match(/data-page="([^"]+)"/);
      if (!m) return 'caida';
      let comp = null; try { comp = JSON.parse(m[1].replace(/&quot;/g, '"')).component; } catch {}
      return (comp === 'Home' || /"component":"Home"/.test(html)) ? 'caida' : 'viva';
    }
  } catch { return 'error'; }  // timeout / red → transitorio, no baja
}

// ---------- main ----------
const { data: casas, error: selErr } = await sb.from('propiedades_v2')
  .select('id, url, fuente, status, primera_ausencia_at')
  .eq('tipo_propiedad_original', 'casa').eq('es_activa', true)
  .or('metodo_match.like.carga_%,metodo_match.eq.cron_casas_zn');
if (selErr) { console.error('ERROR leyendo casas:', selErr.message); process.exit(1); }

console.log(`\n🔎 VERIFICADOR casas ZN — ${APPLY ? 'APPLY' : 'DRY-RUN'}  ·  gracia ${GRACE_DAYS}d  ·  ${casas.length} activas\n`);

const ahora = Date.now();
const revive = [], pending = [], confirm = [];
let viva = 0, error = 0;
for (const c of casas) {
  let st = await chequear(c);
  // Doble-chequeo: una caída se re-consulta antes de contarla, para filtrar 404
  // transitorios / glitches. Solo cuenta como caída si el 2do intento también falla.
  if (st === 'caida') { await sleep(1500); st = await chequear(c); }
  if (st === 'error') { error++; await sleep(150); continue; }
  if (st === 'viva') {
    viva++;
    if (c.primera_ausencia_at) revive.push(c);                 // estaba pendiente → revive
  } else { // caida
    if (!c.primera_ausencia_at) pending.push(c);               // 1ra ausencia → solo contador (sigue en feed)
    else if (ahora - new Date(c.primera_ausencia_at).getTime() > GRACE_MS) confirm.push(c); // gracia vencida → baja
    // else: ausente dentro de gracia → espera (sigue en feed)
  }
  await sleep(150);
}

console.log(`  vivas: ${viva}  ·  errores transitorios (ignorados): ${error}`);
console.log(`  → AUSENTE 1ra vez (contador, SIGUE en feed): ${pending.length}`);
console.log(`  → BAJA confirmada (>${GRACE_DAYS}d ausente → sale del feed): ${confirm.length}`);
console.log(`  → REVIVEN (estaban ausentes, volvieron): ${revive.length}`);
pending.forEach(c => console.log(`     ausente id ${c.id} (${c.fuente}) — ${c.url}`));
confirm.forEach(c => console.log(`     baja id ${c.id} (${c.fuente})`));

if (!APPLY) { console.log(`\n  (DRY-RUN: no se escribió nada. Correr con --apply.)\n`); process.exit(0); }

// ---------- escritura ----------
async function upd(ids, patch, label) {
  if (!ids.length) return;
  const { error } = await sb.from('propiedades_v2').update(patch).in('id', ids);
  console.log(error ? `   ✖ ${label}: ${error.message}` : `   ✓ ${label}: ${ids.length}`);
}
const nowIso = new Date().toISOString();
// 1ra ausencia: SOLO el contador. status NO se toca (sigue 'completado') → la casa NO sale del feed.
await upd(pending.map(c => c.id), { primera_ausencia_at: nowIso }, 'ausente 1ra vez (contador, sigue en feed)');
await upd(confirm.map(c => c.id), { status: 'inactivo_confirmed', es_activa: false, fecha_inactivacion: nowIso }, 'baja confirmada');
await upd(revive.map(c => c.id), { status: 'completado', primera_ausencia_at: null }, 'revividas');
console.log('');
