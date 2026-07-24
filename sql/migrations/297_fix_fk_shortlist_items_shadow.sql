-- =============================================================================
-- 297 · FIX PROD 🔴 — las FK a propiedades_v2 rompen todo lo que toca props SHADOW
-- =============================================================================
-- SÍNTOMA (reportado 24-jul-2026): el bot de WhatsApp responde "estoy teniendo
-- problemas técnicos para armar la selección". Reproducible: 2 de 2 intentos.
--
-- CAUSA RAÍZ (cadena verificada entera):
--   1. Los 3 RPCs del bot (buscar_propiedades, buscar_similares, resumen_mercado)
--      fueron repunteados a SHADOW el 21-jul (lanzamiento TC nuevo) → devuelven
--      ids de propiedades que solo existen en `propiedades_v2_shadow` (8000xxx).
--   2. Las tablas de abajo tienen FK `propiedad_id` → `propiedades_v2(id)`.
--   3. Al insertar, la FK explota (23503) porque esos ids NO están en prod.
--   4. En shortlists el endpoint hace rollback manual (borra la shortlist padre) y
--      devuelve 500 → por eso NO quedan filas huérfanas y el fallo era invisible.
--
-- ALCANCE — no es solo el bot. Al 24-jul, **133 de 700 props activas del feed (19%)
-- son solo-shadow** (89 venta + 44 alquiler), y el set CRECE ~10/noche con el cron.
-- Toda superficie que guarde un `propiedad_id` del feed de Equipetrol es una mina:
--
--   · broker_shortlist_items    → armar una selección (bot Y brokers desde la web) 💥 confirmado
--   · broker_shortlist_hearts   → marcar un favorito en /b/[hash]
--   · leads_alquiler            → 🔴 lead de alquiler: el insert falla, el handler solo
--                                 loguea y sigue → el usuario ve WhatsApp normal, el lead
--                                 se PIERDE en silencio y NO se dispara el aviso a Slack
--   · leads_mvp                 → ídem para venta (propiedad_contactada)
--   · broker_property_reports   → informe de propiedad del broker
--
-- (Sin evidencia de leads perdidos todavía: 0 leads desde el 21-jul por falta de
--  tráfico. La mina existe pero no la pisó nadie — se desactiva ANTES de publicar.)
--
-- POR QUÉ SE DROPEAN LAS FK (y no se apuntan a otra tabla):
-- Hoy `propiedad_id` vive en DOS universos a la vez — prod (ZN, casas) y shadow
-- (Equipetrol, desde el lanzamiento del TC nuevo). NINGUNA FK simple es correcta:
--   · a propiedades_v2        → rompe Equipetrol (este bug),
--   · a propiedades_v2_shadow → rompería ZN/casas.
-- La integridad referencial se recupera sola en el CUTOVER, cuando prod = shadow y
-- vuelve a haber una sola tabla. Hasta entonces la FK es un candado que solo daña.
-- Se pierde el ON DELETE CASCADE (items/leads huérfanos si se borra una prop); es
-- aceptable: el render ya tolera props faltantes (shadow-first + fallback prod) y el
-- admin muestra "Propiedad <id>" cuando no la encuentra.
--
-- ⛔ NO se tocan las 6 FK internas del pipeline de prod (matching_sugerencias,
-- precios_historial, propiedades_v2_historial, sin_match_exportados,
-- propiedades_excluidas_export, duplicado_de): esas solo ven ids de prod y ahí la
-- FK es protección real.
--
-- 🔁 AL CUTOVER: reponer estas 5 FK una vez unificadas las tablas, previa limpieza
-- de filas que apunten a ids inexistentes. 🔴 Y NO RENUMERAR los ids 8000xxx: ya son
-- PÚBLICOS (viajan en el "Ref: SIM-P8000178" de WhatsApp, en los deep links
-- `?id=`, en el `#id` de las cards y en shortlists ya enviadas) — renumerarlos
-- rompería referencias que los clientes ya tienen. Anotarlo en CUTOVER_DATA_PLAN.md.
--
-- Aplicar: Supabase UI o psql. NO desde el MCP (readonly).
-- =============================================================================

