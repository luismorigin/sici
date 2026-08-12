-- ============================================================================
-- 321 — El bot daba timeout justo cuando el cliente dice cuánto quiere gastar
-- ============================================================================
-- Fecha: 2026-08-12
--
-- SÍNTOMA: "Estoy teniendo un problema técnico para consultar el mercado".
--   Medido por HTTP con la clave del bot:
--     venta SIN presupuesto ........ 0,90 s  200 ✅
--     venta CON presupuesto ........ 3,36 s  500 ❌   ← statement_timeout
--     alquiler CON presupuesto ..... 0,64 s  200 ✅
--     buscar_propiedades venta+ppto  3,35 s  500 ❌
--   O sea: se rompe SOLO en venta y SOLO cuando hay presupuesto, que es el caso
--   más común de todos.
--
-- 🔴 LA CAUSA **NO** ES EL TIPO DE CAMBIO. Se investigó primero esa hipótesis
--   (que `precio_normalizado_shadow` hace un SELECT a `config_global` por fila) y
--   se **descartó midiendo**: reemplazando la función por el TC ya resuelto como
--   número fijo, la consulta baja de 4.328 ms a 4.003 ms — **7,5%** — y el plan de
--   ejecución queda IDÉNTICO. Habría seguido dando timeout.
--
-- LA CAUSA REAL: el planner estima **1 fila** para el scan filtrado (los filtros
--   son funciones y CASE, cuya selectividad no sabe calcular), así que elige un
--   **Nested Loop**. Las filas reales son **542**, y en cada una vuelve a resolver
--   el LEFT JOIN con `v_zona_efectiva_shadow` (mig 316), que recalcula 1.499 filas
--   con un GROUP BY y un ST_Distance de PostGIS:
--
--     Nested Loop Left Join  (actual rows=542)
--       Rows Removed by Join Filter: 811916        ← 812 mil combinaciones
--       ->  Hash Left Join  (rows=1499, loops=542) ← 542 veces
--
--   Por eso "sin presupuesto" anda: el filtro es menos selectivo, el planner
--   estima más filas y elige un Hash Join.
--
-- 🔑 No lo rompió el TC ni los permisos: lo rompió que **a la vista se le agregó
--   trabajo** (mig 316, 7-ago, la que arregló los edificios repartidos en dos
--   zonas) y la consulta del bot lo multiplica por 542. Nadie lo notó porque entre
--   el 24-jul y el 11-ago **nadie le preguntó nada al bot**.
--
-- EL FIX: forzar que la vista se evalúe UNA sola vez (`WITH ... AS MATERIALIZED`)
--   y filtrar después sobre el resultado en memoria. Medido:
--
--     hoy ....................... 4.328 ms
--     con el CTE materializado ...... 18 ms      ← 237× más rápido
--
--   Y de paso las TRES pasadas de `resumen_mercado` (general / por_zona /
--   por_estado) pasan a leer el mismo CTE en vez de recorrer la vista tres veces.
--
-- ── VERIFICADO QUE NO DAÑA NADA MÁS (el pedido explícito del founder) ────────
--   1. RESULTADO IDÉNTICO, comparado con `=` sobre el jsonb completo en 3 casos:
--        · venta con precio_max=120000 .... idéntico (250 props, mediana 77.150)
--        · venta sin filtros .............. idéntico
--        · venta zona='Sirari' + 2 dorms .. idéntico
--   2. CONSUMIDORES: el ÚNICO es el bot (`lab-kapso/workflows/simon/workflow.js`).
--        · el sitio: **0 archivos** las nombran (verificado sobre simon-mvp/src)
--        · otras funciones SQL: **0** las llaman
--        · scripts: 5 coincidencias, **las 5 en archivos .md** (documentación)
--        · n8n: 0
--   3. LA RAMA DE ALQUILER NO SE TOCA. Hoy responde en 0,6 s porque filtra por
--      `precio_mensual_bob`, que es una columna real y el planner sí sabe estimar.
--      Se copia textual de la definición viva. **No se toca lo que funciona** —
--      sobre todo con el bot caído.
--   4. La firma, el tipo de retorno, `SECURITY DEFINER` y `SET search_path` se
--      conservan exactamente (la 320 los acaba de fijar).
--
-- ⚠️ NO se marca `precio_normalizado_shadow` como IMMUTABLE. Es la reacción
--   natural al verla STABLE y sería un error: lee `config_global`, así que
--   declararla inmutable es mentirle al planner, y con un índice funcional encima
--   los precios quedarían congelados con un TC viejo. Silencioso y carísimo.
--   Con este fix, además, no hace falta tocarla.
--
-- 🔴 Definición viva exportada con `pg_get_functiondef()` ANTES de escribir esto
--   (regla #7). El rollback al pie es esa definición, textual.
--
-- RIESGO CONOCIDO QUE QUEDA: la vista de ALQUILER tiene el mismo join de la 316.
--   Hoy no duele porque el planner acierta la estimación. Si mañana el filtro de
--   alquiler pasara por una función, aparecería el mismo timeout. No se toca ahora
--   —no romper lo que anda— pero queda declarado.
-- ============================================================================

-- ── 1. resumen_mercado ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resumen_mercado(
  p_operacion text,
  p_zona text DEFAULT NULL::text,
  p_dorms integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resultado jsonb;
BEGIN
  IF p_operacion = 'venta' THEN
    -- `MATERIALIZED` es el fix: obliga a resolver la vista UNA vez (18 ms) en vez
    -- de que el planner la meta en un Nested Loop y la repita 542 veces (4,3 s).
    WITH base AS MATERIALIZED (
      SELECT precio_norm, zona, zona_general, dormitorios, estado_construccion
      FROM v_mercado_venta_shadow
    ),
    f AS (
      SELECT * FROM base
      WHERE precio_norm >= 20000
        AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
    )
    SELECT jsonb_build_object(
      'moneda', 'USD',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_norm)::int,
          'hasta',   MAX(precio_norm)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)::int
        ) FROM f
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(precio_norm)::int) AS t
          FROM f GROUP BY zona
        ) s
      ),
      'por_estado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('estado', estado_construccion::text, 'cant', COUNT(*)) AS t
          FROM f GROUP BY estado_construccion
        ) s
      )
    ) INTO resultado;
  ELSE
    -- ⚠️ RAMA DE ALQUILER: textual de la definición viva. Responde en 0,6 s.
    SELECT jsonb_build_object(
      'moneda', 'Bs',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_mensual_bob)::int,
          'hasta',   MAX(precio_mensual_bob)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob)::int
        )
        FROM v_mercado_alquiler_shadow
        WHERE precio_mensual_bob >= 1000
          AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
          AND (p_dorms IS NULL OR dormitorios = p_dorms)
          AND (p_precio_max IS NULL OR precio_mensual_bob <= p_precio_max)
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(precio_mensual_bob)::int) AS t
          FROM v_mercado_alquiler_shadow
          WHERE precio_mensual_bob >= 1000
            AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
            AND (p_dorms IS NULL OR dormitorios = p_dorms)
            AND (p_precio_max IS NULL OR precio_mensual_bob <= p_precio_max)
          GROUP BY zona
        ) s
      ),
      'por_amoblado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('amoblado', COALESCE(amoblado,'no especifica'), 'cant', COUNT(*)) AS t
          FROM v_mercado_alquiler_shadow
          WHERE precio_mensual_bob >= 1000
            AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
            AND (p_dorms IS NULL OR dormitorios = p_dorms)
            AND (p_precio_max IS NULL OR precio_mensual_bob <= p_precio_max)
          GROUP BY amoblado
        ) s
      )
    ) INTO resultado;
  END IF;

  RETURN resultado;
