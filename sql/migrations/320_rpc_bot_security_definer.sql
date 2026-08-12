-- ============================================================================
-- 320 — Las 3 RPC que consulta el bot pasan a SECURITY DEFINER
-- ============================================================================
-- Fecha: 2026-08-12
--
-- SÍNTOMA: el bot de WhatsApp contesta "Estoy teniendo un problema técnico para
--   consultar el mercado en este momento". Última consulta de VENTA que funcionó:
--   24-jul. De ALQUILER: 2-ago. **No se rompió ayer: se descubrió ayer.**
--   La alarma registró el `bot_error` en `simon_bot_incidentes` a las 22:06.
--
-- CAUSA: las tres funciones que el bot usa son SECURITY INVOKER, o sea que leen
--   con los permisos de QUIEN LLAMA. El bot llama con la clave pública (rol
--   `anon`; en Kapso se cargan SUPABASE_URL + SUPABASE_ANON_KEY, ver
--   lab-kapso/MIGRACION-KAPSO.md). Esa clave perdió la lectura de las tablas que
--   las funciones leen por dentro, en dos momentos:
--     · 7-ago  (mig 315) — se recreó `v_estado_obra_inferido_shadow` y quedó con
--                          GRANT solo para service_role y claude_readonly.
--                          → rompe VENTA
--     · 10-ago (mig 317) — REVOKE ALL ON propiedades_v2_shadow FROM anon
--                          → rompe VENTA, ALQUILER y EXTRAS
--
-- 🔑 CÓMO SE ESCAPÓ, que es lo que hay que no repetir:
--   La 317 se justificó diciendo *"las 3 RPC del bot (`buscar_propiedades`,
--   `resumen_mercado`, `buscar_similares`) son SECURITY DEFINER → no dependen de
--   estos permisos"*. **Esa frase es verdadera**: esas tres SON definer (verificado
--   hoy). El problema es que **no son las que el bot usa**: el 21-jul se
--   repointearon a las gemelas `_shadow`, que quedaron INVOKER.
--   No fue una afirmación inventada — fue verificar el objeto equivocado. Es la
--   misma familia que la mig 306, que existe textualmente porque se creó "un objeto
--   nuevo sin GRANT del que dependía una RPC pública existente". Van dos veces con
--   la MISMA vista.
--
-- POR QUÉ DEFINER Y NO DEVOLVERLE EL GRANT A `anon`:
--   Un GRANT SELECT sobre las tablas crudas destraba hoy y deja la trampa armada
--   para la próxima migración que cierre una tabla o recree una vista. Con DEFINER
--   la función deja de depender de los permisos del que llama: se rompe el vínculo,
--   no se parchea.
--   👉 Queda MÁS cerrado que antes del incidente: hasta el 10-ago `anon` podía LEER
--   y ESCRIBIR las tablas crudas. Ahora no puede ninguna de las dos — solo ejecutar
--   la función, que devuelve exactamente lo que ya es público en simonbo.com.
--   **No deshace nada de lo que ganó la 317.**
--
-- VERIFICADO ANTES DE ESCRIBIR (nada asumido):
--   1. Las tres solo LEEN (ningún INSERT/UPDATE/DELETE).
--   2. Ninguna usa current_user / session_user / auth.* → el resultado no depende
--      de quién llame, así que DEFINER no cambia lo que devuelven.
--   3. Las 5 tablas/vistas que tocan tienen RLS DESACTIVADA y sin políticas
--      (`relrowsecurity = false`) → no hay nada que DEFINER pueda saltear.
--   4. Ninguna otra función de la base las llama. Los llamadores son /api/ventas,
--      /api/alquileres y verificar-shadow-alquiler.mjs: los tres con service_role,
--      que ya leía todo → para ellos no cambia nada.
--   5. OWNER de las tres = `postgres`, que es dueño de las 5 tablas/vistas y puede
--      leerlas. DEFINER corre como el owner: tiene acceso.
--   6. `search_path = public` es seguro: postgis, pg_trgm y fuzzystrmatch están en
--      `public`, y ninguna de las tres usa nada del schema `extensions`
--      (pgcrypto / uuid-ossp).
--   7. `anon`, `authenticated`, `service_role` y `claude_readonly` YA tienen
--      EXECUTE sobre las tres → no hace falta ningún GRANT nuevo.
--
-- PRECEDENTE: `buscar_propiedades`, `resumen_mercado` y `buscar_similares` ya son
--   `SECURITY DEFINER` con exactamente `search_path=public`. Esto no inventa un
--   patrón: completa el que ya existe.
--
-- 🔴 EL CUERPO DE LAS FUNCIONES NO SE TOCA. Se usa `ALTER FUNCTION`, no
--   `CREATE OR REPLACE`: no hay transcripción posible desde un archivo local, que
--   es lo que prohíbe la regla #7 del CLAUDE.md.
--
-- NUMERACIÓN: va 320 y no 318 porque la 318 y la 319 están tomadas por la rama
--   `worktree-fix-bsuid-crm-contactos` (identidad del CRM por BSUID de Meta),
--   todavía sin mergear y sin aplicar.
--   ⚠️ Esa rama tiene su propia `318_bsuid_registrar_identidad_meta.sql` y en el
--   worktree del TC hay otra `318_tc_binance_historial_registro_honesto.sql`:
--   **dos 318 distintas**. Hay que renumerar una antes de aplicarlas.
--
-- ROLLBACK: al pie del archivo.
-- ============================================================================

