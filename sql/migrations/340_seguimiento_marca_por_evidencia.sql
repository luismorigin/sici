-- =============================================================================
-- 340 · El seguimiento marcaba "enviado" por un 2xx — y quemó a dos personas
-- =============================================================================
-- 🔴 QUÉ PASÓ (26-ago-2026, primera y única corrida real del cron)
-- El endpoint hacía el `resume` contra Kapso y, si respondía 2xx, marcaba
-- `seguimiento_enviado_at`. La corrida de las 14:00 marcó a Jenny y a Israel.
-- **Ninguno de los dos recibió mensaje.** Verificado por tres vías: no hay
-- salientes suyos posteriores en `simon_mensajes`, lab-kapso barrió 1.500
-- mensajes de su lado sin encontrarlos, y el bot conversaba normalmente con otro
-- número 19 minutos después — o sea que el sistema andaba y el webhook registraba.
--
-- Lo que había del lado de Kapso: la marca `seguimiento:v1` LLEGÓ (quedó en
-- `last_user_input`), el agente corrió UNA iteración y esa iteración terminó en
-- `[ENTER_WAITING]` sin redactar nada. El agente se despertó, miró y se volvió a
-- dormir. Las dos ejecuciones estaban en `waiting` — el estado bueno.
--
-- 🔑 Y EL DAÑO NO FUE NO ENVIAR: FUE MARCAR. `marcar_seguimiento_shortlist()`
-- marca todas las hermanas del mismo teléfono para que nadie reciba dos mensajes.
-- Aplicado sobre un envío que no ocurrió, eso **quema a la persona para siempre**:
-- queda como contactada, no vuelve a calificar, y su ventana de 22 h vence esa
-- misma noche. Jenny e Israel no se recuperan. Si el cron hubiera seguido, mañana
-- eran seis.
--
-- ⚠️ ESTA MIGRACIÓN NO ARREGLA LA CAUSA — no puede. Por qué el agente no redacta
-- pasadas unas horas es del lado de lab-kapso y está en investigación (la variable
-- parece ser el TIEMPO: a los 7 y 23 minutos salió, a las 5 y 16 horas no; los
-- cuatro casos venían de `enter_waiting`, así que no es eso). Lo que esta
-- migración hace es que ese fallo, y cualquier otro parecido, **cueste un
-- reintento en vez de una persona**.
--
-- -----------------------------------------------------------------------------
-- EL CAMBIO: se marca por EVIDENCIA, no por acuse de recibo
--
--   antes:  resume 2xx                        -> seguimiento_enviado_at = now()
--   ahora:  resume 2xx                        -> seguimiento_intentado_at = now()
--           apareció un saliente después       -> seguimiento_enviado_at = now()
--
-- La confirmación corre al principio de cada disparo, así que la corrida de las
-- N+1 confirma (o desmiente) lo que hizo la de las N. Si no salió, la persona
-- vuelve a la cola sola.
--
-- 🔑 CÓMO SE DISTINGUE EL SEGUIMIENTO DE UNA RESPUESTA CUALQUIERA. Un saliente
-- posterior al intento no basta: si la persona escribió justo en ese momento, el
-- bot le contesta a ELLA y no al seguimiento. Por eso se exige además que **no
-- haya ningún mensaje entrante entre el intento y ese saliente**. Con un entrante
-- en el medio, el saliente es respuesta al usuario y no prueba nada.
-- =============================================================================

BEGIN;

