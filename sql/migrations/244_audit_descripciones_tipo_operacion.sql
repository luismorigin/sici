-- =====================================================
-- Migración 244: tipo_operacion en audit_descripciones
-- Fecha: 2026-05-10
-- Autor: Luis - SICI
-- =====================================================
-- CONTEXTO:
-- Habilitar audit mensual para feed /alquileres reusando las tablas existentes
-- de la migración 242. Agregamos columna `tipo_operacion` ('venta' | 'alquiler')
-- en runs e items, default 'venta' para preservar el histórico.
--
-- La nueva skill `/audit-feed-alquileres-mensual` escribirá tipo_operacion='alquiler';
-- la skill existente `/audit-feed-ventas-mensual` debe escribir 'venta' explícito
-- después de esta migración (ya queda documentado en su .command.md).
--
-- La view `audit_descripciones_tendencias` se actualiza para agrupar por mes Y
-- tipo_operacion → permite comparar drift de venta vs alquiler en el tiempo.
-- =====================================================

-- =====================================================
-- ALTER TABLES — agregar tipo_operacion
-- =====================================================
ALTER TABLE audit_descripciones_runs
  ADD COLUMN IF NOT EXISTS tipo_operacion TEXT NOT NULL DEFAULT 'venta'
    CHECK (tipo_operacion IN ('venta', 'alquiler'));

ALTER TABLE audit_descripciones_items
  ADD COLUMN IF NOT EXISTS tipo_operacion TEXT NOT NULL DEFAULT 'venta'
    CHECK (tipo_operacion IN ('venta', 'alquiler'));

CREATE INDEX IF NOT EXISTS idx_audit_runs_tipo_operacion
  ON audit_descripciones_runs(tipo_operacion, run_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_items_tipo_operacion
  ON audit_descripciones_items(tipo_operacion);

COMMENT ON COLUMN audit_descripciones_runs.tipo_operacion IS
  'venta | alquiler — qué feed se auditó (default venta por compatibilidad histórica)';

COMMENT ON COLUMN audit_descripciones_items.tipo_operacion IS
  'venta | alquiler — denormalizado del run para queries directos sin join';

-- =====================================================
-- VIEW de tendencias — agregar dimensión tipo_operacion
-- NOTA: CREATE OR REPLACE VIEW no permite reordenar columnas, solo agregarlas
-- al final. Como insertamos `tipo_operacion` entre `mes` y `corridas_en_mes`,
-- hay que DROP + CREATE.
-- =====================================================
DROP VIEW IF EXISTS audit_descripciones_tendencias;

CREATE VIEW audit_descripciones_tendencias AS
SELECT
  DATE_TRUNC('month', run_at) AS mes,
  tipo_operacion,
  COUNT(*) AS corridas_en_mes,
  AVG(total_props) AS props_promedio,
  AVG((summary_stats->>'reescritas')::int) AS reescritas_promedio,
  AVG((summary_stats->>'drift_relevante')::int) AS drift_relevante_promedio,
  AVG((summary_stats->>'listings_muertos')::int) AS muertos_promedio,
  SUM(costo_firecrawl) AS costo_total
FROM audit_descripciones_runs
WHERE modo = 'normal'
GROUP BY DATE_TRUNC('month', run_at), tipo_operacion
ORDER BY mes DESC, tipo_operacion;

COMMENT ON VIEW audit_descripciones_tendencias IS
  'Resumen agregado por mes Y tipo_operacion — útil para detectar si venta o alquiler va mejorando o empeorando';

GRANT SELECT ON audit_descripciones_tendencias TO claude_readonly;

-- =====================================================
-- Verificación post-migración
-- =====================================================
DO $$
DECLARE
  col_exists_runs BOOLEAN;
  col_exists_items BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_descripciones_runs' AND column_name = 'tipo_operacion'
  ) INTO col_exists_runs;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'audit_descripciones_items' AND column_name = 'tipo_operacion'
  ) INTO col_exists_items;

  IF NOT col_exists_runs OR NOT col_exists_items THEN
    RAISE EXCEPTION 'Migración 244 falló: columna tipo_operacion no creada (runs=%, items=%)',
      col_exists_runs, col_exists_items;
  END IF;
  RAISE NOTICE 'Migración 244 OK — tipo_operacion agregada a runs e items, view actualizada';
END $$;
