-- ============================================================================
-- 351 · Alerta de DESCONEXIÓN del bot — que no volvamos a estar mudos sin saberlo
--
-- PEDIDO: lab-kapso, 7-sep-2026. El bot estuvo mudo 36 h (sáb 5-sep 20:30 →
-- lun 7-sep 10:20). Meta le sacó a Kapso el permiso sobre el número por
-- PRIMARY_INACTIVITY y cortó la Cloud API. ~15-20 leads PAGOS escribieron y
-- nadie contestó. El problema era visible en la API de Meta a los 47 minutos.
--
-- 🔴 POR QUÉ LA VIGILANCIA QUE YA TENÍAMOS NO LO VIO — comprobado, no supuesto.
--    `vigilar_bot_whatsapp()` (mig 305) detecta 'sin_respuesta': un cliente
--    escribió y el bot no contestó. Durante el corte **no pudo escribir nadie**,
--    así que no había qué detectar. Medido en nuestra propia base:
--      · 05/09 → 65 entrantes · **06/09 → la fecha NO EXISTE en simon_mensajes**
--      · último incidente registrado: 05/09 11:45, NUEVE HORAS ANTES del corte.
--    Es un punto ciego por construcción: la señal que mira necesita tráfico, y
--    la falla consiste en que no hay tráfico. (Regla #9 del CLAUDE.md: un
--    barrido hereda el punto ciego de su herramienta.)
--
-- DOS DETECTORES, y sólo uno se calibra:
--
--   A · ESTADO DEL NÚMERO (cada 30 min) — no se calibra: Meta responde
--       CONNECTED o DISCONNECTED, es un hecho. En este corte habría avisado a
--       las 21:30 del sábado: una hora contra treinta y seis.
--
--   B · SILENCIO (una vez al día, 17:00 Bolivia) — para el caso que A no ve:
--       Meta dice CONNECTED y los mensajes igual no llegan (pasó en julio).
--       🔑 **"N horas sin mensajes" NO SIRVE**: a las 9 de la mañana siempre
--       hace ~12 h que no entra nada y es normal. La pregunta correcta es
--       "desde que arrancó el día, ¿entró algo?".
--       ✅ VALIDADO CON NUESTROS DATOS, no sólo con los de ellos: sobre los
--       últimos 24 días, el único que alertaría es el **06/09, el corte mismo**.
--       Día más flojo 5 mensajes en la franja, promedio 27. Cero falsas alarmas.
--       ⚠️ Sobre 45 días darían 16, pero 15 de esos son 25/07-13/08 — el tramo
--       del bot caído 19 días. Son ceros REALES, no falsos positivos.
--
-- ⚠️ TRES TRAMPAS QUE LAB-KAPSO YA PAGÓ, respetadas acá:
--   1. NO se usa `j.status` de primer nivel: dice "degraded" de forma permanente
--      por el display name que Meta no aprobó. Se usa
--      `checks.phone_number_access.details.status`.
--   2. El host de /platform/v1 es **app.kapso.ai**, NO api.kapso.ai (ese es el
--      de envío). El equivocado devuelve 404 en HTML, que parseado se lee como
--      "no existe".
--   3. NO se avisa por WhatsApp: sería avisar de que WhatsApp está caído usando
--      WhatsApp. Va a Slack, por `slack_bot_aviso()`, que ya existe.
--
-- 🔑 Y UNA CUARTA, DE ACÁ: el índice `simon_bot_incidentes_uno_abierto` es
--    UNIQUE (contacto_id, tipo) WHERE resuelto_at IS NULL. Estos incidentes son
--    del CANAL, no de un contacto, así que `contacto_id` va NULL — y en Postgres
--    **los NULL son distintos entre sí**, o sea que ese índice NO deduplica nada.
--    36 h a 30 min habrían sido 72 incidentes y 72 avisos. La deduplicación se
--    hace explícita acá (NOT EXISTS + re-aviso cada 6 h).
-- ============================================================================

BEGIN;

-- ── 1 · Dos tipos nuevos de incidente ───────────────────────────────────────
ALTER TABLE public.simon_bot_incidentes DROP CONSTRAINT IF EXISTS simon_bot_incidentes_tipo_check;
ALTER TABLE public.simon_bot_incidentes ADD CONSTRAINT simon_bot_incidentes_tipo_check
  CHECK (tipo = ANY (ARRAY['sin_respuesta','bot_error','desconectado','silencio']));

