-- Migración 248: DROP definitivo de 9 tablas backup _trash_*
--
-- Contexto: la migración 225 (22 abr 2026) renombró 9 backups huérfanos a prefijo
--           _trash_* como paso REVERSIBLE previo al DROP, programado para el 29 abr 2026.
--
-- Verificación pre-DROP (22 may 2026, 23 días después de lo programado):
--   - pg_depend: 0 dependencias en las 9 tablas.
--   - pg_stat_user_tables: último seq_scan de TODAS = 11 abr 2026 (scan masivo
--     automático — todas en segundos consecutivos, típico de pg_dump/backup —,
--     ANTERIOR al rename del 22 abr). Cero accesos desde el rename → ~1 mes sin uso.
--   - grep en simon-mvp/src, scripts/, n8n/workflows: cero referencias en código
--     vivo (las tablas solo aparecen en docs y en las migraciones históricas que
--     las crearon: 016, 059, 060, 095, 225).
--
-- Efecto: cierra 9 warnings `rls_disabled_in_public` del linter Supabase.
--
-- Rollback: no aplica (eran backups). Si se necesitara recuperar alguno, los datos
--           viven en los backups automáticos de Supabase (PITR / daily backups).

DROP TABLE IF EXISTS public._trash_backup_multiproyecto_060;
DROP TABLE IF EXISTS public._trash_propiedades_backup_20251020;
DROP TABLE IF EXISTS public._trash_propiedades_v2_backup_20260104;
DROP TABLE IF EXISTS public._trash_propiedades_v2_backup_20260108;
DROP TABLE IF EXISTS public._trash_proyectos_master_backup_20260104;
DROP TABLE IF EXISTS public._trash_proyectos_master_backup_20260108;
DROP TABLE IF EXISTS public._trash_proyectos_master_backup_20260108_dev;
DROP TABLE IF EXISTS public._trash_matching_sugerencias_backup_20260104;
DROP TABLE IF EXISTS public._trash_fix_tc_paralelo_audit_20260114;

-- Verificación post-DROP (correr tras aplicar — debe devolver 0):
-- SELECT COUNT(*) FROM pg_class c
--   JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public' AND c.relname LIKE '\_trash\_%';
