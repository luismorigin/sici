-- Migración 210: Agregar utm_content y utm_campaign a leads_alquiler
-- Para poder cruzar leads BD por pieza (utm_content) y campaña (utm_campaign)
-- Complementa migración 208 que agregó utm_source
--
-- CORTE DE DATOS:
--   - utm_source: confiable desde 8 abr 2026 (migración 208)
--   - utm_content / utm_campaign: confiable desde fecha de deploy de esta migración
--   - Leads anteriores: estos campos serán NULL (indistinguible)

ALTER TABLE leads_alquiler
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

COMMENT ON COLUMN leads_alquiler.utm_content IS 'UTM content (pieza): ej video07, carousel02. Confiable desde migración 210';
COMMENT ON COLUMN leads_alquiler.utm_campaign IS 'UTM campaign name. Confiable desde migración 210';
