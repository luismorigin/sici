-- Función: matchear_alquiler (single property) + matching_alquileres_batch
-- Última migración: 146, 142
-- Exportado de producción: 27 Feb 2026
-- Dominio: Matching Alquiler
-- matchear_alquiler: 3 tiers (exact_lookup → normalized → trigram+GPS)
-- matching_alquileres_batch: Procesa todos los pendientes, self-learning aliases

-- =============================================
-- matchear_alquiler: Match individual
-- Tiers: 1=exact(98%), 2=normalized(90%), 2.5=trigram(60-90%)
-- GPS solo como bonus/penalización, NO como match
-- =============================================
CREATE OR REPLACE FUNCTION public.matchear_alquiler(p_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
    v_prop RECORD;
    v_nombre_exact TEXT;
    v_nombre_norm TEXT;
    v_lookup RECORD;
    v_ambiguity_count INTEGER;
    v_trigram RECORD;
    v_gps_dist INTEGER;
    v_gps_adjust INTEGER := 0;
    v_final_score INTEGER;
BEGIN
    SELECT id, nombre_edificio, latitud, longitud,
           id_proyecto_master, tipo_operacion, status,
           campos_bloqueados, url
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    IF v_prop IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'propiedad_no_encontrada');
    END IF;

    IF v_prop.tipo_operacion != 'alquiler' THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_es_alquiler');
    END IF;

    IF v_prop.campos_bloqueados IS NOT NULL
       AND v_prop.campos_bloqueados ? 'id_proyecto_master'
       AND (v_prop.campos_bloqueados->'id_proyecto_master'->>'bloqueado')::boolean = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'campo_bloqueado');
    END IF;

    IF v_prop.id_proyecto_master IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ya_matcheada',
                                  'id_proyecto', v_prop.id_proyecto_master);
    END IF;

    IF v_prop.nombre_edificio IS NULL OR TRIM(v_prop.nombre_edificio) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'sin_nombre');
    END IF;

    v_nombre_exact := LOWER(TRIM(v_prop.nombre_edificio));
    v_nombre_norm := normalizar_nombre_edificio(v_prop.nombre_edificio);

    -- TIER 1: Exact dictionary lookup (98%)
    SELECT * INTO v_lookup FROM mv_nombre_proyecto_lookup WHERE normalized_key = v_nombre_exact;
    IF v_lookup IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 'tier', 1, 'method', 'exact_lookup',
            'id_proyecto', v_lookup.id_proyecto_master,
            'nombre_proyecto', v_lookup.nombre_original,
            'confidence', 98, 'auto_approve', true, 'add_alias', false,
            'detalle_score', jsonb_build_object(
                'señal_nombre', 100, 'metodo_nombre', 'exact_key',
                'nombre_prop', v_prop.nombre_edificio, 'nombre_proy', v_lookup.nombre_original));
    END IF;

    -- TIER 2: Normalized lookup (90%)
    IF v_nombre_norm IS NOT NULL THEN
        SELECT COUNT(DISTINCT id_proyecto_master) INTO v_ambiguity_count
        FROM (
            SELECT id_proyecto_master FROM proyectos_master
            WHERE activo = true AND normalizar_nombre_edificio(nombre_oficial) = v_nombre_norm
            UNION ALL
            SELECT pm.id_proyecto_master FROM proyectos_master pm, unnest(pm.alias_conocidos) alias
            WHERE pm.activo = true AND normalizar_nombre_edificio(alias) = v_nombre_norm
        ) sub;

        IF v_ambiguity_count = 1 THEN
            SELECT * INTO v_lookup FROM mv_nombre_proyecto_lookup WHERE normalized_key = v_nombre_norm;
            IF v_lookup IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'success', true, 'tier', 2, 'method', 'normalized_lookup',
                    'id_proyecto', v_lookup.id_proyecto_master,
                    'nombre_proyecto', v_lookup.nombre_original,
                    'confidence', 90, 'auto_approve', true,
                    'add_alias', true, 'alias_to_add', v_prop.nombre_edificio,
                    'detalle_score', jsonb_build_object(
                        'señal_nombre', 95, 'metodo_nombre', 'normalized_exact',
                        'nombre_normalizado_prop', v_nombre_norm,
                        'nombre_prop', v_prop.nombre_edificio, 'nombre_proy', v_lookup.nombre_original));
            END IF;
        ELSIF v_ambiguity_count > 1 THEN
            RETURN jsonb_build_object(
                'success', true, 'tier', 2, 'method', 'normalized_ambiguous',
                'confidence', 50, 'auto_approve', false,
                'nombre_normalizado', v_nombre_norm,
                'ambiguous_projects', (
                    SELECT jsonb_agg(jsonb_build_object('id', sub.id_proyecto_master, 'nombre', sub.nombre_oficial))
                    FROM (
                        SELECT DISTINCT pm.id_proyecto_master, pm.nombre_oficial
                        FROM proyectos_master pm LEFT JOIN unnest(pm.alias_conocidos) alias ON true
                        WHERE pm.activo = true AND (normalizar_nombre_edificio(pm.nombre_oficial) = v_nombre_norm OR normalizar_nombre_edificio(alias) = v_nombre_norm)
                    ) sub));
        END IF;
    END IF;

    -- TIER 2.5: Trigram similarity
    IF v_nombre_norm IS NOT NULL AND LENGTH(v_nombre_norm) >= 4 THEN
        SELECT pm.id_proyecto_master, pm.nombre_oficial,
               normalizar_nombre_edificio(pm.nombre_oficial) as norm_proy,
               similarity(v_nombre_norm, normalizar_nombre_edificio(pm.nombre_oficial)) as sim_score,
               CASE WHEN pm.latitud IS NOT NULL AND v_prop.latitud IS NOT NULL THEN
                   ROUND(111000 * SQRT(POWER(v_prop.latitud - pm.latitud, 2) + POWER((v_prop.longitud - pm.longitud) * COS(RADIANS(v_prop.latitud)), 2)))::INTEGER
               ELSE NULL END as dist_m
        INTO v_trigram
        FROM proyectos_master pm
        WHERE pm.activo = true AND pm.nombre_oficial IS NOT NULL
          AND normalizar_nombre_edificio(pm.nombre_oficial) IS NOT NULL
          AND LENGTH(normalizar_nombre_edificio(pm.nombre_oficial)) >= 3
          AND similarity(v_nombre_norm, normalizar_nombre_edificio(pm.nombre_oficial)) >= 0.25
        ORDER BY similarity(v_nombre_norm, normalizar_nombre_edificio(pm.nombre_oficial)) DESC LIMIT 1;

        IF v_trigram IS NULL OR v_trigram.sim_score < 0.25 THEN
            SELECT pm.id_proyecto_master, pm.nombre_oficial,
                   normalizar_nombre_edificio(alias) as norm_proy,
                   similarity(v_nombre_norm, normalizar_nombre_edificio(alias)) as sim_score,
                   CASE WHEN pm.latitud IS NOT NULL AND v_prop.latitud IS NOT NULL THEN
                       ROUND(111000 * SQRT(POWER(v_prop.latitud - pm.latitud, 2) + POWER((v_prop.longitud - pm.longitud) * COS(RADIANS(v_prop.latitud)), 2)))::INTEGER
                   ELSE NULL END as dist_m
            INTO v_trigram
            FROM proyectos_master pm, unnest(pm.alias_conocidos) alias
            WHERE pm.activo = true AND normalizar_nombre_edificio(alias) IS NOT NULL
              AND LENGTH(normalizar_nombre_edificio(alias)) >= 3
              AND similarity(v_nombre_norm, normalizar_nombre_edificio(alias)) >= 0.25
            ORDER BY similarity(v_nombre_norm, normalizar_nombre_edificio(alias)) DESC LIMIT 1;
        END IF;

        IF v_trigram IS NOT NULL AND v_trigram.sim_score >= 0.45 THEN
            v_final_score := CASE
                WHEN v_trigram.sim_score >= 0.85 THEN 90
                WHEN v_trigram.sim_score >= 0.70 THEN 80
                WHEN v_trigram.sim_score >= 0.55 THEN 70
                ELSE 60 END;

            v_gps_adjust := 0;
            IF v_trigram.dist_m IS NOT NULL THEN
                IF v_trigram.dist_m < 100 THEN v_gps_adjust := 5;
                ELSIF v_trigram.dist_m > 500 THEN v_gps_adjust := -10;
                END IF;
            END IF;

            v_final_score := GREATEST(40, LEAST(94, v_final_score + v_gps_adjust));

            RETURN jsonb_build_object(
                'success', true, 'tier', 2.5, 'method', 'trigram',
                'id_proyecto', v_trigram.id_proyecto_master,
                'nombre_proyecto', v_trigram.nombre_oficial,
                'confidence', v_final_score,
                'auto_approve', false,
                'add_alias', (v_trigram.sim_score >= 0.85),
                'alias_to_add', CASE WHEN v_trigram.sim_score >= 0.85 THEN v_prop.nombre_edificio ELSE NULL END,
                'detalle_score', jsonb_build_object(
                    'señal_nombre', ROUND(v_trigram.sim_score * 100),
                    'metodo_nombre', 'trigram_' || ROUND(v_trigram.sim_score::numeric, 2)::text,
                    'nombre_normalizado_prop', v_nombre_norm,
                    'nombre_normalizado_proy', v_trigram.norm_proy,
                    'nombre_prop', v_prop.nombre_edificio,
                    'nombre_proy', v_trigram.nombre_oficial,
                    'distancia_metros', v_trigram.dist_m,
                    'ajuste_gps', v_gps_adjust));
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', false, 'error', 'sin_match',
        'nombre_edificio', v_prop.nombre_edificio,
        'nombre_normalizado', v_nombre_norm);
