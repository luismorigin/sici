-- =============================================================================
-- 305 — Vigilancia del bot de WhatsApp (alarma de silencio + parte diario)
-- =============================================================================
-- POR QUÉ EXISTE
-- El 100% del tráfico de la campaña de marketing entra por el bot de Kapso, y
-- hoy NADA avisa si el bot deja de contestar. Ya pasó: el 24-jul-2026, entre
-- 20:10 y 20:23, una persona escribió 5 mensajes ("Hola" ×4) y estuvo 12
-- MINUTOS sin respuesta. Nadie se enteró. Con tráfico real, esa persona no
-- vuelve.
--
-- LA IDEA CENTRAL: no hace falta saber la CAUSA.
-- Se acabaron los créditos del LLM, se cayó el modelo, el flujo hizo handoff a
-- un humano que no existe, hay un bug: desde el lado del cliente TODAS esas
-- fallas se ven igual — nadie le contestó. Entonces se vigila UNA señal, no
-- diez alarmas: "hay alguien esperando hace más de N minutos".
--
-- POR QUÉ NO SE USA EL EVENTO `conversation.inactive` DE KAPSO
-- Kapso mide silencio, no mide QUIÉN quedó esperando: a 3 minutos dispararía en
-- toda conversación normal (el cliente recibe su selección y se va a mirarla).
-- Su payload trae `since_message.direction`, así que se podría filtrar — pero
-- entonces el filtro vive igual de nuestro lado. Preguntándolo a la BD no hay
-- ruido POR CONSTRUCCIÓN (solo se mira donde el cliente habló último), el
-- umbral es un número y no un webhook por umbral, y la misma consulta arma el
-- parte diario. Kapso queda intacto: su webhook actual no se toca.
--
-- POR QUÉ VIVE EN LA BD Y NO EN VERCEL
-- El vigilante no puede depender de la laptop encendida (las routines del
-- híbrido sí lo hacen, y son nocturnas) ni gastar invocaciones de Vercel cada
-- 3 minutos. pg_cron ya estaba instalado. Además el aviso NO puede viajar por
-- el canal que vigila: si se agota Kapso, un aviso por WhatsApp tampoco sale.
-- Por eso Slack, que ya recibe los avisos de las routines nocturnas.
--
-- COSTO: la consulta usa `simon_mensajes_idx_timeline (contacto_id, enviado_at
-- DESC)`, que ya existía → no recorre la tabla. Una sola visita al feed de
-- /ventas le da más trabajo a la BD que las 480 corridas diarias de esto.
--
-- -----------------------------------------------------------------------------
-- 🔴 PRE-REQUISITOS (hacer ANTES de aplicar esta migración)
-- -----------------------------------------------------------------------------
-- 1. Habilitar pg_net (Dashboard → Database → Extensions → buscar "pg_net" →
--    activar). Es lo único que le falta a la BD para poder llamar a Slack.
--    Verificar: SELECT 1 FROM pg_extension WHERE extname='pg_net';
--
-- 2. Guardar la URL del webhook de Slack en Vault (NO hardcodearla acá: este
--    archivo va al repo). Correr una vez, con la URL real:
--
--      SELECT vault.create_secret(
--        'https://hooks.slack.com/services/XXX/YYY/ZZZ',
--        'slack_webhook_bot',
--        'Webhook de Slack para las alertas del bot de WhatsApp (mig 305)'
--      );
--
--    La URL está en simon-mvp/.env.local como SLACK_WEBHOOK_URL.
--    Verificar: SELECT name FROM vault.decrypted_secrets WHERE name='slack_webhook_bot';
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Extensión para que la BD pueda hablar hacia afuera
-- -----------------------------------------------------------------------------
-- Si esto falla por permisos, activarla desde el Dashboard (ver pre-requisito 1)
-- y volver a correr la migración.
CREATE EXTENSION IF NOT EXISTS pg_net;


