-- =============================================================================
-- FUNCION: matching_completo_automatizado()
-- DESCRIPCION: Orquestadora principal del sistema de matching automatico
-- VERSION: 3.0
-- AUTOR: Luis - SICI
-- FECHA: Diciembre 2025
-- =============================================================================
-- CAMBIOS v3.0 (28 Dic 2025):
--   - Migracion a propiedades_v2
--   - Usa funciones generar_matches_* v3.0
--   - Status: completado, actualizado
--   - Filtros de rechazo adaptados a propiedades_v2
-- =============================================================================
-- PREREQUISITOS:
--   - FK de matching_sugerencias debe apuntar a propiedades_v2
--   - Ejecutar 003_matching_sugerencias_fk_v2.sql primero
-- =============================================================================

CREATE OR REPLACE FUNCTION public.matching_completo_automatizado()
RETURNS TABLE(
    matches_nombre integer,
    matches_url integer,
    matches_fuzzy integer,
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
    v_matches_gps INT := 0;  -- GPS matching desactivado por ahora
    v_auto_aprobados INT;
    v_aplicados INT;
    v_bloqueados INT;
    v_rechazados_inactivos INT;
    v_rechazados_ya_matcheadas INT;
BEGIN
    -- ==================================================================
    -- PASO 1: MATCHING POR NOMBRE EXACTO
    -- Usa generar_matches_por_nombre() v3.0
    -- Confianza: 95%
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
    -- PASO 2: MATCHING POR URL SLUG (Solo Century21)
    -- Usa generar_matches_por_url() v3.0 - ya hace INSERT internamente
    -- Confianza: 85-90%
    -- ==================================================================
    SELECT matches_insertados INTO v_matches_url
    FROM generar_matches_por_url();

    -- ==================================================================
    -- PASO 3: MATCHING FUZZY (Word Intersection)
    -- Usa generar_matches_fuzzy() v3.0
    -- Confianza: 75-90%
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
    -- PASO 4: AUTO-APROBAR ALTA CONFIANZA (>= 85%)
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
    -- PASO 5: AUTO-RECHAZAR PROPIEDADES INACTIVAS
    -- Adaptado para status de propiedades_v2
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
    -- PASO 6: AUTO-RECHAZAR PROPIEDADES YA MATCHEADAS
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
    -- PASO 7: APLICAR MATCHES APROBADOS A PROPIEDADES
    -- Usa aplicar_matches_aprobados() v3.0
    -- ==================================================================
    SELECT a.actualizados, a.bloqueados
    INTO v_aplicados, v_bloqueados
    FROM aplicar_matches_aprobados() AS a;

    -- ==================================================================
    -- PASO 8: RETORNAR RESUMEN CONSOLIDADO
    -- ==================================================================
    RETURN QUERY SELECT
        v_matches_nombre,
        v_matches_url,
        v_matches_fuzzy,
        v_matches_gps,
        v_auto_aprobados,
        v_aplicados,
        v_bloqueados,
        v_rechazados_inactivos,
        v_rechazados_ya_matcheadas;
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION matching_completo_automatizado() IS
'v3.0: Orquestador principal del sistema de matching automatico.
- Tabla: propiedades_v2
- Ejecuta: nombre (95%), URL (85-90%), fuzzy (75-90%)
- Auto-aprueba >= 85% confianza
- Rechaza inactivas y ya matcheadas
- Aplica matches a propiedades_v2';

-- =============================================================================
-- EJEMPLO DE USO
-- =============================================================================
-- SELECT * FROM matching_completo_automatizado();
--
-- Resultado esperado:
--  matches_nombre | matches_url | matches_fuzzy | matches_gps | auto_aprobados | aplicados | bloqueados | rechazados_inactivos | rechazados_ya_matcheadas
-- ----------------+-------------+---------------+-------------+----------------+-----------+------------+----------------------+--------------------------
--              42 |          27 |            10 |           0 |             79 |        79 |          0 |                    5 |                        2
-- =============================================================================
