-- Migración 230: snapshot del precio normalizado en broker_shortlist_items
--
-- Contexto: la migración 229 agregó `precio_usd_snapshot` que guardamos como RAW
-- (de propiedades_v2.precio_usd). Esto permite detectar cuándo el agente del
-- listing cambió el precio en el portal (cambio de scraping) vs cuándo solo se
-- movió el TC paralelo (no es decisión del agente).
--
-- Pero el cliente VE el precio normalizado (USD oficial equivalente, calculado
-- por la vista v_mercado_venta). Para mostrar "Antes era $X" con un valor que
-- haga sentido al cliente, también necesitamos guardar el normalizado al momento.
--
-- Resumen:
--   precio_usd_snapshot       = RAW   (propiedades_v2.precio_usd)   → detecta cambio
--   precio_norm_snapshot      = NORM  (v_mercado_venta.precio_usd)  → muestra al cliente
--
-- Lógica del badge en /b/[hash]:
--   si abs(precio_usd_actual - precio_usd_snapshot) / precio_usd_snapshot > 1%:
--     → el agente cambió el precio
--     → mostrar badge: "↓ Bajó de $us {precio_norm_snapshot}" o "Antes era $us {precio_norm_snapshot}"
--   sino:
--     → no mostrar nada (puede ser solo movimiento de TC paralelo)
--
-- Rollback: ALTER TABLE public.broker_shortlist_items DROP COLUMN precio_norm_snapshot;

ALTER TABLE public.broker_shortlist_items
  ADD COLUMN IF NOT EXISTS precio_norm_snapshot NUMERIC NULL;

COMMENT ON COLUMN public.broker_shortlist_items.precio_norm_snapshot IS
  'Precio USD normalizado (v_mercado_venta.precio_usd) al momento de agregar la
   propiedad a la shortlist. Se usa SOLO para mostrar "Antes era $X" en el badge.
   La comparación de cambio se hace con precio_usd_snapshot (raw). Migración 230.';
