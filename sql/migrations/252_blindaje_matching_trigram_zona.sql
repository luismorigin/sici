-- =============================================================================
-- MIGRACION: 252_blindaje_matching_trigram_zona.sql
-- DESCRIPCION: Blindaje 1 extendido - generar_matches_trigram con same-zone matching
-- VERSION: 1.0.0
-- FECHA: 27 Mayo 2026
-- PROYECTO: docs/proyectos/zona-norte/ (extensión Fase 1 - ADR-006)
-- =============================================================================
-- CONTEXTO:
--   El blindaje original (mig 251) solo cubrió generar_matches_por_nombre.
--   El matching nocturno detectado 27-may-2026 generó 15 matches cross-zona
--   (props Zona Norte → proyectos Equipetrol) usando generar_matches_trigram
--   que NO tenía filtro de zona.
--
--   Las funciones generar_matches_fuzzy y generar_matches_gps SÍ tienen blindaje
--   (usan `WHERE x.zona = y.zona` con aliases). generar_matches_por_url_mejorado
--   es legacy (apunta a tabla `propiedades` deprecated) — no se blinda, se debe
--   deprecar como ticket separado.
--
-- FIX: agregar `WHERE psm.zona = pm.zona` al CROSS JOIN LATERAL que busca
-- proyectos similares por trigram.
--
-- DATOS PRE-MIGRACION:
--   - 15 matches cross-zona aplicados (ya revertidos: id_proyecto_master = NULL)
--   - Múltiples sugerencias trigram cross-zona en matching_sugerencias
--
-- ROLLBACK: restaurar versión anterior desde sql/functions/matching/
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.generar_matches_trigram()
RETURNS TABLE(
  propiedad_id integer,
  proyecto_sugerido integer,
  confianza integer,
  metodo text,
  nombre_extraido text,
  score_trigram numeric
)
LANGUAGE plpgsql
STABLE
AS $function$
  BEGIN
      RETURN QUERY
      WITH propiedades_sin_match AS (
          SELECT
              p.id,
              COALESCE(
                  NULLIF(TRIM(p.nombre_edificio), ''),
                  NULLIF(TRIM(p.datos_json->'proyecto'->>'nombre_edificio'), ''),
                  extraer_nombre_de_descripcion(p.datos_json->'contenido'->>'descripcion')
              ) as nombre_para_buscar,
              p.zona
          FROM propiedades_v2 p
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = true
            AND p.tipo_operacion = 'venta'
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
            AND (p.campos_bloqueados IS NULL
                 OR NOT (p.campos_bloqueados ? 'id_proyecto_master'))
      ),
      matches_encontrados AS (
          SELECT DISTINCT ON (psm.id)
              psm.id as prop_id,
              psm.nombre_para_buscar,
              bpf.id_proyecto,
              bpf.nombre as nombre_proyecto,
              bpf.score,
              bpf.match_tipo
          FROM propiedades_sin_match psm
          CROSS JOIN LATERAL buscar_proyecto_fuzzy(psm.nombre_para_buscar, 0.4, 3) bpf
          JOIN proyectos_master pm ON pm.id_proyecto_master = bpf.id_proyecto
          WHERE psm.nombre_para_buscar IS NOT NULL
            AND LENGTH(psm.nombre_para_buscar) >= 3
            AND psm.zona IS NOT NULL          -- defensivo
            AND psm.zona = pm.zona             -- BLINDAJE: solo same-zone matching
          ORDER BY psm.id, bpf.score DESC
      )
      SELECT
          me.prop_id,
          me.id_proyecto,
          CASE
              WHEN me.score >= 0.95 THEN 95
              WHEN me.score >= 0.8 THEN 90
              WHEN me.score >= 0.6 THEN 80
              WHEN me.score >= 0.5 THEN 70
              ELSE 60
          END::INTEGER as confianza,
          'trigram_' || me.match_tipo,
          me.nombre_para_buscar,
          me.score
      FROM matches_encontrados me
      WHERE me.score >= 0.4;
  END;
$function$;

COMMENT ON FUNCTION generar_matches_trigram() IS
'v1.1: Match fuzzy por trigram (similitud lexical).
BLINDAJE: only same-zone matching (psm.zona = pm.zona).
Bonus: arregla bug latente para todas las zonas — evita cross-zona en futuros matches.';

-- ============================================================================
-- LIMPIEZA OPCIONAL: marcar sugerencias trigram cross-zona pendientes como obsoletas
-- ============================================================================
-- NO se borran porque hay 219 sugerencias cross-zona ya gestionadas por HITL
-- (aprobadas, rechazadas, validadas humanamente). Su historia es valiosa.
-- Solo se marcan las 'pendiente' que el blindaje hubiera evitado.
-- Comentado por seguridad — descomentar solo si se decide explícitamente.
--
-- UPDATE matching_sugerencias ms
-- SET estado = 'obsoleto_blindaje_zona',
--     notas = COALESCE(notas, '') || ' [auto: blindaje zona aplicado 27-may-2026]'
-- FROM propiedades_v2 p, proyectos_master pm
-- WHERE ms.propiedad_id = p.id
--   AND ms.proyecto_master_sugerido = pm.id_proyecto_master
--   AND ms.estado = 'pendiente'
--   AND p.zona IS NOT NULL
--   AND pm.zona IS NOT NULL
--   AND p.zona != pm.zona;

COMMIT;

-- =============================================================================
-- VALIDACION POST-MIGRACION
-- =============================================================================
-- 1. Confirmar blindaje
--    SELECT pg_get_functiondef('public.generar_matches_trigram'::regproc);
--    -- debe contener "psm.zona = pm.zona"
--
-- 2. Sugerencias cross-zona deben ser 0 después de la limpieza:
--    SELECT COUNT(*)
--    FROM matching_sugerencias ms
--    JOIN propiedades_v2 p ON ms.propiedad_id = p.id
--    JOIN proyectos_master pm ON ms.proyecto_master_sugerido = pm.id_proyecto_master
--    WHERE p.zona != pm.zona AND p.zona IS NOT NULL AND pm.zona IS NOT NULL;
--    -- esperado: 0

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Restaurar versión anterior desde sql/functions/matching/generar_matches_trigram.sql
-- (las sugerencias cross-zona borradas no se pueden recuperar sin re-correr matching).
