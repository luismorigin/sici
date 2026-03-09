-- Migración 187: aplicar_matches_aprobados() — sobrescribir nombre_edificio siempre
--
-- Bug: migración 170 solo copiaba pm.nombre_oficial cuando p.nombre_edificio IS NULL.
-- El regex Remax/C21 produce basura en ~25% de casos ("PAGO AL CONTADO", "De Dise",
-- "Consta De Seguridad Las"), así que preservar el valor existente no tiene sentido.
--
-- Fix: sobrescribir nombre_edificio SIEMPRE que no tenga candado.
-- Si el matching ya vinculó al PM correcto, el nombre oficial es la fuente de verdad.
--
-- Cambio único (líneas 36-40):
--   ANTES: WHEN p.nombre_edificio IS NULL AND NOT campo_esta_bloqueado(...) THEN pm.nombre_oficial
--   AHORA: WHEN NOT campo_esta_bloqueado(...) THEN pm.nombre_oficial
--
-- Impacto: solo afecta props que pasan por matching nocturno o HITL.
-- Props existentes ya corregidas con UPDATE directo (9 Mar 2026).

CREATE OR REPLACE FUNCTION public.aplicar_matches_aprobados()
 RETURNS TABLE(actualizados integer, bloqueados integer)
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
            -- migración 187: SIEMPRE copiar nombre_oficial (excepto candado)
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
