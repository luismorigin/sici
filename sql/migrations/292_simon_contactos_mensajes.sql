-- =============================================================================
-- 292 · simon_contactos + simon_mensajes — el lado WhatsApp de la medición
-- =============================================================================
-- Cierra el círculo del funnel: hoy se puede medir el click en una publicación
-- (mig 290, tabla `mkt_clicks_puente`) pero NO si esa persona escribió. Entre el
-- click y el contacto está WhatsApp, donde no había medición de ningún tipo: la
-- conversación vive en Kapso y nadie la registra de este lado.
--
-- Cómo llega el dato SIN darle permiso de escritura al bot: Kapso **empuja** un
-- webhook a POST /api/kapso/webhook y SICI escribe con su propio service_role.
-- El bot sigue siendo `bot_kapso_readonly`, físicamente incapaz de modificar
-- SICI — que es el diseño de lab-kapso y no hay que romperlo.
--
-- Este es el subconjunto de MEDICIÓN del plan de CRM B2C
-- (docs/backlog/CRM_CLIENTES_B2C_PLAN.md, decisiones confirmadas 5-jun-2026):
-- capas 1 y 2 tal cual las especifica. La capa 3 (criterios por búsqueda,
-- timeline, UI admin) es CRM, no medición, y queda para ese proyecto.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Capa 1 · simon_contactos (la persona)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simon_contactos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono    TEXT NOT NULL UNIQUE CHECK (telefono ~ '^\+591[67][0-9]{7}$'),
  nombre      TEXT,
  estado      TEXT NOT NULL DEFAULT 'nuevo',
  notas       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.simon_contactos IS
  'Persona que escribió al bot de WhatsApp. Identidad = teléfono normalizado +591… '
  '(espejo de simon-mvp/src/lib/phone.ts; el TS manda). Solo `estado` y `notas` son '
  'estado editado a mano — los contadores se derivan, no se guardan. Creada en mig 292.';

-- -----------------------------------------------------------------------------
-- 2. Capa 2 · simon_mensajes (la conversación espejada)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simon_mensajes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contacto_id            UUID NOT NULL REFERENCES public.simon_contactos(id) ON DELETE CASCADE,
  telefono               TEXT NOT NULL,   -- denormalizado: robustez del ingest
  direccion              TEXT NOT NULL CHECK (direccion IN ('in','out')),
  texto                  TEXT,
  tipo                   TEXT,
  kapso_message_id       TEXT NOT NULL UNIQUE,  -- wamid: idempotencia del webhook
  kapso_conversation_id  TEXT,
  enviado_at             TIMESTAMPTZ NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.simon_mensajes IS
  'Mensajes de WhatsApp espejados desde Kapso vía webhook. `kapso_message_id` es el '
  'wamid y trae la idempotencia: el ingest hace ON CONFLICT DO NOTHING porque Kapso '
  'reintenta a los 10s/40s/90s si no recibe 200. Creada en mig 292.';

CREATE INDEX IF NOT EXISTS simon_mensajes_idx_timeline
  ON public.simon_mensajes (contacto_id, enviado_at DESC);
CREATE INDEX IF NOT EXISTS simon_mensajes_idx_enviado
  ON public.simon_mensajes (enviado_at DESC);

-- -----------------------------------------------------------------------------
-- 3. GRANTS — Preset PII (sin anon) + REVOKE de los defaults del schema
-- -----------------------------------------------------------------------------
-- 🔴 El REVOKE va sobre TODO objeto nuevo, no solo la tabla (lección 290→291).
-- Acá es PII de verdad: teléfonos y conversaciones.
REVOKE ALL ON public.simon_contactos FROM anon, authenticated;
REVOKE ALL ON public.simon_mensajes  FROM anon, authenticated;

GRANT ALL    ON public.simon_contactos TO service_role;
GRANT ALL    ON public.simon_mensajes  TO service_role;
GRANT SELECT ON public.simon_contactos TO claude_readonly;
GRANT SELECT ON public.simon_mensajes  TO claude_readonly;

-- RLS deny-all: sin policies para anon/authenticated. service_role la bypassea.
ALTER TABLE public.simon_contactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simon_mensajes  ENABLE ROW LEVEL SECURITY;

CREATE POLICY simon_contactos_claude_read ON public.simon_contactos
  FOR SELECT TO claude_readonly USING (true);
CREATE POLICY simon_mensajes_claude_read ON public.simon_mensajes
  FOR SELECT TO claude_readonly USING (true);

-- -----------------------------------------------------------------------------
-- 4. 🎯 LA VISTA QUE CIERRA EL CÍRCULO
-- -----------------------------------------------------------------------------
-- El endpoint /ir precarga en WhatsApp el texto:
--     Hola Simón, vi tu publicación "<nombre de la pieza>" y quiero saber más.
-- Ese texto viaja DENTRO del mensaje, así que el primer mensaje de la persona
-- dice de qué publicación vino. Cruzándolo con mkt_piezas se obtiene lo que
-- hasta ahora era imposible: **qué pieza generó una conversación real**, no solo
-- un click.
--
-- ⚠️ Es atribución por texto, con sus límites declarados:
--   · la persona puede borrar el texto precargado antes de enviar (se pierde),
--   · si dos piezas se llaman parecido puede matchear la que no es,
--   · solo cubre a quien llegó por /ir — quien escribe directo queda sin pieza.
-- Sirve para comparar piezas ENTRE SÍ, no como conteo absoluto.
CREATE OR REPLACE VIEW public.v_atribucion_contactos AS
WITH primer_mensaje AS (
  SELECT DISTINCT ON (m.contacto_id)
         m.contacto_id, m.telefono, m.texto, m.enviado_at
  FROM public.simon_mensajes m
  WHERE m.direccion = 'in'
  ORDER BY m.contacto_id, m.enviado_at
)
SELECT
  pm.contacto_id,
  pm.enviado_at                        AS primer_contacto_at,
  p.num                                AS pieza_num,
  p.nombre                             AS pieza,
  (p.num IS NOT NULL)                  AS atribuido,
  pm.texto                             AS primer_mensaje
FROM primer_mensaje pm
LEFT JOIN public.mkt_piezas p
  ON pm.texto ILIKE '%"' || p.nombre || '"%';

COMMENT ON VIEW public.v_atribucion_contactos IS
  'Qué publicación generó cada conversación, cruzando el texto precargado por /ir '
  '(mig 290) con mkt_piezas. `atribuido=false` = escribió sin pasar por el link o '
  'borró el texto. Atribución por texto: sirve para comparar piezas entre sí, NO '
  'como conteo absoluto. Ver docs/backlog/MEDICION_FUNNEL_PLAN.md §Paso 4.';

REVOKE ALL   ON public.v_atribucion_contactos FROM anon, authenticated;
GRANT SELECT ON public.v_atribucion_contactos TO service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación post-aplicación
-- -----------------------------------------------------------------------------
-- SELECT has_table_privilege('anon','public.simon_contactos','SELECT');       -- false
-- SELECT has_table_privilege('anon','public.simon_mensajes','SELECT');        -- false
-- SELECT has_table_privilege('anon','public.v_atribucion_contactos','SELECT');-- false
-- SELECT pieza, COUNT(*) FROM public.v_atribucion_contactos
--   WHERE atribuido GROUP BY 1 ORDER BY 2 DESC;
