-- ============================================================================
-- Migración 120: Fix v_metricas_mercado - Filtrar propiedades antiguas
-- ============================================================================
-- Problema: La vista incluye propiedades con 768+ días en mercado, distorsionando
--           promedios, medianas y métricas de mercado
-- Solución: Agregar filtro de días (300 para normales, 730 para preventa)
-- ============================================================================

-- Recrear vista con filtro de antigüedad
CREATE OR REPLACE VIEW v_metricas_mercado AS
SELECT
    dormitorios,
    COALESCE(microzona, zona, 'Sin zona'::character varying) AS zona,
    count(*) AS stock,
    round(avg(precio_usd), 0) AS precio_promedio,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (precio_usd::double precision))::numeric, 0) AS precio_mediana,
    round(min(precio_usd), 0) AS precio_min,
    round(max(precio_usd), 0) AS precio_max,
    round(avg(area_total_m2), 1) AS area_promedio,
    round(avg(precio_usd / area_total_m2), 0) AS precio_m2,
    round(avg(CURRENT_DATE - fecha_publicacion), 0) AS dias_promedio,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY ((CURRENT_DATE - fecha_publicacion)::double precision))::numeric, 0) AS dias_mediana
FROM propiedades_v2
WHERE es_activa = true
    AND tipo_operacion = 'venta'::tipo_operacion_enum
    AND precio_usd > 30000::numeric
    AND area_total_m2 > 25::numeric
    AND (precio_usd / area_total_m2) >= 800::numeric
    AND (precio_usd / area_total_m2) <= 4000::numeric
    AND fecha_publicacion IS NOT NULL
    -- NUEVO: Filtro de antigüedad (300 días normales, 730 días preventa)
    AND (
        CASE
            WHEN estado_construccion = 'preventa' THEN
                CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 730
            ELSE
                CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 300
        END
    )
GROUP BY dormitorios, (COALESCE(microzona, zona, 'Sin zona'::character varying));

-- Verificar que la vista se creó correctamente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_views WHERE viewname = 'v_metricas_mercado'
    ) THEN
        RAISE EXCEPTION 'Error: vista v_metricas_mercado no existe después de la migración';
    END IF;

    RAISE NOTICE 'Migración 111 completada: v_metricas_mercado ahora filtra propiedades antiguas';
END $$;