END;
$function$;

-- ── 2. buscar_propiedades ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_propiedades(
  p_operacion text,
  p_zona text DEFAULT NULL::text,
  p_dorms integer DEFAULT NULL::integer,
  p_precio_max numeric DEFAULT NULL::numeric,
  p_estado text DEFAULT NULL::text,
  p_amoblado text DEFAULT NULL::text,
  p_orden text DEFAULT 'precio'::text,
  p_limit integer DEFAULT 6
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resultado jsonb;
BEGIN
  IF p_operacion = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT id, nombre_edificio, precio_norm, area_total_m2, banos, estacionamientos,
             estado_construccion, url, zona, zona_general, dormitorios
      FROM v_mercado_venta_shadow
    )
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_usd', precio_norm::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'estado', estado_construccion::text,
        'url', url
      ) AS t
      FROM base
      WHERE precio_norm >= 20000
        AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
        AND (p_estado IS NULL OR estado_construccion::text = p_estado)
      ORDER BY
        CASE WHEN p_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN p_orden <> 'area' THEN precio_norm END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  ELSE
    -- ⚠️ RAMA DE ALQUILER: textual de la definición viva.
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_bob', precio_mensual_bob::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'amoblado', amoblado,
        'url', url
      ) AS t
      FROM v_mercado_alquiler_shadow
      WHERE precio_mensual_bob >= 1000
        AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_mensual_bob <= p_precio_max)
        AND (p_amoblado IS NULL OR amoblado = p_amoblado)
      ORDER BY
        CASE WHEN p_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN p_orden <> 'area' THEN precio_mensual_bob END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN resultado;
