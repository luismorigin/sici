-- =============================================================================
-- 288 · Serie reexpresada v2 — usar el tag REAL del reader + el TC de cada fecha
-- =============================================================================
-- 🔑 PREGUNTA QUE LO ORIGINA (founder, 21-jul): *"antes el TC oficial era 6.96 y
-- ahora es variable, ¿lo tomaste en cuenta?"*. Respuesta: en la v1 (mig 287) NO
-- del todo — era el límite #2 declarado. Esta migración lo cierra en la medida
-- en que la data lo permite.
--
-- EL PROBLEMA CONCRETO
-- El 75% de la historia (`precios_historial`) venía en BOB, y 17.165 filas se
-- convirtieron a USD con el TC oficial FIJO (ratio 6.96/7.00). Ese USD admite
-- dos lecturas y son incompatibles:
--   (a) el portal mostró Bs DERIVADO de un precio en USD (caso C21: Bs = USD×6.96)
--       → revertir con 6.96 recupera el USD real ⇒ va DIRECTO. ✅ v1 acertaba.
--   (b) el vendedor pedía Bs GENUINOS (caso Maré / Sky Luxury / Sky Moon)
--       → el USD real es Bs / TC_paralelo ⇒ ~35% MENOS. ❌ v1 sobrestimaba.
-- Distinguir (a) de (b) requiere LEER el anuncio — por eso el reader híbrido
-- inventó los tags `bob` y `oficial_viejo`, que en prod no existen.
--
-- LA MEJORA
-- El reader YA leyó y clasificó parte de ese inventario. Verificado:
--   `oficial_viejo` → 54 props, **54 con historia** (100%)
--   `bob`           → 26 props, **24 con historia**
-- ⇒ para esas ~78 props se usa el tag REAL (shadow) en vez de asumir directo, y
--   se aplica la conversión con el **`tc_paralelo_usado` DE CADA FECHA** (está
--   guardado por fila en `precios_historial`) — no con el TC de hoy. Eso es
--   exactamente lo que responde la pregunta del founder: el TC variable entra
--   fecha por fecha, no como constante.
--
-- Fórmula por fila (prioridad: tag de SHADOW > tag de prod):
--   `bob`           → crudo / tc_paralelo_de_esa_fecha
--   `oficial_viejo` → crudo × 6.96 / tc_paralelo_de_esa_fecha
--   resto           → crudo directo
--
-- LO QUE SIGUE SIN PODERSE (declarado, no se fabrica)
-- Las props que NUNCA pasaron por el reader (salieron del mercado antes del
-- híbrido) se quedan con el tag de prod → si alguna era caso (b), sigue
-- sobrestimada. Es un residual acotado y medible: el `desvio_vs_medida` que la
-- propia serie reporta contra la serie MEDIDA en el día de solapamiento.
--
-- Se agrega `pct_tag_reader` = qué proporción del punto usó el tag confiable.
-- Un punto con pct alto es más creíble que uno con pct 0 → el consumidor gatea.
-- =============================================================================

BEGIN;

ALTER TABLE public.market_price_reexpresado
  ADD COLUMN IF NOT EXISTS pct_tag_reader NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS props_convertidas INTEGER;

COMMENT ON COLUMN public.market_price_reexpresado.pct_tag_reader IS
  'Qué % de las props del punto usó el tag REAL del reader híbrido (leído del '
  'anuncio) en lugar del tag de prod. Más alto = punto más confiable. Migración 288.';
COMMENT ON COLUMN public.market_price_reexpresado.props_convertidas IS
  'Cuántas props del punto llevaron conversión efectiva (tag bob u oficial_viejo, '
  'con el TC de ESA fecha). El resto fue USD directo. Migración 288.';

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
           -- 🔑 tag del READER (leyó el anuncio) con fallback al de prod
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
    SELECT fecha, dorm, zona, area, tag, tag_es_del_reader,
           -- RÉGIMEN NUEVO con el TC de ESA fecha (no el de hoy)
           CASE
             WHEN tag = 'bob'           THEN crudo / tc_dia
             WHEN tag = 'oficial_viejo' THEN crudo * 6.96 / tc_dia
             ELSE crudo
           END AS precio_nuevo,
           (tag IN ('bob','oficial_viejo')) AS lleva_conversion,
           -- RÉGIMEN VIEJO (auditoría): solo `paralelo` se inflaba, con el TC del día
           CASE WHEN tag = 'paralelo' THEN crudo * tc_dia / 6.96 ELSE crudo END AS precio_viejo
    FROM base
  ),
  agg AS (
    SELECT fecha, dorm, zona, COUNT(*) AS n,
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
    SELECT fecha, dorm, 'global', COUNT(*),
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
    pct_tag_reader, props_convertidas, metodo
  )
  SELECT fecha, dorm, zona, n,
         ROUND(med_nuevo)::int, ROUND(p25_nuevo)::int, ROUND(p75_nuevo)::int, ROUND(m2_nuevo)::int,
         ROUND(med_viejo)::int, ROUND(m2_viejo)::int, ROUND(pct_par,1),
         ROUND(pct_reader,1), n_conv, 'reexpresado_v2'
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
    metodo = EXCLUDED.metodo,
    created_at = NOW();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  SELECT COUNT(DISTINCT fecha) INTO v_n FROM market_price_reexpresado;
  fechas_procesadas := v_n;
  filas_escritas := v_filas;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.reconstruir_serie_precios_reexpresada() IS
  'Backfill idempotente de market_price_reexpresado (v2, mig 288): recalcula la '
  'serie histórica de precios desde precios_historial aplicando el régimen TC '
  'nuevo, usando el tag REAL del reader híbrido cuando la prop pasó por él y el '
  'TC paralelo DE CADA FECHA para las conversiones (bob / oficial_viejo). '
  'Guarda el régimen viejo al lado para auditar. Migs 287 (base) + 288 (tag reader).';

GRANT EXECUTE ON FUNCTION public.reconstruir_serie_precios_reexpresada() TO service_role;

COMMIT;

-- Post-apply: re-correr el backfill (idempotente) y volver a medir el error
--   node scripts/deptos-equipetrol/reconstruir-serie-precios.mjs
