-- =============================================================================
-- 287 · Serie histórica de precios REEXPRESADA al régimen TC nuevo
-- =============================================================================
-- QUÉ RESUELVE: al lanzar el TC nuevo (21-jul) la app muestra precios reales,
-- pero la serie histórica de `market_absorption_snapshots` quedó en régimen
-- viejo (inflado) → el gráfico de evolución de /mercado quedó "en construcción"
-- y la nueva serie shadow arranca de cero. Esto recupera **6,5 meses de forma
-- de la curva** sin esperar 60 días.
--
-- 🔑 POR QUÉ SE PUEDE (el plan de cutover lo daba por imposible — se equivocaba):
-- `precios_historial` guarda, para ~59 fechas desde el 3-ene-2026, el **precio
-- CRUDO por propiedad** (`precio_usd`) + el TC de ese día (`tc_paralelo_usado`).
-- Es decir: NO hay que "des-inflar" un agregado — se recalcula propiedad por
-- propiedad desde el crudo real de cada fecha. Y la lista de props de cada
-- fecha ES el inventario activo de esa fecha (lo que el plan creía perdido
-- porque `fecha_discovery` se pisa, regla 11).
--
-- ✅ VALIDACIÓN (hecha antes de escribir esto, 21-jul, segmento 1 dorm):
--    reconstruido: 146 props · mediana régimen viejo $113.299
--    snapshot real: 146 props · mediana $116.291   → conteo EXACTO, precio 2,6%
--    Reproducir el número viejo desde el crudo prueba que el inventario
--    reconstruido es correcto → aplicarle la fórmula nueva es legítimo.
--
-- LA CONVERSIÓN (por qué es simple y defendible):
--   Régimen viejo: `paralelo` → precio_usd × tc/6.96 (INFLA ~×1.5); resto → directo
--   Régimen nuevo: `paralelo`/`oficial`/`no_especificado` → precio_usd DIRECTO
--   ⇒ reexpresar = **dejar de inflar las `paralelo`**. Nada más. No se inventa
--     ningún valor: el crudo es el que el vendedor pedía ese día.
--   Impacto medido: 82,5% del inventario histórico tiene tag `paralelo`.
--
-- ⚠️ LÍMITES DECLARADOS (esto es una ESTIMACIÓN, no una medición):
--  1. **Tag de TC actual, no histórico.** `precios_historial` no guarda el tag;
--     se usa el de `propiedades_v2` hoy. Supuesto razonable (el tag describe el
--     anuncio, no el mercado), pero es un supuesto.
--  2. **No identifica `oficial_viejo`.** Ese tag lo inventó el reader híbrido;
--     en prod no existe. Las props ancladas a "6.96" explícito deberían
--     DESCONTARSE y acá quedan directas → la serie queda algo ALTA. En shadow
--     hoy son ~10% del inventario.
--  3. **Arrastra errores de precio que el híbrido corrigió** (el MOAT re-leyó y
--     corrigió precios corruptos; la data vieja los conserva).
--  4. **Filtros de calidad con el estado de HOY** (duplicado_de, es_multiproyecto,
--     tipo): no se puede saber si una prop estaba marcada duplicada en marzo.
--  5. **Granularidad ~2 fechas por semana**, no diaria. Suficiente para precios
--     inmobiliarios (no se mueven día a día); insuficiente para intradía.
--
-- 📏 ERROR DE MÉTODO MEDIBLE: en el día donde conviven las dos formas de medir
-- (21-jul, 1 dorm): reexpresado $94.146 vs shadow medido $88.000 = **~7%**.
-- Ese desvío es principalmente el límite 2 (oficial_viejo sin identificar) + 3.
-- La serie DEBE publicarse con ese caveat. Una estimación con su error medido
-- es honesta; sin él, es fabricación.
--
-- 🔴 USO: sirve para **la FORMA DE LA CURVA** (¿subieron o bajaron los precios
-- en estos 6 meses?). NO sirve para afirmar "el m² valía exactamente $X en
-- marzo". Tabla APARTE y `metodo='reexpresado'` justamente para que nunca se
-- confunda con la medición directa (`market_absorption_snapshots_shadow`).
-- Doctrina: LIMITES_DATA_FIDUCIARIA.md (matriz verde/amarillo/rojo → esto es
-- AMARILLO: estimado, declarado como tal).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabla
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_price_reexpresado (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  dormitorios INTEGER NOT NULL,
  zona TEXT NOT NULL,
  props INTEGER NOT NULL,
  -- Régimen NUEVO (reexpresado) — lo que se grafica
  precio_mediano INTEGER,
  precio_p25 INTEGER,
  precio_p75 INTEGER,
  usd_m2_mediana INTEGER,
  -- Régimen VIEJO recalculado con el mismo inventario — sirve para AUDITAR
  -- (debe aproximar al snapshot de esa fecha) y para mostrar el antes/después
  precio_mediano_viejo INTEGER,
  usd_m2_mediana_vieja INTEGER,
  -- Transparencia: qué proporción del segmento cambió de valor al reexpresar
  pct_paralelo NUMERIC(5,1),
  metodo TEXT NOT NULL DEFAULT 'reexpresado',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mpr_unq UNIQUE (fecha, dormitorios, zona)
);

