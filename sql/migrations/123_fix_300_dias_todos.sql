-- ============================================================================
-- Migración 123: 300 días para TODOS los estados (sin excepción preventa)
-- ============================================================================

CREATE OR REPLACE FUNCTION es_propiedad_vigente(
    p_estado_construccion TEXT,
    p_fecha_publicacion DATE,
    p_fecha_discovery TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
BEGIN
    -- 300 días para TODOS, sin importar estado_construccion
    RETURN CURRENT_DATE - COALESCE(p_fecha_publicacion, p_fecha_discovery::date) <= 300;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- También actualizar v_metricas_mercado para consistencia
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
    -- 300 días para TODOS
    AND CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 300
GROUP BY dormitorios, (COALESCE(microzona, zona, 'Sin zona'::character varying));

DO $$
BEGIN
    RAISE NOTICE 'Migración 123: 300 días aplicado a TODOS los estados';
END $$;
