-- ============================================================================
-- FIX: casas del híbrido en 'inactivo_pending' DENTRO de la gracia → 'completado'
-- ----------------------------------------------------------------------------
-- Contexto: hasta hoy (26-jun-2026) el verificador, en la 1ra ausencia, ponía
-- status='inactivo_pending' → la casa salía del feed (v_mercado_casas exige
-- status IN ('completado','actualizado')) ANTES de estar confirmada de baja.
-- Una corrida con cobertura parcial / portal bloqueado vaciaba el feed.
--
-- Nueva política (ya en verificador-casas.mjs): la 1ra ausencia SOLO registra el
-- contador (primera_ausencia_at) y deja status='completado' → la casa SIGUE en el
-- feed durante la gracia (2d). Solo sale si la ausencia se sostiene (>2d → baja).
--
-- Este script corrige las que ya quedaron en 'inactivo_pending' pero AÚN están
-- dentro de la gracia: las vuelve a 'completado' MANTENIENDO primera_ausencia_at
-- (el contador sigue corriendo; si siguen caídas >2d, el verificador las baja).
-- NO toca las que ya superaron la gracia (esas son baja legítima).
-- Read-only-safe: solo casas del híbrido, solo inactivo_pending, solo dentro de gracia.
-- ============================================================================

UPDATE propiedades_v2
SET status = 'completado'
WHERE tipo_propiedad_original = 'casa'
  AND (metodo_match LIKE 'carga_%' OR metodo_match = 'cron_casas_zn')
  AND status = 'inactivo_pending'
  AND primera_ausencia_at IS NOT NULL
  AND primera_ausencia_at > (NOW() - INTERVAL '2 days');  -- solo dentro de gracia
-- primera_ausencia_at se mantiene a propósito (NO se limpia).

-- Verificación posterior:
-- SELECT COUNT(*) FROM v_mercado_casas;  -- debería subir ~ +7
-- SELECT id, status, primera_ausencia_at FROM propiedades_v2
--   WHERE tipo_propiedad_original='casa' AND status='inactivo_pending'
--     AND (metodo_match LIKE 'carga_%' OR metodo_match='cron_casas_zn');
