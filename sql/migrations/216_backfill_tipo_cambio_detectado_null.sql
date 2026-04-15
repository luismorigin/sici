-- ============================================================================
-- Migración 216: Backfill tipo_cambio_detectado NULL
--
-- 83 props activas con tipo_cambio_detectado = NULL.
-- 77 de merge pre-v2.4 (no escribía el campo), 6 de post-v2.4.
-- Aplica misma lógica que merge v2.5+:
--   enrichment paralelo/oficial → usar enrichment
--   LLM paralelo/oficial con alta confianza → LLM upgrade
--   else → no_especificado
--
-- Impacto en precios: 1 prop (ID 186) con paralelo no detectado.
-- Las 28 oficiales no cambian precio (precio_normalizado solo ajusta paralelo).
-- Las 54 no_especificado → cosmético (NULL → 'no_especificado', mismo comportamiento).
--
-- Fecha: 2026-04-15
-- ============================================================================

-- PARTE 1: Props donde LLM detectó paralelo/oficial con alta confianza
-- Incluye 5 props con candado TC en NULL (candado accidental, verificado contra descripciones)
-- 29 props: 28 oficial + 1 paralelo
UPDATE propiedades_v2
SET tipo_cambio_detectado = datos_json_enrichment->'llm_output'->>'tipo_cambio_detectado'
WHERE tipo_operacion = 'venta'
  AND status = 'completado'
  AND es_activa = true
  AND tipo_cambio_detectado IS NULL
  AND datos_json_enrichment->'llm_output'->>'tipo_cambio_detectado' IN ('paralelo', 'oficial')
  AND datos_json_enrichment->'llm_output'->>'tipo_cambio_confianza' = 'alta';

-- PARTE 2: Resto → no_especificado (54 props)
UPDATE propiedades_v2
SET tipo_cambio_detectado = 'no_especificado'
WHERE tipo_operacion = 'venta'
  AND status = 'completado'
  AND es_activa = true
  AND tipo_cambio_detectado IS NULL;

-- VERIFICACIÓN: debe retornar 0
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND status = 'completado'
--   AND es_activa = true AND tipo_cambio_detectado IS NULL;
