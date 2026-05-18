-- =============================================================================
-- Migración 245: Fix matching ignora pm.activo = false
-- =============================================================================
--
-- Contexto
-- --------
-- Las funciones generar_matches_por_nombre() y generar_matches_por_url() NO
-- filtraban proyectos_master.activo = true al armar sugerencias. Como ambos
-- métodos producen score >= 85 → matching_completo_automatizado() las auto-
-- aprueba en PASO 6, y aplicar_matches_aprobados() las aplica a propiedades_v2
-- silenciosamente.
--
-- Efecto observado (audit semanal 18-may-2026):
--   - 6 props del Condominio MARE asignadas a pm=4 inactivo (duplicado de pm=65)
--   - 2 props del Klug (#1591 + #1876) asignadas a pm=44 inactivo (duplicado de pm=61)
--   - 18 sugerencias 'aprobado' en cola apuntando a pms inactivos
--
-- Las funciones generar_matches_fuzzy(), generar_matches_gps() y
-- buscar_proyecto_fuzzy() (usada por generar_matches_trigram) YA filtran activo.
-- Solo las 2 culpables requieren fix.
--
-- Idempotente. Revierte aplicando el snapshot del def previo
-- (rescatado con pg_get_functiondef antes del cambio).
-- =============================================================================


-- -----------------------------------------------------------------------------
-- PASO 1 — Fix generar_matches_por_nombre: agregar pm.activo = TRUE en el JOIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_matches_por_nombre()
RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, metodo text)
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
          AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
    )
    SELECT
        pcn.id,
        pm.id_proyecto_master,
        95 as confianza,
        'nombre_exacto'::text as metodo
    FROM propiedades_con_nombre pcn
    JOIN proyectos_master pm
        ON pm.activo = TRUE  -- FIX migración 245: ignorar pms inactivos
        AND (
            LOWER(pcn.nombre_busqueda) = LOWER(TRIM(pm.nombre_oficial))
            OR LOWER(pcn.nombre_busqueda) = ANY(
                SELECT LOWER(TRIM(a)) FROM unnest(pm.alias_conocidos) a
            )
        )
    WHERE pcn.nombre_busqueda IS NOT NULL
      AND LENGTH(pcn.nombre_busqueda) > 3;
END;
$function$;


-- -----------------------------------------------------------------------------
-- PASO 2 — Fix generar_matches_por_url: agregar pm.activo = TRUE en el CROSS JOIN
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generar_matches_por_url()
RETURNS TABLE(matches_insertados integer, matches_duplicados integer, matches_alta_confianza integer, matches_media_confianza integer)
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
          AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
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
        WHERE pm.activo = TRUE  -- FIX migración 245: ignorar pms inactivos
          AND (
            (LENGTH(pm.nombre_oficial) >= 6
             AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)'))
            OR
            (LENGTH(pm.nombre_oficial) >= 4
             AND (s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '%')
                  OR s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '') || '%')))
          )
        ORDER BY s.id,
                 CASE
                     WHEN LENGTH(pm.nombre_oficial) >= 6
                          AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)')
                     THEN 1 ELSE 2
                 END,
                 LENGTH(pm.nombre_oficial) DESC
    ),
    stats AS (
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE confianza = 90) AS alta,
               COUNT(*) FILTER (WHERE confianza = 85) AS media
        FROM matches_encontrados WHERE confianza > 0
    ),
    inserted AS (
        INSERT INTO matching_sugerencias (propiedad_id, proyecto_master_sugerido, metodo_matching, score_confianza, estado)
        SELECT me.propiedad_id, me.id_proyecto_master, 'url_slug_parcial', me.confianza, 'pendiente'
        FROM matches_encontrados me WHERE me.confianza > 0
        ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching) DO NOTHING
        RETURNING *
    )
    SELECT (SELECT COUNT(*) FROM inserted)::INTEGER,
           (SELECT total FROM stats)::INTEGER - (SELECT COUNT(*) FROM inserted)::INTEGER,
           (SELECT alta FROM stats)::INTEGER,
           (SELECT media FROM stats)::INTEGER
    INTO v_inserted, v_duplicated, v_alta, v_media;

    RETURN QUERY SELECT v_inserted, v_duplicated, v_alta, v_media;
END;
$function$;


-- -----------------------------------------------------------------------------
-- PASO 3 — Limpieza de sugerencias históricas apuntando a pms inactivos
-- -----------------------------------------------------------------------------
-- 18 filas (13 props únicas) detectadas previamente. Todas tenían pm_actual
-- correcto (65 o 61) tras las correcciones manuales del audit semanal 18-may.
-- Marcamos como rechazado para que aplicar_matches_aprobados() no las re-aplique.
UPDATE matching_sugerencias ms
SET estado = 'rechazado',
    revisado_por = 'sistema_filtro_pm_inactivo',
    fecha_revision = NOW(),
    notas = COALESCE(ms.notas || ' | ', '') || 'Rechazada: pm.activo=false (limpieza migración 245)'
FROM proyectos_master pm
WHERE ms.proyecto_master_sugerido = pm.id_proyecto_master
  AND pm.activo = false
  AND ms.estado = 'aprobado'
  AND ms.metodo_matching IN ('nombre_exacto','url_slug_parcial');


-- -----------------------------------------------------------------------------
-- PASO 4 — Verificación post-deploy (correr separado, debe retornar 0 filas)
-- -----------------------------------------------------------------------------
-- SELECT pm.id_proyecto_master, pm.nombre_oficial, pm.activo,
--        (SELECT COUNT(*) FROM propiedades_v2 WHERE id_proyecto_master = pm.id_proyecto_master AND status='completado') AS props_vivas
-- FROM proyectos_master pm
-- WHERE pm.activo = false
--   AND EXISTS (SELECT 1 FROM propiedades_v2 WHERE id_proyecto_master = pm.id_proyecto_master);


-- -----------------------------------------------------------------------------
-- ROLLBACK (si se necesita revertir)
-- -----------------------------------------------------------------------------
-- 1. Restaurar generar_matches_por_nombre quitando "pm.activo = TRUE AND" del JOIN
-- 2. Restaurar generar_matches_por_url quitando "pm.activo = TRUE AND" del CROSS JOIN
-- 3. Re-aprobar sugerencias filtradas si fuera necesario:
--    UPDATE matching_sugerencias ms
--    SET estado = 'aprobado',
--        notas = REPLACE(ms.notas, ' | Rechazada: pm.activo=false (limpieza migración 245)', '')
--    WHERE ms.revisado_por = 'sistema_filtro_pm_inactivo';
