-- ============================================================================
-- 313 — El snapshot shadow pasa a ser MULTI-MACROZONA (levanta el blindaje de la 312)
-- ============================================================================
-- CONTEXTO — esto NO revierte un error: cierra una decisión temporal
-- La mig 312 (29-jul-2026) blindó el snapshot a Equipetrol con una razón explícita del
-- founder: *"ZN no entra a la serie hasta terminar de releerla"*. El argumento era bueno:
-- una serie con cobertura parcial "crece" a medida que releemos, no porque el mercado gane
-- inventario. Parece una serie y es un artefacto del avance de la relectura.
--
-- ESA CONDICIÓN YA SE CUMPLIÓ (medido 31-jul-2026, tras el estreno de /cron-deptos-ventas-zn):
--   ZN venta:    337 de 347 releíbles = 97,1 %
--   ZN alquiler:  96 de 101          = 95,0 %  (2 de los faltantes son de Bien Inmuebles,
--                fuente que el híbrido no cubre → nunca entrarán por este camino)
-- ⚠️ Cuidado con el número grande: "faltan 111" es engañoso. **101 de esos 111 son avisos de
--    PROYECTO ya clasificados** en `proyectos_detectados`, que por diseño NO van al feed.
--    El backlog real era de 10 props.
--
-- QUÉ RESUELVE, ADEMÁS DE HABILITAR ZN
-- Levantar el blindaje "a lo bruto" (quitar el filtro y listo) rompería la serie histórica:
-- `zona='global'` significa hoy "Equipetrol entero", y sumarle ZN le cambiaría el nivel de
-- precios de un día para el otro. La serie viene corrida desde el 21-jul.
--
-- DISEÑO — una columna `macrozona`, NO una función por zona
--   · `('global','Equipetrol')` → EXACTAMENTE lo que era. Continuidad total.
--   · `('global','Zona Norte')` → serie nueva, arranca hoy, sin mezclarse.
--   · Las filas POR ZONA ya escalaban solas (los LOOP 2/3 iteran `DISTINCT zona`); lo único
--     hardcodeado era el filtro de macrozona.
--   · La próxima macrozona (Urubó, otra ciudad) NO requiere tocar la función: sale sola,
--     porque los tres LOOPs descubren macrozonas y zonas desde los datos.
-- Por qué NO una función por zona: hoy serían 2, en un año 5, y cada mejora del snapshot
-- (yield, spread preventa, cortes de amoblado) habría que replicarla en todas. Es el mismo
-- error que este proyecto ya pagó tres veces: una pieza que sirve a una sola zona y no
-- filtra, hasta que aparece la segunda.
--
-- 🔴 NO APLICAR SOLA — va en el MISMO deploy que el fix de
--    `simon-mvp/src/lib/mercado-shadow-data.ts`, que consulta el snapshot con
--    `.neq('zona','global')` y sin filtro de macrozona: apenas existan filas de ZN,
--    `/mercado/equipetrol` empieza a mezclarlas en el yield por zona.
--
-- MÉTODO: se re-exportó la función viva con `pg_get_functiondef()` (regla crítica #7) y se
-- reescribe COMPLETA. No se parchea con `replace()` como hizo la 312: allá era una línea,
-- acá son ~8 cambios estructurales, y un parche textual a medias deja la función
-- sintácticamente válida y semánticamente rota — con la serie de mercado ensuciándose en
-- silencio durante días. Esta versión ya incluye los parches de la 311 y la 312.
--
-- REVERSIÓN: restaurar la función de la mig 312 + `DELETE FROM ... WHERE macrozona <> 'Equipetrol'`
-- + volver el UNIQUE a (fecha, dormitorios, zona) + `DROP COLUMN macrozona`.
-- ============================================================================

BEGIN;

-- ─── 1. La columna. DEFAULT 'Equipetrol' deja toda la historia bien etiquetada ───────────
-- 🔴 LA GRAFÍA IMPORTA — 'Equipetrol' con mayúscula, NO 'equipetrol'.
-- La función escribe `v_macro`, que sale de `zonas_geograficas.zona_general`, y ahí los valores
-- son 'Equipetrol' y 'Zona Norte' (capitalizados). Un DEFAULT en minúscula rompería dos cosas
-- de forma silenciosa: (a) el UNIQUE trataría 'equipetrol' y 'Equipetrol' como macrozonas
-- DISTINTAS → el snapshot del día insertaría filas nuevas en vez de actualizar las de la
-- historia, duplicando cada fecha; (b) el frontend filtra `.eq('macrozona','Equipetrol')` →
-- no vería ni un día de la serie vieja. (Bug detectado antes de aplicar, 31-jul-2026.)
-- No hay backfill que hacer: por la 312, hasta hoy el snapshot SOLO escribió Equipetrol.
ALTER TABLE market_absorption_snapshots_shadow
  ADD COLUMN IF NOT EXISTS macrozona TEXT NOT NULL DEFAULT 'Equipetrol';

COMMENT ON COLUMN market_absorption_snapshots_shadow.macrozona IS
  'Macrozona de la fila (Equipetrol | Zona Norte | ...). Las filas anteriores al 31-jul-2026 '
  'son todas de Equipetrol: hasta esa fecha el snapshot estuvo blindado (mig 312). '
  'OJO: zona=''global'' es el agregado DE SU macrozona, no el total — para el total, sumar.';

-- ─── 2. El UNIQUE tiene que incluirla ────────────────────────────────────────────────────
-- Sin esto el `global` de ZN chocaría con el de Equipetrol (misma fecha+dormitorios+zona).
ALTER TABLE market_absorption_snapshots_shadow DROP CONSTRAINT IF EXISTS mas_shadow_unq;
ALTER TABLE market_absorption_snapshots_shadow
  ADD CONSTRAINT mas_shadow_unq UNIQUE (fecha, dormitorios, zona, macrozona);

-- ─── 3. La función, completa ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.snapshot_absorcion_mercado_shadow()
 RETURNS TABLE(dormitorios_out integer, zona_out text, insertado boolean)
 LANGUAGE plpgsql
AS $function$
DECLARE
  MIN_N CONSTANT INTEGER := 5;   -- n mínimo para publicar un ROI segmentado
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_zona TEXT;
  v_macro TEXT;                  -- 313: macrozona en curso (LOOP 1) o la de v_zona (LOOP 2/3)
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
  v_v_edificios INTEGER; v_v_dom INTEGER;        -- 286
  -- Alquiler
  v_alq_activas INTEGER; v_alq_prom INTEGER; v_alq_med INTEGER;
  v_alq_p25 INTEGER; v_alq_p75 INTEGER;
  v_alq_equip_n INTEGER; v_alq_equip_med INTEGER;
  v_alq_parq_n INTEGER; v_alq_parq_med INTEGER;
  v_alq_amob_n INTEGER; v_alq_med_amob INTEGER;
  v_alq_no_amob_n INTEGER; v_alq_med_no_amob INTEGER;
  v_a_edificios INTEGER; v_a_dom INTEGER;        -- 286
  -- ROI
  v_roi NUMERIC(5,2); v_retorno NUMERIC(5,1);
  v_roi_amob NUMERIC(5,2); v_roi_no_amob NUMERIC(5,2);
  v_retorno_amob NUMERIC(5,1); v_retorno_no_amob NUMERIC(5,1);
BEGIN
  -- ===========================================================================
  -- LOOP 1: Global POR MACROZONA (zona='global', macrozona=<la que corresponda>)
  -- 313: antes era un único global blindado a las 6 zonas de Equipetrol.
  -- Las macrozonas salen de `zonas_geograficas` (fuente canónica y estable: no depende
  -- de que la zona tenga propiedades activas, a diferencia de derivarlas de la vista).
  -- ===========================================================================
  FOR v_macro IN
    SELECT DISTINCT zona_general FROM zonas_geograficas
    WHERE activo = true AND zona_general IS NOT NULL ORDER BY 1
  LOOP
  FOR v_dorm IN 0..3 LOOP

    SELECT COUNT(*),
           ROUND(AVG(precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
           ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_m2))::INTEGER,
           ROUND(AVG(area_total_m2))::INTEGER,
           COUNT(DISTINCT id_proyecto_master),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_en_mercado))::INTEGER
    INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom,
         v_v_edificios, v_v_dom
    FROM v_mercado_venta_shadow
    WHERE dormitorios = v_dorm AND zona_general = v_macro;

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
    WHERE dormitorios = v_dorm AND zona_general = v_macro;

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
    WHERE v.dormitorios = v_dorm AND v.zona_general = v_macro;

    -- Las 3 consultas siguientes van contra la TABLA, que NO tiene `zona_general`
    -- → la macrozona se resuelve por `zonas_geograficas`.
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
      AND zona IN (SELECT nombre FROM zonas_geograficas WHERE activo = true AND zona_general = v_macro)
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
      AND zona IN (SELECT nombre FROM zonas_geograficas WHERE activo = true AND zona_general = v_macro)
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
      AND zona IN (SELECT nombre FROM zonas_geograficas WHERE activo = true AND zona_general = v_macro);

    IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
    ELSE v_tasa := 0; END IF;
    IF v_venta_absorbidas > 0 THEN
      v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
    ELSE v_meses := NULL; END IF;

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
             FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true))::INTEGER,
           COUNT(DISTINCT id_proyecto_master),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_en_mercado))::INTEGER
    INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
         v_alq_amob_n, v_alq_med_amob, v_alq_no_amob_n, v_alq_med_no_amob,
         v_alq_parq_n, v_alq_parq_med, v_a_edificios, v_a_dom
    FROM v_mercado_alquiler_shadow
    WHERE dormitorios = v_dorm AND zona_general = v_macro;

    SELECT COUNT(*) FILTER (WHERE t.datos_json->>'equipado' = 'true'),
           ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_mensual)
             FILTER (WHERE t.datos_json->>'equipado' = 'true'))::INTEGER
    INTO v_alq_equip_n, v_alq_equip_med
    FROM v_mercado_alquiler_shadow v
    JOIN propiedades_v2_shadow t ON t.id = v.id
    WHERE v.dormitorios = v_dorm AND v.zona_general = v_macro;

    IF v_alq_med > 0 AND v_ticket_med > 0 THEN
      v_roi := ROUND((v_alq_med * 12.0) / v_ticket_med * 100, 2);
      v_retorno := ROUND(v_ticket_med::NUMERIC / (v_alq_med * 12.0), 1);
    ELSE v_roi := NULL; v_retorno := NULL; END IF;

    IF v_alq_amob_n >= MIN_N AND v_alq_med_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_amob := ROUND((v_alq_med_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_amob * 12.0), 1);
    ELSE v_roi_amob := NULL; v_retorno_amob := NULL; END IF;

    IF v_alq_no_amob_n >= MIN_N AND v_alq_med_no_amob > 0 AND v_ticket_med > 0 THEN
      v_roi_no_amob := ROUND((v_alq_med_no_amob * 12.0) / v_ticket_med * 100, 2);
      v_retorno_no_amob := ROUND(v_ticket_med::NUMERIC / (v_alq_med_no_amob * 12.0), 1);
    ELSE v_roi_no_amob := NULL; v_retorno_no_amob := NULL; END IF;

    INSERT INTO market_absorption_snapshots_shadow (
      fecha, dormitorios, zona, macrozona, filter_version,
      venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
      venta_tasa_absorcion, venta_meses_inventario,
      venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
      venta_usd_m2, venta_area_promedio,
      venta_edificios, venta_dias_mercado_mediana,
      absorbidas_ticket_promedio, absorbidas_usd_m2,
      venta_absorbidas_entrega, venta_absorbidas_preventa,
      venta_activas_preventa, venta_activas_entrega,
      venta_preventa_mediana, venta_entrega_mediana, venta_preventa_usd_m2, venta_entrega_usd_m2,
      venta_amobladas, venta_amobladas_mediana,
      venta_equipadas, venta_equipadas_mediana,
      venta_con_parqueo, venta_con_parqueo_mediana,
      alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
      alquiler_mensual_p25, alquiler_mensual_p75,
      alquiler_edificios, alquiler_dias_mercado_mediana,
      alquiler_amobladas, alquiler_amobladas_mediana,
      alquiler_no_amobladas, alquiler_no_amobladas_mediana,
      alquiler_equipadas, alquiler_equipadas_mediana,
      alquiler_con_parqueo, alquiler_con_parqueo_mediana,
      roi_bruto_anual, anos_retorno,
      roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
    ) VALUES (
      v_fecha, v_dorm, 'global', v_macro, 4,
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_v_edificios, v_v_dom,
      v_abs_ticket, v_abs_usd_m2,
      v_abs_entrega, v_abs_preventa,
      v_act_prev, v_act_entr,
      v_prev_med, v_entr_med, v_prev_m2, v_entr_m2,
      v_amob_n, v_amob_med,
      v_equip_n, v_equip_med,
      v_parq_n, v_parq_med,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_a_edificios, v_a_dom,
      v_alq_amob_n, v_alq_med_amob,
      v_alq_no_amob_n, v_alq_med_no_amob,
      v_alq_equip_n, v_alq_equip_med,
      v_alq_parq_n, v_alq_parq_med,
      v_roi, v_retorno,
      v_roi_amob, v_roi_no_amob, v_retorno_amob, v_retorno_no_amob
    )
    ON CONFLICT (fecha, dormitorios, zona, macrozona) DO UPDATE SET
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
      venta_edificios = EXCLUDED.venta_edificios,
      venta_dias_mercado_mediana = EXCLUDED.venta_dias_mercado_mediana,
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
      alquiler_edificios = EXCLUDED.alquiler_edificios,
      alquiler_dias_mercado_mediana = EXCLUDED.alquiler_dias_mercado_mediana,
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

    dormitorios_out := v_dorm; zona_out := 'global [' || v_macro || ']'; insertado := TRUE;
    RETURN NEXT;
  END LOOP;
  END LOOP;

  -- ===========================================================================
  -- LOOP 2: Venta por zona (+ concentración y DOM)
  -- 313: sin filtro de macrozona — la toma del mismo SELECT y la escribe en la fila.
  -- ===========================================================================
  FOR v_zona, v_macro IN
    SELECT DISTINCT zona, zona_general FROM v_mercado_venta_shadow
    WHERE zona IS NOT NULL AND zona <> '' AND zona_general IS NOT NULL
  LOOP
    FOR v_dorm IN 0..3 LOOP

      SELECT COUNT(*),
             ROUND(AVG(precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_norm))::INTEGER,
             ROUND(PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY precio_m2))::INTEGER,
             ROUND(AVG(area_total_m2))::INTEGER,
             COUNT(DISTINCT id_proyecto_master),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_en_mercado))::INTEGER,
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
           v_v_edificios, v_v_dom,
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
        fecha, dormitorios, zona, macrozona, filter_version,
        venta_activas, venta_absorbidas_30d, venta_nuevas_30d, venta_pending_30d,
        venta_tasa_absorcion, venta_meses_inventario,
        venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
        venta_usd_m2, venta_area_promedio,
        venta_edificios, venta_dias_mercado_mediana,
        absorbidas_ticket_promedio, absorbidas_usd_m2,
        venta_absorbidas_entrega, venta_absorbidas_preventa,
        venta_activas_preventa, venta_activas_entrega,
        venta_preventa_mediana, venta_entrega_mediana, venta_preventa_usd_m2, venta_entrega_usd_m2
      ) VALUES (
        v_fecha, v_dorm, v_zona, v_macro, 4,
        v_venta_activas, v_venta_absorbidas, v_venta_nuevas, v_venta_pending,
        v_tasa, v_meses,
        v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
        v_usd_m2, v_area_prom,
        v_v_edificios, v_v_dom,
        v_abs_ticket, v_abs_usd_m2,
        v_abs_entrega, v_abs_preventa,
        v_act_prev, v_act_entr,
        v_prev_med, v_entr_med, v_prev_m2, v_entr_m2
      )
      ON CONFLICT (fecha, dormitorios, zona, macrozona) DO UPDATE SET
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
        venta_edificios = EXCLUDED.venta_edificios,
        venta_dias_mercado_mediana = EXCLUDED.venta_dias_mercado_mediana,
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
  -- LOOP 3: Alquiler por zona (+ concentración y DOM)
  -- ===========================================================================
  FOR v_zona, v_macro IN
    SELECT DISTINCT zona, zona_general FROM v_mercado_alquiler_shadow
    WHERE zona IS NOT NULL AND zona <> '' AND zona_general IS NOT NULL
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
               FILTER (WHERE COALESCE(estacionamientos,0) >= 1 OR parqueo_incluido = true))::INTEGER,
             COUNT(DISTINCT id_proyecto_master),
             ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY dias_en_mercado))::INTEGER
      INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
           v_alq_amob_n, v_alq_med_amob, v_alq_no_amob_n, v_alq_med_no_amob,
           v_alq_parq_n, v_alq_parq_med, v_a_edificios, v_a_dom
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

      -- El ticket de venta de ESTA zona (lo escribió el LOOP 2 unas líneas arriba).
      -- 313: filtrar TAMBIÉN por macrozona — sin eso, dos macrozonas con una zona homónima
      -- traerían el ticket de la otra y el ROI saldría cruzado.
      v_ticket_med := NULL;
      SELECT venta_ticket_mediana INTO v_ticket_med
      FROM market_absorption_snapshots_shadow
      WHERE fecha = v_fecha AND dormitorios = v_dorm AND zona = v_zona AND macrozona = v_macro;

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
        fecha, dormitorios, zona, macrozona, filter_version,
        alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
        alquiler_mensual_p25, alquiler_mensual_p75,
        alquiler_edificios, alquiler_dias_mercado_mediana,
        alquiler_amobladas, alquiler_amobladas_mediana,
        alquiler_no_amobladas, alquiler_no_amobladas_mediana,
        alquiler_equipadas, alquiler_equipadas_mediana,
        alquiler_con_parqueo, alquiler_con_parqueo_mediana,
        roi_bruto_anual, anos_retorno,
        roi_amoblado, roi_no_amoblado, anos_retorno_amoblado, anos_retorno_no_amoblado
      ) VALUES (
        v_fecha, v_dorm, v_zona, v_macro, 4,
        v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75,
        v_a_edificios, v_a_dom,
        v_alq_amob_n, v_alq_med_amob,
        v_alq_no_amob_n, v_alq_med_no_amob,
        v_alq_equip_n, v_alq_equip_med,
        v_alq_parq_n, v_alq_parq_med,
        v_roi, v_retorno, v_roi_amob, v_roi_no_amob, v_retorno_amob, v_retorno_no_amob
      )
      ON CONFLICT (fecha, dormitorios, zona, macrozona) DO UPDATE SET
        alquiler_activas = EXCLUDED.alquiler_activas,
        alquiler_mensual_promedio = EXCLUDED.alquiler_mensual_promedio,
        alquiler_mensual_mediana = EXCLUDED.alquiler_mensual_mediana,
        alquiler_mensual_p25 = EXCLUDED.alquiler_mensual_p25,
        alquiler_mensual_p75 = EXCLUDED.alquiler_mensual_p75,
        alquiler_edificios = EXCLUDED.alquiler_edificios,
        alquiler_dias_mercado_mediana = EXCLUDED.alquiler_dias_mercado_mediana,
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
$function$;

