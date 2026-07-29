-- =============================================================================
-- 309 · `buscar_similares` (bot WhatsApp) — que no pueda cruzar de macrozona
-- =============================================================================
-- QUÉ RESUELVE
-- La función arma el perfil del cliente (zonas, dormitorios, precio, m²) desde
-- las propiedades de su shortlist y busca parecidas. El filtro de zona es
-- `(v_zonas IS NULL OR zona = ANY(v_zonas))`: **si el perfil de zonas queda
-- vacío, el filtro se apaga solo** y la búsqueda sale a toda la vista.
--
-- Hoy eso no se nota, porque en `propiedades_v2_shadow` solo hay Equipetrol:
-- "cualquier zona" = Equipetrol. Deja de no notarse **el día que entre Zona
-- Norte**: esos clientes empezarían a recibir sugerencias de otra macrozona,
-- por WhatsApp, sin que nadie lo pida. Por eso esto va ANTES de cargar ZN, no
-- después.
--
-- MEDIDO (28-jul-2026): 8 de 88 shortlists (9%) no tienen NINGUNA de sus
-- propiedades visible en las vistas de mercado — dadas de baja, o ids que
-- shadow todavía no tiene. Esas 8 son exactamente las que hoy corren sin filtro
-- de zona.
--
-- EL ARREGLO — cascada de 3 pasos, del dato más preciso al más disponible:
--   1. vista de mercado (lo de hoy: activas, sin cambios para las 80 que ya andan)
--   2. si vacío → tabla `propiedades_v2_shadow` (recupera las dadas de baja)
--   3. si vacío → `propiedades_v2` (prod) — recupera las 8 huérfanas medidas
--   4. si TODAVÍA vacío → devolver lista vacía, NO "cualquier cosa"
--
-- El paso 4 es el que importa: ante la duda, no sugerir. Un similar de la zona
-- equivocada es peor que no mostrar similares — el cliente no tiene forma de
-- saber que le estamos ofreciendo otro barrio.
--
-- Las 80 shortlists que hoy funcionan NO cambian: el paso 1 es idéntico al
-- comportamiento actual y se resuelve antes de tocar la cascada.
--
-- ROLLBACK: al final del archivo (re-crea la versión previa, exportada de prod
-- con pg_get_functiondef el 28-jul-2026 antes de tocar nada — Regla Crítica 7).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.buscar_similares(p_hash text, p_fav_ids bigint[] DEFAULT NULL::bigint[], p_limit integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_shortlist_id uuid;
  v_tipo         text;
  v_all_ids      bigint[];   -- todos los ids del shortlist (para excluir del resultado)
  v_anchor_ids   bigint[];   -- ids ancla del perfil (fav validadas, o todas)
  v_zonas        text[];
  v_dorms        int[];
  v_precio_min   numeric;  v_precio_max numeric;
  v_m2_min       numeric;  v_m2_max     numeric;
  v_props        jsonb;
BEGIN
  -- 1. Resolver shortlist por hash (ancla de confianza) + tipo_operacion
  SELECT s.id, MIN(i.tipo_operacion)
    INTO v_shortlist_id, v_tipo
  FROM broker_shortlists s
  JOIN broker_shortlist_items i ON i.shortlist_id = s.id
  WHERE s.hash = p_hash
  GROUP BY s.id;

  IF v_shortlist_id IS NULL THEN
    RETURN jsonb_build_object('error', 'hash_no_encontrado', 'propiedades', '[]'::jsonb);
  END IF;

  -- 2. Todos los ids del shortlist (para dedup en el resultado)
  SELECT array_agg(i.propiedad_id) INTO v_all_ids
  FROM broker_shortlist_items i
  WHERE i.shortlist_id = v_shortlist_id;

  -- 3. Anclas del perfil: fav VALIDADAS contra el shortlist; si no hay, todas
  IF p_fav_ids IS NULL OR array_length(p_fav_ids, 1) IS NULL THEN
    v_anchor_ids := v_all_ids;
  ELSE
    SELECT array_agg(i.propiedad_id) INTO v_anchor_ids
    FROM broker_shortlist_items i
    WHERE i.shortlist_id = v_shortlist_id
      AND i.propiedad_id = ANY(p_fav_ids);     -- solo ids que REALMENTE están en el shortlist
    IF v_anchor_ids IS NULL THEN
      v_anchor_ids := v_all_ids;               -- fav inválidos -> degradar a todo el shortlist
    END IF;
  END IF;

  -- 4. Perfil + búsqueda de similares, por tipo de operación
  IF v_tipo = 'venta' THEN
    SELECT array_agg(DISTINCT zona),
           array_agg(DISTINCT dormitorios),
           MIN(precio_norm),   MAX(precio_norm),
           MIN(area_total_m2), MAX(area_total_m2)
      INTO v_zonas, v_dorms, v_precio_min, v_precio_max, v_m2_min, v_m2_max
    FROM v_mercado_venta_shadow
    WHERE id = ANY(v_anchor_ids);

    -- 🔒 mig 309 — cascada de respaldo del PERFIL DE ZONA (ver header)
    IF v_zonas IS NULL THEN
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2_shadow WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2 WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      -- Sin perfil de zona no se puede acotar: NO sugerir es la respuesta correcta.
      RETURN jsonb_build_object('tipo_operacion', v_tipo, 'propiedades', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_props FROM (
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
      FROM v_mercado_venta_shadow
      WHERE precio_norm >= 20000
        AND NOT (id = ANY(v_all_ids))                                      -- dedup: nunca repetir las del shortlist
        AND zona = ANY(v_zonas)                                            -- mig 309: sin escape a "cualquier zona"
        AND (v_dorms IS NULL OR dormitorios = ANY(v_dorms))
        AND (v_precio_min IS NULL OR precio_norm   BETWEEN v_precio_min * 0.85 AND v_precio_max * 1.15)
        AND (v_m2_min     IS NULL OR area_total_m2 BETWEEN v_m2_min     * 0.80 AND v_m2_max     * 1.20)
      ORDER BY precio_norm ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;

  ELSE  -- alquiler
    SELECT array_agg(DISTINCT zona),
           array_agg(DISTINCT dormitorios),
           MIN(precio_mensual_bob), MAX(precio_mensual_bob),
           MIN(area_total_m2),      MAX(area_total_m2)
      INTO v_zonas, v_dorms, v_precio_min, v_precio_max, v_m2_min, v_m2_max
    FROM v_mercado_alquiler_shadow
    WHERE id = ANY(v_anchor_ids);

    -- 🔒 mig 309 — misma cascada que en venta
    IF v_zonas IS NULL THEN
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2_shadow WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      SELECT array_agg(DISTINCT zona) INTO v_zonas
      FROM propiedades_v2 WHERE id = ANY(v_anchor_ids) AND zona IS NOT NULL;
    END IF;
    IF v_zonas IS NULL THEN
      RETURN jsonb_build_object('tipo_operacion', v_tipo, 'propiedades', '[]'::jsonb);
    END IF;

    SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_props FROM (
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
        AND NOT (id = ANY(v_all_ids))
        AND zona = ANY(v_zonas)                                            -- mig 309
        AND (v_dorms IS NULL OR dormitorios = ANY(v_dorms))
        AND (v_precio_min IS NULL OR precio_mensual_bob BETWEEN v_precio_min * 0.85 AND v_precio_max * 1.15)
        AND (v_m2_min     IS NULL OR area_total_m2      BETWEEN v_m2_min     * 0.80 AND v_m2_max     * 1.20)
      ORDER BY precio_mensual_bob ASC NULLS LAST
      LIMIT COALESCE(p_limit, 6)
    ) s;
  END IF;

  RETURN jsonb_build_object(
    'tipo_operacion', v_tipo,
    'propiedades',    v_props
  );
END;
$function$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después de aplicar; read-only)
-- =============================================================================
-- 1) Que siga respondiendo igual en una shortlist normal (elegí un hash real):
--      SELECT jsonb_array_length(buscar_similares('<hash>')->'propiedades');
--
-- 2) Que las 8 huérfanas ahora tengan perfil de zona (antes: sin filtro):
--      WITH sl AS (
--        SELECT s.hash, array_agg(i.propiedad_id) AS ids
--        FROM broker_shortlists s
--        JOIN broker_shortlist_items i ON i.shortlist_id = s.id
--        LEFT JOIN v_mercado_venta_shadow    v ON v.id = i.propiedad_id
--        LEFT JOIN v_mercado_alquiler_shadow a ON a.id = i.propiedad_id
--        GROUP BY s.id, s.hash
--        HAVING COUNT(v.id) = 0 AND COUNT(a.id) = 0
--      )
--      SELECT hash, jsonb_array_length(buscar_similares(hash)->'propiedades') FROM sl;
--
-- 3) El día que ZN esté en shadow: ninguna sugerencia debe caer fuera de la
--    macrozona de la shortlist. Ese es el chequeo que justifica esta migración.
-- =============================================================================

-- =============================================================================
-- ROLLBACK — versión previa, tal cual estaba en prod el 28-jul-2026
-- (pegar y ejecutar solo si hace falta volver atrás)
-- =============================================================================
-- Es la misma función SIN los bloques "mig 309" y con el filtro de zona en su
-- forma original, la que se apaga sola:
--        AND (v_zonas IS NULL OR zona = ANY(v_zonas))
-- Basta con reemplazar las 2 apariciones de `AND zona = ANY(v_zonas)` por esa
-- línea y borrar los 6 bloques IF de la cascada.
-- =============================================================================
