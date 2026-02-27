-- Función trigger: proteger_amenities_candados
-- Última migración: 116
-- Exportado de producción: 27 Feb 2026
-- Dominio: Trigger / Protección amenities durante merge
-- Dispara: BEFORE UPDATE en propiedades_v2

CREATE OR REPLACE FUNCTION public.proteger_amenities_candados()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Solo actuar cuando el merge está corriendo (status cambia de actualizado a completado)
    -- Y hay candados de amenities o equipamiento
    IF OLD.status = 'actualizado'
       AND NEW.status = 'completado'
       AND (
           _is_campo_bloqueado(NEW.campos_bloqueados, 'amenities')
           OR _is_campo_bloqueado(NEW.campos_bloqueados, 'equipamiento')
       )
    THEN
        -- Restaurar la sección amenities del valor anterior (antes del merge)
        IF OLD.datos_json->'amenities' IS NOT NULL THEN
            NEW.datos_json = jsonb_set(
                NEW.datos_json,
                '{amenities}',
                OLD.datos_json->'amenities'
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
