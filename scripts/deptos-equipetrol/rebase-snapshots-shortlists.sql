-- ============================================================================
--  RE-BASE de snapshots de precio en shortlists (lanzamiento TC nuevo, 21-jul)
-- ----------------------------------------------------------------------------
--  Por qué: los snapshots de venta se guardaron con precio_norm del régimen
--  VIEJO (prod). El display /b/[hash] lee SHADOW → el chip de cambio de precio
--  ve la brecha de régimen y la atribuye mal ("↓ TC paralelo bajó ~$us X",
--  falso). Este UPDATE re-basa los snapshots a la base nueva: el chip fantasma
--  desaparece y el tracking de cambios re-arranca desde el lanzamiento.
--
--  El RAW (precio_usd_snapshot) NO se toca: sigue siendo el crudo verdadero
--  del día de creación (detecta cambios del agente). Alquiler es Bs → no aplica.
--
--  Lo aplica el humano (Supabase SQL Editor). Afecta solo items de venta cuyo
--  id existe en la vista shadow. Idempotente.
-- ============================================================================

UPDATE broker_shortlist_items i
SET precio_norm_snapshot = v.precio_norm
FROM v_mercado_venta_shadow v
WHERE i.tipo_operacion = 'venta'
  AND i.propiedad_id = v.id
  AND i.precio_norm_snapshot IS DISTINCT FROM v.precio_norm;

-- Verificación: no debería quedar ningún item de venta con snapshot distinto
-- al precio_norm shadow actual (salvo props que ya no están en la vista):
-- SELECT COUNT(*) FROM broker_shortlist_items i
-- JOIN v_mercado_venta_shadow v ON v.id = i.propiedad_id
-- WHERE i.tipo_operacion='venta' AND i.precio_norm_snapshot IS DISTINCT FROM v.precio_norm;
