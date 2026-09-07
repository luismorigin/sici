-- ============================================================================
-- 352 · El detector de silencio ignora los teléfonos de prueba
--
-- 🔴 EL AGUJERO, encontrado al verificar la 351 el mismo día: el detector B
--    cuenta TODOS los entrantes de la franja 09:00-17:00. El founder prueba el
--    bot mandándole un "Hola" a la mañana → la cuenta da 1 en vez de 0 y **la
--    alarma no suena, aunque no haya escrito ni un cliente real**.
--    Visto en vivo el 7-sep: los ÚNICOS 2 mensajes del día fueron ese "Hola" de
--    las 10:20 y la respuesta del bot. Con la 351 tal cual, el detector habría
--    dicho "todo bien" en un día sin un solo cliente.
--
-- 🔑 Es el modo en que una alarma se vuelve inútil SIN FALLAR — el mismo patrón
--    que el `status: degraded` que lab-kapso nos advirtió: no da error, deja de
--    mirar. Una alarma que el operador puede apagar sin querer, con el gesto
--    más natural del mundo (probar que su producto anda), no es una alarma.
--
-- ✅ EL UMBRAL AGUANTA LA EXCLUSIÓN — medido antes de escribir esto, porque si
--    algún día flojo el único tráfico hubiera sido la prueba, ahora ese día
--    alertaría. Sobre los últimos 24 días: con el número incluido alertaría 1
--    día (el 06/09, el corte); excluyéndolo, **el mismo 1 día**. El día más
--    flojo real conserva sus 5 mensajes. La exclusión no agrega falsos positivos.
--
-- Va en tabla propia y no hardcodeado en la función: sumar otro número de
-- prueba no debería requerir una migración. (`config_global` no sirve: su
-- columna `valor` es NUMERIC y esto es una lista de teléfonos.)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.simon_telefonos_test (
  telefono   text PRIMARY KEY,
  nota       text,
  creado_at  timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.simon_telefonos_test IS
  'Numeros que NO cuentan como trafico real. Hoy lo usa vigilar_silencio_whatsapp (mig 352) '
  'para que una prueba del founder no tape un dia sin clientes. Agregar uno es un INSERT.';

-- 🔴 REVOKE PRIMERO (regla #13): toda tabla nueva en `public` nace con
--    anon/authenticated en ALL por los default privileges del schema.
REVOKE ALL ON public.simon_telefonos_test FROM anon, authenticated;
GRANT SELECT ON public.simon_telefonos_test TO service_role;

INSERT INTO public.simon_telefonos_test (telefono, nota)
VALUES ('+59176308808', 'founder — prueba el bot a mano; confirmado por Lucho el 7-sep-2026')
ON CONFLICT (telefono) DO NOTHING;

-- ── El detector B, ahora ciego a las pruebas ────────────────────────────────
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
  v_abierto boolean;
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

  -- Un incidente por día como mucho.
  SELECT EXISTS (SELECT 1 FROM public.simon_bot_incidentes
                  WHERE tipo='silencio'
                    AND (detectado_at AT TIME ZONE 'America/La_Paz')::date = v_hoy) INTO v_abierto;
  IF NOT v_abierto THEN
    INSERT INTO public.simon_bot_incidentes (tipo, detectado_at, mensaje_texto)
    VALUES ('silencio', NOW(),
            format('0 entrantes REALES entre 09:00 y 17:00 del %s (%s de prueba, excluidos)', v_hoy, v_pruebas));

    -- 🔑 El aviso DECLARA cuántos se excluyeron. Si no lo dijera, alguien que vio
    --    su propio mensaje entrar leería la alarma como un falso positivo.
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

REVOKE ALL ON FUNCTION public.vigilar_silencio_whatsapp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vigilar_silencio_whatsapp() TO postgres, service_role;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Hoy (7-sep) el único entrante fue la prueba del founder, así que AHORA
--    tiene que dar alerta = true, cuando antes daba false:
--      SELECT public.vigilar_silencio_whatsapp();
--      esperado: {"entrantes_reales": 0, "de_prueba": 1, "alerta": true}
--    ⚠️ Eso INSERTA un incidente y MANDA el aviso a Slack. Es la prueba de que
--       el circuito entero funciona — pero si no querés el mensaje, corré antes
--       sólo el conteo:
--      SELECT count(*) FILTER (WHERE t.telefono IS NULL) AS reales,
--             count(*) FILTER (WHERE t.telefono IS NOT NULL) AS pruebas
--        FROM simon_mensajes m
--        LEFT JOIN simon_telefonos_test t ON t.telefono = m.telefono
--       WHERE m.direccion='in'
--         AND (m.enviado_at AT TIME ZONE 'America/La_Paz')::date = CURRENT_DATE
--         AND (m.enviado_at AT TIME ZONE 'America/La_Paz')::time >= '09:00'
--         AND (m.enviado_at AT TIME ZONE 'America/La_Paz')::time <  '17:00';
--
-- 2) Que la tabla nueva no sea escribible desde el browser:
--      SELECT relacl FROM pg_class WHERE relname='simon_telefonos_test';
--
-- Agregar otro número de prueba (no requiere migración):
--   INSERT INTO simon_telefonos_test (telefono, nota) VALUES ('+591...', 'quien y por que');
--
-- ROLLBACK: reponer la función de la mig 351 y DROP TABLE simon_telefonos_test.
-- ============================================================================
