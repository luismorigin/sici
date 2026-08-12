-- ============================================================================
-- ROLLBACK de la migración 325 — `buscar_similares` como estaba el 12-ago-2026
-- ============================================================================
-- Definición VIVA exportada con `pg_get_functiondef()` ANTES de aplicar la 325.
--
-- ⚠️ NO usar `lab-kapso/sql/crear-rpc-similares.sql` como rollback: ese archivo
-- dice `v_mercado_venta` y la función que realmente corría usa
-- `v_mercado_venta_shadow`. Son distintas. Esta es la buena.
--
-- 🔴 Volver a esta versión reintroduce los dos problemas que la 325 corrige:
--    1. El timeout (medido: 2,80 s · 2,17 s · 4,06 s — la 3ª pasó el corte de 3 s).
--    2. La cascada de zona leyendo `propiedades_v2`, que ya no existe → `42P01`
--       en cuanto se abra una shortlist con propiedades de mayo/junio (el 53%).
--
-- Correr solo si los evals de la 325 fallan — sobre todo el criterio de aborto:
-- que devuelva otras propiedades, otro orden u otra cantidad que estas 5:
--    #1010 Bamboo $49.500 · #3410 Baruc 4 $50.700 · #1162 Inizio 1 $53.000
--    #2421 Grigia Residenze $55.000 · #3583 Domus Insignia $56.475
-- ============================================================================

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
