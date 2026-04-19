-- ============================================================================
-- Migración 223: modal_whatsapp — captura de phone de usuario en leads_alquiler
-- Fecha: 2026-04-18
-- ============================================================================
-- Agrega columnas para soportar el modal de captura WhatsApp (Fase 1 PRD
-- docs/backlog/MODAL_WHATSAPP_CAPTURA.md). Infra de monetización: habilita
-- verificación de envío a broker y alertas (baja precio / unidades nuevas).
--
-- Nuevas columnas:
--   - usuario_telefono TEXT         → phone del USUARIO (distinto de broker_telefono)
--   - alert_consent BOOLEAN         → usuario acepta recibir alertas del proyecto
--   - visitor_uuid TEXT             → UUID cross-session desde localStorage
--   - modal_action TEXT             → 'submitted' | 'skipped' | 'reused' | 'dismissed'
--
-- Todas nullable + idempotentes (IF NOT EXISTS). Compatible con código legacy
-- que no escribe estos campos (leads previos quedan con NULL).
-- ============================================================================

ALTER TABLE leads_alquiler
  ADD COLUMN IF NOT EXISTS usuario_telefono TEXT,
  ADD COLUMN IF NOT EXISTS alert_consent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS visitor_uuid TEXT,
  ADD COLUMN IF NOT EXISTS modal_action TEXT
    CHECK (modal_action IN ('submitted', 'skipped', 'reused', 'dismissed'));

CREATE INDEX IF NOT EXISTS idx_leads_alq_usuario_telefono
  ON leads_alquiler(usuario_telefono)
  WHERE usuario_telefono IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_alq_visitor
  ON leads_alquiler(visitor_uuid)
  WHERE visitor_uuid IS NOT NULL;