END;
$function$;

-- =============================================
-- matching_alquileres_batch: Procesa todos los pendientes
-- Self-learning: agrega aliases automáticamente
-- =============================================
CREATE OR REPLACE FUNCTION public.matching_alquileres_batch()
 RETURNS TABLE(total_procesadas integer, tier1_exacto integer, tier2_normalizado integer, tier2_ambiguo integer, tier2_5_trigram integer, sin_match integer, auto_aprobados integer, aliases_aprendidos integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_prop RECORD;
    v_result JSONB;
    v_total INT := 0;
    v_t1 INT := 0; v_t2 INT := 0; v_t2a INT := 0;
    v_t25 INT := 0; v_sin INT := 0;
    v_auto INT := 0; v_aliases INT := 0;
BEGIN
    REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup;

    FOR v_prop IN
        SELECT id FROM propiedades_v2
        WHERE tipo_operacion = 'alquiler'
          AND status = 'completado'
          AND id_proyecto_master IS NULL
          AND es_activa = true
          AND duplicado_de IS NULL
        ORDER BY id
    LOOP
        v_total := v_total + 1;
        v_result := matchear_alquiler(v_prop.id);

        IF (v_result->>'success')::boolean THEN
            CASE
                WHEN (v_result->>'tier')::numeric = 1 THEN v_t1 := v_t1 + 1;
                WHEN (v_result->>'tier')::numeric = 2 THEN
                    IF v_result->>'method' = 'normalized_ambiguous' THEN v_t2a := v_t2a + 1;
                    ELSE v_t2 := v_t2 + 1; END IF;
                WHEN (v_result->>'tier')::numeric = 2.5 THEN v_t25 := v_t25 + 1;
                ELSE NULL;
            END CASE;

            IF (v_result->>'auto_approve')::boolean THEN
                v_auto := v_auto + 1;
                UPDATE propiedades_v2
                SET id_proyecto_master = (v_result->>'id_proyecto')::integer,
                    metodo_match = 'alquiler_' || (v_result->>'method'),
                    confianza_sugerencia_extractor = (v_result->>'confidence')::integer
                WHERE id = v_prop.id;

                IF COALESCE((v_result->>'add_alias')::boolean, false)
                   AND v_result->>'alias_to_add' IS NOT NULL THEN
                    UPDATE proyectos_master
                    SET alias_conocidos = array_append(COALESCE(alias_conocidos, ARRAY[]::TEXT[]), v_result->>'alias_to_add'),
                        updated_at = NOW()
                    WHERE id_proyecto_master = (v_result->>'id_proyecto')::integer
                      AND NOT ((v_result->>'alias_to_add') = ANY(COALESCE(alias_conocidos, ARRAY[]::TEXT[])))
                      AND LOWER(TRIM(v_result->>'alias_to_add')) != LOWER(TRIM(nombre_oficial));
                    IF FOUND THEN v_aliases := v_aliases + 1; END IF;
                END IF;
            ELSE
                INSERT INTO matching_sugerencias (
                    propiedad_id, proyecto_master_sugerido, metodo_matching,
                    score_confianza, match_nombre, match_gps, razon_match,
                    estado, detalle_score, created_at
                ) VALUES (
                    v_prop.id,
                    CASE WHEN v_result ? 'id_proyecto' THEN (v_result->>'id_proyecto')::integer ELSE NULL END,
                    'alquiler_' || (v_result->>'method'),
                    (v_result->>'confidence')::integer,
                    true, false,
                    format('Match v2 tier %s: %s (score nombre: %s%%)',
                        v_result->>'tier', v_result->>'method',
                        COALESCE(v_result->'detalle_score'->>'señal_nombre', '?')),
                    'pendiente', v_result->'detalle_score', NOW()
                ) ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
                DO UPDATE SET score_confianza = EXCLUDED.score_confianza,
                    detalle_score = EXCLUDED.detalle_score, razon_match = EXCLUDED.razon_match;
            END IF;
        ELSE
            v_sin := v_sin + 1;
        END IF;
    END LOOP;

    IF v_aliases > 0 THEN
        REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup;
    END IF;

    RETURN QUERY SELECT v_total, v_t1, v_t2, v_t2a, v_t25, v_sin, v_auto, v_aliases;
END;
$function$;
