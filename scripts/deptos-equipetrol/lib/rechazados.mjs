// ═══════════════════════════════════════════════════════════════════════════
// Memoria de RECHAZOS por gate — indexada por URL, no por id.
// ═══════════════════════════════════════════════════════════════════════════
//
// EL BUG QUE CIERRA (memoria `project_rechazados_json_indexa_por_id`):
// `rechazados.json` era un array plano de IDs. Eso funciona para las props que
// vienen de PROD (id estable), pero NO para las capturadas por `--nuevas`: esas
// todavía no existen en prod, así que reciben un **id reservado del rango 8M
// distinto en cada corrida**. Resultado: el filtro nunca engancha y los mismos
// avisos se re-fetchean y se re-leen todas las noches.
//
// Medido en los partes matutinos:
//   30-jul   6 de 82 props del MOAT (7%)   ·  1-ago   5 de 12 (42%)
//   2-ago    venta ZN 6 de 6 (100%) · alquiler ZN 5 de 5 · venta Eq 4 de 6 (67%)
// Con el backlog drenado dejó de ser una ineficiencia marginal: era la tanda entera.
//
// 🔑 La identidad estable de un aviso es su **URL**. Es la misma lección que
// `verificar-shadow-alquiler.mjs` (cruzaba prod↔shadow por id y reportaba 37
// faltantes que no faltaban) y que el plan de cutover (resolver por URL, no por id).
//
// ── POR QUÉ HAY TTL Y NO DESCARTE PERMANENTE ────────────────────────────────
// El riesgo de este filtro NO es que falle: es que descarte de más. Un aviso
// rechazado hoy puede cambiar mañana — el captador corrige la operación mal
// tipeada, o publica el precio de venta que faltaba — y un descarte eterno lo
// enterraría en silencio, que es el modo de falla que no da error y nadie ve.
// Con TTL el sistema se ahorra ~29 de cada 30 noches y aun así vuelve a mirar
// el aviso una vez al mes. Si hay que forzar la re-lectura antes: borrar la
// entrada del .json (o el archivo entero → vuelve al comportamiento viejo).
//
// Formato v2:  { version: 2, actualizado, entradas: [{ url, id, razon,
//                primera_vez, ultima_vez, veces }] }
// Lee también el v1 (array plano de ids) sin migración: los ids viejos siguen
// filtrando a las props de prod, que es donde sí servían.

// ── FETCH FALLIDO (7-ago-2026) ──────────────────────────────────────────────
// El agujero que quedaba abierto: esta memoria guarda lo que el GATE rechazó, o
// sea lo que se pudo leer y se juzgó. Un aviso que **nunca se pudo descargar**
// no llega al gate, no se registra, y se re-intenta todas las noches.
// Caso real: `57808` y `57806` (alquiler ZN) dieron 404 tres noches seguidas
// (5, 6 y 7 de agosto), con 3 intentos rotando IP cada vez.
//
// 🔑 POR QUÉ NO SE SALTEAN DESDE LA PRIMERA VEZ: un fallo de fetch puede ser un
// hipo (el portal se cayó, el proxy falló), y enterrar un aviso vivo por eso es
// el modo de falla caro — no da error y nadie lo ve. Recién a la SEGUNDA noche
// consecutiva se asume que el aviso está muerto. Y el TTL de 30 días lo reabre
// igual, así que ni siquiera un muerto queda enterrado para siempre.
export const UMBRAL_FETCH_FALLIDO = 2;
export const RAZON_FETCH_FALLIDO = 'fetch_fallido';

import { readFileSync, writeFileSync } from 'node:fs';

export const TTL_DIAS = 30;

const hoyISO = () => new Date().toISOString().slice(0, 10);
const diasDesde = (iso) => {
  if (!iso) return Infinity;
  const ms = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(ms) ? Infinity : Math.floor((Date.now() - ms) / 86_400_000);
};

/**
 * Lee la memoria de rechazos.
 * @returns {{ids:Set<number>, urls:Set<string>, entradas:Array, vencidas:number}}
 *   `urls` trae SOLO las vigentes (dentro del TTL) → las vencidas vuelven a
 *   evaluarse solas. `ids` trae todas: para props de prod el id es estable y no
 *   hay razón para caducarlo.
 */
export function leerRechazados(file, { ttlDias = TTL_DIAS } = {}) {
  let raw;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); }
  catch { return { ids: new Set(), urls: new Set(), entradas: [], vencidas: 0 }; }

  // v1 — array plano de ids (sin URL, sin fecha): se respeta tal cual.
  if (Array.isArray(raw)) {
    return {
      ids: new Set(raw.filter((v) => v != null)),
      urls: new Set(),
      entradas: raw.map((id) => ({ id, url: null })),
      vencidas: 0,
    };
  }

  const entradas = Array.isArray(raw?.entradas) ? raw.entradas : [];
  const urls = new Set();
  let vencidas = 0;
  let fetchFallidoEnGracia = 0;
  for (const e of entradas) {
    if (!e?.url) continue;
    if (diasDesde(e.ultima_vez) > ttlDias) { vencidas++; continue; }   // caducó → se re-evalúa
    // Un fetch fallido NO saltea desde la primera vez: puede ser un hipo del
    // portal. Se le da una noche de gracia antes de darlo por muerto.
    if (e.razon === RAZON_FETCH_FALLIDO && (e.veces ?? 0) < UMBRAL_FETCH_FALLIDO) {
      fetchFallidoEnGracia++;
      continue;
    }
    urls.add(e.url);
  }
  return {
    ids: new Set(entradas.map((e) => e?.id).filter((v) => v != null)),
    urls, entradas, vencidas, fetchFallidoEnGracia,
  };
}

/**
 * Suma rechazos nuevos y reescribe el archivo. Idempotente por URL.
 * @param {Array<{id?:number, url?:string, razon?:string}>} nuevos
 * @returns {{total:number, urls_con_url:number, repetidos:number}}
 */
export function guardarRechazados(file, nuevos) {
  const prev = leerRechazados(file, { ttlDias: Infinity });   // al escribir NO se caduca nada
  const hoy = hoyISO();
  const clave = (r) => r?.url || (r?.id != null ? `id:${r.id}` : null);

  const porClave = new Map();
  for (const e of prev.entradas) { const k = clave(e); if (k) porClave.set(k, e); }

  let repetidos = 0;
  for (const r of nuevos || []) {
    const k = clave(r);
    if (!k) continue;
    const ya = porClave.get(k);
    if (ya) repetidos++;
    porClave.set(k, {
      url:   r.url   ?? ya?.url   ?? null,
      id:    r.id    ?? ya?.id    ?? null,   // el id es informativo: cambia entre corridas
      razon: r.razon ?? ya?.razon ?? null,
      primera_vez: ya?.primera_vez ?? hoy,
      ultima_vez:  hoy,
      // Cuántas noches se volvió a rechazar el MISMO aviso. Si el fix funciona
      // esto deja de crecer: es el termómetro del bug.
      veces: (ya?.veces ?? 0) + 1,
    });
  }

  const entradas = [...porClave.values()];
  writeFileSync(file, JSON.stringify({ version: 2, actualizado: hoy, entradas }, null, 1));
  return { total: entradas.length, urls_con_url: entradas.filter((e) => e.url).length, repetidos };
}
