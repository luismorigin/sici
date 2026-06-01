-- =============================================================================
-- Migración 258 — SSOT macrozona en resumen_mercado() y buscar_propiedades()
-- =============================================================================
-- CONTEXTO: ambas RPC (consumidas por el bot/chat) tenían una allowlist hardcodeada
-- `zonas_canon` de 5 zonas que OMITÍA 'Eq. 3er Anillo' (bug pre-existente). Al
-- default (p_zona NULL) devolvían "Equipetrol" = 5 zonas, inconsistente con el feed
-- /ventas (6). Decisión de producto 1-jun-2026: 'Eq. 3er Anillo' ES Equipetrol.
--
-- FIX: reemplazar `zona = ANY(zonas_canon)` por `zona_general = 'Equipetrol'`
-- (columna agregada a las vistas en mig 257). Elimina la lista hardcodeada → SSOT
-- único en zonas_geograficas, y arregla el 3er Anillo por construcción.
-- p_zona explícito sigue funcionando (puede pedir cualquier microzona, incl. ZN).
--
-- Defs vivas exportadas con pg_get_functiondef antes de tocar (Regla 7).
-- APLICAR: Supabase UI o psql (NO desde MCP). Registrar en MIGRATION_INDEX.md.
-- Plan: docs/proyectos/zona-norte/PLAN_PARAMETRIZACION_MACROZONAS.md (F3)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- resumen_mercado — default EQ vía zona_general (antes: allowlist de 5)
-- -----------------------------------------------------------------------------
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
    SELECT jsonb_build_object(
      'moneda', 'USD',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_norm)::int,
          'hasta',   MAX(precio_norm)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)::int
        )
        FROM v_mercado_venta
        WHERE precio_norm >= 20000
          AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
          AND (p_dorms IS NULL OR dormitorios = p_dorms)
          AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(precio_norm)::int) AS t
          FROM v_mercado_venta
          WHERE precio_norm >= 20000
            AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
            AND (p_dorms IS NULL OR dormitorios = p_dorms)
            AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
          GROUP BY zona
        ) s
      ),
      'por_estado', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('estado', estado_construccion::text, 'cant', COUNT(*)) AS t
          FROM v_mercado_venta
          WHERE precio_norm >= 20000
            AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
            AND (p_dorms IS NULL OR dormitorios = p_dorms)
            AND (p_precio_max IS NULL OR precio_norm <= p_precio_max)
          GROUP BY estado_construccion
        ) s
      )
    ) INTO resultado;
  ELSE
    SELECT jsonb_build_object(
      'moneda', 'Bs',
      'general', (
        SELECT jsonb_build_object(
          'total',   COUNT(*),
          'desde',   MIN(precio_mensual_bob)::int,
          'hasta',   MAX(precio_mensual_bob)::int,
          'mediana', PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob)::int
        )
        FROM v_mercado_alquiler
        WHERE precio_mensual_bob >= 1000
          AND ((p_zona IS NOT NULL AND zona = p_zona) OR (p_zona IS NULL AND zona_general = 'Equipetrol'))
          AND (p_dorms IS NULL OR dormitorios = p_dorms)
          AND (p_precio_max IS NULL OR precio_mensual_bob <= p_precio_max)
      ),
      'por_zona', (
        SELECT COALESCE(jsonb_agg(t ORDER BY (t->>'cant')::int DESC), '[]'::jsonb)
        FROM (
          SELECT jsonb_build_object('zona', zona, 'cant', COUNT(*), 'desde', MIN(precio_mensual_bob)::int) AS t
          FROM v_mercado_alquiler
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
          FROM v_mercado_alquiler
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

-- -----------------------------------------------------------------------------
-- buscar_propiedades — default EQ vía zona_general (antes: allowlist de 5)
-- -----------------------------------------------------------------------------
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
      FROM v_mercado_venta
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
        'precio_bob', precio_mensual_bob::int,
        'm2', area_total_m2,
        'banos', banos,
        'parqueo', estacionamientos,
        'amoblado', amoblado,
        'url', url
      ) AS t
      FROM v_mercado_alquiler
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

COMMIT;

-- =============================================================================
-- ROLLBACK: re-CREATE OR REPLACE con la def previa (allowlist de 5 zonas) —
-- ver pg_get_functiondef pre-258 o mig 030/095. No recomendado (reintroduce el bug).
-- =============================================================================
