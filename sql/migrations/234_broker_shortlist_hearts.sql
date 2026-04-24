-- Migración 234: tabla broker_shortlist_hearts
--
-- Contexto: Día 3 del plan Fase 2 (docs/broker/BACKLOG.md L54).
-- Cuando el cliente abre el link /b/[hash] y marca propiedades con corazón,
-- queremos que el broker lo vea en su panel. Hoy los corazones del cliente
-- viven solo en localStorage del navegador del cliente — el broker no se entera.
--
-- Esta tabla es el feedback store: el cliente marca/desmarca, la API hace
-- UPSERT/DELETE scoped por hash (sin auth), y el broker consulta agregados
-- en /broker/[slug]/shortlists/[id] ("cliente marcó 3 de 7 propiedades").
--
-- Decisiones estructurales:
--  1. shortlist_id FK (no hash TEXT) — el hash es solo la "llave" pública para
--     el cliente; internamente ya tenemos el UUID de la shortlist.
--  2. propiedad_id FK a propiedades_v2 — CASCADE si la prop se borra (raro,
--     pero posible si se reindexa). También aplica al shortlist: si se archiva
--     la shortlist y eventualmente se borra, los hearts se van con ella.
--  3. UNIQUE(shortlist_id, propiedad_id) — idempotente. El UPSERT vuelve a poner
--     la misma fila; el toggle-off es DELETE.
--  4. Sin cliente_id ni fingerprint — el MVP asume que "cliente del hash" es
--     un sujeto único. Si el broker reenvía el link y múltiples personas abren,
--     todos comparten los mismos corazones — aceptable (no es una feature de
--     multi-cliente, es feedback simple del broker). Feature futura: hash por
--     cliente individual (Nivel 3 backlog "Cliente como entidad").
--  5. Sin updated_at — created_at es suficiente (la fila existe o no existe).
--
-- RLS:
--  - PII indirecta (qué quiere el cliente) → ENABLE RLS.
--  - Sin policy anon/authenticated → todo acceso por API server-side con
--    SUPABASE_SERVICE_ROLE_KEY. La API valida el hash antes de escribir.
--  - claude_readonly SELECT para auditoría/reportes ad-hoc.
--
-- Precondición: 228 aplicada (broker_shortlists y broker_shortlist_items).
-- Rollback: DROP TABLE public.broker_shortlist_hearts CASCADE;

-- =============================================================================
-- broker_shortlist_hearts
-- =============================================================================

CREATE TABLE public.broker_shortlist_hearts (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id  UUID         NOT NULL
                               REFERENCES public.broker_shortlists(id)
                               ON DELETE CASCADE,
  propiedad_id  INTEGER      NOT NULL
                               REFERENCES public.propiedades_v2(id)
                               ON DELETE CASCADE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (shortlist_id, propiedad_id)
);

CREATE INDEX idx_broker_shortlist_hearts_shortlist
  ON public.broker_shortlist_hearts(shortlist_id, created_at DESC);

COMMENT ON TABLE public.broker_shortlist_hearts IS
  'Corazones del cliente sobre las propiedades de una shortlist compartida
   (/b/[hash]). Feedback visible al broker en su panel. Migración 234.';

COMMENT ON COLUMN public.broker_shortlist_hearts.shortlist_id IS
  'FK a broker_shortlists. Cliente identificado por el hash público que mapea
   a este UUID internamente — la API valida el hash antes de escribir.';

COMMENT ON COLUMN public.broker_shortlist_hearts.propiedad_id IS
  'FK a propiedades_v2. El heart solo tiene sentido si la propiedad existe
   todavía; si se borra, cascada lo limpia.';

-- =============================================================================
-- RLS — sin policy anon/authenticated, todo acceso por service_role API routes
-- =============================================================================

ALTER TABLE public.broker_shortlist_hearts ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_shortlist_hearts_claude_readonly_select
  ON public.broker_shortlist_hearts
  FOR SELECT
  TO claude_readonly
  USING (true);

-- =============================================================================
-- Verificación post-aplicación
-- =============================================================================
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname = 'broker_shortlist_hearts';
--   -- relrowsecurity debe ser 't'
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.broker_shortlist_hearts'::regclass;
--   -- debe listar broker_shortlist_hearts_claude_readonly_select
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.broker_shortlist_hearts'::regclass;
--   -- debe listar PK + FKs + UNIQUE (shortlist_id, propiedad_id)
