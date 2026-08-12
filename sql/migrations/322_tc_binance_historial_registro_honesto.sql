-- =============================================================================
-- MIGRACIÓN 322 — tc_binance_historial deja de mentir sobre sí misma
-- =============================================================================
-- Fecha: 11-ago-2026
-- Contexto: docs/arquitectura/TC_BINANCE_DIAGNOSTICO_2026-08-11.md
--
-- QUÉ ARREGLA
--
-- (a) El flag `aplicado_a_config` está en FALSE en las 67 filas, y las 67 SÍ se
--     aplicaron. No es que el flag esté incompleto: está INVERTIDO. Cualquiera
--     que lea la tabla concluye lo contrario de lo que pasó.
--
--     Por qué son las 67 y no algunas: en el workflow n8n muerto
--     ("SICI - TC Dinamico Binance v1.1"), el INSERT al historial colgaba de la
--     rama TRUE del nodo "IF: TC Valido?", DESPUÉS del nodo que actualizaba
--     config_global. Una fila en esta tabla sólo podía existir si el TC ya se
--     había aplicado. Los días rechazados no llegaban nunca al INSERT.
--
--     Medido antes de escribir esta migración (67 filas contra las 67 filas de
--     auditoria_tipo_cambio con metodo='manual' y ejecutado_por='binance_p2p',
--     apareadas por orden cronológico):
--       pares .................. 67
--       tc_sell = valor_nuevo .. 67  (coincidencia exacta, sin excepción)
--       desfase máximo ......... 0,58 segundos
--     O sea: misma ejecución, dos nodos consecutivos. No hay ambigüedad.
--
-- (b) `registrar_consulta_binance()` no tiene forma de setear el flag ni la
--     razón: no recibe esos parámetros. El silencio no era una omisión del
--     operador, era estructural. Se le agregan (con DEFAULT, así una llamada
--     vieja de 5 argumentos sigue resolviendo).
--
-- (c) `promedio_volumen` nunca se llenó (0 de 67). Queda documentado qué se
--     espera ahí para que el capturador nuevo lo llene.
--
-- LO QUE ESTA MIGRACIÓN **NO** HACE
--   No inventa las ~139 filas de los días sin registro. Esos días el TC se
--   consultó y se descartó por el piso de 0,5%, y el valor consultado no se
--   guardó en ningún lado. Son irrecuperables. La cobertura de la serie hasta el
--   27-jul-2026 es del 32% y así queda; el COMMENT de la tabla lo declara para
--   que nadie la lea como una serie diaria.
--
-- ROLLBACK
--   UPDATE public.tc_binance_historial SET aplicado_a_config = FALSE
--     WHERE timestamp <= '2026-07-27T23:59:59Z';
--   Y recrear la función con la firma de 5 parámetros (está en la mig 014).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Backfill del flag — sólo las filas del régimen n8n (hasta el 27-jul-2026)
-- -----------------------------------------------------------------------------
-- El corte por fecha es deliberado: a partir del capturador nuevo el flag lo
-- escribe quien inserta, y esta migración no debe pisarlo si se re-aplica.
UPDATE public.tc_binance_historial
SET aplicado_a_config = TRUE,
    razon_no_aplicado = NULL
WHERE timestamp <= '2026-07-27T23:59:59Z'
  AND aplicado_a_config IS DISTINCT FROM TRUE;

-- -----------------------------------------------------------------------------
-- 2. La función acepta el resultado real de la operación
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.registrar_consulta_binance(NUMERIC, NUMERIC, INTEGER, INTEGER, JSONB);

