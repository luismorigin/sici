-- ============================================================================
-- Migracion 162: Flag es_test en leads_alquiler
-- ============================================================================
-- Permite filtrar leads de prueba (debug mode) de leads reales.
-- El endpoint /api/lead-alquiler setea es_test=true cuando el usuario
-- navega con ?debug=1 (persistido en localStorage).
-- ============================================================================

ALTER TABLE leads_alquiler ADD COLUMN IF NOT EXISTS es_test BOOLEAN NOT NULL DEFAULT false;

-- Marcar el lead de prueba existente (Edificio Test)
UPDATE leads_alquiler SET es_test = true WHERE id = 1;

DO $$
BEGIN
    RAISE NOTICE 'Migracion 162: Flag es_test en leads_alquiler';
END $$;
