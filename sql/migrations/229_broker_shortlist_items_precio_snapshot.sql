-- Migración 229: snapshot de precio en broker_shortlist_items
--
-- Contexto: hoy las shortlists son live — cuando el cliente abre /b/[hash], ve
-- el precio actual de la BD, no el precio cuando el broker armó la shortlist.
-- Esto crea problema cuando un vendedor ajusta precio entre armado y apertura:
--   - Si baja: oportunidad perdida (broker no se entera, cliente lo ve solo)
--   - Si sube: pérdida de credibilidad ("vos me dijiste $180k, dice $200k")
--
-- Solución: guardar el precio_usd al momento del INSERT (snapshot).
-- En /b/[hash] comparar snapshot vs precio actual:
--   - Diff > 1% bajó → badge verde "Bajó de $X → $Y"
--   - Diff > 1% subió → badge gris "Antes $X → ahora $Y"
--   - Sin diff → nada
--
-- La columna es NULLABLE: shortlists ya existentes (creadas antes de esta
-- migración) tendrán NULL → el código no muestra badge para ellas.
--
-- Rollback: ALTER TABLE public.broker_shortlist_items DROP COLUMN precio_usd_snapshot;

ALTER TABLE public.broker_shortlist_items
  ADD COLUMN IF NOT EXISTS precio_usd_snapshot NUMERIC NULL;

COMMENT ON COLUMN public.broker_shortlist_items.precio_usd_snapshot IS
  'Precio USD de la propiedad al momento de agregarla a la shortlist (migración 229).
   Se compara contra precio_usd actual al renderizar /b/[hash] para mostrar badge
   "bajó" (verde) o "subió" (gris). NULL en items pre-migración.';

-- Verificación post-aplicación:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'broker_shortlist_items' AND column_name = 'precio_usd_snapshot';
