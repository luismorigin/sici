-- ============================================================================
-- Migracion 146: Matching Alquileres v2 - Trigram + detalle_score
-- ============================================================================
-- El sistema actual (mig 141-142) tiene 3 tiers:
--   Tier 1: exact lookup (98%) → auto-aprueba
--   Tier 2: normalized lookup (90%) → auto-aprueba
--   Tier 3: GPS solo (60-75%) → HITL
--
-- Problema: No hay capa fuzzy/trigram entre Tier 2 y Tier 3.
-- "Condominio Madero Residences" no matchea "Madero Residence" (normalizado
-- es "maderoresidences" vs "maderoresidence" — NO son iguales pero son 0.93
-- en trigram). Hoy cae al Tier 3 GPS y sugiere el edificio más cercano
-- por coordenadas, que a menudo es OTRO edificio.
--
-- Fix: Agregar Tier 2.5 con pg_trgm similarity.
-- Bonus/penalización GPS para validar el match por nombre.
-- Campo detalle_score JSONB para transparencia.
-- ============================================================================

-- ============================================================================
-- PASO 1: Agregar columna detalle_score a matching_sugerencias
-- ============================================================================

ALTER TABLE matching_sugerencias
ADD COLUMN IF NOT EXISTS detalle_score JSONB;

COMMENT ON COLUMN matching_sugerencias.detalle_score IS
'Desglose de señales del matching v2: nombre, gps, método, distancia';

-- ============================================================================
-- PASO 2: Reemplazar matchear_alquiler() con v2
-- Agrega Tier 2.5 (trigram) entre normalized y GPS
-- GPS ahora es bonus/penalización, no generador de matches
-- ============================================================================

