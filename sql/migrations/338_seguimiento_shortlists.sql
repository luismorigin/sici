-- =============================================================================
-- 338 · Seguimiento automático de shortlists del bot
-- =============================================================================
-- QUÉ RESUELVE
-- Quien recibió una shortlist y no encontró nada que le sirva **no sabe que puede
-- pedir otra con otro criterio**. Ve sus opciones, ninguna le cierra, y ahí termina.
-- Medido por lab-kapso sobre las 77 shortlists del bot: **92% abre el link** y
-- **55% vuelve 2+ veces** —el producto funciona—, pero sólo el **19% pide una
-- segunda** (9 de 48). Los otros 39 probablemente no saben que se puede.
-- El techo no es el interés: es que nadie les dijo que podían pedir otra cosa.
--
-- Este job manda **un** mensaje, en horario, al que hace ~9 h pidió un departamento.
-- El texto NO lo escribe el endpoint: se inyecta la marca `seguimiento:v1` a la
-- conversación y el BOT redacta, con el bloque que ya tiene en su prompt (mismo
-- mecanismo que `ref:v1` del botón de favoritos). El cliente nunca ve esa marca.
--
-- Pedido: `lab-kapso/PEDIDO_SICI_SEGUIMIENTO_SHORTLIST.md` (24-ago-2026).
-- El SQL original venía de ellos; acá va con NUEVE correcciones acordadas.
--
-- =============================================================================
-- LAS NUEVE CORRECCIONES (y por qué cada una)
-- =============================================================================
-- 🔴 1. `direccion = 'out'`, NO `'outbound'`. La columna guarda 'in'/'out': con
--    'outbound' la función devolvía **0 filas siempre** y el job habría corrido cada
--    hora, para siempre, sin mandar nada y sin fallar nunca. Peor: la verificación
--    de lab-kapso dio 0 y se leyó como *"no dispara ninguna, son todas viejas, y así
--    debe ser"* — el bug se interpretó como confirmación del diseño. Con el valor
--    correcto: 53 de 57 tienen el último mensaje del bot.
--
-- 🔴 2. `REVOKE` explícito. Las funciones nacen con EXECUTE para PUBLIC (default de
--    Postgres). Sin esto, `anon` podía ejecutarlas. Se replica el cierre de las dos
--    del cron que ya existen: postgres · service_role · claude_readonly.
--
-- 🔴 3. **Una fila por PERSONA, no por shortlist** — y se marcan TODAS las suyas.
--    La versión original devolvía una fila por shortlist: quien tenía varias activas
--    recibía **una por cada una**. Medido: 29 de 77 shortlists tienen otra del mismo
--    cliente dentro de 24 h, y hay **una persona con 8** → 8 mensajes seguidos, sin
--    que falle nada. Y es al revés de lo que uno quiere: los que más usan el
--    producto son los que más spam reciben. El prompt dice *"escribile UNA sola vez"*
--    y *"no insistir"*; esto lo hacía imposible por construcción.
--    ⚠️ Marcar sólo la que generó el mensaje no alcanza: las otras siguen pendientes
--    y vuelven a calificar en la corrida siguiente. Se marcan todas juntas.
--
-- 4. Mínimo **9 h**, no 12 h. Con 12 h las shortlists creadas entre las 9 y las 11
--    de la mañana **nunca** recibían seguimiento: cumplen fuera de franja, esperan al
--    día siguiente y llegan a 23-24 h, donde el guard las descarta. No eran "3 casos
--    raros" (4%) sino **6 de 77 (7,8%)**, y siempre los mismos por construcción.
--    Con 9 h ninguna se descarta y el máximo del sistema baja a 21 h, con 3 h de
--    margen contra la ventana de WhatsApp. (Con 10 h tampoco se descartaba ninguna,
--    pero quedaban 8 en 22 h exactas: al filo, decididas por minutos.)
--
-- 🔴 5. El disparador **no manda la lista de a quién escribirle**. La versión
--    original mandaba las shortlists en el body y el endpoint le escribía a esa
--    lista: quien obtuviera el secreto podía inyectar conversaciones arbitrarias y
--    **hacer que el bot le escriba a cualquiera con nuestro número**. Ahora el POST
--    va vacío —"fijate a quién le toca"— y el endpoint consulta esta misma función.
--    Aunque alguien lo dispare, lo único que consigue es adelantar el seguimiento
--    que igual correspondía.
--
-- 🔴 6. Tope de reintento: `seguimiento_intentado_at`. Si el mensaje sale pero el
--    marcado falla, la shortlist sigue calificando y el cron corre **13 veces entre
--    las 9 y las 21**. Con el intento registrado, no se reintenta antes de 1 h.
--
-- 7. El retorno **no lleva `cliente_telefono`** (propuesta de lab-kapso, correcta):
--    el endpoint sólo necesita `conversation_id` para hablar con Kapso. Y como sin
--    teléfono no podría marcar las hermanas, el marcado lo hace
--    `marcar_seguimiento_shortlist()`, que resuelve el teléfono **adentro de la base**.
--    Cerrar permisos Y no exponer el dato es mejor que sólo cerrar.
--
-- 8. El retorno del disparador dice **"encoladas"**, no "disparadas": `pg_net` es
--    asíncrono y no espera la respuesta. Si simon-mvp está caído, el log no debe
--    decir que salieron.
--
-- 9. Se **cuentan las descartadas por el guard** y van en el log. Son justamente
--    personas que merecían el seguimiento: que desaparezcan sin rastro es el mismo
--    silencio que nos mordió en el punto 1.
--
-- =============================================================================
-- LO QUE ESTE SQL **NO** HACE, Y HAY QUE SABERLO
-- =============================================================================
-- · **No prueba entrega.** Un `resume` aceptado por Kapso NO garantiza que el
--   cliente reciba nada: es el bug D39 de lab-kapso (Kapso acepta, el bot redacta,
--   el mensaje no sale y la conversación muere). Marcar por resume-OK es correcto
--   para lo que controlamos, pero no es acuse de recibo.
-- · **No manda nada retroactivo.** Sólo shortlists de acá en adelante: las viejas
--   ya pasaron el guard de 22 h y quedan afuera solas.
-- · **No toca las RPC del bot, las vistas de mercado ni `propiedades_v2`.**
--
-- ⏰ Hoy el mensaje es gratis (`free_customer_service`, dentro de la ventana de
-- 24 h). Desde el **1-oct-2026** Meta empieza a cobrar las free-form dentro de la
-- ventana: reestimar ahí.
--
-- REVERSIBLE: `SELECT cron.unschedule('seguimiento-shortlists');` corta al instante.
-- ROLLBACK completo: `338_ROLLBACK_seguimiento_shortlists.sql`
-- =============================================================================

