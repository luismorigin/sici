-- =====================================================
-- MIGRACION 024: Integración Matching Trigram al Pipeline
-- Fecha: 8 Enero 2026
-- Dependencias: 022_fuzzy_matching_infraestructura.sql (pg_trgm)
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- CONTENIDO:
-- 1. Función extraer_nombre_de_descripcion() - Extrae nombres de edificios
-- 2. Función generar_matches_trigram() - Matching con pg_trgm
-- 3. Actualización matching_completo_automatizado() v3.2
-- =====================================================

-- =====================================================
-- PASO 1: Función para extraer nombres de descripción
-- =====================================================

CREATE OR REPLACE FUNCTION extraer_nombre_de_descripcion(p_descripcion TEXT)
RETURNS TEXT AS $$
DECLARE
    v_nombre TEXT;
    v_patrones TEXT[] := ARRAY[
        -- Patrones comunes en descripciones bolivianas
        'condominio\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)[\n,\.]',
        'edificio\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)[\n,\.]',
        'torre[s]?\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)[\n,\.]',
        'residencia[l]?\s+([A-Za-zÁÉÍÓÚáéíóúÑñ\s]+?)[\n,\.]',
        'sky\s+([A-Za-z0-9]+)',
        'domus\s+([A-Za-z]+)',
        'spazios?\s+([A-Za-z0-9]+)',
        'haus\s+([A-Za-z]+)',
        'vertical\s+([A-Za-z]+)'
    ];
    v_patron TEXT;
    v_match TEXT[];
BEGIN
    IF p_descripcion IS NULL OR LENGTH(p_descripcion) < 10 THEN
        RETURN NULL;
    END IF;

    -- Probar cada patrón
    FOREACH v_patron IN ARRAY v_patrones LOOP
        v_match := regexp_match(p_descripcion, v_patron, 'i');
        IF v_match IS NOT NULL AND v_match[1] IS NOT NULL THEN
            v_nombre := TRIM(v_match[1]);
            -- Limpiar y validar
            IF LENGTH(v_nombre) >= 3 AND LENGTH(v_nombre) <= 50 THEN
                -- Capitalizar primera letra
                RETURN INITCAP(
                    regexp_replace(v_patron, '\\s.*', '', 'g') || ' ' || v_nombre
                );
            END IF;
        END IF;
    END LOOP;

    -- Fallback: buscar marcas conocidas directamente
    IF p_descripcion ~* '\bsky\s*\d+\b' THEN
        v_match := regexp_match(p_descripcion, 'sky\s*(\d+)', 'i');
        IF v_match IS NOT NULL THEN
            RETURN 'Sky ' || v_match[1];
        END IF;
    END IF;

    IF p_descripcion ~* '\bhaus\s+equipe' THEN
        RETURN 'Haus Equipetrol';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION extraer_nombre_de_descripcion IS
'Extrae nombres de edificios de descripciones usando patrones comunes bolivianos';

