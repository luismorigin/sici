-- Migración 193: Vistas canónicas de mercado
-- Problema: queries ad-hoc repetían 8+ cláusulas WHERE y omitían filtros
-- (es_multiproyecto, enum preventa, precio_mensual_usd en alquileres).
-- Solución: vistas que pre-aplican filtros canónicos + campos calculados.

BEGIN;

-- =============================================================
-- v_mercado_venta: props de venta con filtros canónicos aplicados
-- =============================================================
CREATE OR REPLACE VIEW v_mercado_venta AS
SELECT
  p.*,
  precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) AS precio_norm,
  precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)
    / NULLIF(p.area_total_m2, 0) AS precio_m2,
  CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) AS dias_en_mercado
FROM propiedades_v2 p
WHERE p.status IN ('completado', 'actualizado')
  AND p.tipo_operacion = 'venta'
  AND p.duplicado_de IS NULL
  AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
  AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
  AND p.area_total_m2 >= 20
  AND p.zona IS NOT NULL
  AND p.precio_usd > 0
  AND CASE
        WHEN COALESCE(p.estado_construccion::text, '') IN ('preventa', 'en_construccion', 'en_pozo')
        THEN CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) <= 730
        ELSE CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) <= 300
      END;

COMMENT ON VIEW v_mercado_venta IS
  'Props de venta con filtros canónicos (FILTROS_CALIDAD_MERCADO.md). '
  'Campos calculados: precio_norm, precio_m2 (normalizados), dias_en_mercado. '
  'Usar para queries ad-hoc en vez de filtrar propiedades_v2 directamente.';

-- =============================================================
-- v_mercado_alquiler: props de alquiler con filtros canónicos
-- =============================================================
CREATE OR REPLACE VIEW v_mercado_alquiler AS
SELECT
  p.*,
  p.precio_mensual_usd AS precio_mensual,
  CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) AS dias_en_mercado
FROM propiedades_v2 p
WHERE p.tipo_operacion = 'alquiler'
  AND p.status IN ('completado', 'actualizado')
  AND p.duplicado_de IS NULL
  AND p.area_total_m2 >= 20
  AND p.precio_mensual_usd > 0;

COMMENT ON VIEW v_mercado_alquiler IS
  'Props de alquiler con filtros canónicos. '
  'precio_mensual = precio_mensual_usd. Usar precio_mensual_usd o precio_mensual_bob, '
  'NUNCA precio_usd (solo ~15% poblado en alquileres). dias_en_mercado calculado. '
  'Usar para queries ad-hoc en vez de filtrar propiedades_v2 directamente.';

-- Verificar
SELECT 'v_mercado_venta' as vista, COUNT(*) as filas FROM v_mercado_venta
UNION ALL
SELECT 'v_mercado_alquiler', COUNT(*) FROM v_mercado_alquiler;

COMMIT;
