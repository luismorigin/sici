-- ============================================================================
-- MIGRACIÓN 081: Columnas Piso y Forma de Pago
-- ============================================================================
-- Fecha: 2026-01-28
-- Propósito: Agregar campos estructurados para piso y condiciones de pago
-- Impacto: Retrocompatible (NULL default, no afecta flujos existentes)
-- ============================================================================

-- Piso del departamento
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS piso INTEGER;

-- Forma de pago
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS plan_pagos_desarrollador BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS acepta_permuta BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS solo_tc_paralelo BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS precio_negociable BOOLEAN;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS descuento_contado_pct NUMERIC(5,2);

-- Índices para filtros comunes
CREATE INDEX IF NOT EXISTS idx_propiedades_plan_pagos
  ON propiedades_v2(plan_pagos_desarrollador)
  WHERE plan_pagos_desarrollador = true;

CREATE INDEX IF NOT EXISTS idx_propiedades_tc_paralelo
  ON propiedades_v2(solo_tc_paralelo)
  WHERE solo_tc_paralelo = true;

CREATE INDEX IF NOT EXISTS idx_propiedades_piso
  ON propiedades_v2(piso)
  WHERE piso IS NOT NULL;

-- Comentarios descriptivos
COMMENT ON COLUMN propiedades_v2.piso IS 'Número de piso. NULL=sin confirmar';
COMMENT ON COLUMN propiedades_v2.plan_pagos_desarrollador IS 'Acepta cuotas con desarrollador. NULL=sin confirmar, false=solo contado';
COMMENT ON COLUMN propiedades_v2.acepta_permuta IS 'Acepta vehículo/propiedad como parte de pago. NULL=sin confirmar';
COMMENT ON COLUMN propiedades_v2.solo_tc_paralelo IS 'Solo acepta pago en USD TC paralelo. NULL=sin confirmar, false=acepta oficial/Bs';
COMMENT ON COLUMN propiedades_v2.precio_negociable IS 'El precio es negociable. NULL=sin confirmar';
COMMENT ON COLUMN propiedades_v2.descuento_contado_pct IS 'Porcentaje descuento por pago al contado. NULL=sin descuento o sin confirmar';

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
    AND column_name IN ('piso', 'plan_pagos_desarrollador', 'acepta_permuta',
                        'solo_tc_paralelo', 'precio_negociable', 'descuento_contado_pct');

  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRACIÓN 081: Columnas Piso y Forma de Pago';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 Columnas agregadas: %/6', v_nuevas_cols;
  RAISE NOTICE '';
  RAISE NOTICE '📊 Nuevas columnas:';
  RAISE NOTICE '   - piso (INTEGER): Número de piso';
  RAISE NOTICE '   - plan_pagos_desarrollador (BOOLEAN): Acepta cuotas';
  RAISE NOTICE '   - acepta_permuta (BOOLEAN): Acepta vehículo/propiedad';
  RAISE NOTICE '   - solo_tc_paralelo (BOOLEAN): Solo USD paralelo';
  RAISE NOTICE '   - precio_negociable (BOOLEAN): Acepta ofertas';
  RAISE NOTICE '   - descuento_contado_pct (NUMERIC): %% descuento contado';
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Índices creados para filtros comunes';
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
  AND column_name IN ('piso', 'plan_pagos_desarrollador', 'acepta_permuta',
                      'solo_tc_paralelo', 'precio_negociable', 'descuento_contado_pct')
ORDER BY column_name;

-- Probar actualizar una propiedad
UPDATE propiedades_v2
SET piso = 8,
    plan_pagos_desarrollador = true,
    precio_negociable = true
WHERE id = 222;

-- Verificar
SELECT id, piso, plan_pagos_desarrollador, acepta_permuta, solo_tc_paralelo,
       precio_negociable, descuento_contado_pct
FROM propiedades_v2
WHERE id = 222;
*/
