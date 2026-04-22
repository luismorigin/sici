-- Migración 224: Habilitar RLS en leads_alquiler
--
-- Contexto: Supabase linter flag crítico (sensitive_columns_exposed + rls_disabled_in_public).
-- La tabla contiene PII (teléfonos, session_id, WhatsApp brokers) y estaba accesible vía anon key.
--
-- Cambios:
--   1. Enable RLS en leads_alquiler
--   2. Policy explícita para claude_readonly (scripts de reporte, /metrics)
--   3. service_role bypassea automáticamente (no requiere policy)
--   4. anon key: sin policy = sin acceso (comportamiento deseado)
--
-- Precondición ANTES de aplicar esta migración:
--   - api/lead-alquiler.ts DEBE estar ya deployado usando SUPABASE_SERVICE_ROLE_KEY.
--   - De lo contrario, el funnel de leads se rompe.
--
-- Rollback: ALTER TABLE leads_alquiler DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.leads_alquiler ENABLE ROW LEVEL SECURITY;

-- Permitir SELECT a claude_readonly (usado por scripts/check_ga4_metrics.py, comando /metrics)
CREATE POLICY leads_alquiler_claude_readonly_select
  ON public.leads_alquiler
  FOR SELECT
  TO claude_readonly
  USING (true);

-- Verificación post-aplicación:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'leads_alquiler';
--   -- relrowsecurity debe ser 't'
--
--   SELECT polname FROM pg_policy WHERE polrelid = 'public.leads_alquiler'::regclass;
--   -- debe listar 'leads_alquiler_claude_readonly_select'
