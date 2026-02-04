-- =============================================================================
-- Migración 127: Corregir campos_bloqueados corruptos
-- =============================================================================
-- Fase 1: Normalizar 6 registros con formato ARRAY → OBJETO
-- Fase 2: Agregar candados faltantes de propagación (4 propiedades Lofty Island)
-- Fase 3: Agregar constraint para prevenir futuros arrays
-- =============================================================================

BEGIN;

-- =========================================================================
-- FASE 1: Normalizar 6 propiedades con formato ARRAY
-- =========================================================================
-- IDs afectados: 166, 224, 231, 243, 255, 415
-- Causa: Migraciones 115/118 usaron || (concatenación) que creó arrays
-- Ejemplo: [{"amenities": true}, "banos"] → {"amenities": true, "banos": true}

UPDATE propiedades_v2
SET campos_bloqueados = (
  SELECT COALESCE(
    jsonb_object_agg(
      CASE
        -- Si es objeto {"campo": valor}, extraer la key
        WHEN jsonb_typeof(elem) = 'object' THEN
          (SELECT key FROM jsonb_object_keys(elem) key LIMIT 1)
        -- Si es string "campo", usar como key
        WHEN jsonb_typeof(elem) = 'string' THEN
          trim(both '"' from elem::text)
        ELSE NULL
      END,
      CASE
        -- Si es objeto, extraer el valor
        WHEN jsonb_typeof(elem) = 'object' THEN
          (SELECT value FROM jsonb_each(elem) LIMIT 1)
        -- Si es string, poner true
        WHEN jsonb_typeof(elem) = 'string' THEN
          'true'::jsonb
        ELSE 'true'::jsonb
      END
    ),
    '{}'::jsonb
  )
  FROM jsonb_array_elements(campos_bloqueados) elem
  WHERE jsonb_typeof(elem) IN ('object', 'string')
)
WHERE jsonb_typeof(campos_bloqueados) = 'array';

-- =========================================================================
-- FASE 2: Agregar candados faltantes de propagación Lofty Island
-- =========================================================================
-- IDs afectados: 282, 283, 284, 449
-- Causa: Bug en migración 126 - múltiples UPDATEs no guardaron candados

UPDATE propiedades_v2
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
  jsonb_build_object(
    'equipamiento', jsonb_build_object(
      'bloqueado', true,
      'fuente', 'propagacion_proyecto_fix',
      'proyecto_id', 2,
      'fecha', to_char(CURRENT_DATE, 'YYYY-MM-DD')
    )
  )
WHERE id IN (282, 283, 284, 449)
  AND (campos_bloqueados->'equipamiento' IS NULL
       OR jsonb_typeof(campos_bloqueados->'equipamiento') != 'object');

-- =========================================================================
-- FASE 3: Constraint para prevenir futuros arrays
-- =========================================================================

ALTER TABLE propiedades_v2
DROP CONSTRAINT IF EXISTS campos_bloqueados_debe_ser_objeto;

ALTER TABLE propiedades_v2
ADD CONSTRAINT campos_bloqueados_debe_ser_objeto
CHECK (campos_bloqueados IS NULL OR jsonb_typeof(campos_bloqueados) = 'object');

COMMIT;

-- =========================================================================
-- VERIFICACIÓN
-- =========================================================================

DO $$
DECLARE
  v_arrays INTEGER;
  v_faltantes INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_arrays FROM propiedades_v2
  WHERE jsonb_typeof(campos_bloqueados) = 'array';

  SELECT COUNT(*) INTO v_faltantes FROM propiedades_v2
  WHERE id IN (282, 283, 284, 449)
  AND campos_bloqueados->'equipamiento' IS NULL;

  IF v_arrays = 0 AND v_faltantes = 0 THEN
    RAISE NOTICE '✅ Migración 127 completada: Arrays corregidos, candados agregados, constraint activo';
  ELSE
    RAISE WARNING '⚠️ Migración 127 incompleta: Arrays restantes=%, Candados faltantes=%', v_arrays, v_faltantes;
  END IF;
END $$;
