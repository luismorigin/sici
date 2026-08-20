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
// 🔴 MULTI-MACROZONA (mig 313): la función ya no devuelve `zona_out = 'global'` a secas,
// sino `'global [<macrozona>]'` — una tanda de 4 (dorms 0-3) POR macrozona. Este chequeo
// buscaba el string exacto 'global' y daba 0/4 aunque las filas se hubieran escrito bien:
// alerta falsa a Slack, con la serie del día perfectamente guardada (pasó el 31-jul-2026).
// El piso sigue siendo 4 — una macrozona sana — pero se cuenta por prefijo y se reporta
// cuántas macrozonas entraron, que es lo que de verdad hay que mirar al agregar una zona.
const esGlobal = (z) => z === 'global' || z.startsWith('global [');
const globales = (data || []).filter((r) => esGlobal(r.zona_out)).length;
const macrozonas = new Set((data || []).filter((r) => esGlobal(r.zona_out))
  .map((r) => (r.zona_out.match(/^global \[(.+)\]$/)?.[1] ?? 'global')));
const zonasVenta = new Set((data || []).filter((r) => !esGlobal(r.zona_out) && !r.zona_out.endsWith('[alq]')).map((r) => r.zona_out));
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

// 🔴 `filas` es lo que la RPC INTENTA escribir, NO lo que queda en la tabla: el UNIQUE
// (fecha, dormitorios, zona, macrozona) colapsa las repetidas, así que los dos números
// difieren siempre. Reportar solo el primero hizo que tres logs de la MISMA noche dijeran
// 133, 132 y 81 filas (18 y 19-ago-2026), y cada vez hubo que ir a la base a desempatar.
// Se informan los DOS y se nombra cuál es cuál: el de la tabla es el que vale.
const hoyLocal = (() => { const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
let enTabla = null;
try {
  const { count, error: errCount } = await sb
    .from('market_absorption_snapshots_shadow')
    .select('*', { count: 'exact', head: true })
    .eq('fecha', hoyLocal);
  if (!errCount) enTabla = count;
} catch { /* informativo: no puede tumbar el snapshot, que ya está escrito */ }

const detalleFilas = enTabla == null
  ? `${filas} filas upserteadas (no se pudo leer el conteo de la tabla)`
  : `${enTabla} filas en la tabla para ${hoyLocal} (la RPC upserteó ${filas}; el UNIQUE colapsa el resto)`;
const resumen = `📸 Snapshot shadow OK: ${detalleFilas} — ${globales} globales · ${macrozonas.size} macrozona(s): ${[...macrozonas].join(', ')} · ${zonasVenta.size} zonas venta · ${zonasAlq.size} zonas alquiler`;
console.log(resumen);
if (!quiet) {
  for (const r of data) console.log(`   dorm ${r.dormitorios_out} · ${r.zona_out}`);
}
