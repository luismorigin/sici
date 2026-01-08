-- Vista: Métricas de Mercado Equipetrol
-- Propósito: Proveer métricas agregadas para Simón (razón fiduciaria)
-- Fecha: 7 Enero 2026
-- Filtros: precio > $30k, area > 25m², $/m² entre $800-$4000

-- =============================================================================
-- 1. VISTA PRINCIPAL: Métricas por Tipología y Zona
-- =============================================================================

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
    ROUND(AVG(precio_usd / area_total_m2)::numeric, 0) as precio_m2
FROM propiedades_v2
WHERE es_activa = true
  AND tipo_operacion = 'venta'
  AND precio_usd > 30000
  AND area_total_m2 > 25
  AND (precio_usd / area_total_m2) BETWEEN 800 AND 4000
GROUP BY dormitorios, COALESCE(microzona, zona, 'Sin zona');

COMMENT ON VIEW v_metricas_mercado IS 'Métricas agregadas del mercado inmobiliario de Equipetrol para Simón';

-- =============================================================================
-- 2. VISTA: Resumen General del Mercado
-- =============================================================================

CREATE OR REPLACE VIEW v_mercado_resumen AS
SELECT
    COUNT(*) as total_propiedades,
    ROUND(AVG(precio_usd)::numeric, 0) as precio_promedio,
    ROUND(AVG(area_total_m2)::numeric, 1) as area_promedio,
    ROUND(AVG(precio_usd / area_total_m2)::numeric, 0) as precio_m2_promedio,
    ROUND(MIN(precio_usd / area_total_m2)::numeric, 0) as precio_m2_min,
    ROUND(MAX(precio_usd / area_total_m2)::numeric, 0) as precio_m2_max,
    COUNT(*) FILTER (WHERE dormitorios = 1) as stock_1d,
    COUNT(*) FILTER (WHERE dormitorios = 2) as stock_2d,
    COUNT(*) FILTER (WHERE dormitorios = 3) as stock_3d,
    COUNT(*) FILTER (WHERE dormitorios = 2 AND precio_usd < 120000) as stock_2d_bajo_120k,
    CURRENT_DATE as fecha_actualizacion
FROM propiedades_v2
WHERE es_activa = true
  AND tipo_operacion = 'venta'
  AND precio_usd > 30000
  AND area_total_m2 > 25
  AND (precio_usd / area_total_m2) BETWEEN 800 AND 4000;

COMMENT ON VIEW v_mercado_resumen IS 'Resumen ejecutivo del mercado para dashboard Simón';

-- =============================================================================
-- 3. FUNCIÓN: Obtener métricas para perfil específico
-- =============================================================================

