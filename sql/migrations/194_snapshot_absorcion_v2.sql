-- Migración 194: Refactorizar snapshot_absorcion_mercado() para usar vistas canónicas
-- Problema: función usaba filtros ad-hoc que omitían duplicado_de, es_multiproyecto,
-- tipo_propiedad_original, zona IS NOT NULL, filtro días mercado, y excluía Bien Inmuebles.
-- Resultado: venta_activas inflado ~8.5% (341 vs 312 reales).
-- Solución: usar v_mercado_venta y v_mercado_alquiler (migración 193).
-- Histórico: 29 días de snapshots (12 Feb - 12 Mar) con filtros legacy.
-- Se agrega filter_version para distinguir series.
-- Nota: loop 0..3 (diseño original) — props de 4+ dormitorios no se capturan (~5 venta).

BEGIN;

-- 1. Agregar columna filter_version a la tabla
ALTER TABLE market_absorption_snapshots
  ADD COLUMN IF NOT EXISTS filter_version smallint DEFAULT 2;

-- 2. Marcar snapshots históricos como v1
UPDATE market_absorption_snapshots
SET filter_version = 1
WHERE filter_version IS NULL OR filter_version != 1;

-- 3. Recrear función usando vistas canónicas
CREATE OR REPLACE FUNCTION snapshot_absorcion_mercado()
RETURNS TABLE(dormitorios_out integer, insertado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_venta_activas INTEGER;
  v_venta_absorbidas INTEGER;
  v_venta_nuevas INTEGER;
  v_tasa NUMERIC(5,2);
  v_meses NUMERIC(5,1);
  v_ticket_prom INTEGER;
  v_ticket_med INTEGER;
  v_ticket_p25 INTEGER;
  v_ticket_p75 INTEGER;
  v_usd_m2 INTEGER;
  v_area_prom INTEGER;
  v_abs_ticket INTEGER;
  v_abs_usd_m2 INTEGER;
  v_alq_activas INTEGER;
  v_alq_prom INTEGER;
  v_alq_med INTEGER;
  v_alq_p25 INTEGER;
  v_alq_p75 INTEGER;
  v_roi NUMERIC(5,2);
  v_retorno NUMERIC(5,1);
BEGIN
  FOR v_dorm IN 0..3 LOOP
    -- === VENTA: Inventario activo (desde vista canónica) ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_norm))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
      ROUND(AVG(precio_m2))::INTEGER,
      ROUND(AVG(area_total_m2))::INTEGER
    INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
    FROM v_mercado_venta
    WHERE dormitorios = v_dorm;

    -- === VENTA: Absorbidas últimos 30 días ===
    -- No usa vista (status = inactivo_confirmed, no pasa filtro de vista)
    -- Pero aplica mismos filtros de calidad
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER
    INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND duplicado_de IS NULL
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND area_total_m2 >= 20
      AND zona IS NOT NULL
      AND precio_usd > 0
      AND dormitorios = v_dorm
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

    -- === VENTA: Nuevas últimos 30 días ===
    SELECT COUNT(*)
    INTO v_venta_nuevas
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status NOT IN ('excluido_operacion')
      AND duplicado_de IS NULL
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND area_total_m2 >= 20
      AND zona IS NOT NULL
      AND precio_usd > 0
      AND dormitorios = v_dorm
      AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days';

    -- === Calcular tasa y meses ===
    IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
    ELSE
      v_tasa := 0;
    END IF;

    IF v_venta_absorbidas > 0 THEN
      v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
    ELSE
      v_meses := NULL;
    END IF;

    -- === ALQUILER (desde vista canónica) ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_mensual))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER
    INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75
    FROM v_mercado_alquiler
    WHERE dormitorios = v_dorm;

    -- === ROI cruzado ===
    IF v_alq_prom > 0 AND v_ticket_prom > 0 THEN
      v_roi := ROUND((v_alq_prom * 12.0) / v_ticket_prom * 100, 2);
      v_retorno := ROUND(v_ticket_prom::NUMERIC / (v_alq_prom * 12.0), 1);
    ELSE
      v_roi := NULL;
      v_retorno := NULL;
    END IF;

    -- === INSERT (idempotente) ===
    INSERT INTO market_absorption_snapshots (
      fecha, dormitorios,
      venta_activas, venta_absorbidas_30d, venta_nuevas_30d,
      venta_tasa_absorcion, venta_meses_inventario,
      venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
      venta_usd_m2, venta_area_promedio,
      absorbidas_ticket_promedio, absorbidas_usd_m2,
      alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
      alquiler_mensual_p25, alquiler_mensual_p75,
      roi_bruto_anual, anos_retorno,
      filter_version
    ) VALUES (
      v_fecha, v_dorm,
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_abs_ticket, v_abs_usd_m2,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_roi, v_retorno,
      2  -- filter_version v2 = vistas canónicas
    )
    ON CONFLICT (fecha, dormitorios) DO UPDATE SET
      venta_activas = EXCLUDED.venta_activas,
      venta_absorbidas_30d = EXCLUDED.venta_absorbidas_30d,
      venta_nuevas_30d = EXCLUDED.venta_nuevas_30d,
      venta_tasa_absorcion = EXCLUDED.venta_tasa_absorcion,
      venta_meses_inventario = EXCLUDED.venta_meses_inventario,
      venta_ticket_promedio = EXCLUDED.venta_ticket_promedio,
      venta_ticket_mediana = EXCLUDED.venta_ticket_mediana,
      venta_ticket_p25 = EXCLUDED.venta_ticket_p25,
      venta_ticket_p75 = EXCLUDED.venta_ticket_p75,
      venta_usd_m2 = EXCLUDED.venta_usd_m2,
      venta_area_promedio = EXCLUDED.venta_area_promedio,
      absorbidas_ticket_promedio = EXCLUDED.absorbidas_ticket_promedio,
      absorbidas_usd_m2 = EXCLUDED.absorbidas_usd_m2,
      alquiler_activas = EXCLUDED.alquiler_activas,
      alquiler_mensual_promedio = EXCLUDED.alquiler_mensual_promedio,
      alquiler_mensual_mediana = EXCLUDED.alquiler_mensual_mediana,
      alquiler_mensual_p25 = EXCLUDED.alquiler_mensual_p25,
      alquiler_mensual_p75 = EXCLUDED.alquiler_mensual_p75,
      roi_bruto_anual = EXCLUDED.roi_bruto_anual,
      anos_retorno = EXCLUDED.anos_retorno,
      filter_version = EXCLUDED.filter_version,
      created_at = NOW();

    dormitorios_out := v_dorm;
    insertado := TRUE;
    RETURN NEXT;
  END LOOP;
END;
$function$;

-- 4. Verificar: correr snapshot para hoy y comparar
SELECT * FROM snapshot_absorcion_mercado();

-- 5. Mostrar resultado de hoy (debería ser filter_version = 2)
SELECT fecha, dormitorios, venta_activas, alquiler_activas, filter_version
FROM market_absorption_snapshots
WHERE fecha = CURRENT_DATE
ORDER BY dormitorios;

COMMENT ON COLUMN market_absorption_snapshots.filter_version IS
  'v1 = filtros legacy (pre-194, sin duplicado_de/es_multiproyecto/tipo_prop/zona/días). '
  'v2 = vistas canónicas v_mercado_venta + v_mercado_alquiler (migración 194). '
  'Quiebre de serie entre v1 y v2: venta_activas baja ~8.5% por filtros correctos.';

COMMIT;
