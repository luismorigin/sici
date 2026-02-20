-- ============================================================================
-- Migracion 155: Permisos anon para buscar_unidades_alquiler
-- ============================================================================
-- Sin esto, el frontend no puede llamar la funcion RPC con la key anon.
-- ============================================================================

GRANT EXECUTE ON FUNCTION buscar_unidades_alquiler TO anon;
GRANT EXECUTE ON FUNCTION buscar_unidades_alquiler TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migracion 155: Permisos EXECUTE anon/authenticated para buscar_unidades_alquiler';
END $$;
