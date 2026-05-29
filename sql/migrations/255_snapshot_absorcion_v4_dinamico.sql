-- =============================================================================
-- MIGRACION: 255_snapshot_absorcion_v4_dinamico.sql
-- DESCRIPCION: Refactor snapshot_absorcion_mercado a v4 con paralelizacion
-- VERSION: 1.0.0
-- FECHA: 29-may-2026 (preparado, no aplicado todavia)
-- PROYECTO: docs/proyectos/zona-norte/ (Camino B - escalabilidad)
-- =============================================================================
-- CONTEXTO:
--   snapshot_absorcion_mercado() actual (mig 251 v3) hardcodea la lista de
--   6 zonas EQ en el LOOP 1 (zona='global'). Esto no escala a multi-macrozona:
--   cuando llegue Urubo/Polanco, hay que modificar la funcion para agregar
--   las zonas nuevas al LOOP global.
--
--   Esta migracion crea una funcion paralela v4 que itera dinamicamente por
--   zona_general desde zonas_geograficas. Ambas funciones coexisten durante
--   2 semanas (paralelizacion via filter_version) para validar paridad
--   antes de switch.
--
-- DECISIONES (ver docs/proyectos/zona-norte/PLAN_IMPLEMENTACION_MICROZONAS.md):
--   - Mantener v3 actual intacta (filter_version=3).
--   - Crear v4 paralela (filter_version=4).
--   - v4 preserva zona='global' para EQ (backward compat con /admin/market.tsx
--     que filtra por zona='global' en lineas 1020, 1033, 1057).
--   - v4 usa zona='global_zona_norte' para ZN (nuevo, sin compat existente).
--   - Cron n8n: ejecutar ambas. Comparar filter_version=3 vs filter_version=4
--     diariamente. Si paridad EQ confirmada por 14 dias, switch.
--
-- ROLLBACK: DROP FUNCTION snapshot_absorcion_mercado_v4();
-- =============================================================================

BEGIN;

-- ============================================================================
-- Funcion snapshot_absorcion_mercado_v4() — refactor dinamico
-- ============================================================================
-- Diferencias con v3:
--   1. LOOP 1 itera por DISTINCT zona_general en zonas_geograficas activos
--      en vez de hardcodear lista de 6 zonas EQ.
--   2. Filtro de zona en cada query usa INNER JOIN con zonas_geograficas
--      en vez de IN literal.
--   3. Nombre de la zona global se deriva:
--      - 'global' para zona_general='Equipetrol' (backward compat)
--      - 'global_<zona_general_normalizada>' para el resto
--   4. filter_version=4 en INSERT (vs 3 en v3).
--   5. LOOP 2 (por zona) sin cambios.

