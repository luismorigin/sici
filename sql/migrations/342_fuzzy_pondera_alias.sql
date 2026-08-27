-- =============================================================================
-- 342 · buscar_proyecto_fuzzy() también mide similitud contra los ALIAS
-- =============================================================================
-- Fecha: 2026-08-27
--
-- EL BUG
-- ------
-- La función tenía tres ramas y ninguna aprovechaba los alias para el fuzzy:
--   1. `alias_exacto` (1.0)  → compara los alias en CRUDO: `p_nombre = ANY(alias)`
--                              o su `lower()`. NO normaliza.
--   2. `nombre_normalizado`  → `normalize_nombre(nombre_oficial)` = input normalizado.
--   3. `fuzzy_trigram`       → similarity SOLO contra `nombre_oficial`.
-- Resultado: si el alias correcto está escrito distinto (un espacio, un acento),
-- la rama 1 falla por texto crudo y la rama 3 ni siquiera lo mira. El alias, que
-- es el registro de CÓMO ESCRIBEN los captadores, no participa del fuzzy.
--
-- EL CASO QUE LO DESTAPÓ (27-ago-2026, prop 8001078)
-- --------------------------------------------------
-- Aviso: "Nano by Smart Studio".
--   · pm 36 "Nano Smart" tiene el alias "Nano by SmartStudio"
--       - normalize_nombre lo lleva a `nanobysmartstudio` = EXACTAMENTE el input
--         normalizado → similitud contra el alias: **1.000**
--       - pero la rama 1 compara crudo y falla por el espacio ("Smart Studio" vs
--         "SmartStudio"); la rama 3 mide contra "Nano Smart" → **0.333**, bajo umbral
--   · pm 129 "NanoTec by Smart Studio" → 0.696 contra su nombre oficial
-- El pm 36 NO aparecía en ninguno de los 5 candidatos, pese a tener 6 props ya
-- matcheadas a ese mismo edificio. Ganaba el pm 129, el edificio equivocado.
--
-- 🔑 Por qué importa más que un match perdido: una lista de candidatos VACÍA se lee
-- como "no está cargado" y manda el caso a la cola. Una lista LLENA con score alto
-- apuntando al edificio equivocado **se lee peor, porque da confianza**.
--
-- EL FIX
-- ------
-- Se agrega una 4ª rama `fuzzy_alias`: similarity(normalize_nombre(alias), input),
-- tomando el MEJOR alias de cada pm. El dedup por pm que ya existía se queda con el
-- score más alto, así que un alias bueno puede superar a un nombre oficial pobre.
-- No se toca ninguna de las tres ramas existentes.
--
-- IMPACTO MEDIDO (sobre los 438 nombres de edificio distintos vivos en shadow)
-- ---------------------------------------------------------------------------
-- 43 nombres cambian de ganador. Contrastados contra el pm que esas props tienen
-- HOY (asignado por jueces y por el founder, o sea la referencia buena):
--   · 37 RESCATES — el fuzzy pasa a devolver el edificio correcto. Entre ellos:
--       "Onix Art" 223→45 · "Le Blanc" 83→112 · "Macororó 15" 218→361 ·
--       "Galil Parque 1" 358→518 · "Torre Eurodesign" 275→113 · "Platinum 1" 25→71 ·
--       "Sky Plaza" 280→140 · "Smart You" 350→77 · "Trivento 3" 332→511 ·
--       "Rise" 537→384 · "Barcelona 04-05" 427→273 · "Baruc 4" 288→120
--     y 11 que hoy NO devuelven NADA y pasarían a resolver: "Bellini", "Yotau",
--     "You", "You Plaza", "Sky Design", "Torres Zen", "Lusitano", "Isuto by One"…
--   · 0 REGRESIONES reales.
--
-- ⚠️ Durante la medición aparecieron 4 "regresiones" que resultaron ARTEFACTO de la
--    simulación (modelaba solo la rama fuzzy, sin las de alias exacto). Verificado
--    llamando a la función REAL: en "Uptown NUU" y "Santorini Suites" el ganador de
--    hoy YA es el que la simulación marcaba como regresión. El fix no los cambia.
--
-- 🔴 HALLAZGO APARTE que esta medición destapó — NO se corrige acá (toca datos, no
--    código, y las 2 fichas tienen props vivas):
--      · pm 35 "Edificio Uptown Equipetrol" tiene el alias "Uptown NUU", que es el
--        NOMBRE OFICIAL del pm 54. Hoy "Uptown NUU" devuelve el pm 35 primero.
--      · pm 221 "SANTORINI VENTURA" tiene TRES alias de Santorini Suites (pm 516):
--        "Santorini Suites", "SANTORINI SUITES", "Condominio Santorini Suites".
--        Hoy los dos empatan en 1.0 y el desempate es arbitrario.
--    Es el mismo patrón del alias intruso de Eurodesign (18-ago, pm 297 ← pm 113).
--    Ver el bloque de verificación al pie.
--
-- ROLLBACK: al pie.
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

          UNION ALL

          -- ── 🆕 RAMA 4 (mig 342): fuzzy contra los ALIAS ─────────────────────
          -- Los alias son el registro de CÓMO ESCRIBEN los captadores. Hasta
          -- ahora solo servían para igualdad exacta en crudo, así que un espacio
          -- o un acento de diferencia los volvía inútiles. Se toma el MEJOR alias
          -- de cada pm; el dedup posterior se queda con el mejor score del pm.
          SELECT
              pm.id_proyecto_master,
              pm.nombre_oficial,
              pm.desarrollador,
              pm.zona,
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
      SELECT d.id_proyecto_master, d.nombre_oficial, d.desarrollador, d.zona, d.score, d.match_tipo
      FROM deduplicados d
      ORDER BY d.score DESC, d.match_tipo
      LIMIT p_limite;
  END;
