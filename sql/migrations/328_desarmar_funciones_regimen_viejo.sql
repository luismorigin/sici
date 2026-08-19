-- =============================================================================
-- 328 · Desarmar las funciones del régimen viejo que quedaron leyendo la base viva
-- =============================================================================
-- POR QUÉ
-- Hasta el TIEMPO 1 estas funciones eran inofensivas: calculaban con la fórmula
-- vieja (`precio_normalizado()`, con el ×tc/6.96) pero leían una tabla congelada.
-- El TIEMPO 2 (17-ago) renombró la tabla buena a `propiedades_v2` y, como las
-- funciones ligan por NOMBRE, todas pasaron a leer datos vivos con la fórmula
-- equivocada. **No fallan: devuelven un número inflado y siguen.**
--
-- El 19-ago se encontró una disparando de verdad: el editor de shortlists del
-- broker (arreglado en el commit 7c496e7). Esta migración desarma el resto para
-- que el modo de falla deje de ser "mentir en silencio" y pase a ser "romper
-- fuerte" — que es lo que se puede detectar.
--
-- NO SE BORRA NADA: se renombra a `_trash_*`. Revertir es otro rename (al pie).
-- Regla 13 del proyecto: rename antes de DROP.
--
-- FORMATO: sigue a la mig 327 (su hermana), no a `_template.sql`. El template
-- está armado para migraciones que CREAN objetos —tabla → GRANTs → RLS → RPC →
-- vista— y esta no crea ninguno: renombra y recrea. Del checklist del template
-- sí aplican: aplicar por Supabase UI/psql (no MCP), rollback documentado, y
-- registrar en `docs/migrations/MIGRATION_INDEX.md`.
--
-- =============================================================================
-- EL BARRIDO — 6 ángulos, ninguno por memoria
-- =============================================================================
-- Se buscó cada candidata en:
--   1. otras FUNCIONES        → `pg_proc.prosrc`
--   2. VISTAS                 → `pg_get_viewdef`            → 0 hallazgos
--   3. TRIGGERS               → `pg_trigger` + `pg_proc`    → 0 hallazgos
--   4. DEFAULTS de columna    → `pg_attrdef`                → 0 hallazgos
--   5. pg_cron                → los 3 jobs, leídos por el founder (el rol de
--      solo lectura NO tiene permiso sobre el schema `cron`: este ángulo siempre
--      necesita a una persona). Jobs: advisor-snapshot-diario [DESAGENDADO el
--      19-ago], vigilar-bot-wa, parte-diario-bot.
--   6. CÓDIGO en los 9 repos del disco — no solo `sici`. La tabla del Advisor la
--      lee `simon-advisor`, que es otro repo con su propio deploy: buscar en un
--      solo repositorio fue el error que casi rompe su app.
--
-- RESULTADO POR FUNCIÓN
--   analisis_mercado_fiduciario  → llamador: solo un wrapper JS muerto
--                                  (`obtenerAnalisisFiduciario`, sin usuarios)   → SE DESARMA
--   explicar_precio              → llamador: solo `analisis_mercado_fiduciario`  → SE DESARMA
--   snapshot_absorcion_mercado   → llamador: solo n8n (apagado desde julio)      → SE DESARMA
--   buscar_unidades_simple       → 2 llamadores, los DOS resueltos:
--                                    · endpoint de shortlists (commit 7c496e7)
--                                    · `populate_broker_prospection` (acá abajo) → SE DESARMA
--
-- 🔴 QUEDAN VIVAS TRES, a propósito — son la cadena del Advisor:
--      buscar_unidades_reales → razon_fiduciaria_texto → generar_razon_fiduciaria
--    `simon-advisor/src/lib/tool-executor.ts:147` llama a `buscar_unidades_reales`
--    como fallback en vivo. El Advisor está PAUSADO pero su deploy sigue arriba:
--    renombrarla rompería una app publicada, no un script. El founder decidió
--    pausarlo sin descartarlo → ver `simon-advisor/RETOMAR_ADVISOR.md`.
--    ⚠️ Estas tres siguen calculando con la fórmula vieja sobre la base viva.
--       Es deuda conocida y declarada, ligada a retomar el Advisor.
--
-- =============================================================================
-- PREDICCIÓN FIRMADA (verificar después de aplicar)
-- =============================================================================
--   · Los 4 feeds: sin cambios. No usan ninguna de estas funciones.
--   · El bot de WhatsApp: sin cambios (usa resumen_mercado, buscar_propiedades,
--     buscar_similares — ninguna acá).
--   · El editor de shortlists: sin cambios respecto del commit 7c496e7.
--   · `/admin/prospection`: el botón Refrescar sigue funcionando y da lo MISMO —
--     medido: 195 captadores y 355 propiedades por las dos vías (no usa precios).
--   · Lo que DEBE romper si alguien lo llama: las 4 desarmadas. Es el objetivo.
-- =============================================================================