COMMENT ON CONSTRAINT simon_bot_incidentes_tipo_check ON public.simon_bot_incidentes IS
  'sin_respuesta/bot_error son POR CONTACTO (mig 305). desconectado/silencio son DEL CANAL '
  '(mig 351): van con contacto_id NULL y NO los cubre el indice uno_abierto — dedup explicita.';

-- ── 2 · Estado del chequeo de conexión ──────────────────────────────────────
-- pg_net es ASÍNCRONO: http_get devuelve un id y la respuesta aparece después en
-- net._http_response. Una sola función no puede pedir y leer en el mismo tick.
-- 🔑 Por eso cada corrida LEE lo que pidió la corrida anterior y vuelve a pedir.
--    Latencia real 30-60 min, contra las 36 h de ahora. Intentar leer en el mismo
--    tick es lo que falló en la mig 339 del seguimiento (pg_net dejaba de
--    escuchar a los 5 s y la respuesta se perdía siempre).
CREATE TABLE IF NOT EXISTS public.simon_bot_conexion (
  id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- fila única
  req_id         bigint,        -- request de pg_net pendiente de lectura
  req_at         timestamptz,
  estado         text,          -- CONNECTED | DISCONNECTED | INDETERMINADO
  estado_at      timestamptz,
  ultimo_ok_at   timestamptz,
  fallos_seguidos int NOT NULL DEFAULT 0,   -- chequeos que no se pudieron leer
  alertado_at    timestamptz,   -- para no repetir el aviso cada 30 min
  detalle        text
);
INSERT INTO public.simon_bot_conexion (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- 🔴 REVOKE PRIMERO (regla #13): toda tabla nueva en `public` nace con
--    anon/authenticated en ALL por los default privileges del schema.
REVOKE ALL ON public.simon_bot_conexion FROM anon, authenticated;
GRANT SELECT ON public.simon_bot_conexion TO service_role;

-- ── 3 · DETECTOR A — el estado del número ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.vigilar_conexion_whatsapp()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_est     public.simon_bot_conexion%ROWTYPE;
  v_resp    RECORD;
  v_estado  text;
  v_key     text;
  v_req     bigint;
  v_abierto boolean;
  v_msg     text;
  v_out     jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_est FROM public.simon_bot_conexion WHERE id = 1 FOR UPDATE;

  -- 3a · LEER la respuesta que pidió la corrida anterior
  IF v_est.req_id IS NOT NULL THEN
    SELECT status_code, content, content_type, timed_out, error_msg
      INTO v_resp
      FROM net._http_response WHERE id = v_est.req_id;

    IF NOT FOUND THEN
      -- Ni respuesta ni error: pg_net purga a las pocas horas, o sigue en vuelo.
      v_estado := 'INDETERMINADO';
    ELSIF v_resp.status_code <> 200 OR coalesce(v_resp.content_type,'') NOT LIKE '%json%' THEN
      -- 🔑 Trampa 2: el host equivocado da 404 en HTML. NO es "desconectado",
      --    es "no pude verificar" — confundirlos manda una alarma falsa.
      v_estado := 'INDETERMINADO';
      v_est.detalle := format('HTTP %s · %s', v_resp.status_code, left(coalesce(v_resp.error_msg, v_resp.content_type,'?'), 60));
    ELSE
      -- 🔑 Trampa 1: NO el `status` de primer nivel (dice "degraded" siempre por
      --    el display name pendiente), sino el del chequeo de acceso al número.
      v_estado := (v_resp.content::jsonb) #>> '{checks,phone_number_access,details,status}';
      IF v_estado IS NULL THEN
        v_estado := 'INDETERMINADO';
        v_est.detalle := 'la respuesta no trae checks.phone_number_access.details.status';
      END IF;
    END IF;

    IF v_estado = 'CONNECTED' THEN
      UPDATE public.simon_bot_conexion
         SET estado='CONNECTED', estado_at=NOW(), ultimo_ok_at=NOW(),
             fallos_seguidos=0, alertado_at=NULL, detalle=NULL, req_id=NULL
       WHERE id=1;

      -- Se resolvió: cerrar el incidente abierto y avisar la vuelta.
      UPDATE public.simon_bot_incidentes
         SET resuelto_at = NOW(),
             minutos_a_resolver = EXTRACT(epoch FROM (NOW()-detectado_at))/60
       WHERE tipo='desconectado' AND resuelto_at IS NULL;
      IF FOUND THEN
        PERFORM public.slack_bot_aviso('✅ *WhatsApp reconectado* — el número volvió a CONNECTED.');
      END IF;

    ELSIF v_estado = 'INDETERMINADO' THEN
      UPDATE public.simon_bot_conexion
         SET estado='INDETERMINADO', estado_at=NOW(),
             fallos_seguidos = v_est.fallos_seguidos + 1,
             detalle = v_est.detalle, req_id=NULL
       WHERE id=1;
      -- 🔑 No alerta al primer fallo: un timeout suelto no es noticia. Pero
      --    tampoco se calla para siempre — si no se puede verificar durante 3 h,
      --    eso ES la noticia (es el modo en que una alarma muere en silencio).
      IF v_est.fallos_seguidos + 1 = 6 THEN
        -- 🔑 UN SOLO literal E'' por mensaje: Postgres NO concatena implicitamente
        --    un literal normal con uno E'' (42601). Mezclarlos rompe la migracion.
        PERFORM public.slack_bot_aviso(format(
          E'⚠️ *No puedo verificar la conexión de WhatsApp* hace 3 h (6 intentos). %s\nNo significa que esté caído: significa que la alarma A está ciega. Revisar la API key y el host (app.kapso.ai).',
          coalesce('· ' || v_est.detalle, '')));
      END IF;

    ELSE  -- DISCONNECTED o cualquier otro estado que Meta reporte
      UPDATE public.simon_bot_conexion
         SET estado=v_estado, estado_at=NOW(), fallos_seguidos=0, req_id=NULL
       WHERE id=1;

      -- Dedup explícita (ver trampa 4 en la cabecera).
      SELECT EXISTS (SELECT 1 FROM public.simon_bot_incidentes
                      WHERE tipo='desconectado' AND resuelto_at IS NULL) INTO v_abierto;
      IF NOT v_abierto THEN
        INSERT INTO public.simon_bot_incidentes (tipo, detectado_at, mensaje_texto)
        VALUES ('desconectado', NOW(), format('estado=%s', v_estado));
      END IF;

      -- Avisa al detectarlo, y re-avisa cada 6 h mientras siga caído.
      IF v_est.alertado_at IS NULL OR v_est.alertado_at < NOW() - interval '6 hours' THEN
        v_msg := format(
          E'🔴 *WhatsApp DESCONECTADO* — estado del número: `%s`.\n_Meta cortó la Cloud API. Reconectar escaneando el QR desde el celular; no se arregla solo._\n%s',
          v_estado,
          CASE WHEN v_est.ultimo_ok_at IS NOT NULL
               THEN format('Último CONNECTED: %s (hace %s).',
                      to_char(v_est.ultimo_ok_at AT TIME ZONE 'America/La_Paz','DD/MM HH24:MI'),
                      justify_interval(NOW() - v_est.ultimo_ok_at))
               ELSE '' END);
        PERFORM public.slack_bot_aviso(v_msg);
        UPDATE public.simon_bot_conexion SET alertado_at = NOW() WHERE id=1;
      END IF;
    END IF;

    v_out := jsonb_build_object('leido', v_estado);
  END IF;

  -- 3b · PEDIR de nuevo, para que la próxima corrida tenga qué leer
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'kapso_api_key';
  IF v_key IS NULL OR v_key = '' THEN
    -- Mismo criterio que slack_bot_aviso: sin secreto no se rompe la vigilancia,
    -- se avisa. Perder el aviso es malo; que reviente el cron sería peor.
    RAISE WARNING '[vigilar_conexion_whatsapp] falta el secreto kapso_api_key en Vault';
    RETURN v_out || jsonb_build_object('pedido', false, 'motivo', 'falta kapso_api_key');
  END IF;

  SELECT net.http_get(
    url     := 'https://app.kapso.ai/platform/v1/whatsapp/phone_numbers/998245303375051/health',
    headers := jsonb_build_object('X-API-Key', v_key, 'Accept', 'application/json'),
    timeout_milliseconds := 8000
  ) INTO v_req;

  UPDATE public.simon_bot_conexion SET req_id = v_req, req_at = NOW() WHERE id = 1;
  RETURN v_out || jsonb_build_object('pedido', true, 'req_id', v_req);
END;
$function$;

-- ── 4 · DETECTOR B — el silencio ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vigilar_silencio_whatsapp()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cant   int;
  v_hoy    date := (NOW() AT TIME ZONE 'America/La_Paz')::date;
  v_abierto boolean;
BEGIN
  SELECT count(*) INTO v_cant
    FROM public.simon_mensajes
   WHERE direccion = 'in'
     AND (enviado_at AT TIME ZONE 'America/La_Paz') >= v_hoy + time '09:00'
     AND (enviado_at AT TIME ZONE 'America/La_Paz') <  v_hoy + time '17:00';

  IF v_cant > 0 THEN
    RETURN jsonb_build_object('entrantes', v_cant, 'alerta', false);
  END IF;

  -- Un incidente por día como mucho.
  SELECT EXISTS (SELECT 1 FROM public.simon_bot_incidentes
                  WHERE tipo='silencio'
                    AND (detectado_at AT TIME ZONE 'America/La_Paz')::date = v_hoy) INTO v_abierto;
  IF NOT v_abierto THEN
    INSERT INTO public.simon_bot_incidentes (tipo, detectado_at, mensaje_texto)
    VALUES ('silencio', NOW(), format('0 entrantes entre 09:00 y 17:00 del %s', v_hoy));

    PERFORM public.slack_bot_aviso(format(
      E'🔴 *WhatsApp en silencio* — CERO mensajes entrantes entre las 09:00 y las 17:00 de hoy (%s).\n_En los últimos 24 días esto no pasó nunca salvo el corte del 6-sep; el día más flojo tuvo 5._\nSi el número figura CONNECTED, el problema está del lado del webhook o de la campaña.',
      to_char(v_hoy,'DD/MM')));
  END IF;

  RETURN jsonb_build_object('entrantes', 0, 'alerta', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.vigilar_conexion_whatsapp()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vigilar_silencio_whatsapp()  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vigilar_conexion_whatsapp() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.vigilar_silencio_whatsapp() TO postgres, service_role;

COMMIT;

-- ============================================================================
-- AGENDAR — correr APARTE, después de cargar el secreto (ver abajo)
-- ============================================================================
-- 🔴 PASO PREVIO OBLIGATORIO, y lo hace el founder, no Claude: cargar la API key
--    de Kapso en Vault. Desde el SQL Editor de Supabase:
--      SELECT vault.create_secret('<LA_API_KEY>', 'kapso_api_key', 'Kapso platform API');
--    Sin eso, el detector A no pide nada (avisa por WARNING y no rompe el cron).
--
-- ⚠️ pg_cron agenda en UTC. Bolivia es UTC-4 → las 17:00 de La Paz son las 21:00.
--
--   SELECT cron.schedule('vigilar-conexion-wa', '*/30 * * * *',
--                        $$SELECT public.vigilar_conexion_whatsapp();$$);
--   SELECT cron.schedule('vigilar-silencio-wa', '0 21 * * *',
--                        $$SELECT public.vigilar_silencio_whatsapp();$$);
--
-- Frenar: SELECT cron.unschedule('vigilar-conexion-wa');
-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) A mano, dos veces seguidas (la 1ra pide, la 2da lee):
--      SELECT public.vigilar_conexion_whatsapp();   -- {"pedido": true, "req_id": ...}
--      -- esperar ~10 s
--      SELECT public.vigilar_conexion_whatsapp();   -- {"leido": "CONNECTED", ...}
--      SELECT estado, ultimo_ok_at, fallos_seguidos, detalle FROM simon_bot_conexion;
--
-- 2) El silencio, hoy (debería dar alerta=false con el bot andando):
--      SELECT public.vigilar_silencio_whatsapp();
--
-- 3) 🔴 Que el aviso LLEGUE A SLACK, que es lo único que prueba que sirve:
--      SELECT public.slack_bot_aviso('prueba de la mig 351 — ignorar');
--    Un incidente registrado que nadie ve es exactamente el problema que
--    esto viene a resolver.
--
-- 4) Que la tabla nueva NO sea escribible desde el browser:
--      SELECT relacl FROM pg_class WHERE relname='simon_bot_conexion';
--
-- ROLLBACK:
--   SELECT cron.unschedule('vigilar-conexion-wa');
--   SELECT cron.unschedule('vigilar-silencio-wa');
--   DROP FUNCTION public.vigilar_conexion_whatsapp(), public.vigilar_silencio_whatsapp();
--   DROP TABLE public.simon_bot_conexion;
--   -- y devolver el CHECK a ARRAY['sin_respuesta','bot_error'] (borrando antes
--   --    las filas de los tipos nuevos, si las hubiera).
-- ============================================================================