BEGIN;

-- 1 · Selecciones (bot + brokers) — el bug confirmado
ALTER TABLE public.broker_shortlist_items
  DROP CONSTRAINT IF EXISTS broker_shortlist_items_propiedad_id_fkey;

-- 2 · Favoritos del cliente en /b/[hash]
ALTER TABLE public.broker_shortlist_hearts
  DROP CONSTRAINT IF EXISTS broker_shortlist_hearts_propiedad_id_fkey;

-- 3 · Leads de alquiler (el más caro: se perdían en silencio)
ALTER TABLE public.leads_alquiler
  DROP CONSTRAINT IF EXISTS leads_alquiler_propiedad_id_fkey;

-- 4 · Leads de venta
ALTER TABLE public.leads_mvp
  DROP CONSTRAINT IF EXISTS leads_mvp_propiedad_contactada_fkey;

-- 5 · Informes de propiedad del broker
ALTER TABLE public.broker_property_reports
  DROP CONSTRAINT IF EXISTS broker_property_reports_propiedad_id_fkey;

-- Documentar el porqué en la columna (queda visible para quien lo mire en 6 meses)
COMMENT ON COLUMN public.broker_shortlist_items.propiedad_id IS
  'ID de propiedad. SIN FK a propósito (mig 297): pre-cutover el id puede vivir en '
  'propiedades_v2 (ZN/casas) o en propiedades_v2_shadow (Equipetrol, TC nuevo) — '
  'ninguna FK simple cubre ambos. Reponer al cutover, sin renumerar los ids 8000xxx.';
COMMENT ON COLUMN public.leads_alquiler.propiedad_id IS
  'ID de propiedad. SIN FK a propósito (mig 297) — ver broker_shortlist_items.propiedad_id. '
  'Antes del fix, un lead sobre una prop solo-shadow fallaba y se perdía en silencio.';

COMMIT;

-- -----------------------------------------------------------------------------
-- Verificación (correr aparte)
-- -----------------------------------------------------------------------------
-- Deben quedar SOLO las 6 internas del pipeline (ninguna de las 5 de arriba):
--   SELECT c.conrelid::regclass AS tabla, c.conname
--   FROM pg_constraint c
--   WHERE c.confrelid = 'propiedades_v2'::regclass AND c.contype = 'f'
--   ORDER BY 1;
--
-- Prueba real end-to-end: pedirle una selección al bot por WhatsApp → debe devolver
-- el link /b/HASH (antes respondía "problemas técnicos").
-- -----------------------------------------------------------------------------
-- ROLLBACK (solo si hiciera falta; volvería a romper Equipetrol):
--   ALTER TABLE public.broker_shortlist_items ADD CONSTRAINT broker_shortlist_items_propiedad_id_fkey
--     FOREIGN KEY (propiedad_id) REFERENCES public.propiedades_v2(id) ON DELETE CASCADE;
--   ALTER TABLE public.broker_shortlist_hearts ADD CONSTRAINT broker_shortlist_hearts_propiedad_id_fkey
--     FOREIGN KEY (propiedad_id) REFERENCES public.propiedades_v2(id) ON DELETE CASCADE;
--   ALTER TABLE public.leads_alquiler ADD CONSTRAINT leads_alquiler_propiedad_id_fkey
--     FOREIGN KEY (propiedad_id) REFERENCES public.propiedades_v2(id);
--   ALTER TABLE public.leads_mvp ADD CONSTRAINT leads_mvp_propiedad_contactada_fkey
--     FOREIGN KEY (propiedad_contactada) REFERENCES public.propiedades_v2(id);
--   ALTER TABLE public.broker_property_reports ADD CONSTRAINT broker_property_reports_propiedad_id_fkey
--     FOREIGN KEY (propiedad_id) REFERENCES public.propiedades_v2(id) ON DELETE CASCADE;
-- =============================================================================
