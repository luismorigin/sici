-- ============================================================
-- Migración 218: Penalizar GPS matching en zonas densas
-- ============================================================
-- Problema: generar_matches_gps() asigna score 85 (auto-aprobable) a
-- props dentro de 50m de un proyecto, pero en Equipetrol hay 279 pares
-- de proyectos a <100m. Resultado: 33% falsos positivos en GPS auto-aprobado.
--
-- Fix: si hay >1 proyecto activo a <100m del proyecto candidato,
-- bajar score a max 70 (→ pendiente HITL, no auto-aprobado).

CREATE OR REPLACE FUNCTION public.generar_matches_gps()
 RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, distancia_metros numeric, metodo text)
 LANGUAGE plpgsql
AS $function$
  BEGIN
      RETURN QUERY
      WITH
      gps_confiables AS (
          SELECT latitud, longitud
          FROM propiedades_v2
          WHERE latitud IS NOT NULL
            AND longitud IS NOT NULL
            AND latitud::text NOT LIKE '0.0%'
            AND longitud::text NOT LIKE '0.0%'
          GROUP BY latitud, longitud
          HAVING COUNT(*) <= 3
      ),
      distancias AS (
          SELECT
              p.id as prop_id,
              pm.id_proyecto_master as proy_id,
              pm.nombre_oficial as nombre_proyecto,
              (6371000 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                      cos(radians(p.latitud::numeric)) *
                      cos(radians(pm.latitud::numeric)) *
                      cos(radians(pm.longitud::numeric) - radians(p.longitud::numeric)) +
                      sin(radians(p.latitud::numeric)) *
                      sin(radians(pm.latitud::numeric))
                  ))
              ))::numeric as distancia
          FROM propiedades_v2 p
          JOIN gps_confiables gc
              ON p.latitud = gc.latitud
              AND p.longitud = gc.longitud
          JOIN proyectos_master pm
              ON pm.activo = TRUE
              AND pm.gps_verificado_google = TRUE
              AND p.zona = pm.zona
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = TRUE
            AND p.zona IS NOT NULL
      ),
      matches_cercanos AS (
          SELECT DISTINCT ON (prop_id)
              prop_id,
              proy_id,
              nombre_proyecto,
              distancia,
              CASE
                  WHEN distancia < 50 THEN 85
                  WHEN distancia < 100 THEN 80
                  WHEN distancia < 150 THEN 75
                  WHEN distancia < 200 THEN 70
                  WHEN distancia < 250 THEN 65
                  ELSE 60
              END as score
          FROM distancias
          WHERE distancia < 250
          ORDER BY prop_id, distancia ASC
      ),
      -- Contar proyectos vecinos a <100m del proyecto candidato
      vecinos AS (
          SELECT
              mc.proy_id,
              COUNT(*) as proyectos_cercanos
          FROM matches_cercanos mc
          JOIN proyectos_master pm_base ON pm_base.id_proyecto_master = mc.proy_id
          JOIN proyectos_master pm_vecino
              ON pm_vecino.activo = TRUE
              AND pm_vecino.id_proyecto_master != mc.proy_id
              AND pm_vecino.zona = pm_base.zona
              AND (6371000 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                      cos(radians(pm_base.latitud::numeric)) *
                      cos(radians(pm_vecino.latitud::numeric)) *
                      cos(radians(pm_vecino.longitud::numeric) - radians(pm_base.longitud::numeric)) +
                      sin(radians(pm_base.latitud::numeric)) *
                      sin(radians(pm_vecino.latitud::numeric))
                  ))
              ))::numeric < 100
          GROUP BY mc.proy_id
      )
      SELECT
          mc.prop_id,
          mc.proy_id,
          -- Si hay vecinos a <100m, cap score a 70 (pendiente HITL)
          CASE
              WHEN COALESCE(v.proyectos_cercanos, 0) > 0 THEN LEAST(mc.score, 70)
              ELSE mc.score
          END,
          ROUND(mc.distancia, 1),
          'gps_verificado'::TEXT
      FROM matches_cercanos mc
      LEFT JOIN vecinos v ON v.proy_id = mc.proy_id
      WHERE NOT EXISTS (
          SELECT 1 FROM matching_sugerencias ms
          WHERE ms.propiedad_id = mc.prop_id
            AND ms.proyecto_master_sugerido = mc.proy_id
      );
  END;
  $function$;
