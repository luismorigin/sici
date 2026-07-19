-- =============================================================================
-- Migración 270 — FIX buscar_proyecto_fuzzy: el LIMIT truncaba por ID, no por score
-- =============================================================================
-- BUG: la función terminaba con
--     SELECT DISTINCT ON (c.id_proyecto_master) ...
--     FROM candidatos c
--     ORDER BY c.id_proyecto_master, c.score DESC, c.match_tipo
--     LIMIT p_limite;
--   El `DISTINCT ON` obliga a `ORDER BY id_proyecto_master` PRIMERO (para deduplicar por pm),
--   pero eso deja el RESULTADO ordenado por id ascendente → el `LIMIT p_limite` (default 5)
--   devuelve los 5 pms de MENOR id, NO los de mayor score. Cuando ≥5 candidatos de id bajo
--   matchean por trigram (ej cualquier búsqueda con "...equipetrol" pega en decenas), el match
--   correcto de id alto (pms recién creados) queda AFUERA — aunque tenga score 1.0 (alias_exacto).
--
-- SÍNTOMA (deptos-equipetrol): `buscar_proyecto_fuzzy('Magnum Residencias Equipetrol')` NO devolvía
--   pm 499 (score 1.0) porque había 10 pms de id menor con similarity ≥ 0.3. Idem Eurodesign Suites
--   (337), Condado VI (34), El Conquistador (345). "Magnum" corto SÍ funcionaba (pocos candidatos).
--
-- IMPACTO: NO es solo el híbrido. `generar_matches_trigram()` e `intentar_match_con_fuzzy()`
--   (pipeline de matching de PRODUCCIÓN) llaman a esta función → el bug venía tirando matches de
--   edificios de id alto en prod también. Este fix mejora prod Y shadow.
--
-- FIX: envolver el `DISTINCT ON` (dedup por pm, necesita ORDER BY id) en una subquery, y ordenar
--   el resultado EXTERNO por `score DESC` antes del `LIMIT`. Así el LIMIT corta por relevancia.
--   Único cambio: la query final. Ramas alias_exacto / nombre_normalizado / fuzzy_trigram intactas.
--
-- ⚠️ Aplicar vía Supabase UI o psql (MCP es readonly). Registrar en MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.buscar_proyecto_fuzzy(p_nombre text, p_umbral_minimo numeric DEFAULT 0.3, p_limite integer DEFAULT 5)
 RETURNS TABLE(id_proyecto integer, nombre text, desarrollador text, zona text, score numeric, match_tipo text)
 LANGUAGE plpgsql
 STABLE
AS $function$
  DECLARE
      v_nombre_normalizado TEXT;
  BEGIN
      v_nombre_normalizado := normalize_nombre(p_nombre);

      RETURN QUERY
      WITH candidatos AS (
          SELECT DISTINCT
              pm.id_proyecto_master,
              pm.nombre_oficial,
              pm.desarrollador,
              pm.zona,
              1.0::NUMERIC as score,
              'alias_exacto'::TEXT as match_tipo
          FROM proyectos_master pm
          WHERE pm.activo = true
            AND pm.alias_conocidos IS NOT NULL
            AND (
                p_nombre = ANY(pm.alias_conocidos)
                OR lower(p_nombre) = ANY(
                    SELECT lower(unnest(pm.alias_conocidos))
                )
            )

          UNION ALL

          SELECT DISTINCT
              pm.id_proyecto_master,
              pm.nombre_oficial,
              pm.desarrollador,
              pm.zona,
              0.95::NUMERIC as score,
              'nombre_normalizado'::TEXT as match_tipo
          FROM proyectos_master pm
          WHERE pm.activo = true
            AND normalize_nombre(pm.nombre_oficial) = v_nombre_normalizado
            AND v_nombre_normalizado IS NOT NULL
            AND v_nombre_normalizado != ''

          UNION ALL

          SELECT
              pm.id_proyecto_master,
              pm.nombre_oficial,
              pm.desarrollador,
              pm.zona,
              ROUND(similarity(
                  normalize_nombre(pm.nombre_oficial),
                  v_nombre_normalizado
              )::NUMERIC, 3) as score,
              'fuzzy_trigram'::TEXT as match_tipo
          FROM proyectos_master pm
          WHERE pm.activo = true
            AND v_nombre_normalizado IS NOT NULL
            AND v_nombre_normalizado != ''
            AND similarity(
                normalize_nombre(pm.nombre_oficial),
                v_nombre_normalizado
            ) >= p_umbral_minimo
      ),
      -- dedup por pm (el mejor score de cada uno) — requiere ORDER BY id para DISTINCT ON
      deduplicados AS (
          SELECT DISTINCT ON (c.id_proyecto_master)
              c.id_proyecto_master,
              c.nombre_oficial,
              c.desarrollador,
              c.zona,
              c.score,
              c.match_tipo
          FROM candidatos c
          ORDER BY c.id_proyecto_master, c.score DESC, c.match_tipo
      )
      -- FIX: ordenar el resultado por SCORE (no por id) antes del LIMIT
      SELECT d.id_proyecto_master, d.nombre_oficial, d.desarrollador, d.zona, d.score, d.match_tipo
      FROM deduplicados d
      ORDER BY d.score DESC, d.match_tipo
      LIMIT p_limite;
  END;
$function$;

COMMIT;

-- =============================================================================
-- Verificación post-apply (debe devolver pm 499 @ 1.0 alias_exacto en la 1ª fila):
--   SELECT * FROM buscar_proyecto_fuzzy('Magnum Residencias Equipetrol');
-- =============================================================================
