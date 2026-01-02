-- Migración 013: Tabla para tracking de ejecuciones de workflows
-- Fecha: 2 Enero 2026
-- Propósito: Detectar si los workflows corrieron (independiente de si generaron datos)

-- Crear tabla
CREATE TABLE IF NOT EXISTS workflow_executions (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(100) NOT NULL,
    workflow_version VARCHAR(20),
    status VARCHAR(20) DEFAULT 'success',  -- success, error, partial, running
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ DEFAULT NOW(),
    duration_seconds INTEGER,
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_errors INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_workflow_executions_name
    ON workflow_executions(workflow_name);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_finished
    ON workflow_executions(finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_name_finished
    ON workflow_executions(workflow_name, finished_at DESC);

-- Comentario
COMMENT ON TABLE workflow_executions IS 'Registro de ejecuciones de workflows n8n para tracking en auditoría';

-- Función helper para registrar ejecución (opcional, se puede usar INSERT directo)
CREATE OR REPLACE FUNCTION registrar_ejecucion_workflow(
    p_workflow_name VARCHAR(100),
    p_status VARCHAR(20) DEFAULT 'success',
    p_records_processed INTEGER DEFAULT 0,
    p_records_created INTEGER DEFAULT 0,
    p_records_updated INTEGER DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_id INTEGER;
BEGIN
    INSERT INTO workflow_executions (
        workflow_name,
        status,
        finished_at,
        records_processed,
        records_created,
        records_updated,
        error_message,
        metadata
    ) VALUES (
        p_workflow_name,
        p_status,
        NOW(),
        p_records_processed,
        p_records_created,
        p_records_updated,
        p_error_message,
        p_metadata
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Grants para el usuario de n8n (ajustar según tu configuración)
-- GRANT INSERT, SELECT ON workflow_executions TO tu_usuario_n8n;
-- GRANT USAGE, SELECT ON SEQUENCE workflow_executions_id_seq TO tu_usuario_n8n;
