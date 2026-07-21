-- =============================================================================
-- 283 · Snapshot de absorción SHADOW — tabla + función (serie TC-nuevo)
-- =============================================================================
-- Qué: la serie diaria de mercado del entorno SHADOW (régimen TC nuevo), que
-- arranca AHORA porque la absorción no se reconstruye hacia atrás (regla 11 /
-- CUTOVER_DATA_PLAN §D). NO es un espejo ciego de snapshot_absorcion_mercado():
--
--   DIFERENCIAS DELIBERADAS vs la función de prod (verificadas contra la BD):
--   1. Normalización: activas leen precio_norm/precio_m2 de las VISTAS shadow
--      (que usan precio_normalizado_shadow = régimen TC nuevo). Absorbidas /
--      pending / nuevas (fuera de las vistas) usan precio_normalizado_shadow()
--      sobre la tabla. NUNCA precio_normalizado() (régimen viejo, inflaría).
--   2. Alquiler en USD: usa `precio_mensual` (USD al TC nuevo, 202/202 poblado).
--      NO precio_mensual_usd (11/202) NI bob/6.96 (inflaría el yield ~1.55x).
--      El ROI queda dólares-reales ÷ dólares-reales.
--   3. Pending: el verificador shadow NO usa status='inactivo_pending' — la
--      gracia es status='completado' + primera_ausencia_at seteado (la prop
--      sigue en feed). venta_pending_30d cuenta ESO.
--   4. Filtros de calidad: las activas se leen de las vistas (los filtros viven
--      ahí — CUTOVER_DATA_PLAN §C, anti ticket #15). Solo lo que no está en
--      vista (bajas/nuevas) replica filtros mínimos sobre la tabla.
--   5. Cortes nuevos (cobertura verificada 21-jul): spread preventa/entrega del
--      inventario ACTIVO (global + por zona), amoblado venta (datos_json, 76),
--      equipado venta (118) / alquiler (67), parqueo declarado (141/68).
--      Solo el positivo declarado (regla fiduciaria de flags). Piso y expensas
--      quedan fuera (cobertura insuficiente / los portales no lo publican).
--
-- TABLA APARTE (no market_absorption_snapshots): el UNIQUE de la tabla de prod
-- es (fecha, dormitorios, zona) SIN filter_version → escribir ahí PISARÍA la
-- serie v3 de prod. filter_version=4 queda como marca de procedencia.
--
-- Caveats de serie nueva (documentados, no bugs):
--   - Absorción arranca en 0 (el verificador shadow recién empieza a confirmar
--     bajas). Ruidosa los primeros ~30-60 días.
--   - venta_nuevas_30d inflada hasta ~20-ago (bulk-load de julio cuenta como
--     "nueva" via fecha_creacion).
--   - roi_no_amoblado casi siempre NULL al inicio (amoblado='no' n=1).
--   - Toda mediana viaja con su conteo: el consumidor gatea por n.
--
-- La ejecuta cada noche scripts/deptos-equipetrol/snapshot-shadow.mjs
-- (service_role) al final del cron híbrido. Al cutover esta serie se convierte
-- en LA serie (ver CUTOVER_DATA_PLAN §Lanzamiento TC nuevo).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Tabla (columnas de prod + cortes nuevos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.market_absorption_snapshots_shadow (
  id BIGSERIAL PRIMARY KEY,
  fecha DATE NOT NULL,
  dormitorios INTEGER NOT NULL,
  zona TEXT NOT NULL,
  filter_version SMALLINT NOT NULL DEFAULT 4,
  -- Venta (espejo estructural de prod, valores en régimen TC nuevo)
  venta_activas INTEGER,
  venta_absorbidas_30d INTEGER,
  venta_nuevas_30d INTEGER,
  venta_pending_30d INTEGER,
  venta_tasa_absorcion NUMERIC(5,2),
  venta_meses_inventario NUMERIC(5,1),
  venta_ticket_promedio INTEGER,
  venta_ticket_mediana INTEGER,
  venta_ticket_p25 INTEGER,
  venta_ticket_p75 INTEGER,
  venta_usd_m2 INTEGER,
  venta_area_promedio INTEGER,
  absorbidas_ticket_promedio INTEGER,
  absorbidas_usd_m2 INTEGER,
  venta_absorbidas_entrega INTEGER,
  venta_absorbidas_preventa INTEGER,
  -- Corte NUEVO: spread preventa vs entrega del inventario ACTIVO
  -- (preventa = preventa/en_construccion/en_pozo; entrega = 'entrega_inmediata'
  --  EXPLÍCITO; sin dato queda fuera de ambos lados — no diluye el spread)
  venta_activas_preventa INTEGER,
  venta_activas_entrega INTEGER,
  venta_preventa_mediana INTEGER,
  venta_entrega_mediana INTEGER,
  venta_preventa_usd_m2 INTEGER,
  venta_entrega_usd_m2 INTEGER,
  -- Cortes NUEVOS venta (solo positivo declarado; NULL = sin corte ese día)
  venta_amobladas INTEGER,
  venta_amobladas_mediana INTEGER,
  venta_equipadas INTEGER,
  venta_equipadas_mediana INTEGER,
  venta_con_parqueo INTEGER,
  venta_con_parqueo_mediana INTEGER,
  -- Alquiler (USD = precio_mensual, TC nuevo)
  alquiler_activas INTEGER,
  alquiler_mensual_promedio INTEGER,
  alquiler_mensual_mediana INTEGER,
  alquiler_mensual_p25 INTEGER,
  alquiler_mensual_p75 INTEGER,
  -- Cortes NUEVOS alquiler
  alquiler_equipadas INTEGER,
  alquiler_equipadas_mediana INTEGER,
  alquiler_con_parqueo INTEGER,
  alquiler_con_parqueo_mediana INTEGER,
  -- Cruce (yield)
  roi_bruto_anual NUMERIC(5,2),
  anos_retorno NUMERIC(5,1),
  roi_amoblado NUMERIC(5,2),
  roi_no_amoblado NUMERIC(5,2),
  anos_retorno_amoblado NUMERIC(5,1),
  anos_retorno_no_amoblado NUMERIC(5,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mas_shadow_unq UNIQUE (fecha, dormitorios, zona)
);

COMMENT ON TABLE public.market_absorption_snapshots_shadow IS
  'Serie diaria de mercado del entorno SHADOW (régimen TC nuevo), Equipetrol. '
  'Escribe snapshot_absorcion_mercado_shadow() cada noche (cron híbrido, paso '
  'snapshot-shadow.mjs). Serie SEPARADA de market_absorption_snapshots (su '
  'UNIQUE no distingue filter_version). Consumers: /mercado (gráfico histórico '
  'al acumular serie), métricas de inversión. Creada en migración 283.';

CREATE INDEX IF NOT EXISTS mas_shadow_idx_fecha
  ON public.market_absorption_snapshots_shadow(fecha DESC);

-- Preset D — Operacional interna (sin acceso desde browser)
GRANT ALL    ON public.market_absorption_snapshots_shadow TO service_role;
GRANT SELECT ON public.market_absorption_snapshots_shadow TO claude_readonly;
GRANT USAGE, SELECT ON SEQUENCE public.market_absorption_snapshots_shadow_id_seq TO service_role;

-- -----------------------------------------------------------------------------
-- 2. Función (SECURITY INVOKER — la llama service_role, que ya tiene permisos)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_absorcion_mercado_shadow()
RETURNS TABLE(dormitorios_out INTEGER, zona_out TEXT, insertado BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_zona TEXT;
  -- Venta
  v_venta_activas INTEGER; v_venta_absorbidas INTEGER; v_venta_nuevas INTEGER;
  v_venta_pending INTEGER; v_abs_entrega INTEGER; v_abs_preventa INTEGER;
  v_tasa NUMERIC(5,2); v_meses NUMERIC(5,1);
  v_ticket_prom INTEGER; v_ticket_med INTEGER; v_ticket_p25 INTEGER; v_ticket_p75 INTEGER;
  v_usd_m2 INTEGER; v_area_prom INTEGER; v_abs_ticket INTEGER; v_abs_usd_m2 INTEGER;
  -- Spread activo preventa/entrega
  v_act_prev INTEGER; v_act_entr INTEGER;
  v_prev_med INTEGER; v_entr_med INTEGER; v_prev_m2 INTEGER; v_entr_m2 INTEGER;
  -- Cortes venta
  v_amob_n INTEGER; v_amob_med INTEGER; v_equip_n INTEGER; v_equip_med INTEGER;
  v_parq_n INTEGER; v_parq_med INTEGER;
  -- Alquiler
  v_alq_activas INTEGER; v_alq_prom INTEGER; v_alq_med INTEGER;
  v_alq_p25 INTEGER; v_alq_p75 INTEGER;
  v_alq_equip_n INTEGER; v_alq_equip_med INTEGER;
  v_alq_parq_n INTEGER; v_alq_parq_med INTEGER;
  v_alq_med_amob INTEGER; v_alq_med_no_amob INTEGER;
  -- ROI
  v_roi NUMERIC(5,2); v_retorno NUMERIC(5,1);
  v_roi_amob NUMERIC(5,2); v_roi_no_amob NUMERIC(5,2);
  v_retorno_amob NUMERIC(5,1); v_retorno_no_amob NUMERIC(5,1);
BEGIN
  -- ===========================================================================
  -- LOOP 1: Global (zona='global') — blindado a las 6 zonas Equipetrol
  -- ===========================================================================
  FOR v_dorm IN 0..3 LOOP

    -- VENTA activas: desde la VISTA (precio_norm/precio_m2 = régimen nuevo)
    SELECT COUNT(*),
           ROUND(AVG(precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_m2))::INTEGER,
           ROUND(AVG(area_total_m2))::INTEGER
    INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
    FROM v_mercado_venta_shadow
    WHERE dormitorios = v_dorm
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo');

    -- Spread ACTIVO preventa vs entrega (entrega = explícito; sin dato afuera)
    SELECT COUNT(*) FILTER (WHERE estado_construccion::text IN ('preventa','en_construccion','en_pozo')),
           COUNT(*) FILTER (WHERE estado_construccion::text = 'entrega_inmediata'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)
             FILTER (WHERE estado_construccion::text IN ('preventa','en_construccion','en_pozo')))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)
             FILTER (WHERE estado_construccion::text = 'entrega_inmediata'))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)
             FILTER (WHERE estado_construccion::text IN ('preventa','en_construccion','en_pozo')))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)
             FILTER (WHERE estado_construccion::text = 'entrega_inmediata'))::INTEGER
    INTO v_act_prev, v_act_entr, v_prev_med, v_entr_med, v_prev_m2, v_entr_m2
    FROM v_mercado_venta_shadow
    WHERE dormitorios = v_dorm
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo');

    -- Cortes venta: amoblado/equipado (datos_json de la tabla, ids de la vista)
    -- y parqueo declarado (columnas de la vista)
    SELECT COUNT(*) FILTER (WHERE t.datos_json->>'amoblado' = 'true'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_norm)
             FILTER (WHERE t.datos_json->>'amoblado' = 'true'))::INTEGER,
           COUNT(*) FILTER (WHERE t.datos_json->>'equipado' = 'true'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_norm)
             FILTER (WHERE t.datos_json->>'equipado' = 'true'))::INTEGER,
           COUNT(*) FILTER (WHERE COALESCE(v.estacionamientos,0) >= 1 OR v.parqueo_incluido = true),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_norm)
             FILTER (WHERE COALESCE(v.estacionamientos,0) >= 1 OR v.parqueo_incluido = true))::INTEGER
    INTO v_amob_n, v_amob_med, v_equip_n, v_equip_med, v_parq_n, v_parq_med
    FROM v_mercado_venta_shadow v
    JOIN propiedades_v2_shadow t ON t.id = v.id
    WHERE v.dormitorios = v_dorm
      AND v.zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo');

    -- VENTA absorbidas 30d (tabla; precios con la normalización SHADOW)
    SELECT COUNT(*),
           ROUND(AVG(precio_normalizado_shadow(precio_usd, tipo_cambio_detectado)))::INTEGER,
           ROUND(AVG(precio_normalizado_shadow(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2,0)))::INTEGER,
           COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text,'') NOT IN ('preventa','en_construccion','en_pozo')),
           COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text,'') IN ('preventa','en_construccion','en_pozo'))
    INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2, v_abs_entrega, v_abs_preventa
    FROM propiedades_v2_shadow
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND precio_usd > 0 AND area_total_m2 >= 20
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND dormitorios = v_dorm;

    -- VENTA pending: en GRACIA del verificador shadow (completado + contador)
    SELECT COUNT(*)
    INTO v_venta_pending
    FROM propiedades_v2_shadow
    WHERE tipo_operacion = 'venta'
      AND status = 'completado'
      AND primera_ausencia_at IS NOT NULL
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
      AND precio_usd > 0 AND area_total_m2 >= 20
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo')
      AND dormitorios = v_dorm;

    -- VENTA nuevas 30d (fecha_creacion = captura; inflada hasta ~20-ago, ver header)
    SELECT COUNT(*)
    INTO v_venta_nuevas
    FROM propiedades_v2_shadow
    WHERE tipo_operacion = 'venta'
      AND precio_usd > 0 AND area_total_m2 >= 20
      AND dormitorios = v_dorm
      AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
      AND status NOT IN ('excluido_operacion')
      AND duplicado_de IS NULL
      AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
      AND COALESCE(tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
      AND zona IN ('Equipetrol Centro','Equipetrol Norte','Sirari','Villa Brigida','Equipetrol Oeste','Eq. 3er Anillo');

    -- Tasa y meses
    IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
    ELSE v_tasa := 0; END IF;
    IF v_venta_absorbidas > 0 THEN
      v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
    ELSE v_meses := NULL; END IF;

    -- ALQUILER activas: desde la VISTA, USD = precio_mensual (TC nuevo)
    SELECT COUNT(*),
           ROUND(AVG(precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
             FILTER (WHERE amoblado = 'si'))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
             FILTER (WHERE amoblado = 'no'))::INTEGER,
           COUNT(*) FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
             FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true))::INTEGER
    INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
         v_alq_med_amob, v_alq_med_no_amob, v_alq_parq_n, v_alq_parq_med
    FROM v_mercado_alquiler_shadow
    WHERE dormitorios = v_dorm
      AND zona_general = 'Equipetrol';

    -- ALQUILER equipado (datos_json de la tabla, ids de la vista)
    SELECT COUNT(*) FILTER (WHERE t.datos_json->>'equipado' = 'true'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_mensual)
             FILTER (WHERE t.datos_json->>'equipado' = 'true'))::INTEGER
    INTO v_alq_equip_n, v_alq_equip_med
    FROM v_mercado_alquiler_shadow v
    JOIN propiedades_v2_shadow t ON t.id = v.id
    WHERE v.dormitorios = v_dorm
      AND v.zona_general = 'Equipetrol';

    -- ROI cruzado (USD real ÷ USD real)
    IF v_alq_med > 0 AND v_ticket_med > 0 THEN
      v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
      v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
    ELSE v_roi := NULL; v_retorno := NULL; END IF;
    IF v_alq_med_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
    ELSE v_roi_amob := NULL; v_retorno_amob := NULL; END IF;
    IF v_alq_med_no_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
    ELSE v_roi_no_amob := NULL; v_retorno_no_amob := NULL; END IF;

    INSERT INTO market_absorption_snapshots_shadow (
      fecha, dormitorios, zona, filter_version,
      venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
      venta_tasa_absorcion, venta_meses_inventario,
      venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
      venta_usd_m2, venta_area_promedio,
      absorbidas_ticket_promedio, absorbidas_usd_m2,
      venta_absorbidas_entrega, venta_absorbidas_preventa,
      venta_activas_preventa, venta_activas_entrega,
      venta_preventa_mediana, venta_entrega_mediana, venta_preventa_usd_m2, venta_entrega_usd_m2,
      venta_amobladas, venta_amobladas_mediana,
      venta_equipadas, venta_equipadas_mediana,
      venta_con_parqueo, venta_con_parqueo_mediana,
      alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
      alquiler_mensual_p25, alquiler_mensual_p75,
      alquiler_equipadas, alquiler_equipadas_mediana,
      alquiler_con_parqueo, alquiler_con_parqueo_mediana,
      roi_bruto_anual, anos_retorno,
      roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
    ) VALUES (
      v_fecha, v_dorm, 'global', 4,
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_abs_ticket, v_abs_usd_m2,
      v_abs_entrega, v_abs_preventa,
      v_act_prev, v_act_entr,
      v_prev_med, v_entr_med, v_prev_m2, v_entr_m2,
      v_amob_n, v_amob_med,
      v_equip_n, v_equip_med,
      v_parq_n, v_parq_med,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_alq_equip_n, v_alq_equip_med,
      v_alq_parq_n, v_alq_parq_med,
      v_roi, v_retorno,
      v_roi_amob, v_roi_no_amob, v_retorno_amob, v_retorno_no_amob
    )
    ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
      filter_version = EXCLUDED.filter_version,
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
      venta_activas_preventa = EXCLUDED.venta_activas_preventa,
      venta_activas_entrega = EXCLUDED.venta_activas_entrega,
      venta_preventa_mediana = EXCLUDED.venta_preventa_mediana,
      venta_entrega_mediana = EXCLUDED.venta_entrega_mediana,
      venta_preventa_usd_m2 = EXCLUDED.venta_preventa_usd_m2,
      venta_entrega_usd_m2 = EXCLUDED.venta_entrega_usd_m2,
      venta_amobladas = EXCLUDED.venta_amobladas,
      venta_amobladas_mediana = EXCLUDED.venta_amobladas_mediana,
      venta_equipadas = EXCLUDED.venta_equipadas,
      venta_equipadas_mediana = EXCLUDED.venta_equipadas_mediana,
      venta_con_parqueo = EXCLUDED.venta_con_parqueo,
      venta_con_parqueo_mediana = EXCLUDED.venta_con_parqueo_mediana,
      alquiler_activas = EXCLUDED.alquiler_activas,
      alquiler_mensual_promedio = EXCLUDED.alquiler_mensual_promedio,
      alquiler_mensual_mediana = EXCLUDED.alquiler_mensual_mediana,
      alquiler_mensual_p25 = EXCLUDED.alquiler_mensual_p25,
      alquiler_mensual_p75 = EXCLUDED.alquiler_mensual_p75,
      alquiler_equipadas = EXCLUDED.alquiler_equipadas,
      alquiler_equipadas_mediana = EXCLUDED.alquiler_equipadas_mediana,
      alquiler_con_parqueo = EXCLUDED.alquiler_con_parqueo,
      alquiler_con_parqueo_mediana = EXCLUDED.alquiler_con_parqueo_mediana,
      roi_bruto_anual = EXCLUDED.roi_bruto_anual,
      anos_retorno = EXCLUDED.anos_retorno,
      roi_amoblado = EXCLUDED.roi_amoblado,
      roi_no_amoblado = EXCLUDED.roi_no_amoblado,
      anos_retorno_amoblado = EXCLUDED.anos_retorno_amoblado,
      anos_retorno_no_amoblado = EXCLUDED.anos_retorno_no_amoblado,
      created_at = NOW();

    dormitorios_out := v_dorm; zona_out := 'global'; insertado := TRUE;
    RETURN NEXT;
  END LOOP;

  -- ===========================================================================
  -- LOOP 2: Venta por zona (espejo estructural + spread preventa/entrega)
  -- ===========================================================================
  FOR v_zona IN
    SELECT DISTINCT zona FROM v_mercado_venta_shadow WHERE zona IS NOT NULL AND zona <> ''
  LOOP
    FOR v_dorm IN 0..3 LOOP

      SELECT COUNT(*),
             ROUND(AVG(precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_m2))::INTEGER,
             ROUND(AVG(area_total_m2))::INTEGER,
             COUNT(*) FILTER (WHERE estado_construccion::text IN ('preventa','en_construccion','en_pozo')),
             COUNT(*) FILTER (WHERE estado_construccion::text = 'entrega_inmediata'),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)
               FILTER (WHERE estado_construccion::text IN ('preventa','en_construccion','en_pozo')))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_norm)
               FILTER (WHERE estado_construccion::text = 'entrega_inmediata'))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)
               FILTER (WHERE estado_construccion::text IN ('preventa','en_construccion','en_pozo')))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_m2)
               FILTER (WHERE estado_construccion::text = 'entrega_inmediata'))::INTEGER
      INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom,
           v_act_prev, v_act_entr, v_prev_med, v_entr_med, v_prev_m2, v_entr_m2
      FROM v_mercado_venta_shadow
      WHERE dormitorios = v_dorm AND zona = v_zona;

      IF v_venta_activas = 0 OR v_venta_activas IS NULL THEN
        CONTINUE;
      END IF;

      SELECT COUNT(*),
             ROUND(AVG(precio_normalizado_shadow(precio_usd, tipo_cambio_detectado)))::INTEGER,
             ROUND(AVG(precio_normalizado_shadow(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2,0)))::INTEGER,
             COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text,'') NOT IN ('preventa','en_construccion','en_pozo')),
             COUNT(*) FILTER (WHERE COALESCE(estado_construccion::text,'') IN ('preventa','en_construccion','en_pozo'))
      INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2, v_abs_entrega, v_abs_preventa
      FROM propiedades_v2_shadow
      WHERE tipo_operacion = 'venta'
        AND status = 'inactivo_confirmed'
        AND precio_usd > 0 AND area_total_m2 >= 20
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
        AND dormitorios = v_dorm AND zona = v_zona
        AND primera_ausencia_at IS NOT NULL
        AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

      SELECT COUNT(*)
      INTO v_venta_pending
      FROM propiedades_v2_shadow
      WHERE tipo_operacion = 'venta'
        AND status = 'completado'
        AND primera_ausencia_at IS NOT NULL
        AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days'
        AND precio_usd > 0 AND area_total_m2 >= 20
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito')
        AND dormitorios = v_dorm AND zona = v_zona;

      SELECT COUNT(*)
      INTO v_venta_nuevas
      FROM propiedades_v2_shadow
      WHERE tipo_operacion = 'venta'
        AND precio_usd > 0 AND area_total_m2 >= 20
        AND dormitorios = v_dorm AND zona = v_zona
        AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
        AND status NOT IN ('excluido_operacion')
        AND duplicado_de IS NULL
        AND (es_multiproyecto = false OR es_multiproyecto IS NULL)
        AND COALESCE(tipo_propiedad_original,'') NOT IN ('baulera','parqueo','garaje','deposito');

      IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
        v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
      ELSE v_tasa := 0; END IF;
      IF v_venta_absorbidas > 0 THEN
        v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
      ELSE v_meses := NULL; END IF;

      INSERT INTO market_absorption_snapshots_shadow (
        fecha, dormitorios, zona, filter_version,
        venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
        venta_tasa_absorcion, venta_meses_inventario,
        venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
        venta_usd_m2, venta_area_promedio,
        absorbidas_ticket_promedio, absorbidas_usd_m2,
        venta_absorbidas_entrega, venta_absorbidas_preventa,
        venta_activas_preventa, venta_activas_entrega,
        venta_preventa_mediana, venta_entrega_mediana, venta_preventa_usd_m2, venta_entrega_usd_m2
      ) VALUES (
        v_fecha, v_dorm, v_zona, 4,
        v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
        v_tasa, v_meses,
        v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
        v_usd_m2, v_area_prom,
        v_abs_ticket, v_abs_usd_m2,
        v_abs_entrega, v_abs_preventa,
        v_act_prev, v_act_entr,
        v_prev_med, v_entr_med, v_prev_m2, v_entr_m2
      )
      ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
        filter_version = EXCLUDED.filter_version,
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
        venta_activas_preventa = EXCLUDED.venta_activas_preventa,
        venta_activas_entrega = EXCLUDED.venta_activas_entrega,
        venta_preventa_mediana = EXCLUDED.venta_preventa_mediana,
        venta_entrega_mediana = EXCLUDED.venta_entrega_mediana,
        venta_preventa_usd_m2 = EXCLUDED.venta_preventa_usd_m2,
        venta_entrega_usd_m2 = EXCLUDED.venta_entrega_usd_m2,
        created_at = NOW();

      dormitorios_out := v_dorm; zona_out := v_zona; insertado := TRUE;
      RETURN NEXT;
    END LOOP;
  END LOOP;

  -- ===========================================================================
  -- LOOP 3: Alquiler por zona (escribe SOLO columnas alquiler + ROI)
  -- ===========================================================================
  FOR v_zona IN
    SELECT DISTINCT zona FROM v_mercado_alquiler_shadow
    WHERE zona IS NOT NULL AND zona <> '' AND zona_general = 'Equipetrol'
  LOOP
    FOR v_dorm IN 0..3 LOOP

      SELECT COUNT(*),
             ROUND(AVG(precio_mensual))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
             ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
             ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
               FILTER (WHERE amoblado = 'si'))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
               FILTER (WHERE amoblado = 'no'))::INTEGER,
             COUNT(*) FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
               FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true))::INTEGER
      INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
           v_alq_med_amob, v_alq_med_no_amob, v_alq_parq_n, v_alq_parq_med
      FROM v_mercado_alquiler_shadow
      WHERE dormitorios = v_dorm AND zona = v_zona;

      IF v_alq_activas = 0 OR v_alq_activas IS NULL THEN
        CONTINUE;
      END IF;

      SELECT COUNT(*) FILTER (WHERE t.datos_json->>'equipado' = 'true'),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_mensual)
               FILTER (WHERE t.datos_json->>'equipado' = 'true'))::INTEGER
      INTO v_alq_equip_n, v_alq_equip_med
      FROM v_mercado_alquiler_shadow v
      JOIN propiedades_v2_shadow t ON t.id = v.id
      WHERE v.dormitorios = v_dorm AND v.zona = v_zona;

      -- Ticket mediano de venta de esta zona+dorm (fila del LOOP 2 de HOY;
      -- NULL si la zona no tiene venta → ROI NULL, correcto)
      v_ticket_med := NULL;
      SELECT venta_ticket_mediana INTO v_ticket_med
      FROM market_absorption_snapshots_shadow
      WHERE fecha = v_fecha AND dormitorios = v_dorm AND zona = v_zona;

      IF v_alq_med > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
        v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
      ELSE v_roi := NULL; v_retorno := NULL; END IF;
      IF v_alq_med_amob > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
      ELSE v_roi_amob := NULL; v_retorno_amob := NULL; END IF;
      IF v_alq_med_no_amob > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
      ELSE v_roi_no_amob := NULL; v_retorno_no_amob := NULL; END IF;

      INSERT INTO market_absorption_snapshots_shadow (
        fecha, dormitorios, zona, filter_version,
        alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
        alquiler_mensual_p25, alquiler_mensual_p75,
        alquiler_equipadas, alquiler_equipadas_mediana,
        alquiler_con_parqueo, alquiler_con_parqueo_mediana,
        roi_bruto_anual, anos_retorno,
        roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
      ) VALUES (
        v_fecha, v_dorm, v_zona, 4,
        v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
        v_alq_equip_n, v_alq_equip_med,
        v_alq_parq_n, v_alq_parq_med,
        v_roi, v_retorno, v_roi_amob, v_roi_no_amob, v_retorno_amob, v_retorno_no_amob
      )
      ON CONFLICT (fecha, dormitorios, zona) DO UPDATE SET
        alquiler_activas = EXCLUDED.alquiler_activas,
        alquiler_mensual_promedio = EXCLUDED.alquiler_mensual_promedio,
        alquiler_mensual_mediana = EXCLUDED.alquiler_mensual_mediana,
        alquiler_mensual_p25 = EXCLUDED.alquiler_mensual_p25,
        alquiler_mensual_p75 = EXCLUDED.alquiler_mensual_p75,
        alquiler_equipadas = EXCLUDED.alquiler_equipadas,
        alquiler_equipadas_mediana = EXCLUDED.alquiler_equipadas_mediana,
        alquiler_con_parqueo = EXCLUDED.alquiler_con_parqueo,
        alquiler_con_parqueo_mediana = EXCLUDED.alquiler_con_parqueo_mediana,
        roi_bruto_anual = EXCLUDED.roi_bruto_anual,
        anos_retorno = EXCLUDED.anos_retorno,
        roi_amoblado = EXCLUDED.roi_amoblado,
        roi_no_amoblado = EXCLUDED.roi_no_amoblado,
        anos_retorno_amoblado = EXCLUDED.anos_retorno_amoblado,
        anos_retorno_no_amoblado = EXCLUDED.anos_retorno_no_amoblado,
        created_at = NOW();

      dormitorios_out := v_dorm; zona_out := v_zona || ' [alq]'; insertado := TRUE;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.snapshot_absorcion_mercado_shadow() IS
  'Snapshot diario de mercado del entorno SHADOW (régimen TC nuevo). Lee '
  'v_mercado_venta_shadow + v_mercado_alquiler_shadow (activas) y '
  'propiedades_v2_shadow (bajas/pending/nuevas, con precio_normalizado_shadow). '
  'Escribe market_absorption_snapshots_shadow. La llama el cron híbrido '
  '(snapshot-shadow.mjs, service_role). Migración 283.';

-- Solo el cron (service_role) la ejecuta — SECURITY INVOKER, sin acceso browser
GRANT EXECUTE ON FUNCTION public.snapshot_absorcion_mercado_shadow() TO service_role;

-- -----------------------------------------------------------------------------
-- 3. ROLLBACK (comentado)
-- -----------------------------------------------------------------------------
-- ALTER TABLE public.market_absorption_snapshots_shadow RENAME TO _trash_market_absorption_snapshots_shadow;
-- DROP FUNCTION public.snapshot_absorcion_mercado_shadow();

COMMIT;
