-- =====================================================
-- Migración 140: Rescatar precios de alquileres desde datos_json_discovery
-- Propósito: Llenar precio_mensual_bob/usd para 61 alquileres existentes
-- Fecha: 11 Feb 2026
-- Prerequisito: 135 (columnas), 139 (reactivación)
-- =====================================================
-- Las 61 propiedades alquiler tienen precio en datos_json_discovery->price->amount
-- (en BOB, currency_id=1) pero precio_mensual_bob está NULL porque
-- fueron scrapeadas por el pipeline de venta original.
-- Esta migración rescata los precios y recalcula es_para_matching.
-- =====================================================

-- PASO 1: Llenar precio_mensual_bob y precio_mensual_usd desde JSON
UPDATE propiedades_v2
SET
    precio_mensual_bob = (datos_json_discovery->'price'->>'amount')::NUMERIC,
    precio_mensual_usd = ROUND((datos_json_discovery->'price'->>'amount')::NUMERIC / 6.96, 2),
    precio_usd = ROUND((datos_json_discovery->'price'->>'amount')::NUMERIC / 6.96, 2),
    moneda_original = 'BOB',
    fecha_actualizacion = NOW()
WHERE
    tipo_operacion = 'alquiler'
    AND precio_mensual_bob IS NULL
    AND datos_json_discovery->'price'->>'amount' IS NOT NULL;

-- PASO 2: Recalcular es_para_matching
UPDATE propiedades_v2
SET
    es_para_matching = (
        precio_mensual_bob IS NOT NULL
        AND area_total_m2 IS NOT NULL
        AND dormitorios IS NOT NULL
    )
WHERE tipo_operacion = 'alquiler';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
/*
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE precio_mensual_bob IS NOT NULL) as con_precio,
  COUNT(*) FILTER (WHERE es_para_matching) as para_matching,
  ROUND(AVG(precio_mensual_bob), 0) as precio_promedio_bob,
  MIN(precio_mensual_bob) as min_bob,
  MAX(precio_mensual_bob) as max_bob
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler';
*/
