-- ============================================================================
-- Migración 256 — Snapshot: alquiler blindado (global) + serie alquiler por-zona
-- Fecha: 30-may-2026 · Ticket #7 Zona Norte (FIX A)
-- ============================================================================
-- CONTEXTO (auditoría Fase 4 alquiler ZN — docs/proyectos/zona-norte/AUDITORIA_Y_FIX_ALQUILER_ZN.md):
--   La función snapshot_absorcion_mercado() tenía 2 problemas en el lado ALQUILER:
--   A1) El bloque de alquiler del LOOP 1 (zona='global') NO filtraba zona →
--       el agregado global mezclaba alquileres de Zona Norte con Equipetrol.
--       (Sin consumidor en frontend hoy, pero es higiene; impacto medido 1-5%.)
--   A2) El LOOP 2 (por-zona) escribía alquiler_* = NULL literal → NINGUNA zona
--       (ni EQ ni ZN) tenía serie de alquiler/yield por-zona.
--
-- ESTE FIX:
--   A1) Agrega `AND zona IN (6 zonas Equipetrol)` a las 3 sub-queries de alquiler
--       del LOOP 1, replicando el blindaje que VENTA ya tiene. Limpia el global.
--   A2) Agrega un LOOP 3 NUEVO que computa alquiler por-zona y lo escribe vía
--       INSERT ... ON CONFLICT DO UPDATE (solo columnas alquiler + roi).
--
-- DECISIONES DE DISEÑO (revisión senior / doble-check):
--   * LOOP 3 separado (no se modifica el LOOP 2 de venta) = CERO cambio a la
--     lógica de venta que consumen /admin/market y el feed público. Máximo
--     aislamiento a Equipetrol producción.
--   * El LOOP 3 itera zonas de ALQUILER (no de venta) → cubre microzonas ZN que
--     tienen alquiler pero 0 venta (bug de cobertura C4 evitado). Para esas, el
--     ON CONFLICT inserta fila nueva con venta_*=NULL + alquiler poblado.
--   * El ROI cruzado lee venta_ticket_mediana de la fila ya escrita por el LOOP 2
--     (NULL si la zona no tiene venta → roi NULL, correcto).
--   * Precio: usa precio_mensual_bob/6.96 (regla 10), la fuente de verdad. El
--     LOOP 1 global mantiene precio_mensual_usd (legacy, sin consumidor; diff <$1).
--   * In-place sobre filter_version=3. NO usa v4/paralelización (descartada en #8).
--     A1 solo QUITA contaminación del global; A2 solo LLENA NULLs por-zona.
--     Ninguno altera la serie de venta. Reversible con CREATE OR REPLACE.
--
-- ROLLBACK: re-aplicar la versión previa exportada de prod
--   (pg_get_functiondef del 30-may, sin el filtro de zona en alquiler y sin LOOP 3).
--
-- VALIDACIÓN POST-APLICACIÓN (ver al pie):
--   1) global alquiler_activas baja ~31 props (las ZN salen) — esperado.
--   2) microzonas ZN pasan a tener alquiler_activas pobladas.
--   3) venta (todas las columnas venta_*, global y por-zona) NO cambia.
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
  -- LOOP 1: Global (zona='global') — BLINDADO a las 6 zonas Equipetrol
  -- =========================================================================
  FOR v_dorm IN 0..3 LOOP
    -- === VENTA: Inventario activo (BLINDADO) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas últimos 30 días (BLINDADO) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas por estado construcción (BLINDADO) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Pending últimos 30 días (BLINDADO) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Nuevas últimos 30 días (BLINDADO) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo');

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

    -- === ALQUILER global (A1: AHORA BLINDADO a las 6 zonas Equipetrol) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND propiedades_v2.dormitorios = v_dorm;

    -- === ALQUILER: Medianas por amoblado (A1: BLINDADO) ===
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
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
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
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
  -- LOOP 2: Por zona (solo métricas de venta + pending) — SIN CAMBIOS
  -- Itera DISTINCT zona; Zona Norte tiene su propia serie de venta.
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

      IF v_venta_activas = 0 OR v_venta_activas IS NULL THEN
        CONTINUE;
      END IF;

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

  -- =========================================================================
  -- LOOP 3: Alquiler por zona (NUEVO — A2)
  -- Itera zonas con alquiler completado (cubre microzonas ZN aunque tengan 0
  -- venta). Escribe SOLO columnas alquiler + roi vía ON CONFLICT DO UPDATE,
  -- sin tocar venta_*. Precio en USD vía precio_mensual_bob/6.96 (regla 10).
  -- =========================================================================
  FOR v_zona IN
    SELECT DISTINCT zona FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler'
      AND status = 'completado'
      AND zona IS NOT NULL
      AND zona != ''
  LOOP
    FOR v_dorm IN 0..3 LOOP
      -- Inventario activo de alquiler por zona+dorm
      SELECT
        COUNT(*),
        ROUND(AVG(precio_mensual_bob / 6.96))::INTEGER,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob / 6.96))::INTEGER,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual_bob / 6.96))::INTEGER,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual_bob / 6.96))::INTEGER
      INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75
      FROM propiedades_v2
      WHERE tipo_operacion = 'alquiler'
        AND status = 'completado'
        AND fuente IN ('century21', 'remax', 'bien_inmuebles')
        AND precio_mensual_bob > 0
        AND area_total_m2 >= 20
        AND duplicado_de IS NULL
        AND propiedades_v2.zona = v_zona
        AND propiedades_v2.dormitorios = v_dorm;

      IF v_alq_activas = 0 OR v_alq_activas IS NULL THEN
        CONTINUE;
      END IF;

      -- Medianas por amoblado
      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob / 6.96))::INTEGER
      INTO v_alq_med_amob
      FROM propiedades_v2
      WHERE tipo_operacion = 'alquiler'
        AND status = 'completado'
        AND fuente IN ('century21', 'remax', 'bien_inmuebles')
        AND precio_mensual_bob > 0
        AND area_total_m2 >= 20
        AND duplicado_de IS NULL
        AND amoblado = 'si'
        AND propiedades_v2.zona = v_zona
        AND propiedades_v2.dormitorios = v_dorm;

      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob / 6.96))::INTEGER
      INTO v_alq_med_no_amob
      FROM propiedades_v2
      WHERE tipo_operacion = 'alquiler'
        AND status = 'completado'
        AND fuente IN ('century21', 'remax', 'bien_inmuebles')
        AND precio_mensual_bob > 0
        AND area_total_m2 >= 20
        AND duplicado_de IS NULL
        AND amoblado = 'no'
        AND propiedades_v2.zona = v_zona
        AND propiedades_v2.dormitorios = v_dorm;

      -- Ticket mediano de venta de esta zona+dorm (de la fila escrita por LOOP 2;
      -- NULL si la zona no tiene venta → ROI NULL, correcto).
      v_ticket_med := NULL;
      SELECT venta_ticket_mediana INTO v_ticket_med
      FROM market_absorption_snapshots
      WHERE fecha = v_fecha AND dormitorios = v_dorm AND zona = v_zona;

      -- ROI cruzado
      IF v_alq_med > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
        v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
      ELSE
        v_roi := NULL; v_retorno := NULL;
      END IF;

      IF v_alq_med_amob > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
      ELSE
        v_roi_amob := NULL; v_retorno_amob := NULL;
      END IF;

      IF v_alq_med_no_amob > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
      ELSE
        v_roi_no_amob := NULL; v_retorno_no_amob := NULL;
      END IF;

      -- Escribir SOLO columnas alquiler + roi. Si la fila no existe (zona con
      -- alquiler y 0 venta), se crea con venta_*=NULL.
      INSERT INTO market_absorption_snapshots (
        fecha, dormitorios, zona, filter_version,
        alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
        alquiler_mensual_p25, alquiler_mensual_p75,
        roi_bruto_anual, anos_retorno,
        roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
      ) VALUES (
        v_fecha, v_dorm, v_zona, 3,
        v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
        v_roi, v_retorno, v_roi_amob, v_roi_no_amob, v_retorno_amob, v_retorno_no_amob
      )
      ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
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
      zona_out := v_zona || ' [alq]';
      insertado := TRUE;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$function$;

-- ============================================================================
-- VALIDACIÓN (correr después de aplicar; la función se ejecuta de noche, o
-- forzar con: SELECT * FROM snapshot_absorcion_mercado();)
-- ============================================================================
-- A) Global de alquiler ya NO incluye ZN (debe bajar ~31 props vs antes):
--   SELECT dormitorios, alquiler_activas, alquiler_mensual_mediana
--   FROM market_absorption_snapshots
--   WHERE zona='global' AND fecha=CURRENT_DATE ORDER BY dormitorios;
--
-- B) Microzonas ZN ahora con alquiler poblado (antes NULL):
--   SELECT zona, dormitorios, alquiler_activas, alquiler_mensual_mediana, roi_bruto_anual
--   FROM market_absorption_snapshots
--   WHERE fecha=CURRENT_DATE AND alquiler_activas IS NOT NULL
--     AND zona LIKE '%anillo%' ORDER BY zona, dormitorios;
--
-- C) Venta NO cambió (comparar venta_activas global con el día previo):
--   SELECT fecha, dormitorios, venta_activas FROM market_absorption_snapshots
--   WHERE zona='global' AND fecha >= CURRENT_DATE - 1 ORDER BY fecha, dormitorios;
-- ============================================================================