BEGIN;

-- ── 1. La prospección deja de usar la RPC vieja ─────────────────────────────
-- Se reescribe desde la definición VIVA (regla 7: el archivo del repo no prueba
-- lo que corre) sustituyendo solo el nombre de la RPC. `\M` es obligatorio: sin
-- él, `buscar_unidades_simple` matchearía dentro de `buscar_unidades_simple_shadow`.
DO $mig$
DECLARE
  def_actual TEXT;
  def_nueva  TEXT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO def_actual
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'populate_broker_prospection';

  IF def_actual IS NULL THEN
    RAISE EXCEPTION 'No existe populate_broker_prospection. Abortado.';
  END IF;

  def_nueva := regexp_replace(def_actual,
                 '\mbuscar_unidades_simple\M', 'buscar_unidades_simple_shadow', 'g');

  IF def_nueva = def_actual THEN
    RAISE EXCEPTION 'No se sustituyó la RPC en populate_broker_prospection. Abortado.';
  END IF;

  EXECUTE def_nueva;
  RAISE NOTICE 'populate_broker_prospection → apunta a buscar_unidades_simple_shadow';
END
$mig$;

-- ── 2. Desarmar las 4 (rename, no DROP) ─────────────────────────────────────
ALTER FUNCTION public.analisis_mercado_fiduciario(jsonb) RENAME TO _trash_analisis_mercado_fiduciario;
ALTER FUNCTION public.explicar_precio(integer)           RENAME TO _trash_explicar_precio;
ALTER FUNCTION public.snapshot_absorcion_mercado()       RENAME TO _trash_snapshot_absorcion_mercado;
ALTER FUNCTION public.buscar_unidades_simple(jsonb)      RENAME TO _trash_buscar_unidades_simple;

-- ── 3. Verificación: aborta si el resultado no es exactamente el esperado ───
DO $chk$
DECLARE
  n_trash INT;
  n_vivas INT;
BEGIN
  SELECT COUNT(*) INTO n_trash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('_trash_analisis_mercado_fiduciario',
     '_trash_explicar_precio','_trash_snapshot_absorcion_mercado','_trash_buscar_unidades_simple');
  IF n_trash <> 4 THEN
    RAISE EXCEPTION 'Se esperaban 4 funciones desarmadas y hay %. Abortado.', n_trash;
  END IF;

  -- La cadena del Advisor tiene que seguir intacta
  SELECT COUNT(*) INTO n_vivas FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('buscar_unidades_reales','razon_fiduciaria_texto','generar_razon_fiduciaria');
  IF n_vivas <> 3 THEN
    RAISE EXCEPTION 'La cadena del Advisor debía quedar intacta (3 funciones) y hay %. Abortado.', n_vivas;
  END IF;

  -- Y la prospección no puede haber quedado apuntando a la vieja
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='populate_broker_prospection'
               AND prosrc ~ '\mbuscar_unidades_simple\M') THEN
    RAISE EXCEPTION 'populate_broker_prospection sigue llamando a la RPC vieja. Abortado.';
  END IF;

  -- Los GRANT: `CREATE OR REPLACE FUNCTION` los PRESERVA, pero se verifica igual —
  -- si la prospección se quedara sin EXECUTE, el botón Refrescar del admin daría
  -- 42501 desde el browser y recién nos enteraríamos ahí.
  IF NOT has_function_privilege('service_role', 'public.populate_broker_prospection()', 'EXECUTE') THEN
    RAISE EXCEPTION 'populate_broker_prospection perdió EXECUTE para service_role. Abortado.';
  END IF;

  RAISE NOTICE '✅ 4 funciones desarmadas · cadena del Advisor intacta · prospección apuntada a shadow · GRANTs intactos';
END
$chk$;

COMMIT;

-- =============================================================================
-- ROLLBACK — correr esto tal cual para volver atrás
-- =============================================================================
-- BEGIN;
-- ALTER FUNCTION public._trash_analisis_mercado_fiduciario(jsonb) RENAME TO analisis_mercado_fiduciario;
-- ALTER FUNCTION public._trash_explicar_precio(integer)           RENAME TO explicar_precio;
-- ALTER FUNCTION public._trash_snapshot_absorcion_mercado()       RENAME TO snapshot_absorcion_mercado;
-- ALTER FUNCTION public._trash_buscar_unidades_simple(jsonb)      RENAME TO buscar_unidades_simple;
-- -- y la prospección vuelve a la RPC vieja:
-- DO $rb$
-- DECLARE d TEXT;
-- BEGIN
--   SELECT pg_get_functiondef(oid) INTO d FROM pg_proc WHERE proname='populate_broker_prospection';
--   EXECUTE regexp_replace(d, '\mbuscar_unidades_simple_shadow\M', 'buscar_unidades_simple', 'g');
-- END $rb$;
-- COMMIT;
