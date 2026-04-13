-- Migración 211: Fix absorción — alinear filtros inventario/absorbidas + nuevas métricas
--
-- PROBLEMA: snapshot_absorcion_mercado() tenía asimetría de filtros:
--   - Inventario activo: filtro 300d + duplicados + multiproyecto + parqueos + zona
--   - Absorbidas: SOLO inactivo_confirmed + primera_ausencia_at 30d (sin los demás filtros)
--   Esto inflaba artificialmente la tasa de absorción.
--
-- CAMBIOS:
--   1. Inventario activo: quitar filtro 300d fijo (estudios de mercado necesitan todo el inventario)
--   2. Absorbidas: alinear con mismos filtros de calidad + primera_ausencia_at IS NOT NULL
--   3. Pending: mismos filtros de calidad
--   4. Nuevas columnas: absorbidas por estado construcción, yield por amoblado
--   5. venta_usd_m2: cambiar de AVG a PERCENTILE_CONT(0.5) (mediana, más robusto)
--   6. filter_version = 3 para nueva serie
--
-- BACKFILL: recalcular absorbidas de filter_version=2 con filtros correctos
--
-- NO TOCA: v_mercado_venta, v_mercado_alquiler, buscar_unidades_*, frontend

BEGIN;

-- =============================================================
-- PASO 1: Agregar columnas nuevas a market_absorption_snapshots
-- =============================================================
ALTER TABLE market_absorption_snapshots
  ADD COLUMN IF NOT EXISTS venta_absorbidas_entrega INTEGER,
  ADD COLUMN IF NOT EXISTS venta_absorbidas_preventa INTEGER,
  ADD COLUMN IF NOT EXISTS roi_amoblado NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS roi_no_amoblado NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS anos_retorno_amoblado NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS anos_retorno_no_amoblado NUMERIC(5,1);

COMMENT ON COLUMN market_absorption_snapshots.venta_absorbidas_entrega IS 'Absorbidas entrega inmediata (últimos 30d)';
COMMENT ON COLUMN market_absorption_snapshots.venta_absorbidas_preventa IS 'Absorbidas preventa/en_construccion (últimos 30d)';
COMMENT ON COLUMN market_absorption_snapshots.roi_amoblado IS 'Yield bruto anual con mediana alquiler amoblado';
COMMENT ON COLUMN market_absorption_snapshots.roi_no_amoblado IS 'Yield bruto anual con mediana alquiler no amoblado';

-- =============================================================
-- PASO 2: Reescribir snapshot_absorcion_mercado() — filter_version 3
-- =============================================================
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
  v_abs_entrega INTEGER;
  v_abs_preventa INTEGER;
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
  v_roi_amob NUMERIC(5,2);
  v_roi_no_amob NUMERIC(5,2);
  v_retorno_amob NUMERIC(5,1);
  v_retorno_no_amob NUMERIC(5,1);
  v_alq_med_amob INTEGER;
  v_alq_med_no_amob INTEGER;
