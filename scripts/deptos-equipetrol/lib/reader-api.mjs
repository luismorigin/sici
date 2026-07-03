// ============================================================================
// COSTURA DEL LECTOR POR API (STUB — no funcional todavía)
// ----------------------------------------------------------------------------
// El lector es una pieza ENCHUFABLE. Hoy el lector es Claude Code en sesión (leo el
// material que arma `--prep` y produzco el veredicto). Esta es la costura para que
// MAÑANA un API (OpenRouter u otro) produzca el MISMO veredicto, sin tocar el cargador.
//
// Decisión founder (3-jul): manual ahora ($0, MOAT), API-ready para después. El API
// da AUTONOMÍA (corre sin mí, futuro cron) a cambio de ~centavos/mes sobre el delta.
// Modelo (GLM barato vs Sonnet robusto) y modo (fallback / propone-yo-reviso / swap)
// se deciden al activarlo — NO ahora.
//
// Contrato: recibe el `material` (bundle de --prep) y devuelve un VEREDICTO con el
// schema de READER_SPEC.md. El cargador (`--apply`) no distingue si el veredicto vino
// de mí o de acá.
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// El system-prompt del API = el MISMO spec que sigo yo (fuente única de reglas).
export function cargarSpec() {
  return readFileSync(join(__dirname, '..', 'READER_SPEC.md'), 'utf-8');
}

/**
 * Lee un depto vía API y devuelve el veredicto (schema READER_SPEC.md).
 * STUB: al activar, implementar la llamada a OpenRouter con `cargarSpec()` como system
 * prompt + el `material` como user message, forzando salida JSON del schema del veredicto.
 *
 * @param {object} material  bundle de --prep (slug/titulo/descripcion/señales/candidatos)
 * @param {object} [opts]    { model, apiKey, baseURL }  — se define al activar
 * @returns {Promise<object>} veredicto
 */
export async function leerDeptoAPI(material, opts = {}) {
  throw new Error(
    'Lector por API no activado (stub). Para activar: implementar la llamada a OpenRouter\n' +
    '  - system: cargarSpec() (READER_SPEC.md)\n' +
    '  - user: JSON.stringify(material)\n' +
    '  - response_format JSON del schema del veredicto\n' +
    'y elegir modelo/modo con el founder. Por ahora el lector soy yo (--prep → leo → --apply).'
  );
}
