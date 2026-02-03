-- ============================================
-- Migración 091: Permisos anon para Dashboard Salud
-- Fecha: 2026-01-29
-- Propósito: Permitir que el frontend lea datos para /admin/salud
-- ============================================

-- Problema detectado: El dashboard de salud no mostraba datos porque
-- el rol 'anon' no tenía permisos SELECT en las tablas necesarias.

-- 1. Permisos para workflow_executions (health check workflows)
GRANT SELECT ON workflow_executions TO anon;

-- 2. Permisos para matching_sugerencias (stats matching 24h, colas HITL)
GRANT SELECT ON matching_sugerencias TO anon;

-- 3. Permisos para config_global (TC paralelo/oficial)
GRANT SELECT ON config_global TO anon;

-- Verificación: Después de ejecutar, el dashboard /admin/salud debería mostrar:
-- - Health Check Workflows con estados verde/amarillo/rojo
-- - Stats de Matching (sugerencias 24h, aprobadas, rechazadas)
-- - Tipo de Cambio actual (paralelo y oficial)

-- ============================================
-- FIN MIGRACIÓN 091
-- ============================================