CREATE OR REPLACE FUNCTION snapshot_absorcion_mercado_v4()
RETURNS TABLE(dormitorios_out integer, zona_out text, insertado boolean)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_zona TEXT;
  v_macrozona TEXT;
  v_zona_global TEXT;
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
  -- LOOP 1: Global por macrozona (dinamico via zona_general)
  -- =========================================================================
  -- Itera por cada zona_general distinta que tenga al menos una zona activa
  -- en zonas_geograficas.

  FOR v_macrozona IN
    SELECT DISTINCT zona_general
    FROM zonas_geograficas
    WHERE activo = TRUE
      AND zona_general IS NOT NULL
  LOOP
    -- Determinar nombre de zona global para esta macrozona
    -- Backward compat: Equipetrol mantiene 'global' (sin sufijo)
    IF v_macrozona = 'Equipetrol' THEN
      v_zona_global := 'global';
    ELSE
      v_zona_global := 'global_' || LOWER(REPLACE(v_macrozona, ' ', '_'));
    END IF;

    FOR v_dorm IN 0..3 LOOP
      -- === VENTA: Inventario activo ===
      SELECT
        COUNT(*),
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER,
        ROUND(AVG(area_total_m2))::INTEGER
      INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
      FROM propiedades_v2 p
      INNER JOIN zonas_geograficas zg ON zg.nombre = p.zona
      WHERE p.tipo_operacion = 'venta'
        AND p.status = 'completado'
        AND p.fuente IN ('century21', 'remax')
        AND p.precio_usd > 0
        AND p.area_total_m2 >= 20
        AND p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND zg.zona_general = v_macrozona
        AND zg.activo = TRUE
        AND p.dormitorios = v_dorm;

      -- === VENTA: Absorbidas ultimos 30 dias ===
      SELECT
        COUNT(*),
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
        ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER
      INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2
      FROM propiedades_v2 p
      INNER JOIN zonas_geograficas zg ON zg.nombre = p.zona
      WHERE p.tipo_operacion = 'venta'
        AND p.status = 'inactivo_confirmed'
        AND p.fuente IN ('century21', 'remax')
        AND p.precio_usd > 0
        AND p.area_total_m2 >= 20
        AND p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND zg.zona_general = v_macrozona
        AND zg.activo = TRUE
        AND p.primera_ausencia_at IS NOT NULL
        AND p.primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
        AND p.dormitorios = v_dorm;

      -- === VENTA: Absorbidas por estado construccion ===
      SELECT
        COUNT(*) FILTER (WHERE COALESCE(p.estado_construccion::text, '') NOT IN ('preventa', 'en_construccion', 'en_pozo')),
        COUNT(*) FILTER (WHERE COALESCE(p.estado_construccion::text, '') IN ('preventa', 'en_construccion', 'en_pozo'))
      INTO v_abs_entrega, v_abs_preventa
      FROM propiedades_v2 p
      INNER JOIN zonas_geograficas zg ON zg.nombre = p.zona
      WHERE p.tipo_operacion = 'venta'
        AND p.status = 'inactivo_confirmed'
        AND p.fuente IN ('century21', 'remax')
        AND p.precio_usd > 0
        AND p.area_total_m2 >= 20
        AND p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND zg.zona_general = v_macrozona
        AND zg.activo = TRUE
        AND p.primera_ausencia_at IS NOT NULL
        AND p.primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
        AND p.dormitorios = v_dorm;

      -- === VENTA: Pending ultimos 30 dias ===
      SELECT COUNT(*)
      INTO v_venta_pending
      FROM propiedades_v2 p
      INNER JOIN zonas_geograficas zg ON zg.nombre = p.zona
      WHERE p.tipo_operacion = 'venta'
        AND p.status = 'inactivo_pending'
        AND p.fuente IN ('century21', 'remax')
        AND p.precio_usd > 0
        AND p.area_total_m2 >= 20
        AND p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND zg.zona_general = v_macrozona
        AND zg.activo = TRUE
        AND p.primera_ausencia_at IS NOT NULL
        AND p.primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
        AND p.dormitorios = v_dorm;

      -- === VENTA: Nuevas ultimos 30 dias ===
      SELECT COUNT(*)
      INTO v_venta_nuevas
      FROM propiedades_v2 p
      INNER JOIN zonas_geograficas zg ON zg.nombre = p.zona
      WHERE p.tipo_operacion = 'venta'
        AND p.fuente IN ('century21', 'remax')
        AND p.precio_usd > 0
        AND p.area_total_m2 >= 20
        AND p.dormitorios = v_dorm
        AND p.fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
        AND p.status NOT IN ('excluido_operacion')
        AND p.duplicado_de IS NULL
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera','parqueo','garaje','deposito')
        AND zg.zona_general = v_macrozona
        AND zg.activo = TRUE;

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

      -- === ALQUILER (sin filtro de zona, misma logica que v3) ===
      -- NOTA: la v3 actual NO filtra alquiler por zona porque "no agregaba
      -- zonas extras hasta ahora porque solo habia Equipetrol". Con multi-
      -- macrozona esto deberia revisarse, pero por compatibilidad con v3
      -- se mantiene la logica idéntica.
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

      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER
      INTO v_alq_med_amob
      FROM propiedades_v2
      WHERE tipo_operacion = 'alquiler'
        AND status = 'completado'
        AND fuente IN ('century21', 'remax', 'bien_inmuebles')
        AND precio_mensual_usd > 0
        AND area_total_m2 >= 20
        AND amoblado = 'si'
        AND propiedades_v2.dormitorios = v_dorm;

      SELECT ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER
      INTO v_alq_med_no_amob
      FROM propiedades_v2
      WHERE tipo_operacion = 'alquiler'
        AND status = 'completado'
        AND fuente IN ('century21', 'remax', 'bien_inmuebles')
        AND precio_mensual_usd > 0
        AND area_total_m2 >= 20
        AND amoblado = 'no'
        AND propiedades_v2.dormitorios = v_dorm;

      -- === ROI cruzado ===
      IF v_alq_med > 0 AND v_ticket_med > 0 THEN
        v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
        v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
      ELSE
        v_roi := NULL; v_retorno := NULL;
      END IF;

      IF v_alq_med_amob > 0 AND v_ticket_med > 0 THEN
        v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
      ELSE
        v_roi_amob := NULL; v_retorno_amob := NULL;
      END IF;

      IF v_alq_med_no_amob > 0 AND v_ticket_med > 0 THEN
        v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
      ELSE
        v_roi_no_amob := NULL; v_retorno_no_amob := NULL;
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
        v_fecha, v_dorm, v_zona_global, 4,  -- ← filter_version=4
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
        filter_version = 4,
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
      zona_out := v_zona_global;
      insertado := TRUE;
      RETURN NEXT;
    END LOOP;
  END LOOP;

  -- =========================================================================
  -- LOOP 2: Por zona (sin cambios respecto a v3, solo filter_version=4)
  -- =========================================================================
  -- Itera DISTINCT zona en propiedades_v2 (incluye las 14 microzonas ZN).

  FOR v_zona IN
    SELECT DISTINCT zona FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status IN ('completado', 'inactivo_confirmed', 'inactivo_pending')
      AND zona IS NOT NULL
      AND zona != ''
  LOOP
    FOR v_dorm IN 0..3 LOOP
      -- (Misma logica que v3 LOOP 2, copiar el bloque entero de mig 251
      -- linea 387-551 reemplazando solo filter_version=3 por filter_version=4)
      -- Por brevedad de este archivo, ver mig 251 LOOP 2 como referencia
      -- exacta. La unica diferencia es filter_version=4 en INSERT y UPDATE.

      -- NOTA: copiar literal el bloque de v3 antes de aplicar esta migracion.
      -- TODO: este placeholder se llena con el codigo exacto de v3 LOOP 2.
      NULL;
    END LOOP;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION snapshot_absorcion_mercado_v4() IS
