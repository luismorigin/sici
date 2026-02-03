-- ============================================================================
-- MIGRACIÓN 117: Copiar TC paralelo a columna directa
-- ============================================================================
-- Fecha: 3 Febrero 2026
-- Propósito: Las ediciones manuales guardaban TC paralelo en datos_json_enrichment
--            pero el TC Batch lee de la columna directa tipo_cambio_paralelo_usado
-- ============================================================================

-- Paso 1: Copiar TC paralelo desde datos_json_enrichment a columna directa
UPDATE propiedades_v2
SET tipo_cambio_paralelo_usado = (datos_json_enrichment->>'tipo_cambio_paralelo_usado')::NUMERIC
WHERE tipo_cambio_detectado = 'paralelo'
  AND tipo_cambio_paralelo_usado IS NULL
  AND datos_json_enrichment->>'tipo_cambio_paralelo_usado' IS NOT NULL
  AND es_activa = true;

-- Paso 2: Props TC paralelo sin dato en enrichment - usar TC histórico aproximado
-- (9.718 era el TC promedio cuando se hicieron la mayoría de ediciones en Enero 2026)
UPDATE propiedades_v2
SET tipo_cambio_paralelo_usado = 9.718
WHERE tipo_cambio_detectado = 'paralelo'
  AND tipo_cambio_paralelo_usado IS NULL
  AND es_activa = true;

-- Paso 3: Limpiar precio_usd_actualizado mal calculado para forzar recálculo
-- Esto hará que el batch TC nocturno recalcule con el TC paralelo correcto
UPDATE propiedades_v2
SET precio_usd_actualizado = NULL
WHERE tipo_cambio_detectado = 'paralelo'
  AND precio_usd_actualizado IS NOT NULL
  AND es_activa = true;

-- Verificación
SELECT
    'Fix TC paralelo columna' as operacion,
    COUNT(*) FILTER (WHERE tipo_cambio_paralelo_usado IS NOT NULL AND tipo_cambio_detectado = 'paralelo') as paralelo_con_tc,
    COUNT(*) FILTER (WHERE tipo_cambio_paralelo_usado IS NULL AND tipo_cambio_detectado = 'paralelo') as paralelo_sin_tc,
    COUNT(*) FILTER (WHERE precio_usd_actualizado IS NULL AND tipo_cambio_detectado = 'paralelo') as pendientes_recalculo
FROM propiedades_v2
WHERE es_activa = true;
