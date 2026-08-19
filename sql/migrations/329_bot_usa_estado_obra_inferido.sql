-- =============================================================================
-- 329 · El bot pasa a ver el estado de obra inferido (como el feed desde el 5-ago)
-- =============================================================================
-- POR QUÉ
-- El bot le dice al cliente que **no sabe** si es preventa o entrega inmediata en
-- 205 de 391 propiedades de Equipetrol (52,4%). Lo pidió lab-kapso el 19-ago con
-- números medidos, preguntando si el pipeline había quedado a medias.
--
-- No quedó a medias: `estado_construccion` guarda solo lo que el aviso dice
-- explícito, y la mitad de los avisos no lo dice. Lo que pasa es que **el bot lee
-- el campo crudo y el sitio no**: desde la mig 302/303/315 existe
-- `v_estado_obra_inferido_shadow`, que infiere el estado con señales laterales, y
-- `buscar_unidades_simple_shadow` (la RPC del feed público) la usa hace dos semanas.
--
-- Esta migración le da al bot exactamente lo mismo que ya muestra el feed.
--
-- EFECTO MEDIDO (Equipetrol, 19-ago) — es lo que va a cambiar en la conversación:
--   "no especifica"     205 → 72
--   entrega inmediata    90 → 221
--   preventa             96 → 98
-- Y quien pide "entrega inmediata" pasa a ver **131 propiedades** que hoy quedan
-- escondidas por falta de dato: `buscar_propiedades` FILTRA por estado, no solo
-- lo informa.
--
-- De dónde sale cada una de las 133 que se recuperan:
--   vecinos unánimes del edificio ... 66   (backtest 96,7%)
--   hay alquiler activo ahí ......... 55   (backtest 95%)
--   verificado por un humano ........ 12   (afirmable sin reservas)
--
-- SIN CEREMONIA, A PROPÓSITO
-- Se evaluó exigir que el bot declare el ORIGEN del dato inferido. Se descartó:
-- **el feed muestra "Entrega inmediata" a secas desde hace dos semanas** y nadie
-- declara nada ahí (el único que usa `estado_origen` es el ACM). Pedirle al bot un
-- estándar que el sitio no cumple habría trabado el arreglo esperando un cambio de
-- prompt en otro repo. `estado_origen` sigue disponible en la vista el día que
-- quieran matizar — no es condición para esto.
--
-- ALCANCE — las 3 RPC son EXCLUSIVAS del bot (verificado por 4 ángulos):
--   · código: solo `lab-kapso` (bot-core.js · casos-prompt.js · workflow.js);
--     la RPC de búsqueda hasta nació ahí (`lab-kapso/sql/crear-rpc-buscar.sql`)
--   · otras funciones SQL: ninguna      · vistas: ninguna
--   · pg_cron: ninguno de los 3 jobs
-- 🔴 NO son las RPC del sitio. Confundirlas costó 19 días de bot caído en julio.
--
-- CÓMO
-- Dos sustituciones por función, sobre la definición VIVA (regla 7). En el CTE
-- `base` de cada una:
--   1. `estado_construccion` → `COALESCE(estado_construccion::text, inf.estado_efectivo)`
--      aliasado con el MISMO nombre, así los usos posteriores (`::text`, el GROUP BY,
--      el filtro `p_estado`) siguen sirviendo sin tocarse.
--   2. el `FROM v_mercado_venta_shadow` **del CTE** suma el LEFT JOIN.
--      🔴 El patrón exige que el FROM esté seguido del cierre del CTE. Sin eso
--      también matchearía la lectura del perfil de zona en `buscar_similares`
--      (línea 56), que NO usa el estado y no debe tocarse.
-- Las 3 columnas de la vista (`propiedad_id`, `estado_efectivo`, `estado_origen`)
-- no colisionan con ninguna de `v_mercado_venta_shadow`: el JOIN no crea ambigüedad.
--
-- Las tres devuelven `jsonb`: **no cambia ninguna firma** y el bot no necesita
-- enterarse. La rama de ALQUILER de las tres no se toca.
--
-- FORMATO: sigue a las migs 327/328 (recrear desde el catálogo), no a
-- `_template.sql`, que es para migraciones que crean objetos.
--
-- ⚠️ El bot está con campaña paga corriendo. Rollback al pie: es la sustitución
--    inversa, y devuelve las 3 funciones al estado exacto de hoy.
-- =============================================================================

BEGIN;