BEGIN;

-- ── 1/4 · Dónde anotar lo enviado y lo intentado ────────────────────────────
ALTER TABLE broker_shortlists
  ADD COLUMN IF NOT EXISTS seguimiento_enviado_at   timestamptz,
  ADD COLUMN IF NOT EXISTS seguimiento_intentado_at timestamptz;

COMMENT ON COLUMN broker_shortlists.seguimiento_enviado_at IS
  'Cuándo se mandó el seguimiento automático (seguimiento:v1). NULL = todavía no. '
  'Lo escribe marcar_seguimiento_shortlist() desde el endpoint, que es quien sabe si Kapso aceptó. '
  'Se marcan TODAS las shortlists del mismo teléfono a la vez: el seguimiento es por PERSONA.';

COMMENT ON COLUMN broker_shortlists.seguimiento_intentado_at IS
  'Cuándo se intentó por última vez, haya salido o no. Es el tope de reintento: si el envío '
  'funcionó pero el marcado falló, sin esto el cron remandaría hasta 13 veces en un día.';

CREATE INDEX IF NOT EXISTS idx_shortlists_seguimiento_pendiente
  ON broker_shortlists (created_at)
  WHERE seguimiento_enviado_at IS NULL;

-- ── 2/4 · Quiénes califican ─────────────────────────────────────────────────
-- 🔑 UNA FILA POR TELÉFONO (la shortlist más reciente), no una por shortlist.
-- Sin datos personales en el retorno: el endpoint sólo necesita con qué hablarle
-- a Kapso.
CREATE OR REPLACE FUNCTION public.shortlists_para_seguimiento()
RETURNS TABLE (
  hash            text,
  conversation_id text,
  horas_desde     numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  WITH ult AS (
    -- último mensaje de cada teléfono, con su conversación de Kapso
    SELECT DISTINCT ON (telefono)
           telefono, kapso_conversation_id, direccion
      FROM simon_mensajes
     WHERE kapso_conversation_id IS NOT NULL
     ORDER BY telefono, enviado_at DESC
  ),
  candidatas AS (
    SELECT s.hash,
           s.cliente_telefono,
           u.kapso_conversation_id,
           s.created_at,
           round((EXTRACT(epoch FROM (now() - s.created_at)) / 3600)::numeric, 1) AS horas
      FROM broker_shortlists s
      JOIN ult u
        ON replace(u.telefono, '+', '') = replace(s.cliente_telefono, '+', '')
     WHERE s.broker_slug = 'simon-asistente'
       AND s.seguimiento_enviado_at IS NULL
       AND s.created_at <= now() - interval '9 hours'    -- ya tuvo tiempo de mirarlo
       AND s.created_at >= now() - interval '22 hours'   -- guard de la ventana de 24 h
       AND u.direccion = 'out'                           -- el bot habló último
       -- tope de reintento: si ya se intentó hace poco, no insistir
       AND (s.seguimiento_intentado_at IS NULL
            OR s.seguimiento_intentado_at < now() - interval '1 hour')
  )
  -- 🔑 una sola por PERSONA: la más reciente. Sus hermanas se marcan juntas al
  -- confirmar (ver marcar_seguimiento_shortlist).
  SELECT DISTINCT ON (cliente_telefono)
         hash, kapso_conversation_id, horas
    FROM candidatas
   ORDER BY cliente_telefono, created_at DESC;
$fn$;

COMMENT ON FUNCTION public.shortlists_para_seguimiento() IS
  'Shortlists que merecen seguimiento: UNA por persona (la más reciente). No chequea franja '
  'horaria — de eso se encarga disparar_seguimiento_shortlists(). No devuelve datos personales.';

-- ── 3/4 · Marcar (lo hace el endpoint, que sabe si Kapso aceptó) ────────────
-- 🔑 Marca TODAS las shortlists pendientes del MISMO teléfono, no sólo la del hash:
-- el seguimiento es por persona. Si sólo se marcara una, las hermanas volverían a
-- calificar en la corrida siguiente y la persona recibiría otro mensaje.
-- El teléfono se resuelve ACÁ ADENTRO: nunca sale de la base.
CREATE OR REPLACE FUNCTION public.marcar_seguimiento_shortlist(
  p_hash    text,
  p_enviado boolean DEFAULT true
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tel text;
  v_n   integer;
BEGIN
  SELECT cliente_telefono INTO v_tel FROM broker_shortlists WHERE hash = p_hash;
  IF v_tel IS NULL THEN
    RAISE EXCEPTION 'hash inexistente: %', p_hash USING ERRCODE = '22023';
  END IF;

  UPDATE broker_shortlists
     SET seguimiento_intentado_at = now(),
         -- si el envío no salió, se registra el INTENTO pero no el envío: la
         -- shortlist vuelve a calificar dentro de 1 h (tope del punto 6).
         seguimiento_enviado_at = CASE WHEN p_enviado THEN now() ELSE seguimiento_enviado_at END
   WHERE broker_slug = 'simon-asistente'
     AND seguimiento_enviado_at IS NULL
     AND replace(cliente_telefono, '+', '') = replace(v_tel, '+', '');

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

COMMENT ON FUNCTION public.marcar_seguimiento_shortlist(text, boolean) IS
  'Marca el seguimiento de TODAS las shortlists pendientes del mismo cliente (una persona, un '
  'mensaje). p_enviado=false registra sólo el intento, para que reintente en 1 h. Devuelve cuántas marcó.';

-- ── 4/4 · El disparador ─────────────────────────────────────────────────────
-- Mismo patrón que vigilar_bot_whatsapp(): franja adentro, secreto en vault, una
-- sola llamada saliente. La franja se chequea sobre la hora en que CORRE el cron,
-- así el horario vive en UN solo lugar y los que cumplen de madrugada esperan solos.
CREATE OR REPLACE FUNCTION public.disparar_seguimiento_shortlists(
  p_hora_desde integer DEFAULT 9,
  p_hora_hasta integer DEFAULT 21
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'net', 'extensions'
AS $fn$
DECLARE
  v_hora        integer;
  v_cuantas     integer;
  v_descartadas integer;
  v_secreto     text;
BEGIN
  v_hora := EXTRACT(hour FROM (now() AT TIME ZONE 'America/La_Paz'))::int;
  IF v_hora < p_hora_desde OR v_hora >= p_hora_hasta THEN
    RETURN format('fuera de franja (son las %s, se manda entre %s y %s)', v_hora, p_hora_desde, p_hora_hasta);
  END IF;

  SELECT count(*) INTO v_cuantas FROM public.shortlists_para_seguimiento();

  -- Punto 9: las que YA pasaron el guard sin recibir nada. Son personas que
  -- merecían el seguimiento y no lo van a tener: se declaran, no se ocultan.
  SELECT count(DISTINCT s.cliente_telefono) INTO v_descartadas
    FROM broker_shortlists s
   WHERE s.broker_slug = 'simon-asistente'
     AND s.seguimiento_enviado_at IS NULL
     AND s.created_at < now() - interval '22 hours'
     AND s.created_at > now() - interval '46 hours';   -- sólo el último día, no toda la historia

  IF v_cuantas = 0 THEN
    RETURN format('sin candidatas%s',
      CASE WHEN v_descartadas > 0 THEN format(' · %s persona(s) pasaron el guard de 22h sin seguimiento', v_descartadas) ELSE '' END);
  END IF;

  SELECT decrypted_secret INTO v_secreto
    FROM vault.decrypted_secrets WHERE name = 'seguimiento_cron_token';
  IF v_secreto IS NULL THEN
    RETURN 'ERROR: falta el secreto `seguimiento_cron_token` en vault — no se disparó nada';
  END IF;

  -- 🔑 Punto 5: el body va VACÍO. El endpoint consulta shortlists_para_seguimiento()
  -- por su cuenta. Así, aunque alguien consiga el secreto, no puede elegir a quién
  -- se le escribe: sólo puede adelantar el seguimiento que ya correspondía.
  PERFORM net.http_post(
    url     := 'https://simonbo.com/api/cron/seguimiento-shortlists',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_secreto),
    body    := '{}'::jsonb
  );

  -- Punto 8: "encoladas". pg_net no espera la respuesta; el ENDPOINT es quien marca,
  -- porque él sabe si Kapso aceptó. Si marcáramos acá, una caída de simon-mvp dejaría
  -- gente marcada y sin seguimiento.
  RETURN format('%s encolada(s) a las %sh%s', v_cuantas, v_hora,
    CASE WHEN v_descartadas > 0 THEN format(' · ⚠️ %s persona(s) pasaron el guard sin seguimiento', v_descartadas) ELSE '' END);
END;
$fn$;

-- ── Permisos (punto 2) — las funciones nacen con EXECUTE para PUBLIC ────────
REVOKE ALL ON FUNCTION public.shortlists_para_seguimiento()            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.marcar_seguimiento_shortlist(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.disparar_seguimiento_shortlists(integer, integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.shortlists_para_seguimiento()            TO service_role, claude_readonly;
GRANT EXECUTE ON FUNCTION public.marcar_seguimiento_shortlist(text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.disparar_seguimiento_shortlists(integer, integer) TO service_role;

COMMIT;

-- =============================================================================
-- EL JOB — se agenda APARTE, después de verificar (ver abajo)
-- =============================================================================
-- No va en la transacción de arriba a propósito: primero se mira a quién le tocaría,
-- después se enciende.
--
--   SELECT cron.schedule('seguimiento-shortlists', '0 * * * *',
--                        $cmd$ SELECT public.disparar_seguimiento_shortlists() $cmd$);
--
-- Apagarlo:  SELECT cron.unschedule('seguimiento-shortlists');

-- =============================================================================
-- ANTES DE ENCENDER
-- =============================================================================
-- 1) El secreto:
--      SELECT vault.create_secret('<token largo al azar>', 'seguimiento_cron_token');
--    Y el endpoint TIENE que validarlo. Sin eso queda abierto.
--
-- 2) El endpoint `/api/cron/seguimiento-shortlists` en simon-mvp, que debe:
--      · validar el Bearer contra el mismo secreto
--      · llamar a shortlists_para_seguimiento() con la llave de servicio
--      · por cada fila: GET conversación → GET ejecución → POST resume con
--        { "message": { "data": { "text": "seguimiento:v1" } } }
--      · marcar_seguimiento_shortlist(hash, true) si Kapso aceptó
--        marcar_seguimiento_shortlist(hash, false) si falló → reintenta en 1 h
--    Workflow de Kapso: 7e219983-4fdc-47d7-920e-0a3a33bf780a
--
-- 3) El bloque `seguimiento:v1` en el prompt del bot (lo pushea lab-kapso).
--    🔑 Sin el bloque, la marca llega y el bot no sabe qué hacer con ella.

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
-- A) A quién le tocaría AHORA (no manda ni marca nada — la función es STABLE):
--   SELECT * FROM public.shortlists_para_seguimiento();
--
-- B) 🔑 UNA POR PERSONA — esto es lo que se vino a arreglar. Debe dar 0 filas:
--   SELECT conversation_id, count(*)
--     FROM public.shortlists_para_seguimiento()
--    GROUP BY 1 HAVING count(*) > 1;
--
-- C) Probar fuera de horario, sin encender el cron:
--   SELECT public.disparar_seguimiento_shortlists(0, 24);
--
-- D) Permisos: ninguna de las tres puede tener `anon` ni `authenticated`:
--   SELECT proname, array_to_string(proacl,' | ') AS acl
--     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public'
--      AND proname IN ('shortlists_para_seguimiento','marcar_seguimiento_shortlist',
--                      'disparar_seguimiento_shortlists');
--
-- E) El marcado alcanza a las hermanas (probar con un hash real, en una transacción
--    que se revierte):
--   BEGIN;
--     SELECT public.marcar_seguimiento_shortlist('<hash>', true);  -- devuelve cuántas marcó
--     SELECT hash, seguimiento_enviado_at FROM broker_shortlists
--      WHERE cliente_telefono = (SELECT cliente_telefono FROM broker_shortlists WHERE hash='<hash>');
--   ROLLBACK;
-- =============================================================================
