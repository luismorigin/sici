-- =====================================================
-- MIGRACIÓN 076: Campos adicionales para propiedades_broker
-- Fecha: 2026-01-24
-- Descripción:
--   - Agrega tipo_cambio (paralelo/oficial)
--   - Agrega plan_pagos (texto)
--   - Hace direccion nullable
-- =====================================================

-- 1. Agregar columna tipo_cambio
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS tipo_cambio TEXT DEFAULT 'paralelo'
  CHECK (tipo_cambio IN ('paralelo', 'oficial'));

-- 2. Agregar columna plan_pagos
ALTER TABLE propiedades_broker
ADD COLUMN IF NOT EXISTS plan_pagos TEXT;

-- 3. Hacer direccion nullable (el formulario no lo requiere)
ALTER TABLE propiedades_broker
ALTER COLUMN direccion DROP NOT NULL;

-- Comentarios
COMMENT ON COLUMN propiedades_broker.tipo_cambio IS 'Tipo de cambio para conversión: paralelo (mercado) u oficial (BCB)';
COMMENT ON COLUMN propiedades_broker.plan_pagos IS 'Descripción del plan de pagos para preventas/planos';
