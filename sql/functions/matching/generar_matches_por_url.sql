-- =============================================================================
-- FUNCION: generar_matches_por_url()
-- DESCRIPCION: Matching por busqueda inversa en URL slug (Century21)
-- CONFIANZA: 85-90%
-- VERSION: 3.0
-- AUTOR: Luis - SICI
-- FECHA: Diciembre 2025
-- =============================================================================
-- CAMBIOS v3.0 (28 Dic 2025):
--   - Migracion a propiedades_v2
--   - Filtro por status (completado, actualizado)
--   - Filtro es_para_matching = true
--   - Mantiene campos_bloqueados para respetar candados
-- =============================================================================
-- PREREQUISITOS:
--   - FK de matching_sugerencias debe apuntar a propiedades_v2
--   - Ejecutar 003_matching_sugerencias_fk_v2.sql primero
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generar_matches_por_url()
RETURNS TABLE(
    matches_insertados integer,
    matches_duplicados integer,
    matches_alta_confianza integer,
    matches_media_confianza integer
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_inserted INTEGER := 0;
    v_duplicated INTEGER := 0;
    v_alta INTEGER := 0;
    v_media INTEGER := 0;
BEGIN
    WITH slugs_extraidos AS (
        SELECT
            p.id,
            (regexp_match(p.url, 'propiedad/\d+_([a-z0-9-]+)', 'i'))[1] as slug
        FROM propiedades_v2 p
        WHERE p.fuente = 'century21'
          AND p.id_proyecto_master IS NULL
          AND p.url IS NOT NULL
          AND p.status IN ('completado', 'actualizado')
          AND p.es_para_matching = true
          AND (p.campos_bloqueados IS NULL
               OR NOT (p.campos_bloqueados::jsonb ? 'id_proyecto_master'))
    ),
    matches_encontrados AS (
        SELECT DISTINCT ON (s.id)
            s.id as propiedad_id,
            pm.id_proyecto_master,
            pm.nombre_oficial,
            CASE
                WHEN LENGTH(pm.nombre_oficial) >= 6
                     AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)')
                THEN 90
                WHEN LENGTH(pm.nombre_oficial) >= 4
                     AND (s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '%')
                          OR s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '') || '%'))
                THEN 85
                ELSE 0
            END as confianza
        FROM slugs_extraidos s
        CROSS JOIN proyectos_master pm
        WHERE
            (LENGTH(pm.nombre_oficial) >= 6
             AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)'))
            OR
            (LENGTH(pm.nombre_oficial) >= 4
             AND (s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '%')
                  OR s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '') || '%')))
        ORDER BY s.id,
                 CASE
                     WHEN LENGTH(pm.nombre_oficial) >= 6
                          AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)')
                     THEN 1 ELSE 2
                 END,
                 LENGTH(pm.nombre_oficial) DESC
    ),
    stats AS (
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE confianza = 90) as alta,
            COUNT(*) FILTER (WHERE confianza = 85) as media
        FROM matches_encontrados
        WHERE confianza > 0
    ),
    inserted AS (
        INSERT INTO matching_sugerencias (
            propiedad_id,
            proyecto_master_sugerido,
            metodo_matching,
            score_confianza,
            estado
        )
        SELECT
            propiedad_id,
            id_proyecto_master,
            'url_slug_parcial',
            confianza,
            'pendiente'
        FROM matches_encontrados
        WHERE confianza > 0
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
        DO NOTHING
        RETURNING *
    )
    SELECT
        (SELECT COUNT(*) FROM inserted)::INTEGER as inserted_count,
        (SELECT total FROM stats)::INTEGER - (SELECT COUNT(*) FROM inserted)::INTEGER as duplicated_count,
        (SELECT alta FROM stats)::INTEGER as alta_count,
        (SELECT media FROM stats)::INTEGER as media_count
    INTO v_inserted, v_duplicated, v_alta, v_media;

    RETURN QUERY SELECT v_inserted, v_duplicated, v_alta, v_media;
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION generar_matches_por_url() IS
'v3.0: Genera sugerencias mediante busqueda inversa del nombre del proyecto dentro del URL slug.
- Fuente: Solo Century21 (URL tiene slug con nombre proyecto)
- Tabla: propiedades_v2
- Confianza: 90% (match exacto en slug) / 85% (match parcial)
- Inserta en: matching_sugerencias';

-- =============================================================================
-- EJEMPLO DE USO
-- =============================================================================
-- SELECT * FROM generar_matches_por_url();
-- =============================================================================
