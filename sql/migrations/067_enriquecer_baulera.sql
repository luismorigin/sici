-- =====================================================
-- MIGRACION 067: Enriquecer baulera desde descripciones
-- Fecha: 20 Enero 2026
-- Propósito: Crear columna baulera y extraer desde descripciones
-- =====================================================
-- SEGURIDAD: Nueva columna, merge no la toca
-- =====================================================
--
-- AUDITORÍA PREVIA:
-- - 48 propiedades mencionan "baulera" en descripción
-- - 32 potenciales después de filtrar ventas aparte
-- - ~10-15 con patrones positivos claros
--
-- PATRONES POSITIVOS:
-- - "parqueo y baulera", "baulera y parqueo"
-- - "incluye baulera", "con baulera"
-- - "1 baulera", "una baulera"
--
-- PATRONES EXCLUIDOS (venta aparte):
-- - "$X baulera", "baulera: $X", "Baulera: X$"
-- - "$X baulera y parqueo"
-- =====================================================

-- =====================================================
-- PASO 1: Crear columna baulera
-- =====================================================
ALTER TABLE propiedades_v2
ADD COLUMN IF NOT EXISTS baulera BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN propiedades_v2.baulera IS 'Indica si la propiedad incluye baulera. NULL=desconocido, true=incluida, false=no incluye';

-- =====================================================
-- PASO 2: Patrones positivos claros (parqueo y baulera, incluye baulera)
-- =====================================================
UPDATE propiedades_v2
SET baulera = true
WHERE status = 'completado'
  AND baulera IS NULL
  AND area_total_m2 >= 20
  AND lower(COALESCE(tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
  AND (
    datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+y\s+baulera'
    OR datos_json->'contenido'->>'descripcion' ~* 'baulera\s+y\s+parqueo'
    OR datos_json->'contenido'->>'descripcion' ~* 'incluye\s+baulera'
    OR datos_json->'contenido'->>'descripcion' ~* 'con\s+baulera'
    OR datos_json->'contenido'->>'descripcion' ~* 'baulera\s+incluida'
    OR datos_json->'contenido'->>'descripcion' ~* '(1|una)\s+baulera'
  )
  -- Excluir ventas aparte
  AND NOT datos_json->'contenido'->>'descripcion' ~* '\$[\d.,]+\s*(baulera|Baulera)'
  AND NOT datos_json->'contenido'->>'descripcion' ~* '(baulera|Baulera)\s*:\s*\$?\s*[\d.,]+'
  AND NOT datos_json->'contenido'->>'descripcion' ~* '(baulera|Baulera)\s*:\s*[\d.,]+\s*\$';

-- =====================================================
-- PASO 3: Registrar ejecución
-- =====================================================
INSERT INTO workflow_executions (
    workflow_name,
    workflow_version,
    started_at,
    finished_at,
    status,
    records_updated,
    metadata
) VALUES (
    'migracion_067_baulera',
    '1.0.0',
    NOW(),
    NOW(),
    'success',
    (SELECT COUNT(*) FROM propiedades_v2 WHERE baulera IS NOT NULL),
    jsonb_build_object(
        'descripcion', 'Crear columna baulera y enriquecer desde descripciones',
        'campo_creado', 'baulera',
        'tipo', 'BOOLEAN'
    )
);

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT 'Migración 067 - Verificación:' as status;

SELECT
    COUNT(*) as total_completadas,
    COUNT(baulera) as con_baulera_dato,
    COUNT(*) FILTER (WHERE baulera = true) as con_baulera_true,
    ROUND(100.0 * COUNT(*) FILTER (WHERE baulera = true) / COUNT(*), 1) as pct_con_baulera
FROM propiedades_v2
WHERE status = 'completado';
