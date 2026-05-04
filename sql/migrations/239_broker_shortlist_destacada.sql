-- Migración 239: agregar is_destacada a broker_shortlist_items
--
-- Contexto: El broker ya puede agregar comentarios por item (columna
-- comentario_broker, migración 228) pero hoy no se renderizan al cliente.
-- Esta migración agrega el flag is_destacada para marcar UNA propiedad como
-- "Recomendada por tu broker" — render dorado/arena en el feed público
-- /b/[hash]. Frontend valida máximo 1 por shortlist (UI desmarca al elegir
-- otra). API server valida defensivamente que no lleguen 2+ true en el PATCH.
--
-- Decisiones:
--  1. BOOLEAN NOT NULL DEFAULT FALSE — aditivo, no rompe items existentes.
--  2. Sin constraint UNIQUE (shortlist_id WHERE is_destacada) — la validación
--     vive en frontend + API. Razón: queremos flexibilidad si en el futuro
--     se permite "destacar varias por categoría" sin tener que dropear el
--     constraint. La regla de producto es 1 por shortlist hoy.
--  3. Sin índice — uso esperado es leer todos los items de una shortlist
--     y filtrar en memoria; el volumen es chico (<20 items por shortlist).
--
-- Precondición: 228 aplicada (broker_shortlist_items existe).
-- Rollback: ALTER TABLE public.broker_shortlist_items DROP COLUMN is_destacada;

ALTER TABLE public.broker_shortlist_items
  ADD COLUMN is_destacada BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.broker_shortlist_items.is_destacada IS
  'Marca al item como "Recomendada por tu broker" en el feed público
   /b/[hash]. Render: card con fondo arena (venta) o borde negro (alquiler)
   + chip ⭐. Validación: máximo 1 por shortlist (frontend + API). Default
   false para items existentes. Independiente de comentario_broker.';

-- =============================================================================
-- Verificación post-aplicación
-- =============================================================================
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'broker_shortlist_items' AND column_name = 'is_destacada';
--   -- data_type='boolean', is_nullable='NO', column_default='false'
--
--   SELECT COUNT(*) FILTER (WHERE is_destacada = true) AS destacadas,
--          COUNT(*) AS total
--   FROM broker_shortlist_items;
--   -- destacadas debe ser 0 inmediatamente post-migración
