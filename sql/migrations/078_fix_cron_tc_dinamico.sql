-- ============================================================================
-- MIGRACIÓN 078: Fix Cron Job TC Dinámico
-- ============================================================================
-- Fecha: 2026-01-28
-- Problema: El cron job apunta a función incorrecta (tabla legacy)
-- Solución: Cambiar a recalcular_precios_batch_nocturno() que usa propiedades_v2
-- ============================================================================

-- ============================================================================
-- PASO 1: Eliminar job actual (apunta a función incorrecta)
-- ============================================================================
-- El job actual llama a recalcular_precios_actualizados() que trabaja con
-- la tabla 'propiedades' (LEGACY), no con 'propiedades_v2'

SELECT cron.unschedule('recalcular-precios-diario');

-- ============================================================================
-- PASO 2: Crear job con función correcta
-- ============================================================================
-- recalcular_precios_batch_nocturno() trabaja con propiedades_v2
-- Horario: 7:05 AM (5 min después del workflow de Binance si se moviera a 7 AM)
-- Actualmente Binance corre a 00:00, pero dejamos 7:05 para procesar
-- las propiedades marcadas durante la noche

SELECT cron.schedule(
  'recalcular-precios-diario',
  '5 7 * * *',
  'SELECT recalcular_precios_batch_nocturno(1000)'
);

-- ============================================================================
-- PASO 3: Procesar pendientes acumulados (57 propiedades)
-- ============================================================================
-- Ejecutar una vez para procesar las propiedades que quedaron marcadas

SELECT recalcular_precios_batch_nocturno(100);

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================

DO $$
DECLARE
  v_job_exists BOOLEAN;
  v_job_command TEXT;
  v_pendientes INTEGER;
BEGIN
  -- Verificar que el job existe con el comando correcto
  SELECT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'recalcular-precios-diario'
    AND command LIKE '%recalcular_precios_batch_nocturno%'
  ) INTO v_job_exists;

  SELECT command INTO v_job_command
  FROM cron.job
  WHERE jobname = 'recalcular-precios-diario';

  -- Contar pendientes restantes
  SELECT COUNT(*) INTO v_pendientes
  FROM propiedades_v2
  WHERE requiere_actualizacion_precio = true
    AND es_activa = true;

  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ MIGRACIÓN 078: Fix Cron TC Dinámico completada';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '📋 Job configurado: %', v_job_exists;
  RAISE NOTICE '📋 Comando: %', v_job_command;
  RAISE NOTICE '📋 Pendientes restantes: %', v_pendientes;
  RAISE NOTICE '════════════════════════════════════════════════════════════════';

  IF NOT v_job_exists THEN
    RAISE WARNING '⚠️ El job no se creó correctamente';
  END IF;
END $$;

-- ============================================================================
-- QUERY DE VERIFICACIÓN (ejecutar manualmente)
-- ============================================================================
/*
-- Ver estado del cron job
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'recalcular-precios-diario';

-- Ver propiedades pendientes
SELECT COUNT(*) as pendientes
FROM propiedades_v2
WHERE requiere_actualizacion_precio = true
  AND es_activa = true;

-- Ver propiedades con precio actualizado
SELECT COUNT(*) as con_precio_actualizado
FROM propiedades_v2
WHERE precio_usd_actualizado IS NOT NULL;
*/
