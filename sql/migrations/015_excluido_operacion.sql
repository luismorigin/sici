-- =====================================================
-- MIGRACION 015: Status excluido_operacion
-- Fecha: 3 Enero 2026
-- Proposito: Marcar propiedades de alquiler/anticretico
--            que no entran al pipeline de enrichment
-- =====================================================

-- =====================================================
-- PASO 1: Agregar valor al ENUM
-- =====================================================
ALTER TYPE estado_propiedad ADD VALUE IF NOT EXISTS 'excluido_operacion';

-- =====================================================
-- PASO 2: Migrar propiedades existentes
-- =====================================================
UPDATE propiedades_v2
SET status = 'excluido_operacion'
WHERE status = 'nueva'
  AND tipo_operacion IN ('alquiler', 'anticretico');

-- =====================================================
-- VERIFICACION
-- =====================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM propiedades_v2
    WHERE status = 'excluido_operacion';

    RAISE NOTICE 'Migracion 015 completada: % propiedades marcadas como excluido_operacion', v_count;
END $$;
