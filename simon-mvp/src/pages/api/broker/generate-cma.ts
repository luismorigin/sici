/**
 * ⛔ CMA v1 — APAGADO el 14-ago-2026. Reemplazado por el ACM (PR #71).
 *
 * POST /api/broker/generate-cma → 410 Gone.
 *
 * ── Por qué se apagó, y por qué no se arregló ────────────────────────────────
 *
 * 1. Estaba roto y no avisaba. Sus comparables salían de `buscar_unidades_reales()`,
 *    que lee `propiedades_v2` — tabla renombrada a `propiedades_v2_archivo` el 11-ago
 *    (TIEMPO 1 del cutover). Desde entonces la RPC corta con 42P01 y el endpoint se lo
 *    tragaba (`console.error` y seguía): cero comparables, las métricas caían al
 *    fallback que usa la PROPIA propiedad, la posición daba siempre "En rango de
 *    mercado" con 0%… y el crédito se descontaba igual. Un informe comparativo sin
 *    comparables, cobrado.
 *
 * 2. Nadie lo usaba. `broker_cma_uso` tiene 0 filas en toda su historia y
 *    `propiedades_broker` tiene 1 (la de prueba del founder). Por eso pasaron 3 días
 *    roto sin un solo reporte.
 *
 * 3. Su método ya no cumple el criterio fiduciario del proyecto: dictaba un rango
 *    mecánico (promedio de comparables ±5%) y usaba `dias_promedio: 60` escrito a mano.
 *    El ACM da rango con n declarado, y separa tipográficamente la recomendación del
 *    broker de la medición de Simón.
 *
 * ── Qué lo reemplaza ────────────────────────────────────────────────────────
 * `api/acm-pool.ts` + `api/acm-buscar.ts` + `acm-b7k2.html` (PR #71). Leen
 * `v_mercado_venta_shadow` / `v_estado_obra_inferido_shadow` / `proyectos_master`:
 * base viva, régimen TC nuevo. Resuelven la propiedad pegando la URL del aviso (por el
 * CÓDIGO, no la URL — sobrevive al slug reescrito de C21) y también aceptan carga a
 * mano, que es el caso de la captación no publicada.
 * Contexto: `docs/broker/ACM_CONTEXTO_ARRANQUE.md`.
 *
 * ── Lo único que se rescata de la v1 ────────────────────────────────────────
 * 🔴 El template del PDF, `lib/pdf/CMAPDFDocument.tsx` — NO SE TOCÓ y no se borra.
 * Se re-alimenta desde `buscar_acm()` el día que el PDF del ACM salga del backlog
 * (`docs/broker/PRD.md` §358-375: hoy está fuera del MVP a propósito).
 * Es exactamente lo que anticipaba `ACM_CONTEXTO_ARRANQUE.md` §"las tres trampas del
 * terreno", trampa 1: «No construir sobre esa rama; el template PDF sí se puede
 * reciclar re-alimentándolo desde buscar_acm».
 *
 * ── Cómo revertir ───────────────────────────────────────────────────────────
 * El cuerpo completo (auth, créditos, comparables, métricas, posición,
 * diferenciadores, PDF, storage, registro de uso) vive en git:
 *     git show accf9b9:simon-mvp/src/pages/api/broker/generate-cma.ts
 * Y reponer el botón "📊 CMA" en `pages/broker/dashboard.tsx` — el handler
 * `handleGenerateCMA` y su modal quedaron intactos ahí a propósito.
 *
 * ── Lo que NO se tocó ───────────────────────────────────────────────────────
 * Las tablas `brokers`, `propiedades_broker` y `broker_cma_uso`, ni los saldos
 * `cma_creditos`. Apagar es cerrar la puerta, no tirar los datos.
 */

import type { NextApiRequest, NextApiResponse } from 'next'

interface GenerateCMAResponse {
  success: boolean
  error?: string
  reemplazado_por?: string
}

export default async function handler(
  _req: NextApiRequest,
  res: NextApiResponse<GenerateCMAResponse>
) {
  return res.status(410).json({
    success: false,
    error: 'El CMA v1 fue reemplazado por el ACM. Este endpoint ya no genera informes.',
    reemplazado_por: '/api/acm-pool',
  })
}
