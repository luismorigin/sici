-- Función: precio_normalizado
-- Última migración: 167
-- Exportado de producción: 27 Feb 2026
-- Dominio: Helper / Normalización TC paralelo
-- Uso: Convierte precio detectado en paralelo a USD real

CREATE OR REPLACE FUNCTION public.precio_normalizado(p_precio_usd numeric, p_tipo_cambio_detectado text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'paralelo' THEN
      ROUND(p_precio_usd * (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo') / 6.96, 2)
    ELSE p_precio_usd
  END;
$function$;
