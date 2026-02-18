-- =====================================================
-- MIGRACION 141: Sistema de Matching Inteligente para Alquileres
-- Fecha: 13 Febrero 2026
-- Dependencias: pg_trgm (ya instalada), propiedades_v2, proyectos_master
--
-- Sistema de dictionary lookup O(1) para matchear alquileres
-- con proyectos_master. Completamente separado del matching
-- nocturno de ventas (migraciones 022-024). NO modifica nada
-- del pipeline de ventas.
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR (paso a paso)
-- =====================================================

-- =====================================================
-- PASO 1: Función normalizar_nombre_edificio()
-- Mejora sobre normalize_nombre() (mig 022):
-- - NO strip roman numerals (Condado III ≠ Condado IV)
-- - Normaliza acentos (Aguaí → Aguai)
-- - Strip prefijos/sufijos geográficos
-- =====================================================

CREATE OR REPLACE FUNCTION normalizar_nombre_edificio(texto TEXT)
RETURNS TEXT AS $$
DECLARE
    v_texto TEXT;
BEGIN
    IF texto IS NULL OR TRIM(texto) = '' THEN
        RETURN NULL;
    END IF;

    -- 1. Lowercase
    v_texto := LOWER(TRIM(texto));

    -- 2. Normalizar acentos comunes
    v_texto := REPLACE(v_texto, 'á', 'a');
    v_texto := REPLACE(v_texto, 'é', 'e');
    v_texto := REPLACE(v_texto, 'í', 'i');
    v_texto := REPLACE(v_texto, 'ó', 'o');
    v_texto := REPLACE(v_texto, 'ú', 'u');
    v_texto := REPLACE(v_texto, 'ü', 'u');
    v_texto := REPLACE(v_texto, 'ö', 'o');
    -- Mantener ñ (es distintiva en español)

    -- 3. Strip prefijos (solo al inicio de la cadena)
    v_texto := regexp_replace(v_texto,
        '^\s*(condominio|edificio|torre|residencia|residencial|hotel|departamento|depto|dto|cond\.?|edif\.?|multifamiliar)\s+',
        '', 'i');

    -- 4. Strip sufijos geográficos (solo al final)
    v_texto := regexp_replace(v_texto,
        '\s+(equipetrol|sirari|isuto|canal\s+isuto|norte|sur)\s*$',
        '', 'i');

    -- 5. Remover caracteres no alfanuméricos (mantener ñ y espacios temporalmente)
    v_texto := regexp_replace(v_texto, '[^a-z0-9ñ\s]', '', 'g');

    -- 6. Collapse espacios y remover todos los espacios
    v_texto := regexp_replace(v_texto, '\s+', '', 'g');

    -- 7. Trim final
    v_texto := TRIM(v_texto);

    IF v_texto = '' THEN
        RETURN NULL;
    END IF;

    RETURN v_texto;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalizar_nombre_edificio IS
'Normaliza nombres de edificios para matching alquileres. Preserva numerales romanos. No modifica datos existentes.';

-- Test de normalización
SELECT
    nombre_original,
    normalizar_nombre_edificio(nombre_original) as normalizado
FROM (VALUES
    ('CONDOMINIO SKY MOON EQUIPETROL'),
    ('Edificio Macororó 9'),
    ('Condominio Aguaí'),
    ('CONDADO III'),
    ('CONDADO IV'),
    ('Sky moon'),
    ('EDIFICIO SKY MOON'),
    ('Torre Platinium II'),
    ('SÖLO Industrial Apartments'),
    ('Haus Equipe 5')
) AS t(nombre_original);

-- =====================================================
-- PASO 2: Materialized View mv_nombre_proyecto_lookup
-- Aplana todas las variantes de nombre → id_proyecto_master
-- Es de SOLO LECTURA. No modifica proyectos_master.
-- =====================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_nombre_proyecto_lookup AS
SELECT DISTINCT ON (normalized_key)
    normalized_key,
    id_proyecto_master,
    nombre_original,
    source_type,
    source_priority
