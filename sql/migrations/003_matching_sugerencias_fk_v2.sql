-- =============================================================================
-- MIGRACION: 003_matching_sugerencias_fk_v2.sql
-- DESCRIPCION: Actualizar FK de matching_sugerencias para apuntar a propiedades_v2
-- VERSION: 1.0.0
-- FECHA: 26 Diciembre 2025
-- =============================================================================
-- CONTEXTO:
--   - matching_sugerencias.propiedad_id apuntaba a propiedades (legacy)
--   - Necesita apuntar a propiedades_v2 para el Modulo 2 Matching
-- =============================================================================
-- PREREQUISITOS:
--   - Backup de matching_sugerencias (si tiene datos importantes)
--   - propiedades_v2 debe existir y tener datos
-- =============================================================================

-- PASO 1: Ver cuantos registros seran eliminados (informativo)
-- SELECT COUNT(*) as registros_a_eliminar
-- FROM matching_sugerencias
-- WHERE propiedad_id NOT IN (SELECT id FROM propiedades_v2);

-- PASO 2: Limpiar registros huerfanos (IDs que no existen en propiedades_v2)
DELETE FROM matching_sugerencias
WHERE propiedad_id NOT IN (SELECT id FROM propiedades_v2);

-- PASO 3: Eliminar FK viejo que apunta a propiedades (legacy)
ALTER TABLE matching_sugerencias
DROP CONSTRAINT IF EXISTS matching_sugerencias_propiedad_id_fkey;

-- PASO 4: Crear FK nuevo apuntando a propiedades_v2
ALTER TABLE matching_sugerencias
ADD CONSTRAINT matching_sugerencias_propiedad_id_fkey
FOREIGN KEY (propiedad_id) REFERENCES propiedades_v2(id)
ON DELETE CASCADE;

-- PASO 5: Verificar que el FK se creo correctamente
-- SELECT
--     tc.constraint_name,
--     kcu.column_name,
--     ccu.table_name AS foreign_table_name,
--     ccu.column_name AS foreign_column_name
-- FROM information_schema.table_constraints AS tc
-- JOIN information_schema.key_column_usage AS kcu
--     ON tc.constraint_name = kcu.constraint_name
-- JOIN information_schema.constraint_column_usage AS ccu
--     ON ccu.constraint_name = tc.constraint_name
-- WHERE tc.table_name = 'matching_sugerencias'
--   AND tc.constraint_type = 'FOREIGN KEY';

-- =============================================================================
-- RESULTADO ESPERADO:
--   - FK matching_sugerencias_propiedad_id_fkey -> propiedades_v2(id)
--   - Registros huerfanos eliminados
--   - ON DELETE CASCADE para limpieza automatica
-- =============================================================================
