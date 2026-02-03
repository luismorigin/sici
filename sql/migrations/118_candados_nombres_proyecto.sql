-- ============================================================================
-- MIGRACIÓN 118: Candados para nombres de edificio y proyecto editados
-- ============================================================================
-- Fecha: 3 Febrero 2026
-- Propósito: Proteger ediciones manuales de nombre_edificio e id_proyecto_master
-- ============================================================================

-- Paso 1: Candado 'nombre_edificio' (3 propiedades según historial)
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
    jsonb_build_object('nombre_edificio', jsonb_build_object(
        'bloqueado', true,
        'fecha', NOW(),
        'motivo', 'edicion_manual_admin_retroactivo'
    ))
WHERE p.id IN (
    SELECT DISTINCT propiedad_id FROM propiedades_v2_historial WHERE campo = 'nombre_edificio'
)
AND (campos_bloqueados IS NULL OR NOT campos_bloqueados ? 'nombre_edificio');

-- Paso 2: Candado 'id_proyecto_master' (22 propiedades según historial)
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
    jsonb_build_object('id_proyecto_master', jsonb_build_object(
        'bloqueado', true,
        'fecha', NOW(),
        'motivo', 'edicion_manual_admin_retroactivo'
    ))
WHERE p.id IN (
    SELECT DISTINCT propiedad_id FROM propiedades_v2_historial WHERE campo = 'id_proyecto_master'
)
AND (campos_bloqueados IS NULL OR NOT campos_bloqueados ? 'id_proyecto_master');

-- Verificación
SELECT
    'Candados nombres/proyecto' as operacion,
    COUNT(*) FILTER (WHERE campos_bloqueados ? 'nombre_edificio') as con_candado_nombre,
    COUNT(*) FILTER (WHERE campos_bloqueados ? 'id_proyecto_master') as con_candado_proyecto
FROM propiedades_v2
WHERE es_activa = true;
