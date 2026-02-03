-- =====================================================
-- Migración 020: Fix permisos leads_mvp para anon
-- =====================================================
-- Fecha: 2026-01-07
-- Problema: RLS policy existe pero falta GRANT INSERT
-- =====================================================

-- Dar permiso INSERT al rol anon
GRANT INSERT ON leads_mvp TO anon;

-- Sequence para autoincrement
GRANT USAGE ON SEQUENCE leads_mvp_id_seq TO anon;

-- Verificar permisos
SELECT grantee, privilege_type
FROM information_schema.table_privileges
WHERE table_name = 'leads_mvp';
