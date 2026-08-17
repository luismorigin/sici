-- 326 — El bot informaba 168 alquileres de 182: los publicados en USD quedaban afuera
-- ============================================================================
-- 17-ago-2026. Detectado por el founder mirando una respuesta real del bot, con
-- una campaña pagada corriendo.
--
-- EL SÍNTOMA. Al preguntarle "hola quiero alquilar", el bot contestó:
--   "Hay 168 departamentos en alquiler en Equipetrol, de 2.600 Bs a 20.000 Bs,
--    con una mediana de 4.250 Bs"
-- pero `/alquileres` muestra **182** y su mediana es **Bs 4.500**. El bot y el
-- sitio decían cosas distintas del mismo mercado.
--
-- LA CAUSA. `resumen_mercado()` filtra `WHERE precio_mensual_bob >= 1000`, y hay
-- **14 avisos publicados en USD** cuyo `precio_mensual_bob` viene NULL en
-- `v_mercado_alquiler_shadow` ($490, $2000, $570, $478, $708, $350, $1200, $460,
-- $390, $1000, $480, $1000, $370, $550 por mes).
-- 🔑 La asimetría: la RPC del feed **sí** los convierte al vuelo —
--     COALESCE(p.precio_mensual_bob, ROUND(p.precio_mensual_usd * v_paralelo, 2))
--   — pero la VISTA que consulta el bot deja el campo en NULL. Comprobado con las
--   mismas props: 2779 Stratto Up → RPC del feed Bs 5.644 · vista NULL.
--
-- POR QUÉ IMPORTA (no era cosmético):
--   · 14 de 182 = **8% del inventario invisible para el bot**, y no marginal:
--     Bs ~4.000 a ~23.000/mes.
--   · El bot declaraba un **techo de mercado falso**: dijo "hasta 20.000 Bs" y hay
--     uno de $2.000/mes = **Bs 23.040**.
--   · La mediana salía sobre 168 en vez de 182.
--
-- EL ARREGLO. Se toca **solo esta función**, que usa únicamente el bot — NO la
-- vista, que consultan varias superficies. Se deriva el boliviano con la **misma
-- fórmula del feed**, así el bot y el sitio dicen lo mismo.
--
-- VERIFICADO ANTES DE APLICAR (read-only, sin tocar nada):
--   HOY:       total 168 · desde 2600 · hasta 20000 · mediana 4250
--   CORREGIDO: total 182 · desde 2600 · hasta 23040 · mediana **4500**
--   👉 y esa mediana de 4.500 es **exactamente la que muestra /alquileres**.
--
-- La rama de VENTA queda intacta, comentarios incluidos (el `MATERIALIZED` es un
-- fix de performance: 4,3 s → 18 ms).
--
-- ROLLBACK: `sql/migrations/326_ROLLBACK_resumen_mercado.sql` tiene la definición
-- viva exportada con pg_get_functiondef ANTES de aplicar esto (regla 7: el archivo
-- del repo no prueba lo que corre).
-- ============================================================================

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

-- ── VERIFICACIÓN (correr después de aplicar) ────────────────────────────────
-- Alquiler DEBE dar: total 182 · desde 2600 · hasta 23040 · mediana 4500
-- Venta DEBE quedar IGUAL que antes — si cambió, se tocó de más: revertir.
--
--   SELECT resumen_mercado('alquiler')->'general' AS alquiler,
--          resumen_mercado('venta')->'general'    AS venta_no_debe_cambiar;
--
-- Y la prueba de verdad: escribirle al bot "hola quiero alquilar" → debe decir 182.
