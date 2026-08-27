-- =============================================================================
-- 343 · El desempate del fuzzy: el NOMBRE OFICIAL le gana al ALIAS
-- =============================================================================
-- Fecha: 2026-08-27  ·  Corrige una regresión introducida por la mig 342.
--
-- QUÉ PASÓ
-- --------
-- La 342 agregó la rama `fuzzy_alias` (similitud contra los alias normalizados).
-- Fue un acierto en 57 nombres, pero introdujo un problema en los EMPATES:
--
--   ORDER BY d.score DESC, d.match_tipo      ← el desempate es ALFABÉTICO
--
-- y alfabéticamente `fuzzy_alias` < `fuzzy_trigram`. O sea: ante dos candidatos con
-- el mismo score, **un alias le ganaba al nombre oficial exacto**.
--
-- EL CASO
-- -------
--   Aviso: "Torre Baruc Norte"
--     · pm 409 SE LLAMA "Torre Baruc Norte"      → fuzzy_trigram  1.000
--     · pm 500 "Edificio Baruc Norte" tiene el
--       alias "Baruc Norte", que normaliza igual → fuzzy_alias    1.000
--   Empate 1.000 → ganaba el pm 500 por orden alfabético del match_tipo.
--   El edificio que LLEVA ESE NOMBRE quedaba segundo.
--
-- EL FIX
-- ------
-- Desempate por PRIORIDAD DE EVIDENCIA explícita, de más fuerte a más débil:
--   1. `nombre_normalizado` → el nombre oficial coincide exacto (normalizado)
--   2. `alias_exacto`       → un alias coincide exacto (texto crudo)
--   3. `fuzzy_trigram`      → similitud contra el NOMBRE OFICIAL
--   4. `fuzzy_alias`        → similitud contra un ALIAS  ← el más débil
--
-- 🔑 El criterio: un alias es una grafía observada de un nombre, el nombre oficial
-- es el nombre. Cuando los dos "explican" igual de bien el texto del aviso, el que
-- manda es el edificio que efectivamente se llama así. La rama nueva sirve para
-- RESCATAR lo que el oficial no alcanza, no para desplazarlo cuando alcanza.
--
-- Nótese que el orden de prioridad NO cambia quién gana por score: `alias_exacto`
-- (1.0) le sigue ganando a `nombre_normalizado` (0.95), como antes. La prioridad
-- solo rompe empates de score.
--
-- ⚠️ LO QUE ESTA MIGRACIÓN **NO** ARREGLA (es preexistente y más profundo)
-- ------------------------------------------------------------------------
-- `normalize_nombre()` BORRA los numerales, incluidos los romanos:
--     normalize_nombre('Condominio Barcelona III') = 'barcelona'
--     normalize_nombre('Condominio Barcelona')     = 'barcelona'   → similitud 1.000
-- Por eso el fuzzy no distingue "Barcelona III" de "Barcelona", ni "Baruc V" de
-- "Baruc IV", ni "Condado 2" de "Condado 6". Es la razón por la que los clusters
-- numerados SIEMPRE van al juez y nunca se auto-aprueban (regla 1 de
-- /audit-cola-shadow, memoria project_matching_zn_aprobacion_16jun2026).
-- Esto ya era así antes de la 342 y NO se toca acá: cambiar `normalize_nombre`
-- movería el matching entero y necesita su propia medición.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.buscar_proyecto_fuzzy(
  p_nombre text,
  p_umbral_minimo numeric DEFAULT 0.3,
  p_limite integer DEFAULT 5
)
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
              pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona,
              1.0::NUMERIC as score, 'alias_exacto'::TEXT as match_tipo
          FROM proyectos_master pm
          WHERE pm.activo = true
            AND pm.alias_conocidos IS NOT NULL
            AND (
                p_nombre = ANY(pm.alias_conocidos)
                OR lower(p_nombre) = ANY(SELECT lower(unnest(pm.alias_conocidos)))
            )

          UNION ALL

          SELECT DISTINCT
              pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona,
              0.95::NUMERIC as score, 'nombre_normalizado'::TEXT as match_tipo
          FROM proyectos_master pm
          WHERE pm.activo = true
            AND normalize_nombre(pm.nombre_oficial) = v_nombre_normalizado
            AND v_nombre_normalizado IS NOT NULL
            AND v_nombre_normalizado != ''

          UNION ALL

          SELECT
              pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona,
              ROUND(similarity(normalize_nombre(pm.nombre_oficial), v_nombre_normalizado)::NUMERIC, 3) as score,
              'fuzzy_trigram'::TEXT as match_tipo
          FROM proyectos_master pm
          WHERE pm.activo = true
            AND v_nombre_normalizado IS NOT NULL
            AND v_nombre_normalizado != ''
            AND similarity(normalize_nombre(pm.nombre_oficial), v_nombre_normalizado) >= p_umbral_minimo

          UNION ALL

          -- rama fuzzy sobre ALIAS (mig 342): rescata lo que el nombre oficial no alcanza
          SELECT
              pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona,
              ROUND(MAX(similarity(normalize_nombre(a), v_nombre_normalizado))::NUMERIC, 3) as score,
              'fuzzy_alias'::TEXT as match_tipo
          FROM proyectos_master pm
          CROSS JOIN LATERAL unnest(pm.alias_conocidos) AS a
          WHERE pm.activo = true
            AND pm.alias_conocidos IS NOT NULL
            AND v_nombre_normalizado IS NOT NULL
            AND v_nombre_normalizado != ''
          GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona
          HAVING MAX(similarity(normalize_nombre(a), v_nombre_normalizado)) >= p_umbral_minimo
      ),
      -- 🆕 mig 343: prioridad EXPLÍCITA de evidencia para romper empates de score.
      -- Antes el desempate era alfabético y un alias le ganaba al nombre oficial.
      con_prioridad AS (
          SELECT c.*,
                 CASE c.match_tipo
                   WHEN 'nombre_normalizado' THEN 1   -- el nombre oficial coincide exacto
                   WHEN 'alias_exacto'       THEN 2   -- un alias coincide exacto (crudo)
                   WHEN 'fuzzy_trigram'      THEN 3   -- similitud contra el nombre oficial
                   WHEN 'fuzzy_alias'        THEN 4   -- similitud contra un alias (el más débil)
                   ELSE 9
                 END AS prioridad
          FROM candidatos c
      ),
      deduplicados AS (
          SELECT DISTINCT ON (p.id_proyecto_master)
              p.id_proyecto_master, p.nombre_oficial, p.desarrollador, p.zona,
              p.score, p.match_tipo, p.prioridad
          FROM con_prioridad p
          ORDER BY p.id_proyecto_master, p.score DESC, p.prioridad
      )
      SELECT d.id_proyecto_master, d.nombre_oficial, d.desarrollador, d.zona, d.score, d.match_tipo
      FROM deduplicados d
      ORDER BY d.score DESC, d.prioridad, d.id_proyecto_master
      LIMIT p_limite;
  END;
