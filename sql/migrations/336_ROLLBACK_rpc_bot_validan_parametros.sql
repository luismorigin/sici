-- =============================================================================
-- 336 · ROLLBACK — vuelve las 2 RPC del bot a su estado SIN validación
-- =============================================================================
-- Definiciones exportadas con `pg_get_functiondef()` de PRODUCCIÓN el 21-ago-2026,
-- ANTES de aplicar la 336 (regla #7: nunca reconstruir desde archivos locales).
-- Estado de origen: resumen_mercado = mig 326 · buscar_propiedades = migs 329/330.
--
-- CUÁNDO USARLO: si el gateway de lab-kapso trata el HTTP 400 como caída y el bot
-- pasa a derivar conversaciones a un humano en vez de reintentar. En ese caso el
-- arreglo es peor que el problema — se revierte acá y se espera a que ellos
-- cierren su lado.
--
-- ⚠️ Al revertir vuelven TODOS los comportamientos silenciosos: 'VENTA' devuelve
-- alquiler, `p_orden: 'area_desc'` ordena por precio, `p_estado` en alquiler no
-- filtra, y las zonas de Zona Norte vuelven a servirse si al bot le llega el
-- nombre. Es el estado del 20-ago, no un estado sano.
-- =============================================================================

BEGIN;

-- ── 1/2 · resumen_mercado ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resumen_mercado(p_operacion text, p_zona text DEFAULT NULL::text, p_dorms integer DEFAULT NULL::integer, p_precio_max numeric DEFAULT NULL::numeric)
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
      SELECT precio_norm, zona, zona_general, dormitorios, COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion
      FROM v_mercado_venta_shadow LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
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
    -- RAMA DE ALQUILER — mig 326. El boliviano se DERIVA cuando el aviso se publicó
    -- en dólares, con la misma fórmula que `buscar_unidades_alquiler_shadow`.
    -- Antes se filtraba por `precio_mensual_bob` a secas y los 14 avisos en USD
    -- (bob NULL) desaparecían del resumen. Ahora el bot ve el mismo mercado que el feed.
    WITH par AS (
      SELECT (valor)::numeric AS tc FROM config_global WHERE clave = 'tipo_cambio_paralelo'
    ),
    f AS (
      SELECT COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT tc FROM par), 2)) AS bob,
             zona,
             amoblado
      FROM v_mercado_alquiler_shadow
      WHERE ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
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

-- ── 2/2 · buscar_propiedades ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.buscar_propiedades(p_operacion text, p_zona text DEFAULT NULL::text, p_dorms integer DEFAULT NULL::integer, p_precio_max numeric DEFAULT NULL::numeric, p_estado text DEFAULT NULL::text, p_amoblado text DEFAULT NULL::text, p_orden text DEFAULT 'precio'::text, p_limit integer DEFAULT 6)
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
             COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion, url, zona, zona_general, dormitorios
      FROM v_mercado_venta_shadow LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id
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
      FROM (SELECT *, COALESCE(precio_mensual_bob, ROUND(precio_mensual * (SELECT valor::numeric FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)) AS precio_bob_efectivo FROM v_mercado_alquiler_shadow) v_alq
      WHERE precio_bob_efectivo >= 1000
        AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
        AND (p_dorms IS NULL OR dormitorios = p_dorms)
        AND (p_precio_max IS NULL OR precio_bob_efectivo <= p_precio_max)
        AND (p_amoblado IS NULL OR amoblado = p_amoblado)
      ORDER BY
        CASE WHEN p_orden = 'area' THEN area_total_m2 END DESC NULLS LAST,
        CASE WHEN p_orden <> 'area' THEN precio_bob_efectivo END ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN resultado;
END;
$function$;

COMMIT;
