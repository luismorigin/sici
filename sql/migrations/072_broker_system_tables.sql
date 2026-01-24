-- =====================================================
-- MIGRACION 072: Sistema Broker - Tablas Base
-- Fecha: 23 Enero 2026
-- Proposito: Crear infraestructura para brokers sin tocar propiedades_v2
-- =====================================================
-- SEGURIDAD: Todo es ADITIVO - no modifica tablas existentes
-- Rollback: DROP TABLE en orden inverso
-- =====================================================

-- =====================================================
-- FUNCION AUXILIAR: Trigger updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TABLA 1: brokers
-- Perfil del broker, autenticacion y creditos
-- =====================================================
CREATE TABLE IF NOT EXISTS brokers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Autenticacion
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT, -- NULL si usa magic link
    email_verificado BOOLEAN DEFAULT false,
    magic_link_token TEXT,
    magic_link_expires TIMESTAMPTZ,

    -- Perfil
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    whatsapp TEXT,
    empresa TEXT,
    licencia TEXT, -- CADECO u otra
    foto_url TEXT,
    logo_url TEXT,

    -- Creditos y Programa
    cma_creditos INTEGER DEFAULT 0,
    propiedades_perfectas INTEGER DEFAULT 0, -- contador para incentivo
    es_founding_broker BOOLEAN DEFAULT false,
    tier TEXT DEFAULT 'standard', -- beta, founding, standard
    badge TEXT, -- 'founding_broker', etc

    -- Metadata
    fecha_registro TIMESTAMPTZ DEFAULT NOW(),
    ultimo_login TIMESTAMPTZ,
    activo BOOLEAN DEFAULT true,

    -- Estadisticas
    total_propiedades INTEGER DEFAULT 0,
    total_leads INTEGER DEFAULT 0,
    total_cierres INTEGER DEFAULT 0,

    -- Constraints
    CONSTRAINT brokers_email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT brokers_telefono_format CHECK (telefono ~ '^[0-9]{7,15}$')
);

-- Indices para brokers
CREATE INDEX IF NOT EXISTS idx_brokers_email ON brokers(email);
CREATE INDEX IF NOT EXISTS idx_brokers_activo ON brokers(activo) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_brokers_tier ON brokers(tier);

COMMENT ON TABLE brokers IS 'Perfiles de brokers registrados en Simon. Sistema B2B gratuito con incentivos.';

