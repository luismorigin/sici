-- ============================================================================
-- 317 — Quitarle la ESCRITURA al usuario público sobre las tablas de propiedades
-- ============================================================================
-- Fecha: 2026-08-10
--
-- PROBLEMA (verificado, no teórico):
--   `propiedades_v2` y `propiedades_v2_shadow` tienen `anon=arwdDxtm` (TODOS los
--   permisos) y RLS desactivado. La clave `anon` viaja en el navegador de
--   cualquier visitante de simonbo.com → hoy se puede INSERT/UPDATE/DELETE sobre
--   la base de propiedades desde afuera. Es el caso exacto que advierte la regla
--   #13 del CLAUDE.md: toda tabla nueva en `public` nace con anon en ALL por los
--   default privileges del schema, y los GRANT suman pero no revocan.
--
-- POR QUÉ ESTE RECORTE Y NO OTRO (investigado antes de escribir):
--   · Las vistas (`v_mercado_*`) NO tienen `security_invoker` → corren con los
--     permisos de su DUEÑO. Quien puede leer la VISTA la lee aunque no tenga
--     permiso sobre la tabla. Por eso cerrar la tabla no afecta al feed.
--   · `buscar_unidades_simple_shadow` y `buscar_unidades_alquiler_shadow` son
--     INVOKER (no DEFINER) → acceden con los permisos de quien llama. Por eso NO
--     se toca el SELECT de `anon` sobre las vistas: ahí sí se rompería el feed.
--   · Las 3 RPC del bot (`buscar_propiedades`, `resumen_mercado`,
--     `buscar_similares`) son SECURITY DEFINER → no dependen de estos permisos.
--   · `anon` SÍ lee `propiedades_v2` directo en 3 puntos del sitio
--     (lib/supabase.ts:652 precio de la siguiente opción · :734 métricas de
--     mercado · :868 contador de la home) → se le CONSERVA el SELECT.
--   · `anon` NO consulta nunca `propiedades_v2_shadow`: los 3 lugares del sitio
--     que la nombran son server-side con service_role
--     (mercado-shadow-data.ts, simon-contactos.ts, api/acm-buscar.ts) → se cierra
--     por completo.
--   · `authenticated` NO se toca en esta migración: lo usa el editor del admin
--     para guardar (usePropertyEditor escribe con la sesión del usuario).
--     Endurecerlo va junto con el arreglo del admin, no antes.
--
-- QUÉ NO ARREGLA: RLS sigue desactivado. Esto corta la escritura anónima, que es
--   el agujero abierto; el modelo de RLS es un trabajo aparte
--   (docs/canonical/SEGURIDAD_SUPABASE.md, backlog Tier 2).
--
-- ROLLBACK: al pie del archivo.
-- ============================================================================

BEGIN;

-- 1) Tabla vieja (pasa a archivo en el cutover): se conserva la LECTURA pública
--    porque 3 puntos del sitio la consultan con anon. Se corta la escritura.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.propiedades_v2 FROM anon;

-- 2) Tabla del híbrido (la base buena): anon no la consulta nunca → se cierra entera.
REVOKE ALL ON public.propiedades_v2_shadow FROM anon;

-- 3) Las secuencias: sin esto, anon puede seguir consumiendo números de id.
REVOKE ALL ON SEQUENCE public.propiedades_v2_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.propiedades_v2_shadow_id_reservado_seq FROM anon;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN (correr después; `anon` no debe aparecer con w/a/d)
-- ============================================================================
-- SELECT relname, relacl FROM pg_class
--  WHERE relname IN ('propiedades_v2','propiedades_v2_shadow',
--                    'propiedades_v2_id_seq','propiedades_v2_shadow_id_reservado_seq');
--
-- Esperado:
--   propiedades_v2        → anon=r/postgres            (solo lectura)
--   propiedades_v2_shadow → sin entrada de anon        (sin acceso)
--
-- PRUEBA FUNCIONAL (hacer las 3, en este orden, apenas se aplique):
--   1. Abrir simonbo.com/ventas        → deben salir las propiedades
--   2. Abrir simonbo.com/alquileres    → ídem
--   3. Abrir simonbo.com (home)        → la banda de mercado con sus números
-- Si alguna falla, aplicar el ROLLBACK y avisar: significa que hay una lectura
-- con anon que este análisis no encontró.

-- ============================================================================
-- ROLLBACK (deja todo como estaba, incluido el agujero)
-- ============================================================================
-- BEGIN;
-- GRANT ALL ON public.propiedades_v2 TO anon;
-- GRANT ALL ON public.propiedades_v2_shadow TO anon;
-- GRANT ALL ON SEQUENCE public.propiedades_v2_id_seq TO anon;
-- GRANT ALL ON SEQUENCE public.propiedades_v2_shadow_id_reservado_seq TO anon;
-- COMMIT;
