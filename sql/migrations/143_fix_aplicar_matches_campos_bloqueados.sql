-- ============================================================================
-- Migración 143: Fix aplicar_matches_aprobados() para formato nuevo de candados
-- ============================================================================
-- Bug: campos_bloqueados->>'id_proyecto_master' puede ser:
--   Formato viejo: "true" (cast directo a boolean funciona)
--   Formato nuevo: '{"bloqueado": true, "por": "admin", ...}' (cast falla)
--
-- Fix: Usar helper que soporta ambos formatos
-- ============================================================================

-- Helper: verifica si un campo está bloqueado (soporta ambos formatos)
CREATE OR REPLACE FUNCTION campo_esta_bloqueado(
    p_campos_bloqueados JSONB,
    p_campo TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
    IF p_campos_bloqueados IS NULL THEN RETURN FALSE; END IF;
    IF NOT p_campos_bloqueados ? p_campo THEN RETURN FALSE; END IF;

    -- Formato nuevo: {"campo": {"bloqueado": true, ...}}
    IF jsonb_typeof(p_campos_bloqueados->p_campo) = 'object' THEN
        RETURN COALESCE((p_campos_bloqueados->p_campo->>'bloqueado')::boolean, FALSE);
    END IF;

    -- Formato viejo: {"campo": true}
    IF jsonb_typeof(p_campos_bloqueados->p_campo) = 'boolean' THEN
        RETURN (p_campos_bloqueados->p_campo)::boolean;
    END IF;

    -- String "true"/"false"
    BEGIN
        RETURN (p_campos_bloqueados->>p_campo)::boolean;
    EXCEPTION WHEN OTHERS THEN
        RETURN FALSE;
    END;
END;
$$;

-- Recrear aplicar_matches_aprobados con el helper
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
            metodo_match = ms.metodo_matching
        FROM matching_sugerencias ms
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

DO $$
BEGIN
    RAISE NOTICE 'Migración 143: Fix campos_bloqueados en aplicar_matches_aprobados()';
END $$;
