-- =============================================================================
-- 291 · FIX de permisos de la vista creada en la 290
-- =============================================================================
-- 🔴 Mismo error que la 283→284, ahora en una VISTA.
--
-- La 290 revocó los default privileges sobre la TABLA y su SECUENCIA, pero NO
-- sobre la vista `v_mkt_clicks_por_pieza`. Los DEFAULT PRIVILEGES del schema
-- `public` alcanzan también a las vistas → nació con anon/authenticated en ALL.
--
-- Por qué eso SÍ expone datos, aunque anon no tenga permiso sobre la tabla:
-- una vista sin `security_invoker` se ejecuta con los privilegios de su DUEÑO
-- (postgres) para leer las tablas base. Verificado en la BD:
--     has_table_privilege('anon','v_mkt_clicks_por_pieza','SELECT') = true
--     has_table_privilege('anon','mkt_clicks_puente','SELECT')      = false
-- ⇒ cualquiera con la anon key (que viaja en el bundle del frontend, es pública)
-- podía leer qué piezas de marketing funcionan y cuántos clicks trajo cada una.
-- No es PII, pero es información interna de negocio y no tiene por qué salir.
--
-- Lección para la próxima: el REVOKE va sobre TODO objeto nuevo en `public`
-- —tabla, secuencia Y vista—, no solo sobre la tabla. Se agregó al `_template.sql`.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

REVOKE ALL ON public.v_mkt_clicks_por_pieza FROM anon, authenticated;

-- Los que sí deben leerla (idempotente, ya estaban en la 290)
GRANT SELECT ON public.v_mkt_clicks_por_pieza TO service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación post-aplicación
-- -----------------------------------------------------------------------------
-- SELECT has_table_privilege('anon','public.v_mkt_clicks_por_pieza','SELECT');
--   → debe dar FALSE
-- SELECT relacl::text FROM pg_class WHERE relname = 'v_mkt_clicks_por_pieza';
--   → NO debe aparecer anon ni authenticated