-- Test
SELECT extraer_nombre_de_descripcion('Condominio HAUS EQUIPE
En Venta Departamento de 1 Dormitorio amoblado');

SELECT extraer_nombre_de_descripcion('AMPLIO DTO EN VENTA 2 DORMITORIOS EN SUITE
Edificio SKY 1 Equipetrol a pasos de M 40');

-- =====================================================
-- PASO 2: Función generar_matches_trigram()
-- =====================================================

CREATE OR REPLACE FUNCTION generar_matches_trigram()
RETURNS TABLE(
    propiedad_id INTEGER,
    proyecto_sugerido INTEGER,
    confianza INTEGER,
    metodo TEXT,
    nombre_extraido TEXT,
    score_trigram NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH propiedades_sin_match AS (
        -- Propiedades huérfanas que necesitan matching
        SELECT
            p.id,
            COALESCE(
                NULLIF(TRIM(p.nombre_edificio), ''),
                NULLIF(TRIM(p.datos_json->'proyecto'->>'nombre_edificio'), ''),
                extraer_nombre_de_descripcion(p.datos_json->'contenido'->>'descripcion')
            ) as nombre_para_buscar,
            p.zona
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master IS NULL
          AND p.status IN ('completado', 'actualizado')
          AND p.es_para_matching = true
          AND p.tipo_operacion = 'venta'
          AND (p.campos_bloqueados IS NULL
               OR NOT (p.campos_bloqueados ? 'id_proyecto_master'))
    ),
    matches_encontrados AS (
        -- Buscar matches usando trigram
        SELECT DISTINCT ON (psm.id)
            psm.id as prop_id,
            psm.nombre_para_buscar,
            bpf.id_proyecto,
            bpf.nombre as nombre_proyecto,
            bpf.score,
            bpf.match_tipo
        FROM propiedades_sin_match psm
        CROSS JOIN LATERAL buscar_proyecto_fuzzy(psm.nombre_para_buscar, 0.4, 3) bpf
        WHERE psm.nombre_para_buscar IS NOT NULL
          AND LENGTH(psm.nombre_para_buscar) >= 3
        ORDER BY psm.id, bpf.score DESC
    )
    SELECT
        me.prop_id,
        me.id_proyecto,
        -- Calcular confianza basada en score trigram
        CASE
            WHEN me.score >= 0.95 THEN 95  -- Alias exacto o nombre normalizado
            WHEN me.score >= 0.8 THEN 90
            WHEN me.score >= 0.6 THEN 80
            WHEN me.score >= 0.5 THEN 70
            ELSE 60
        END::INTEGER as confianza,
        'trigram_' || me.match_tipo,
        me.nombre_para_buscar,
        me.score
    FROM matches_encontrados me
    WHERE me.score >= 0.4;  -- Umbral mínimo
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION generar_matches_trigram IS
'v1.0: Genera matches usando pg_trgm trigram similarity.
- Extrae nombres de descripción si nombre_edificio es NULL
- Usa buscar_proyecto_fuzzy() de migración 022
- Confianza: 60-95% según score trigram';

-- Test
SELECT * FROM generar_matches_trigram();

-- =====================================================
-- PASO 3: Actualizar matching_completo_automatizado()
-- =====================================================

-- IMPORTANTE: DROP primero porque cambia el return type (agrega matches_trigram)
DROP FUNCTION IF EXISTS public.matching_completo_automatizado();

CREATE OR REPLACE FUNCTION public.matching_completo_automatizado()
RETURNS TABLE(
    matches_nombre integer,
    matches_url integer,
    matches_fuzzy integer,
    matches_trigram integer,
    matches_gps integer,
    auto_aprobados integer,
    aplicados integer,
    bloqueados integer,
    rechazados_inactivos integer,
    rechazados_ya_matcheadas integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_matches_nombre INT;
    v_matches_url INT;
    v_matches_fuzzy INT;
    v_matches_trigram INT;
    v_matches_gps INT;
    v_auto_aprobados INT;
    v_aplicados INT;
    v_bloqueados INT;
    v_rechazados_inactivos INT;
    v_rechazados_ya_matcheadas INT;
BEGIN
    -- ==================================================================
    -- PASO 1: MATCHING POR NOMBRE EXACTO (95%)
    -- ==================================================================
    WITH ins_nombre AS (
        INSERT INTO matching_sugerencias (
            propiedad_id, proyecto_master_sugerido, metodo_matching,
            score_confianza, match_nombre, razon_match, estado, created_at
        )
        SELECT
            gm.propiedad_id,
            gm.proyecto_sugerido,
            gm.metodo,
            gm.confianza,
            TRUE,
            'Match exacto por nombre de edificio',
            'pendiente',
            NOW()
        FROM generar_matches_por_nombre() gm
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_matches_nombre FROM ins_nombre;

    -- ==================================================================
    -- PASO 2: MATCHING POR URL SLUG (85-90%)
    -- ==================================================================
    SELECT matches_insertados INTO v_matches_url
    FROM generar_matches_por_url();

    -- ==================================================================
    -- PASO 3: MATCHING FUZZY WORD INTERSECTION (75-90%)
    -- ==================================================================
    WITH ins_fuzzy AS (
        INSERT INTO matching_sugerencias (
            propiedad_id, proyecto_master_sugerido, metodo_matching,
            score_confianza, razon_match, estado, created_at
        )
        SELECT
            gm.propiedad_id,
            gm.proyecto_sugerido,
            gm.metodo,
            gm.confianza,
            'Match fuzzy: ' || gm.similitud_porcentaje || '% similitud',
            'pendiente',
            NOW()
        FROM generar_matches_fuzzy() gm
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_matches_fuzzy FROM ins_fuzzy;

    -- ==================================================================
    -- PASO 4: MATCHING TRIGRAM pg_trgm (60-95%) [NUEVO]
    -- Incluye extracción de nombres de descripción
    -- ==================================================================
    WITH ins_trigram AS (
        INSERT INTO matching_sugerencias (
            propiedad_id, proyecto_master_sugerido, metodo_matching,
            score_confianza, razon_match, estado, created_at
        )
        SELECT
            gm.propiedad_id,
            gm.proyecto_sugerido,
            gm.metodo,
            gm.confianza,
            'Match trigram: ' || ROUND(gm.score_trigram * 100) || '% (nombre: ' || gm.nombre_extraido || ')',
            'pendiente',
            NOW()
        FROM generar_matches_trigram() gm
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_matches_trigram FROM ins_trigram;

    -- ==================================================================
    -- PASO 5: MATCHING POR GPS (65-85%)
    -- ==================================================================
    WITH ins_gps AS (
        INSERT INTO matching_sugerencias (
            propiedad_id, proyecto_master_sugerido, metodo_matching,
            score_confianza, distancia_metros, razon_match, estado, created_at
        )
        SELECT
            gm.propiedad_id,
            gm.proyecto_sugerido,
            gm.metodo,
            gm.confianza,
            gm.distancia_metros,
            'Match GPS: ' || ROUND(gm.distancia_metros) || 'm de proyecto verificado',
            'pendiente',
            NOW()
        FROM generar_matches_gps() gm
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_matches_gps FROM ins_gps;

    -- ==================================================================
    -- PASO 6: AUTO-APROBAR ALTA CONFIANZA (>= 85%)
    -- ==================================================================
    WITH aprobados AS (
        UPDATE matching_sugerencias
        SET estado = 'aprobado',
            revisado_por = 'sistema_automatico',
            fecha_revision = NOW()
        WHERE estado = 'pendiente'
          AND score_confianza >= 85
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_auto_aprobados FROM aprobados;

    -- ==================================================================
    -- PASO 7: AUTO-RECHAZAR PROPIEDADES INACTIVAS
    -- ==================================================================
    WITH rechazados_inact AS (
        UPDATE matching_sugerencias ms
        SET estado = 'rechazado',
            revisado_por = 'sistema_filtro_inactivas',
            fecha_revision = NOW()
        FROM propiedades_v2 p
        WHERE ms.propiedad_id = p.id
          AND ms.estado = 'pendiente'
          AND p.es_activa = FALSE
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_rechazados_inactivos FROM rechazados_inact;

    -- ==================================================================
    -- PASO 8: AUTO-RECHAZAR PROPIEDADES YA MATCHEADAS
    -- ==================================================================
    WITH rechazados_match AS (
        UPDATE matching_sugerencias ms
        SET estado = 'rechazado',
            revisado_por = 'sistema_ya_matcheada',
            fecha_revision = NOW()
        FROM propiedades_v2 p
        WHERE ms.propiedad_id = p.id
          AND ms.estado = 'pendiente'
          AND p.id_proyecto_master IS NOT NULL
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_rechazados_ya_matcheadas FROM rechazados_match;

    -- ==================================================================
    -- PASO 9: APLICAR MATCHES APROBADOS A PROPIEDADES
    -- ==================================================================
    SELECT a.actualizados, a.bloqueados
    INTO v_aplicados, v_bloqueados
    FROM aplicar_matches_aprobados() AS a;

    -- ==================================================================
    -- PASO 10: RETORNAR RESUMEN CONSOLIDADO
    -- ==================================================================
    RETURN QUERY SELECT
        v_matches_nombre,
        v_matches_url,
        v_matches_fuzzy,
        v_matches_trigram,
        v_matches_gps,
        v_auto_aprobados,
        v_aplicados,
        v_bloqueados,
        v_rechazados_inactivos,
        v_rechazados_ya_matcheadas;
END;
$function$;

COMMENT ON FUNCTION matching_completo_automatizado() IS
'v3.2: Orquestador principal del sistema de matching automatico.
- NUEVO: Incluye matching trigram con pg_trgm
- NUEVO: Extrae nombres de descripción cuando nombre_edificio es NULL
- Orden: nombre (95%) > URL (85-90%) > fuzzy (75-90%) > trigram (60-95%) > GPS (65-85%)
- Auto-aprueba >= 85% confianza
- Rechaza inactivas y ya matcheadas';

-- =====================================================
-- VERIFICACION FINAL
-- =====================================================

SELECT 'Migracion 024 - Componentes Instalados' as status;

SELECT
    'extraer_nombre_de_descripcion()' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'extraer_nombre_de_descripcion')
         THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'generar_matches_trigram()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'generar_matches_trigram')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'matching_completo_automatizado() v3.2',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'matching_completo_automatizado')
         THEN 'OK' ELSE 'FALTA' END;

-- Test de extracción
SELECT '--- TEST: extraer_nombre_de_descripcion ---' as test;
SELECT extraer_nombre_de_descripcion('Condominio HAUS EQUIPE en Venta') as resultado;
SELECT extraer_nombre_de_descripcion('Edificio SKY 1 Equipetrol') as resultado;

-- Test de matches trigram
SELECT '--- TEST: generar_matches_trigram ---' as test;
SELECT * FROM generar_matches_trigram();

-- Preview del matching completo (sin ejecutar)
SELECT '--- Huérfanas actuales ---' as test;
SELECT COUNT(*) as huerfanas_actuales
FROM propiedades_v2
WHERE id_proyecto_master IS NULL
  AND status = 'completado'
  AND es_para_matching = true
  AND tipo_operacion = 'venta';
