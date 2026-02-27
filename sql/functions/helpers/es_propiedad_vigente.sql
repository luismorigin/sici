-- Función: es_propiedad_vigente
-- Última migración: 114
-- Exportado de producción: 27 Feb 2026
-- Dominio: Helper / Filtro vigencia propiedades
-- Nota: 300 días para TODOS (sin distinción preventa/entrega)

CREATE OR REPLACE FUNCTION public.es_propiedad_vigente(p_estado_construccion text, p_fecha_publicacion date, p_fecha_discovery timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
BEGIN
    RETURN CURRENT_DATE - COALESCE(p_fecha_publicacion, p_fecha_discovery::date) <= 300;
END;
$function$;