$function$;

COMMENT ON FUNCTION public.buscar_proyecto_fuzzy(text, numeric, integer) IS
  'Candidatos de matching por nombre. mig 342: agrega la rama fuzzy_alias — la similitud '
  'también se mide contra los alias normalizados, no solo contra nombre_oficial. Antes un '
  'alias con un espacio de diferencia era invisible para el fuzzy (caso Nano by Smart Studio, '
  '27-ago-2026: el pm correcto tenia similitud 1.000 por alias y no aparecia entre los 5).';

-- =============================================================================
-- VERIFICACIÓN — correr DESPUÉS de aplicar
-- =============================================================================
-- 1) El caso que motivó la migración: el pm 36 debe aparecer PRIMERO, con 1.000.
--    Antes devolvía 129 (0.696) y el 36 no figuraba.
--
--    SELECT * FROM buscar_proyecto_fuzzy('Nano by Smart Studio', 0.3, 5);
--    Esperado: fila 1 = id 36 "Nano Smart", score 1.000, match_tipo 'fuzzy_alias'
--
-- 2) Tres rescates de control (deben devolver el pm de la derecha en primer lugar):
--    SELECT * FROM buscar_proyecto_fuzzy('Onix Art', 0.3, 3);        -- 45
--    SELECT * FROM buscar_proyecto_fuzzy('Galil Parque 1', 0.3, 3);  -- 518
--    SELECT * FROM buscar_proyecto_fuzzy('Macororó 15', 0.3, 3);     -- 361
--
-- 3) Control de NO regresión — estos no deben moverse:
--    SELECT * FROM buscar_proyecto_fuzzy('Sky Tower', 0.3, 3);
--    SELECT * FROM buscar_proyecto_fuzzy('Stratto Up', 0.3, 3);
--
-- 4) 🔴 Los dos alias intrusos que destapó la medición (NO los corrige esta
--    migración: tocan datos y las fichas tienen props vivas). Para verlos:
--
--    SELECT id_proyecto_master, nombre_oficial, alias_conocidos
--      FROM proyectos_master WHERE id_proyecto_master IN (35, 54, 221, 516);
--
--    · pm 35 "Edificio Uptown Equipetrol" ← saca el alias 'Uptown NUU' (es el
--      nombre oficial del pm 54):
--        UPDATE proyectos_master
--           SET alias_conocidos = array_remove(alias_conocidos, 'Uptown NUU')
--         WHERE id_proyecto_master = 35;
--    · pm 221 "SANTORINI VENTURA" ← saca los tres alias de Santorini Suites (pm 516):
--        UPDATE proyectos_master
--           SET alias_conocidos = alias_conocidos
--               #- ARRAY[array_position(alias_conocidos,'Santorini Suites')::text]
--         WHERE id_proyecto_master = 221;   -- (repetir por cada uno, o reescribir el array)
--    ⚠️ Antes de sacarlos, chequear que ninguna prop viva dependa de ese alias para
--       su match — el alias no desmatchea nada ya escrito, pero conviene mirarlo.
--
-- =============================================================================
-- ROLLBACK — vuelve a la versión de 3 ramas (borra la rama fuzzy_alias)
-- =============================================================================
-- Exportar antes la definición viva:
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--    WHERE proname = 'buscar_proyecto_fuzzy' AND pronamespace = 'public'::regnamespace;
-- y re-crear la función quitando el cuarto bloque UNION ALL (el marcado
-- "RAMA 4 (mig 342)"). El resto del cuerpo no se tocó.
-- =============================================================================