FROM (
    -- Fuente 1: nombre_oficial exacto (lowercase + trim)
    SELECT
        LOWER(TRIM(pm.nombre_oficial)) as normalized_key,
        pm.id_proyecto_master,
        pm.nombre_oficial as nombre_original,
        'oficial_exacto' as source_type,
        1 as source_priority
    FROM proyectos_master pm
    WHERE pm.activo = true
      AND pm.nombre_oficial IS NOT NULL
      AND TRIM(pm.nombre_oficial) != ''

    UNION ALL

    -- Fuente 2: nombre_oficial normalizado
    SELECT
        normalizar_nombre_edificio(pm.nombre_oficial),
        pm.id_proyecto_master,
        pm.nombre_oficial,
        'oficial_normalizado',
        2
    FROM proyectos_master pm
    WHERE pm.activo = true
      AND pm.nombre_oficial IS NOT NULL
      AND normalizar_nombre_edificio(pm.nombre_oficial) IS NOT NULL

    UNION ALL

    -- Fuente 3: cada alias exacto (lowercase + trim)
    SELECT
        LOWER(TRIM(alias)),
        pm.id_proyecto_master,
        alias,
        'alias_exacto',
        3
    FROM proyectos_master pm,
         unnest(pm.alias_conocidos) AS alias
    WHERE pm.activo = true
      AND pm.alias_conocidos IS NOT NULL
      AND TRIM(alias) != ''

    UNION ALL

    -- Fuente 4: cada alias normalizado
    SELECT
        normalizar_nombre_edificio(alias),
        pm.id_proyecto_master,
        alias,
        'alias_normalizado',
        4
    FROM proyectos_master pm,
         unnest(pm.alias_conocidos) AS alias
    WHERE pm.activo = true
      AND pm.alias_conocidos IS NOT NULL
      AND normalizar_nombre_edificio(alias) IS NOT NULL
) all_variants
WHERE normalized_key IS NOT NULL
  AND normalized_key != ''
ORDER BY normalized_key, source_priority;

-- Índice único para lookup O(1)
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_lookup_key
ON mv_nombre_proyecto_lookup(normalized_key);

-- Verificar
SELECT count(*) as total_variantes FROM mv_nombre_proyecto_lookup;

-- =====================================================
-- PASO 3: Vista de ambigüedades
-- Detecta cuando un nombre normalizado apunta a
-- múltiples proyectos (ej: "condado" → Condado III, IV, VI)
-- =====================================================

CREATE OR REPLACE VIEW v_lookup_ambiguities AS
SELECT
    nk as normalized_key,
    COUNT(DISTINCT id_pm) as project_count,
    array_agg(DISTINCT id_pm) as project_ids,
    array_agg(DISTINCT nombre) as nombres
FROM (
    SELECT normalizar_nombre_edificio(nombre_oficial) as nk,
           id_proyecto_master as id_pm, nombre_oficial as nombre
    FROM proyectos_master WHERE activo = true AND nombre_oficial IS NOT NULL
    UNION ALL
    SELECT normalizar_nombre_edificio(alias), id_proyecto_master, alias
    FROM proyectos_master, unnest(alias_conocidos) alias
    WHERE activo = true AND alias_conocidos IS NOT NULL
) all_v
WHERE nk IS NOT NULL AND nk != ''
GROUP BY nk
HAVING COUNT(DISTINCT id_pm) > 1;

-- Ver ambigüedades
SELECT * FROM v_lookup_ambiguities;

-- =====================================================
-- PASO 4: Función matchear_alquiler(p_id)
-- Core del sistema. Tier 1 → Tier 2 → Tier 3.
-- Solo para alquileres. No toca ventas.
-- =====================================================