CREATE OR REPLACE FUNCTION public.registrar_consulta_binance(
    p_tc_sell            NUMERIC,
    p_tc_buy             NUMERIC,
    p_num_anuncios_sell  INTEGER DEFAULT NULL,
    p_num_anuncios_buy   INTEGER DEFAULT NULL,
    p_raw_response       JSONB   DEFAULT NULL,
    p_aplicado_a_config  BOOLEAN DEFAULT FALSE,
    p_razon_no_aplicado  TEXT    DEFAULT NULL,
    p_promedio_volumen   NUMERIC DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
-- SIN SECURITY DEFINER: corre como INVOKER. Escribir acá exige INSERT sobre la
-- tabla, que sólo tiene service_role.
AS $$
DECLARE
    v_id INTEGER;
    v_spread NUMERIC;
BEGIN
    IF p_tc_sell > 0 AND p_tc_buy > 0 THEN
        v_spread := 100.0 * (p_tc_sell - p_tc_buy) / p_tc_buy;
    END IF;

    -- Coherencia: si no se aplicó, tiene que decir por qué. Un FALSE mudo es
    -- exactamente el estado que esta migración vino a eliminar.
    IF p_aplicado_a_config IS NOT TRUE AND p_razon_no_aplicado IS NULL THEN
        RAISE EXCEPTION 'registrar_consulta_binance: si aplicado_a_config no es TRUE, razon_no_aplicado es obligatorio';
    END IF;

    INSERT INTO public.tc_binance_historial (
        tc_sell, tc_buy, spread_pct,
        num_anuncios_sell, num_anuncios_buy, promedio_volumen,
        raw_response, aplicado_a_config, razon_no_aplicado
    ) VALUES (
        p_tc_sell, p_tc_buy, v_spread,
        p_num_anuncios_sell, p_num_anuncios_buy, p_promedio_volumen,
        p_raw_response, COALESCE(p_aplicado_a_config, FALSE), p_razon_no_aplicado
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. GRANTS — la función heredaba EXECUTE de PUBLIC y anon (mig 014, antes de la
--    Regla 6). Es inofensivo hoy porque es INVOKER y anon no tiene INSERT sobre
--    la tabla, pero no hay motivo para dejar una función de escritura expuesta.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.registrar_consulta_binance(NUMERIC, NUMERIC, INTEGER, INTEGER, JSONB, BOOLEAN, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_consulta_binance(NUMERIC, NUMERIC, INTEGER, INTEGER, JSONB, BOOLEAN, TEXT, NUMERIC)
  TO service_role;

-- -----------------------------------------------------------------------------
-- 4. Documentar la trampa en la tabla misma
-- -----------------------------------------------------------------------------
COMMENT ON TABLE public.tc_binance_historial IS
'Consultas a Binance P2P (USDT/BOB) para el TC paralelo.
⚠️ NO ES UNA SERIE DIARIA hasta el 27-jul-2026: 67 filas en 206 días (32%).
El workflow n8n sólo insertaba los días en que el TC se APLICABA — validar_tc_binance()
rechazaba todo cambio <0,5% y la rama de rechazo no escribía en la base. La serie
vieja es, entonces, la lista de días en que el paralelo se movió al menos 0,5%:
está sesgada hacia los saltos y no sirve para promediar volatilidad ni para
interpolar el TC de un día faltante.
Sin filas entre el 27-jul-2026 (baja del servidor n8n) y la puesta en marcha de
scripts/deptos-equipetrol/capturar-tc-binance.mjs, que escribe TODOS los días,
aplique o no. Detalle: docs/arquitectura/TC_BINANCE_DIAGNOSTICO_2026-08-11.md';

COMMENT ON COLUMN public.tc_binance_historial.aplicado_a_config IS
'TRUE si esta consulta efectivamente actualizó config_global.tipo_cambio_paralelo.
Backfilleado a TRUE para las 67 filas ≤27-jul-2026 en la mig 322: todas se aplicaron
(verificado 67/67 contra auditoria_tipo_cambio, mismo valor, <0,6 s de desfase).
Antes de la 322 estaba en FALSE en el 100% de las filas — invertido, no incompleto.';

COMMENT ON COLUMN public.tc_binance_historial.razon_no_aplicado IS
'Por qué NO se actualizó config_global: fuera de rango 8–15, salto >10%, fallo de
red de Binance, o error del UPDATE. Obligatorio cuando aplicado_a_config no es TRUE.
Vacío en todas las filas ≤27-jul-2026 porque en el n8n los rechazos nunca llegaban
al INSERT.';

COMMENT ON COLUMN public.tc_binance_historial.promedio_volumen IS
'Promedio de USDT disponibles (adv.surplusAmount) en los 5 anuncios SELL usados.
NULL en las 67 filas del régimen n8n: la función vieja no recibía el dato.
Sirve para descartar un TC calculado sobre anuncios de volumen irrisorio.';

COMMENT ON FUNCTION public.registrar_consulta_binance(NUMERIC, NUMERIC, INTEGER, INTEGER, JSONB, BOOLEAN, TEXT, NUMERIC) IS
'Inserta una consulta de Binance P2P en tc_binance_historial · la llama
scripts/deptos-equipetrol/capturar-tc-binance.mjs · mig 014, ampliada en la 322
con aplicado_a_config / razon_no_aplicado / promedio_volumen.
Rechaza el par (aplicado=FALSE, razon=NULL): un no-aplicado sin motivo es el bug
que la 322 vino a cerrar.';

COMMIT;
