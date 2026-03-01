-- Migración 170: aplicar_matches_aprobados() → backfill nombre_edificio desde proyecto
--
-- Bug: matching asigna id_proyecto_master pero nunca copia nombre_edificio del proyecto.
-- Esto dejó 138 propiedades con proyecto asignado pero nombre NULL.
--
-- Fix: al aplicar match, si la propiedad no tiene nombre_edificio (y no está bloqueado),
-- copiar nombre_oficial del proyecto master.
--
-- Callers: matching_completo_automatizado() (nocturno), aplicar_matches_revisados() (HITL)
-- Firma: sin cambios — RETURNS TABLE(actualizados integer, bloqueados integer)
-- Diagnóstico: docs/analysis/AUDITORIA_DATOS_VENTAS.md (sección 2)

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
            -- migración 170: backfill nombre_edificio desde proyecto master
            nombre_edificio = CASE
                WHEN p.nombre_edificio IS NULL
                     AND NOT campo_esta_bloqueado(p.campos_bloqueados, 'nombre_edificio')
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
