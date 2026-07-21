-- =============================================================================
-- 285 · Snapshot shadow — ROI honesto: conteos del mix + gate de n mínimo
-- =============================================================================
-- 🔴 PROBLEMA (detectado por el founder, 21-jul, con datos verificados):
--
-- 1. El ROI cruza numerador y denominador con MIX DISTINTO:
--    - numerador (alquiler): 107 amoblados · 87 sin dato · 6 semi · 1 "no"
--    - denominador (venta): precio GENERAL — un depto se vende sin muebles
--      (solo 76/406 declaran amoblado → no se puede segmentar el precio)
--    → el yield sale optimista: los muebles inflan la renta pero no están en
--      el precio de compra. NO es corregible con esta data; SE DECLARA.
--
-- 2. `roi_amoblado`/`roi_no_amoblado` (heredados de la lógica de prod) eran
--    ENGAÑOSOS: segmentan el numerador pero dividen por el precio GENERAL.
--    Un "ROI de amoblados" calculado con el precio de cualquier depto no es
--    el ROI de los amoblados.
--
-- 3. Con `amoblado='no'` en **n=1** (que además renta $678 vs $389 de los
--    amoblados — ruido puro), publicar `roi_no_amoblado` es inventar un número.
--
-- QUÉ HACE ESTA MIGRACIÓN:
--   a) Guarda los CONTEOS del mix (alquiler_amobladas / _no_amobladas + sus
--      medianas) → sin el n, nadie puede auditar si un ROI segmentado sirve.
--   b) GATE de n mínimo (5) en los ROI segmentados: bajo el umbral → NULL.
--      En la práctica deja `roi_no_amoblado` casi siempre vacío — ESA es la
--      respuesta honesta, no una falla.
--   c) Declara el supuesto en el COMMENT de la tabla.
--
-- Doctrina que aplica: LIMITES_DATA_FIDUCIARIA.md (nunca disfrazar un estimado
-- de dato duro) + regla de flags "solo el positivo declarado".
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Conteos del mix de alquiler (para poder auditar los ROI segmentados)
-- -----------------------------------------------------------------------------
ALTER TABLE public.market_absorption_snapshots_shadow
  ADD COLUMN IF NOT EXISTS alquiler_amobladas INTEGER,
  ADD COLUMN IF NOT EXISTS alquiler_amobladas_mediana INTEGER,
  ADD COLUMN IF NOT EXISTS alquiler_no_amobladas INTEGER,
  ADD COLUMN IF NOT EXISTS alquiler_no_amobladas_mediana INTEGER;

COMMENT ON TABLE public.market_absorption_snapshots_shadow IS
  'Serie diaria de mercado del entorno SHADOW (régimen TC nuevo), Equipetrol. '
  'Escribe snapshot_absorcion_mercado_shadow() cada noche (cron híbrido, paso '
  'snapshot-shadow.mjs). Serie SEPARADA de market_absorption_snapshots (su '
  'UNIQUE no distingue filter_version). Migración 283; ROI honesto en la 285. '
  '⚠️ SUPUESTO DEL YIELD (declarar al publicar): es yield BRUTO DE OFERTA sin '
  'control de mix — el numerador (renta) está dominado por unidades AMOBLADAS '
  '(~107 de 201) y el denominador (precio de venta) corresponde a unidades que '
  'se venden SIN muebles (solo ~76/406 declaran amoblado → el precio no se '
  'puede segmentar). Los muebles inflan la renta pero no el precio → el yield '
  'es OPTIMISTA. Los ROI segmentados usan el precio GENERAL como denominador '
  '(no hay precio por segmento) y salen NULL si el segmento tiene n<5. '
  'Precio = oferta, no cierre (LIMITES_DATA_FIDUCIARIA.md).';

