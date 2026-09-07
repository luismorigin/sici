-- ============================================================================
-- 353 · Los incidentes DEL CANAL van a su propia tabla (arregla 351 y 352)
--
-- 🔴 EL ERROR: `simon_bot_incidentes.contacto_id` es **NOT NULL con FK** a
--    `simon_contactos`. Las migs 351/352 insertaban ahí los incidentes del
--    canal (`desconectado`, `silencio`) con `contacto_id` NULL → 23502.
--    Y no es sólo esa columna: `telefono`, `mensaje_at` y `minutos_espera`
--    también son NOT NULL. Esa tabla es **estructuralmente por contacto**.
--
-- 🔑 CÓMO SE ME PASÓ, porque es reproducible: verifiqué las constraints con
--    `WHERE con.contype IN ('c','u')` — o sea que **mi consulta no podía ver un
--    NOT NULL**, que en Postgres no es una constraint de esa clase. Razoné todo
--    el diseño de la deduplicación alrededor de "contacto_id va NULL" sin que la
--    herramienta con la que miré pudiera desmentirme. Es exactamente la regla #9
--    del CLAUDE.md: *un barrido hereda el punto ciego de SU HERRAMIENTA*.
--
-- 🔴 Y LO PEOR NO ERA EL SILENCIO: el mismo INSERT está en la rama
--    `DISCONNECTED` de `vigilar_conexion_whatsapp`, que **sólo se ejecuta
--    durante un corte real**. Habría reventado con 23502 justo cuando la alarma
--    hacía falta — y la función entera aborta, así que tampoco habría mandado el
--    aviso a Slack. Una alarma que funciona en las pruebas y se rompe el día del
--    incidente. Se descubrió de casualidad, probando el detector B.
--
-- POR QUÉ NO SE RELAJAN LOS NOT NULL: cada fila de `simon_bot_incidentes`
-- significa "a esta persona no le contestamos". Sus consumidores (el parte
-- diario, /admin/contactos) lo asumen. Meter ahí un incidente sin contacto
-- obligaría a inventar una fila falsa en `simon_contactos` — un cliente que no
-- existe apareciendo como no atendido. El canal es otra cosa y va aparte.
-- ============================================================================

BEGIN;

-- ── 1 · Tabla propia para lo que le pasa al CANAL, no a una persona ─────────
CREATE TABLE IF NOT EXISTS public.simon_bot_alertas_canal (
  id           bigserial PRIMARY KEY,
  tipo         text        NOT NULL CHECK (tipo IN ('desconectado','silencio')),
  detectado_at timestamptz NOT NULL DEFAULT NOW(),
  resuelto_at  timestamptz,
  detalle      text
);

COMMENT ON TABLE public.simon_bot_alertas_canal IS
  'Fallas del CANAL de WhatsApp (numero desconectado, dia sin clientes), que no tienen '
  'contacto ni mensaje. Separada de simon_bot_incidentes, donde cada fila significa "a esta '
  'persona no le contestamos" y contacto_id/telefono/mensaje_at son NOT NULL (mig 353).';

-- 🔑 Dedup REAL, por indice y no a mano: un solo incidente abierto por tipo.
--    En la 351 la dedup era un NOT EXISTS en la funcion porque el indice de
--    simon_bot_incidentes es UNIQUE (contacto_id, tipo) y los NULL no colisionan.
--    Aca no hay NULLs de por medio: lo garantiza la base.
CREATE UNIQUE INDEX IF NOT EXISTS simon_bot_alertas_canal_uno_abierto
  ON public.simon_bot_alertas_canal (tipo) WHERE resuelto_at IS NULL;

CREATE INDEX IF NOT EXISTS simon_bot_alertas_canal_idx_detectado
  ON public.simon_bot_alertas_canal (detectado_at DESC);

