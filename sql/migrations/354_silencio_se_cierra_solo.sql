-- ============================================================================
-- 354 · El incidente de silencio se cierra solo cuando vuelve el tráfico
--
-- EL PROBLEMA (detectado al verificar la 353, antes de que molestara): la
-- función salía temprano cuando había clientes reales —`RETURN` antes de tocar
-- nada— así que el incidente del día anterior quedaba `resuelto_at IS NULL`
-- **para siempre**. La alarma seguía funcionando (la dedup del silencio es por
-- FECHA, no por el índice), pero `simon_bot_alertas_canal` iba a acumular
-- incidentes abiertos de días ya resueltos.
--
-- 🔑 Por qué importa aunque sea cosmético: un tablero que lista "incidentes
--    abiertos" mostraría un problema activo que no existe. Una alarma que grita
--    de más se apaga sola en la cabeza del que la mira — es la misma muerte por
--    ruido que el `status: degraded` que lab-kapso nos advirtió, por el otro
--    extremo.
--
-- Se agrega además el aviso de vuelta, simétrico con el de la reconexión: si
-- ayer sonó la alarma, hoy se dice que volvió. Sólo cuando efectivamente había
-- un incidente abierto, así que no genera ruido en los días normales.
-- ============================================================================

BEGIN;

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
  v_cerrado int := 0;
BEGIN
  SELECT count(*) FILTER (WHERE t.telefono IS NULL),
         count(*) FILTER (WHERE t.telefono IS NOT NULL)
    INTO v_reales, v_pruebas
    FROM public.simon_mensajes m
    LEFT JOIN public.simon_telefonos_test t ON t.telefono = m.telefono
   WHERE m.direccion = 'in'
     AND (m.enviado_at AT TIME ZONE 'America/La_Paz') >= v_hoy + time '09:00'
     AND (m.enviado_at AT TIME ZONE 'America/La_Paz') <  v_hoy + time '17:00';

  -- ── Día normal: además de no alertar, CIERRA lo que haya quedado abierto ──
  IF v_reales > 0 THEN
    WITH cerrados AS (
      UPDATE public.simon_bot_alertas_canal
         SET resuelto_at = NOW()
       WHERE tipo = 'silencio' AND resuelto_at IS NULL
       RETURNING 1
    )
    SELECT count(*) INTO v_cerrado FROM cerrados;

    -- Simétrico con el aviso de reconexión: si ayer sonó, hoy se dice que volvió.
    -- Sólo si había algo abierto → en los días normales no dice nada.
    IF v_cerrado > 0 THEN
      PERFORM public.slack_bot_aviso(format(
        '✅ *Volvió el tráfico de WhatsApp* — %s clientes reales hoy entre las 09:00 y las 17:00.',
        v_reales));
    END IF;

    RETURN jsonb_build_object('entrantes_reales', v_reales, 'de_prueba', v_pruebas,
                              'alerta', false, 'incidentes_cerrados', v_cerrado);
  END IF;

  -- ── Silencio ────────────────────────────────────────────────────────────
  SELECT EXISTS (SELECT 1 FROM public.simon_bot_alertas_canal
                  WHERE tipo='silencio'
                    AND (detectado_at AT TIME ZONE 'America/La_Paz')::date = v_hoy) INTO v_yaesta;

  IF NOT v_yaesta THEN
    -- El de un día anterior se cierra para no bloquear el índice parcial de hoy.
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

REVOKE ALL ON FUNCTION public.vigilar_silencio_whatsapp() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vigilar_silencio_whatsapp() TO postgres, service_role;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN
-- ============================================================================
-- 1) Hoy (7-sep) sigue sin clientes reales, así que NO debe cerrar nada todavía:
--      SELECT public.vigilar_silencio_whatsapp();
--      esperado: {"entrantes_reales":0, "de_prueba":1, "alerta":true}
--      (y NO debe mandar un segundo aviso — el incidente de hoy ya existe)
--
-- 2) El incidente de hoy sigue abierto, que es correcto mientras el día siga así:
--      SELECT tipo, detectado_at, resuelto_at FROM simon_bot_alertas_canal;
--
-- 3) La prueba real llega SOLA: el primer día con tráfico normal, la corrida de
--    las 17:00 tiene que cerrar el incidente y avisar "volvió el tráfico".
--    Se comprueba mirando que `resuelto_at` deje de ser NULL.
--
-- ROLLBACK: reponer la función de la mig 353.
-- ============================================================================
