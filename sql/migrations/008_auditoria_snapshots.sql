-- =====================================================
-- MIGRACIÓN 008: auditoria_snapshots
-- =====================================================
-- Fecha: 30 Diciembre 2025
-- Propósito: Almacenar snapshots diarios para análisis de tendencias
-- =====================================================

CREATE TABLE IF NOT EXISTS auditoria_snapshots (
    id SERIAL PRIMARY KEY,
    fecha DATE NOT NULL UNIQUE,

    -- Propiedades
    props_total INTEGER NOT NULL,
    props_completadas INTEGER NOT NULL,
    props_nuevas INTEGER NOT NULL,
    props_nuevas_venta INTEGER NOT NULL,
    props_inactivas INTEGER DEFAULT 0,
    props_matcheadas INTEGER NOT NULL,
    props_sin_match INTEGER NOT NULL,
    props_con_nombre INTEGER NOT NULL,
    props_con_zona INTEGER DEFAULT 0,
    props_creadas_24h INTEGER DEFAULT 0,
    props_enriquecidas_24h INTEGER DEFAULT 0,
    pct_match_completadas NUMERIC(5,2),
    pct_nombre_completadas NUMERIC(5,2),

    -- Matching
    match_total INTEGER NOT NULL,
    match_24h INTEGER DEFAULT 0,
    match_aprobadas_24h INTEGER DEFAULT 0,
    match_rechazadas_24h INTEGER DEFAULT 0,
    match_pendientes INTEGER DEFAULT 0,
    tasa_aprobacion_24h NUMERIC(5,2),

    -- Proyectos
    proy_total INTEGER NOT NULL,
    proy_activos INTEGER NOT NULL,
    proy_gps_verificado INTEGER NOT NULL,
    proy_con_place_id INTEGER DEFAULT 0,
    proy_pendientes_google INTEGER DEFAULT 0,
    pct_gps_verificado NUMERIC(5,2),

    -- Health
    horas_sin_enrichment NUMERIC(5,1),
    horas_sin_merge NUMERIC(5,1),
    matching_nocturno_ok BOOLEAN DEFAULT FALSE,

    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índice para queries por rango de fechas
CREATE INDEX idx_auditoria_fecha ON auditoria_snapshots(fecha DESC);

-- Comentario
COMMENT ON TABLE auditoria_snapshots IS
'Snapshots diarios de métricas SICI para análisis de tendencias.
Poblado por workflow Auditoría Diaria a las 9 AM.';
