-- Migración 235: Protección de shortlists v1
--
-- Contexto: docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md
--
-- Simon Broker es el caballo de Troya de Simon: brokers usan la plataforma como
-- herramienta de curación + WhatsApp con clientes específicos, y esos clientes
-- terminan descubriendo Simón vía las shortlists. Sin protecciones técnicas,
-- el broker puede convertir su shortlist en un mini-portal público (postearla
-- en bio de Instagram, distribuirla en grupos masivos de WA), lo que diluye
-- la marca Simón y rompe el modelo "Simon = canal de adquisición de usuarios".
--
-- Esta migración introduce el lever de monetización del Plan Pro futuro
-- (cap de vistas + expiración + analytics de visitas). Plan Inicial = Bs 350/mes
-- con 20 vistas únicas / 30 días por shortlist. Plan Pro queda abierto en
-- features pero los caps son la palanca de upgrade.
--
-- INVARIANTE EDITORIAL: la marca SIEMPRE es Simón. Los brokers son canal,
-- nunca white-label. NUNCA habilitar branding propio (logo, dominio, colores).
-- Por eso el lever de Pro NO es branding — son límites más altos + features
-- productivas (analytics detallados, push notifications).
--
-- Decisiones estructurales:
--  1. max_views/current_views nuevos (NO reusar `view_count` legacy).
--     `view_count` (228) cuenta hits brutos sin uniqueness — sigue para back-compat.
--     `current_views` cuenta vistas únicas (1 por dispositivo) y compara contra cap.
--  2. expires_at backfilleado desde created_at + 30d (no NOW() + 30d), para que
--     shortlists creadas hace días tengan expiración coherente con su edad real.
--  3. status TEXT con CHECK enum, no boolean — necesitamos diferenciar 3 razones
--     de bloqueo (expirado / cap alcanzado / suspendido por admin) para mostrar
--     mensajes específicos en la página de bloqueo.
--  4. broker_shortlist_views como tabla de eventos, NO JSONB en parent.
--     Permite queries de uniqueness por fingerprint (índice multi-columna)
--     sin reescribir la fila padre en cada visita. Source of truth de visitas.
--  5. ip_hash, no ip_address plano (privacidad). UA y referrer se guardan en
--     claro porque son baja sensibilidad y útiles para debug de bot/scrapers.
--  6. RLS en broker_shortlist_views: ENABLE + policy claude_readonly_select.
--     Sin policies anon/authenticated → todo acceso por API server-side con
--     SUPABASE_SERVICE_ROLE_KEY (mismo patrón que 228/234).
--  7. terms_accepted_at en simon_brokers: nullable, backfilleado a NOW() para
--     los brokers existentes (acuerdos verbales pre-feature). Brokers nuevos
--     en /admin/simon-brokers requerirán checkbox antes de poder crearse.
--
-- Precondición: 228 (broker_shortlists), 231 (simon_brokers).
-- Rollback al final del archivo.

-- =============================================================================
-- 1. broker_shortlists — caps + expiración + status
-- =============================================================================

ALTER TABLE public.broker_shortlists
  ADD COLUMN IF NOT EXISTS max_views INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS current_views INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'expired', 'view_limit_reached', 'suspended')),
  ADD COLUMN IF NOT EXISTS first_viewed_at TIMESTAMPTZ;

-- Backfill expires_at desde created_at + 30 días para shortlists existentes.
-- (Si quedara alguna en NULL post-update sería bug — el SET NOT NULL siguiente lo cazaría.)
UPDATE public.broker_shortlists
   SET expires_at = created_at + INTERVAL '30 days'
 WHERE expires_at IS NULL;

ALTER TABLE public.broker_shortlists
  ALTER COLUMN expires_at SET NOT NULL,
  ALTER COLUMN expires_at SET DEFAULT (NOW() + INTERVAL '30 days');

-- Índices: lookup rápido por status (admin dashboard) y barrido de expirados.
-- El parcial WHERE status='active' minimiza el índice — solo nos importa expirar
-- las que todavía están vigentes; las ya bloqueadas no necesitan re-evaluación.
CREATE INDEX IF NOT EXISTS idx_broker_shortlists_status
  ON public.broker_shortlists(status);

CREATE INDEX IF NOT EXISTS idx_broker_shortlists_expires
  ON public.broker_shortlists(expires_at)
  WHERE status = 'active';

COMMENT ON COLUMN public.broker_shortlists.max_views IS
  'Cap de vistas únicas (Plan Inicial = 20). Lever de monetización Plan Pro futuro.
   Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.';

COMMENT ON COLUMN public.broker_shortlists.current_views IS
  'Vistas únicas registradas (1 por dispositivo via cookie/IP+UA hash).
   NO confundir con `view_count` (228) que cuenta hits brutos sin uniqueness.';

COMMENT ON COLUMN public.broker_shortlists.expires_at IS
  'Expiración automática (Plan Inicial = 30 días desde creación).
   Lever de monetización Plan Pro futuro. Backfill: created_at + 30d.';

COMMENT ON COLUMN public.broker_shortlists.status IS
  'active = link funciona | expired = pasó expires_at | view_limit_reached = current_views >= max_views | suspended = admin manual.
   Bloqueos lazy: el SSR de /b/[hash] marca expired al primer hit posterior a expires_at.';

COMMENT ON COLUMN public.broker_shortlists.first_viewed_at IS
  'Primera visita registrada en la tabla broker_shortlist_views.
   Útil para distinguir shortlists nunca abiertas vs. ya consumidas.';

