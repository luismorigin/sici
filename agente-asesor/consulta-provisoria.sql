-- CONSULTA PROVISORIA — hasta que exista la función evaluar_oferta().
-- Se ejecuta TAL CUAL (solo se reemplazan los 3 valores de la fila `par`) para que dos
-- corridas con la misma entrada den las mismas cifras. Solo lectura. Vistas _shadow.
--
-- Parámetros (editar SOLO la fila `par`):
--   macrozona : 'Zona Norte' | 'Equipetrol'   (columna zona_general)
--   dorms     : 0 = monoambiente, 1, 2, 3...
--   m2        : metros cuadrados de la oferta
--   precio    : precio de la oferta en USD YA NORMALIZADO por moneda (ver playbook)
--
-- Devuelve UNA fila por nivel de comparación. El agente usa el nivel más estricto con n >= 5.
-- Limitaciones declaradas: no filtra por estado de obra ni por edificio (la función
-- definitiva sí); expensas no existen en la base; precios publicados, no de cierre.

WITH par AS (
  SELECT 'Zona Norte'::text AS macrozona, 0::int AS dorms, 32::numeric AS m2, 30000::numeric AS precio
),
venta AS (
  SELECT v.precio_m2, v.dias_en_mercado
  FROM v_mercado_venta_shadow v, par
  WHERE v.zona_general = par.macrozona
    AND v.dormitorios  = par.dorms
    AND v.area_total_m2 >= 20
    AND v.precio_m2 IS NOT NULL
),
alq AS (
  SELECT a.precio_mensual
  FROM v_mercado_alquiler_shadow a, par
  WHERE a.zona_general = par.macrozona
    AND a.dormitorios  = par.dorms
    AND a.precio_mensual IS NOT NULL
)
SELECT 'venta_macrozona' AS nivel,
       (SELECT count(*) FROM venta)                                                   AS n,
       round((SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY precio_m2) FROM venta)) AS p25,
       round((SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY precio_m2) FROM venta)) AS p50,
       round((SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY precio_m2) FROM venta)) AS p75,
       round((SELECT precio / m2 FROM par))                                           AS m2_oferta,
       round((SELECT 100.0 * count(*) FILTER (WHERE precio_m2 <= (SELECT precio / m2 FROM par))
                     / NULLIF(count(*), 0) FROM venta))                              AS percentil_oferta,
       round((SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY dias_en_mercado) FROM venta)) AS mediana_dias
UNION ALL
SELECT 'alquiler_macrozona_usd_mes',
       (SELECT count(*) FROM alq),
       round((SELECT percentile_cont(0.25) WITHIN GROUP (ORDER BY precio_mensual) FROM alq)),
       round((SELECT percentile_cont(0.50) WITHIN GROUP (ORDER BY precio_mensual) FROM alq)),
       round((SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY precio_mensual) FROM alq)),
       NULL, NULL, NULL;

-- Rendimiento bruto estimado (el agente lo calcula con las filas de arriba, solo si n >= 5):
--   rend_bajo = p25_alquiler * 12 / precio * 100
--   rend_alto = p75_alquiler * 12 / precio * 100
-- Las expensas NO están restadas (no hay dato): declararlo siempre.
