-- =====================================================================
-- PATCH BISTURÍ: romper el loop "agujero negro" en generar_matches_fuzzy
-- Fecha: 2026-06-09  |  Estado: NO APLICADO — revisar antes de ejecutar
--
-- QUÉ CAMBIA: una sola cosa — el orden del COALESCE que arma 'nombre_busqueda'.
-- Antes: la COLUMNA p.nombre_edificio iba PRIMERO. El matching la pisa con el
-- nombre del pm (mig 187), así que si una prop se desmatchea conservando ese
-- nombre pisado, el fuzzy la re-captura al mismo pm (100% similitud consigo
-- mismo) = agujero negro (caso K1). Reincide tras cada limpieza de matches.
-- Ahora: se priorizan las fuentes que el matching NO toca (llm_output >
-- enrichment > merge) y la columna queda como ÚLTIMO recurso.
--
-- SEGURIDAD (medido 2026-06-09):
--   * generar_matches_fuzzy SOLO procesa props SIN match (id_proyecto_master
--     IS NULL + es_para_matching). NO toca nada ya matcheado → Equipetrol
--     producción intacto.
--   * Props sin match que cambian de 'nombre_busqueda' con el patch: 0 (ZN) + 0 (EQ).
--   * Peor caso: una prop sin match sigue sin match (neutro). Nunca rompe un match.
--   * Es puramente preventivo: corta el loop si vuelve a aparecer columna pisada.
--
-- BACKUP de la versión vigente: guardada vía pg_get_functiondef antes de aplicar
-- (regla 7 CLAUDE.md). Rollback = re-aplicar la versión anterior.
-- Verificación post: correr el pipeline de matching la noche siguiente y revisar
-- workflow_executions (matching_nocturno = success) + que no aparezcan matches
-- cross-GPS nuevos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.generar_matches_fuzzy()
 RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, metodo text, similitud_porcentaje integer, uso_gps_desempate boolean)
 LANGUAGE plpgsql
AS $function$
  BEGIN
      RETURN QUERY
      WITH propiedades_con_nombre AS (
          SELECT
              p.id,
              -- PATCH antiloop: fuentes inmutables (que el matching NO pisa) primero;
              -- la columna p.nombre_edificio queda de último recurso.
              COALESCE(
                  NULLIF(TRIM(p.datos_json_enrichment->'llm_output'->>'nombre_edificio'), ''),
                  NULLIF(TRIM(p.datos_json_enrichment->>'nombre_edificio'), ''),
                  NULLIF(TRIM(p.datos_json->'proyecto'->>'nombre_edificio'), ''),
                  NULLIF(TRIM(p.nombre_edificio), '')
              ) as nombre_busqueda,
              p.latitud,
              p.longitud,
              p.zona
          FROM propiedades_v2 p
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = true
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
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
              s.prop_id,
              s.proy_id,
              s.similitud,
              s.distancia_gps,
              s.palabras_comunes,
              s.total_palabras_proyecto,
              ROW_NUMBER() OVER (PARTITION BY s.prop_id ORDER BY s.similitud DESC, s.distancia_gps ASC) as rank,
              COUNT(*) OVER (PARTITION BY s.prop_id) as total_matches
          FROM similitudes s
          WHERE s.similitud >= 70
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
