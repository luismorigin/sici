-- Migración 233: snapshot del precio de alquiler (BOB) en broker_shortlist_items
--
-- Contexto: las migraciones 229 y 230 agregaron `precio_usd_snapshot` (raw) y
-- `precio_norm_snapshot` (normalizado con TC paralelo) para items de VENTA.
-- En venta hay distinción raw/norm porque el TC paralelo puede mover el precio
-- normalizado sin que el agente toque el listing.
--
-- En ALQUILER no aplica ese split: `precio_mensual_bob` ES la fuente de verdad
-- (el USD se deriva como bob / 6.96, regla 10 de CLAUDE.md). Alcanza con un solo
-- snapshot en BOB al momento de armar la shortlist.
--
-- Lógica del badge en /b/[hash] cuando tipo_operacion='alquiler':
--   si abs(precio_mensual_bob_actual - precio_mensual_bob_snapshot)
--      / precio_mensual_bob_snapshot > 1%:
--     → el agente cambió el precio
--     → "↓ Bajó de Bs {snap} a Bs {actual}/mes" (verde)
--       o "↑ Antes Bs {snap} · ahora Bs {actual}/mes" (gris)
--   sino:
--     → no mostrar nada
--
-- La columna es NULLABLE:
--   - Items pre-migración (creados entre 228 y 233) tendrán NULL → sin badge
--   - Items de venta también quedan NULL (usan precio_usd_snapshot / precio_norm_snapshot)
--
-- Precondición: 228 aplicada (tabla broker_shortlist_items existe).
-- Rollback: ALTER TABLE public.broker_shortlist_items DROP COLUMN precio_mensual_bob_snapshot;

ALTER TABLE public.broker_shortlist_items
  ADD COLUMN IF NOT EXISTS precio_mensual_bob_snapshot NUMERIC NULL;

COMMENT ON COLUMN public.broker_shortlist_items.precio_mensual_bob_snapshot IS
  'Precio mensual BOB de la propiedad al momento de agregarla a la shortlist
   (solo tipo_operacion=alquiler). Se compara contra precio_mensual_bob actual
   al renderizar /b/[hash] para mostrar badge "bajó" (verde) o "subió" (gris)
   si la diferencia es > 1%. NULL en items de venta y en items pre-migración.
   Migración 233.';

-- Verificación post-aplicación:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'broker_shortlist_items'
--     AND column_name = 'precio_mensual_bob_snapshot';
--   -- Debe devolver: precio_mensual_bob_snapshot | numeric | YES
