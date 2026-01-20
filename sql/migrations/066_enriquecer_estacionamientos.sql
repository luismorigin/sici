-- =====================================================
-- MIGRACION 066: Enriquecer estacionamientos desde descripciones
-- Fecha: 20 Enero 2026
-- Propósito: Extraer cantidad de parqueos desde texto de descripciones
-- =====================================================
-- SEGURIDAD: Solo modifica columna `estacionamientos`
-- El merge la preserva porque enrichment tiene "sin_confirmar" (texto)
-- que el merge ignora (solo acepta números)
-- =====================================================
--
-- AUDITORÍA PREVIA (verificada con queries):
-- - Columna estacionamientos: solo 11.6% con datos (38/328)
-- - Patrón "1-4 parqueos": 12 a enriquecer
-- - Patrón "incluye parqueo": 4 adicionales
-- - Patrón "parqueo propio/y baulera/\n": 5 adicionales (incluyendo emojis)
-- - Total estimado: 38 + 21 = ~59 propiedades (18%)
--
-- PATRONES POSITIVOS:
-- - "1 parqueo", "2 parqueos" (N=1-4, no precedido de otro dígito)
-- - "incluye parqueo", "con parqueo", "parqueo incluido"
-- - "parqueo propio", "parqueo y baulera", "Parqueo," "Parqueo\n"
-- - "parqueo para dos" = 2 parqueos
--
-- PATRONES EXCLUIDOS (venta aparte):
-- - "sin parqueo", "parqueo opcional", "parqueo desde $"
-- - "$X parqueo", "precio de parqueo"
-- =====================================================

-- =====================================================
-- PASO 1: Extraer "N parqueo(s)" donde N es 1-4
-- Regex mejorado: evita capturar "37 parqueos" o "707\nParqueo"
-- =====================================================
UPDATE propiedades_v2
SET estacionamientos = (
    SELECT (regexp_matches(
        datos_json->'contenido'->>'descripcion',
        '(^|[^0-9])([1-4])\s*parqueos?',
        'i'
    ))[2]::INTEGER
)
WHERE status = 'completado'
  AND estacionamientos IS NULL
  AND datos_json->'contenido'->>'descripcion' ~* '(^|[^0-9])[1-4]\s*parqueos?';

-- =====================================================
-- PASO 2: "incluye parqueo" sin número = asumir 1
-- =====================================================
UPDATE propiedades_v2
SET estacionamientos = 1
WHERE status = 'completado'
  AND estacionamientos IS NULL
  AND (
    datos_json->'contenido'->>'descripcion' ~* 'incluye\s+parqueo'
    OR datos_json->'contenido'->>'descripcion' ~* 'incluye\s+garaje'
    OR datos_json->'contenido'->>'descripcion' ~* 'con\s+parqueo'
    OR datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+incluido'
  );

-- =====================================================
-- PASO 3: "parqueo para dos" = 2 parqueos
-- =====================================================
UPDATE propiedades_v2
SET estacionamientos = 2
WHERE status = 'completado'
  AND estacionamientos IS NULL
  AND datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+para\s+(dos|2)';

-- =====================================================
-- PASO 4: Patrones adicionales (parqueo propio, y baulera, \n)
-- Con exclusiones de venta aparte
-- =====================================================
UPDATE propiedades_v2
SET estacionamientos = 1
WHERE status = 'completado'
  AND estacionamientos IS NULL
  AND area_total_m2 >= 20
  AND lower(COALESCE(tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
  AND datos_json->'contenido'->>'descripcion' ILIKE '%parqueo%'
  -- Patrones positivos
  AND (
    datos_json->'contenido'->>'descripcion' ~* 'parqueo\s*,'
    OR datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+y\s+baulera'
    OR datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+propio'
    OR datos_json->'contenido'->>'descripcion' ~* 'parqueo\s*[\r\n]'
  )
  -- Excluir patrones de venta aparte
  AND NOT datos_json->'contenido'->>'descripcion' ~* 'sin\s+parqueo'
  AND NOT datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+opcional'
  AND NOT datos_json->'contenido'->>'descripcion' ~* 'parqueo\s+desde'
  AND NOT datos_json->'contenido'->>'descripcion' ~* 'precio\s+(de\s+)?parqueo'
  AND NOT datos_json->'contenido'->>'descripcion' ~* '\$[\d.,]+\s*(baulera\s+y\s+)?parqueo';

-- =====================================================
-- PASO 5: Registrar ejecución
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
    'migracion_066_estacionamientos',
    '1.0.0',
    NOW(),
    NOW(),
    'success',
    (SELECT COUNT(*) FROM propiedades_v2 WHERE estacionamientos IS NOT NULL),
    jsonb_build_object(
        'descripcion', 'Enriquecer estacionamientos desde descripciones',
        'campo_actualizado', 'estacionamientos',
        'antes', 38,
        'esperado', 59
    )
);

-- =====================================================
-- VERIFICACION
-- =====================================================
SELECT 'Migración 066 - Verificación:' as status;

-- Antes: 38 con estacionamientos (11.6%)
-- Después: ~59 propiedades (18%)
SELECT
    COUNT(*) as total_completadas,
    COUNT(estacionamientos) as con_estacionamientos,
    ROUND(100.0 * COUNT(estacionamientos) / COUNT(*), 1) as pct_estacionamientos
FROM propiedades_v2
WHERE status = 'completado';

-- Distribución de valores
SELECT 'Distribución de estacionamientos:' as distribucion;
SELECT
    estacionamientos,
    COUNT(*) as cantidad
FROM propiedades_v2
WHERE status = 'completado'
  AND estacionamientos IS NOT NULL
GROUP BY estacionamientos
ORDER BY estacionamientos;
