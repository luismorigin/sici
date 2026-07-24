-- =============================================================================
-- 299 · wa_clicks — registrar el INTENTO DE CONTACTO por WhatsApp
-- =============================================================================
-- PROBLEMA: la métrica del founder es "contactos de WhatsApp por semana", pero
-- solo 1 de 4 superficies lo registra del lado del servidor:
--   · feed ALQUILER público  → ✅ modal de captura → leads_alquiler
--   · feed VENTA público     → ❌ nada (ventas.tsx ni usa el modal)
--   · shortlist /b/[hash]    → ❌ nada (contacto_directo: "sin lead en BD", explícito)
--   · modo broker            → ❌ nada
-- Justamente las shortlists son la superficie con MÁS engagement del sitio
-- (700-860 s/sesión vs 121 s del feed mobile) → se medía ciego donde más convierte.
--
-- QUÉ ES ESTA TABLA: el CLIC de contacto, en cualquier superficie. Una sola tabla
-- para que "¿cuántos contactos tuve esta semana?" se responda con UN count, sin
-- unir tablas con semánticas distintas.
--
-- ⚠️ NO reemplaza `leads_alquiler` — son eventos DISTINTOS:
--   · leads_alquiler = el que DEJÓ SUS DATOS en el modal (lead con consentimiento).
--   · wa_clicks      = el que TOCÓ el botón (intención). No pide nada al usuario.
-- Un mismo contacto puede generar los dos. No se deduplican entre sí a propósito.
--
-- 🔴 LÍMITE DECLARADO: se mide el CLIC, no el ENVÍO. El mensaje se manda dentro de
-- WhatsApp, fuera de nuestro sistema. EXCEPCIÓN: si el destino es el número de
-- Simón (`destino_es_simon`), el mensaje real sí llega por el webhook de Kapso y
-- queda en `simon_mensajes` → ahí sí se puede confirmar el envío cruzando por
-- teléfono + ventana de tiempo. Para el captador, solo hay intención.
--
-- SIN FK a propiedades_v2 (lección de la mig 297): pre-cutover el id puede vivir
-- en prod (ZN/casas) o en shadow (Equipetrol). Las FK a tablas propias (uuid) sí
-- se ponen, con ON DELETE SET NULL para no perder el clic si se borra el padre.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.wa_clicks (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Qué se quiso contactar
  propiedad_id      integer,                    -- SIN FK (dual-universe, ver mig 297)
  tipo_operacion    text CHECK (tipo_operacion IN ('venta','alquiler')),

  -- Desde dónde: 'shortlist' | 'feed' | 'compare' | 'sheet' | 'mapa' | ...
  origen            text NOT NULL,

  -- Contexto de shortlist (NULL si el clic vino del feed público)
  shortlist_id      uuid REFERENCES public.broker_shortlists(id) ON DELETE SET NULL,
  -- 🔑 La magia: si el clic vino de una shortlist, sabemos DE QUIÉN es sin pedirle
  -- nada al usuario (la shortlist guarda el teléfono del cliente que la pidió).
  contacto_id       uuid REFERENCES public.simon_contactos(id) ON DELETE SET NULL,

  -- A quién se contactó
  destino_telefono  text,                       -- normalizado +591… cuando se puede
  destino_es_simon  boolean NOT NULL DEFAULT false,  -- true = el bot (se puede confirmar el envío)

  -- Higiene / anti-ruido
  fingerprint       text,
  user_agent        text,
  es_bot            boolean NOT NULL DEFAULT false,
  es_test           boolean NOT NULL DEFAULT false,

  created_at        timestamptz NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.wa_clicks IS
  'Intento de contacto por WhatsApp (el CLIC, no el envío) en cualquier superficie: '
  'shortlist, feed venta/alquiler, compare. Alimenta la métrica "contactos WA/semana". '
  'NO reemplaza leads_alquiler (ese es el que dejó datos en el modal). Mig 299.';
COMMENT ON COLUMN public.wa_clicks.propiedad_id IS
  'SIN FK a propósito (ver mig 297): pre-cutover el id vive en propiedades_v2 (ZN/casas) '
  'o en propiedades_v2_shadow (Equipetrol).';
COMMENT ON COLUMN public.wa_clicks.destino_es_simon IS
  'true = el contacto fue al número del bot → el mensaje REAL se puede confirmar en '
  'simon_mensajes (webhook Kapso). false = captador → solo se conoce la intención.';

CREATE INDEX IF NOT EXISTS wa_clicks_idx_fecha      ON public.wa_clicks (created_at DESC);
CREATE INDEX IF NOT EXISTS wa_clicks_idx_contacto   ON public.wa_clicks (contacto_id, created_at DESC)
  WHERE contacto_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS wa_clicks_idx_shortlist  ON public.wa_clicks (shortlist_id)
  WHERE shortlist_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Permisos — interna: la escribe el server (service_role), nadie la lee del browser
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.wa_clicks FROM anon, authenticated;
GRANT ALL    ON public.wa_clicks TO service_role;
GRANT SELECT ON public.wa_clicks TO claude_readonly;

ALTER TABLE public.wa_clicks ENABLE ROW LEVEL SECURITY;
-- service_role bypassea RLS. Policy de lectura para claude_readonly (igual que mig 292)
-- para poder auditar la métrica desde el MCP.
CREATE POLICY wa_clicks_claude_read ON public.wa_clicks
  FOR SELECT TO claude_readonly USING (true);

-- -----------------------------------------------------------------------------
-- 3. La vista del CRM suma los contactos por persona
-- -----------------------------------------------------------------------------
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
  -- v299: intentos de contacto por WhatsApp de esta persona
  COALESCE(wa.total_wa_clicks, 0) AS total_wa_clicks,
  wa.ultimo_wa_click_at
FROM public.simon_contactos c
LEFT JOIN msg m ON m.contacto_id = c.id
LEFT JOIN ultimo_in ui ON ui.contacto_id = c.id
LEFT JOIN sl ON sl.tel = c.telefono
LEFT JOIN wa ON wa.contacto_id = c.id;

REVOKE ALL   ON public.v_simon_contactos_resumen FROM anon, authenticated;
GRANT SELECT ON public.v_simon_contactos_resumen TO service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (correr aparte)
-- -----------------------------------------------------------------------------
-- SELECT has_table_privilege('anon','public.wa_clicks','SELECT');  -- false
-- SELECT has_table_privilege('anon','public.wa_clicks','INSERT');  -- false
-- LA MÉTRICA (contactos por semana):
--   SELECT date_trunc('week', created_at) AS semana, COUNT(*)
--   FROM public.wa_clicks WHERE NOT es_bot AND NOT es_test GROUP BY 1 ORDER BY 1 DESC;
-- -----------------------------------------------------------------------------
-- ROLLBACK: ALTER TABLE public.wa_clicks RENAME TO _trash_wa_clicks;  (Regla 3)
-- =============================================================================