END;
$function$;

-- ── Verificación 1: los permisos y el modo NO cambiaron ──────────────────────
-- Esperado: las 2 con es_definer=true, search_path=public, anon con EXECUTE.
SELECT p.proname, p.prosecdef AS es_definer, array_to_string(p.proconfig,',') AS config,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ejecuta
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('resumen_mercado','buscar_propiedades')
 ORDER BY 1;

-- ── Verificación 2: el caso que rompía, ahora ────────────────────────────────
-- El editor de Supabase muestra el tiempo abajo; esto tiene que volver al
-- instante (antes: 4,3 s y timeout). `total` y `mediana` del primero tienen que
-- dar EXACTAMENTE lo de la referencia — si cambian, el fix alteró el resultado.
SELECT 'venta con presupuesto'       AS caso, resumen_mercado('venta', NULL, NULL, 120000)->'general' AS r
UNION ALL SELECT 'venta sin filtros',        resumen_mercado('venta')->'general'
UNION ALL SELECT 'alquiler con presupuesto', resumen_mercado('alquiler', NULL, NULL, 5000)->'general'
UNION ALL SELECT 'buscar venta con ppto',    jsonb_build_object('n', jsonb_array_length(buscar_propiedades('venta', NULL, NULL, 120000, NULL, NULL, 'precio', 5)));

-- 📌 REFERENCIA medida ANTES de aplicar (con la función vieja, corriendo en 4,3 s):
--    venta con presupuesto → {"desde": 40000, "hasta": 120000, "total": 250, "mediana": 77150}
--    venta sin filtros     → {"desde": 40000, "hasta": 1040000, "total": 391, "mediana": 97510}
--    buscar venta con ppto → {"n": 5}, y la 1ª es id 1120 "Inizio 1" a $40.000
--
-- 🔴 CRITERIO DE ABORTO: si alguno de esos números cambia, el fix alteró el
--    resultado y hay que hacer el rollback. La velocidad no vale nada si el bot
--    pasa a informar otro mercado.

-- ============================================================================
-- ROLLBACK — definición ORIGINAL, exportada con pg_get_functiondef() el 12-ago
-- ----------------------------------------------------------------------------
-- Volver deja el bot caído de nuevo en venta con presupuesto. La diferencia con
-- lo de arriba es solo el CTE: los filtros y el jsonb son los mismos.
--
-- resumen_mercado: en la rama de venta, reemplazar el bloque
--   `WITH base AS MATERIALIZED (...), f AS (...)` por las tres subconsultas
--   leyendo `FROM v_mercado_venta_shadow` con el WHERE completo repetido en cada
--   una (general / por_zona / por_estado).
-- buscar_propiedades: en la rama de venta, reemplazar `FROM base` por
--   `FROM v_mercado_venta_shadow` y borrar el CTE.
-- ============================================================================