-- -----------------------------------------------------------------------------
-- 2. Función: conteos del mix + gate n>=5 en los ROI segmentados
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.snapshot_absorcion_mercado_shadow()
RETURNS TABLE(dormitorios_out INTEGER, zona_out TEXT, insertado BOOLEAN)
LANGUAGE plpgsql
AS $$
DECLARE
  -- n mínimo para publicar un ROI segmentado. Bajo esto → NULL (honesto).
  MIN_N CONSTANT INTEGER := 5;
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_zona TEXT;
  -- Venta
  v_venta_activas INTEGER; v_venta_absorbidas INTEGER; v_venta_nuevas INTEGER;
  v_venta_pending INTEGER; v_abs_entrega INTEGER; v_abs_preventa INTEGER;
  v_tasa NUMERIC(5,2); v_meses NUMERIC(5,1);
  v_ticket_prom INTEGER; v_ticket_med INTEGER; v_ticket_p25 INTEGER; v_ticket_p75 INTEGER;
  v_usd_m2 INTEGER; v_area_prom INTEGER; v_abs_ticket INTEGER; v_abs_usd_m2 INTEGER;
  v_act_prev INTEGER; v_act_entr INTEGER;
  v_prev_med INTEGER; v_entr_med INTEGER; v_prev_m2 INTEGER; v_entr_m2 INTEGER;
  v_amob_n INTEGER; v_amob_med INTEGER; v_equip_n INTEGER; v_equip_med INTEGER;
  v_parq_n INTEGER; v_parq_med INTEGER;
  -- Alquiler
  v_alq_activas INTEGER; v_alq_prom INTEGER; v_alq_med INTEGER;
  v_alq_p25 INTEGER; v_alq_p75 INTEGER;
  v_alq_equip_n INTEGER; v_alq_equip_med INTEGER;
  v_alq_parq_n INTEGER; v_alq_parq_med INTEGER;
  -- Mix amoblado (NUEVO: conteo + mediana, para auditar el ROI segmentado)
  v_alq_amob_n INTEGER; v_alq_med_amob INTEGER;
  v_alq_no_amob_n INTEGER; v_alq_med_no_amob INTEGER;
  -- ROI
  v_roi NUMERIC(5,2); v_retorno NUMERIC(5,1);
  v_roi_amob NUMERIC(5,2); v_roi_no_amob NUMERIC(5,2);
  v_retorno_amob NUMERIC(5,1); v_retorno_no_amob NUMERIC(5,1);
