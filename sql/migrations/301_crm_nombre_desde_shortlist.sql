-- =============================================================================
-- 301 · CRM — el nombre del contacto, con respaldo desde la shortlist
-- =============================================================================
-- SÍNTOMA: en /admin/contactos el nombre salía vacío ("Sin nombre") aunque el
-- bot claramente conoce a la persona (la saluda por su nombre).
--
-- CAUSA: `simon_contactos.nombre` se llena SOLO con `conversation.kapso.contact_name`
-- del webhook, y Kapso no lo está enviando (el webhook entrega OK — response 200 en
-- todas las deliveries — y los mensajes sí se guardan; el campo del nombre viene vacío).
--
-- FIX: derivar el nombre de la ÚLTIMA shortlist del cliente. Es mejor dato que el de
-- Kapso: es el nombre que la persona le DIJO AL BOT (paso 4 del prompt lo pide
-- explícitamente), no su alias de perfil de WhatsApp.
-- Precedencia: nombre real de la tabla (si algún día Kapso lo manda o se edita a
-- mano) → nombre de la última shortlist → NULL.
--
-- Se resuelve en la VISTA, no escribiendo la tabla: mismo principio que el resto de
-- los contadores (derivar, no guardar) — si el cliente cambia de nombre en una
-- shortlist nueva, el CRM lo refleja solo.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_simon_contactos_resumen AS
WITH msg AS (
  SELECT contacto_id,
    COUNT(*) AS total_mensajes,
    COUNT(*) FILTER (WHERE direccion = 'in')  AS mensajes_in,
    COUNT(*) FILTER (WHERE direccion = 'out') AS mensajes_out,
    MIN(enviado_at) AS primer_mensaje_at,
    MAX(enviado_at) AS ultimo_mensaje_at
  FROM public.simon_mensajes GROUP BY contacto_id
),
ultimo_in AS (
  SELECT DISTINCT ON (contacto_id) contacto_id, texto
  FROM public.simon_mensajes WHERE direccion = 'in'
  ORDER BY contacto_id, enviado_at DESC
),
sl AS (
  SELECT public.normalizar_telefono_bo(cliente_telefono) AS tel,
    COUNT(*) AS total_shortlists, MAX(created_at) AS ultima_shortlist_at
  FROM public.broker_shortlists
  WHERE broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(cliente_telefono) IS NOT NULL
  GROUP BY 1
),
-- v301: el nombre que el cliente le dio al BOT, de su shortlist más reciente
nombre_sl AS (
  SELECT DISTINCT ON (public.normalizar_telefono_bo(cliente_telefono))
         public.normalizar_telefono_bo(cliente_telefono) AS tel,
         NULLIF(TRIM(cliente_nombre), '') AS nombre
  FROM public.broker_shortlists
  WHERE broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(cliente_telefono) IS NOT NULL
    AND NULLIF(TRIM(cliente_nombre), '') IS NOT NULL
  ORDER BY 1, created_at DESC
),
hearts AS (
  SELECT public.normalizar_telefono_bo(s.cliente_telefono) AS tel,
         COUNT(*) AS total_favoritos,
         MAX(h.created_at) AS ultimo_favorito_at
  FROM public.broker_shortlist_hearts h
  JOIN public.broker_shortlists s ON s.id = h.shortlist_id
  WHERE s.broker_slug = 'simon-asistente'
    AND public.normalizar_telefono_bo(s.cliente_telefono) IS NOT NULL
  GROUP BY 1
),
wa AS (
  SELECT contacto_id, COUNT(*) AS total_wa_clicks, MAX(created_at) AS ultimo_wa_click_at
  FROM public.wa_clicks
  WHERE contacto_id IS NOT NULL AND NOT es_bot AND NOT es_test
  GROUP BY 1
)
SELECT c.id, c.telefono,
  -- v301: tabla → shortlist → NULL
  COALESCE(NULLIF(TRIM(c.nombre), ''), nombre_sl.nombre) AS nombre,
  c.estado, c.notas, c.created_at,
  COALESCE(m.total_mensajes, 0) AS total_mensajes,
  COALESCE(m.mensajes_in, 0)    AS mensajes_in,
  COALESCE(m.mensajes_out, 0)   AS mensajes_out,
  m.primer_mensaje_at, m.ultimo_mensaje_at,
  ui.texto AS ultimo_texto_in,
  COALESCE(sl.total_shortlists, 0) AS total_shortlists,
  sl.ultima_shortlist_at,
  (CURRENT_DATE - m.ultimo_mensaje_at::date)::int AS dias_sin_actividad,
  COALESCE(wa.total_wa_clicks, 0) AS total_wa_clicks,
  wa.ultimo_wa_click_at,
  COALESCE(hearts.total_favoritos, 0) AS total_favoritos,
  hearts.ultimo_favorito_at
FROM public.simon_contactos c
LEFT JOIN msg m ON m.contacto_id = c.id
LEFT JOIN ultimo_in ui ON ui.contacto_id = c.id
LEFT JOIN sl ON sl.tel = c.telefono
LEFT JOIN nombre_sl ON nombre_sl.tel = c.telefono
LEFT JOIN hearts ON hearts.tel = c.telefono
LEFT JOIN wa ON wa.contacto_id = c.id;

REVOKE ALL   ON public.v_simon_contactos_resumen FROM anon, authenticated;
GRANT SELECT ON public.v_simon_contactos_resumen TO service_role, claude_readonly;

COMMIT;

-- Verificación: SELECT telefono, nombre FROM public.v_simon_contactos_resumen;
-- =============================================================================