COMMENT ON TABLE public.market_price_reexpresado IS
  'Serie histórica de precios de venta Equipetrol REEXPRESADA al régimen TC '
  'nuevo, reconstruida propiedad-por-propiedad desde precios_historial (crudo + '
  'TC por fecha). ⚠️ ES UNA ESTIMACIÓN, NO UNA MEDICIÓN: úsese para la FORMA DE '
  'LA CURVA, nunca para afirmar el nivel exacto de una fecha. Error de método '
  'medido en el solapamiento (21-jul): ~7% vs la serie medida. Límites en el '
  'header de la migración 287 (tag actual no histórico; no identifica '
  'oficial_viejo → queda ~alta; arrastra errores que el híbrido corrigió). '
  'Serie MEDIDA (la buena, desde 21-jul): market_absorption_snapshots_shadow. '
  'Serie de prod (régimen viejo): market_absorption_snapshots.';

CREATE INDEX IF NOT EXISTS mpr_idx_fecha ON public.market_price_reexpresado(fecha DESC);

-- Preset D — Operacional interna. 🔴 REVOKE primero: toda tabla nueva en public
-- nace con anon/authenticated en ALL por los default privileges (lección mig 284).
REVOKE ALL ON public.market_price_reexpresado FROM anon;
REVOKE ALL ON public.market_price_reexpresado FROM authenticated;
REVOKE ALL ON SEQUENCE public.market_price_reexpresado_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.market_price_reexpresado_id_seq FROM authenticated;
GRANT ALL    ON public.market_price_reexpresado TO service_role;
GRANT SELECT ON public.market_price_reexpresado TO claude_readonly;
GRANT USAGE, SELECT ON SEQUENCE public.market_price_reexpresado_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Función de backfill (idempotente — re-correrla mejora/actualiza la serie)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconstruir_serie_precios_reexpresada()
RETURNS TABLE(fechas_procesadas INTEGER, filas_escritas INTEGER)
LANGUAGE plpgsql
AS $$
DECLARE
  MIN_PROPS CONSTANT INTEGER := 5;  -- bajo esto no se publica el punto (ruido)
  v_fechas INTEGER := 0;
  v_filas INTEGER := 0;
  v_n INTEGER;
