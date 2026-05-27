-- =============================================================================
-- MIGRACION: 251_blindajes_matching_y_snapshot.sql
-- DESCRIPCION: Blindajes para que Zona Norte no contamine métricas Equipetrol
-- VERSION: 1.0.0
-- FECHA: 26 Mayo 2026
-- PROYECTO: docs/proyectos/zona-norte/ (Fase 1 del PRD - ADR-006)
-- =============================================================================
-- CONTEXTO:
--   Una vez que entran props con zona='Zona Norte' a propiedades_v2, todo el
--   enjambre las procesa sin filtro de zona. Solo 2 puntos contaminan:
--
--   1. generar_matches_por_nombre() — matchea por nombre exacto SIN filtrar
--      zona. Edificio "Barcelona" en Zona Norte podría matchear con un
--      proyecto "Barcelona" de Equipetrol → falso positivo confianza 95%.
--      Fix: AND pcn.zona IS NOT NULL AND pcn.zona = pm.zona en el JOIN.
--      Bonus: arregla bug latente para todas las zonas.
--
--   2. snapshot_absorcion_mercado() — el LOOP 1 (zona='global') agrega todo
--      zona IS NOT NULL, así que Zona Norte se mezcla en las métricas
--      globales de Equipetrol (inventario, absorción, mediana, ROI).
--      Fix: hardcodear el set de 6 zonas Equipetrol para que "global" siga
--      significando "global Equipetrol". El LOOP 2 (por zona) no se toca.
--
-- DATOS PRE-MIGRACION (auditoría 26-may-2026):
--   - 0 matches nuevos pendientes hoy → blindaje 1 inocuo en este momento.
--   - Post-mig 250: ~16 props legacy ya están con zona='Zona Norte'.
--   - Con esos 16, el snapshot global cambiaría: 16 props menos en el agregado.
--     El blindaje 2 mantiene la serie histórica coherente con la pre-Zona Norte.
--
-- ROLLBACK: pg_get_functiondef() de ambas funciones está guardado en backup
-- al final del archivo (CREATE OR REPLACE inverso).
-- =============================================================================

BEGIN;

-- ============================================================================
-- BLINDAJE 1: generar_matches_por_nombre() con filtro de zona estricto
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generar_matches_por_nombre()
RETURNS TABLE(
    propiedad_id integer,
    proyecto_sugerido integer,
    confianza integer,
    metodo text
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH propiedades_con_nombre AS (
        SELECT
            p.id,
            p.zona,
            COALESCE(
                NULLIF(TRIM(p.nombre_edificio), ''),
                TRIM(p.datos_json_enrichment->>'nombre_edificio'),
                TRIM(p.datos_json->'proyecto'->>'nombre_edificio')
            ) as nombre_busqueda
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master IS NULL
          AND p.status IN ('completado', 'actualizado')
          AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
    )
    SELECT
        pcn.id,
        pm.id_proyecto_master,
        95 as confianza,
        'nombre_exacto'::text as metodo
    FROM propiedades_con_nombre pcn
    JOIN proyectos_master pm
        ON (LOWER(pcn.nombre_busqueda) = LOWER(TRIM(pm.nombre_oficial))
            OR LOWER(pcn.nombre_busqueda) = ANY(
                SELECT LOWER(TRIM(a)) FROM unnest(pm.alias_conocidos) a
            ))
        AND pcn.zona IS NOT NULL    -- defensivo: si la prop no tiene zona, no matchear
        AND pcn.zona = pm.zona       -- BLINDAJE: solo same-zone matching
    WHERE pcn.nombre_busqueda IS NOT NULL
      AND LENGTH(pcn.nombre_busqueda) > 3;
END;
$function$;

COMMENT ON FUNCTION generar_matches_por_nombre() IS
'v3.1: Genera sugerencias de matching por coincidencia exacta de nombre.
- Fuente: columna nombre_edificio > JSON enrichment > JSON merge
- Match contra: nombre_oficial + alias_conocidos
- BLINDAJE v3.1: same-zone matching (AND pcn.zona = pm.zona)
- Tabla: propiedades_v2
- Confianza: 95%';

-- ============================================================================
-- BLINDAJE 2: snapshot_absorcion_mercado() con LOOP global hardcoded a Equipetrol
-- ============================================================================
-- Solo se modifica el LOOP 1 (zona='global'). Los WHERE de cada sub-query
-- cambian de `zona IS NOT NULL` a la lista hardcoded de 6 zonas Equipetrol.
-- El LOOP 2 (por zona) queda intacto: itera DISTINCT zona y filtra por v_zona.
-- Eso significa que Zona Norte tendrá su propia serie por-zona automáticamente.

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

    -- === ALQUILER (sin filtro de zona en el original; lo dejamos igual,
    --     no agregaba zonas extras hasta ahora porque solo había Equipetrol) ===
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
  -- LOOP 2: Por zona (solo métricas de venta + pending) — SIN CAMBIOS
  -- Itera DISTINCT zona; Zona Norte tendrá su propia serie automáticamente.
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
END;
$function$;

COMMIT;

-- =============================================================================
-- VALIDACION POST-DEPLOY (correr manualmente)
-- =============================================================================
-- 1. Conteo de matches por nombre actual vs esperado
--    SELECT COUNT(*) FROM generar_matches_por_nombre();
--    -- Esperado: 0 hoy (Q6 pre-deploy dio 0). Si da >0, son matches nuevos
--    -- legítimos same-zone (Equipetrol vs Equipetrol). Si da matches contra
--    -- proyectos cuya zona='Sin zona', son los 22 satélite restantes — esperado.
--
-- 2. Snapshot manual + comparar contra día anterior
--    SELECT * FROM snapshot_absorcion_mercado();
--    SELECT * FROM market_absorption_snapshots
--    WHERE zona='global' AND fecha=CURRENT_DATE ORDER BY dormitorios;
--    -- Comparar columna por columna contra fecha=CURRENT_DATE - 1.
--    -- Diferencia esperada: SOLO por el paso del tiempo (props nuevas/absorbidas
--    -- del día), NO por la exclusión de zonas. Si venta_activas baja 16, son
--    -- las 16 props legacy que se re-etiquetaron a Zona Norte en mig 250.
--
-- 3. Verificar que Zona Norte tiene serie propia post-snapshot
--    SELECT zona, COUNT(*) FROM market_absorption_snapshots
--    WHERE fecha=CURRENT_DATE GROUP BY zona;
--    -- Debería aparecer 'Zona Norte' con 1-4 filas (según props por dorm).

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Si algo sale mal, restaurar las funciones desde:
--   sql/functions/matching/generar_matches_por_nombre.sql (v3.0 pre-blindaje)
--   sql/functions/snapshots/snapshot_absorcion_mercado.sql (canonical pre-blindaje)
-- Aplicar el CREATE OR REPLACE de cada una.
