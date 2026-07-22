-- =============================================================================
-- 289 · Serie reexpresada — guardar también el precio en BOLIVIANOS
-- =============================================================================
-- 🔑 POR QUÉ (hallazgo del 21-jul, al desenredar la pregunta del founder):
-- la caída del precio EN DÓLARES mezcla dos movimientos distintos:
--   (a) el vendedor bajó su precio, y
--   (b) el dólar se encareció (paralelo 9,47 en ene → 10,50 en jul, +11%).
-- Medido sobre la serie (1 dorm, $/m²):
--   en USD: 2.059 → 1.720  = **−16,5%**
--   en Bs : 19.499 → 18.069 = **−7,3%**
-- ⇒ **más de la mitad de la "caída en dólares" es el tipo de cambio, no el
--    inmueble.** Sin la serie en Bs, cualquiera lee −16,5% y concluye que el
--    mercado se derrumbó.
--
-- Las dos lecturas son válidas y responden preguntas DISTINTAS:
--   • en USD → qué le pasa a un comprador que tiene dólares (está más barato)
--   • en Bs  → qué le pasa al mercado local en su propia moneda (bajó menos)
-- Doctrina fiduciaria: publicar el número CON su unidad y con el movimiento del
-- TC al lado. Un porcentaje sin moneda no significa nada.
--
-- `tc_paralelo_fecha` se guarda por punto (promedio del `tc_paralelo_usado` de
-- las filas de esa fecha) para que la conversión sea auditable y reproducible.
-- =============================================================================

BEGIN;

ALTER TABLE public.market_price_reexpresado
  ADD COLUMN IF NOT EXISTS tc_paralelo_fecha NUMERIC(8,4),
  ADD COLUMN IF NOT EXISTS bs_m2_mediana INTEGER,
  ADD COLUMN IF NOT EXISTS bs_mediano INTEGER;

COMMENT ON COLUMN public.market_price_reexpresado.tc_paralelo_fecha IS
  'TC paralelo vigente en esa fecha (promedio de precios_historial.tc_paralelo_usado). '
  'Hace auditable la conversión USD↔Bs del punto. Migración 289.';
COMMENT ON COLUMN public.market_price_reexpresado.bs_m2_mediana IS
  'Precio por m² en BOLIVIANOS (usd_m2_mediana × TC de la fecha). Aísla el '
  'movimiento inmobiliario del movimiento cambiario: la caída en Bs (−7,3% ene→jul) '
  'es menos de la mitad de la caída en USD (−16,5%) porque el dólar subió 11%. '
  'Migración 289.';

