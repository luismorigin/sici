-- =============================================================================
-- FUNCION: generar_matches_fuzzy()
-- DESCRIPCION: Matching fuzzy mediante word intersection
-- CONFIANZA: 75-90%
-- VERSION: 3.0
-- AUTOR: Luis - SICI
-- FECHA: Diciembre 2025
-- =============================================================================
-- CAMBIOS v3.0 (28 Dic 2025):
--   - Migracion a propiedades_v2
--   - Fallback multi-fuente: columna > JSON enrichment > JSON merge
--   - Filtro por status (completado, actualizado)
--   - Filtro es_para_matching = true
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generar_matches_fuzzy()
RETURNS TABLE(
    propiedad_id integer,
    proyecto_sugerido integer,
    confianza integer,
    metodo text,
    similitud_porcentaje integer,
    uso_gps_desempate boolean
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
            ) as nombre_busqueda,
            p.latitud,
            p.longitud,
            p.zona
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master IS NULL
          AND p.status IN ('completado', 'actualizado')
          AND p.es_para_matching = true
          AND (p.campos_bloqueados IS NULL
               OR NOT (p.campos_bloqueados::jsonb ? 'id_proyecto_master'))
    ),
    palabras_propiedades AS (
        SELECT
            pcn.id as prop_id,
            pcn.nombre_busqueda,
            pcn.latitud,
            pcn.longitud,
            pcn.zona,
            array_agg(DISTINCT word) FILTER (WHERE LENGTH(word) >= 4) as palabras
        FROM propiedades_con_nombre pcn,
        LATERAL regexp_split_to_table(LOWER(pcn.nombre_busqueda), '\s+') as word
        WHERE pcn.nombre_busqueda IS NOT NULL
          AND LENGTH(pcn.nombre_busqueda) > 5
        GROUP BY pcn.id, pcn.nombre_busqueda, pcn.latitud, pcn.longitud, pcn.zona
    ),
    palabras_proyectos AS (
        SELECT
            pm.id_proyecto_master as proy_id,
            pm.nombre_oficial,
            pm.latitud,
            pm.longitud,
            pm.zona,
            array_agg(DISTINCT word) FILTER (WHERE LENGTH(word) >= 4) as palabras
        FROM proyectos_master pm,
        LATERAL regexp_split_to_table(LOWER(pm.nombre_oficial), '\s+') as word
        WHERE pm.activo = TRUE
        GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.latitud, pm.longitud, pm.zona
    ),
    similitudes AS (
        SELECT
            pp.prop_id,
            ppm.proy_id,
            (SELECT COUNT(*) FROM unnest(pp.palabras) palabra
             WHERE palabra = ANY(ppm.palabras)) as palabras_comunes,
            array_length(ppm.palabras, 1) as total_palabras_proyecto,
            CASE
                WHEN array_length(ppm.palabras, 1) > 0 THEN
                    ROUND(100.0 * (
                        SELECT COUNT(*) FROM unnest(pp.palabras) palabra
                        WHERE palabra = ANY(ppm.palabras)
                    ) / array_length(ppm.palabras, 1))
                ELSE 0
            END as similitud,
            (6371000 * acos(
                cos(radians(pp.latitud::numeric)) *
                cos(radians(ppm.latitud::numeric)) *
                cos(radians(ppm.longitud::numeric) - radians(pp.longitud::numeric)) +
                sin(radians(pp.latitud::numeric)) *
                sin(radians(ppm.latitud::numeric))
            ))::int as distancia_gps
        FROM palabras_propiedades pp
        CROSS JOIN palabras_proyectos ppm
        WHERE pp.zona = ppm.zona
          AND EXISTS (
              SELECT 1 FROM unnest(pp.palabras) palabra
              WHERE palabra = ANY(ppm.palabras)
          )
    ),
    ranked_matches AS (
        SELECT
            prop_id,
            proy_id,
            similitud,
            distancia_gps,
            palabras_comunes,
            total_palabras_proyecto,
            ROW_NUMBER() OVER (PARTITION BY prop_id ORDER BY similitud DESC, distancia_gps ASC) as rank,
            COUNT(*) OVER (PARTITION BY prop_id) as total_matches
        FROM similitudes
        WHERE similitud >= 70
    )
    SELECT
        rm.prop_id,
        rm.proy_id,
        CASE
            WHEN rm.similitud = 100 AND rm.total_palabras_proyecto >= 2 THEN 90
            WHEN rm.similitud >= 90 THEN 85
            WHEN rm.similitud >= 80 THEN 80
            ELSE 75
        END as confianza,
        'fuzzy_nombre'::TEXT,
        rm.similitud::INT,
        (rm.total_matches > 1) as uso_gps_desempate
    FROM ranked_matches rm
    WHERE rm.rank = 1;
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION generar_matches_fuzzy() IS
'v3.0: Genera sugerencias mediante word intersection (palabras >= 4 letras).
- Fuente nombre: columna > JSON enrichment > JSON merge
- Usa GPS para desempatar multiples matches
- Tabla: propiedades_v2
- Umbral minimo: 70% similitud
- Confianza: 75-90%';

-- =============================================================================
-- EJEMPLO DE USO
-- =============================================================================
-- SELECT * FROM generar_matches_fuzzy();
-- =============================================================================
