// ============================================================================
// SNAPSHOT SHADOW — foto diaria del mercado en régimen TC nuevo (mig 283)
// ----------------------------------------------------------------------------
// Llama a la función SQL snapshot_absorcion_mercado_shadow() que escribe la
// serie en market_absorption_snapshots_shadow (tabla APARTE de la de prod:
// su UNIQUE no distingue filter_version y se pisaría la serie v3).
//
// Corre como paso final del cron híbrido nocturno (después del verificador,
// para que las bajas confirmadas del día entren en la foto). Idempotente:
// re-correrlo el mismo día actualiza la foto (upsert por fecha+dorm+zona).
//
// La serie arranca "en cero" de absorción y con nuevas_30d infladas hasta
// ~20-ago (bulk-load de julio) — caveats documentados en la mig 283.
//
// Uso:  node snapshot-shadow.mjs           (corre y resume)
//       node snapshot-shadow.mjs --quiet   (solo errores y resumen de 1 línea)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { notificarSlack } from './notificar-slack.mjs';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const quiet = process.argv.includes('--quiet');

const { data, error } = await sb.rpc('snapshot_absorcion_mercado_shadow');

if (error) {
  console.error('❌ snapshot shadow FALLÓ:', error.message);
  try {
    await notificarSlack(`❌ *Snapshot shadow falló* — la serie diaria de HOY no se guardó (no se reconstruye después): ${error.message}`);
  } catch { /* Slack caído no debe tapar el error real */ }
  process.exit(1);
}

const filas = data?.length ?? 0;
const globales = (data || []).filter((r) => r.zona_out === 'global').length;
const zonasVenta = new Set((data || []).filter((r) => r.zona_out !== 'global' && !r.zona_out.endsWith('[alq]')).map((r) => r.zona_out));
const zonasAlq = new Set((data || []).filter((r) => r.zona_out.endsWith('[alq]')).map((r) => r.zona_out));

// Sanity mínimo: si no escribió las 4 filas globales, algo está mal (vistas
// vacías / permisos) — avisar aunque el RPC no haya tirado error.
if (globales < 4) {
  console.error(`⚠️ snapshot shadow escribió solo ${globales}/4 filas globales (${filas} total) — revisar`);
  try {
    await notificarSlack(`⚠️ *Snapshot shadow incompleto*: ${globales}/4 filas globales (${filas} total). Revisar vistas shadow.`);
  } catch { /* idem */ }
  process.exit(1);
}

const resumen = `📸 Snapshot shadow OK: ${filas} filas (4 globales · ${zonasVenta.size} zonas venta · ${zonasAlq.size} zonas alquiler)`;
console.log(resumen);
if (!quiet) {
  for (const r of data) console.log(`   dorm ${r.dormitorios_out} · ${r.zona_out}`);
}
