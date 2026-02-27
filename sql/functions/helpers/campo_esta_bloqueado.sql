-- Funciones: campo_esta_bloqueado + _is_campo_bloqueado
-- Última migración: 115
-- Exportado de producción: 27 Feb 2026
-- Dominio: Helper / Sistema candados (campos_bloqueados)
-- Soporta formato nuevo {"campo": {"bloqueado": true}} y viejo {"campo": true}

-- =============================================
-- _is_campo_bloqueado: Versión interna (usada en triggers)
-- =============================================
CREATE OR REPLACE FUNCTION public._is_campo_bloqueado(p_candados jsonb, p_campo text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    -- Nuevo formato del admin: {"campo": {"bloqueado": true, ...}}
    IF jsonb_typeof(p_candados->p_campo) = 'object' THEN
        RETURN COALESCE((p_candados->p_campo->>'bloqueado')::boolean, false);
    END IF;
    -- Formato antiguo: {"campo": true}
    RETURN COALESCE((p_candados->>p_campo)::boolean, false);
END;
$function$;

-- =============================================
-- campo_esta_bloqueado: Versión pública con null-safety
-- =============================================
CREATE OR REPLACE FUNCTION public.campo_esta_bloqueado(p_campos_bloqueados jsonb, p_campo text)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
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
$function$;