DO $mig$
DECLARE
  r          RECORD;
  def_actual TEXT;
  def_nueva  TEXT;
  n_ok       INT := 0;
  -- patrón de columnas por función: cada uno es único dentro de SU definición
  patrones   TEXT[][] := ARRAY[
    ['resumen_mercado',
     'dormitorios, estado_construccion',
     'dormitorios, COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion'],
    ['buscar_propiedades',
     'estado_construccion, url, zona, zona_general, dormitorios',
     'COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion, url, zona, zona_general, dormitorios'],
    ['buscar_similares',
     'estacionamientos, estado_construccion, url, zona, dormitorios',
     'estacionamientos, COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion, url, zona, dormitorios']
  ];
  i INT;
BEGIN
  FOR i IN 1 .. array_length(patrones, 1) LOOP
    SELECT pg_get_functiondef(p.oid) INTO def_actual
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = patrones[i][1];

    IF def_actual IS NULL THEN
      RAISE EXCEPTION 'No existe %. Abortado.', patrones[i][1];
    END IF;

    -- 1) el COALESCE en el CTE
    def_nueva := replace(def_actual, patrones[i][2], patrones[i][3]);
    IF def_nueva = def_actual THEN
      RAISE EXCEPTION 'No se encontró la lista de columnas del CTE en %. Abortado.', patrones[i][1];
    END IF;

    -- 2) el LEFT JOIN, SOLO en el FROM que cierra el CTE
    def_nueva := regexp_replace(def_nueva,
      'FROM v_mercado_venta_shadow(\s*\r?\n\s*\))',
      'FROM v_mercado_venta_shadow LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id\1',
      'g');
    IF def_nueva !~ 'v_estado_obra_inferido_shadow' THEN
      RAISE EXCEPTION 'No se pudo insertar el LEFT JOIN en %. Abortado.', patrones[i][1];
    END IF;

    EXECUTE def_nueva;
    n_ok := n_ok + 1;
    RAISE NOTICE '% → usa el estado de obra inferido', patrones[i][1];
  END LOOP;

  IF n_ok <> 3 THEN
    RAISE EXCEPTION 'Se esperaban 3 funciones actualizadas y hubo %. Abortado.', n_ok;
  END IF;
END
$mig$;

-- ── Verificación ────────────────────────────────────────────────────────────
DO $chk$
DECLARE
  n_con_join INT;
  r_venta    jsonb;
  n_similar  INT;
BEGIN
  SELECT COUNT(*) INTO n_con_join
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('resumen_mercado','buscar_propiedades','buscar_similares')
     AND p.prosrc ~ 'v_estado_obra_inferido_shadow';
  IF n_con_join <> 3 THEN
    RAISE EXCEPTION 'Solo % de 3 RPC quedaron con la inferencia. Abortado.', n_con_join;
  END IF;

  -- 🔴 La lectura del perfil de zona de buscar_similares NO debía tocarse
  IF (SELECT prosrc FROM pg_proc WHERE proname='buscar_similares')
       !~ 'FROM v_mercado_venta_shadow\s*\r?\n\s*WHERE id = ANY\(v_anchor_ids\)' THEN
    RAISE EXCEPTION 'Se tocó la lectura del perfil de zona de buscar_similares. Abortado.';
  END IF;

  -- Las 3 tienen que seguir respondiendo, no solo compilar
  r_venta := resumen_mercado('venta');
  IF (r_venta->'general'->>'total')::int < 300 THEN
    RAISE EXCEPTION 'resumen_mercado devolvió % propiedades — muy pocas. Abortado.', r_venta->'general'->>'total';
  END IF;

  SELECT jsonb_array_length(buscar_propiedades('venta', NULL, NULL, NULL, 'entrega_inmediata', NULL, 'precio', 6))
    INTO n_similar;
  IF n_similar IS NULL THEN
    RAISE EXCEPTION 'buscar_propiedades no devolvió un array. Abortado.';
  END IF;

  RAISE NOTICE '✅ 3 RPC con la inferencia · el perfil de zona intacto · responden bien';
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK — deja las 3 funciones exactamente como estaban
-- =============================================================================
-- BEGIN;
-- DO $rb$
-- DECLARE r RECORD; d TEXT;
-- BEGIN
--   FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--             WHERE n.nspname='public' AND p.proname IN ('resumen_mercado','buscar_propiedades','buscar_similares')
--   LOOP
--     d := pg_get_functiondef(r.oid);
--     d := replace(d, 'COALESCE(estado_construccion::text, inf.estado_efectivo) AS estado_construccion', 'estado_construccion');
--     d := replace(d, ' LEFT JOIN v_estado_obra_inferido_shadow inf ON inf.propiedad_id = id', '');
--     EXECUTE d;
--   END LOOP;
-- END $rb$;
-- COMMIT;
