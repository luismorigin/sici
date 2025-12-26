-- =============================================================================
-- FUNCION: generar_matches_por_nombre()
-- DESCRIPCION: Genera sugerencias por coincidencia exacta de nombre
-- CONFIANZA: 95%
-- VERSION: 3.0
-- AUTOR: Luis - SICI
-- FECHA: Diciembre 2025
-- =============================================================================
-- CAMBIOS v3.0 (26 Dic 2025):
--   - Migracion a propiedades_v2
--   - Fallback multi-fuente: columna > JSON enrichment > JSON merge
--   - Busqueda en alias_conocidos de proyectos_master
--   - Filtro por status (completado, actualizado)
--   - Min longitud reducida a 3 chars (edificios con nombres cortos)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generar_matches_por_nombre()
RETURNS TABLE(
    propiedad_id integer,
    proyecto_sugerido integer,
    confianza integer,
    metodo text
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH propiedades_con_nombre AS (
        SELECT
            p.id,
            COALESCE(
                NULLIF(TRIM(p.nombre_edificio), ''),
                TRIM(p.datos_json_enrichment->>'nombre_edificio'),
                TRIM(p.datos_json->'proyecto'->>'nombre_edificio')
            ) as nombre_busqueda
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master IS NULL
          AND p.status IN ('completado', 'actualizado')
    )
    SELECT
        pcn.id,
        pm.id_proyecto_master,
        95 as confianza,
        'nombre_exacto'::text as metodo
    FROM propiedades_con_nombre pcn
    JOIN proyectos_master pm
        ON LOWER(pcn.nombre_busqueda) = LOWER(TRIM(pm.nombre_oficial))
        OR LOWER(pcn.nombre_busqueda) = ANY(
            SELECT LOWER(TRIM(a)) FROM unnest(pm.alias_conocidos) a
        )
    WHERE pcn.nombre_busqueda IS NOT NULL
      AND LENGTH(pcn.nombre_busqueda) > 3;
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION generar_matches_por_nombre() IS
'v3.0: Genera sugerencias de matching por coincidencia exacta de nombre.
- Fuente: columna nombre_edificio > JSON enrichment > JSON merge
- Match contra: nombre_oficial + alias_conocidos
- Tabla: propiedades_v2
- Confianza: 95%';

-- =============================================================================
-- EJEMPLO DE USO
-- =============================================================================
-- SELECT * FROM generar_matches_por_nombre();
-- =============================================================================
