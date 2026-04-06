-- Migración 206: Agregar flag es_debounce a leads_alquiler
-- Si un mismo session_id genera múltiples leads en <5s, se marcan como debounce.
-- Las métricas filtran (es_debounce = false OR es_debounce IS NULL).

ALTER TABLE leads_alquiler
ADD COLUMN IF NOT EXISTS es_debounce boolean DEFAULT false;

COMMENT ON COLUMN leads_alquiler.es_debounce IS 'true si el lead se generó <5s después de otro lead del mismo session_id. No cuenta en métricas pero se conserva en BD.';