-- =============================================================================
-- 2. broker_shortlist_views — eventos de visita con fingerprint
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.broker_shortlist_views (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_id  UUID         NOT NULL
                               REFERENCES public.broker_shortlists(id)
                               ON DELETE CASCADE,
  fingerprint   TEXT         NOT NULL,
  ip_hash       TEXT         NULL,
  user_agent    TEXT         NULL,
  referrer      TEXT         NULL,
  is_unique     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_broker_shortlist_views_shortlist
  ON public.broker_shortlist_views(shortlist_id);

-- Índice compuesto para "¿este fingerprint ya visitó esta shortlist?" (hot path SSR).
CREATE INDEX IF NOT EXISTS idx_broker_shortlist_views_fingerprint
  ON public.broker_shortlist_views(shortlist_id, fingerprint);

CREATE INDEX IF NOT EXISTS idx_broker_shortlist_views_created
  ON public.broker_shortlist_views(created_at DESC);

COMMENT ON TABLE public.broker_shortlist_views IS
  'Eventos de visita a /b/[hash]. Source of truth para uniqueness y analytics.
   Cada fila = 1 hit. is_unique=TRUE solo en la primera vez que un fingerprint
   visita una shortlist. Ver docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md.';

COMMENT ON COLUMN public.broker_shortlist_views.fingerprint IS
  'Identificador del visitante. Cookie persistente sl_visitor_<first8> es primaria;
   fallback = sha256(ip + user_agent + shortlist_id) si no hay cookie. Salt con
   shortlist_id evita correlacionar visitas del mismo dispositivo entre shortlists.';

COMMENT ON COLUMN public.broker_shortlist_views.ip_hash IS
  'sha256(ip). Plano no se guarda por privacidad. Útil para debugging agregado
   sin exponer IPs individuales (Tigo/Entel hacen NAT pesado en Bolivia).';

COMMENT ON COLUMN public.broker_shortlist_views.is_unique IS
  'TRUE = primera visita de este fingerprint a esta shortlist (cuenta para el cap).
   FALSE = visita recurrente del mismo dispositivo (no consume cap).';

-- RLS — sin policies anon/authenticated, todo acceso por service_role.
ALTER TABLE public.broker_shortlist_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_shortlist_views_claude_readonly_select
  ON public.broker_shortlist_views
  FOR SELECT
  TO claude_readonly
  USING (true);

GRANT SELECT ON public.broker_shortlist_views TO claude_readonly;

-- =============================================================================
-- 3. simon_brokers — aceptación de términos de uso
-- =============================================================================

ALTER TABLE public.simon_brokers
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;

-- Backfill: brokers existentes son acuerdos verbales pre-feature. El admin
-- nuevo introducirá checkbox obligatorio en /admin/simon-brokers, pero los
-- ya activos quedan grandfathered con NOW() para no romper UX.
UPDATE public.simon_brokers
   SET terms_accepted_at = NOW()
 WHERE terms_accepted_at IS NULL;

COMMENT ON COLUMN public.simon_brokers.terms_accepted_at IS
  'Timestamp en que el broker aceptó los términos de uso (checkbox obligatorio
   en form de creación admin). NULL = pendiente de aceptación. Brokers
   pre-migración 235 backfilleados a NOW() (acuerdos verbales).';

-- =============================================================================
-- Verificación post-aplicación
-- =============================================================================
--
--   -- 1. Columnas nuevas en broker_shortlists
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='broker_shortlists'
--      AND column_name IN ('max_views','current_views','expires_at','status','first_viewed_at')
--    ORDER BY column_name;
--
--   -- 2. Backfill correcto: ninguna shortlist con expires_at NULL ni desfasado
--   SELECT COUNT(*) FILTER (WHERE expires_at IS NULL) AS sin_expiracion,
--          COUNT(*) FILTER (WHERE expires_at < NOW()) AS ya_expiradas,
--          COUNT(*) AS total
--     FROM broker_shortlists;
--   -- sin_expiracion debe ser 0; ya_expiradas debe ser 0 si todas creadas <30d
--
--   -- 3. Tabla broker_shortlist_views con RLS habilitada y policy
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname='broker_shortlist_views';
--   SELECT polname FROM pg_policy
--    WHERE polrelid='public.broker_shortlist_views'::regclass;
--
--   -- 4. simon_brokers.terms_accepted_at presente y backfilleado
--   SELECT slug, terms_accepted_at FROM simon_brokers ORDER BY slug;
--   -- todos deben tener terms_accepted_at NOT NULL post-migración
--
--   -- 5. CHECK constraint funciona
--   UPDATE broker_shortlists SET status='banana' WHERE id=(SELECT id FROM broker_shortlists LIMIT 1);
--   -- debe FALLAR con CHECK violation
--
-- =============================================================================
-- Rollback
-- =============================================================================
--
--   ALTER TABLE public.simon_brokers DROP COLUMN IF EXISTS terms_accepted_at;
--   DROP TABLE IF EXISTS public.broker_shortlist_views CASCADE;
--   ALTER TABLE public.broker_shortlists
--     DROP COLUMN IF EXISTS first_viewed_at,
--     DROP COLUMN IF EXISTS status,
--     DROP COLUMN IF EXISTS expires_at,
--     DROP COLUMN IF EXISTS current_views,
--     DROP COLUMN IF EXISTS max_views;
--   DROP INDEX IF EXISTS idx_broker_shortlists_status;
--   DROP INDEX IF EXISTS idx_broker_shortlists_expires;