CREATE OR REPLACE FUNCTION matchear_alquiler(p_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_prop RECORD;
    v_nombre_exact TEXT;
    v_nombre_norm TEXT;
    v_lookup RECORD;
    v_ambiguity_count INTEGER;
    v_gps_match RECORD;
    v_try_gps BOOLEAN := false;
BEGIN
    -- Obtener propiedad
    SELECT id, nombre_edificio, latitud, longitud,
           id_proyecto_master, tipo_operacion, status,
           campos_bloqueados
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

    -- Respetar candados
    IF v_prop.campos_bloqueados IS NOT NULL
       AND v_prop.campos_bloqueados ? 'id_proyecto_master'
       AND (v_prop.campos_bloqueados->'id_proyecto_master'->>'bloqueado')::boolean = true THEN
        RETURN jsonb_build_object('success', false, 'error', 'campo_bloqueado');
    END IF;

    -- Ya matcheada
    IF v_prop.id_proyecto_master IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'ya_matcheada',
                                  'id_proyecto', v_prop.id_proyecto_master);
    END IF;

    -- Sin nombre → directo a GPS
    IF v_prop.nombre_edificio IS NULL OR TRIM(v_prop.nombre_edificio) = '' THEN
        v_try_gps := true;
    END IF;

    -- ============================================
    -- TIER 1: Exact dictionary lookup
    -- ============================================
    IF NOT v_try_gps THEN
        v_nombre_exact := LOWER(TRIM(v_prop.nombre_edificio));

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
                'add_alias', false
            );
        END IF;
    END IF;

    -- ============================================
    -- TIER 2: Normalized lookup
    -- ============================================
    IF NOT v_try_gps THEN
        v_nombre_norm := normalizar_nombre_edificio(v_prop.nombre_edificio);

        IF v_nombre_norm IS NOT NULL THEN
            -- Verificar ambigüedad
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
                -- Match unambiguo
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
                        'alias_to_add', v_prop.nombre_edificio
                    );
                END IF;
            ELSIF v_ambiguity_count > 1 THEN
                -- Ambiguo: múltiples proyectos matchean
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
                    )
                );
            END IF;
        END IF;
    END IF;

    -- ============================================
    -- TIER 3: GPS fallback
    -- ============================================
    IF v_prop.latitud IS NOT NULL AND v_prop.longitud IS NOT NULL THEN
        SELECT pm.id_proyecto_master, pm.nombre_oficial,
               ROUND(111000 * SQRT(
                   POWER(v_prop.latitud - pm.latitud, 2) +
                   POWER((v_prop.longitud - pm.longitud) * COS(RADIANS(v_prop.latitud)), 2)
               ))::INTEGER as dist_metros
        INTO v_gps_match
        FROM proyectos_master pm
        WHERE pm.activo = true
          AND pm.latitud IS NOT NULL AND pm.longitud IS NOT NULL
          AND ABS(pm.latitud - v_prop.latitud) < 0.0005
          AND ABS(pm.longitud - v_prop.longitud) < 0.0005
        ORDER BY POWER(v_prop.latitud - pm.latitud, 2) +
                 POWER((v_prop.longitud - pm.longitud) * COS(RADIANS(v_prop.latitud)), 2)
        LIMIT 1;

        IF v_gps_match IS NOT NULL AND v_gps_match.dist_metros <= 50 THEN
            RETURN jsonb_build_object(
                'success', true, 'tier', 3,
                'method', CASE WHEN v_try_gps THEN 'gps_sin_nombre' ELSE 'gps_con_nombre' END,
                'id_proyecto', v_gps_match.id_proyecto_master,
                'nombre_proyecto', v_gps_match.nombre_oficial,
                'confidence', CASE
                    WHEN v_gps_match.dist_metros <= 20 THEN 75
                    WHEN v_gps_match.dist_metros <= 35 THEN 68
                    ELSE 60
                END,
                'distancia_metros', v_gps_match.dist_metros,
                'auto_approve', false,
                'nombre_no_reconocido', v_prop.nombre_edificio
            );
        END IF;
    END IF;

    -- Sin match en ningún tier
    RETURN jsonb_build_object(
        'success', false,
        'error', 'sin_match',
        'nombre_edificio', v_prop.nombre_edificio,
        'nombre_normalizado', v_nombre_norm
    );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION matchear_alquiler IS
'Matching inteligente de alquileres por dictionary lookup (3 tiers). No afecta ventas.';

