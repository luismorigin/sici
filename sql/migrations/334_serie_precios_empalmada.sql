-- =============================================================================
-- 334 · La curva historica de precios vuelve a avanzar — y aprende macrozonas
-- =============================================================================
-- EL SÍNTOMA: `/mercado/equipetrol/ventas` publica una curva de precios que se
-- detuvo el **21-jul-2026** y NO va a avanzar nunca más. Hoy es 20-ago: el
-- gráfico lleva un mes congelado sin decirlo.
--
-- POR QUÉ. La curva sale de `market_price_reexpresado`, que se llena con el
-- backfill manual `reconstruir_serie_precios_reexpresada()`. Esa función lee
-- `precios_historial` + `propiedades_v2_archivo` — y **las dos murieron el
-- 27-jul**, cuando se congeló el archivo de n8n. Correr el backfill hoy agrega
-- 6 días y después nada, para siempre.
--
-- 🔴 Esto invalida una instrucción del CLAUDE.md. La §"Tarea operativa
-- recurrente" manda correr ese backfill 1 vez por mes y lo describe como *"lo
-- ÚNICO de las páginas de mercado que NO se actualiza solo"*. Es peor que eso:
-- **ya no se actualiza ni a mano.** El cutover le cortó la fuente y nadie lo
-- notó porque el gráfico no falla — se queda quieto, que se ve igual que un
-- mercado tranquilo.
--
-- Y para **Zona Norte la curva nunca existió**: la función tiene las 6 zonas de
-- Equipetrol escritas a mano en su WHERE y no sabe qué es una macrozona.
--
-- =============================================================================
-- LA SOLUCIÓN: empalmar con la serie que SÍ vive
-- =============================================================================
-- `market_absorption_snapshots_shadow` se escribe **sola cada noche** (paso 5c
-- del cron híbrido) y **ya tiene macrozona** (mig 313). Trae `venta_usd_m2`,
-- que es la misma medida que la curva muestra.
--
-- Esta vista empalma los dos tramos:
--   · hasta el 20-jul → `market_price_reexpresado`  (historia, Equipetrol)
--   · del 21-jul en adelante → los snapshots shadow  (vivo, todas las macrozonas)
--
-- 🔑 EL EMPALME ESTÁ MEDIDO, NO SUPUESTO. En el día en que las dos series se
-- tocan (21-jul), dan lo mismo:
--        dorm   reexpresado   shadow     dif
--          0        1.715      1.757    +2,4%
--          1        1.700      1.700     0,0%   <- es el que dibuja la curva
--          2        1.611      1.613    +0,1%
--          3        1.608      1.597    -0,7%
-- Son dos métodos distintos (una estimación con ~7% de error declarado y una
-- medición directa) que convergen. **El empalme no genera escalón**, y por eso
-- se puede dibujar como una sola curva sin mentir. La verificación de abajo lo
-- vuelve a comprobar cada vez que se aplique esta migración.
--
-- CURVA RESULTANTE (Equipetrol, 1 dorm, $/m2 mediano por mes):
--   ene 2.059 · feb 2.061 · mar 2.015 · abr 1.886 · may 1.817 · jun 1.792
--   jul 1.714 (empalme) · ago 1.699
--
-- ⚠️ Y EN BOLIVIANOS LA HISTORIA ES OTRA: 19.768 en enero -> 19.692 en agosto.
-- En dólares el m2 bajó 17%; en bolivianos está donde empezó. Es la razón por
-- la que el CLAUDE.md prohíbe dar un % de variación sin declarar la moneda.
-- La vista devuelve las dos, más el TC, para que la página no pueda elegir mal.
--
-- =============================================================================
-- DECISIONES
-- =============================================================================
-- · **El corte del 3-ago (mig 314) NO afecta a esta curva.** Ese corte infló los
--   CONTEOS del 21-jul al 2-ago (contaban avisos ya dados de baja), no los
--   precios: medido a través del corte, el $/m2 va 1.700->1.704->1.700 sin salto.
--   Se usa el tramo completo. `props` sí queda inflado ahí y se declara abajo.
--
-- · **El TC del tramo vivo sale de `tc_binance_historial`**, que tiene huecos
--   (73 días con dato en 7,5 meses). Se resuelve con el último valor conocido
--   ANTES o EN esa fecha (`LEFT JOIN LATERAL`), nunca con el de hoy: un TC del
--   futuro reescribiría el pasado en bolivianos.
--
-- · **NO se le da SELECT a `anon`.** La vista lee los snapshots shadow, que anon
--   no puede leer — y las vistas corren con permisos del dueño, así que un GRANT
--   acá abriría por la ventana lo que la mig 317 cerró por la puerta. Se lee con
--   la llave de servidor, como ya hace `lib/mercado-shadow-data.ts`. Mismo
--   patrón que `v_estado_obra_inferido_shadow`.
--   🔑 Es la regla #13 al derecho: cerrar por default, abrir sólo lo que se usa.
--
-- · **`market_price_reexpresado` no se toca ni se borra.** Guarda los 6,5 meses
--   de historia y es irreemplazable: su fuente ya no existe. Deja de ser la
--   curva y pasa a ser su primer tramo.
--
-- · **La historia de ZN (jun-jul) NO se reconstruye acá.** Existe materia prima
--   (~12.000 registros en `precios_historial`), pero requiere desarmar el
--   hardcode de zonas de la función del backfill. Es un trabajo aparte y
--   opcional: sumaría 2 meses de pasado a una curva que ya arranca sola.
--
-- REVERSIBLE: es una vista nueva, no toca ninguna tabla. DROP y listo.
-- FORMATO: sigue a las migs 327-333.
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_serie_precios_venta AS
WITH tc_dia AS (
  -- el TC de cada día que tenga dato (la serie de Binance no es diaria)
  SELECT timestamp::date AS dia, AVG(tc_sell) AS tc
    FROM public.tc_binance_historial
   WHERE tc_sell > 0
   GROUP BY 1
),
corte AS (
  -- el empalme se calcula, no se escribe a mano: es el primer día que midió el
  -- cron híbrido. Si algún día se recarga la serie shadow, el corte se corre solo.
  SELECT MIN(fecha) AS desde_medido
    FROM public.market_absorption_snapshots_shadow
   WHERE macrozona = 'Equipetrol'
)
-- ── TRAMO 1: la historia (estimada, solo Equipetrol, hasta el corte) ─────────
SELECT 'Equipetrol'::text           AS macrozona,
       r.zona,
       r.dormitorios,
       r.fecha,
       r.usd_m2_mediana::numeric    AS usd_m2,
       r.bs_m2_mediana::numeric     AS bs_m2,
       r.tc_paralelo_fecha::numeric AS tc,
       r.precio_mediano::numeric    AS precio_mediano,
       r.props                      AS props,
       'historico'::text            AS fuente
  FROM public.market_price_reexpresado r
 CROSS JOIN corte c
 WHERE r.fecha < c.desde_medido
   AND r.usd_m2_mediana > 0

