-- =============================================================================
-- FUNCION: aplicar_matches_aprobados()
-- DESCRIPCION: Aplica matches aprobados a propiedades (respeta candados)
-- VERSION: 3.0
-- AUTOR: Luis - SICI
-- FECHA: Diciembre 2025
-- =============================================================================
-- CAMBIOS v3.0 (28 Dic 2025):
--   - Migracion a propiedades_v2
--   - Columna confianza_match -> confianza_sugerencia_extractor
--   - Mantiene sistema de candados
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aplicar_matches_aprobados()
RETURNS TABLE(
    actualizados integer,
    bloqueados integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_actualizados INT;
    v_bloqueados INT;
BEGIN
    -- ==================================================================
    -- PASO 1: Contar propiedades bloqueadas (solo conteo, no actualiza)
    -- ==================================================================
    SELECT COUNT(*) INTO v_bloqueados
    FROM propiedades_v2 p
    JOIN matching_sugerencias ms ON ms.propiedad_id = p.id
    WHERE ms.estado = 'aprobado'
      AND COALESCE((p.campos_bloqueados->>'id_proyecto_master')::boolean, FALSE) = TRUE;

    -- ==================================================================
    -- PASO 2: Actualizar propiedades (respetando candados)
    -- ==================================================================
    WITH updated AS (
        UPDATE propiedades_v2 p
        SET
            id_proyecto_master = ms.proyecto_master_sugerido,
            confianza_sugerencia_extractor = ms.score_confianza,
            metodo_match = ms.metodo_matching
        FROM matching_sugerencias ms
        WHERE p.id = ms.propiedad_id
          AND ms.estado = 'aprobado'
          -- FILTRO CRITICO: Respetar candados manuales
          AND COALESCE((p.campos_bloqueados->>'id_proyecto_master')::boolean, FALSE) = FALSE
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_actualizados FROM updated;

    -- ==================================================================
    -- PASO 3: Retornar resumen
    -- ==================================================================
    RETURN QUERY SELECT v_actualizados, v_bloqueados;
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION aplicar_matches_aprobados() IS
'v3.0: Aplica matches aprobados de matching_sugerencias a propiedades_v2.
- Actualiza: id_proyecto_master, confianza_sugerencia_extractor, metodo_match
- Respeta candados manuales en campos_bloqueados
- Retorna: cantidad de actualizados y bloqueados';

-- =============================================================================
-- SISTEMA DE CANDADOS
-- =============================================================================
-- El campo campos_bloqueados protege correcciones manuales:
--
-- Activar candado:
-- UPDATE propiedades_v2
-- SET campos_bloqueados = jsonb_set(
--   COALESCE(campos_bloqueados, '{}'::jsonb),
--   '{id_proyecto_master}',
--   'true'
-- )
-- WHERE id = 123;
--
-- Ver propiedades bloqueadas:
-- SELECT id, nombre_edificio FROM propiedades_v2
-- WHERE (campos_bloqueados->>'id_proyecto_master')::boolean = TRUE;
-- =============================================================================

-- =============================================================================
-- EJEMPLO DE USO
-- =============================================================================
-- SELECT * FROM aplicar_matches_aprobados();
--
-- Resultado esperado:
--  actualizados | bloqueados
-- --------------+------------
--            79 |          0
-- =============================================================================