CREATE OR REPLACE FUNCTION matchear_alquiler(p_id INTEGER)
RETURNS JSONB AS $$
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
    -- Obtener propiedad
    SELECT id, nombre_edificio, latitud, longitud,
           id_proyecto_master, tipo_operacion, status,
           campos_bloqueados, url
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    -- Guards
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

    -- Sin nombre → sin match (GPS solo ya no genera sugerencias)
    IF v_prop.nombre_edificio IS NULL OR TRIM(v_prop.nombre_edificio) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'sin_nombre');
    END IF;

    v_nombre_exact := LOWER(TRIM(v_prop.nombre_edificio));
    v_nombre_norm := normalizar_nombre_edificio(v_prop.nombre_edificio);

    -- ============================================
    -- TIER 1: Exact dictionary lookup (98%)
    -- ============================================
    SELECT * INTO v_lookup
    FROM mv_nombre_proyecto_lookup
    WHERE normalized_key = v_nombre_exact;

    IF v_lookup IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true, 'tier', 1, 'method', 'exact_lookup',
            'id_proyecto', v_lookup.id_proyecto_master,
            'nombre_proyecto', v_lookup.nombre_original,
            'confidence', 98,
            'auto_approve', true,
            'add_alias', false,
            'detalle_score', jsonb_build_object(
                'señal_nombre', 100, 'metodo_nombre', 'exact_key',
                'nombre_prop', v_prop.nombre_edificio,
                'nombre_proy', v_lookup.nombre_original
            )
        );
    END IF;

    -- ============================================
    -- TIER 2: Normalized lookup (90%)
    -- ============================================
    IF v_nombre_norm IS NOT NULL THEN
        -- Verificar ambiguedad
        SELECT COUNT(DISTINCT id_proyecto_master)
        INTO v_ambiguity_count
        FROM (
            SELECT id_proyecto_master
            FROM proyectos_master
            WHERE activo = true AND normalizar_nombre_edificio(nombre_oficial) = v_nombre_norm
            UNION ALL
            SELECT pm.id_proyecto_master
            FROM proyectos_master pm, unnest(pm.alias_conocidos) alias
            WHERE pm.activo = true AND normalizar_nombre_edificio(alias) = v_nombre_norm
        ) sub;

        IF v_ambiguity_count = 1 THEN
            SELECT * INTO v_lookup
            FROM mv_nombre_proyecto_lookup
            WHERE normalized_key = v_nombre_norm;

            IF v_lookup IS NOT NULL THEN
                RETURN jsonb_build_object(
                    'success', true, 'tier', 2, 'method', 'normalized_lookup',
                    'id_proyecto', v_lookup.id_proyecto_master,
                    'nombre_proyecto', v_lookup.nombre_original,
                    'confidence', 90,
                    'auto_approve', true,
                    'add_alias', true,
                    'alias_to_add', v_prop.nombre_edificio,
                    'detalle_score', jsonb_build_object(
                        'señal_nombre', 95, 'metodo_nombre', 'normalized_exact',
                        'nombre_normalizado_prop', v_nombre_norm,
                        'nombre_normalizado_proy', v_nombre_norm,
                        'nombre_prop', v_prop.nombre_edificio,
                        'nombre_proy', v_lookup.nombre_original
                    )
                );
            END IF;
        ELSIF v_ambiguity_count > 1 THEN
            RETURN jsonb_build_object(
                'success', true, 'tier', 2, 'method', 'normalized_ambiguous',
                'confidence', 50,
                'auto_approve', false,
                'nombre_normalizado', v_nombre_norm,
                'ambiguous_projects', (
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', sub.id_proyecto_master,
                        'nombre', sub.nombre_oficial
                    ))
                    FROM (
                        SELECT DISTINCT pm.id_proyecto_master, pm.nombre_oficial
                        FROM proyectos_master pm
                        LEFT JOIN unnest(pm.alias_conocidos) alias ON true
                        WHERE pm.activo = true
                          AND (normalizar_nombre_edificio(pm.nombre_oficial) = v_nombre_norm
                               OR normalizar_nombre_edificio(alias) = v_nombre_norm)
                    ) sub
                ),
                'detalle_score', jsonb_build_object(
                    'señal_nombre', 50, 'metodo_nombre', 'ambiguous',
                    'nombre_normalizado', v_nombre_norm
                )
            );
        END IF;
    END IF;

    -- ============================================
    -- TIER 2.5: Trigram similarity (NUEVO)
    -- Compara nombre normalizado de propiedad vs
    -- todos los nombres/alias normalizados de proyectos.
    -- GPS como bonus/penalización, NO como match.
    -- ============================================
    IF v_nombre_norm IS NOT NULL AND LENGTH(v_nombre_norm) >= 4 THEN
        SELECT
            pm.id_proyecto_master,
            pm.nombre_oficial,
            normalizar_nombre_edificio(pm.nombre_oficial) as norm_proy,
            similarity(v_nombre_norm, normalizar_nombre_edificio(pm.nombre_oficial)) as sim_score,
            CASE
                WHEN pm.latitud IS NOT NULL AND v_prop.latitud IS NOT NULL THEN
                    ROUND(111000 * SQRT(
                        POWER(v_prop.latitud - pm.latitud, 2) +
                        POWER((v_prop.longitud - pm.longitud) * COS(RADIANS(v_prop.latitud)), 2)
                    ))::INTEGER
                ELSE NULL
            END as dist_m
        INTO v_trigram
        FROM proyectos_master pm
        WHERE pm.activo = true
          AND pm.nombre_oficial IS NOT NULL
          AND normalizar_nombre_edificio(pm.nombre_oficial) IS NOT NULL
          AND LENGTH(normalizar_nombre_edificio(pm.nombre_oficial)) >= 3
          AND similarity(v_nombre_norm, normalizar_nombre_edificio(pm.nombre_oficial)) >= 0.25
        ORDER BY similarity(v_nombre_norm, normalizar_nombre_edificio(pm.nombre_oficial)) DESC
        LIMIT 1;

        -- Si no encontró por nombre_oficial, buscar en alias
        IF v_trigram IS NULL OR v_trigram.sim_score < 0.25 THEN
            SELECT
                pm.id_proyecto_master,
                pm.nombre_oficial,
                normalizar_nombre_edificio(alias) as norm_proy,
                similarity(v_nombre_norm, normalizar_nombre_edificio(alias)) as sim_score,
                CASE
                    WHEN pm.latitud IS NOT NULL AND v_prop.latitud IS NOT NULL THEN
                        ROUND(111000 * SQRT(
                            POWER(v_prop.latitud - pm.latitud, 2) +
                            POWER((v_prop.longitud - pm.longitud) * COS(RADIANS(v_prop.latitud)), 2)
                        ))::INTEGER
                    ELSE NULL
                END as dist_m
            INTO v_trigram
            FROM proyectos_master pm, unnest(pm.alias_conocidos) alias
            WHERE pm.activo = true
              AND normalizar_nombre_edificio(alias) IS NOT NULL
              AND LENGTH(normalizar_nombre_edificio(alias)) >= 3
              AND similarity(v_nombre_norm, normalizar_nombre_edificio(alias)) >= 0.25
            ORDER BY similarity(v_nombre_norm, normalizar_nombre_edificio(alias)) DESC
            LIMIT 1;
        END IF;

        IF v_trigram IS NOT NULL AND v_trigram.sim_score >= 0.45 THEN
            -- Calcular score base desde trigram
            v_final_score := CASE
                WHEN v_trigram.sim_score >= 0.85 THEN 90
                WHEN v_trigram.sim_score >= 0.70 THEN 80
                WHEN v_trigram.sim_score >= 0.55 THEN 70
                ELSE 60
            END;

            -- GPS bonus/penalización
            v_gps_adjust := 0;
            IF v_trigram.dist_m IS NOT NULL THEN
                IF v_trigram.dist_m < 100 THEN
                    v_gps_adjust := 5;   -- confirma
                ELSIF v_trigram.dist_m > 500 THEN
                    v_gps_adjust := -10; -- sospechoso
                END IF;
                -- 100-500m: neutro (0)
            END IF;

            v_final_score := GREATEST(40, LEAST(94, v_final_score + v_gps_adjust));

            RETURN jsonb_build_object(
                'success', true,
                'tier', 2.5,
                'method', 'trigram',
                'id_proyecto', v_trigram.id_proyecto_master,
                'nombre_proyecto', v_trigram.nombre_oficial,
                'confidence', v_final_score,
                'auto_approve', false,  -- trigram NUNCA auto-aprueba
                'add_alias', (v_trigram.sim_score >= 0.85),
                'alias_to_add', CASE WHEN v_trigram.sim_score >= 0.85
                                     THEN v_prop.nombre_edificio ELSE NULL END,
                'detalle_score', jsonb_build_object(
                    'señal_nombre', ROUND(v_trigram.sim_score * 100),
                    'metodo_nombre', 'trigram_' || ROUND(v_trigram.sim_score::numeric, 2)::text,
                    'nombre_normalizado_prop', v_nombre_norm,
                    'nombre_normalizado_proy', v_trigram.norm_proy,
                    'nombre_prop', v_prop.nombre_edificio,
                    'nombre_proy', v_trigram.nombre_oficial,
                    'distancia_metros', v_trigram.dist_m,
                    'ajuste_gps', v_gps_adjust
                )
            );
        END IF;
    END IF;

    -- ============================================
    -- Sin match en ningún tier
    -- (GPS solo YA NO genera sugerencias)
    -- ============================================
    RETURN jsonb_build_object(
        'success', false,
        'error', 'sin_match',
        'nombre_edificio', v_prop.nombre_edificio,
        'nombre_normalizado', v_nombre_norm
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION matchear_alquiler IS
'Matching alquileres v2: Tier 1 exact → Tier 2 normalized → Tier 2.5 trigram (+GPS bonus) → sin_match. GPS solo ya no genera sugerencias.';

-- ============================================================================
-- PASO 3: Actualizar matching_alquileres_batch() para guardar detalle_score
-- ============================================================================

DROP FUNCTION IF EXISTS matching_alquileres_batch();

CREATE OR REPLACE FUNCTION matching_alquileres_batch()
RETURNS TABLE(
    total_procesadas INTEGER,
    tier1_exacto INTEGER,
    tier2_normalizado INTEGER,
    tier2_ambiguo INTEGER,
    tier2_5_trigram INTEGER,
    sin_match INTEGER,
    auto_aprobados INTEGER,
    aliases_aprendidos INTEGER
) AS $$
DECLARE
    v_prop RECORD;
    v_result JSONB;
    v_total INT := 0;
    v_t1 INT := 0; v_t2 INT := 0; v_t2a INT := 0;
    v_t25 INT := 0; v_sin INT := 0;
    v_auto INT := 0; v_aliases INT := 0;
BEGIN
    -- Refresh el lookup antes de empezar
    REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup;

    -- Procesar todos los alquileres sin match
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
            -- Contar por tier
            CASE
                WHEN (v_result->>'tier')::numeric = 1 THEN v_t1 := v_t1 + 1;
                WHEN (v_result->>'tier')::numeric = 2 THEN
                    IF v_result->>'method' = 'normalized_ambiguous' THEN
                        v_t2a := v_t2a + 1;
                    ELSE
                        v_t2 := v_t2 + 1;
                    END IF;
                WHEN (v_result->>'tier')::numeric = 2.5 THEN v_t25 := v_t25 + 1;
                ELSE NULL;
            END CASE;

            IF (v_result->>'auto_approve')::boolean THEN
                v_auto := v_auto + 1;

                -- Aplicar match directo
                UPDATE propiedades_v2
                SET id_proyecto_master = (v_result->>'id_proyecto')::integer,
                    metodo_match = 'alquiler_' || (v_result->>'method'),
                    confianza_sugerencia_extractor = (v_result->>'confidence')::integer
                WHERE id = v_prop.id;

                -- Self-learning: agregar alias si corresponde
                IF COALESCE((v_result->>'add_alias')::boolean, false)
                   AND v_result->>'alias_to_add' IS NOT NULL THEN
                    UPDATE proyectos_master
                    SET alias_conocidos = array_append(
                        COALESCE(alias_conocidos, ARRAY[]::TEXT[]),
                        v_result->>'alias_to_add'
                    ),
                    updated_at = NOW()
                    WHERE id_proyecto_master = (v_result->>'id_proyecto')::integer
                      AND NOT (
                          (v_result->>'alias_to_add') = ANY(COALESCE(alias_conocidos, ARRAY[]::TEXT[]))
                      )
                      AND LOWER(TRIM(v_result->>'alias_to_add')) != LOWER(TRIM(nombre_oficial));

                    IF FOUND THEN v_aliases := v_aliases + 1; END IF;
                END IF;
            ELSE
                -- No auto-approve → cola HITL con detalle_score
                INSERT INTO matching_sugerencias (
                    propiedad_id, proyecto_master_sugerido, metodo_matching,
                    score_confianza, match_nombre, match_gps, razon_match,
                    estado, detalle_score, created_at
                ) VALUES (
                    v_prop.id,
                    CASE WHEN v_result ? 'id_proyecto'
                         THEN (v_result->>'id_proyecto')::integer
                         ELSE NULL END,
                    'alquiler_' || (v_result->>'method'),
                    (v_result->>'confidence')::integer,
                    true,  -- trigram es match por nombre
                    false,
                    format('Match v2 tier %s: %s (score nombre: %s%%)',
                        v_result->>'tier',
                        v_result->>'method',
                        COALESCE(v_result->'detalle_score'->>'señal_nombre', '?')
                    ),
                    'pendiente',
                    v_result->'detalle_score',
                    NOW()
                )
                ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
                DO UPDATE SET
                    score_confianza = EXCLUDED.score_confianza,
                    detalle_score = EXCLUDED.detalle_score,
                    razon_match = EXCLUDED.razon_match;
            END IF;
        ELSE
            v_sin := v_sin + 1;
        END IF;
    END LOOP;

    -- Refresh post-aliases aprendidos
    IF v_aliases > 0 THEN
        REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup;
    END IF;

    RETURN QUERY SELECT v_total, v_t1, v_t2, v_t2a, v_t25, v_sin, v_auto, v_aliases;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION matching_alquileres_batch IS
'Matching v2 masivo para alquileres. Tier 1→2→2.5(trigram)→sin_match. GPS solo ya no genera.';

-- ============================================================================
-- PASO 4: Preview antes de ejecutar (DRY RUN)
-- Ejecutar esto primero para ver qué haría sin tocar datos
-- ============================================================================

-- Preview: qué matchearía el Tier 2.5 trigram
SELECT
    p.id,
    p.nombre_edificio,
    (matchear_alquiler(p.id))->>'method' as metodo,
    ((matchear_alquiler(p.id))->>'confidence')::int as confianza,
    (matchear_alquiler(p.id))->>'nombre_proyecto' as proyecto_sugerido,
    (matchear_alquiler(p.id))->'detalle_score'->>'señal_nombre' as score_nombre,
    (matchear_alquiler(p.id))->'detalle_score'->>'distancia_metros' as dist_gps,
    (matchear_alquiler(p.id))->'detalle_score'->>'ajuste_gps' as ajuste_gps,
    (matchear_alquiler(p.id))->'detalle_score'->>'nombre_normalizado_prop' as norm_prop,
    (matchear_alquiler(p.id))->'detalle_score'->>'nombre_normalizado_proy' as norm_proy
FROM propiedades_v2 p
WHERE p.tipo_operacion = 'alquiler'
  AND p.status = 'completado'
  AND p.id_proyecto_master IS NULL
  AND p.es_activa = true
  AND p.duplicado_de IS NULL
  AND (matchear_alquiler(p.id))->>'success' = 'true'
ORDER BY ((matchear_alquiler(p.id))->>'confidence')::int DESC;

-- ============================================================================
-- PASO 5: Ejecutar batch (DESPUÉS de verificar el preview)
-- ============================================================================

-- DESCOMENTAR cuando estés listo:
-- SELECT * FROM matching_alquileres_batch();

-- ============================================================================
-- PASO 6: Verificación post-batch
-- ============================================================================

-- SELECT
--     COUNT(*) as total_alquileres,
--     COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto,
--     COUNT(*) FILTER (WHERE id_proyecto_master IS NULL AND es_activa = true) as sin_proyecto_activas
-- FROM propiedades_v2
-- WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND duplicado_de IS NULL;

-- Cola HITL nueva
-- SELECT metodo_matching, estado, count(*),
--        AVG(score_confianza)::int as avg_score
-- FROM matching_sugerencias
-- WHERE metodo_matching LIKE 'alquiler_%'
-- GROUP BY metodo_matching, estado
-- ORDER BY metodo_matching;

-- Detalle de los trigram matches
-- SELECT ms.propiedad_id, p.nombre_edificio,
--        ms.score_confianza, pm.nombre_oficial,
--        ms.detalle_score
-- FROM matching_sugerencias ms
-- JOIN propiedades_v2 p ON p.id = ms.propiedad_id
-- JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
-- WHERE ms.metodo_matching = 'alquiler_trigram'
-- ORDER BY ms.score_confianza DESC;

DO $$
BEGIN
    RAISE NOTICE 'Migración 146: Matching alquileres v2 - Trigram + detalle_score + GPS como bonus/penalización (no generador). GPS solo ya no genera sugerencias.';
END $$;