BEGIN
  -- =========================================================================
  -- LOOP 1: Global (zona = 'global')
  -- =========================================================================
  FOR v_dorm IN 0..3 LOOP
    -- === VENTA: Inventario activo (SIN filtro 300d — mide mercado real) ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER,
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
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas últimos 30 días (FILTROS ALINEADOS) ===
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
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IS NOT NULL
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas por estado construcción ===
    SELECT
      COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text, '') NOT IN ('preventa', 'en_construccion', 'en_pozo')),
      COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text, '') IN ('preventa', 'en_construccion', 'en_pozo'))
    INTO v_abs_entrega, v_abs_preventa
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IS NOT NULL
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Pending últimos 30 días (FILTROS ALINEADOS) ===
    SELECT COUNT(*)
    INTO v_venta_pending
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_pending'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IS NOT NULL
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Nuevas últimos 30 días ===
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
      AND fuente IN ('century21', 'remax', 'bien_inmuebles')
      AND precio_mensual_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm;

    -- === ALQUILER: Medianas por amoblado ===
    SELECT
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER
    INTO v_alq_med_amob
    FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax', 'bien_inmuebles')
      AND precio_mensual_usd > 0
      AND area_total_m2 >= 20
      AND amoblado = 'si'
      AND propiedades_v2.dormitorios = v_dorm;

    SELECT
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER
    INTO v_alq_med_no_amob
    FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax', 'bien_inmuebles')
      AND precio_mensual_usd > 0
      AND area_total_m2 >= 20
      AND amoblado = 'no'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === ROI cruzado (general) ===
    IF v_alq_med > 0 AND v_ticket_med > 0 THEN
      v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
      v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
    ELSE
      v_roi := NULL;
      v_retorno := NULL;
    END IF;

    -- === ROI amoblado ===
    IF v_alq_med_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
    ELSE
      v_roi_amob := NULL;
      v_retorno_amob := NULL;
    END IF;

    -- === ROI no amoblado ===
    IF v_alq_med_no_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
    ELSE
      v_roi_no_amob := NULL;
      v_retorno_no_amob := NULL;
    END IF;

    -- === INSERT global ===
    INSERT INTO market_absorption_snapshots (
      fecha, dormitorios, zona, filter_version,
      venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
      venta_tasa_absorcion, venta_meses_inventario,
      venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
      venta_usd_m2, venta_area_promedio,
      absorbidas_ticket_promedio, absorbidas_usd_m2,
      venta_absorbidas_entrega, venta_absorbidas_preventa,
      alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
      alquiler_mensual_p25, alquiler_mensual_p75,
      roi_bruto_anual, anos_retorno,
      roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
    ) VALUES (
      v_fecha, v_dorm, 'global', 3,
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_abs_ticket, v_abs_usd_m2,
      v_abs_entrega, v_abs_preventa,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_roi, v_retorno,
      v_roi_amob, v_roi_no_amob, v_retorno_amob, v_retorno_no_amob
    )
    ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
      filter_version = 3,
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
      venta_absorbidas_entrega = EXCLUDED.venta_absorbidas_entrega,
      venta_absorbidas_preventa = EXCLUDED.venta_absorbidas_preventa,
      alquiler_activas = EXCLUDED.alquiler_activas,
      alquiler_mensual_promedio = EXCLUDED.alquiler_mensual_promedio,
      alquiler_mensual_mediana = EXCLUDED.alquiler_mensual_mediana,
      alquiler_mensual_p25 = EXCLUDED.alquiler_mensual_p25,
      alquiler_mensual_p75 = EXCLUDED.alquiler_mensual_p75,
      roi_bruto_anual = EXCLUDED.roi_bruto_anual,
      anos_retorno = EXCLUDED.anos_retorno,
      roi_amoblado = EXCLUDED.roi_amoblado,
      roi_no_amoblado = EXCLUDED.roi_no_amoblado,
      anos_retorno_amoblado = EXCLUDED.anos_retorno_amoblado,
      anos_retorno_no_amoblado = EXCLUDED.anos_retorno_no_amoblado,
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
      -- === VENTA: Inventario activo por zona (SIN filtro 300d) ===
      SELECT
        COUNT(*),
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER,
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
        AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito');

      -- Skip zona/dorm combos sin inventario
      IF v_venta_activas = 0 OR v_venta_activas IS NULL THEN
        CONTINUE;
      END IF;

      -- === VENTA: Absorbidas por zona (FILTROS ALINEADOS) ===
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
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND primera_ausencia_at IS NOT NULL
        AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

      -- === VENTA: Absorbidas por estado construcción (zona) ===
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text, '') NOT IN ('preventa', 'en_construccion', 'en_pozo')),
        COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text, '') IN ('preventa', 'en_construccion', 'en_pozo'))
      INTO v_abs_entrega, v_abs_preventa
      FROM propiedades_v2
      WHERE tipo_operacion = 'venta'
        AND status = 'inactivo_confirmed'
        AND fuente IN ('century21', 'remax')
        AND precio_usd > 0
        AND area_total_m2 >= 20
        AND propiedades_v2.dormitorios = v_dorm
        AND propiedades_v2.zona = v_zona
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND primera_ausencia_at IS NOT NULL
        AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

      -- === VENTA: Pending por zona (FILTROS ALINEADOS) ===
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
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND primera_ausencia_at IS NOT NULL
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

      -- === INSERT por zona ===
      INSERT INTO market_absorption_snapshots (
        fecha, dormitorios, zona, filter_version,
        venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
        venta_tasa_absorcion, venta_meses_inventario,
        venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
        venta_usd_m2, venta_area_promedio,
        absorbidas_ticket_promedio, absorbidas_usd_m2,
        venta_absorbidas_entrega, venta_absorbidas_preventa,
        alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
        alquiler_mensual_p25, alquiler_mensual_p75,
        roi_bruto_anual, anos_retorno,
        roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
      ) VALUES (
        v_fecha, v_dorm, v_zona, 3,
        v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
        v_tasa, v_meses,
        v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
        v_usd_m2, v_area_prom,
        v_abs_ticket, v_abs_usd_m2,
        v_abs_entrega, v_abs_preventa,
        NULL, NULL, NULL,
        NULL, NULL,
        NULL, NULL,
        NULL, NULL, NULL, NULL
      )
      ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
        filter_version = 3,
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
        venta_absorbidas_entrega = EXCLUDED.venta_absorbidas_entrega,
        venta_absorbidas_preventa = EXCLUDED.venta_absorbidas_preventa,
        created_at = NOW();

      dormitorios_out := v_dorm;
      zona_out := v_zona;
      insertado := TRUE;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

