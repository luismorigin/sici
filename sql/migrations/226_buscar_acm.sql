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
-- v2 (226): LANGUAGE sql puro para evitar conflictos PL/pgSQL variable/column.

DROP FUNCTION IF EXISTS public.buscar_acm(INTEGER);

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
LANGUAGE sql
STABLE
AS $$
  WITH prop AS (
    SELECT
      v.id,
      v.zona AS p_zona,
      v.dormitorios AS p_dorms,
      v.estado_construccion::TEXT AS p_estado,
      v.id_proyecto_master AS p_proyecto,
      v.precio_norm AS p_precio_norm,
      v.area_total_m2 AS p_area,
      v.precio_m2 AS p_precio_m2,
      v.dias_en_mercado AS p_dias
    FROM v_mercado_venta v
    WHERE v.id = p_propiedad_id
  ),
  cohort AS (
    SELECT v.precio_m2 AS c_precio_m2, v.dias_en_mercado AS c_dias
    FROM v_mercado_venta v, prop
    WHERE v.zona = prop.p_zona
      AND v.dormitorios = prop.p_dorms
      AND v.estado_construccion::TEXT = prop.p_estado
  ),
  cohort_stats AS (
    SELECT
      COUNT(*)::INTEGER AS n,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c_precio_m2)::NUMERIC AS mediana_m2,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY c_precio_m2)::NUMERIC AS p25_m2,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY c_precio_m2)::NUMERIC AS p75_m2,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY c_dias)::NUMERIC AS mediana_dias
    FROM cohort
  ),
  percentil AS (
    SELECT
      ROUND(100.0 * COUNT(*) FILTER (WHERE c.c_precio_m2 <= prop.p_precio_m2) / NULLIF(COUNT(*), 0))::INTEGER AS pct
    FROM cohort c, prop
  ),
  torre AS (
    SELECT
      COUNT(*)::INTEGER AS total,
      (COUNT(*) FILTER (WHERE t.precio_m2 < prop.p_precio_m2) + 1)::INTEGER AS pos
    FROM v_mercado_venta t, prop
    WHERE prop.p_proyecto IS NOT NULL
      AND t.id_proyecto_master = prop.p_proyecto
      AND t.dormitorios = prop.p_dorms
  ),
  yield_cohort AS (
    -- Solo no-amobladas (o sin reportar) — amobladas tienen premium 15-30%
    -- que infla el yield artificialmente para propiedades de venta.
    SELECT
      COUNT(*)::INTEGER AS n,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY a.precio_mensual)::NUMERIC AS alq_p25,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY a.precio_mensual)::NUMERIC AS alq_p75
    FROM v_mercado_alquiler a, prop
    WHERE a.zona = prop.p_zona
      AND a.dormitorios = prop.p_dorms
      AND (a.amoblado IS NULL OR a.amoblado = 'no')
  ),
  historico AS (
    SELECT COALESCE(
      jsonb_agg(jsonb_build_object('fecha', h.fecha, 'precio_usd', h.precio_usd) ORDER BY h.fecha),
      '[]'::jsonb
    ) AS data
    FROM precios_historial h
    WHERE h.propiedad_id = p_propiedad_id
  )
  SELECT
    p_propiedad_id,
    ROUND(prop.p_precio_norm, 0),
    ROUND(prop.p_precio_m2, 0),
    ROUND(prop.p_area, 0),
    prop.p_dorms,
    prop.p_zona,
    prop.p_estado,
    prop.p_dias,
    cs.n,
    ROUND(cs.mediana_m2, 0),
    ROUND(cs.p25_m2, 0),
    ROUND(cs.p75_m2, 0),
    pct.pct,
    ROUND(cs.mediana_dias, 0)::INTEGER,
    CASE WHEN t.total >= 2 THEN t.pos END,
    CASE WHEN t.total >= 2 THEN t.total END,
    yc.n,
    CASE WHEN yc.n >= 5 THEN ROUND((yc.alq_p25 * 12 / NULLIF(prop.p_precio_norm, 0) * 100), 1) END,
    CASE WHEN yc.n >= 5 THEN ROUND((yc.alq_p75 * 12 / NULLIF(prop.p_precio_norm, 0) * 100), 1) END,
    ROUND(cs.p25_m2 * prop.p_area, 0),
    ROUND(cs.p75_m2 * prop.p_area, 0),
    h.data
  FROM prop
  CROSS JOIN cohort_stats cs
  CROSS JOIN percentil pct
  LEFT JOIN torre t ON TRUE
  CROSS JOIN yield_cohort yc
  CROSS JOIN historico h;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_acm(INTEGER) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.buscar_acm(INTEGER) IS
  'Retorna el bloque ACM (Análisis Comparativo de Mercado) para una propiedad de venta. Usado por /broker/[slug] en modo broker. Migración 226, Abr 2026.';
