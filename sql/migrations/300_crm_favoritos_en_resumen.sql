-- =============================================================================
-- 300 · CRM — sumar FAVORITOS (♥) al resumen de contactos
-- =============================================================================
-- Los favoritos ya se guardaban (broker_shortlist_hearts) y se veían en el DETALLE
-- de cada contacto, pero no en la LISTA → había que abrir uno por uno para saber
-- quién marcó más. Esta mig los agrega al resumen para poder ordenar de un vistazo
-- por interés revelado (♥ + intentos de contacto).
--
-- ⚠️ LIMITACIÓN HEREDADA (declarada, mig 234): los hearts son a nivel SHORTLIST,
-- no persona. Si el mismo cliente tiene 2 selecciones, sus favoritos se SUMAN acá
-- (que es lo que se quiere para el CRM), pero una misma propiedad marcada en dos
-- selecciones distintas cuenta DOS veces. Con el volumen actual es irrelevante;
-- si molesta, contar DISTINCT propiedad_id.
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
-- v300: ♥ del cliente, sumados por persona (vía el teléfono de sus shortlists)
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
SELECT c.id, c.telefono, c.nombre, c.estado, c.notas, c.created_at,
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
  -- v300
  COALESCE(hearts.total_favoritos, 0) AS total_favoritos,
  hearts.ultimo_favorito_at
FROM public.simon_contactos c
LEFT JOIN msg m ON m.contacto_id = c.id
LEFT JOIN ultimo_in ui ON ui.contacto_id = c.id
LEFT JOIN sl ON sl.tel = c.telefono
LEFT JOIN hearts ON hearts.tel = c.telefono
LEFT JOIN wa ON wa.contacto_id = c.id;

COMMENT ON VIEW public.v_simon_contactos_resumen IS
  'CRM B2C: una fila por contacto del bot con contadores DERIVADOS (mensajes, shortlists, '
  '♥ favoritos e intentos de contacto WA). Consumer: /admin/contactos. Migs 296/299/300.';

REVOKE ALL   ON public.v_simon_contactos_resumen FROM anon, authenticated;
GRANT SELECT ON public.v_simon_contactos_resumen TO service_role, claude_readonly;

-- Corrige el número de migración del COMMENT de wa_clicks (se aplicó como "298",
-- pero esa numeración se la llevó el PR #41 — la tabla es de la mig 299).
COMMENT ON TABLE public.wa_clicks IS
  'Intento de contacto por WhatsApp (el CLIC, no el envío) en cualquier superficie: '
  'shortlist, feed venta/alquiler, compare. Alimenta la métrica "contactos WA/semana". '
  'NO reemplaza leads_alquiler (ese es el que dejó datos en el modal). Mig 299.';

COMMIT;

-- Verificación:
--   SELECT telefono, total_shortlists, total_favoritos, total_wa_clicks
--   FROM public.v_simon_contactos_resumen ORDER BY total_favoritos DESC;
-- =============================================================================
