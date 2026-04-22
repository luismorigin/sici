-- Migración 226: función buscar_acm(propiedad_id)
-- Retorna el bloque ACM completo para una propiedad de venta:
--  - precio/m² vs cohort (mediana, p25, p75) + percentil
--  - tiempo en mercado vs mediana del cohort
--  - ranking dentro de la torre (si aplica)
--  - rango de valor estimado (p25*area, p75*area)
--  - yield estimado si cohort alquiler >=5 (p25 y p75 anualizado)
--  - histórico de precios (desde precios_historial)
--
-- Cohort = misma zona + mismos dormitorios + mismo estado_construccion
-- Yield cohort = misma zona + mismos dormitorios (alquileres ≤150d)
--
-- Alimentación del ACM inline en sheet del modo broker (docs/broker/PRD.md F1.1).

CREATE OR REPLACE FUNCTION public.buscar_acm(p_propiedad_id INTEGER)
RETURNS TABLE(
  propiedad_id INTEGER,
  precio_usd NUMERIC,
  precio_m2 NUMERIC,
  area_m2 NUMERIC,
  dormitorios INTEGER,
  zona TEXT,
  estado_construccion TEXT,
  dias_en_mercado INTEGER,
  cohort_size INTEGER,
  cohort_precio_m2_mediana NUMERIC,
  cohort_precio_m2_p25 NUMERIC,
  cohort_precio_m2_p75 NUMERIC,
  percentil_en_cohort INTEGER,
  cohort_mediana_dias INTEGER,
  ranking_torre_pos INTEGER,
  ranking_torre_total INTEGER,
  yield_cohort_size INTEGER,
  yield_low NUMERIC,
  yield_high NUMERIC,
  rango_valor_low NUMERIC,
  rango_valor_high NUMERIC,
  historico_precios JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_prop_zona TEXT;
  v_prop_dorms INTEGER;
  v_prop_estado TEXT;
  v_prop_proyecto INTEGER;
  v_prop_precio_norm NUMERIC;
  v_prop_area NUMERIC;
  v_prop_precio_m2 NUMERIC;
  v_prop_dias INTEGER;
BEGIN
  -- 1) Obtener datos base de la propiedad desde v_mercado_venta
  SELECT zona, dormitorios, estado_construccion::TEXT, id_proyecto_master, precio_norm, area_total_m2, precio_m2, dias_en_mercado
    INTO v_prop_zona, v_prop_dorms, v_prop_estado, v_prop_proyecto, v_prop_precio_norm, v_prop_area, v_prop_precio_m2, v_prop_dias
  FROM v_mercado_venta
  WHERE id = p_propiedad_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH cohort AS (
    SELECT v.id, v.precio_m2, v.dias_en_mercado
    FROM v_mercado_venta v
    WHERE v.zona = v_prop_zona
      AND v.dormitorios = v_prop_dorms
      AND v.estado_construccion::TEXT = v_prop_estado
  ),
  cohort_stats AS (
    SELECT
      COUNT(*)::INTEGER AS n,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.precio_m2) AS mediana_m2,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY c.precio_m2) AS p25_m2,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY c.precio_m2) AS p75_m2,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c.dias_en_mercado) AS mediana_dias
    FROM cohort c
  ),
  percentil AS (
    -- Percentil de esta propiedad dentro del cohort (basado en precio_m2)
    SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE c.precio_m2 <= v_prop_precio_m2) / NULLIF(COUNT(*), 0))::INTEGER AS pct
    FROM cohort c
  ),
  torre AS (
    -- Ranking dentro del mismo proyecto (solo si hay id_proyecto_master y >=2 unidades)
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE t.precio_m2 < v_prop_precio_m2)::INTEGER + 1 AS pos
    FROM v_mercado_venta t
    WHERE v_prop_proyecto IS NOT NULL
      AND t.id_proyecto_master = v_prop_proyecto
      AND t.dormitorios = v_prop_dorms
  ),
  yield_cohort AS (
    -- Cohort alquiler: misma zona + mismos dorms (alquileres ≤150d ya filtrado por la vista)
    SELECT
      COUNT(*)::INTEGER AS n,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY a.precio_mensual) AS alq_p25,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY a.precio_mensual) AS alq_p75
    FROM v_mercado_alquiler a
    WHERE a.zona = v_prop_zona
      AND a.dormitorios = v_prop_dorms
  ),
  historico AS (
    -- Ultimos cambios de precio (precios_historial)
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('fecha', h.fecha, 'precio_usd', h.precio_usd) ORDER BY h.fecha),
      '[]'::jsonb
    ) AS data
    FROM precios_historial h
    WHERE h.propiedad_id = p_propiedad_id
  )
  SELECT
    p_propiedad_id,
    ROUND(v_prop_precio_norm, 0),
    ROUND(v_prop_precio_m2, 0),
    ROUND(v_prop_area, 0),
    v_prop_dorms,
    v_prop_zona,
    v_prop_estado,
    v_prop_dias,
    cs.n,
    ROUND(cs.mediana_m2, 0),
    ROUND(cs.p25_m2, 0),
    ROUND(cs.p75_m2, 0),
    p.pct,
    ROUND(cs.mediana_dias)::INTEGER,
    CASE WHEN t.total >= 2 THEN t.pos END,
    CASE WHEN t.total >= 2 THEN t.total END,
    yc.n,
    CASE WHEN yc.n >= 5 THEN ROUND((yc.alq_p25 * 12 / NULLIF(v_prop_precio_norm, 0) * 100)::NUMERIC, 1) END,
    CASE WHEN yc.n >= 5 THEN ROUND((yc.alq_p75 * 12 / NULLIF(v_prop_precio_norm, 0) * 100)::NUMERIC, 1) END,
    ROUND(cs.p25_m2 * v_prop_area, 0),
    ROUND(cs.p75_m2 * v_prop_area, 0),
    h.data
  FROM cohort_stats cs
  CROSS JOIN percentil p
  CROSS JOIN torre t
  CROSS JOIN yield_cohort yc
  CROSS JOIN historico h;
END;
$$;

-- Permisos: claude_readonly y service_role pueden llamar
GRANT EXECUTE ON FUNCTION public.buscar_acm(INTEGER) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.buscar_acm(INTEGER) IS
  'Retorna el bloque ACM (Análisis Comparativo de Mercado) para una propiedad de venta. Usado por /broker/[slug] en modo broker. Migración 226, Abr 2026.';
