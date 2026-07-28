-- =============================================================================
-- 308 — Los números internos no cuentan en las MÉTRICAS (pero sí en la vigilancia)
-- =============================================================================
-- PEDIDO: que el teléfono del founder no ensucie los números del parte diario,
-- para poder probar el flujo completo de tanto en tanto sin falsear la métrica.
--
-- 🔑 LA DISTINCIÓN QUE HACE ESTA MIGRACIÓN: se excluye de la **MEDICIÓN**, NO de
-- la **VIGILANCIA**. `vigilar_bot_whatsapp()` (la alarma de silencio) NO se toca a
-- propósito: si el founder le escribe al bot y el bot no contesta, la alarma tiene
-- que sonar — de hecho ESA es la forma más probable de enterarse de que el bot está
-- roto, porque hoy casi todos los mensajes son pruebas suyas. Silenciar la alarma
-- para su número apagaría el único detector que se dispara de verdad.
--   · métrica  = "¿cuánta gente nos escribió?"  → él NO cuenta.
--   · vigilancia = "¿el bot está respondiendo?" → él SÍ cuenta.
--
-- Tampoco se toca `v_simon_contactos_resumen` (el CRM de /admin/contactos): ahí
-- SÍ quiere ver sus propias conversaciones de prueba, que para eso las hace.
--
-- Y el CLIC del puente no tiene teléfono — un clic es anónimo hasta que la persona
-- escribe. Para eso está la parte 3: un link de prueba explícito.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Un solo lugar donde vive la lista de números internos
-- -----------------------------------------------------------------------------
-- Función y no constante repetida: cuando haya un segundo número (un socio, otro
-- teléfono del founder) se agrega ACÁ y todo lo que mide queda consistente solo.
-- Compara sobre los últimos 8 dígitos para no depender del formato con que llegue
-- (`+59176308808`, `59176308808`, `76308808` — Kapso normaliza, pero el histórico
-- y los leads del sitio no siempre).
CREATE OR REPLACE FUNCTION public.es_telefono_interno(p_tel TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_tel IS NOT NULL
     AND RIGHT(REGEXP_REPLACE(p_tel, '\D', '', 'g'), 8) IN (
       '76308808'   -- Lucho (founder) — su celular personal, el que usa para probar
     );
$$;

COMMENT ON FUNCTION public.es_telefono_interno(TEXT) IS
  'TRUE si el teléfono es de una prueba interna (founder). Se usa para EXCLUIR de las '
  'MÉTRICAS (parte diario), NUNCA de la vigilancia: la alarma de silencio debe sonar '
  'igual si el bot no le contesta a él. Compara los últimos 8 dígitos → agnóstico al '
  'formato. Agregar números nuevos ACÁ, no en cada consulta. Migración 308.';

REVOKE ALL ON FUNCTION public.es_telefono_interno(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.es_telefono_interno(TEXT) TO service_role, claude_readonly;


-- -----------------------------------------------------------------------------
-- 2. Los clics marcados como prueba salen de la vista
-- -----------------------------------------------------------------------------
-- Un clic no tiene teléfono, así que no se puede filtrar por número. La marca la
-- pone el propio link: `simonbo.com/ir/f03?t=1` → el endpoint guarda
-- `utm_content='test'` (ver `pages/api/ir/[[...slug]].ts`). El clic SE REGISTRA
-- igual —queda el rastro de la prueba— pero no cuenta.
CREATE OR REPLACE VIEW public.v_mkt_clicks_humanos AS
SELECT DISTINCT ON (codigo, user_agent, date_trunc('minute', creado_en))
       id, creado_en, codigo, pieza_num, red,
       utm_source, utm_medium, utm_campaign, utm_content,
       valido, destino, referer, user_agent
FROM public.mkt_clicks_puente
WHERE user_agent IS NOT NULL
  AND user_agent !~* '(curl|wget|python-requests|node-fetch|axios|postman|insomnia|okhttp|java/|go-http|libwww|httpie)'
  AND (utm_content IS DISTINCT FROM 'test')          -- ← link de prueba (?t=1)
ORDER BY codigo, user_agent, date_trunc('minute', creado_en), creado_en;

COMMENT ON VIEW public.v_mkt_clicks_humanos IS
  'Clics del puente /ir atribuibles a una PERSONA REAL: colapsa las ráfagas de prefetch '
  'de Meta (mismo código + mismo user-agent + mismo minuto → 1), excluye herramientas de '
  'desarrollo y excluye los marcados como prueba (`?t=1` → utm_content=test). Usar SIEMPRE '
  'esta vista para contar clics; `mkt_clicks_puente` es el registro crudo y sobrecuenta. '
  'Límite: dos personas con el mismo UA en el mismo minuto cuentan como una. Migs 307/308.';

REVOKE ALL ON public.v_mkt_clicks_humanos FROM anon, authenticated;
GRANT SELECT ON public.v_mkt_clicks_humanos TO service_role, claude_readonly;


-- -----------------------------------------------------------------------------
-- 3. El parte diario deja de contar los números internos
-- -----------------------------------------------------------------------------
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
  v_propias      INTEGER;
  v_inc_hoy      INTEGER;
  v_inc_abiertos INTEGER;
  v_peor         INTEGER;
  v_clics        INTEGER;
  v_clics_crudos INTEGER;
  v_clics_malos  INTEGER;
  v_piezas       TEXT;
  v_texto        TEXT;
BEGIN
  v_desde := (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/La_Paz'))
             AT TIME ZONE 'America/La_Paz';

  -- Conversaciones/mensajes SIN los números internos (ver es_telefono_interno).
  SELECT COUNT(DISTINCT contacto_id) FILTER (WHERE NOT public.es_telefono_interno(telefono)),
         COUNT(*) FILTER (WHERE direccion = 'in'  AND NOT public.es_telefono_interno(telefono)),
         COUNT(*) FILTER (WHERE direccion = 'out' AND NOT public.es_telefono_interno(telefono)),
         COUNT(DISTINCT contacto_id) FILTER (WHERE public.es_telefono_interno(telefono))
  INTO v_conv, v_msg_in, v_msg_out, v_propias
  FROM public.simon_mensajes
  WHERE enviado_at >= v_desde;

  SELECT COUNT(*) INTO v_nuevos
  FROM public.simon_contactos
  WHERE created_at >= v_desde AND NOT public.es_telefono_interno(telefono);

  SELECT COUNT(*), COUNT(*) FILTER (WHERE resuelto_at IS NULL), MAX(minutos_a_resolver)
  INTO v_inc_hoy, v_inc_abiertos, v_peor
  FROM public.simon_bot_incidentes
  WHERE detectado_at >= v_desde AND tipo = 'sin_respuesta';

  SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT valido)
  INTO v_clics, v_clics_malos
  FROM public.v_mkt_clicks_humanos WHERE creado_en >= v_desde;

  SELECT COUNT(*) INTO v_clics_crudos
  FROM public.mkt_clicks_puente WHERE creado_en >= v_desde;

  SELECT STRING_AGG(t.linea, E'\n' ORDER BY t.n DESC)
  INTO v_piezas
  FROM (
    SELECT format('   · %s — %s clic(s)',
                  COALESCE(pz.nombre, '(pieza ' || c.pieza_num || ')'), COUNT(*)) AS linea,
           COUNT(*) AS n
    FROM public.v_mkt_clicks_humanos c
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
    || E'\n• Clics de publicaciones: *%s*%s%s',
    TO_CHAR(NOW() AT TIME ZONE 'America/La_Paz', 'DD/MM'),
    v_conv, v_nuevos, v_msg_in, v_msg_out, v_clics,
    CASE WHEN v_clics_crudos > v_clics
         THEN format('  _(%s repeticiones de Meta / pruebas descartadas)_', v_clics_crudos - v_clics)
         ELSE '' END,
    CASE WHEN v_clics_malos > 0
         THEN format('  :warning: %s con el código mal escrito', v_clics_malos)
         ELSE '' END
  );

  IF v_piezas IS NOT NULL THEN
    v_texto := v_texto || E'\n' || v_piezas;
  END IF;

  -- Las pruebas propias se DECLARAN aparte en vez de desaparecer: si probaste y
  -- no figura, querés poder distinguir "no contó porque sos vos" de "no llegó".
  IF v_propias > 0 THEN
    v_texto := v_texto || format(E'\n• _(%s conversación(es) tuya(s) de prueba, no contadas)_', v_propias);
  END IF;

  IF v_inc_hoy > 0 THEN
    v_texto := v_texto || format(
      E'\n• :warning: Incidentes: *%s* hoy (%s sin resolver). Peor demora: %s min',
      v_inc_hoy, v_inc_abiertos, COALESCE(v_peor::TEXT, '—'));
  ELSE
    v_texto := v_texto || E'\n• :white_check_mark: Sin incidentes';
  END IF;

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
  'Resumen diario del bot a Slack. Excluye números internos (es_telefono_interno) de las '
  'métricas pero los DECLARA aparte; cuenta clics desde v_mkt_clicks_humanos. NO afecta a '
  'vigilar_bot_whatsapp(), que debe seguir alarmando aunque el que espere sea el founder. '
  'Día calendario de Bolivia, 21:00 local. Migración 305 → 307 → 308.';

COMMIT;

-- =============================================================================
-- VERIFICACIÓN
-- =============================================================================
--   SELECT public.es_telefono_interno('+59176308808');  -- true
--   SELECT public.es_telefono_interno('76308808');      -- true (agnóstico al formato)
--   SELECT public.es_telefono_interno('+59171234567');  -- false
--
--   -- El parte de hoy: conversaciones debe dar 0 y declarar las propias aparte
--   SELECT public.parte_diario_bot();   -- ⚠️ MANDA UN MENSAJE A SLACK
--
--   -- La alarma NO cambió: debe seguir viendo el número del founder
--   SELECT prosrc LIKE '%es_telefono_interno%' AS alarma_lo_usa  -- debe ser FALSE
--   FROM pg_proc WHERE proname = 'vigilar_bot_whatsapp';
--
-- ROLLBACK: re-aplicar los bloques de la mig 307 y
--   DROP FUNCTION IF EXISTS public.es_telefono_interno(TEXT);
-- =============================================================================
