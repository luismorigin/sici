-- Migración 225: Rename de 9 tablas backup a prefijo _trash_
--
-- Contexto: Supabase linter flag rls_disabled_in_public en 9 tablas que son
-- snapshots pre-migración (ventana de rollback ya expirada: 3-6 meses).
--
-- Estrategia de borrado en 2 etapas:
--   1. (ESTA MIGRACIÓN) Rename a _trash_ — si algo rompe, ruidoso en logs
--   2. (En 7 días, si nada rompió) DROP TABLE definitivo
--
-- Evidencia que respalda el borrado:
--   - grep código: 0 referencias en frontend/API/n8n/scripts (solo migraciones históricas)
--   - pg_stat_user_tables: 0 lecturas en últimos 11 días (último scan 11 abr = backup automatizado)
--   - pg_depend: 0 views/triggers/functions dependientes
--
-- Rollback: ALTER TABLE _trash_<nombre> RENAME TO <nombre>;

ALTER TABLE public._backup_multiproyecto_060 RENAME TO _trash_backup_multiproyecto_060;
ALTER TABLE public.propiedades_backup_20251020 RENAME TO _trash_propiedades_backup_20251020;
ALTER TABLE public.propiedades_v2_backup_20260104 RENAME TO _trash_propiedades_v2_backup_20260104;
ALTER TABLE public.propiedades_v2_backup_20260108 RENAME TO _trash_propiedades_v2_backup_20260108;
ALTER TABLE public.proyectos_master_backup_20260104 RENAME TO _trash_proyectos_master_backup_20260104;
ALTER TABLE public.proyectos_master_backup_20260108 RENAME TO _trash_proyectos_master_backup_20260108;
ALTER TABLE public.proyectos_master_backup_20260108_dev RENAME TO _trash_proyectos_master_backup_20260108_dev;
ALTER TABLE public.matching_sugerencias_backup_20260104 RENAME TO _trash_matching_sugerencias_backup_20260104;
ALTER TABLE public.fix_tc_paralelo_audit_20260114 RENAME TO _trash_fix_tc_paralelo_audit_20260114;

-- Verificación post-aplicación:
--   SELECT relname FROM pg_class WHERE relname LIKE '_trash_%' AND relnamespace = 'public'::regnamespace;
--   -- debe listar las 9 tablas renombradas
