-- ============================================================
-- Migración 140: Market Absorption Snapshots
-- Fecha: 2026-02-12
-- Propósito: Tabla + función para guardar snapshots periódicos
--            de absorción del mercado por tipología
-- ============================================================

-- 1. TABLA
CREATE TABLE IF NOT EXISTS market_absorption_snapshots (
  id SERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  dormitorios INTEGER NOT NULL,        -- 0=estudio, 1, 2, 3

  -- Venta: inventario
  venta_activas INTEGER,
  venta_absorbidas_30d INTEGER,
  venta_nuevas_30d INTEGER,
  venta_tasa_absorcion NUMERIC(5,2),   -- % absorbidas / (activas + absorbidas)
  venta_meses_inventario NUMERIC(5,1), -- activas / absorbidas_30d

  -- Venta: precios
  venta_ticket_promedio INTEGER,
  venta_ticket_mediana INTEGER,
  venta_ticket_p25 INTEGER,
  venta_ticket_p75 INTEGER,
  venta_usd_m2 INTEGER,
  venta_area_promedio INTEGER,

  -- Absorbidas: qué se vendió
  absorbidas_ticket_promedio INTEGER,
  absorbidas_usd_m2 INTEGER,

  -- Alquiler
  alquiler_activas INTEGER,
  alquiler_mensual_promedio INTEGER,
  alquiler_mensual_mediana INTEGER,
  alquiler_mensual_p25 INTEGER,
  alquiler_mensual_p75 INTEGER,

  -- Cruzado: inversión
  roi_bruto_anual NUMERIC(5,2),        -- (alquiler_mensual * 12) / ticket_venta * 100
  anos_retorno NUMERIC(5,1),           -- ticket_venta / (alquiler_mensual * 12)

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(fecha, dormitorios)
);

CREATE INDEX IF NOT EXISTS idx_market_absorption_fecha
  ON market_absorption_snapshots(fecha DESC);

-- 2. FUNCIÓN
CREATE OR REPLACE FUNCTION snapshot_absorcion_mercado()
RETURNS TABLE(dormitorios_out INTEGER, insertado BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    -- === VENTA: Inventario activo ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_usd))::INTEGER,
      ROUND(AVG(precio_usd / NULLIF(area_total_m2, 0)))::INTEGER,
      ROUND(AVG(area_total_m2))::INTEGER
    INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas últimos 30 días ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_usd))::INTEGER,
      ROUND(AVG(precio_usd / NULLIF(area_total_m2, 0)))::INTEGER
    INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

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
      AND status NOT IN ('excluido_operacion');

    -- === Calcular tasa y meses ===
    IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
    ELSE
      v_tasa := 0;
    END IF;

    IF v_venta_absorbidas > 0 THEN
      v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
    ELSE
      v_meses := NULL; -- sin datos para calcular
    END IF;

    -- === ALQUILER ===
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
      roi_bruto_anual, anos_retorno
    ) VALUES (
      v_fecha, v_dorm,
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_abs_ticket, v_abs_usd_m2,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_roi, v_retorno
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
      created_at = NOW();

    dormitorios_out := v_dorm;
    insertado := TRUE;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- 3. PERMISOS
GRANT SELECT ON market_absorption_snapshots TO anon, authenticated;
GRANT EXECUTE ON FUNCTION snapshot_absorcion_mercado() TO authenticated;

-- 4. COMENTARIOS
COMMENT ON TABLE market_absorption_snapshots IS 'Snapshots diarios de absorción del mercado por tipología (dormitorios). Generado por snapshot_absorcion_mercado().';
COMMENT ON FUNCTION snapshot_absorcion_mercado() IS 'Calcula métricas de absorción, precios y ROI por tipología y las guarda en market_absorption_snapshots. Idempotente por (fecha, dormitorios).';
