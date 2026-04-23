-- Migración 228: tablas broker_shortlists + broker_shortlist_items
--
-- Contexto: S2 del MVP Simon Broker (docs/broker/PRD.md F2).
-- El broker arma una shortlist de propiedades, le asigna nombre/teléfono/mensaje
-- al cliente, y manda link compartible /b/[hash] por WhatsApp.
--
-- Decisiones estructurales:
--  1. broker_slug TEXT (sin FK ni UNIQUE) — todavía no existe tabla `brokers`.
--     Cuando exista, agregar broker_id UUID FK + backfill + drop de broker_slug.
--  2. hash TEXT UNIQUE — generado en API route con nanoid(10) URL-safe (no en SQL).
--     Opaco, no enumerable, no expone identidad del cliente.
--  3. tipo_operacion en items (no en shortlist) — preparado para Fase 2 alquileres
--     y shortlists mixtas venta+alquiler. En MVP siempre 'venta'.
--  4. cliente_telefono NOT NULL — el flujo MVP siempre envía por WA. Si futuro
--     querés "copiar link manualmente" → relax a NULL.
--  5. cliente_telefono NO UNIQUE — un cliente puede estar en N shortlists.
--  6. mensaje_whatsapp TEXT NULL — última versión editada del template para reenvío.
--  7. view_count + last_viewed_at — analytics mínimos desde día 1, costo cero.
--  8. is_published — pausa lógica si broker quiere "cortar" el link sin perder data.
--  9. archived_at — borrado lógico (no DELETE físico) para histórico.
--
-- RLS:
--  - Tabla con PII (teléfono, nombre cliente) → ENABLE RLS
--  - SIN policy anon ni authenticated → todo acceso debe ir por API server-side
--    con SUPABASE_SERVICE_ROLE_KEY (bypassea RLS automáticamente).
--  - claude_readonly: SELECT para auditoría/reportes ad-hoc.
--
-- Precondición: ninguna (tablas nuevas).
-- Rollback: DROP TABLE public.broker_shortlist_items, public.broker_shortlists CASCADE;

-- =============================================================================
-- broker_shortlists
-- =============================================================================

CREATE TABLE public.broker_shortlists (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  broker_slug     TEXT         NOT NULL,
  hash            TEXT         NOT NULL UNIQUE,

  cliente_nombre  TEXT         NOT NULL,
  cliente_telefono TEXT        NOT NULL,
  mensaje_whatsapp TEXT        NULL,

  is_published    BOOLEAN      NOT NULL DEFAULT TRUE,
  archived_at     TIMESTAMPTZ  NULL,

  view_count      INTEGER      NOT NULL DEFAULT 0,
  last_viewed_at  TIMESTAMPTZ  NULL,

  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_broker_shortlists_broker_slug
  ON public.broker_shortlists(broker_slug)
  WHERE archived_at IS NULL;

CREATE INDEX idx_broker_shortlists_hash
  ON public.broker_shortlists(hash)
  WHERE is_published = TRUE AND archived_at IS NULL;

CREATE INDEX idx_broker_shortlists_telefono
  ON public.broker_shortlists(cliente_telefono);

COMMENT ON TABLE public.broker_shortlists IS
  'Shortlists de propiedades curadas por broker para enviar al cliente vía WhatsApp.
   Migración 228 — S2 MVP Simon Broker (docs/broker/PRD.md F2).';

COMMENT ON COLUMN public.broker_shortlists.hash IS
  'Identificador opaco URL-safe (nanoid 10 chars) usado en /b/[hash]. Generado en server.';

COMMENT ON COLUMN public.broker_shortlists.broker_slug IS
  'Slug del broker (BROKERS_DEMO en lib/brokers-demo.ts). Migrar a broker_id UUID FK cuando exista tabla brokers.';

COMMENT ON COLUMN public.broker_shortlists.is_published IS
  'FALSE = link /b/[hash] devuelve 410 Gone. Permite "cortar" sin perder data.';

COMMENT ON COLUMN public.broker_shortlists.archived_at IS
  'Borrado lógico. Si NOT NULL, oculto en panel del broker pero data preservada.';

-- =============================================================================
-- broker_shortlist_items
-- =============================================================================

CREATE TABLE public.broker_shortlist_items (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id      UUID         NOT NULL
                                   REFERENCES public.broker_shortlists(id)
                                   ON DELETE CASCADE,
  propiedad_id      INTEGER      NOT NULL
                                   REFERENCES public.propiedades_v2(id)
                                   ON DELETE CASCADE,
  tipo_operacion    TEXT         NOT NULL DEFAULT 'venta'
                                   CHECK (tipo_operacion IN ('venta', 'alquiler')),
  comentario_broker TEXT         NULL,
  orden             INTEGER      NOT NULL DEFAULT 0,
  added_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (shortlist_id, propiedad_id)
);

CREATE INDEX idx_broker_shortlist_items_shortlist
  ON public.broker_shortlist_items(shortlist_id, orden);

COMMENT ON TABLE public.broker_shortlist_items IS
  'Propiedades incluidas en cada shortlist + orden + comentario opcional del broker.';

COMMENT ON COLUMN public.broker_shortlist_items.tipo_operacion IS
  'Preparado para Fase 2 alquileres. En MVP siempre venta.';

-- =============================================================================
-- Trigger updated_at en broker_shortlists
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tg_broker_shortlists_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_broker_shortlists_updated_at
  BEFORE UPDATE ON public.broker_shortlists
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_broker_shortlists_updated_at();

-- =============================================================================
-- RLS — sin policy anon/authenticated, todo acceso por service_role API routes
-- =============================================================================

ALTER TABLE public.broker_shortlists       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broker_shortlist_items  ENABLE ROW LEVEL SECURITY;

-- Auditoría / reportes ad-hoc desde Claude
CREATE POLICY broker_shortlists_claude_readonly_select
  ON public.broker_shortlists
  FOR SELECT
  TO claude_readonly
  USING (true);

CREATE POLICY broker_shortlist_items_claude_readonly_select
  ON public.broker_shortlist_items
  FOR SELECT
  TO claude_readonly
  USING (true);

-- =============================================================================
-- Verificación post-aplicación
-- =============================================================================
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname IN ('broker_shortlists', 'broker_shortlist_items');
--   -- relrowsecurity debe ser 't' en ambas
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid IN ('public.broker_shortlists'::regclass,
--                       'public.broker_shortlist_items'::regclass);
--   -- debe listar las 2 policies de claude_readonly
--
--   INSERT INTO public.broker_shortlists (broker_slug, hash, cliente_nombre, cliente_telefono)
--   VALUES ('demo', 'test12345', 'Test Cliente', '+59170000000');
--   -- debe funcionar con service_role; debe FALLAR con anon
