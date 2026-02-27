-- Función: exportar_propiedades_excluidas
-- Última migración: 023
-- Exportado de producción: 27 Feb 2026
-- Dominio: HITL / Exportación excluidas para supervisión

CREATE OR REPLACE FUNCTION public.exportar_propiedades_excluidas()
 RETURNS TABLE(propiedad_id integer, url text, fuente text, precio_usd numeric, precio_m2 numeric, dormitorios integer, area_m2 numeric, zona text, nombre_edificio text, score_calidad integer, razon_exclusion text, es_multiproyecto boolean, moneda_original text, precio_original numeric, precio_fue_normalizado boolean, precio_sospechoso boolean)
 LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        p.id as propiedad_id,
        p.url,
        p.fuente,
        p.precio_usd,
        CASE WHEN p.area_total_m2 > 0
             THEN ROUND((p.precio_usd / p.area_total_m2)::numeric, 0)
             ELSE NULL END as precio_m2,
        p.dormitorios,
        p.area_total_m2 as area_m2,
        p.zona,
        p.nombre_edificio,
        p.score_calidad_dato as score_calidad,
        detectar_razon_exclusion(p.id) as razon_exclusion,
        p.es_multiproyecto,
        (p.datos_json->'financiero'->>'moneda_original')::TEXT,
        (p.datos_json->'financiero'->>'precio_usd_original')::NUMERIC,
        (p.datos_json->'financiero'->>'precio_fue_normalizado')::BOOLEAN,
        (p.datos_json->'financiero'->>'precio_sospechoso')::BOOLEAN
    FROM propiedades_v2 p
    WHERE p.es_para_matching = FALSE
      AND p.status = 'completado'
      AND p.tipo_operacion = 'venta'
      AND p.id_proyecto_master IS NULL
      AND NOT EXISTS (
          SELECT 1 FROM propiedades_excluidas_export e
          WHERE e.propiedad_id = p.id
            AND e.estado IN ('pendiente', 'procesado')
      )
    ORDER BY p.score_calidad_dato DESC, p.id;
END;
$function$;