CREATE OR REPLACE FUNCTION public.reconstruir_serie_precios_reexpresada()
RETURNS TABLE(fechas_procesadas INTEGER, filas_escritas INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  MIN_PROPS CONSTANT INTEGER := 5;
  v_filas INTEGER := 0;
  v_n INTEGER;
BEGIN
  WITH base AS (
    SELECT ph.fecha,
           ph.propiedad_id,
           ph.precio_usd::numeric        AS crudo,
           ph.tc_paralelo_usado::numeric AS tc_dia,
           COALESCE(sh.tipo_cambio_detectado, p.tipo_cambio_detectado) AS tag,
           (sh.id IS NOT NULL)           AS tag_es_del_reader,
           p.area_total_m2::numeric      AS area,
           COALESCE(p.dormitorios, -1)   AS dorm,
           p.zona
    FROM precios_historial ph
    JOIN propiedades_v2 p ON p.id = ph.propiedad_id
    LEFT JOIN propiedades_v2_shadow sh
           ON sh.id = ph.propiedad_id AND sh.tipo_operacion = 'venta'
    WHERE p.tipo_operacion = 'venta'
      AND p.zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND p.duplicado_de IS NULL
      AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
      AND COALESCE(p.tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
      AND p.area_total_m2 >= 20
      AND ph.precio_usd > 0
      AND ph.tc_paralelo_usado > 0
      AND COALESCE(p.dormitorios, -1) BETWEEN 0 AND 3
  ),
  calc AS (
    SELECT fecha, dorm, zona, area, tag, tag_es_del_reader, tc_dia,
           CASE
             WHEN tag = 'bob'           THEN crudo / tc_dia
             WHEN tag = 'oficial_viejo' THEN crudo * 6.96 / tc_dia
             ELSE crudo
           END AS precio_nuevo,
           (tag IN ('bob','oficial_viejo')) AS lleva_conversion,
           CASE WHEN tag = 'paralelo' THEN crudo * tc_dia / 6.96 ELSE crudo END AS precio_viejo
    FROM base
  ),
  agg AS (
    SELECT fecha, dorm, zona, COUNT(*) AS n, AVG(tc_dia) AS tc_prom,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo) AS med_nuevo,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_nuevo) AS p25_nuevo,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_nuevo) AS p75_nuevo,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo / NULLIF(area,0)) AS m2_nuevo,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo) AS med_viejo,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo / NULLIF(area,0)) AS m2_viejo,
           100.0 * COUNT(*) FILTER (WHERE tag = 'paralelo') / COUNT(*) AS pct_par,
           100.0 * COUNT(*) FILTER (WHERE tag_es_del_reader)  / COUNT(*) AS pct_reader,
           COUNT(*) FILTER (WHERE lleva_conversion) AS n_conv
    FROM calc GROUP BY fecha, dorm, zona
    UNION ALL
    SELECT fecha, dorm, 'global', COUNT(*), AVG(tc_dia),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo),
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_nuevo),
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_nuevo),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo / NULLIF(area,0)),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo / NULLIF(area,0)),
           100.0 * COUNT(*) FILTER (WHERE tag = 'paralelo') / COUNT(*),
           100.0 * COUNT(*) FILTER (WHERE tag_es_del_reader)  / COUNT(*),
           COUNT(*) FILTER (WHERE lleva_conversion)
    FROM calc GROUP BY fecha, dorm
  )
  INSERT INTO market_price_reexpresado (
    fecha, dormitorios, zona, props,
    precio_mediano, precio_p25, precio_p75, usd_m2_mediana,
    precio_mediano_viejo, usd_m2_mediana_vieja, pct_paralelo,
    pct_tag_reader, props_convertidas,
    tc_paralelo_fecha, bs_m2_mediana, bs_mediano, metodo
  )
  SELECT fecha, dorm, zona, n,
         ROUND(med_nuevo)::int, ROUND(p25_nuevo)::int, ROUND(p75_nuevo)::int, ROUND(m2_nuevo)::int,
         ROUND(med_viejo)::int, ROUND(m2_viejo)::int, ROUND(pct_par,1),
         ROUND(pct_reader,1), n_conv,
         ROUND(tc_prom,4), ROUND(m2_nuevo * tc_prom)::int, ROUND(med_nuevo * tc_prom)::int,
         'reexpresado_v3'
  FROM agg
  WHERE n >= MIN_PROPS
  ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
    props = EXCLUDED.props,
    precio_mediano = EXCLUDED.precio_mediano,
    precio_p25 = EXCLUDED.precio_p25,
    precio_p75 = EXCLUDED.precio_p75,
    usd_m2_mediana = EXCLUDED.usd_m2_mediana,
    precio_mediano_viejo = EXCLUDED.precio_mediano_viejo,
    usd_m2_mediana_vieja = EXCLUDED.usd_m2_mediana_vieja,
    pct_paralelo = EXCLUDED.pct_paralelo,
    pct_tag_reader = EXCLUDED.pct_tag_reader,
    props_convertidas = EXCLUDED.props_convertidas,
    tc_paralelo_fecha = EXCLUDED.tc_paralelo_fecha,
    bs_m2_mediana = EXCLUDED.bs_m2_mediana,
    bs_mediano = EXCLUDED.bs_mediano,
    metodo = EXCLUDED.metodo,
    created_at = NOW();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  SELECT COUNT(DISTINCT fecha) INTO v_n FROM market_price_reexpresado;
  fechas_procesadas := v_n;
  filas_escritas := v_filas;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconstruir_serie_precios_reexpresada() TO service_role;

COMMIT;

-- Post-apply: node scripts/deptos-equipetrol/reconstruir-serie-precios.mjs
-- Lectura de las dos curvas:
--   SELECT date_trunc('month',fecha)::date AS mes, ROUND(AVG(usd_m2_mediana)) AS usd_m2,
--          ROUND(AVG(tc_paralelo_fecha),2) AS tc, ROUND(AVG(bs_m2_mediana)) AS bs_m2
--   FROM market_price_reexpresado WHERE zona='global' AND dormitorios=1 GROUP BY 1 ORDER BY 1;