-- 1 · Confirmar los envíos que SÍ ocurrieron ---------------------------------
CREATE OR REPLACE FUNCTION public.confirmar_seguimientos_enviados(
  p_ventana_minutos integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_n integer;
BEGIN
  WITH intentadas AS (
    SELECT s.hash, s.cliente_telefono, s.seguimiento_intentado_at AS t0
      FROM broker_shortlists s
     WHERE s.broker_slug = 'simon-asistente'
       AND s.seguimiento_intentado_at IS NOT NULL
       AND s.seguimiento_enviado_at IS NULL
  ),
  con_evidencia AS (
    SELECT i.hash
      FROM intentadas i
     WHERE EXISTS (
       SELECT 1 FROM simon_mensajes m
        WHERE replace(m.telefono, '+', '') = replace(i.cliente_telefono, '+', '')
          AND m.direccion = 'out'
          AND m.created_at >  i.t0
          AND m.created_at <= i.t0 + (p_ventana_minutos || ' minutes')::interval
          -- Sin entrante en el medio: con uno, el saliente le contesta a la
          -- persona, no al seguimiento, y no prueba que el seguimiento saliera.
          AND NOT EXISTS (
            SELECT 1 FROM simon_mensajes e
             WHERE replace(e.telefono, '+', '') = replace(i.cliente_telefono, '+', '')
               AND e.direccion = 'in'
               AND e.created_at > i.t0
               AND e.created_at < m.created_at)
     )
  )
  UPDATE broker_shortlists s
     SET seguimiento_enviado_at = now()
    FROM con_evidencia c
   WHERE s.hash = c.hash;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- 2 · El endpoint ya sólo puede registrar el INTENTO --------------------------
-- Reemplaza a `marcar_seguimiento_shortlist(text, boolean)`, que se borra: dejar
-- viva una función capaz de marcar "enviado" desde afuera mantiene armada la
-- trampa que causó esto. El nombre nuevo dice lo único que hace.
CREATE OR REPLACE FUNCTION public.marcar_intento_seguimiento(p_hash text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tel text;
  v_n   integer;
BEGIN
  SELECT cliente_telefono INTO v_tel FROM broker_shortlists WHERE hash = p_hash;
  IF v_tel IS NULL THEN
    RAISE EXCEPTION 'hash inexistente: %', p_hash USING ERRCODE = '22023';
  END IF;

  -- Sigue marcando TODAS las hermanas del mismo teléfono: el seguimiento es por
  -- persona. Lo que ya no hace es declarar el envío.
  UPDATE broker_shortlists
     SET seguimiento_intentado_at = now()
   WHERE broker_slug = 'simon-asistente'
     AND seguimiento_enviado_at IS NULL
     AND replace(cliente_telefono, '+', '') = replace(v_tel, '+', '');

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

DROP FUNCTION IF EXISTS public.marcar_seguimiento_shortlist(text, boolean);

-- 3 · Confirmar antes de disparar, y decir cuántos son reintentos -------------
CREATE OR REPLACE FUNCTION public.disparar_seguimiento_shortlists(
  p_hora_desde integer DEFAULT 9,
  p_hora_hasta integer DEFAULT 21)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net', 'extensions'
AS $function$
DECLARE
  v_hora        integer;
  v_cuantas     integer;
  v_reintentos  integer;
  v_confirmadas integer;
  v_descartadas integer;
  v_secreto     text;
BEGIN
  v_hora := EXTRACT(hour FROM (now() AT TIME ZONE 'America/La_Paz'))::int;
  IF v_hora < p_hora_desde OR v_hora >= p_hora_hasta THEN
    RETURN format('fuera de franja (son las %s, se manda entre %s y %s)', v_hora, p_hora_desde, p_hora_hasta);
  END IF;

  -- Primero cerrar lo de la corrida anterior: lo que salió se marca enviado, y
  -- lo que no, vuelve a la cola solo.
  v_confirmadas := public.confirmar_seguimientos_enviados();

  SELECT count(*) INTO v_cuantas FROM public.shortlists_para_seguimiento();

  SELECT count(*) INTO v_reintentos
    FROM public.shortlists_para_seguimiento() f
    JOIN broker_shortlists s ON s.hash = f.hash
   WHERE s.seguimiento_intentado_at IS NOT NULL;

  SELECT count(DISTINCT s.cliente_telefono) INTO v_descartadas
    FROM broker_shortlists s
   WHERE s.broker_slug = 'simon-asistente'
     AND s.seguimiento_enviado_at IS NULL
     AND s.created_at < now() - interval '22 hours'
     AND s.created_at > now() - interval '46 hours';

  IF v_cuantas = 0 THEN
    RETURN format('sin candidatas%s%s',
      CASE WHEN v_confirmadas > 0 THEN format(' · %s confirmada(s) de la corrida anterior', v_confirmadas) ELSE '' END,
      CASE WHEN v_descartadas > 0 THEN format(' · %s persona(s) pasaron el guard de 22h sin seguimiento', v_descartadas) ELSE '' END);
  END IF;

  SELECT decrypted_secret INTO v_secreto
    FROM vault.decrypted_secrets WHERE name = 'seguimiento_cron_token';
  IF v_secreto IS NULL THEN
    RETURN 'ERROR: falta el secreto `seguimiento_cron_token` en vault — no se disparó nada';
  END IF;

  PERFORM net.http_post(
    url     := 'https://simonbo.com/api/cron/seguimiento-shortlists',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_secreto),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000   -- mig 339: con 5 s la respuesta se perdía
  );

  -- 🔑 Los REINTENTOS se declaran. Si ese número no baja corrida a corrida, el
  -- mensaje no está saliendo y hay que mirar, no esperar.
  RETURN format('%s encolada(s) a las %sh%s%s%s', v_cuantas, v_hora,
    CASE WHEN v_reintentos > 0 THEN format(' · %s reintento(s)', v_reintentos) ELSE '' END,
    CASE WHEN v_confirmadas > 0 THEN format(' · %s confirmada(s) de la anterior', v_confirmadas) ELSE '' END,
    CASE WHEN v_descartadas > 0 THEN format(' · ⚠️ %s persona(s) pasaron el guard sin seguimiento', v_descartadas) ELSE '' END);
END;
$function$;

-- 4 · Permisos — nacen con EXECUTE para PUBLIC (regla #13) --------------------
REVOKE ALL ON FUNCTION public.confirmar_seguimientos_enviados(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_intento_seguimiento(text)          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disparar_seguimiento_shortlists(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirmar_seguimientos_enviados(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.marcar_intento_seguimiento(text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.disparar_seguimiento_shortlists(integer, integer) TO service_role;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- 1 · La vieja ya no existe (debe dar 0):
--     SELECT count(*) FROM pg_proc WHERE proname = 'marcar_seguimiento_shortlist';
--
-- 2 · Nadie más que service_role puede ejecutarlas:
--     SELECT proname, proacl FROM pg_proc
--      WHERE proname IN ('confirmar_seguimientos_enviados','marcar_intento_seguimiento');
--
-- 3 · Sobre lo ya ocurrido, confirmar NO debe encontrar nada — Jenny e Israel
--     están marcadas como enviadas por la versión vieja y no hay saliente que
--     las respalde. Debe dar 0:
--     SELECT public.confirmar_seguimientos_enviados();
--
-- 🔴 EL ENDPOINT HAY QUE DESPLEGARLO: llama a `marcar_seguimiento_shortlist`,
--    que esta migración borra. Con el cron apagado no hay corridas, así que el
--    orden entre migración y deploy no importa — pero no se reenciende hasta
--    que las dos estén.
-- =============================================================================
