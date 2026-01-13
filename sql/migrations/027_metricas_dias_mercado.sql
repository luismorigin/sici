-- =====================================================
-- MIGRACIÓN 027: Agregar días en mercado a métricas
-- Fecha: 12 Enero 2026
-- Propósito: Umbrales dinámicos para síntesis fiduciaria
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Recrear vista con campos de días
-- NOTA: dias_en_mercado se calcula desde fecha_publicacion
CREATE OR REPLACE VIEW v_metricas_mercado AS
SELECT
    dormitorios,
    COALESCE(microzona, zona, 'Sin zona') as zona,
    COUNT(*) as stock,
    ROUND(AVG(precio_usd)::numeric, 0) as precio_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_usd)::numeric, 0) as precio_mediana,
    ROUND(MIN(precio_usd)::numeric, 0) as precio_min,
    ROUND(MAX(precio_usd)::numeric, 0) as precio_max,
    ROUND(AVG(area_total_m2)::numeric, 1) as area_promedio,
    ROUND(AVG(precio_usd / area_total_m2)::numeric, 0) as precio_m2,
    -- v2: Días en mercado para umbrales dinámicos (calculado desde fecha_publicacion)
    ROUND(AVG(CURRENT_DATE - fecha_publicacion)::numeric, 0) as dias_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY (CURRENT_DATE - fecha_publicacion))::numeric, 0) as dias_mediana
FROM propiedades_v2
WHERE es_activa = true
  AND tipo_operacion = 'venta'
  AND precio_usd > 30000
  AND area_total_m2 > 25
  AND (precio_usd / area_total_m2) BETWEEN 800 AND 4000
  AND fecha_publicacion IS NOT NULL  -- Solo contar las que tienen fecha
GROUP BY dormitorios, COALESCE(microzona, zona, 'Sin zona');

COMMENT ON VIEW v_metricas_mercado IS 'Métricas agregadas del mercado inmobiliario para Simón - v2 con días en mercado';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 027 - Verificación' as status;

SELECT
    zona,
    dormitorios,
    stock,
    dias_promedio,
    dias_mediana
FROM v_metricas_mercado
WHERE zona IN ('Equipetrol', 'Sirari', 'Villa Brigida')
ORDER BY zona, dormitorios;
