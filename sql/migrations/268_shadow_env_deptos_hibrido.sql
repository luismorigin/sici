-- =============================================================================
-- Migración 268 — ENTORNO SHADOW para el híbrido de deptos (aislado de producción)
-- =============================================================================
-- Propósito: crear una copia PARALELA y AISLADA donde el híbrido pueda hacer una
-- corrida completa (write real + matching + normalización + render) SIN tocar el
-- feed de producción. Nada de lo que se escribe acá lo lee el feed público.
--
-- Contiene:
--   1. propiedades_v2_shadow  — copia estructural EXACTA de propiedades_v2 (todas
--      las columnas/tipos/defaults/constraints/índices vía LIKE INCLUDING ALL).
--   2. config_global_shadow   — TC shadow SEPARADO (paralelo + oficial), para que
--      el Binance del híbrido escriba acá (seguro) y para simular la transición.
--   3. precio_normalizado_shadow() — normalización que lee el TC shadow (no el real).
--
-- Aislamiento: preset "operacional interna" (service_role ALL + claude_readonly
--   SELECT, SIN anon/authenticated) → el Data API público NO ve estas tablas.
--
-- ⚠️ Aplicar vía Supabase UI o psql (NO desde MCP, que es readonly).
-- Rollback al final (comentado). Registrar en docs/migrations/MIGRATION_INDEX.md.
-- Relacionado: scripts/deptos-equipetrol/ESTADO_MIGRACION.md · CONTRATO_FEED.md
-- Las vistas/RPC shadow (v_mercado_venta_shadow, buscar_unidades_simple_shadow)
-- van en una migración POSTERIOR (269), tras cargar datos (requieren adaptar las
-- definiciones reales apuntando a la tabla shadow + precio_normalizado_shadow).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. TABLA SHADOW — copia estructural exacta de propiedades_v2
-- -----------------------------------------------------------------------------
-- LIKE ... INCLUDING ALL copia: columnas, tipos, defaults, NOT NULL, CHECK,
-- índices y la PRIMARY KEY. NO copia: foreign keys, triggers ni RLS (a propósito
-- — el shadow no necesita FK ni el trigger de zona; el cargador setea id_proyecto
-- _master, zona y microzona directo).
CREATE TABLE IF NOT EXISTS public.propiedades_v2_shadow (
  LIKE public.propiedades_v2 INCLUDING ALL
);

-- El shadow guarda cada depto con el MISMO id que producción (para comparar fila
-- a fila). Quitamos el default del id para que el cargador lo especifique explícito
-- y NO comparta/consuma la secuencia de la tabla real. (No-op si id no tenía default.)
ALTER TABLE public.propiedades_v2_shadow ALTER COLUMN id DROP DEFAULT;

COMMENT ON TABLE public.propiedades_v2_shadow IS
  'Copia AISLADA de propiedades_v2 para la corrida shadow del híbrido de deptos '
  '(migración 268). Ningún feed público la lee. Cargador: service_role. '
  'Se compara vs propiedades_v2 real por id. Dueño: híbrido deptos.';

-- GRANTs — preset "operacional interna" (aislada, NO pública)
GRANT ALL    ON public.propiedades_v2_shadow TO service_role;
GRANT SELECT ON public.propiedades_v2_shadow TO claude_readonly;
-- (deliberadamente SIN anon / authenticated → invisible al Data API público)

-- -----------------------------------------------------------------------------
-- 2. TC SHADOW SEPARADO — config aislada (no toca config_global de producción)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.config_global_shadow (
  clave               TEXT PRIMARY KEY,
  valor               TEXT NOT NULL,
  descripcion         TEXT,
  actualizado_por     TEXT,
  fecha_actualizacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.config_global_shadow IS
  'TC shadow para el entorno híbrido (migración 268). El Binance del híbrido '
  'escribe acá (--shadow), no en config_global real. También sirve para simular '
  'la transición del oficial. Lo lee precio_normalizado_shadow().';

-- Semilla con los valores actuales (se pueden mover para simular la transición)
INSERT INTO public.config_global_shadow (clave, valor, descripcion, actualizado_por) VALUES
  ('tipo_cambio_paralelo', '9.97', 'TC paralelo shadow (Binance P2P)', 'seed_268'),
  ('tipo_cambio_oficial',  '6.96', 'TC oficial shadow (BCB) — mover para simular unificación', 'seed_268')
ON CONFLICT (clave) DO NOTHING;

GRANT ALL    ON public.config_global_shadow TO service_role;
GRANT SELECT ON public.config_global_shadow TO claude_readonly;

-- -----------------------------------------------------------------------------
-- 3. NORMALIZACIÓN SHADOW — lee el TC shadow (paralelo Y oficial)
-- -----------------------------------------------------------------------------
-- Espeja precio_normalizado() pero: (a) lee config_global_shadow, y (b) usa el
-- oficial shadow como divisor (en vez del 6.96 hardcodeado) → así podemos simular
-- la unificación del oficial moviendo un valor, sin tocar producción.
CREATE OR REPLACE FUNCTION public.precio_normalizado_shadow(p_precio_usd numeric, p_tipo_cambio_detectado text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'paralelo' THEN
      ROUND(
        p_precio_usd
        * (SELECT valor::numeric FROM public.config_global_shadow WHERE clave = 'tipo_cambio_paralelo')
        / NULLIF((SELECT valor::numeric FROM public.config_global_shadow WHERE clave = 'tipo_cambio_oficial'), 0),
        2)
    ELSE p_precio_usd
  END;
$function$;

COMMENT ON FUNCTION public.precio_normalizado_shadow(numeric, text) IS
  'Normalización shadow (migración 268): igual que precio_normalizado() pero lee '
  'config_global_shadow y usa el oficial shadow como divisor (simula la transición).';

GRANT EXECUTE ON FUNCTION public.precio_normalizado_shadow(numeric, text) TO service_role, claude_readonly;

COMMIT;

-- =============================================================================
-- ROLLBACK (ejecutar si hay que deshacer — borra TODO el entorno shadow):
-- =============================================================================
-- BEGIN;
--   DROP FUNCTION IF EXISTS public.precio_normalizado_shadow(numeric, text);
--   DROP TABLE IF EXISTS public.config_global_shadow;
--   DROP TABLE IF EXISTS public.propiedades_v2_shadow;
-- COMMIT;
-- =============================================================================