-- =====================================================
-- PASO 5: matching_alquileres_batch()
-- Orquestador para el backlog inicial. Procesa solo
-- alquileres completados sin match.
-- =====================================================

CREATE OR REPLACE FUNCTION matching_alquileres_batch()
RETURNS TABLE(
    total_procesadas INTEGER,
    tier1_exacto INTEGER,
    tier2_normalizado INTEGER,
    tier2_ambiguo INTEGER,
    tier3_gps INTEGER,
    sin_match INTEGER,
    auto_aprobados INTEGER,
    aliases_aprendidos INTEGER
) AS $$
DECLARE
    v_prop RECORD;
    v_result JSONB;
    v_total INT := 0;
    v_t1 INT := 0; v_t2 INT := 0; v_t2a INT := 0;
    v_t3 INT := 0; v_sin INT := 0;
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
        ORDER BY id
    LOOP
        v_total := v_total + 1;
        v_result := matchear_alquiler(v_prop.id);

        IF (v_result->>'success')::boolean THEN
            -- Contar por tier
            CASE (v_result->>'tier')::integer
                WHEN 1 THEN v_t1 := v_t1 + 1;
                WHEN 2 THEN
                    IF v_result->>'method' = 'normalized_ambiguous' THEN
                        v_t2a := v_t2a + 1;
                    ELSE
                        v_t2 := v_t2 + 1;
                    END IF;
                WHEN 3 THEN v_t3 := v_t3 + 1;
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

                -- Self-learning: agregar alias si es Tier 2
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
                -- No auto-approve → cola HITL
                INSERT INTO matching_sugerencias (
                    propiedad_id, proyecto_master_sugerido, metodo_matching,
                    score_confianza, match_nombre, match_gps, razon_match,
                    estado, created_at
                ) VALUES (
                    v_prop.id,
                    CASE WHEN v_result ? 'id_proyecto'
                         THEN (v_result->>'id_proyecto')::integer
                         ELSE NULL END,
                    'alquiler_' || (v_result->>'method'),
                    (v_result->>'confidence')::integer,
                    (v_result->>'tier')::integer <= 2,
                    (v_result->>'tier')::integer = 3,
                    format('Alquiler match tier %s: %s', v_result->>'tier', v_result->>'method'),
                    'pendiente',
                    NOW()
                )
                ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
                DO NOTHING;
            END IF;
        ELSE
            v_sin := v_sin + 1;
        END IF;
    END LOOP;

    -- Refresh post-aliases aprendidos
    IF v_aliases > 0 THEN
        REFRESH MATERIALIZED VIEW mv_nombre_proyecto_lookup;
    END IF;

    RETURN QUERY SELECT v_total, v_t1, v_t2, v_t2a, v_t3, v_sin, v_auto, v_aliases;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION matching_alquileres_batch IS
'Ejecuta matching masivo para alquileres sin proyecto. Solo afecta alquileres.';

-- =====================================================
-- PASO 6: Trigger para matching real-time
-- Se activa en merge de alquileres. Solo para alquileres.
-- Creado como DISABLED — se habilita en migración 142.
-- =====================================================

CREATE OR REPLACE FUNCTION trg_matchear_alquiler_fn()
RETURNS TRIGGER AS $$
DECLARE
    v_result JSONB;