$function$;

COMMENT ON FUNCTION public.buscar_proyecto_fuzzy(text, numeric, integer) IS
  'Candidatos de matching por nombre. mig 342: la similitud también se mide contra los alias '
  'normalizados (rama fuzzy_alias). mig 343: ante empate de score gana la evidencia más fuerte '
  '— nombre oficial exacto > alias exacto > fuzzy sobre oficial > fuzzy sobre alias; antes el '
  'desempate era alfabético y un alias le ganaba al edificio que LLEVA ese nombre (caso '
  '"Torre Baruc Norte", 27-ago-2026). NOTA: normalize_nombre() borra los numerales, así que el '
  'fuzzy NO distingue "Barcelona III" de "Barcelona" — los clusters numerados van SIEMPRE al juez.';

-- =============================================================================
-- VERIFICACIÓN — correr DESPUÉS de aplicar
-- =============================================================================
-- 1) El caso de la regresión: debe ganar el pm 409, que SE LLAMA así.
--    SELECT * FROM buscar_proyecto_fuzzy('Torre Baruc Norte', 0.3, 3);
--    Esperado: fila 1 = id 409 "Torre Baruc Norte" (fuzzy_trigram, 1.000)
--              fila 2 = id 500 (fuzzy_alias, 1.000)
--
-- 2) El rescate de la 342 NO se pierde (el pm 36 no tiene competencia en 1.000):
--    SELECT * FROM buscar_proyecto_fuzzy('Nano by Smart Studio', 0.3, 3);
--    Esperado: fila 1 = id 36 "Nano Smart", 1.000, fuzzy_alias
--
-- 3) Controles de no-regresión:
--    SELECT * FROM buscar_proyecto_fuzzy('Onix Art', 0.3, 3);      -- 45
--    SELECT * FROM buscar_proyecto_fuzzy('Sky Tower', 0.3, 3);     -- 48
--    SELECT * FROM buscar_proyecto_fuzzy('Rise', 0.3, 3);          -- 384
--
-- 4) Los clusters numerados SIGUEN sin resolverse por fuzzy, y está bien:
--    SELECT * FROM buscar_proyecto_fuzzy('Condado 2', 0.3, 4);
--    Esperado: varios empatados en 0.700 → el matcher no debe auto-aprobar; va al juez.
-- =============================================================================
-- ROLLBACK: re-aplicar 342_fuzzy_pondera_alias.sql (queda el desempate alfabético).
-- =============================================================================
