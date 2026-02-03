-- ============================================================================
-- MIGRACIÓN 115: Agregar candados a propiedades editadas manualmente
-- ============================================================================
-- Fecha: 3 Febrero 2026
-- Propósito: Proteger ediciones manuales del merge nocturno
-- Campos protegidos: equipamiento, amenities, precio_usd, estado_construccion
-- ============================================================================

-- Paso 1: Agregar candado 'equipamiento' a propiedades editadas
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
    jsonb_build_object('equipamiento', jsonb_build_object(
        'bloqueado', true,
        'fecha', NOW(),
        'motivo', 'edicion_manual_admin'
    ))
WHERE p.id IN (
    SELECT DISTINCT propiedad_id
    FROM propiedades_v2_historial
    WHERE campo = 'equipamiento'
)
AND (
    campos_bloqueados IS NULL
    OR NOT campos_bloqueados ? 'equipamiento'
);

-- Paso 2: Agregar candado 'amenities' a propiedades editadas
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
    jsonb_build_object('amenities', jsonb_build_object(
        'bloqueado', true,
        'fecha', NOW(),
        'motivo', 'edicion_manual_admin'
    ))
WHERE p.id IN (
    SELECT DISTINCT propiedad_id
    FROM propiedades_v2_historial
    WHERE campo = 'amenities'
)
AND (
    campos_bloqueados IS NULL
    OR NOT campos_bloqueados ? 'amenities'
);

-- Paso 3: Agregar candado 'precio_usd' a propiedades editadas (si no tienen)
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
    jsonb_build_object('precio_usd', jsonb_build_object(
        'bloqueado', true,
        'fecha', NOW(),
        'motivo', 'edicion_manual_admin'
    ))
WHERE p.id IN (
    SELECT DISTINCT propiedad_id
    FROM propiedades_v2_historial
    WHERE campo = 'precio_usd'
)
AND (
    campos_bloqueados IS NULL
    OR NOT campos_bloqueados ? 'precio_usd'
);

-- Paso 4: Agregar candado 'estado_construccion' a propiedades editadas
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
    jsonb_build_object('estado_construccion', jsonb_build_object(
        'bloqueado', true,
        'fecha', NOW(),
        'motivo', 'edicion_manual_admin'
    ))
WHERE p.id IN (
    SELECT DISTINCT propiedad_id
    FROM propiedades_v2_historial
    WHERE campo = 'estado_construccion'
)
AND (
    campos_bloqueados IS NULL
    OR NOT campos_bloqueados ? 'estado_construccion'
);

-- Verificación
SELECT
    'Candados agregados' as resultado,
    COUNT(*) FILTER (WHERE campos_bloqueados ? 'equipamiento') as con_candado_equipamiento,
    COUNT(*) FILTER (WHERE campos_bloqueados ? 'amenities') as con_candado_amenities,
    COUNT(*) FILTER (WHERE campos_bloqueados ? 'precio_usd') as con_candado_precio,
    COUNT(*) FILTER (WHERE campos_bloqueados ? 'estado_construccion') as con_candado_estado
FROM propiedades_v2
WHERE es_activa = true;