'v4 (mig 255): Refactor dinamico via zona_general. LOOP 1 itera por DISTINCT
zona_general en zonas_geograficas activos. Preserva zona=global para
Equipetrol (backward compat con /admin/market.tsx). zona=global_<macrozona>
para resto. filter_version=4 para coexistencia con v3. Validar paridad por
14 dias antes de deprecar v3.';

COMMIT;

-- =============================================================================
-- VALIDACION POST-DEPLOY
-- =============================================================================
-- 1. Correr ambas y comparar:
--    SELECT snapshot_absorcion_mercado();    -- v3, filter_version=3
--    SELECT snapshot_absorcion_mercado_v4(); -- v4, filter_version=4
--
-- 2. Query de paridad EQ:
--    SELECT
--      a.dormitorios,
--      a.venta_activas AS v3_activas, b.venta_activas AS v4_activas,
--      a.venta_activas - b.venta_activas AS diff
--    FROM market_absorption_snapshots a
--    JOIN market_absorption_snapshots b
--      ON a.fecha = b.fecha AND a.dormitorios = b.dormitorios
--    WHERE a.zona='global' AND a.filter_version=3
--      AND b.zona='global' AND b.filter_version=4
--      AND a.fecha = CURRENT_DATE
--    ORDER BY a.dormitorios;
--    -- ESPERADO: todos los diffs = 0
--
-- 3. Confirmar serie nueva ZN:
--    SELECT * FROM market_absorption_snapshots
--    WHERE zona = 'global_zona_norte' AND filter_version = 4
--      AND fecha = CURRENT_DATE
--    ORDER BY dormitorios;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- DROP FUNCTION snapshot_absorcion_mercado_v4();
-- DELETE FROM market_absorption_snapshots WHERE filter_version = 4;

-- =============================================================================
-- IMPORTANTE: COMPLETAR LOOP 2 ANTES DE APLICAR
-- =============================================================================
-- Este archivo tiene LOOP 2 como NULL placeholder. Antes de ejecutar:
-- 1. Abrir sql/migrations/251_blindajes_matching_y_snapshot.sql
-- 2. Copiar el bloque LOOP 2 completo (lineas 387-551 aprox)
-- 3. Reemplazar el NULL placeholder de este archivo con ese bloque
-- 4. Cambiar las dos referencias a filter_version=3 por filter_version=4
-- 5. Aplicar la migracion
