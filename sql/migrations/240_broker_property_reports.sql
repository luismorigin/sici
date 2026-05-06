-- Migración 240: tabla broker_property_reports
--
-- Contexto: Sistema de reportes broker → SICI sobre datos incorrectos en
-- propiedades. Brokers detectan errores (precio mal extraído, área errónea,
-- prop ya vendida que sigue activa, TC sospechoso, etc.) cuando arman
-- shortlists para sus clientes y hoy no tienen forma estructurada de
-- reportarlo. El único caso cubierto era el toast efímero "TC sospechoso"
-- (hotfix commits 87884bb, 8deed85, 93b1b09, 84178a7) que no persiste.
--
-- Esta tabla persiste reportes con FK a simon_brokers + propiedades_v2.
-- Trigger downstream: API route dispara mensaje a SLACK_WEBHOOK_URL en cada
-- INSERT, panel admin /admin/property-reports gestiona la cola.
--
-- Brief acordado: docs/broker/REPORTES_DATOS_BRIEF.md (commit 622f054).
-- Plan ejecución: feature/broker-property-reports.
--
-- Decisiones estructurales:
--  1. Modelado tipo_error = 8 columnas BOOL (no enum+N filas, no JSONB).
--     Razón: el set de tipos está acordado y estable, métricas más simples
--     (`COUNT(*) FILTER (WHERE precio_incorrecto)`), 1 fila = 1 reporte
--     mental. Consistente con propiedades_v2.amenidades. CHECK exige ≥1 true.
--     Trade-off aceptado: agregar tipo nuevo requiere ALTER TABLE.
--  2. FK simon_brokers.id (UUID) ON DELETE CASCADE — si se borra el broker,
--     reportes dejan de tener sentido.
--  3. FK propiedades_v2.id (INTEGER) ON DELETE CASCADE — confirmado tipo en
--     migración 228 broker_shortlist_items.propiedad_id.
--  4. status TEXT CHECK (4 valores) — patrón de simon_brokers.status.
--     'pending' default, 'in_review' = admin abrió, 'resolved' = corregido,
--     'false_positive' = broker se equivocó.
--  5. nota TEXT CHECK length ≤ 200 — validado en API y UI también.
--  6. resolved_by TEXT NULL — email del admin (auth.users no tiene tabla
--     propia editable; guardamos email para trazabilidad).
--  7. chk_resolved_consistency — pending/in_review ⇒ resolved_at IS NULL,
--     resolved/false_positive ⇒ resolved_at IS NOT NULL. Evita estados
--     incoherentes.
--  8. SIN UNIQUE constraint sobre (simon_broker_id, propiedad_id). Razón:
--     un broker puede reportar la misma prop dos veces si SICI ya la
--     resolvió y vuelve a romperse. Anti-duplicado lo hace la API con
--     lookup WHERE status = 'pending'.
--  9. Índices para queries del panel admin (status+created), reportes por
--     prop (recurrencia: ≥2 brokers distintos sobre misma prop), historial
--     por broker.
--
-- RLS:
--  - ENABLE RLS + sin policies anon/authenticated → todo acceso vía API
--    server-side con SUPABASE_SERVICE_ROLE_KEY (bypass automático).
--  - claude_readonly: SELECT para auditoría/reportes ad-hoc.
--
-- Precondición: 228 (broker_shortlists base) y 231 (simon_brokers) aplicadas.
-- Rollback: DROP TABLE public.broker_property_reports;