UNION ALL

-- ── TRAMO 2: la medicion viva (todas las macrozonas, del corte hasta hoy) ────
SELECT s.macrozona,
       s.zona,
       s.dormitorios,
       s.fecha,
       s.venta_usd_m2::numeric,
       ROUND(s.venta_usd_m2 * t.tc, 0),
       ROUND(t.tc, 4),
       s.venta_ticket_mediana::numeric,
       s.venta_activas,
       'medido'::text
  FROM public.market_absorption_snapshots_shadow s
  LEFT JOIN LATERAL (
    -- el ultimo TC conocido a esa fecha — nunca uno posterior
    SELECT d.tc FROM tc_dia d WHERE d.dia <= s.fecha ORDER BY d.dia DESC LIMIT 1
  ) t ON TRUE
 WHERE s.venta_usd_m2 > 0
   AND s.macrozona IS NOT NULL;

COMMENT ON VIEW public.v_serie_precios_venta IS
  'Serie de precios de venta por dia, zona y dormitorios — EMPALMADA y multi-macrozona (mig 334). '
  'Tramo "historico" = market_price_reexpresado (estimacion, ~7% de error, solo Equipetrol, hasta el 20-jul-2026). '
  'Tramo "medido" = market_absorption_snapshots_shadow (medicion del cron nocturno, todas las macrozonas). '
  'Verificado: en el dia del empalme las dos fuentes coinciden (1.700 vs 1.700 en 1 dorm). '
  'La columna `fuente` permite declararlo en la UI. '
  'OJO: `props` esta inflado entre el 21-jul y el 2-ago (corte de la mig 314: contaba avisos dados de baja); '
  'los PRECIOS de ese tramo no estan afectados. '
  'OJO: sin SELECT para anon a proposito — lee los snapshots shadow. Consumir con la llave de servidor.';

