-- ============================================================================
-- Migración 154: Tabla leads_alquiler para tracking de contactos WhatsApp
-- ============================================================================
-- Registra cada click de WhatsApp desde la plataforma de alquileres.
-- Permite medir: leads por broker, por propiedad, por mes.
-- Base para monetización: demostrar valor al broker antes de cobrar.
-- ============================================================================

CREATE TABLE IF NOT EXISTS leads_alquiler (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER REFERENCES propiedades_v2(id),
    nombre_propiedad TEXT,
    zona TEXT,
    precio_bob NUMERIC,
    dormitorios INTEGER,
    broker_telefono TEXT NOT NULL,
    broker_nombre TEXT,
    fuente TEXT NOT NULL DEFAULT 'card',  -- 'comparativo', 'card_mobile', 'card_desktop', 'bottom_sheet'
    preguntas_enviadas TEXT[],            -- preguntas seleccionadas del comparativo
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries de monetización
CREATE INDEX IF NOT EXISTS idx_leads_alq_broker ON leads_alquiler(broker_telefono);
CREATE INDEX IF NOT EXISTS idx_leads_alq_created ON leads_alquiler(created_at);
CREATE INDEX IF NOT EXISTS idx_leads_alq_propiedad ON leads_alquiler(propiedad_id);

-- Permisos para la API (anon puede insertar leads)
GRANT INSERT ON leads_alquiler TO anon;
GRANT USAGE, SELECT ON SEQUENCE leads_alquiler_id_seq TO anon;
-- Admin puede leer todo
GRANT SELECT ON leads_alquiler TO authenticated;

DO $$
BEGIN
    RAISE NOTICE 'Migración 154: Tabla leads_alquiler para tracking monetización';
END $$;