-- =====================================================
-- TABLA 2: codigos_unicos
-- Control de codigos SIM-XXXXX, REF-XXXXX, etc
-- =====================================================
CREATE TABLE IF NOT EXISTS codigos_unicos (
    codigo TEXT PRIMARY KEY,
    tipo TEXT NOT NULL, -- SIM (propiedad), REF (lead), CMA
    entidad_id INTEGER, -- ID de la propiedad o lead
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codigos_tipo ON codigos_unicos(tipo);

COMMENT ON TABLE codigos_unicos IS 'Control de unicidad para codigos SIM-XXXXX (propiedades) y REF-XXXXX (leads).';

-- =====================================================
-- FUNCION: Generar Codigo Unico
-- =====================================================
CREATE OR REPLACE FUNCTION generar_codigo_unico(prefijo TEXT)
RETURNS TEXT AS $$
DECLARE
    nuevo_codigo TEXT;
    caracteres TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Sin 0,O,1,I,L (confusos)
    i INTEGER;
BEGIN
    LOOP
        nuevo_codigo := prefijo || '-';
        FOR i IN 1..5 LOOP
            nuevo_codigo := nuevo_codigo || substr(caracteres, floor(random() * length(caracteres) + 1)::int, 1);
        END LOOP;

        -- Verificar unicidad
        IF NOT EXISTS (SELECT 1 FROM codigos_unicos WHERE codigo = nuevo_codigo) THEN
            EXIT;
        END IF;
    END LOOP;

    RETURN nuevo_codigo;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generar_codigo_unico IS 'Genera codigo unico tipo SIM-7K2M9. Excluye caracteres confusos (0/O, 1/I/L).';

-- =====================================================
-- TABLA 3: propiedades_broker
-- Propiedades cargadas por brokers
-- =====================================================
CREATE TABLE IF NOT EXISTS propiedades_broker (
    id SERIAL PRIMARY KEY,

    -- Relacion
    broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,

    -- Codigo unico
    codigo TEXT UNIQUE NOT NULL, -- SIM-XXXXX

    -- Fuente de origen (import por link)
    fuente_origen TEXT, -- c21, remax, bieninmuebles, manual
    url_origen TEXT, -- https://c21.com.bo/propiedad/12345
    fecha_import TIMESTAMPTZ, -- cuando se importo

    -- CATEGORIA 1: Datos Basicos (20 pts)
    precio_usd DECIMAL(12,2) NOT NULL,
    area_m2 DECIMAL(8,2) NOT NULL,
    dormitorios INTEGER NOT NULL CHECK (dormitorios >= 0 AND dormitorios <= 10),
    banos DECIMAL(3,1) NOT NULL CHECK (banos >= 1 AND banos <= 10),
    zona TEXT NOT NULL,
    piso INTEGER,
    orientacion TEXT, -- norte, sur, este, oeste
    vista TEXT, -- ciudad, jardin, calle, interior

    -- CATEGORIA 2: Ubicacion (15 pts)
    proyecto_nombre TEXT NOT NULL,
    id_proyecto_master INTEGER REFERENCES proyectos_master(id_proyecto_master), -- FK opcional
    direccion TEXT NOT NULL,
    latitud DECIMAL(10,7),
    longitud DECIMAL(10,7),
    id_microzona INTEGER REFERENCES zonas_geograficas(id), -- FK a microzonas
    microzona TEXT, -- cache del nombre para queries rapidos
    geocoded_address TEXT, -- direccion normalizada

    -- CATEGORIA 3: Fotos (20 pts)
    cantidad_fotos INTEGER DEFAULT 0,
    fotos_hash TEXT[], -- hashes para detectar duplicados

    -- CATEGORIA 4: Amenidades (estructura compatible con propiedades_v2)
    amenidades JSONB DEFAULT '{"lista": [], "equipamiento": [], "estado_amenities": {}}',
    /*
    Estructura:
    {
        "lista": ["Piscina", "Gimnasio", "Seguridad 24/7", ...],
        "equipamiento": ["Cocina Equipada", "Aire Acondicionado", ...],
        "estado_amenities": {
            "Piscina": {"valor": true, "fuente": "broker", "confianza": "alta"},
            ...
        }
    }
    */

    -- CATEGORIA 5: Financiero (15 pts)
    expensas_usd DECIMAL(8,2),
    parqueo_incluido BOOLEAN DEFAULT false,
    cantidad_parqueos INTEGER DEFAULT 0,
    baulera_incluida BOOLEAN DEFAULT false,
    precio_parqueo_extra DECIMAL(10,2),
    precio_baulera_extra DECIMAL(10,2),
    acepta_financiamiento BOOLEAN DEFAULT false,
    acepta_permuta BOOLEAN DEFAULT false,
    precio_negociable BOOLEAN DEFAULT true,
    descuento_contado DECIMAL(4,2), -- porcentaje

    -- CATEGORIA 6: Estado y Entrega (15 pts)
    estado_construccion estado_construccion_enum NOT NULL DEFAULT 'no_especificado',
    fecha_entrega DATE, -- si no terminado
    antiguedad_anos INTEGER,
    estado_unidad TEXT, -- nuevo, excelente, bueno, a_remodelar
    tipo_operacion tipo_operacion_enum NOT NULL DEFAULT 'venta',
    disponibilidad TEXT, -- inmediata, 30_dias, 60_dias, segun_obra
    escritura_lista BOOLEAN,

    -- Documentacion (bonus)
    tiene_planos BOOLEAN DEFAULT false,
    plano_url TEXT,
    desarrollador TEXT,
    descripcion TEXT,

    -- Sistema de Calidad
    score_calidad INTEGER DEFAULT 0, -- 0-100
    score_desglose JSONB DEFAULT '{}',
    es_calidad_perfecta BOOLEAN DEFAULT false,

    -- Estado de publicacion
    estado TEXT DEFAULT 'borrador', -- borrador, en_revision, publicada, pausada, vendida, rechazada
    motivo_rechazo TEXT,
    fecha_publicacion TIMESTAMPTZ,
    fecha_venta TIMESTAMPTZ,

    -- Estadisticas
    vistas INTEGER DEFAULT 0,
    contactos INTEGER DEFAULT 0,
    guardados INTEGER DEFAULT 0, -- favoritos

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT propiedades_broker_precio_positivo CHECK (precio_usd > 0),
    CONSTRAINT propiedades_broker_area_positiva CHECK (area_m2 > 0),
    CONSTRAINT propiedades_broker_score_rango CHECK (score_calidad >= 0 AND score_calidad <= 100)
);

-- Indices para propiedades_broker
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_broker ON propiedades_broker(broker_id);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_codigo ON propiedades_broker(codigo);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_estado ON propiedades_broker(estado);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_zona ON propiedades_broker(zona);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_precio ON propiedades_broker(precio_usd);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_dorms ON propiedades_broker(dormitorios);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_score ON propiedades_broker(score_calidad);
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_publicada ON propiedades_broker(estado) WHERE estado = 'publicada';
CREATE INDEX IF NOT EXISTS idx_propiedades_broker_fuente ON propiedades_broker(fuente_origen);

-- Trigger updated_at
CREATE TRIGGER update_propiedades_broker_timestamp
    BEFORE UPDATE ON propiedades_broker
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE propiedades_broker IS 'Propiedades cargadas por brokers. Separada de propiedades_v2 (scraping).';

-- =====================================================
-- TABLA 4: propiedad_fotos
-- Fotos de propiedades con deteccion de watermarks
-- =====================================================
CREATE TABLE IF NOT EXISTS propiedad_fotos (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_broker(id) ON DELETE CASCADE,

    -- Foto
    url TEXT NOT NULL,
    thumbnail_url TEXT,
    orden INTEGER DEFAULT 0,
    es_principal BOOLEAN DEFAULT false,

    -- Metadata
    tipo TEXT, -- fachada, living, cocina, dormitorio, bano, vista, amenidades, plano
    hash TEXT NOT NULL, -- para detectar duplicados
    tamano_bytes INTEGER,
    width INTEGER,
    height INTEGER,

    -- Deteccion de watermarks
    tiene_watermark BOOLEAN DEFAULT false,
    watermark_detectado TEXT, -- c21, remax, otro
    watermark_confianza DECIMAL(3,2), -- 0.00-1.00

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para propiedad_fotos
CREATE INDEX IF NOT EXISTS idx_propiedad_fotos_propiedad ON propiedad_fotos(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_propiedad_fotos_hash ON propiedad_fotos(hash);
CREATE INDEX IF NOT EXISTS idx_propiedad_fotos_orden ON propiedad_fotos(propiedad_id, orden);
CREATE INDEX IF NOT EXISTS idx_propiedad_fotos_watermark ON propiedad_fotos(tiene_watermark) WHERE tiene_watermark = true;

COMMENT ON TABLE propiedad_fotos IS 'Fotos de propiedades broker. Hash para detectar duplicados, flag para watermarks.';

-- =====================================================
-- TABLA 5: propiedad_pdfs
-- PDFs auto-generados para compartir
-- =====================================================
CREATE TABLE IF NOT EXISTS propiedad_pdfs (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_broker(id) ON DELETE CASCADE,

    -- Archivo
    url TEXT NOT NULL, -- URL en storage
    tamano_bytes INTEGER,
    version INTEGER DEFAULT 1, -- si se regenera

    -- QR code
    qr_url TEXT, -- URL de la imagen QR
    short_link TEXT, -- simon.bo/p/SIM-XXXXX

    -- Estadisticas
    descargas INTEGER DEFAULT 0,
    compartidos_whatsapp INTEGER DEFAULT 0,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para propiedad_pdfs
CREATE INDEX IF NOT EXISTS idx_propiedad_pdfs_propiedad ON propiedad_pdfs(propiedad_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_propiedad_pdfs_version ON propiedad_pdfs(propiedad_id, version);

-- Trigger updated_at
CREATE TRIGGER update_propiedad_pdfs_timestamp
    BEFORE UPDATE ON propiedad_pdfs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE propiedad_pdfs IS 'PDFs auto-generados al publicar. QR code a simon.bo/p/SIM-XXXXX.';

-- =====================================================
-- TABLA 6: broker_leads
-- Contactos recibidos por broker
-- =====================================================
CREATE TABLE IF NOT EXISTS broker_leads (
    id SERIAL PRIMARY KEY,

    -- Relaciones
    broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_broker(id) ON DELETE CASCADE,

    -- Codigo de referencia
    codigo_ref TEXT UNIQUE NOT NULL, -- REF-XXXXX

    -- Datos del lead
    nombre TEXT NOT NULL,
    telefono TEXT NOT NULL,
    email TEXT,
    whatsapp TEXT,

    -- Origen
    origen TEXT, -- webapp, informe_premium, cma, directo
    informe_premium_id INTEGER, -- si viene de informe

    -- Estado del lead
    estado TEXT DEFAULT 'nuevo', -- nuevo, contactado, interesado, visita_agendada, negociando, cerrado, descartado
    notas TEXT,

    -- Seguimiento
    fecha_primer_contacto TIMESTAMPTZ,
    fecha_ultimo_contacto TIMESTAMPTZ,
    cantidad_contactos INTEGER DEFAULT 0,

    -- Si se cierra
    monto_cierre DECIMAL(12,2),
    fecha_cierre TIMESTAMPTZ,
    comision_simon DECIMAL(10,2), -- 0.75% del cierre

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para broker_leads
CREATE INDEX IF NOT EXISTS idx_broker_leads_broker ON broker_leads(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_leads_propiedad ON broker_leads(propiedad_id);
CREATE INDEX IF NOT EXISTS idx_broker_leads_estado ON broker_leads(estado);
CREATE INDEX IF NOT EXISTS idx_broker_leads_codigo ON broker_leads(codigo_ref);
CREATE INDEX IF NOT EXISTS idx_broker_leads_fecha ON broker_leads(created_at);

-- Trigger updated_at
CREATE TRIGGER update_broker_leads_timestamp
    BEFORE UPDATE ON broker_leads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE broker_leads IS 'Leads recibidos por cada broker. Tracking desde nuevo hasta cierre.';

-- =====================================================
-- TABLA 7: broker_cma_uso
-- Historial de CMAs generados
-- =====================================================
CREATE TABLE IF NOT EXISTS broker_cma_uso (
    id SERIAL PRIMARY KEY,

    -- Relacion
    broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,

    -- Tipo
    tipo TEXT NOT NULL, -- gratis, pagado, incentivo

    -- Propiedad analizada
    propiedad_analizada JSONB NOT NULL,
    /*
    {
        "zona": "equipetrol",
        "dormitorios": 2,
        "area_m2": 85,
        "precio_referencia": 127000
    }
    */

    -- Resultado
    comparables_usados INTEGER,
    rango_estimado JSONB, -- {min: 120000, max: 135000}

    -- Si pagado
    monto_pagado DECIMAL(8,2),
    stripe_payment_id TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para broker_cma_uso
CREATE INDEX IF NOT EXISTS idx_broker_cma_broker ON broker_cma_uso(broker_id);
CREATE INDEX IF NOT EXISTS idx_broker_cma_tipo ON broker_cma_uso(tipo);
CREATE INDEX IF NOT EXISTS idx_broker_cma_fecha ON broker_cma_uso(created_at);

COMMENT ON TABLE broker_cma_uso IS 'Historial de CMAs usados por broker. Gratis, pagados, o por incentivo.';

-- =====================================================
-- FUNCION: Verificar Duplicados por Hash de Fotos
-- =====================================================
CREATE OR REPLACE FUNCTION verificar_duplicado_fotos(p_hashes TEXT[])
RETURNS TABLE (
    es_duplicado BOOLEAN,
    propiedad_existente INTEGER,
    codigo_existente TEXT,
    broker_nombre TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        true as es_duplicado,
        pf.propiedad_id as propiedad_existente,
        pb.codigo as codigo_existente,
        b.nombre as broker_nombre
    FROM propiedad_fotos pf
    JOIN propiedades_broker pb ON pb.id = pf.propiedad_id
    JOIN brokers b ON b.id = pb.broker_id
    WHERE pf.hash = ANY(p_hashes)
    AND pb.estado IN ('publicada', 'borrador', 'en_revision')
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, NULL::INTEGER, NULL::TEXT, NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verificar_duplicado_fotos IS 'Verifica si alguna foto ya existe en otra propiedad. Anti-duplicados.';

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Habilitar RLS en todas las tablas
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedades_broker ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedad_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedad_pdfs ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_cma_uso ENABLE ROW LEVEL SECURITY;

-- Politica: Brokers solo ven su propio perfil
CREATE POLICY broker_own_profile ON brokers
    FOR ALL
    USING (id = auth.uid());

-- Politica: Brokers solo ven/editan sus propiedades
CREATE POLICY broker_own_properties ON propiedades_broker
    FOR ALL
    USING (broker_id = auth.uid());

-- Politica: Propiedades publicadas visibles para TODOS (lectura anonima)
CREATE POLICY public_published_properties ON propiedades_broker
    FOR SELECT
    USING (estado = 'publicada');

-- Politica: Fotos de propiedades publicadas visibles para todos
CREATE POLICY public_published_photos ON propiedad_fotos
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM propiedades_broker pb
        WHERE pb.id = propiedad_id AND pb.estado = 'publicada'
    ));

-- Politica: Brokers ven fotos de sus propiedades
CREATE POLICY broker_own_photos ON propiedad_fotos
    FOR ALL
    USING (EXISTS (
        SELECT 1 FROM propiedades_broker pb
        WHERE pb.id = propiedad_id AND pb.broker_id = auth.uid()
    ));

-- Politica: PDFs de propiedades publicadas visibles para todos
CREATE POLICY public_published_pdfs ON propiedad_pdfs
    FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM propiedades_broker pb
        WHERE pb.id = propiedad_id AND pb.estado = 'publicada'
    ));

-- Politica: Brokers solo ven sus leads
CREATE POLICY broker_own_leads ON broker_leads
    FOR ALL
    USING (broker_id = auth.uid());

-- Politica: Brokers solo ven su historial de CMAs
CREATE POLICY broker_own_cma ON broker_cma_uso
    FOR ALL
    USING (broker_id = auth.uid());

-- =====================================================
-- GRANTS para usuario anon (lectura propiedades publicadas)
-- =====================================================
GRANT SELECT ON propiedades_broker TO anon;
GRANT SELECT ON propiedad_fotos TO anon;
GRANT SELECT ON propiedad_pdfs TO anon;
-- NOTA: GRANT para buscar_unidades_broker está en migración 073

-- =====================================================
-- TEST: Verificar tablas creadas
-- =====================================================
SELECT 'Migracion 072 completada. Tablas creadas:' as status;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
AND table_name IN ('brokers', 'codigos_unicos', 'propiedades_broker', 'propiedad_fotos', 'propiedad_pdfs', 'broker_leads', 'broker_cma_uso')
ORDER BY table_name;
