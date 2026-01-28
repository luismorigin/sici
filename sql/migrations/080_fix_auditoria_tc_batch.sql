-- ============================================================================
-- MIGRACIÓN 080: Fix Auditoría TC para Batch Operations
-- ============================================================================
-- Fecha: 2026-01-28
-- Problema: recalcular_precios_batch_nocturno() inserta NULL en valor_nuevo
--           pero la columna tiene constraint NOT NULL
-- Solución: Permitir NULL en valor_nuevo para operaciones batch (tipo_cambio='batch')
-- ============================================================================

-- ============================================================================
-- PASO 1: Modificar columna para permitir NULL
-- ============================================================================
-- valor_nuevo puede ser NULL para operaciones batch (no aplica a un TC específico)

ALTER TABLE auditoria_tipo_cambio
ALTER COLUMN valor_nuevo DROP NOT NULL;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

DO $$
DECLARE
  v_nullable TEXT;
BEGIN
  SELECT is_nullable INTO v_nullable
  FROM information_schema.columns
  WHERE table_name = 'auditoria_tipo_cambio'
    AND column_name = 'valor_nuevo';

  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRACIÓN 080: Fix Auditoría TC Batch completada';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 valor_nuevo is_nullable: %', v_nullable;
  RAISE NOTICE '════════════════════════════════════════════════════════════════';

  IF v_nullable != 'YES' THEN
    RAISE WARNING '⚠️ La columna valor_nuevo aún no permite NULL';
  END IF;
END $$;

-- ============================================================================
-- NOTA: Después de ejecutar esta migración, ejecutar 078 para:
-- 1. Corregir el cron job
-- 2. Procesar las 57 propiedades pendientes
-- ============================================================================
