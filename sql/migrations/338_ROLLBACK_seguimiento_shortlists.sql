-- =============================================================================
-- 338 · ROLLBACK — apagar el seguimiento automático de shortlists
-- =============================================================================
-- 🔑 SI HAY QUE FRENARLO YA, alcanza con la primera línea. Lo demás es limpieza y
-- puede esperar: sin el job agendado, nada se dispara.
--
--     SELECT cron.unschedule('seguimiento-shortlists');
--
-- Las COLUMNAS no se borran: `seguimiento_enviado_at` es el registro de a quién ya
-- se le escribió. Si se borran y el job se vuelve a encender, esas personas
-- reciben un segundo mensaje. Quedan, no molestan a nadie.
-- =============================================================================

-- 1 · Frenar (lo único urgente)
SELECT cron.unschedule('seguimiento-shortlists');

-- 2 · Limpieza (opcional, y sólo si se descarta el proyecto entero)
BEGIN;

DROP FUNCTION IF EXISTS public.disparar_seguimiento_shortlists(integer, integer);
DROP FUNCTION IF EXISTS public.marcar_seguimiento_shortlist(text, boolean);
DROP FUNCTION IF EXISTS public.shortlists_para_seguimiento();
DROP INDEX IF EXISTS public.idx_shortlists_seguimiento_pendiente;

-- ⚠️ Las columnas se dejan A PROPÓSITO (ver cabecera). Para borrarlas de verdad,
-- descomentar — y asumir que si el job vuelve, esas personas reciben otro mensaje:
-- ALTER TABLE broker_shortlists
--   DROP COLUMN IF EXISTS seguimiento_enviado_at,
--   DROP COLUMN IF EXISTS seguimiento_intentado_at;

COMMIT;

-- 3 · El secreto, sólo si se descarta el proyecto
-- DELETE FROM vault.secrets WHERE name = 'seguimiento_cron_token';
