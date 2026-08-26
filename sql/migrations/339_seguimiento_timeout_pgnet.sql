-- =============================================================================
-- 339 · El disparador del seguimiento dejaba de escuchar antes de que el
--       endpoint terminara — y perdíamos el ÚNICO registro de qué pasó
-- =============================================================================
-- La 338 llama al endpoint con `net.http_post` sin pasar `timeout_milliseconds`,
-- así que usa el default de pg_net: **5 segundos**. Medido en la primera corrida
-- real (26-ago, 14:00):
--
--     corrida     personas   net._http_response
--     13:30 (prueba)   1     200 OK, con el cuerpo entero
--     14:00 (real)     2     timeout a los 5.001 ms, status NULL, content NULL
--
-- El endpoint tarda ~3 s de arranque (DNS + handshake + cold start) y ~1,5 s por
-- persona, porque cada una son DOS llamadas a Kapso: buscar la ejecución viva e
-- inyectar la marca. Con una persona entra en la ventana; **con dos o más no entra
-- nunca**. O sea que en operación normal la respuesta se iba a perder SIEMPRE.
--
-- 🔑 EL TRABAJO NO SE PERDÍA — lo que se perdía era poder verlo. El timeout es del
-- cliente: pg_net deja de esperar, Vercel sigue y termina. Las dos personas del
-- 26-ago quedaron correctamente marcadas (14:00:04 y 14:00:06) con el timeout ya
-- disparado. Por eso esto NO es un bug de entrega: es un bug de OBSERVABILIDAD, y
-- se arregla antes de necesitarlo, no después. `net._http_response` es el único
-- lugar donde queda escrito si alguien falló y por qué.
--
-- ¿Por qué 30 s y no 60? Con la medición de arriba, 30 s cubre ~18 personas en una
-- corrida, muy por encima de cualquier día real (3,9 shortlists/día, y el DISTINCT
-- por teléfono las reduce todavía más).
--
-- 🔑 Y VA DELIBERADAMENTE POR DEBAJO del `maxDuration: 60` que se declara del lado
-- de Vercel. La asimetría es el punto: si algún día una corrida excede los 30 s,
-- pg_net deja de escuchar pero **Vercel sigue trabajando y termina de marcar**.
-- Al revés —Vercel cortando primero— es el caso feo: una persona puede quedar con
-- el `resume` hecho y sin marcar, y recibir un segundo mensaje una hora después.
--
-- Lo único que cambia respecto de la 338 es la línea `timeout_milliseconds`. El
-- resto del cuerpo se copió de `pg_get_functiondef()` de PRODUCCIÓN (regla #7),
-- no del archivo de la 338.
-- =============================================================================

BEGIN;

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
  v_descartadas integer;
  v_secreto     text;
BEGIN
  v_hora := EXTRACT(hour FROM (now() AT TIME ZONE 'America/La_Paz'))::int;
  IF v_hora < p_hora_desde OR v_hora >= p_hora_hasta THEN
    RETURN format('fuera de franja (son las %s, se manda entre %s y %s)', v_hora, p_hora_desde, p_hora_hasta);
  END IF;

  SELECT count(*) INTO v_cuantas FROM public.shortlists_para_seguimiento();

  SELECT count(DISTINCT s.cliente_telefono) INTO v_descartadas
    FROM broker_shortlists s
   WHERE s.broker_slug = 'simon-asistente'
     AND s.seguimiento_enviado_at IS NULL
     AND s.created_at < now() - interval '22 hours'
     AND s.created_at > now() - interval '46 hours';

  IF v_cuantas = 0 THEN
    RETURN format('sin candidatas%s',
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
    -- ⬇️ LO ÚNICO NUEVO. Sin esto son 5 s y la respuesta se pierde con 2+ personas.
    timeout_milliseconds := 30000
  );

  -- Sigue diciendo "encolada": pg_net es asíncrono y el que marca es el ENDPOINT,
  -- porque él sabe si Kapso aceptó. Un timeout más largo no cambia eso — cambia
  -- que la respuesta quede guardada en net._http_response para poder leerla.
  RETURN format('%s encolada(s) a las %sh%s', v_cuantas, v_hora,
    CASE WHEN v_descartadas > 0 THEN format(' · ⚠️ %s persona(s) pasaron el guard sin seguimiento', v_descartadas) ELSE '' END);
END;
$function$;

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (después de aplicar)
-- =============================================================================
-- 1 · El parámetro quedó en la definición:
--     SELECT position('timeout_milliseconds' in pg_get_functiondef(oid)) > 0 AS tiene_timeout
--       FROM pg_proc WHERE proname = 'disparar_seguimiento_shortlists';
--
-- 2 · Tras la PRÓXIMA corrida con 2+ personas, esto debe traer status 200 y un
--     cuerpo JSON — no `error_msg: Timeout`:
--     SELECT status_code, left(content,200), error_msg
--       FROM net._http_response ORDER BY created DESC LIMIT 1;
--
-- 🔴 NO se re-agenda nada: el job 8 llama a la función por nombre, así que toma
--    la versión nueva sola. No hace falta unschedule/schedule.
-- =============================================================================