CREATE TABLE public.broker_property_reports (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  simon_broker_id     UUID         NOT NULL
                                     REFERENCES public.simon_brokers(id)
                                     ON DELETE CASCADE,
  propiedad_id        INTEGER      NOT NULL
                                     REFERENCES public.propiedades_v2(id)
                                     ON DELETE CASCADE,

  -- 8 tipos de error (al menos 1 debe ser TRUE, ver chk_at_least_one_error)
  tc_sospechoso              BOOLEAN NOT NULL DEFAULT FALSE,
  precio_incorrecto          BOOLEAN NOT NULL DEFAULT FALSE,
  area_incorrecta            BOOLEAN NOT NULL DEFAULT FALSE,
  dorms_banos_incorrectos    BOOLEAN NOT NULL DEFAULT FALSE,
  vendida_pero_activa        BOOLEAN NOT NULL DEFAULT FALSE,
  ya_alquilada               BOOLEAN NOT NULL DEFAULT FALSE,
  nombre_edificio_incorrecto BOOLEAN NOT NULL DEFAULT FALSE,
  zona_gps_incorrecta        BOOLEAN NOT NULL DEFAULT FALSE,

  nota                TEXT         NULL,

  status              TEXT         NOT NULL DEFAULT 'pending'
                                     CHECK (status IN ('pending','in_review','resolved','false_positive')),

  resolution_notes    TEXT         NULL,
  resolved_at         TIMESTAMPTZ  NULL,
  resolved_by         TEXT         NULL,

  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_at_least_one_error CHECK (
    tc_sospechoso OR precio_incorrecto OR area_incorrecta
    OR dorms_banos_incorrectos OR vendida_pero_activa OR ya_alquilada
    OR nombre_edificio_incorrecto OR zona_gps_incorrecta
  ),

  CONSTRAINT chk_nota_length CHECK (nota IS NULL OR char_length(nota) <= 200),

  CONSTRAINT chk_resolved_consistency CHECK (
    (status IN ('pending','in_review') AND resolved_at IS NULL)
    OR (status IN ('resolved','false_positive') AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX idx_bpr_status_created
  ON public.broker_property_reports(status, created_at DESC);

CREATE INDEX idx_bpr_propiedad
  ON public.broker_property_reports(propiedad_id, status);

CREATE INDEX idx_bpr_broker
  ON public.broker_property_reports(simon_broker_id, created_at DESC);

-- =============================================================================
-- Trigger updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.tg_bpr_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bpr_updated_at
  BEFORE UPDATE ON public.broker_property_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_bpr_updated_at();

-- =============================================================================
-- RLS — sin policy anon/authenticated, todo acceso por service_role API routes
-- =============================================================================

ALTER TABLE public.broker_property_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY broker_property_reports_claude_readonly_select
  ON public.broker_property_reports
  FOR SELECT
  TO claude_readonly
  USING (true);

GRANT SELECT ON public.broker_property_reports TO claude_readonly;

-- =============================================================================
-- Comentarios
-- =============================================================================

COMMENT ON TABLE public.broker_property_reports IS
  'Reportes broker → SICI sobre datos incorrectos en propiedades. Migración 240.
   Ver docs/broker/REPORTES_DATOS_BRIEF.md y docs/broker/REPORTES_DATOS_PRD.md.
   Tipos de error como columnas BOOL (≥1 true). Slack dispatch desde API en
   cada INSERT. Panel admin: /admin/property-reports.';

COMMENT ON COLUMN public.broker_property_reports.simon_broker_id IS
  'FK simon_brokers.id (no a brokers legacy). ON DELETE CASCADE.';

COMMENT ON COLUMN public.broker_property_reports.propiedad_id IS
  'FK propiedades_v2.id INTEGER. ON DELETE CASCADE.';

COMMENT ON COLUMN public.broker_property_reports.status IS
  'pending=recibido | in_review=admin lo abrió | resolved=corregido en BD | false_positive=broker se equivocó.';

COMMENT ON COLUMN public.broker_property_reports.nota IS
  'Texto libre opcional del broker (max 200 chars). Útil para discernir nombre
   edificio incorrecto vs match incorrecto, sugerir valor correcto, dar contexto.';

COMMENT ON COLUMN public.broker_property_reports.resolved_by IS
  'Email del admin que resolvió. No hay FK porque admin auth pasa por
   Supabase Auth (auth.users), no tabla propia editable.';

-- =============================================================================
-- Verificación post-aplicación
-- =============================================================================
--
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relname = 'broker_property_reports';
--   -- relrowsecurity debe ser 't'
--
--   SELECT polname FROM pg_policy
--    WHERE polrelid = 'public.broker_property_reports'::regclass;
--   -- debe listar broker_property_reports_claude_readonly_select
--
--   -- Smoke insert con service_role (sustituir UUID/INT reales):
--   INSERT INTO public.broker_property_reports
--     (simon_broker_id, propiedad_id, precio_incorrecto, nota)
--   VALUES
--     ((SELECT id FROM simon_brokers WHERE slug='abel-flores' LIMIT 1),
--      (SELECT id FROM propiedades_v2 WHERE status='completado' LIMIT 1),
--      true, 'Test reporte');
--
--   -- Smoke CHECK constraint (debe FALLAR — sin tipos true):
--   INSERT INTO public.broker_property_reports
--     (simon_broker_id, propiedad_id)
--   VALUES
--     ((SELECT id FROM simon_brokers WHERE slug='abel-flores' LIMIT 1),
--      (SELECT id FROM propiedades_v2 WHERE status='completado' LIMIT 1));
--   -- ERROR: new row for relation "broker_property_reports" violates check
--   -- constraint "chk_at_least_one_error"
--
--   -- Smoke recurrencia (props con ≥2 brokers reportando):
--   SELECT propiedad_id, COUNT(DISTINCT simon_broker_id) AS brokers_distintos
--     FROM broker_property_reports
--    WHERE status IN ('pending','in_review')
--    GROUP BY propiedad_id
--   HAVING COUNT(DISTINCT simon_broker_id) >= 2;