-- Mismo patron que v_estado_obra_inferido_shadow: sin anon, sin authenticated.
GRANT SELECT ON public.v_serie_precios_venta TO service_role, claude_readonly;

-- ── Verificacion: si algo de esto falla, la curva mentiria ───────────────────
DO $chk$
DECLARE
  n_macro     INT;
  n_hist      INT;
  n_med       INT;
  ult_medido  DATE;
  v_ant       NUMERIC;
  v_post      NUMERIC;
  brecha      NUMERIC;
  n_nulos     INT;
BEGIN
  -- 1) las dos macrozonas tienen curva
  SELECT COUNT(DISTINCT macrozona) INTO n_macro FROM public.v_serie_precios_venta;
  IF n_macro < 2 THEN
    RAISE EXCEPTION 'La vista solo tiene % macrozona(s); se esperaban al menos 2. Abortado.', n_macro;
  END IF;

  -- 2) los dos tramos existen (si falta uno, el empalme no ocurrio)
  SELECT COUNT(*) FILTER (WHERE fuente='historico'),
         COUNT(*) FILTER (WHERE fuente='medido')
    INTO n_hist, n_med FROM public.v_serie_precios_venta;
  IF n_hist = 0 OR n_med = 0 THEN
    RAISE EXCEPTION 'Tramos incompletos: historico=% medido=%. Abortado.', n_hist, n_med;
  END IF;

  -- 3) 🔴 LO QUE IMPORTA: el empalme no puede tener escalon. Se compara el ultimo
  --    tramo del historico contra el primero del medido, en la serie que
  --    efectivamente se dibuja (global, 1 dormitorio).
  SELECT AVG(usd_m2) INTO v_ant FROM public.v_serie_precios_venta
   WHERE zona='global' AND dormitorios=1 AND fuente='historico'
     AND fecha >= (SELECT MAX(fecha) FROM public.v_serie_precios_venta WHERE fuente='historico') - INTERVAL '14 days';
  SELECT AVG(usd_m2) INTO v_post FROM public.v_serie_precios_venta
   WHERE zona='global' AND dormitorios=1 AND fuente='medido' AND macrozona='Equipetrol'
     AND fecha <= (SELECT MIN(fecha) FROM public.v_serie_precios_venta WHERE fuente='medido') + INTERVAL '14 days';
  brecha := ABS(v_post - v_ant) / NULLIF(v_ant,0) * 100;
  IF brecha > 5 THEN
    RAISE EXCEPTION 'ESCALON en el empalme: % vs % (% pct). La curva daria un salto que no ocurrio en el mercado. Abortado.',
      ROUND(v_ant), ROUND(v_post), ROUND(brecha,1);
  END IF;

  -- 4) la curva llega hasta hoy (el motivo de toda esta migracion)
  SELECT MAX(fecha)::date INTO ult_medido FROM public.v_serie_precios_venta WHERE fuente='medido';
  IF ult_medido < CURRENT_DATE - 3 THEN
    RAISE EXCEPTION 'El tramo vivo llega al % y hoy es % — la serie shadow no esta avanzando. Abortado.', ult_medido, CURRENT_DATE;
  END IF;

  -- 5) nada sin precio ni sin TC (un NULL en bolivianos rompe la curva en silencio)
  SELECT COUNT(*) INTO n_nulos FROM public.v_serie_precios_venta
   WHERE usd_m2 IS NULL OR usd_m2 <= 0 OR bs_m2 IS NULL OR tc IS NULL OR tc <= 0;
  IF n_nulos > 0 THEN
    RAISE EXCEPTION 'Hay % filas sin precio o sin TC. Abortado.', n_nulos;
  END IF;

  RAISE NOTICE '✅ % macrozonas · historico % + medido % filas · empalme sin escalon (% vs %, % pct) · llega al %',
    n_macro, n_hist, n_med, ROUND(v_ant), ROUND(v_post), ROUND(brecha,1), ult_medido;
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- DROP VIEW IF EXISTS public.v_serie_precios_venta;
-- COMMIT;
