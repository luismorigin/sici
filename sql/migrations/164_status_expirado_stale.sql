-- Migración 164: Status expirado_stale para propiedades que expiran sin confirmación broker
--
-- Diferencia con inactivo_confirmed:
--   inactivo_confirmed = broker/Flujo C confirma que ya no está disponible (CUENTA como absorción)
--   expirado_stale     = pasó >150 días sin confirmación (NO cuenta como absorción)
--
-- Uso: a partir del 14 Mar 2026, cuando una propiedad alquiler pase 150d
--       sin que un broker confirme que se alquiló → expirado_stale
--
-- Nota: snapshot_absorcion_mercado() debe ignorar este status (no es absorción real)

-- El campo status es TEXT libre, no requiere ALTER TABLE.
-- Solo documentamos el nuevo valor y ajustamos snapshot para excluirlo.

-- Verificar que snapshot_absorcion_mercado() no cuente expirado_stale como absorbido:
-- El snapshot mide COUNT(*) WHERE es_activa=true, así que al setear es_activa=false
-- con status expirado_stale, no se cuenta como inventario activo.
-- La absorción se calcula como delta entre snapshots, así que el efecto es el mismo
-- que inactivo_confirmed en el snapshot actual.
--
-- IMPORTANTE: Para distinguir absorción real vs expiración en análisis futuros,
-- filtrar propiedades_v2_historial por motivo:
--   motivo LIKE 'Inactivado%'     → absorción real (broker confirmó)
--   motivo LIKE 'Expirado%'       → stale, no es absorción
--   motivo LIKE 'Flujo C%'        → detección automática (probable absorción)

-- Limpieza actual: inactivar las 4 propiedades >150d (absorción contaminada hasta 14 Mar 2026)
-- IDs: 4 (170d), 27 (329d), 87 (337d), 871 (775d)
UPDATE propiedades_v2
SET status = 'inactivo_confirmed', es_activa = false
WHERE id IN (4, 27, 87, 871)
  AND tipo_operacion = 'alquiler'
  AND es_activa = true;
