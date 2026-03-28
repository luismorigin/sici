-- Migración 188: Tabla temporal para testing LLM enrichment ventas
-- Rama: feature/llm-enrichment-ventas
-- NUNCA escribe en propiedades_v2 — solo almacena resultados de comparación

CREATE TABLE IF NOT EXISTS llm_enrichment_test_results (
    id SERIAL PRIMARY KEY,
    id_propiedad INTEGER NOT NULL REFERENCES propiedades_v2(id),
    campo TEXT NOT NULL,
    valor_actual_bd TEXT,
    valor_llm TEXT,
    confianza_llm TEXT,  -- 'alta', 'media', 'baja', NULL
    portal TEXT,          -- 'century21', 'remax'
    iteracion TEXT NOT NULL, -- 'v1.0-test-2026-03-10'
    veredicto TEXT,       -- 'igual', 'llm_agrega', 'llm_no_detecta', 'llm_difiere'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_llm_test_iteracion ON llm_enrichment_test_results(iteracion);
CREATE INDEX idx_llm_test_campo ON llm_enrichment_test_results(campo);
CREATE INDEX idx_llm_test_propiedad ON llm_enrichment_test_results(id_propiedad);

COMMENT ON TABLE llm_enrichment_test_results IS 'Tabla temporal para comparar LLM enrichment vs regex actual. Feature branch only.';
