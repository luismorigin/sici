-- ============================================================================
-- Migración 199: Backfill snapshots de absorción
-- Fecha: 23 Mar 2026
-- Contexto: El verificador de venta excluía C21 (AND fuente = 'remax'),
--   dejando ~131 propiedades C21 stuck en inactivo_pending sin confirmarse.
--   Fix aplicado hoy (v5.1). Las propiedades ahora están confirmadas con
--   primera_ausencia_at correcto. Este backfill recalcula la absorción
--   histórica para toda la serie (12 Feb - 23 Mar 2026).
-- Seguridad: Solo actualiza columnas de absorción (absorbidas, tasa,
--   meses_inventario, absorbidas_ticket, absorbidas_usd_m2).
--   NO toca inventario, precios, alquiler ni ROI.
-- ============================================================================

-- Paso 1: Función parametrizada (wrapper de la existente con fecha variable)
CREATE OR REPLACE FUNCTION backfill_snapshot_absorcion(p_fecha DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_dorm INTEGER;
  v_absorbidas INTEGER;
  v_abs_ticket INTEGER;
  v_abs_usd_m2 INTEGER;
  v_activas INTEGER;
  v_tasa NUMERIC(5,2);
  v_meses NUMERIC(5,1);
BEGIN
  FOR v_dorm IN 0..3 LOOP
    -- Obtener activas del snapshot existente (no recalcular)
    SELECT venta_activas INTO v_activas
    FROM market_absorption_snapshots
    WHERE fecha = p_fecha AND dormitorios = v_dorm;

    -- Si no hay snapshot para esta fecha/dorm, skip
    IF v_activas IS NULL THEN
      CONTINUE;
    END IF;

    -- Recalcular absorbidas con TODOS los inactivo_confirmed (C21 + Remax)
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER
    INTO v_absorbidas, v_abs_ticket, v_abs_usd_m2
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND dormitorios = v_dorm
      AND primera_ausencia_at >= p_fecha - INTERVAL '30 days'
      AND primera_ausencia_at < p_fecha + INTERVAL '1 day';

    -- Recalcular tasa y meses
    IF (v_activas + v_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_absorbidas / (v_activas + v_absorbidas), 2);
    ELSE
      v_tasa := 0;
    END IF;

    IF v_absorbidas > 0 THEN
      v_meses := ROUND(v_activas::NUMERIC / v_absorbidas, 1);
    ELSE
      v_meses := NULL;
    END IF;

    -- Actualizar SOLO columnas de absorción
    UPDATE market_absorption_snapshots
    SET
      venta_absorbidas_30d = v_absorbidas,
      venta_tasa_absorcion = v_tasa,
      venta_meses_inventario = v_meses,
      absorbidas_ticket_promedio = v_abs_ticket,
      absorbidas_usd_m2 = v_abs_usd_m2
    WHERE fecha = p_fecha AND dormitorios = v_dorm;

  END LOOP;
END;
$$;

-- Paso 2: Ejecutar backfill para todas las fechas históricas
DO $$
DECLARE
  v_fecha DATE;
BEGIN
  FOR v_fecha IN
    SELECT DISTINCT fecha FROM market_absorption_snapshots ORDER BY fecha
  LOOP
    PERFORM backfill_snapshot_absorcion(v_fecha);
  END LOOP;
  RAISE NOTICE 'Backfill completado para todas las fechas';
END;
$$;

-- Paso 3: Limpiar — eliminar función temporal
DROP FUNCTION IF EXISTS backfill_snapshot_absorcion(DATE);
