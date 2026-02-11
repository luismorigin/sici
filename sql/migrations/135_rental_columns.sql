-- =====================================================
-- Migración 135: Columnas de alquiler en propiedades_v2
-- Propósito: Agregar campos específicos de alquiler
-- Fecha: 11 Feb 2026
-- Prerequisito: Ninguno
-- =====================================================

-- 1. Precio mensual en Bs (canónico para alquileres Bolivia)
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS precio_mensual_bob NUMERIC(10,2);

-- 2. Precio mensual convertido a USD (TC oficial del día de discovery)
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS precio_mensual_usd NUMERIC(10,2);

-- 3. Depósito de garantía en meses (1, 1.5, 2, 3 meses)
--    NUMERIC(2,1) permite medios meses (ej: 1.5)
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS deposito_meses NUMERIC(2,1);

-- 4. Estado de amoblado: 'si', 'no', 'semi', o null
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS amoblado TEXT;

-- 5. Acepta mascotas
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS acepta_mascotas BOOLEAN;

-- 6. Servicios incluidos en el alquiler (agua, luz, internet, etc.)
--    JSONB para consistencia con el resto del schema SICI
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS servicios_incluidos JSONB DEFAULT '[]'::jsonb;

-- 7. Duración mínima del contrato en meses
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS contrato_minimo_meses INTEGER;

-- 8. Expensas/gastos comunes mensuales en Bs
--    (columna reutilizable, ya planificada en migración 083 pero nunca creada para propiedades_v2)
ALTER TABLE propiedades_v2
  ADD COLUMN IF NOT EXISTS monto_expensas_bob NUMERIC(10,2);

-- =====================================================
-- CHECK CONSTRAINTS
-- =====================================================

-- Amoblado solo acepta valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_amoblado_valores'
  ) THEN
    ALTER TABLE propiedades_v2
      ADD CONSTRAINT check_amoblado_valores
      CHECK (amoblado IS NULL OR amoblado IN ('si', 'no', 'semi'));
  END IF;
END $$;

-- Depósito entre 0 y 6 meses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_deposito_rango'
  ) THEN
    ALTER TABLE propiedades_v2
      ADD CONSTRAINT check_deposito_rango
      CHECK (deposito_meses IS NULL OR (deposito_meses >= 0 AND deposito_meses <= 6));
  END IF;
END $$;

-- Contrato mínimo entre 1 y 60 meses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_contrato_minimo_rango'
  ) THEN
    ALTER TABLE propiedades_v2
      ADD CONSTRAINT check_contrato_minimo_rango
      CHECK (contrato_minimo_meses IS NULL OR (contrato_minimo_meses >= 1 AND contrato_minimo_meses <= 60));
  END IF;
END $$;

-- Precio mensual positivo
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_precio_mensual_positivo'
  ) THEN
    ALTER TABLE propiedades_v2
      ADD CONSTRAINT check_precio_mensual_positivo
      CHECK (precio_mensual_bob IS NULL OR precio_mensual_bob > 0);
  END IF;
END $$;

-- Expensas positivas y menores que precio
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_expensas_positivo'
  ) THEN
    ALTER TABLE propiedades_v2
      ADD CONSTRAINT check_expensas_positivo
      CHECK (monto_expensas_bob IS NULL OR monto_expensas_bob >= 0);
  END IF;
END $$;

-- =====================================================
-- ÍNDICES
-- =====================================================

-- Índice principal para búsquedas de alquiler activas
CREATE INDEX IF NOT EXISTS idx_prop_alquiler_activo
  ON propiedades_v2(precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler'
    AND status = 'completado'
    AND duplicado_de IS NULL;

-- Índice para pipeline nocturno (propiedades pendientes de enrichment/merge)
CREATE INDEX IF NOT EXISTS idx_prop_alquiler_pipeline
  ON propiedades_v2(status)
  WHERE tipo_operacion = 'alquiler'
    AND status IN ('nueva', 'actualizado');

-- Índice para filtros comunes de alquiler
CREATE INDEX IF NOT EXISTS idx_prop_alquiler_filtros
  ON propiedades_v2(dormitorios, precio_mensual_bob)
  WHERE tipo_operacion = 'alquiler'
    AND status = 'completado'
    AND duplicado_de IS NULL;

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON COLUMN propiedades_v2.precio_mensual_bob IS 'Precio mensual canónico en Bs (alquileres Bolivia se negocian en Bs)';
COMMENT ON COLUMN propiedades_v2.precio_mensual_usd IS 'Precio mensual convertido a USD con TC oficial del día de discovery';
COMMENT ON COLUMN propiedades_v2.deposito_meses IS 'Depósito de garantía en meses (1, 1.5, 2, 3 típico Bolivia)';
COMMENT ON COLUMN propiedades_v2.amoblado IS 'Estado amoblado: si, no, semi, o null si desconocido';
COMMENT ON COLUMN propiedades_v2.acepta_mascotas IS 'true/false/null - si la propiedad acepta mascotas';
COMMENT ON COLUMN propiedades_v2.servicios_incluidos IS 'JSONB array de servicios incluidos: ["agua","luz","internet","gas"]';
COMMENT ON COLUMN propiedades_v2.contrato_minimo_meses IS 'Duración mínima del contrato en meses (6, 12, 24 típico)';
COMMENT ON COLUMN propiedades_v2.monto_expensas_bob IS 'Gastos comunes/expensas mensuales en Bs';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
/*
-- Verificar columnas creadas
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'propiedades_v2'
  AND column_name IN (
    'precio_mensual_bob','precio_mensual_usd','deposito_meses',
    'amoblado','acepta_mascotas','servicios_incluidos',
    'contrato_minimo_meses','monto_expensas_bob'
  )
ORDER BY column_name;

-- Verificar constraints
SELECT conname FROM pg_constraint
WHERE conrelid = 'propiedades_v2'::regclass
  AND conname LIKE 'check_%';
*/
