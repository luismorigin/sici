-- ROLLBACK de la mig 326 — definición VIVA de `resumen_mercado` ANTES del arreglo
-- ============================================================================
-- Exportada con `pg_get_functiondef()` el 17-ago-2026, justo antes de aplicar la
-- 326. Regla 7 del proyecto: el archivo del repo NO prueba lo que corre — esto sí,
-- porque salió del catálogo.
--
-- Para revertir: correr este archivo tal cual. Deja el bot exactamente como estaba
-- (informando 168 alquileres de 182, con techo Bs 20.000 y mediana Bs 4.250).
-- ============================================================================

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