-- ─── 4. VERIFICACIÓN — revisar ANTES del COMMIT ──────────────────────────────────────────
-- 4a. La historia quedó toda etiquetada como Equipetrol (esperado: 0 filas con otra macrozona)
SELECT macrozona, COUNT(*) AS filas, MIN(fecha) AS desde, MAX(fecha) AS hasta
FROM market_absorption_snapshots_shadow
GROUP BY macrozona ORDER BY 1;

-- 4b. El UNIQUE nuevo está puesto
SELECT pg_get_constraintdef(oid) AS unique_def
FROM pg_constraint WHERE conname = 'mas_shadow_unq';

-- COMMIT;   -- descomentar tras revisar 4a y 4b
ROLLBACK;    -- ← por defecto NO aplica. Cambiar por COMMIT cuando esté revisado.

-- ============================================================================
-- DESPUÉS DE APLICAR (fuera de esta transacción)
--   1. Correr la función una vez y comprobar que aparecen las dos macrozonas:
--        SELECT * FROM snapshot_absorcion_mercado_shadow();
--        SELECT macrozona, COUNT(*) FROM market_absorption_snapshots_shadow
--         WHERE fecha = CURRENT_DATE GROUP BY 1;
--      Esperado: Equipetrol ~27 filas (como siempre) + Zona Norte ~50-60 (14 microzonas).
--   2. 🔴 Verificar que `('global','Equipetrol')` de hoy NO cambió respecto a ayer:
--        SELECT fecha, venta_activas, venta_ticket_mediana FROM market_absorption_snapshots_shadow
--         WHERE zona='global' AND macrozona='Equipetrol' AND dormitorios=1
--         ORDER BY fecha DESC LIMIT 3;
--      Si cambió, la continuidad de la serie se rompió y hay que revisar antes de seguir.
--   3. Deployar el fix de `mercado-shadow-data.ts` (va en el mismo commit).
-- ============================================================================