-- -----------------------------------------------------------------------------
-- 2. Tabla de incidentes
-- -----------------------------------------------------------------------------
-- No es solo un buffer de alertas: es el HISTORIAL. Responde "¿cuántas veces se
-- rompió este mes?" y "¿cuánto tarda en recuperarse?", que es lo que decide si
-- el bot es confiable o no. Sin esto cada incidente se olvida al resolverse.
CREATE TABLE IF NOT EXISTS public.simon_bot_incidentes (
  id                 BIGSERIAL PRIMARY KEY,
  tipo               TEXT NOT NULL CHECK (tipo IN ('sin_respuesta', 'bot_error')),
  contacto_id        UUID NOT NULL REFERENCES public.simon_contactos(id) ON DELETE CASCADE,
  telefono           TEXT NOT NULL,
  -- UUID, no BIGINT: simon_mensajes.id es uuid (verificado en la BD antes de
  -- escribir esto — con BIGINT el CREATE TABLE falla por tipo incompatible).
  -- Para 'sin_respuesta': el mensaje del cliente que quedó sin contestar.
  -- Para 'bot_error': el mensaje del bot que declaró la falla.
  mensaje_id         UUID REFERENCES public.simon_mensajes(id) ON DELETE SET NULL,
  mensaje_at         TIMESTAMPTZ NOT NULL,
  mensaje_texto      TEXT,
  detectado_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  minutos_espera     INTEGER NOT NULL DEFAULT 0,
  notificado_at      TIMESTAMPTZ,
  resuelto_at        TIMESTAMPTZ,
  minutos_a_resolver INTEGER
);

COMMENT ON TABLE public.simon_bot_incidentes IS
  'Incidentes del bot de WhatsApp. tipo=sin_respuesta: el cliente habló último y '
  'pasó el umbral (cubre créditos agotados, LLM caído, handoff sin humano, bug — '
  'todos se ven igual desde el cliente). tipo=bot_error: el bot declaró una falla '
  'en voz alta. Lo escribe public.vigilar_bot_whatsapp() vía pg_cron cada 3 min. '
  'Consumers: parte_diario_bot() y consultas ad-hoc. Migración 305.';

-- 🔑 EL CANDADO ANTI-REPETICIÓN, garantizado por la BD y no por la lógica.
-- Sin esto una conversación trabada 40 min avisaría 13 veces y en una semana
-- el canal se silencia (que es como mueren los sistemas de alertas).
-- Un solo incidente ABIERTO por contacto y tipo; los cerrados no estorban.
CREATE UNIQUE INDEX IF NOT EXISTS simon_bot_incidentes_uno_abierto
  ON public.simon_bot_incidentes(contacto_id, tipo)
  WHERE resuelto_at IS NULL;

-- Un mensaje de error del bot se avisa UNA vez. Acotado a tipo='bot_error' para
-- que nunca choque con las filas de 'sin_respuesta', que guardan el id del
-- mensaje del cliente.
CREATE UNIQUE INDEX IF NOT EXISTS simon_bot_incidentes_error_unico
  ON public.simon_bot_incidentes(mensaje_id)
  WHERE tipo = 'bot_error';

CREATE INDEX IF NOT EXISTS simon_bot_incidentes_idx_detectado
  ON public.simon_bot_incidentes(detectado_at DESC);


-- -----------------------------------------------------------------------------
-- 3. GRANTS — Preset D (operacional interna, sin acceso desde el browser)
-- -----------------------------------------------------------------------------
-- 🔴 REVOKE PRIMERO: toda tabla nueva en `public` nace con anon/authenticated en
-- ALL por los default privileges del schema, y los GRANT suman pero no revocan
-- (lección migs 283→284 y 290→291). Sin esto, teléfonos de clientes quedarían
-- escribibles desde el browser con la anon key.
REVOKE ALL ON public.simon_bot_incidentes FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.simon_bot_incidentes_id_seq FROM anon, authenticated;

GRANT ALL    ON public.simon_bot_incidentes TO service_role;
GRANT SELECT ON public.simon_bot_incidentes TO claude_readonly;


