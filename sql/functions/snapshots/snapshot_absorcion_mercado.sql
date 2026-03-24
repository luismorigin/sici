-- ============================================================================
-- snapshot_absorcion_mercado()
-- Canonical export from production — 23 Mar 2026
-- ============================================================================
-- SECURITY DEFINER. Cron 9 AM diario via auditoría n8n.
-- Dos loops:
--   1. Global (zona='global'): venta + alquiler + ROI cruzado (4 filas/día)
--   2. Por zona (solo venta): inventario, absorción, precios (~20 filas/día)
-- Columnas: venta_pending_30d (tracking absorción probable)
-- Usa precio_normalizado() para TC paralelo en venta.
-- Última migración: 200 (snapshot_zona_pending)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.snapshot_absorcion_mercado()
 RETURNS TABLE(dormitorios_out integer, zona_out text, insertado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_zona TEXT;
  -- Venta
  v_venta_activas INTEGER;
  v_venta_absorbidas INTEGER;
  v_venta_nuevas INTEGER;
  v_venta_pending INTEGER;
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
  -- Alquiler
  v_alq_activas INTEGER;
  v_alq_prom INTEGER;
  v_alq_med INTEGER;
  v_alq_p25 INTEGER;
  v_alq_p75 INTEGER;
  v_roi NUMERIC(5,2);
  v_retorno NUMERIC(5,1);
BEGIN
  -- =========================================================================
  -- LOOP 1: Global (zona = 'global') — compatible con serie histórica
  -- =========================================================================
  FOR v_dorm IN 0..3 LOOP
    -- === VENTA: Inventario activo ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER,
      ROUND(AVG(area_total_m2))::INTEGER
    INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IS NOT NULL
      AND COALESCE(fecha_publicacion, fecha_creacion) >= CURRENT_DATE - INTERVAL '300 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas ultimos 30 dias ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER
    INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

    -- === VENTA: Pending ultimos 30 dias ===
    SELECT COUNT(*)
    INTO v_venta_pending
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_pending'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

    -- === VENTA: Nuevas ultimos 30 dias ===
    SELECT COUNT(*)
    INTO v_venta_nuevas
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm
      AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
      AND status NOT IN ('excluido_operacion')
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IS NOT NULL;

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

    -- === ALQUILER (solo en global) ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_mensual_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER
    INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75
    FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax')
      AND precio_mensual_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm;

    -- === ROI cruzado ===
    IF v_alq_prom > 0 AND v_ticket_prom > 0 THEN
      v_roi := ROUND((v_alq_prom * 12.0) / v_ticket_prom * 100, 2);
      v_retorno := ROUND(v_ticket_prom::NUMERIC / (v_alq_prom * 12.0), 1);
    ELSE
      v_roi := NULL;
      v_retorno := NULL;
    END IF;

    -- === INSERT global ===
    INSERT INTO market_absorption_snapshots (
      fecha, dormitorios, zona,
      venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
      venta_tasa_absorcion, venta_meses_inventario,
      venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
      venta_usd_m2, venta_area_promedio,
      absorbidas_ticket_promedio, absorbidas_usd_m2,
      alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
      alquiler_mensual_p25, alquiler_mensual_p75,
      roi_bruto_anual, anos_retorno
    ) VALUES (
      v_fecha, v_dorm, 'global',
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_abs_ticket, v_abs_usd_m2,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_roi, v_retorno
    )
    ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
      venta_activas = EXCLUDED.venta_activas,
      venta_absorbidas_30d = EXCLUDED.venta_absorbidas_30d,
      venta_nuevas_30d = EXCLUDED.venta_nuevas_30d,
      venta_pending_30d = EXCLUDED.venta_pending_30d,
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
      created_at = NOW();

    dormitorios_out := v_dorm;
    zona_out := 'global';
    insertado := TRUE;
    RETURN NEXT;
  END LOOP;

  -- =========================================================================
  -- LOOP 2: Por zona (solo métricas de venta + pending)
  -- =========================================================================
  FOR v_zona IN
    SELECT DISTINCT zona FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status IN ('completado', 'inactivo_confirmed', 'inactivo_pending')
      AND zona IS NOT NULL
      AND zona != ''
  LOOP
    FOR v_dorm IN 0..3 LOOP
      -- === VENTA: Inventario activo por zona ===
      SELECT
        COUNT(*),
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER,
        ROUND(AVG(area_total_m2))::INTEGER
      INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
      FROM propiedades_v2
      WHERE tipo_operacion = 'venta'
        AND status = 'completado'
        AND fuente IN ('century21', 'remax')
        AND precio_usd > 0
        AND area_total_m2 >= 20
        AND propiedades_v2.dormitorios = v_dorm
        AND propiedades_v2.zona = v_zona
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND COALESCE(fecha_publicacion, fecha_creacion) >= CURRENT_DATE - INTERVAL '300 days';

      -- Skip zona/dorm combos sin inventario
      IF v_venta_activas = 0 OR v_venta_activas IS NULL THEN
        CONTINUE;
      END IF;

      -- === VENTA: Absorbidas por zona ===
      SELECT
        COUNT(*),
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER
      INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2
      FROM propiedades_v2
      WHERE tipo_operacion = 'venta'
        AND status = 'inactivo_confirmed'
        AND fuente IN ('century21', 'remax')
        AND precio_usd > 0
        AND area_total_m2 >= 20
        AND propiedades_v2.dormitorios = v_dorm
        AND propiedades_v2.zona = v_zona
        AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

      -- === VENTA: Pending por zona ===
      SELECT COUNT(*)
      INTO v_venta_pending
      FROM propiedades_v2
      WHERE tipo_operacion = 'venta'
        AND status = 'inactivo_pending'
        AND fuente IN ('century21', 'remax')
        AND precio_usd > 0
        AND area_total_m2 >= 20
        AND propiedades_v2.dormitorios = v_dorm
        AND propiedades_v2.zona = v_zona
        AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

      -- === VENTA: Nuevas por zona ===
      SELECT COUNT(*)
      INTO v_venta_nuevas
      FROM propiedades_v2
      WHERE tipo_operacion = 'venta'
        AND fuente IN ('century21', 'remax')
        AND precio_usd > 0
        AND area_total_m2 >= 20
        AND propiedades_v2.dormitorios = v_dorm
        AND propiedades_v2.zona = v_zona
        AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
        AND status NOT IN ('excluido_operacion')
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito');

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

      -- === INSERT por zona (alquiler y ROI = NULL) ===
      INSERT INTO market_absorption_snapshots (
        fecha, dormitorios, zona,
        venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
        venta_tasa_absorcion, venta_meses_inventario,
        venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
        venta_usd_m2, venta_area_promedio,
        absorbidas_ticket_promedio, absorbidas_usd_m2,
        alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
        alquiler_mensual_p25, alquiler_mensual_p75,
        roi_bruto_anual, anos_retorno
      ) VALUES (
        v_fecha, v_dorm, v_zona,
        v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
        v_tasa, v_meses,
        v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
        v_usd_m2, v_area_prom,
        v_abs_ticket, v_abs_usd_m2,
        NULL, NULL, NULL,
        NULL, NULL,
        NULL, NULL
      )
      ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
        venta_activas = EXCLUDED.venta_activas,
        venta_absorbidas_30d = EXCLUDED.venta_absorbidas_30d,
        venta_nuevas_30d = EXCLUDED.venta_nuevas_30d,
        venta_pending_30d = EXCLUDED.venta_pending_30d,
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
        created_at = NOW();

      dormitorios_out := v_dorm;
      zona_out := v_zona;
      insertado := TRUE;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;