BEGIN
    -- Solo alquileres
    IF NEW.tipo_operacion != 'alquiler' THEN
        RETURN NEW;
    END IF;

    -- Solo si no tiene match
    IF NEW.id_proyecto_master IS NOT NULL THEN
        RETURN NEW;
    END IF;

    -- Solo si nombre_edificio cambió o status pasó a completado
    IF NOT (
        (OLD.nombre_edificio IS DISTINCT FROM NEW.nombre_edificio AND NEW.nombre_edificio IS NOT NULL)
        OR (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completado')
    ) THEN
        RETURN NEW;
    END IF;

    -- Intentar match
    v_result := matchear_alquiler(NEW.id);

    IF (v_result->>'success')::boolean AND (v_result->>'auto_approve')::boolean THEN
        -- Aplicar directo en el mismo row
        NEW.id_proyecto_master := (v_result->>'id_proyecto')::integer;
        NEW.metodo_match := 'alquiler_' || (v_result->>'method');
        NEW.confianza_sugerencia_extractor := (v_result->>'confidence')::integer;

        -- Self-learning: agregar alias
        IF COALESCE((v_result->>'add_alias')::boolean, false)
           AND v_result->>'alias_to_add' IS NOT NULL THEN
            UPDATE proyectos_master
            SET alias_conocidos = array_append(
                COALESCE(alias_conocidos, ARRAY[]::TEXT[]),
                v_result->>'alias_to_add'
            ),
            updated_at = NOW()
            WHERE id_proyecto_master = (v_result->>'id_proyecto')::integer
              AND NOT (v_result->>'alias_to_add') = ANY(COALESCE(alias_conocidos, ARRAY[]::TEXT[]));
        END IF;
    ELSIF (v_result->>'success')::boolean THEN
        -- Baja confianza → cola HITL
        INSERT INTO matching_sugerencias (
            propiedad_id, proyecto_master_sugerido, metodo_matching,
            score_confianza, match_nombre, match_gps, razon_match,
            estado, created_at
        ) VALUES (
            NEW.id,
            CASE WHEN v_result ? 'id_proyecto'
                 THEN (v_result->>'id_proyecto')::integer
                 ELSE NULL END,
            'alquiler_' || (v_result->>'method'),
            (v_result->>'confidence')::integer,
            (v_result->>'tier')::integer <= 2,
            (v_result->>'tier')::integer = 3,
            format('Auto-match alquiler: %s', v_result->>'method'),
            'pendiente',
            NOW()
        )
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
        DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger DISABLED (se habilita en mig 142)
CREATE TRIGGER trg_alquiler_matching
    BEFORE UPDATE ON propiedades_v2
    FOR EACH ROW
    EXECUTE FUNCTION trg_matchear_alquiler_fn();

-- Deshabilitar hasta que se ejecute el batch
ALTER TABLE propiedades_v2 DISABLE TRIGGER trg_alquiler_matching;

-- =====================================================
-- PASO 7: Trigger para refresh automático de lookup
-- Cuando cambian alias o nombres en proyectos_master
-- =====================================================

CREATE OR REPLACE FUNCTION trg_refresh_lookup_fn()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo refresh si cambiaron campos relevantes
    IF (OLD.nombre_oficial IS DISTINCT FROM NEW.nombre_oficial)
       OR (OLD.alias_conocidos IS DISTINCT FROM NEW.alias_conocidos) THEN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_nombre_proyecto_lookup;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_refresh_nombre_lookup
    AFTER UPDATE ON proyectos_master
    FOR EACH ROW
    EXECUTE FUNCTION trg_refresh_lookup_fn();

-- =====================================================
-- PASO 8: Permisos
-- =====================================================

GRANT SELECT ON mv_nombre_proyecto_lookup TO authenticated, anon;
GRANT SELECT ON v_lookup_ambiguities TO authenticated;
GRANT EXECUTE ON FUNCTION normalizar_nombre_edificio(TEXT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION matchear_alquiler(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION matching_alquileres_batch() TO authenticated;

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- 1. Lookup creado correctamente
SELECT count(*) as total_variantes,
       count(DISTINCT id_proyecto_master) as proyectos_cubiertos
FROM mv_nombre_proyecto_lookup;

-- 2. Test con nombre exacto conocido
SELECT matchear_alquiler(id) as resultado
FROM propiedades_v2
WHERE nombre_edificio ILIKE '%sky moon%'
  AND tipo_operacion = 'alquiler'
LIMIT 1;

-- 3. Ambigüedades detectadas
SELECT * FROM v_lookup_ambiguities;

-- 4. Preview del batch (sin ejecutar)
SELECT
    p.id, p.nombre_edificio,
    matchear_alquiler(p.id) as resultado
FROM propiedades_v2 p
WHERE p.tipo_operacion = 'alquiler'
  AND p.status = 'completado'
  AND p.id_proyecto_master IS NULL
ORDER BY p.id
LIMIT 20;