CREATE OR REPLACE FUNCTION get_metricas_perfil(
    p_dormitorios INTEGER,
    p_precio_max NUMERIC DEFAULT NULL,
    p_zona TEXT DEFAULT NULL
)
RETURNS TABLE (
    total_opciones INTEGER,
    precio_promedio NUMERIC,
    precio_min NUMERIC,
    precio_max NUMERIC,
    precio_m2_promedio NUMERIC,
    zona_mas_barata TEXT,
    zona_precio_m2_min NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH base AS (
        SELECT
            p.precio_usd,
            p.area_total_m2,
            COALESCE(p.microzona, p.zona, 'Sin zona') as zona_prop
        FROM propiedades_v2 p
        WHERE p.es_activa = true
          AND p.tipo_operacion = 'venta'
          AND p.precio_usd > 30000
          AND p.area_total_m2 > 25
          AND (p.precio_usd / p.area_total_m2) BETWEEN 800 AND 4000
          AND p.dormitorios = p_dormitorios
          AND (p_precio_max IS NULL OR p.precio_usd <= p_precio_max)
          AND (p_zona IS NULL OR COALESCE(p.microzona, p.zona) = p_zona)
    ),
    zona_stats AS (
        SELECT
            zona_prop,
            ROUND(AVG(precio_usd / area_total_m2)::numeric, 0) as pm2
        FROM base
        GROUP BY zona_prop
        ORDER BY pm2 ASC
        LIMIT 1
    )
    SELECT
        COUNT(*)::INTEGER as total_opciones,
        ROUND(AVG(b.precio_usd)::numeric, 0) as precio_promedio,
        ROUND(MIN(b.precio_usd)::numeric, 0) as precio_min,
        ROUND(MAX(b.precio_usd)::numeric, 0) as precio_max,
        ROUND(AVG(b.precio_usd / b.area_total_m2)::numeric, 0) as precio_m2_promedio,
        z.zona_prop as zona_mas_barata,
        z.pm2 as zona_precio_m2_min
    FROM base b
    CROSS JOIN zona_stats z
    GROUP BY z.zona_prop, z.pm2;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_metricas_perfil IS 'Obtiene métricas filtradas para un perfil de búsqueda específico';

-- =============================================================================
-- 4. FUNCIÓN: Evaluar escasez de un perfil
-- =============================================================================

CREATE OR REPLACE FUNCTION evaluar_escasez(
    p_dormitorios INTEGER,
    p_precio_max NUMERIC
)
RETURNS TABLE (
    stock INTEGER,
    porcentaje_mercado NUMERIC,
    nivel_escasez TEXT,
    mensaje TEXT
) AS $$
DECLARE
    v_total INTEGER;
    v_stock INTEGER;
    v_pct NUMERIC;
BEGIN
    -- Total del mercado filtrado
    SELECT COUNT(*) INTO v_total
    FROM propiedades_v2
    WHERE es_activa = true
      AND tipo_operacion = 'venta'
      AND precio_usd > 30000
      AND area_total_m2 > 25
      AND (precio_usd / area_total_m2) BETWEEN 800 AND 4000;

    -- Stock del perfil
    SELECT COUNT(*) INTO v_stock
    FROM propiedades_v2
    WHERE es_activa = true
      AND tipo_operacion = 'venta'
      AND precio_usd > 30000
      AND area_total_m2 > 25
      AND (precio_usd / area_total_m2) BETWEEN 800 AND 4000
      AND dormitorios = p_dormitorios
      AND precio_usd <= p_precio_max;

    v_pct := ROUND(100.0 * v_stock / NULLIF(v_total, 0), 1);

    RETURN QUERY
    SELECT
        v_stock,
        v_pct,
        CASE
            WHEN v_pct < 3 THEN 'CRITICA'
            WHEN v_pct < 10 THEN 'ALTA'
            WHEN v_pct < 20 THEN 'MEDIA'
            ELSE 'BAJA'
        END,
        CASE
            WHEN v_pct < 3 THEN 'Solo ' || v_stock || ' unidades disponibles (' || v_pct || '%). Actuar rapido.'
            WHEN v_pct < 10 THEN 'Stock limitado: ' || v_stock || ' unidades (' || v_pct || '%). Comparar opciones pronto.'
            WHEN v_pct < 20 THEN 'Stock moderado: ' || v_stock || ' unidades (' || v_pct || '%). Tiempo para evaluar.'
            ELSE 'Amplia disponibilidad: ' || v_stock || ' unidades (' || v_pct || '%). Negociar con calma.'
        END;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION evaluar_escasez IS 'Evalúa el nivel de escasez para un perfil de búsqueda y genera mensaje para Simón';

-- =============================================================================
-- 5. EJEMPLOS DE USO
-- =============================================================================

/*
-- Métricas generales por tipología y zona
SELECT * FROM v_metricas_mercado ORDER BY dormitorios, stock DESC;

-- Resumen del mercado
SELECT * FROM v_mercado_resumen;

-- Métricas para perfil específico: 2D bajo $150k
SELECT * FROM get_metricas_perfil(2, 150000);

-- Métricas para 1D en Villa Brigida
SELECT * FROM get_metricas_perfil(1, NULL, 'Villa Brigida');

-- Evaluar escasez de 2D bajo $120k
SELECT * FROM evaluar_escasez(2, 120000);
-- Resultado esperado: CRITICA, "Solo 7 unidades disponibles (2%)..."

-- Evaluar escasez de 1D bajo $100k
SELECT * FROM evaluar_escasez(1, 100000);
-- Resultado esperado: MEDIA o BAJA
*/