BEGIN
  -- ===========================================================================
  -- LOOP 1: Global (zona='global') — blindado a las 6 zonas Equipetrol
  -- ===========================================================================
  FOR v_dorm IN 0..3 LOOP

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

    IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
    ELSE v_tasa := 0; END IF;
    IF v_venta_absorbidas > 0 THEN
      v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
    ELSE v_meses := NULL; END IF;

    -- ALQUILER: activas + mix amoblado CON CONTEO (285) + equipado/parqueo
    SELECT COUNT(*),
           ROUND(AVG(precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual))::INTEGER,
           COUNT(*) FILTER (WHERE amoblado = 'si'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
             FILTER (WHERE amoblado = 'si'))::INTEGER,
           COUNT(*) FILTER (WHERE amoblado = 'no'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
             FILTER (WHERE amoblado = 'no'))::INTEGER,
           COUNT(*) FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
             FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true))::INTEGER
    INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
         v_alq_amob_n, v_alq_med_amob, v_alq_no_amob_n, v_alq_med_no_amob,
         v_alq_parq_n, v_alq_parq_med
    FROM v_mercado_alquiler_shadow
    WHERE dormitorios = v_dorm
      AND zona_general = 'Equipetrol';

    SELECT COUNT(*) FILTER (WHERE t.datos_json->>'equipado' = 'true'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_mensual)
             FILTER (WHERE t.datos_json->>'equipado' = 'true'))::INTEGER
    INTO v_alq_equip_n, v_alq_equip_med
    FROM v_mercado_alquiler_shadow v
    JOIN propiedades_v2_shadow t ON t.id = v.id
    WHERE v.dormitorios = v_dorm
      AND v.zona_general = 'Equipetrol';

    -- ROI general: yield bruto de OFERTA, mix no controlado (ver COMMENT tabla)
    IF v_alq_med > 0 AND v_ticket_med > 0 THEN
      v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
      v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
    ELSE v_roi := NULL; v_retorno := NULL; END IF;

    -- ROI segmentados: GATE n>=5 (285). Denominador = precio GENERAL (no hay
    -- precio de venta por segmento) → son indicativos, no el ROI del segmento.
    IF v_alq_amob_n >= MIN_N AND v_alq_med_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
    ELSE v_roi_amob := NULL; v_retorno_amob := NULL; END IF;

    IF v_alq_no_amob_n >= MIN_N AND v_alq_med_no_amob > 0 AND v_ticket_med > 0 THEN
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
      alquiler_amobladas, alquiler_amobladas_mediana,
      alquiler_no_amobladas, alquiler_no_amobladas_mediana,
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
      v_alq_amob_n, v_alq_med_amob,
      v_alq_no_amob_n, v_alq_med_no_amob,
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
      alquiler_amobladas = EXCLUDED.alquiler_amobladas,
      alquiler_amobladas_mediana = EXCLUDED.alquiler_amobladas_mediana,
      alquiler_no_amobladas = EXCLUDED.alquiler_no_amobladas,
      alquiler_no_amobladas_mediana = EXCLUDED.alquiler_no_amobladas_mediana,
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
  -- LOOP 2: Venta por zona (sin cambios respecto de la 283)
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
  -- LOOP 3: Alquiler por zona (+ conteos del mix + gate n>=5)
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
             COUNT(*) FILTER (WHERE amoblado = 'si'),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
               FILTER (WHERE amoblado = 'si'))::INTEGER,
             COUNT(*) FILTER (WHERE amoblado = 'no'),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
               FILTER (WHERE amoblado = 'no'))::INTEGER,
             COUNT(*) FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual)
               FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true))::INTEGER
      INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
           v_alq_amob_n, v_alq_med_amob, v_alq_no_amob_n, v_alq_med_no_amob,
           v_alq_parq_n, v_alq_parq_med
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

      v_ticket_med := NULL;
      SELECT venta_ticket_mediana INTO v_ticket_med
      FROM market_absorption_snapshots_shadow
      WHERE fecha = v_fecha AND dormitorios = v_dorm AND zona = v_zona;

      IF v_alq_med > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
        v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
      ELSE v_roi := NULL; v_retorno := NULL; END IF;

      IF v_alq_amob_n >= MIN_N AND v_alq_med_amob > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
      ELSE v_roi_amob := NULL; v_retorno_amob := NULL; END IF;

      IF v_alq_no_amob_n >= MIN_N AND v_alq_med_no_amob > 0 AND v_ticket_med IS NOT NULL AND v_ticket_med > 0 THEN
        v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
        v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
      ELSE v_roi_no_amob := NULL; v_retorno_no_amob := NULL; END IF;

      INSERT INTO market_absorption_snapshots_shadow (
        fecha, dormitorios, zona, filter_version,
        alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
        alquiler_mensual_p25, alquiler_mensual_p75,
        alquiler_amobladas, alquiler_amobladas_mediana,
        alquiler_no_amobladas, alquiler_no_amobladas_mediana,
        alquiler_equipadas, alquiler_equipadas_mediana,
        alquiler_con_parqueo, alquiler_con_parqueo_mediana,
        roi_bruto_anual, anos_retorno,
        roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
      ) VALUES (
        v_fecha, v_dorm, v_zona, 4,
        v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
        v_alq_amob_n, v_alq_med_amob,
        v_alq_no_amob_n, v_alq_med_no_amob,
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
        alquiler_amobladas = EXCLUDED.alquiler_amobladas,
        alquiler_amobladas_mediana = EXCLUDED.alquiler_amobladas_mediana,
        alquiler_no_amobladas = EXCLUDED.alquiler_no_amobladas,
        alquiler_no_amobladas_mediana = EXCLUDED.alquiler_no_amobladas_mediana,
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
  '(snapshot-shadow.mjs, service_role). Migración 283; ROI honesto en la 285 '
  '(conteos del mix de amoblado + gate n>=5 en los ROI segmentados).';

GRANT EXECUTE ON FUNCTION public.snapshot_absorcion_mercado_shadow() TO service_role;

COMMIT;

-- Verificación post-apply (los ROI segmentados deben salir NULL donde n<5):
--   SELECT dormitorios, alquiler_amobladas, alquiler_no_amobladas,
--          roi_bruto_anual, roi_amoblado, roi_no_amoblado
--   FROM market_absorption_snapshots_shadow WHERE zona='global' ORDER BY 1;
