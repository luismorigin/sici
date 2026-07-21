-- =============================================================================
-- 284 · FIX de grants — cerrar `anon` en market_absorption_snapshots_shadow
-- =============================================================================
-- 🔴 QUÉ PASÓ: al aplicar la mig 283, Supabase otorgó automáticamente ALL
-- (INSERT/UPDATE/DELETE/TRUNCATE) a `anon` y `authenticated` sobre la tabla
-- nueva — vía DEFAULT PRIVILEGES del schema public. Los GRANT explícitos de la
-- 283 (Preset D: service_role + claude_readonly) SUMARON permisos pero no
-- quitaron los heredados.
--
-- Verificado post-283:
--   shadow  → anon=arwdDxtm  (ALL — el browser podría escribir/borrar la serie)
--   prod    → anon=rm        (solo lectura; así debe quedar la nueva)
--
-- Es una tabla OPERACIONAL INTERNA (Preset D de _template.sql): nadie la lee
-- desde el browser. La escribe el cron con service_role.
--
-- ⚠️ LECCIÓN (hueco del template): `sql/migrations/_template.sql` documenta los
-- GRANT pero NO advierte que hay que REVOCAR los default privileges. Toda tabla
-- nueva en `public` nace con anon/authenticated en ALL. Ver SEGURIDAD_SUPABASE.md.
-- =============================================================================

BEGIN;

REVOKE ALL ON public.market_absorption_snapshots_shadow FROM anon;
REVOKE ALL ON public.market_absorption_snapshots_shadow FROM authenticated;

-- La secuencia del BIGSERIAL hereda el mismo problema
REVOKE ALL ON SEQUENCE public.market_absorption_snapshots_shadow_id_seq FROM anon;
REVOKE ALL ON SEQUENCE public.market_absorption_snapshots_shadow_id_seq FROM authenticated;

-- Re-afirmar lo que SÍ corresponde (Preset D)
GRANT ALL    ON public.market_absorption_snapshots_shadow TO service_role;
GRANT SELECT ON public.market_absorption_snapshots_shadow TO claude_readonly;
GRANT USAGE, SELECT ON SEQUENCE public.market_absorption_snapshots_shadow_id_seq TO service_role;

COMMIT;

-- Verificación (debe dar anon/authenticated ausentes o sin privilegios):
--   SELECT relacl::text FROM pg_class WHERE relname='market_absorption_snapshots_shadow';