-- -----------------------------------------------------------------------------
-- 4. Enviar a Slack
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER es necesario acá y está acotado a propósito: hay que leer
-- vault.decrypted_secrets (restringido) y la llaman pg_cron y nadie más. NO se
-- le da EXECUTE a anon/authenticated — si no, cualquiera desde el browser
-- mandaría mensajes al Slack del negocio.
CREATE OR REPLACE FUNCTION public.slack_bot_aviso(p_texto TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, extensions
AS $$
DECLARE
  v_url TEXT;
  v_req BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets
  WHERE name = 'slack_webhook_bot';

  -- Sin secreto configurado no se rompe la vigilancia: el incidente SE REGISTRA
  -- igual y el parte diario lo va a mostrar. Perder el aviso es malo; perder el
  -- registro sería peor.
  IF v_url IS NULL OR v_url = '' THEN
    RAISE WARNING '[slack_bot_aviso] falta el secreto slack_webhook_bot en Vault';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url,
    body    := jsonb_build_object('text', p_texto, 'unfurl_links', false),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  ) INTO v_req;

  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION public.slack_bot_aviso(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.slack_bot_aviso(TEXT) TO service_role;

COMMENT ON FUNCTION public.slack_bot_aviso(TEXT) IS
  'Manda un texto al Slack del negocio leyendo la URL de Vault (slack_webhook_bot). '
  'SECURITY DEFINER porque vault.decrypted_secrets es restringido; sin EXECUTE para '
  'anon/authenticated a propósito. La llaman vigilar_bot_whatsapp() y parte_diario_bot(). '
  'Migración 305.';


-- -----------------------------------------------------------------------------
-- 5. El vigilante — corre cada 3 minutos
-- -----------------------------------------------------------------------------
-- Umbral 3 min medido sobre datos reales: el bot responde en 16 s promedio y
-- 28 s en el peor caso observado. 3 min es 6× el peor caso ⇒ no grita en falso.
--
-- La ventana horaria evita despertarlo a las 3 AM: fuera de ella el incidente
-- se REGISTRA igual (con notificado_at NULL) y se avisa al abrir la ventana a
-- la mañana. Un bot roto de madrugada se atiende a las 7; una alerta que suena
-- de noche se silencia para siempre.
CREATE OR REPLACE FUNCTION public.vigilar_bot_whatsapp(
  p_umbral_min INTEGER DEFAULT 3,
  p_hora_desde INTEGER DEFAULT 7,
  p_hora_hasta INTEGER DEFAULT 23
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, extensions
AS $$
DECLARE
  v_abiertos   INTEGER := 0;
  v_cerrados   INTEGER := 0;
  v_errores    INTEGER := 0;
  v_hora_local INTEGER;
  v_notificar  BOOLEAN;
  r            RECORD;
  v_texto      TEXT;
  v_espera     INTEGER;
BEGIN
  v_hora_local := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/La_Paz'))::INTEGER;
  v_notificar  := v_hora_local >= p_hora_desde AND v_hora_local < p_hora_hasta;

  -- ---------------------------------------------------------------------------
  -- 5a. CERRAR los incidentes donde el bot ya contestó
  -- ---------------------------------------------------------------------------
  -- Va primero para que un incidente que se resolvió solo no se cuente como
  -- abierto en la misma corrida.
  --
  -- El subquery del "último mensaje por conversación" se repite en 5a y 5b a
  -- propósito, en vez de materializarlo en una tabla temporal: son dos
  -- sentencias distintas (UPDATE e INSERT) y no pueden compartir un CTE. Con el
  -- índice (contacto_id, enviado_at DESC) cada lookup es directo, y así la
  -- función no arrastra el ciclo de vida de una temp table (que revienta con
  -- "relation already exists" si se la llama dos veces en la misma transacción).
  WITH ultimo AS (
    SELECT DISTINCT ON (m.contacto_id)
           m.contacto_id, m.direccion, m.enviado_at
    FROM public.simon_mensajes m
    ORDER BY m.contacto_id, m.enviado_at DESC
  ),
  cerrados AS (
    UPDATE public.simon_bot_incidentes i
    SET resuelto_at = NOW(),
        minutos_a_resolver =
          CEIL(EXTRACT(EPOCH FROM (u.enviado_at - i.mensaje_at)) / 60)::INTEGER
    FROM ultimo u
    WHERE i.contacto_id = u.contacto_id
      AND i.tipo = 'sin_respuesta'
      AND i.resuelto_at IS NULL
      AND u.direccion = 'out'
      AND u.enviado_at > i.mensaje_at
    RETURNING i.id
  )
  SELECT COUNT(*) INTO v_cerrados FROM cerrados;

  -- ---------------------------------------------------------------------------
  -- 5b. ABRIR incidentes: el cliente habló último y pasó el umbral
  -- ---------------------------------------------------------------------------
  -- NOT EXISTS en vez de ON CONFLICT: la inferencia de índices parciales en
  -- ON CONFLICT es delicada, y acá no hay carrera posible (un solo escritor,
  -- pg_cron, cada 3 min). Los índices únicos quedan igual como red de seguridad.
  WITH ultimo AS (
    SELECT DISTINCT ON (m.contacto_id)
           m.contacto_id, m.id AS mensaje_id, m.telefono,
           m.direccion, m.enviado_at, m.texto
    FROM public.simon_mensajes m
    ORDER BY m.contacto_id, m.enviado_at DESC
  ),
  nuevos AS (
    INSERT INTO public.simon_bot_incidentes
      (tipo, contacto_id, telefono, mensaje_id, mensaje_at, mensaje_texto, minutos_espera)
    SELECT 'sin_respuesta', u.contacto_id, u.telefono, u.mensaje_id, u.enviado_at,
           LEFT(COALESCE(u.texto, ''), 300),
           FLOOR(EXTRACT(EPOCH FROM (NOW() - u.enviado_at)) / 60)::INTEGER
    FROM ultimo u
    WHERE u.direccion = 'in'
      AND u.enviado_at < NOW() - MAKE_INTERVAL(mins => p_umbral_min)
      -- Un mensaje de hace días no es una urgencia de ahora: es historia. Sin
      -- este techo, al aplicar la migración se abriría un incidente por cada
      -- conversación vieja que quedó con el cliente hablando último.
      AND u.enviado_at > NOW() - INTERVAL '6 hours'
      AND NOT EXISTS (
        SELECT 1 FROM public.simon_bot_incidentes i
        WHERE i.contacto_id = u.contacto_id
          AND i.tipo = 'sin_respuesta'
          AND i.resuelto_at IS NULL
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_abiertos FROM nuevos;

  -- ---------------------------------------------------------------------------
  -- 5c. El bot declarando su propia falla
  -- ---------------------------------------------------------------------------
  -- Señal distinta y complementaria: acá el bot SÍ contesta, así que 5b no lo
  -- ve, pero le está diciendo al cliente que algo se rompió. El 24-jul mandó
  -- "Tuve un problema técnico al armar la selección" y "Sigo teniendo el mismo
  -- error". También se cazan las fugas de razonamiento en inglés ("Let me check
  -- for previous context first."), que ese mismo día le llegaron al cliente.
  --
  -- Los patrones son deliberadamente ESTRECHOS: un falso positivo acá entrena a
  -- ignorar el canal. Si aparece ruido, angostar más — no ensanchar.
  WITH errores AS (
    INSERT INTO public.simon_bot_incidentes
      (tipo, contacto_id, telefono, mensaje_id, mensaje_at, mensaje_texto, resuelto_at)
    SELECT 'bot_error', m.contacto_id, m.telefono, m.id, m.enviado_at,
           LEFT(m.texto, 300),
           -- Es un EVENTO puntual, no un estado que se resuelva: nace cerrado
           -- para no bloquear el índice parcial de 'sin_respuesta'.
           NOW()
    FROM public.simon_mensajes m
    WHERE m.direccion = 'out'
      AND m.enviado_at > NOW() - INTERVAL '1 hour'
      AND (
        m.texto ILIKE '%problema técnico%'
        OR m.texto ILIKE '%un error%'
        OR m.texto ILIKE '%mismo error%'
        OR m.texto ILIKE '%Let me %'      -- plomería del LLM que se escapó
        OR m.texto ILIKE '%I need to %'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.simon_bot_incidentes i
        WHERE i.mensaje_id = m.id AND i.tipo = 'bot_error'
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_errores FROM errores;

  -- ---------------------------------------------------------------------------
  -- 5d. Avisar (una línea por incidente nuevo, solo dentro de la ventana)
  -- ---------------------------------------------------------------------------
  IF v_notificar THEN
    FOR r IN
      SELECT id, tipo, telefono, mensaje_texto, mensaje_at
      FROM public.simon_bot_incidentes
      WHERE notificado_at IS NULL
        -- 12 h y no 1 h: lo detectado de madrugada quedó sin notificar por la
        -- ventana horaria, y tiene que salir cuando la ventana abre a las 7.
        -- Con 1 h esos incidentes no se avisaban NUNCA.
        AND detectado_at > NOW() - INTERVAL '12 hours'
      ORDER BY detectado_at
      LIMIT 10   -- si hay más, el problema es general: lo dice el parte diario
    LOOP
      -- La espera se recalcula ACÁ, no se usa la registrada: un incidente
      -- detectado a las 2 AM y avisado a las 7 esperó 5 horas, no 3 minutos.
      v_espera := FLOOR(EXTRACT(EPOCH FROM (NOW() - r.mensaje_at)) / 60)::INTEGER;

      v_texto := CASE r.tipo
        WHEN 'sin_respuesta' THEN
          format(':warning: *Alguien esperando hace %s min* — %s'
                 || E'\n> %s'
                 || E'\nhttps://simonbo.com/admin/contactos',
                 v_espera, r.telefono, COALESCE(r.mensaje_texto, '(sin texto)'))
        ELSE
          format(':robot_face: *El bot le dijo al cliente que falló* — %s'
                 || E'\n> %s'
                 || E'\nhttps://simonbo.com/admin/contactos',
                 r.telefono, COALESCE(r.mensaje_texto, '(sin texto)'))
      END;

      PERFORM public.slack_bot_aviso(v_texto);

      UPDATE public.simon_bot_incidentes
      SET notificado_at = NOW()
      WHERE id = r.id;
    END LOOP;
  END IF;

  RETURN format('abiertos=%s cerrados=%s bot_error=%s notificado=%s',
                v_abiertos, v_cerrados, v_errores, v_notificar);
END;
$$;

REVOKE ALL ON FUNCTION public.vigilar_bot_whatsapp(INTEGER, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vigilar_bot_whatsapp(INTEGER, INTEGER, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.vigilar_bot_whatsapp(INTEGER, INTEGER, INTEGER) IS
  'Detecta que el bot dejó de contestar (cliente habló último + umbral) y que el bot '
  'declaró fallas. Escribe simon_bot_incidentes y avisa a Slack una vez por incidente. '
  'La corre pg_cron cada 3 min (job vigilar-bot-wa). Umbral 3 min = 6x el peor tiempo '
  'de respuesta observado (28 s). Migración 305.';


-- -----------------------------------------------------------------------------
-- 6. Parte diario — 21:00 Bolivia
-- -----------------------------------------------------------------------------
-- Es la mitad rutinaria: las alertas son la excepción, esto es el seguimiento
-- normal. También tapa el punto ciego del vigilante: si el que se cae es el
-- WEBHOOK, no llega ningún mensaje ⇒ nadie "espera" ⇒ el vigilante queda mudo.
-- Un parte que dice "0 conversaciones" en plena campaña delata eso.
CREATE OR REPLACE FUNCTION public.parte_diario_bot()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net, extensions
AS $$
DECLARE
  v_desde        TIMESTAMPTZ;
  v_conv         INTEGER;
  v_nuevos       INTEGER;
  v_msg_in       INTEGER;
  v_msg_out      INTEGER;
  v_inc_hoy      INTEGER;
  v_inc_abiertos INTEGER;
  v_peor         INTEGER;
  v_clics        INTEGER;
  v_clics_malos  INTEGER;
  v_piezas       TEXT;
  v_texto        TEXT;
BEGIN
  -- Día calendario de Bolivia, no el de UTC: un mensaje de las 21:00 local es
  -- de HOY, aunque en UTC ya sea mañana.
  v_desde := (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/La_Paz'))
             AT TIME ZONE 'America/La_Paz';

  SELECT COUNT(DISTINCT contacto_id),
         COUNT(*) FILTER (WHERE direccion = 'in'),
         COUNT(*) FILTER (WHERE direccion = 'out')
  INTO v_conv, v_msg_in, v_msg_out
  FROM public.simon_mensajes
  WHERE enviado_at >= v_desde;

  SELECT COUNT(*) INTO v_nuevos
  FROM public.simon_contactos WHERE created_at >= v_desde;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE resuelto_at IS NULL), MAX(minutos_a_resolver)
  INTO v_inc_hoy, v_inc_abiertos, v_peor
  FROM public.simon_bot_incidentes
  WHERE detectado_at >= v_desde AND tipo = 'sin_respuesta';

  SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT valido)
  INTO v_clics, v_clics_malos
  FROM public.mkt_clicks_puente WHERE creado_en >= v_desde;

  -- Qué publicaciones trajeron clics hoy. Responde la única pregunta que
  -- importa de la campaña: cuál pieza funciona.
  SELECT STRING_AGG(t.linea, E'\n' ORDER BY t.n DESC)
  INTO v_piezas
  FROM (
    SELECT format('   · %s — %s clic(s)',
                  COALESCE(pz.nombre, '(pieza ' || c.pieza_num || ')'), COUNT(*)) AS linea,
           COUNT(*) AS n
    FROM public.mkt_clicks_puente c
    LEFT JOIN public.mkt_piezas pz ON pz.num = c.pieza_num
    WHERE c.creado_en >= v_desde AND c.pieza_num IS NOT NULL
    GROUP BY pz.nombre, c.pieza_num
    ORDER BY n DESC
    LIMIT 5
  ) t;

  v_texto := format(
    ':bar_chart: *Parte diario del bot* — %s'
    || E'\n• Conversaciones: *%s*  ·  contactos nuevos: *%s*'
    || E'\n• Mensajes: %s del cliente / %s del bot'
    || E'\n• Clics de publicaciones: *%s*%s',
    TO_CHAR(NOW() AT TIME ZONE 'America/La_Paz', 'DD/MM'),
    v_conv, v_nuevos, v_msg_in, v_msg_out, v_clics,
    CASE WHEN v_clics_malos > 0
         THEN format('  :warning: %s con el código mal escrito', v_clics_malos)
         ELSE '' END
  );

  IF v_piezas IS NOT NULL THEN
    v_texto := v_texto || E'\n' || v_piezas;
  END IF;

  IF v_inc_hoy > 0 THEN
    v_texto := v_texto || format(
      E'\n• :warning: Incidentes: *%s* hoy (%s sin resolver). Peor demora: %s min',
      v_inc_hoy, v_inc_abiertos, COALESCE(v_peor::TEXT, '—'));
  ELSE
    v_texto := v_texto || E'\n• :white_check_mark: Sin incidentes';
  END IF;

  -- Silencio total en plena campaña es sospechoso, no tranquilizador: puede ser
  -- el webhook caído (y en ese caso el vigilante de los 3 min no ve nada).
  IF v_conv = 0 AND v_clics = 0 THEN
    v_texto := v_texto ||
      E'\n:mag: Cero actividad hoy. Si hay campaña publicada, revisar el webhook '
      || 'de Kapso (historial de entregas) — el vigilante no puede detectar esto.';
  END IF;

  v_texto := v_texto || E'\nhttps://simonbo.com/admin/contactos';

  PERFORM public.slack_bot_aviso(v_texto);
  RETURN v_texto;
END;
$$;

REVOKE ALL ON FUNCTION public.parte_diario_bot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parte_diario_bot() TO service_role;

COMMENT ON FUNCTION public.parte_diario_bot() IS
  'Resumen diario del bot a Slack: conversaciones, contactos nuevos, clics por pieza e '
  'incidentes. Día calendario de Bolivia. La corre pg_cron a las 01:00 UTC = 21:00 local '
  '(job parte-diario-bot). Migración 305.';


-- -----------------------------------------------------------------------------
-- 7. Agendar
-- -----------------------------------------------------------------------------
-- Idempotente: se desagenda primero para que re-aplicar la migración con otra
-- expresión no deje dos jobs conviviendo.
SELECT cron.unschedule('vigilar-bot-wa')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'vigilar-bot-wa');
SELECT cron.unschedule('parte-diario-bot')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'parte-diario-bot');

SELECT cron.schedule(
  'vigilar-bot-wa',
  '*/3 * * * *',
  $cron$SELECT public.vigilar_bot_whatsapp()$cron$
);

-- 01:00 UTC = 21:00 en Bolivia (UTC-4). La BD corre en UTC y pg_cron NO conoce
-- husos horarios, así que la conversión se hace a mano acá.
SELECT cron.schedule(
  'parte-diario-bot',
  '0 1 * * *',
  $cron$SELECT public.parte_diario_bot()$cron$
);


-- =============================================================================
-- 8. ROLLBACK
-- =============================================================================
--   SELECT cron.unschedule('vigilar-bot-wa');
--   SELECT cron.unschedule('parte-diario-bot');
--   -- Apagar solo las alertas sin perder el historial: alcanza con lo de arriba.
--   -- Para revertir del todo (patrón _trash_*, Regla 3 de SEGURIDAD_SUPABASE):
--   ALTER TABLE public.simon_bot_incidentes RENAME TO _trash_simon_bot_incidentes;
--   DROP FUNCTION IF EXISTS public.vigilar_bot_whatsapp(INTEGER, INTEGER, INTEGER);
--   DROP FUNCTION IF EXISTS public.parte_diario_bot();
--   DROP FUNCTION IF EXISTS public.slack_bot_aviso(TEXT);
--
-- VERIFICACIÓN post-aplicación (correr en el SQL editor, en este orden):
--   SELECT public.slack_bot_aviso('prueba mig 305');   -- debe llegar a Slack
--   SELECT public.vigilar_bot_whatsapp();              -- abiertos=0 cerrados=0 …
--   SELECT public.parte_diario_bot();                  -- manda el parte de hoy
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname LIKE '%bot%';
--   SELECT has_table_privilege('anon','public.simon_bot_incidentes','SELECT');  -- FALSE
-- =============================================================================

COMMIT;
