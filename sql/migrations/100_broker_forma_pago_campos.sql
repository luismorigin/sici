-- Migration 100: Campos adicionales para forma de pago y características broker
-- Fecha: 2026-02-01
-- Autor: Claude
-- Descripción: Agregar campos faltantes para el editor mejorado de propiedades broker

-- =====================================================
-- 1. NUEVAS COLUMNAS PARA FORMA DE PAGO
-- =====================================================

-- Moneda en la que se publica el precio
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS moneda_publicacion TEXT DEFAULT 'usd_paralelo'
CHECK (moneda_publicacion IN ('usd_oficial', 'usd_paralelo', 'bolivianos'));

COMMENT ON COLUMN propiedades_broker.moneda_publicacion IS
'Moneda original de la publicación: usd_oficial, usd_paralelo, bolivianos';

-- Acepta plan de pagos con desarrollador
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS acepta_plan_pagos BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN propiedades_broker.acepta_plan_pagos IS
'Si acepta plan de cuotas directas con el desarrollador';

-- Cuotas del plan de pagos (estructurado)
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS plan_pagos_cuotas JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN propiedades_broker.plan_pagos_cuotas IS
'Array de cuotas: [{id, porcentaje, momento, descripcion}]';

-- Solo acepta contado en TC paralelo
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS solo_contado_paralelo BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN propiedades_broker.solo_contado_paralelo IS
'Si solo acepta pago al contado en USD paralelo';

-- =====================================================
-- 2. COLUMNAS PARA ESTADO 3-OPCIONES PARQUEO/BAULERA
-- =====================================================

-- Estado de parqueo (3 opciones)
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS parqueo_estado TEXT DEFAULT 'sin_confirmar'
CHECK (parqueo_estado IN ('incluido', 'no_incluido', 'sin_confirmar'));

COMMENT ON COLUMN propiedades_broker.parqueo_estado IS
'Estado del parqueo: incluido (en precio), no_incluido (precio aparte), sin_confirmar';

-- Precio adicional del parqueo (renombrar para consistencia)
-- La columna precio_parqueo_extra ya existe, agregar alias para compatibilidad
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS parqueo_precio_adicional NUMERIC;

-- Migrar datos existentes de precio_parqueo_extra a parqueo_precio_adicional
UPDATE propiedades_broker
SET parqueo_precio_adicional = precio_parqueo_extra
WHERE precio_parqueo_extra IS NOT NULL AND parqueo_precio_adicional IS NULL;

COMMENT ON COLUMN propiedades_broker.parqueo_precio_adicional IS
'Precio adicional del parqueo en USD si no está incluido';

-- Estado de baulera (3 opciones)
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS baulera_estado TEXT DEFAULT 'sin_confirmar'
CHECK (baulera_estado IN ('incluida', 'no_incluida', 'sin_confirmar'));

COMMENT ON COLUMN propiedades_broker.baulera_estado IS
'Estado de la baulera: incluida (en precio), no_incluida (precio aparte), sin_confirmar';

-- Precio adicional de baulera (renombrar para consistencia)
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS baulera_precio_adicional NUMERIC;

-- Migrar datos existentes
UPDATE propiedades_broker
SET baulera_precio_adicional = precio_baulera_extra
WHERE precio_baulera_extra IS NOT NULL AND baulera_precio_adicional IS NULL;

COMMENT ON COLUMN propiedades_broker.baulera_precio_adicional IS
'Precio adicional de la baulera en USD si no está incluida';

-- =====================================================
-- 3. MIGRAR DATOS LEGACY A NUEVOS ESTADOS
-- =====================================================

-- Si parqueo_incluido era TRUE, establecer parqueo_estado = 'incluido'
UPDATE propiedades_broker
SET parqueo_estado = 'incluido'
WHERE parqueo_incluido = TRUE AND parqueo_estado = 'sin_confirmar';

-- Si baulera_incluida era TRUE, establecer baulera_estado = 'incluida'
UPDATE propiedades_broker
SET baulera_estado = 'incluida'
WHERE baulera_incluida = TRUE AND baulera_estado = 'sin_confirmar';

-- =====================================================
-- 4. VERIFICACIÓN
-- =====================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Verificar columnas agregadas
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_name = 'propiedades_broker'
      AND column_name IN ('moneda_publicacion', 'acepta_plan_pagos', 'plan_pagos_cuotas',
                          'solo_contado_paralelo', 'parqueo_estado', 'baulera_estado',
                          'parqueo_precio_adicional', 'baulera_precio_adicional');

    IF v_count = 8 THEN
        RAISE NOTICE '✅ Migration 100: 8 columnas agregadas correctamente a propiedades_broker';
    ELSE
        RAISE NOTICE '⚠️ Migration 100: Solo % columnas encontradas de 8 esperadas', v_count;
    END IF;
END $$;
