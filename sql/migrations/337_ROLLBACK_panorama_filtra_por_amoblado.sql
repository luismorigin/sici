-- =============================================================================
-- 337 · ROLLBACK — vuelve las 2 RPC al estado de la mig 336
-- =============================================================================
-- Definiciones exportadas con `pg_get_functiondef()` de PRODUCCIÓN el 21-ago-2026,
-- ANTES de aplicar la 337 (regla #7). Estado de origen: mig 336 aplicada.
--
-- 🔴 `resumen_mercado` vuelve a 4 parámetros, así que hay que DROPEAR la de 5 —
-- si no, quedan las dos y PostgREST no sabe cuál llamar. Y los GRANT se reponen
-- otra vez: un DROP se los lleva siempre.
--
-- ⚠️ Al revertir vuelve el problema: el panorama se calcula sobre el universo sin
-- filtrar y el bot anuncia 42 donde muestra 15. Y si lab-kapso ya publicó su
-- `body_schema` con `p_amoblado`, sus llamadas al panorama van a fallar con
-- PGRST202 (función no encontrada con ese parámetro) — coordinar la vuelta atrás
-- con ellos, no revertir en silencio.
-- =============================================================================

BEGIN;

-- ── 1/2 · resumen_mercado — vuelve a 4 parámetros ───────────────────────────
DROP FUNCTION IF EXISTS public.resumen_mercado(text, text, integer, numeric, text);

CREATE OR REPLACE FUNCTION public.resumen_mercado(p_operacion text, p_zona text DEFAULT NULL::text, p_dorms integer DEFAULT NULL::integer, p_precio_max numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resultado  jsonb;
  v_op       text;
  v_zona     text;
  v_zonas_ok text;
BEGIN
  v_op := lower(trim(coalesce(p_operacion, '')));
  IF v_op NOT IN ('venta', 'alquiler') THEN
    RAISE EXCEPTION 'p_operacion invalido: %. Valores: venta | alquiler',
      coalesce('"' || p_operacion || '"', 'null')
      USING ERRCODE = '22023';
  END IF;

  IF p_zona IS NOT NULL AND trim(p_zona) <> '' THEN
    SELECT z.nombre INTO v_zona
      FROM zonas_geograficas z
     WHERE lower(z.nombre) = lower(trim(p_zona))
       AND z.zona_general = 'Equipetrol'
       AND z.activo
     LIMIT 1;
    IF v_zona IS NULL THEN
      SELECT string_agg(DISTINCT z.nombre, ' | ' ORDER BY z.nombre) INTO v_zonas_ok
        FROM zonas_geograficas z
       WHERE z.zona_general = 'Equipetrol' AND z.activo;
      RAISE EXCEPTION 'p_zona invalida: "%". Valores: %', p_zona, v_zonas_ok
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_dorms IS NOT NULL AND (p_dorms < 0 OR p_dorms > 10) THEN
    RAISE EXCEPTION 'p_dorms fuera de rango: %. Valores: 0 (monoambiente) a 10', p_dorms
      USING ERRCODE = '22023';
  END IF;

  IF p_precio_max IS NOT NULL AND p_precio_max <= 0 THEN
    RAISE EXCEPTION 'p_precio_max debe ser mayor a 0 (recibido: %). USD en venta, Bs en alquiler.', p_precio_max
      USING ERRCODE = '22023';
  END IF;

  IF v_op = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT precio_norm, zona, zona_general, dormitorios,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
    ),
    f AS (
      SELECT * FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
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
    WITH par AS (
      SELECT (valor)::numeric AS tc FROM config_global WHERE clave = 'tipo_cambio_paralelo'
    ),
    f AS (
      SELECT COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT tc FROM par), 2)) AS bob,
             zona,
             amoblado
      FROM v_mercado_alquiler_shadow
      WHERE ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
    ),
    g AS (
      SELECT * FROM f
      WHERE bob >= 1000
        AND (p_precio_max IS NULL OR bob <= p_precio_max)
    )
    SELECT jsonb_build_object(
      'moneda', 'Bs',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(bob)::int,
          'hasta',   MAX(bob)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY bob)::int
        ) FROM g
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(bob)::int) AS t
          FROM g GROUP BY zona
        ) s
      ),
      'por_amoblado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('amoblado', COALESCE(amoblado,'no especifica'), 'cant', COUNT(*)) AS t
          FROM g GROUP BY amoblado
        ) s
      )
    ) INTO resultado;
  END IF;

  RETURN resultado;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric) TO anon;
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.resumen_mercado(text, text, integer, numeric) TO claude_readonly;