BEGIN
  -- Inventario reconstruido: la lista de props de cada fecha en precios_historial
  -- ES el inventario activo de esa fecha. Filtros de calidad canónicos con el
  -- estado de HOY (límite 4 del header).
  WITH base AS (
    SELECT ph.fecha,
           ph.propiedad_id,
           ph.precio_usd::numeric              AS crudo,
           ph.tc_paralelo_usado::numeric       AS tc_dia,
           p.tipo_cambio_detectado             AS tag,
           p.area_total_m2::numeric            AS area,
           COALESCE(p.dormitorios, -1)         AS dorm,
           p.zona
    FROM precios_historial ph
    JOIN propiedades_v2 p ON p.id = ph.propiedad_id
    WHERE p.tipo_operacion = 'venta'
      AND p.zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND p.duplicado_de IS NULL
      AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
      AND COALESCE(p.tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
      AND p.area_total_m2 >= 20
      AND ph.precio_usd > 0
      AND COALESCE(p.dormitorios, -1) BETWEEN 0 AND 3
  ),
  -- Los dos regímenes sobre el MISMO crudo y el MISMO inventario
  calc AS (
    SELECT fecha, dorm, zona, area, tag,
           -- NUEVO: paralelo/oficial/no_especificado → USD directo
           crudo AS precio_nuevo,
           -- VIEJO: solo `paralelo` se inflaba, con el TC de ESE día
           CASE WHEN tag = 'paralelo' THEN crudo * tc_dia / 6.96 ELSE crudo END AS precio_viejo
    FROM base
  ),
  -- Agregado por fecha × dorm × zona, y el mismo agregado con zona='global'
  agg AS (
    SELECT fecha, dorm, zona, COUNT(*) AS n,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo) AS med_nuevo,
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_nuevo) AS p25_nuevo,
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_nuevo) AS p75_nuevo,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo / NULLIF(area,0)) AS m2_nuevo,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo) AS med_viejo,
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo / NULLIF(area,0)) AS m2_viejo,
           100.0 * COUNT(*) FILTER (WHERE tag = 'paralelo') / COUNT(*) AS pct_par
    FROM calc GROUP BY fecha, dorm, zona
    UNION ALL
    SELECT fecha, dorm, 'global', COUNT(*),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo),
           PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_nuevo),
           PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_nuevo),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_nuevo / NULLIF(area,0)),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo),
           PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_viejo / NULLIF(area,0)),
           100.0 * COUNT(*) FILTER (WHERE tag = 'paralelo') / COUNT(*)
    FROM calc GROUP BY fecha, dorm
  )
  INSERT INTO market_price_reexpresado (
    fecha, dormitorios, zona, props,
    precio_mediano, precio_p25, precio_p75, usd_m2_mediana,
    precio_mediano_viejo, usd_m2_mediana_vieja, pct_paralelo, metodo
  )
  SELECT fecha, dorm, zona, n,
         ROUND(med_nuevo)::int, ROUND(p25_nuevo)::int, ROUND(p75_nuevo)::int, ROUND(m2_nuevo)::int,
         ROUND(med_viejo)::int, ROUND(m2_viejo)::int, ROUND(pct_par,1), 'reexpresado'
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
    created_at = NOW();

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  SELECT COUNT(DISTINCT fecha) INTO v_n FROM market_price_reexpresado;
  v_fechas := v_n;

  fechas_procesadas := v_fechas;
  filas_escritas := v_filas;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.reconstruir_serie_precios_reexpresada() IS
  'Backfill idempotente de market_price_reexpresado: recalcula la serie de '
  'precios histórica desde precios_historial (crudo por prop y fecha) aplicando '
  'el régimen TC nuevo, y guarda en paralelo el régimen viejo para auditar. '
  'Se corre a mano (no va en el cron: es histórico, no cambia). Migración 287.';

GRANT EXECUTE ON FUNCTION public.reconstruir_serie_precios_reexpresada() TO service_role;

COMMIT;

-- -----------------------------------------------------------------------------
-- Post-apply: correr el backfill y auditar
-- -----------------------------------------------------------------------------
-- SELECT * FROM reconstruir_serie_precios_reexpresada();
--
-- AUDITORÍA (el régimen viejo recalculado debe aproximar al snapshot real):
--   SELECT r.fecha, r.props, r.precio_mediano_viejo, s.venta_ticket_mediana AS snapshot_real,
--          ROUND(100.0*(r.precio_mediano_viejo - s.venta_ticket_mediana)/s.venta_ticket_mediana,1) AS desvio_pct,
--          r.precio_mediano AS reexpresado
--   FROM market_price_reexpresado r
--   JOIN market_absorption_snapshots s USING (fecha, dormitorios, zona)
--   WHERE r.zona='global' AND r.dormitorios=1 ORDER BY r.fecha DESC LIMIT 20;
--
-- ROLLBACK:
--   ALTER TABLE public.market_price_reexpresado RENAME TO _trash_market_price_reexpresado;
--   DROP FUNCTION public.reconstruir_serie_precios_reexpresada();
