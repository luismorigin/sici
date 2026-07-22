-- =============================================================================
-- TEMPLATE de migración SICI
-- =============================================================================
-- USO: copiar este archivo como NNN_descripcion_corta.sql donde NNN es el
--   siguiente número correlativo (revisar `ls sql/migrations | sort -V | tail`).
--
-- ⚠️  CAMBIO IMPORTANTE — DATA API DE SUPABASE
-- A partir del 30-OCT-2026 las tablas nuevas en `public` NO se exponen
-- automáticamente a la Data API (PostgREST / supabase-js). Por eso TODA tabla
-- nueva requiere bloque de GRANT explícito (sección 2 de este template).
-- Ref: docs/canonical/SEGURIDAD_SUPABASE.md (Regla 6)
--
-- Cómo usar:
--   1. Borrar los bloques que NO apliques (no es obligatorio crear tabla + RPC
--      + view en la misma migración).
--   2. Reemplazar `MI_TABLA`, `MI_FUNCION`, `V_MI_VISTA` por nombres reales.
--   3. Ajustar la matriz de GRANTs según el tipo de tabla (ver tabla abajo).
--   4. Aplicar la migración vía Supabase UI o psql (NO desde MCP — es readonly).
--   5. Registrar en `docs/migrations/MIGRATION_INDEX.md`.
--
-- Matriz de GRANTs por tipo (de la Regla 6 de SEGURIDAD_SUPABASE.md):
--   - Data pública (props, proyectos, vistas mercado):
--       anon SELECT · auth SELECT · service_role ALL · claude_readonly SELECT
--   - Lookup / catálogo (zonas_mapeo, tipo_propiedad_mapeo):
--       anon SELECT · auth SELECT · service_role ALL · claude_readonly SELECT
--   - PII / leads (leads_*, gate):
--       anon INSERT · service_role ALL · claude_readonly SELECT
--   - Operacional interna (workflow_executions, snapshots):
--       service_role ALL · claude_readonly SELECT
--   - Solo pipeline (escribe postgres/n8n):
--       claude_readonly SELECT (nada más)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. CREATE TABLE (si aplica)
-- -----------------------------------------------------------------------------
-- CREATE TABLE IF NOT EXISTS public.MI_TABLA (
--   id BIGSERIAL PRIMARY KEY,
--   creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   actualizado_en TIMESTAMPTZ
--   -- ... columnas
-- );
--
-- COMMENT ON TABLE public.MI_TABLA IS
--   'Propósito + dueño del dato + consumers. Creada en migración NNN.';
--
-- -- Índices que el caso de uso justifique
-- -- CREATE INDEX IF NOT EXISTS MI_TABLA_idx_creado_en ON public.MI_TABLA(creado_en DESC);


-- -----------------------------------------------------------------------------
-- 2. 🔑 GRANTS EXPLÍCITOS — obligatorio para tablas nuevas (Regla 6)
-- -----------------------------------------------------------------------------
-- Elegir UNO de los presets de abajo (descomentar el que corresponda) y borrar
-- los otros. Si la tabla NO encaja en ninguno, escribir los grants a mano y
-- documentar el "por qué" en el COMMENT de la tabla.
--
-- 🔴 PRIMERO REVOCAR (aprendido en la mig 283→284, 21-jul-2026): toda tabla
-- nueva en `public` nace con `anon` y `authenticated` en **ALL** por los DEFAULT
-- PRIVILEGES del schema. Los GRANT de abajo SUMAN permisos, NO quitan los
-- heredados → sin este REVOKE, una tabla interna queda escribible desde el
-- browser con la anon key. Obligatorio salvo Preset A (data pública):
-- REVOKE ALL ON public.MI_TABLA FROM anon, authenticated;
-- REVOKE ALL ON SEQUENCE public.MI_TABLA_id_seq FROM anon, authenticated;  -- si hay BIGSERIAL
-- REVOKE ALL ON public.V_MI_VISTA FROM anon, authenticated;                -- si creás vistas
--
-- ⚠️ EL REVOKE VA SOBRE **TODO** OBJETO NUEVO, NO SOLO LA TABLA (mig 290→291,
-- 22-jul-2026): la 290 revocó tabla + secuencia pero se olvidó de la VISTA, y la
-- vista quedó legible por anon. Y una vista **igual expone los datos aunque anon
-- no tenga permiso sobre la tabla base**: sin `security_invoker` se ejecuta con
-- los privilegios de su DUEÑO. Chequeo que lo delata (más confiable que leer relacl):
--   SELECT has_table_privilege('anon','public.V_MI_VISTA','SELECT');  -- debe dar FALSE
-- Verificar después: SELECT relacl::text FROM pg_class WHERE relname='MI_TABLA';