-- ── 2/2 · buscar_propiedades — p_amoblado vuelve a un solo valor ────────────
CREATE OR REPLACE FUNCTION public.buscar_propiedades(p_operacion text, p_zona text DEFAULT NULL::text, p_dorms integer DEFAULT NULL::integer, p_precio_max numeric DEFAULT NULL::numeric, p_estado text DEFAULT NULL::text, p_amoblado text DEFAULT NULL::text, p_orden text DEFAULT 'precio'::text, p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  resultado  jsonb;
  v_op       text;
  v_zona     text;
  v_zonas_ok text;
  v_estado   text;
  v_amoblado text;
  v_orden    text;
BEGIN
  v_op := lower(trim(coalesce(p_operacion, '')));
  IF v_op NOT IN ('venta', 'alquiler') THEN
    RAISE EXCEPTION 'p_operacion invalido: %. Valores: venta | alquiler',
      coalesce('"' || p_operacion || '"', 'null')
      USING ERRCODE = '22023';
  END IF;

  IF p_zona IS NOT NULL AND trim(p_zona) <> '' THEN
    SELECT z.nombre INTO v_zona
      FROM zonas_geograficas z
     WHERE lower(z.nombre) = lower(trim(p_zona))
       AND z.zona_general = 'Equipetrol'
       AND z.activo
     LIMIT 1;
    IF v_zona IS NULL THEN
      SELECT string_agg(DISTINCT z.nombre, ' | ' ORDER BY z.nombre) INTO v_zonas_ok
        FROM zonas_geograficas z
       WHERE z.zona_general = 'Equipetrol' AND z.activo;
      RAISE EXCEPTION 'p_zona invalida: "%". Valores: %', p_zona, v_zonas_ok
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_dorms IS NOT NULL AND (p_dorms < 0 OR p_dorms > 10) THEN
    RAISE EXCEPTION 'p_dorms fuera de rango: %. Valores: 0 (monoambiente) a 10', p_dorms
      USING ERRCODE = '22023';
  END IF;

  IF p_precio_max IS NOT NULL AND p_precio_max <= 0 THEN
    RAISE EXCEPTION 'p_precio_max debe ser mayor a 0 (recibido: %). USD en venta, Bs en alquiler.', p_precio_max
      USING ERRCODE = '22023';
  END IF;

  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 50) THEN
    RAISE EXCEPTION 'p_limit fuera de rango: %. Valores: 1 a 50 (por defecto 6)', p_limit
      USING ERRCODE = '22023';
  END IF;

  v_estado := nullif(lower(trim(coalesce(p_estado, ''))), '');
  IF v_estado IS NOT NULL THEN
    IF v_op = 'alquiler' THEN
      RAISE EXCEPTION 'p_estado no aplica a alquiler: el estado de obra no existe en alquiler. Omitilo.'
        USING ERRCODE = '22023';
    END IF;
    IF v_estado NOT IN ('preventa', 'entrega_inmediata') THEN
      RAISE EXCEPTION 'p_estado invalido: "%". Valores: preventa | entrega_inmediata', p_estado
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_amoblado := nullif(translate(lower(trim(coalesce(p_amoblado, ''))), 'áéíóú', 'aeiou'), '');
  IF v_amoblado IS NOT NULL THEN
    IF v_op = 'venta' THEN
      RAISE EXCEPTION 'p_amoblado no aplica a venta: el dato casi no existe en venta. Omitilo.'
        USING ERRCODE = '22023';
    END IF;
    IF v_amoblado NOT IN ('si', 'semi', 'no', 'no_declarado') THEN
      RAISE EXCEPTION 'p_amoblado invalido: "%". Valores: si | semi | no | no_declarado', p_amoblado
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_orden := nullif(lower(trim(coalesce(p_orden, ''))), '');
  IF v_orden IS NULL THEN
    v_orden := 'precio';
  END IF;
  IF v_orden NOT IN ('precio', 'area') THEN
    RAISE EXCEPTION 'p_orden invalido: "%". Valores: precio (mas barato primero) | area (mas grande primero)', p_orden
      USING ERRCODE = '22023';
  END IF;

  IF v_op = 'venta' THEN
    WITH base AS MATERIALIZED (
      SELECT id, nombre_edificio, precio_norm, area_total_m2, banos, estacionamientos,
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion,
             url, zona, zona_general, dormitorios
      FROM v_mercado_venta_shadow
      LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
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
        'url', url,
        'amenidades', amenidades_normalizadas(id)
      ) AS t
      FROM base
      WHERE precio_norm >= 20000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
        AND (v_estado IS NULL OR estado_construccion::text = v_estado)
      ORDER BY
        CASE WHEN v_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN v_orden <> 'area' THEN precio_norm END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  ELSE
    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO resultado FROM (
      SELECT jsonb_build_object(
        'id', id,
        'edificio', nombre_edificio,
        'precio_bob', precio_bob_efectivo::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'amoblado', amoblado,
        'url', url,
        'amenidades', amenidades_normalizadas(id)
      ) AS t
      FROM (
        SELECT *, COALESCE(
                    precio_mensual_bob,
                    ROUND(precio_mensual * (SELECT valor::numeric FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
                  ) AS precio_bob_efectivo
        FROM v_mercado_alquiler_shadow
      ) v_alq
      WHERE precio_bob_efectivo >= 1000
        AND ((v_zona IS NOT NULL AND zona = v_zona) OR (v_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_bob_efectivo <= p_precio_max)
        AND (v_amoblado IS NULL
             OR (v_amoblado =  'no_declarado' AND amoblado IS NULL)
             OR (v_amoblado <> 'no_declarado' AND amoblado = v_amoblado))
      ORDER BY
        CASE WHEN v_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN v_orden <> 'area' THEN precio_bob_efectivo END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN resultado;
END;
$function$;

COMMIT;
