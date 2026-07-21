// ============================================================================
// NOTIFICADOR SLACK del cron híbrido — saca la ceguera de las corridas nocturnas
// ----------------------------------------------------------------------------
// PROBLEMA que resuelve: el cron corre solo (routine) y hoy NO avisa nada. El
// reporte queda en output/*-log.md → si falla a la 1 AM te enterás a la mañana
// abriendo archivos, o no te enterás. n8n SÍ avisa por Slack hoy → al apagarlo se
// perdería el único aviso nocturno. Este script lo reemplaza.
//
// WEBHOOK: usa SLACK_WEBHOOK_SICI (canal de pipeline/operaciones, el que usa n8n)
// y si no existe cae a SLACK_WEBHOOK_URL (el de la app). Así funciona con lo que
// ya está configurado, y toma el dedicado si algún día se crea, sin tocar código.
//
// BEST-EFFORT: si Slack falla o no hay webhook, avisa por consola y sale con 0 —
// NUNCA hace fallar la corrida del cron (un aviso caído no debe romper la captura).
//
// Uso:  node notificar-slack.mjs "mensaje"
//       node notificar-slack.mjs --file output/resumen.txt      (multilínea)
//       echo "mensaje" | node notificar-slack.mjs               (stdin)
//       node notificar-slack.mjs --test                          (mensaje de prueba)
// ============================================================================
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });

// EXPORTADA: la usan los scripts para avisar SIN depender de que el agente llegue al paso 7
// (ej. el discovery cuando aborta por circuit breaker — justo cuando el aviso más importa y
// más fácil se pierde). Best-effort: nunca tira, nunca rompe la corrida.
export async function notificarSlack(mensaje) {
  const texto = String(mensaje || '').trim();
  if (!texto) return false;
  const url = process.env.SLACK_WEBHOOK_SICI || process.env.SLACK_WEBHOOK_URL;
  if (!url) { console.warn('  ⚠️  Slack: sin webhook configurado → no se envió el aviso.'); return false; }
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: texto }), signal: AbortSignal.timeout(15000),
    });
    if (res.ok) { console.log('  📨 Slack: aviso enviado'); return true; }
    console.warn(`  ⚠️  Slack respondió ${res.status} — el aviso NO llegó (la corrida sigue siendo válida).`);
  } catch (e) {
    console.warn(`  ⚠️  Slack falló (${e.message}) — el aviso NO llegó (la corrida sigue siendo válida).`);
  }
  return false;
}

// --- CLI (solo si se ejecuta directo, no al importarlo) ---
const esCLI = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
const argv = process.argv.slice(2);

function leerMensaje() {
  if (argv.includes('--test')) {
    return '🧪 Prueba del notificador del cron híbrido (deptos Equipetrol).\nSi ves esto, los avisos nocturnos van a llegar acá.';
  }
  const iFile = argv.indexOf('--file');
  if (iFile >= 0 && argv[iFile + 1]) return readFileSync(argv[iFile + 1], 'utf8');
  const inline = argv.filter((a) => !a.startsWith('--')).join(' ');
  if (inline) return inline;
  // stdin (para pipes)
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

if (esCLI) {
  const mensaje = (leerMensaje() || '').trim();
  if (!mensaje) {
    console.error('notificar-slack: nada que enviar. Uso: node notificar-slack.mjs "mensaje" | --file <ruta> | --test');
    process.exit(0);                     // no romper el cron
  }
  const canal = process.env.SLACK_WEBHOOK_SICI ? 'SLACK_WEBHOOK_SICI (operaciones)' : 'SLACK_WEBHOOK_URL (app)';
  const ok = await notificarSlack(mensaje);
  if (ok) console.log(`     canal: ${canal}`);
  process.exit(0);                       // SIEMPRE 0: un aviso caído no invalida la corrida
}
