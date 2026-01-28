-- ============================================================================
-- MIGRACIÓN 083: Parqueo y Baulera con Precio Adicional
-- ============================================================================
-- Fecha: 2026-01-28
-- Propósito: Agregar campos para indicar si parqueo/baulera están incluidos
--            en el precio o tienen costo adicional
-- Impacto: Retrocompatible (NULL default)
-- ============================================================================

-- Parqueo: incluido en precio o adicional
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS parqueo_incluido BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS parqueo_precio_adicional NUMERIC(12,2);

-- Baulera: incluida en precio o adicional
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS baulera_incluido BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS baulera_precio_adicional NUMERIC(12,2);

-- Comentarios descriptivos
COMMENT ON COLUMN propiedades_v2.parqueo_incluido IS 'true=incluido en precio, false=precio aparte, NULL=sin confirmar';
COMMENT ON COLUMN propiedades_v2.parqueo_precio_adicional IS 'Precio USD por cada parqueo si no está incluido';
COMMENT ON COLUMN propiedades_v2.baulera_incluido IS 'true=incluida en precio, false=precio aparte, NULL=sin confirmar';
COMMENT ON COLUMN propiedades_v2.baulera_precio_adicional IS 'Precio USD de la baulera si no está incluida';

-- ============================================================================
-- Verificación
-- ============================================================================
DO $$
DECLARE
  v_nuevas_cols INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_nuevas_cols
  FROM information_schema.columns
  WHERE table_name = 'propiedades_v2'
    AND column_name IN ('parqueo_incluido', 'parqueo_precio_adicional',
                        'baulera_incluido', 'baulera_precio_adicional');

  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRACIÓN 083: Parqueo y Baulera con Precio Adicional';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 Columnas agregadas: %/4', v_nuevas_cols;
  RAISE NOTICE '';
  RAISE NOTICE '📊 Nuevas columnas:';
  RAISE NOTICE '   - parqueo_incluido (BOOLEAN): ¿Incluido en precio?';
  RAISE NOTICE '   - parqueo_precio_adicional (NUMERIC): USD por parqueo';
  RAISE NOTICE '   - baulera_incluido (BOOLEAN): ¿Incluida en precio?';
  RAISE NOTICE '   - baulera_precio_adicional (NUMERIC): USD por baulera';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Lógica:';
  RAISE NOTICE '   - NULL = sin confirmar (mostrar ?)';
  RAISE NOTICE '   - true = incluido en el precio del depto';
  RAISE NOTICE '   - false = precio adicional (ver campo _precio_adicional)';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

-- ============================================================================
-- QUERIES DE VERIFICACIÓN (ejecutar manualmente)
-- ============================================================================
/*
-- Ver columnas agregadas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'propiedades_v2'
  AND column_name IN ('parqueo_incluido', 'parqueo_precio_adicional',
                      'baulera_incluido', 'baulera_precio_adicional')
ORDER BY column_name;

-- Probar actualizar una propiedad
UPDATE propiedades_v2
SET parqueo_incluido = true,
    baulera_incluido = false,
    baulera_precio_adicional = 3500
WHERE id = 222;

-- Verificar
SELECT id, estacionamientos, parqueo_incluido, parqueo_precio_adicional,
       baulera, baulera_incluido, baulera_precio_adicional
FROM propiedades_v2
WHERE id = 222;
*/
