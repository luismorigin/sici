-- Migración 231: tabla simon_brokers (MVP Simon Broker)
--
-- Contexto: S3 del MVP Simon Broker. Reemplaza el archivo hardcodeado
-- `simon-mvp/src/lib/brokers-demo.ts` por una tabla en Supabase para
-- permitir activación/desactivación de brokers en caliente desde admin UI
-- (sin deploy). Resuelve el problema del momentum: cerrar un broker en
-- una reunión y activarlo en 30 seg sin editar repo + push + deploy.
--
-- OJO CON NOMBRES: existe otra tabla `brokers` en SICI (legacy, sistema
-- de captación B2B de brokers que suben propiedades al pipeline — NO
-- se usa actualmente pero podría reactivarse). Esta tabla nueva se llama
-- `simon_brokers` y es del producto Simon Broker. NUNCA confundirlas.
--
-- Decisiones:
--  1. slug TEXT UNIQUE — URL pública /broker/<slug>, case-sensitive, lowercase.
--  2. telefono TEXT NOT NULL — WhatsApp con código país, ej. '+59178519485'.
--  3. foto_url TEXT NULL — URL pública (CDN externo OK). Fallback UI = inicial.
--  4. inmobiliaria TEXT NULL — franquicia (RE/MAX, Century 21, ...) o NULL = independiente.
--  5. status CHECK ('activo','pausado','inactivo') — gate en SSR /broker/[slug].
--     Solo 'activo' → página visible. Otros → 404.
--  6. fecha_proximo_cobro DATE NULL — informativo, pagos fuera del producto
--     (Google Sheet + QR manual). Tabla de pagos se agrega cuando haya ≥15 brokers.
--  7. notas TEXT NULL — libre para admin (contexto del broker, notas de cierre).
--
-- RLS:
--  - ENABLE RLS + sin policies públicas → acceso SOLO via API server-side
--    con SUPABASE_SERVICE_ROLE_KEY.
--  - claude_readonly: SELECT para auditoría.
--
-- Seed:
--  - 'demo' (preserva el que está en brokers-demo.ts hoy)
--  - 'abel-flores' (Abel Antonio Flores Nava — RE/MAX Legacy, broker de prueba real).
--
-- Precondición: ninguna (tabla nueva, nombre no colisiona con `brokers` legacy).
-- Rollback: DROP TABLE public.simon_brokers;

CREATE TABLE IF NOT EXISTS public.simon_brokers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  foto_url TEXT,
  inmobiliaria TEXT,
  status TEXT NOT NULL DEFAULT 'activo'
    CHECK (status IN ('activo', 'pausado', 'inactivo')),
  fecha_alta DATE NOT NULL DEFAULT CURRENT_DATE,
  fecha_proximo_cobro DATE,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simon_brokers_slug ON public.simon_brokers(slug);
CREATE INDEX IF NOT EXISTS idx_simon_brokers_status ON public.simon_brokers(status);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION public.simon_brokers_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_simon_brokers_updated_at ON public.simon_brokers;
CREATE TRIGGER trg_simon_brokers_updated_at
  BEFORE UPDATE ON public.simon_brokers
  FOR EACH ROW EXECUTE FUNCTION public.simon_brokers_set_updated_at();

-- RLS: deny-all, acceso solo via API con service_role
ALTER TABLE public.simon_brokers ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.simon_brokers TO claude_readonly;

-- Seed inicial
INSERT INTO public.simon_brokers (slug, nombre, telefono, foto_url, inmobiliaria, status, notas)
VALUES
  ('demo', 'Demo Broker', '+59170000000', NULL, NULL, 'activo',
   'Slug de prueba/demo. Preservado desde brokers-demo.ts (MVP S1).'),
  ('abel-flores', 'Abel Antonio Flores Nava', '+59178519485',
   'https://intramax.bo/storage/agents/Abel_Antonio_Flores_Nava_1.jpg',
   'RE/MAX Legacy', 'activo',
   'Primer broker de prueba real S3. Datos desde remax.bo/agents/abelflores.')
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.simon_brokers IS
  'MVP Simon Broker: brokers que usan /broker/[slug] para armar shortlists. NO confundir con tabla `brokers` legacy (captación B2B).';
COMMENT ON COLUMN public.simon_brokers.status IS
  'activo=página visible | pausado=404 (renovación WA) | inactivo=404 (dropout)';
COMMENT ON COLUMN public.simon_brokers.fecha_proximo_cobro IS
  'Informativo. Cobro via Google Sheet + QR manual. Tabla de pagos se agrega cuando haya ≥15 brokers.';
