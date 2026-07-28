-- =============================================================================
-- 307 — El parte diario contaba PREFETCH de Meta y pruebas como si fueran gente
-- =============================================================================
-- LO QUE PASÓ: el parte de Slack del 27-jul reportó **19 clics**. Las acciones
-- reales eran **~13** — sobrecontó ~45%.
--
-- CAUSA: **ráfagas**. El mismo código, desde el mismo navegador, varias veces en
-- segundos. Medido ese día:
--   · `bio` → 3 filas en **21 segundos** (22:03:02 → 22:03:23). Una sola acción.
--   · `f60` → 8 filas repartidas en solo **3 minutos distintos**.
-- Es el **prefetch de Meta**: cuando muestra un post con link, lo pide por
-- adelantado. El endpoint ya filtra los crawlers conocidos por nombre
-- (`facebookexternalhit`, etc.) ANTES de registrar, pero este viene con el UA del
-- navegador normal, así que pasa el filtro. No es un bug del endpoint: es que un
-- pedido automático de Meta y una persona real son indistinguibles por UA.
--
-- Y las PRUEBAS también contaban: los 14 clics del 28-jul son todos de desarrollo
-- (curl + UA falsificados para probar los tres caminos) y de las pruebas del
-- founder desde su iPhone. Cero de esos 14 es un usuario.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   1. `v_mkt_clicks_humanos` — la regla de "qué es un clic de una persona", en
--      UN solo lugar, para que el parte y las consultas ad-hoc coincidan siempre.
--   2. `parte_diario_bot()` pasa a leer de la vista, y **declara** cuántas
--      repeticiones descartó (para que el número se pueda auditar de un vistazo).
--
-- NO SE BORRA NADA. Los clics siguen en `mkt_clicks_puente` tal cual: se cambia
-- cómo se CUENTAN, no lo que se guarda. Borrar historial para arreglar una métrica
-- es peor que filtrarlo.
--
-- ⚠️ LÍMITE DECLARADO de la deduplicación: dos personas DISTINTAS con el mismo
-- user-agent (dos iPhone con la misma versión de la app de Facebook) que toquen el
-- MISMO código dentro del MISMO minuto se cuentan como una. Es un intercambio
-- deliberado: a este volumen el prefetch es muchísimo más frecuente que esa
-- coincidencia, y **sobrecontar es peor que subcontar** cuando el número se usa
-- para decidir si una pieza funciona.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. La vista: un clic = una persona, una pieza, un minuto
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mkt_clicks_humanos AS
SELECT DISTINCT ON (codigo, user_agent, date_trunc('minute', creado_en))
       id, creado_en, codigo, pieza_num, red,
       utm_source, utm_medium, utm_campaign, utm_content,
       valido, destino, referer, user_agent
FROM public.mkt_clicks_puente
WHERE user_agent IS NOT NULL
  -- Herramientas de desarrollo: nunca son un usuario. `curl` es el que más
  -- ensució (pruebas del 28-jul); el resto va por si acaso.
  AND user_agent !~* '(curl|wget|python-requests|node-fetch|axios|postman|insomnia|okhttp|java/|go-http|libwww|httpie)'
ORDER BY codigo, user_agent, date_trunc('minute', creado_en), creado_en;

COMMENT ON VIEW public.v_mkt_clicks_humanos IS
  'Clics del puente /ir atribuibles a una PERSONA: colapsa las ráfagas de prefetch '
  'de Meta (mismo código + mismo user-agent + mismo minuto → 1) y excluye herramientas '
  'de desarrollo. Usar SIEMPRE esta vista para contar clics; `mkt_clicks_puente` es el '
  'registro crudo y sobrecuenta ~45% (medido el 27-jul: 19 filas = 13 acciones). '
  'Límite: dos personas con el mismo UA en el mismo minuto cuentan como una. Mig 307.';

-- 🔴 REVOKE PRIMERO (lección migs 283→284 y 290→291: el REVOKE va sobre TODO
-- objeto nuevo, y una VISTA expone datos aunque anon no tenga permiso sobre la
-- tabla base). Esta vista tiene user_agent y referer → dato operativo, no público.
REVOKE ALL ON public.v_mkt_clicks_humanos FROM anon, authenticated;
GRANT SELECT ON public.v_mkt_clicks_humanos TO service_role, claude_readonly;


-- -----------------------------------------------------------------------------
-- 2. El parte diario cuenta desde la vista y declara lo que descartó
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

  -- Clics REALES (vista) y crudos (tabla), para poder declarar la diferencia.
  SELECT COUNT(*), COUNT(*) FILTER (WHERE NOT valido)
  INTO v_clics, v_clics_malos
  FROM public.v_mkt_clicks_humanos WHERE creado_en >= v_desde;

  SELECT COUNT(*) INTO v_clics_crudos
  FROM public.mkt_clicks_puente WHERE creado_en >= v_desde;

  -- Qué publicaciones trajeron clics hoy. Responde la única pregunta que
  -- importa de la campaña: cuál pieza funciona. También desde la vista, si no
  -- una pieza con más prefetch parecería la ganadora.
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
    -- Se declara lo descartado en vez de esconderlo: si el número baja mucho de
    -- un día a otro, hay que poder ver que fue prefetch y no caída de tráfico.
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
  'incidentes. Cuenta clics desde `v_mkt_clicks_humanos` (sin prefetch de Meta ni pruebas) '
  'y declara cuántas repeticiones descartó. Día calendario de Bolivia. La corre pg_cron a '
  'las 01:00 UTC = 21:00 local (job parte-diario-bot). Migración 305, corregida en la 307.';

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr después de aplicar)
-- =============================================================================
--   -- 27-jul: la tabla cruda dice 19, la vista debe decir ~13
--   SELECT (SELECT COUNT(*) FROM mkt_clicks_puente
--            WHERE (creado_en AT TIME ZONE 'America/La_Paz')::date='2026-07-27') AS crudos,
--          (SELECT COUNT(*) FROM v_mkt_clicks_humanos
--            WHERE (creado_en AT TIME ZONE 'America/La_Paz')::date='2026-07-27') AS humanos;
--
--   -- 28-jul: eran TODAS pruebas; los 4 de curl deben desaparecer
--   SELECT COUNT(*) FROM v_mkt_clicks_humanos
--     WHERE (creado_en AT TIME ZONE 'America/La_Paz')::date='2026-07-28';
--
--   SELECT has_table_privilege('anon','public.v_mkt_clicks_humanos','SELECT');  -- false
--
-- ROLLBACK: re-aplicar el bloque de `parte_diario_bot()` de la mig 305 y
--   ALTER VIEW public.v_mkt_clicks_humanos RENAME TO _trash_v_mkt_clicks_humanos;
-- =============================================================================