-- 🔴 REVOKE PRIMERO (regla #13) — tabla Y secuencia del bigserial.
REVOKE ALL ON public.simon_bot_alertas_canal FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.simon_bot_alertas_canal_id_seq FROM anon, authenticated;
GRANT SELECT ON public.simon_bot_alertas_canal TO service_role;

-- ── 2 · Devolver `simon_bot_incidentes` a su vocabulario original ───────────
-- Ya no se usa para el canal, asi que los dos tipos nuevos de la 351 sobran.
-- (No hay filas que limpiar: los INSERT nunca entraron — fallaban con 23502.)
DELETE FROM public.simon_bot_incidentes WHERE tipo IN ('desconectado','silencio');
ALTER TABLE public.simon_bot_incidentes DROP CONSTRAINT IF EXISTS simon_bot_incidentes_tipo_check;
ALTER TABLE public.simon_bot_incidentes ADD CONSTRAINT simon_bot_incidentes_tipo_check
  CHECK (tipo = ANY (ARRAY['sin_respuesta','bot_error']));

COMMENT ON CONSTRAINT simon_bot_incidentes_tipo_check ON public.simon_bot_incidentes IS
  'Solo incidentes POR CONTACTO. Las fallas del canal viven en simon_bot_alertas_canal '
  '(mig 353): esta tabla exige contacto_id, telefono y mensaje_at NOT NULL.';

-- ── 3 · DETECTOR A, corregido ───────────────────────────────────────────────
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
  v_msg     text;
  v_out     jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO v_est FROM public.simon_bot_conexion WHERE id = 1 FOR UPDATE;

  -- 3a · LEER la respuesta que pidio la corrida anterior
  IF v_est.req_id IS NOT NULL THEN
    SELECT status_code, content, content_type, timed_out, error_msg
      INTO v_resp
      FROM net._http_response WHERE id = v_est.req_id;

    IF NOT FOUND THEN
      v_estado := 'INDETERMINADO';
    ELSIF v_resp.status_code <> 200 OR coalesce(v_resp.content_type,'') NOT LIKE '%json%' THEN
      -- Trampa 2: el host equivocado da 404 en HTML. NO es "desconectado", es
      -- "no pude verificar" — confundirlos manda una alarma falsa.
      v_estado := 'INDETERMINADO';
      v_est.detalle := format('HTTP %s · %s', v_resp.status_code, left(coalesce(v_resp.error_msg, v_resp.content_type,'?'), 60));
    ELSE
      -- Trampa 1: NO el `status` de primer nivel (dice "degraded" siempre por el
      -- display name pendiente). Verificado en vivo el 7-sep: primer nivel
      -- "degraded" con el numero CONNECTED.
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

      UPDATE public.simon_bot_alertas_canal
         SET resuelto_at = NOW()
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
      -- No alerta al primer fallo (un timeout suelto no es noticia), pero no se
      -- calla para siempre: 3 h sin poder verificar ES la noticia.
      IF v_est.fallos_seguidos + 1 = 6 THEN
        PERFORM public.slack_bot_aviso(format(
          E'⚠️ *No puedo verificar la conexión de WhatsApp* hace 3 h (6 intentos). %s\nNo significa que esté caído: significa que la alarma A está ciega. Revisar la API key y el host (app.kapso.ai).',
          coalesce('· ' || v_est.detalle, '')));
      END IF;

    ELSE  -- DISCONNECTED o cualquier otro estado que Meta reporte
      UPDATE public.simon_bot_conexion
         SET estado=v_estado, estado_at=NOW(), fallos_seguidos=0, req_id=NULL
       WHERE id=1;

      -- Dedup por indice: si ya hay uno abierto, no hace nada.
      INSERT INTO public.simon_bot_alertas_canal (tipo, detalle)
      VALUES ('desconectado', format('estado=%s', v_estado))
      ON CONFLICT DO NOTHING;

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

  -- 3b · PEDIR de nuevo, para que la proxima corrida tenga que leer
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'kapso_api_key';
  IF v_key IS NULL OR v_key = '' THEN
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

-- ── 4 · DETECTOR B, corregido ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vigilar_silencio_whatsapp()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reales  int;
  v_pruebas int;
  v_hoy     date := (NOW() AT TIME ZONE 'America/La_Paz')::date;
  v_yaesta  boolean;
BEGIN
  SELECT count(*) FILTER (WHERE t.telefono IS NULL),
         count(*) FILTER (WHERE t.telefono IS NOT NULL)
    INTO v_reales, v_pruebas
    FROM public.simon_mensajes m
    LEFT JOIN public.simon_telefonos_test t ON t.telefono = m.telefono
   WHERE m.direccion = 'in'
     AND (m.enviado_at AT TIME ZONE 'America/La_Paz') >= v_hoy + time '09:00'
     AND (m.enviado_at AT TIME ZONE 'America/La_Paz') <  v_hoy + time '17:00';

  IF v_reales > 0 THEN
    RETURN jsonb_build_object('entrantes_reales', v_reales, 'de_prueba', v_pruebas, 'alerta', false);
  END IF;

  -- Un aviso por dia como mucho (el indice parcial cubre el "uno abierto", pero
  -- el silencio se cierra solo al dia siguiente, asi que se chequea la fecha).
  SELECT EXISTS (SELECT 1 FROM public.simon_bot_alertas_canal
                  WHERE tipo='silencio'
                    AND (detectado_at AT TIME ZONE 'America/La_Paz')::date = v_hoy) INTO v_yaesta;

  IF NOT v_yaesta THEN
    -- El de ayer se cierra para no bloquear el indice parcial de hoy.
    UPDATE public.simon_bot_alertas_canal SET resuelto_at = NOW()
     WHERE tipo='silencio' AND resuelto_at IS NULL;

    INSERT INTO public.simon_bot_alertas_canal (tipo, detalle)
    VALUES ('silencio',
            format('0 entrantes REALES entre 09:00 y 17:00 del %s (%s de prueba, excluidos)', v_hoy, v_pruebas));

    PERFORM public.slack_bot_aviso(format(
      E'🔴 *WhatsApp en silencio* — CERO clientes reales entre las 09:00 y las 17:00 de hoy (%s).%s\n_En los últimos 24 días esto no pasó nunca salvo el corte del 6-sep; el día más flojo tuvo 5._\nSi el número figura CONNECTED, el problema está del lado del webhook o de la campaña.',
      to_char(v_hoy,'DD/MM'),
      CASE WHEN v_pruebas > 0
           THEN format(' (Hubo %s mensaje(s) de números de prueba, que NO cuentan.)', v_pruebas)
           ELSE '' END));
  END IF;

  RETURN jsonb_build_object('entrantes_reales', 0, 'de_prueba', v_pruebas, 'alerta', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.vigilar_conexion_whatsapp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vigilar_silencio_whatsapp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vigilar_conexion_whatsapp() TO postgres, service_role;
GRANT EXECUTE ON FUNCTION public.vigilar_silencio_whatsapp() TO postgres, service_role;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) El detector B, que hoy tiene que alertar (el unico entrante fue la prueba):
--      SELECT public.vigilar_silencio_whatsapp();
--      esperado: {"entrantes_reales": 0, "de_prueba": 1, "alerta": true}
--    ⚠️ Esto INSERTA y MANDA el aviso a Slack. Es la prueba de que el circuito
--       entero funciona: sin ver el mensaje en Slack no sabemos que sirve.
--
-- 2) Que quedo registrado:
--      SELECT tipo, detectado_at, resuelto_at, detalle FROM simon_bot_alertas_canal;
--
-- 3) Correrlo DOS VECES seguidas no debe duplicar ni mandar dos avisos.
--
-- 4) El detector A (la 2da corrida lee la respuesta de la 1ra):
--      SELECT public.vigilar_conexion_whatsapp();   -- {"pedido": true, ...}
--      -- esperar ~10 s
--      SELECT public.vigilar_conexion_whatsapp();   -- {"leido": "CONNECTED", ...}
--      SELECT estado, ultimo_ok_at FROM simon_bot_conexion;
--
-- 5) Que ni la tabla ni su secuencia sean escribibles desde el browser:
--      SELECT relacl FROM pg_class WHERE relname LIKE 'simon_bot_alertas_canal%';
--
-- ROLLBACK: reponer las funciones de la 351/352, DROP TABLE
--   simon_bot_alertas_canal, y devolver el CHECK a los 4 tipos.
-- ============================================================================
