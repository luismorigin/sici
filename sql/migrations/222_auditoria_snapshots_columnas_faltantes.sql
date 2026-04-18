-- ============================================================================
-- Migración 222: auditoria_snapshots — columnas faltantes
-- Fecha: 2026-04-18
-- ============================================================================
-- Alinea la tabla auditoria_snapshots con lo que el workflow de Auditoría
-- Diaria SICI ya calcula en el snapshot JSON pero no persiste (alquiler,
-- LLM venta, proyectos desarrollador, casas/terrenos).
--
-- Total: 22 columnas nuevas (todas IF NOT EXISTS para idempotencia).
-- ============================================================================

-- ============================================================================
-- Alquiler (8 columnas)
-- ============================================================================
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS alq_completadas INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS alq_creadas_24h INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS alq_llm_enriched INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS alq_matcheadas INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS discovery_alquiler_ok BOOLEAN DEFAULT false;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS enrichment_alquiler_ok BOOLEAN DEFAULT false;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS merge_alquiler_ok BOOLEAN DEFAULT false;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS verificador_alquiler_ok BOOLEAN DEFAULT false;

-- ============================================================================
-- LLM Enrichment Venta (4 columnas)
-- ============================================================================
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS llm_enriched_venta INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS llm_pendientes_venta INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS horas_sin_enrichment_llm NUMERIC(10,2) DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS enrichment_llm_ok BOOLEAN DEFAULT false;

-- ============================================================================
-- Calidad extendida (2 columnas)
-- ============================================================================
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS sin_precio INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS pct_huerfanas NUMERIC(6,2) DEFAULT 0;

-- ============================================================================
-- Proyectos con/sin desarrollador (3 columnas)
-- ============================================================================
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS proy_con_desarrollador INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS proy_sin_desarrollador INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS pct_sin_desarrollador NUMERIC(6,2) DEFAULT 0;

-- ============================================================================
-- Casas/Terrenos v3.1 (5 columnas)
-- ============================================================================
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS ct_completadas INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS ct_creadas_24h INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS ct_excluida_zona INTEGER DEFAULT 0;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS discovery_casas_terrenos_ok BOOLEAN DEFAULT false;
ALTER TABLE auditoria_snapshots ADD COLUMN IF NOT EXISTS enrichment_casas_terrenos_ok BOOLEAN DEFAULT false;

-- ============================================================================
-- Comments para documentar origen
-- ============================================================================
COMMENT ON COLUMN auditoria_snapshots.alq_completadas IS 'Pipeline alquiler — props completadas';
COMMENT ON COLUMN auditoria_snapshots.llm_enriched_venta IS 'LLM Enrichment Venta — props con llm_output';
COMMENT ON COLUMN auditoria_snapshots.ct_completadas IS 'Casas/Terrenos — props status=completado dentro Equipetrol';
COMMENT ON COLUMN auditoria_snapshots.ct_excluida_zona IS 'Casas/Terrenos — props marcadas excluida_zona por LLM (GPS portal falso)';
