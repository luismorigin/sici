-- =====================================================
-- Migración 242: Persistencia de auditorías de descripciones
-- Fecha: 2026-05-08
-- Autor: Luis - SICI
-- =====================================================
-- CONTEXTO:
-- Audit mensual de drift entre descripciones guardadas en BD vs portal.
-- Persiste resultados de las 3 capas (Firecrawl drift + audit interno SQL +
-- audit matching) para análisis de tendencias mes a mes y eventual dashboard
-- en /admin/auditoria.
--
-- Storage estimado: ~8MB/año (12 audits × 350 props × ~2kb por descripción)
--
-- SEGURIDAD: tablas nuevas con RLS habilitado. Solo claude_readonly tiene
-- SELECT (para que MCP postgres-sici pueda consultarlas). Inserts vía
-- service_role bypassean RLS.
-- =====================================================

-- =====================================================
-- TABLA: audit_descripciones_runs (1 fila por corrida)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_descripciones_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_props INT NOT NULL,
  scrape_ok INT NOT NULL DEFAULT 0,
  scrape_failed INT NOT NULL DEFAULT 0,
  summary_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  costo_firecrawl NUMERIC(10, 4),
  modo TEXT NOT NULL DEFAULT 'normal' CHECK (modo IN ('normal', 'cached', 'partial')),
  cached_run_dir TEXT,
  notas TEXT,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_runs_run_at ON audit_descripciones_runs(run_at DESC);

COMMENT ON TABLE audit_descripciones_runs IS
'Una fila por corrida del audit mensual. summary_stats contiene conteos por bucket: { reescritas, cambio_relevante, cambio_menor, identicas, listings_muertos, ... }';

COMMENT ON COLUMN audit_descripciones_runs.modo IS
'normal=corrida con Firecrawl, cached=re-procesada de un run previo, partial=solo subset de props';

-- =====================================================
-- TABLA: audit_descripciones_items (1 fila por prop por corrida)
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_descripciones_items (
  id BIGSERIAL PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES audit_descripciones_runs(id) ON DELETE CASCADE,
  prop_id INT NOT NULL,
  fuente TEXT NOT NULL,
  url TEXT,
  -- Capa 1: drift Firecrawl
  bucket TEXT,
  similitud_pct NUMERIC(5, 2),
  descripcion_bd_snapshot TEXT,
  descripcion_scraped TEXT,
  title_scraped TEXT,
  flags_semanticos JSONB DEFAULT '{}'::jsonb,
  palabras_agregadas JSONB DEFAULT '[]'::jsonb,
  palabras_quitadas JSONB DEFAULT '[]'::jsonb,
  scrape_status TEXT,
  -- Capa 2: inconsistencias internas
  inconsistencias_internas JSONB DEFAULT '[]'::jsonb,
  severidad_max TEXT CHECK (severidad_max IN ('alta', 'media', 'baja') OR severidad_max IS NULL),
  -- Capa 3: audit matching
  matching_check TEXT CHECK (matching_check IN ('ok', 'no_disponible', 'mismatch_real', 'falta_en_bd') OR matching_check IS NULL),
  matching_detalle JSONB,
  -- Acción
  accionado BOOLEAN NOT NULL DEFAULT false,
  accion_tomada TEXT,
  fecha_accion TIMESTAMPTZ,
  fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_items_run ON audit_descripciones_items(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_items_prop ON audit_descripciones_items(prop_id);
CREATE INDEX IF NOT EXISTS idx_audit_items_bucket ON audit_descripciones_items(bucket) WHERE bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_items_severidad ON audit_descripciones_items(severidad_max) WHERE severidad_max IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_items_accionado ON audit_descripciones_items(accionado) WHERE accionado = false;

COMMENT ON TABLE audit_descripciones_items IS
'Una fila por prop por corrida de audit. Permite queries históricos cruzados: drift recurrente, tendencias por edificio, etc.';

-- =====================================================
-- RLS — habilitar y crear policies
-- =====================================================
ALTER TABLE audit_descripciones_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_descripciones_items ENABLE ROW LEVEL SECURITY;

-- claude_readonly (MCP postgres-sici): SELECT a ambas tablas
CREATE POLICY audit_runs_select_readonly ON audit_descripciones_runs
  FOR SELECT TO claude_readonly USING (true);

CREATE POLICY audit_items_select_readonly ON audit_descripciones_items
  FOR SELECT TO claude_readonly USING (true);

-- service_role bypasses RLS automáticamente (no hace falta policy)
-- anon NO tiene policy → no puede leer ni escribir (correcto)

-- =====================================================
-- VIEW de tendencias mensuales (helper para queries)
-- =====================================================
CREATE OR REPLACE VIEW audit_descripciones_tendencias AS
SELECT
  DATE_TRUNC('month', run_at) AS mes,
  COUNT(*) AS corridas_en_mes,
  AVG(total_props) AS props_promedio,
  AVG((summary_stats->>'reescritas')::int) AS reescritas_promedio,
  AVG((summary_stats->>'drift_relevante')::int) AS drift_relevante_promedio,
  AVG((summary_stats->>'listings_muertos')::int) AS muertos_promedio,
  SUM(costo_firecrawl) AS costo_total
FROM audit_descripciones_runs
WHERE modo = 'normal'
GROUP BY DATE_TRUNC('month', run_at)
ORDER BY mes DESC;

COMMENT ON VIEW audit_descripciones_tendencias IS
'Resumen agregado por mes — útil para detectar si el feed va mejorando o empeorando';

GRANT SELECT ON audit_descripciones_tendencias TO claude_readonly;

-- =====================================================
-- Verificación post-migración
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_descripciones_runs') THEN
    RAISE EXCEPTION 'Migración 242 falló: tabla audit_descripciones_runs no creada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'audit_descripciones_items') THEN
    RAISE EXCEPTION 'Migración 242 falló: tabla audit_descripciones_items no creada';
  END IF;
  RAISE NOTICE 'Migración 242 OK — tablas audit_descripciones_runs + audit_descripciones_items creadas con RLS';
END $$;