-- Preset A — Data pública (propiedades, proyectos, vistas mercado)
-- GRANT SELECT                         ON public.MI_TABLA TO anon;
-- GRANT SELECT                         ON public.MI_TABLA TO authenticated;
-- GRANT ALL                            ON public.MI_TABLA TO service_role;
-- GRANT SELECT                         ON public.MI_TABLA TO claude_readonly;

-- Preset B — Lookup / catálogo (lectura libre, sin escritura desde Data API)
-- GRANT SELECT                         ON public.MI_TABLA TO anon, authenticated, claude_readonly;
-- GRANT ALL                            ON public.MI_TABLA TO service_role;

-- Preset C — PII / leads (anon SOLO inserta, nadie lee desde browser)
-- GRANT INSERT                         ON public.MI_TABLA TO anon;
-- GRANT ALL                            ON public.MI_TABLA TO service_role;
-- GRANT SELECT                         ON public.MI_TABLA TO claude_readonly;
-- -- Si usás SERIAL/BIGSERIAL para id, anon también necesita USAGE en la secuencia:
-- -- GRANT USAGE, SELECT ON SEQUENCE public.MI_TABLA_id_seq TO anon;

-- Preset D — Operacional interna (sin acceso desde browser)
-- GRANT ALL                            ON public.MI_TABLA TO service_role;
-- GRANT SELECT                         ON public.MI_TABLA TO claude_readonly;

-- Preset E — Solo pipeline (n8n/postgres owner — nadie más toca esto)
-- GRANT SELECT                         ON public.MI_TABLA TO claude_readonly;


-- -----------------------------------------------------------------------------
-- 3. RLS (opcional — habilitar SOLO si la lógica de acceso lo requiere)
-- -----------------------------------------------------------------------------
-- ⚠️  Antes de habilitar RLS leer Regla 2 de SEGURIDAD_SUPABASE.md
-- (grep + pg_stat_user_tables + pg_depend). Las policies van en el MISMO
-- bloque que el ENABLE para no dejar la tabla colgada.

-- ALTER TABLE public.MI_TABLA ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY MI_TABLA_select_anon ON public.MI_TABLA
--   FOR SELECT TO anon USING (true);

-- CREATE POLICY MI_TABLA_claude_read ON public.MI_TABLA
--   FOR SELECT TO claude_readonly USING (true);

-- service_role bypassea RLS automáticamente — no requiere policy.


-- -----------------------------------------------------------------------------
-- 4. FUNCIÓN RPC (si aplica) — Regla 5
-- -----------------------------------------------------------------------------
-- CREATE OR REPLACE FUNCTION public.MI_FUNCION(p_id INTEGER)
-- RETURNS TABLE(...)
-- LANGUAGE plpgsql
-- -- SIN "SECURITY DEFINER" → corre como INVOKER (respeta RLS del caller)
-- AS $$
-- BEGIN
--   -- lógica
-- END;
-- $$;
--
-- -- GRANT EXECUTE explícito a los roles que la llaman
-- GRANT EXECUTE ON FUNCTION public.MI_FUNCION(INTEGER)
--   TO anon, authenticated, service_role;
--
-- COMMENT ON FUNCTION public.MI_FUNCION(INTEGER) IS
--   'Qué hace · qué tablas lee · quién la consume · migración de origen NNN';


-- -----------------------------------------------------------------------------
-- 5. VIEW (si aplica) — Regla 4
-- -----------------------------------------------------------------------------
-- -- Postgres 15+ crea views como SECURITY INVOKER por default. MANTENERLO.
-- -- NO usar `WITH (security_invoker = off)`.
-- CREATE OR REPLACE VIEW public.V_MI_VISTA AS
-- SELECT ...
-- FROM public.MI_TABLA
-- WHERE ...;
--
-- -- Las views también necesitan grants explícitos a partir de oct-2026:
-- GRANT SELECT ON public.V_MI_VISTA TO anon, authenticated, service_role, claude_readonly;
--
-- COMMENT ON VIEW public.V_MI_VISTA IS
--   'Qué expone · filtros aplicados · consumers · migración NNN.';


-- -----------------------------------------------------------------------------
-- 6. ROLLBACK (documentar siempre, aunque sea en comentario)
-- -----------------------------------------------------------------------------
-- DROP TABLE/FUNCTION/VIEW debe pasar por el patrón `_trash_*` (Regla 3).
-- Rollback inmediato de los GRANTs:
--   REVOKE ALL ON public.MI_TABLA FROM anon, authenticated, claude_readonly;
--   REVOKE ALL ON FUNCTION public.MI_FUNCION(INTEGER) FROM anon, authenticated;

COMMIT;