-- ── Guarda: las tres tienen que existir con la firma exacta ──────────────────
-- Si alguna cambió de firma, este script no debe correr a medias.
DO $$
DECLARE faltan text;
BEGIN
  SELECT string_agg(f, ', ') INTO faltan
    FROM unnest(ARRAY[
      'public.buscar_unidades_simple_shadow(jsonb)',
      'public.buscar_unidades_alquiler_shadow(jsonb)',
      'public.buscar_extras_shadow(integer[])'
    ]) f
   WHERE to_regprocedure(f) IS NULL;

  IF faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Abortado sin tocar nada: no existe(n) con esa firma → %', faltan;
  END IF;
END $$;

-- ── El cambio: 3 líneas, sin tocar una coma del cuerpo ───────────────────────
ALTER FUNCTION public.buscar_unidades_simple_shadow(jsonb)   SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.buscar_unidades_alquiler_shadow(jsonb) SECURITY DEFINER SET search_path = public;
ALTER FUNCTION public.buscar_extras_shadow(integer[])        SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.buscar_unidades_simple_shadow(jsonb) IS
  'Feed de venta (sitio + bot WhatsApp). SECURITY DEFINER desde la mig 320: el bot la llama con la clave pública, que no lee las tablas crudas desde la mig 317. NO volver a INVOKER sin darle a anon el SELECT sobre propiedades_v2_shadow y v_estado_obra_inferido_shadow.';

COMMENT ON FUNCTION public.buscar_unidades_alquiler_shadow(jsonb) IS
  'Feed de alquiler (sitio + bot WhatsApp). SECURITY DEFINER desde la mig 320 — ver el comentario de buscar_unidades_simple_shadow.';

COMMENT ON FUNCTION public.buscar_extras_shadow(integer[]) IS
  'Parqueos/bauleras del feed (sitio + bot WhatsApp). SECURITY DEFINER desde la mig 320 — ver el comentario de buscar_unidades_simple_shadow.';

-- ── Verificación: las 3 quedaron DEFINER con search_path fijo ────────────────
-- Esperado: 3 filas, todas con es_definer = true y config = search_path=public
SELECT p.proname,
       p.prosecdef                                   AS es_definer,
       array_to_string(p.proconfig, ',')             AS config,
       pg_get_userbyid(p.proowner)                   AS owner,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ejecuta
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('buscar_unidades_simple_shadow',
                     'buscar_unidades_alquiler_shadow',
                     'buscar_extras_shadow')
 ORDER BY 1;

-- ── Verificación funcional: esto es lo que el bot no podía hacer ─────────────
-- Devuelve un conteo > 0 en las dos operaciones.
SELECT 'venta'    AS operacion, count(*) AS filas FROM buscar_unidades_simple_shadow('{"limite":5,"solo_con_fotos":true}'::jsonb)
UNION ALL
SELECT 'alquiler',              count(*)          FROM buscar_unidades_alquiler_shadow('{"limite":5,"solo_con_fotos":true}'::jsonb);

-- ============================================================================
-- ROLLBACK (solo si algo se rompiera; deja el bot caído de nuevo)
-- ----------------------------------------------------------------------------
-- ALTER FUNCTION public.buscar_unidades_simple_shadow(jsonb)   SECURITY INVOKER RESET search_path;
-- ALTER FUNCTION public.buscar_unidades_alquiler_shadow(jsonb) SECURITY INVOKER RESET search_path;
-- ALTER FUNCTION public.buscar_extras_shadow(integer[])        SECURITY INVOKER RESET search_path;
-- ============================================================================