-- =============================================================
-- PASO 3: Backfill — recalcular absorbidas de filter_version=2
-- =============================================================
-- Para cada snapshot v2, recalcular absorbidas aplicando:
--   1. Filtros de calidad (duplicado, multiproyecto, parqueo)
--   2. primera_ausencia_at IS NOT NULL (excluir curación admin)
--   3. Mantener inventario activo como estaba (fue conteo real del día)

UPDATE market_absorption_snapshots s
SET
  venta_absorbidas_30d = sub.absorbidas_clean,
  venta_absorbidas_entrega = sub.abs_entrega,
  venta_absorbidas_preventa = sub.abs_preventa,
  venta_tasa_absorcion = CASE
    WHEN (s.venta_activas + sub.absorbidas_clean) > 0
    THEN ROUND(100.0 * sub.absorbidas_clean / (s.venta_activas + sub.absorbidas_clean), 2)
    ELSE 0
  END,
  venta_meses_inventario = CASE
    WHEN sub.absorbidas_clean > 0
    THEN ROUND(s.venta_activas::NUMERIC / sub.absorbidas_clean, 1)
    ELSE NULL
  END
FROM (
  SELECT
    s2.fecha, s2.dormitorios, s2.zona,
    COUNT(*) FILTER (
      WHERE p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND p.zona IS NOT NULL
        AND p.primera_ausencia_at IS NOT NULL
    ) AS absorbidas_clean,
    COUNT(*) FILTER (
      WHERE p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND p.zona IS NOT NULL
        AND p.primera_ausencia_at IS NOT NULL
        AND COALESCE(p.estado_construccion::text, '') NOT IN ('preventa', 'en_construccion', 'en_pozo')
    ) AS abs_entrega,
    COUNT(*) FILTER (
      WHERE p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND p.zona IS NOT NULL
        AND p.primera_ausencia_at IS NOT NULL
        AND COALESCE(p.estado_construccion::text, '') IN ('preventa', 'en_construccion', 'en_pozo')
    ) AS abs_preventa
  FROM market_absorption_snapshots s2
  LEFT JOIN propiedades_v2 p ON
    p.tipo_operacion = 'venta'
    AND p.status = 'inactivo_confirmed'
    AND p.fuente IN ('century21', 'remax')
    AND p.precio_usd > 0
    AND p.area_total_m2 >= 20
    AND p.dormitorios = s2.dormitorios
    AND p.primera_ausencia_at >= s2.fecha - INTERVAL '30 days'
    AND p.primera_ausencia_at < s2.fecha + INTERVAL '1 day'
    AND (s2.zona = 'global' OR p.zona = s2.zona)
  WHERE s2.filter_version = 2
  GROUP BY s2.fecha, s2.dormitorios, s2.zona
) sub
WHERE s.fecha = sub.fecha
  AND s.dormitorios = sub.dormitorios
  AND s.zona = sub.zona
  AND s.filter_version = 2;

-- =============================================================
-- PASO 4: Verificar
-- =============================================================
SELECT 'Columnas nuevas' as check_type,
  COUNT(*) FILTER (WHERE venta_absorbidas_entrega IS NOT NULL) as con_entrega,
  COUNT(*) FILTER (WHERE roi_amoblado IS NOT NULL) as con_roi_amob
FROM market_absorption_snapshots;

SELECT 'Backfill v2' as check_type,
  filter_version, COUNT(*) as filas,
  ROUND(AVG(venta_tasa_absorcion), 1) as avg_tasa
FROM market_absorption_snapshots
WHERE zona = 'global'
GROUP BY filter_version
ORDER BY filter_version;

COMMIT;
