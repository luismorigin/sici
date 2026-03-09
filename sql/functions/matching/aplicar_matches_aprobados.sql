-- =============================================================================
-- FUNCION: aplicar_matches_aprobados()
-- DESCRIPCION: Aplica matches aprobados a propiedades (respeta candados)
-- VERSION: 3.1
-- AUTOR: Luis - SICI
-- FECHA: Marzo 2026
-- =============================================================================
-- CAMBIOS v3.1 (9 Mar 2026 — migración 187):
--   - SIEMPRE copiar pm.nombre_oficial a nombre_edificio (excepto candado)
--   - Antes: solo copiaba cuando nombre_edificio IS NULL (basura regex se preservaba)
--   - Usa campo_esta_bloqueado() helper en vez de COALESCE manual
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
    -- PASO 1: Contar propiedades bloqueadas
    SELECT COUNT(*) INTO v_bloqueados
    FROM propiedades_v2 p
    JOIN matching_sugerencias ms ON ms.propiedad_id = p.id
    WHERE ms.estado = 'aprobado'
      AND campo_esta_bloqueado(p.campos_bloqueados, 'id_proyecto_master') = TRUE;

    -- PASO 2: Actualizar propiedades (respetando candados)
    WITH updated AS (
        UPDATE propiedades_v2 p
        SET
            id_proyecto_master = ms.proyecto_master_sugerido,
            confianza_sugerencia_extractor = ms.score_confianza,
            metodo_match = ms.metodo_matching,
            -- v3.1: SIEMPRE copiar nombre_oficial (excepto candado)
            nombre_edificio = CASE
                WHEN NOT campo_esta_bloqueado(p.campos_bloqueados, 'nombre_edificio')
                THEN pm.nombre_oficial
                ELSE p.nombre_edificio
            END
        FROM matching_sugerencias ms
        JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
        WHERE p.id = ms.propiedad_id
          AND ms.estado = 'aprobado'
          AND campo_esta_bloqueado(p.campos_bloqueados, 'id_proyecto_master') = FALSE
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_actualizados FROM updated;

    -- PASO 3: Retornar resumen
    RETURN QUERY SELECT v_actualizados, v_bloqueados;
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION aplicar_matches_aprobados() IS
'v3.1: Aplica matches aprobados de matching_sugerencias a propiedades_v2.
- Actualiza: id_proyecto_master, confianza_sugerencia_extractor, metodo_match, nombre_edificio
- nombre_edificio = pm.nombre_oficial SIEMPRE (excepto candado)
- Respeta candados manuales en campos_bloqueados
- Retorna: cantidad de actualizados y bloqueados';
