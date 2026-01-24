# Schema de Base de Datos - Sistema Broker

## Alineacion con BD Existente

### ENUMs a REUTILIZAR (NO crear nuevos)

```sql
-- Ya existen en la BD:
-- estado_construccion_enum: entrega_inmediata, preventa, construccion, planos, no_especificado, usado, nuevo_a_estrenar
-- tipo_operacion_enum: venta, alquiler, anticretico
```

### Tablas Existentes a Referenciar

| Tabla | Uso en Sistema Broker |
|-------|----------------------|
| `zonas_geograficas` | FK para microzona (7 zonas activas) |
| `proyectos_master` | FK para autocompletado (187 proyectos) |
| `propiedades_v2` | Referencia para busqueda unificada |

### Estructura de Amenities Existente

```jsonb
-- datos_json->amenities tiene esta estructura:
{
    "lista": ["Piscina", "Gimnasio", ...],
    "equipamiento": ["Cocina Equipada", "Aire Acondicionado", ...],
    "estado_amenities": {
        "Piscina": {"valor": true, "fuente": "descripcion", "confianza": "media"},
        ...
    }
}
```

### Estructura de Fotos Existente

```jsonb
-- datos_json_discovery->fotos:
{
    "totalFotos": 12,
    "propiedadThumbnail": ["https://cdn.21online.lat/...jpg", ...]
}
```

### Estructura de Agente Existente

```jsonb
-- datos_json->agente:
{
    "nombre": "Juan Pérez",
    "telefono": "+59176543210",
    "oficina_nombre": "Century21 Azzero"
}
```

---

## Diagrama de Relaciones

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│   brokers   │──1:N──│  propiedades_broker  │──1:N──│  broker_leads   │
└─────────────┘       └──────────────────────┘       └─────────────────┘
       │                        │
       │                        │
       └────────1:N─────────────┼──────────────┬──────────────┐
                                │              │              │
                    ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
                    │ broker_cma_uso    │  │ propiedad_fotos   │  │ propiedad_pdfs    │
                    └───────────────────┘  └───────────────────┘  └───────────────────┘
```

---

## Tabla: `brokers`

Perfil del broker, autenticacion y creditos.

```sql
CREATE TABLE brokers (
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

    CONSTRAINT email_format CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT telefono_format CHECK (telefono ~ '^[0-9]{7,15}$')
);

-- Indices
CREATE INDEX idx_brokers_email ON brokers(email);
CREATE INDEX idx_brokers_activo ON brokers(activo) WHERE activo = true;
CREATE INDEX idx_brokers_tier ON brokers(tier);
```

---

## Tabla: `propiedades_broker`

Propiedades cargadas por brokers.

```sql
CREATE TABLE propiedades_broker (
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
    id_proyecto_master INTEGER REFERENCES proyectos_master(id_proyecto_master), -- FK para autocompletado
    direccion TEXT NOT NULL,
    latitud DECIMAL(10,7),
    longitud DECIMAL(10,7),
    -- FK a zonas_geograficas para microzona
    id_microzona INTEGER REFERENCES zonas_geograficas(id),
    microzona TEXT, -- cache del nombre para queries rapidos
    geocoded_address TEXT, -- direccion normalizada

    -- CATEGORIA 3: Fotos (20 pts)
    -- Fotos en tabla separada: propiedad_fotos
    cantidad_fotos INTEGER DEFAULT 0,
    fotos_hash TEXT[], -- hashes para detectar duplicados

    -- CATEGORIA 4: Amenidades (COMPATIBLE con estructura existente en propiedades_v2)
    -- Usar MISMA estructura que datos_json->amenities para consistencia
    amenidades JSONB DEFAULT '{}',
    /*
    ESTRUCTURA ALINEADA con propiedades_v2:
    {
        "lista": ["Piscina", "Gimnasio", "Seguridad 24/7", ...],
        "equipamiento": ["Cocina Equipada", "Aire Acondicionado", ...],
        "estado_amenities": {
            "Piscina": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Gimnasio": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Pet Friendly": {"valor": false, "fuente": "broker", "confianza": "alta"},
            ...
        }
    }

    AMENIDADES VALIDAS (del sistema existente):
    - Piscina, Gimnasio, Churrasquera, Salón de Eventos, Co-working
    - Seguridad 24/7, Sauna/Jacuzzi, Terraza/Balcón, Estacionamiento para Visitas
    - Jardín, Ascensor, Lavadero, Recepción, Pet Friendly, Área Social, Parque Infantil

    EQUIPAMIENTO VALIDO (base + extensible):
    - Cocina Equipada, Aire Acondicionado, Lavandería, Roperos Empotrados
    - Campana Extractora, Microondas, Balcón, Horno Empotrado
    - Amoblado (no/parcial/completo), Lavadora, Secadora, Cortinas
    - Calefón/Termotanque (eléctrico/gas/termotanque)

    VALORES CUSTOM (broker puede agregar):
    - Se guardan con fuente: "broker_custom"
    - No se usan en filtros automáticos hasta validación
    - Ejemplos: "Smart Home", "Paneles Solares", "Bodega de Vinos"
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
    -- REUTILIZAR ENUMs existentes de la BD
    estado_construccion estado_construccion_enum NOT NULL DEFAULT 'no_especificado',
    -- Valores: entrega_inmediata, preventa, construccion, planos, no_especificado, usado, nuevo_a_estrenar
    fecha_entrega DATE, -- si no terminado
    antiguedad_anos INTEGER,
    estado_unidad TEXT, -- nuevo, excelente, bueno, a_remodelar
    tipo_operacion tipo_operacion_enum NOT NULL DEFAULT 'venta', -- venta, alquiler, anticretico
    disponibilidad TEXT, -- inmediata, 30_dias, 60_dias, segun_obra
    escritura_lista BOOLEAN,

    -- Documentacion (bonus)
    tiene_planos BOOLEAN DEFAULT false,
    plano_url TEXT,
    desarrollador TEXT,

    -- Sistema de Calidad
    score_calidad INTEGER DEFAULT 0, -- 0-100
    score_desglose JSONB DEFAULT '{}',
    /*
    {
        "datos_basicos": 20,
        "ubicacion": 15,
        "fotos": 15,
        "amenidades": 12,
        "financiero": 14,
        "estado": 12
    }
    */
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
    CONSTRAINT precio_positivo CHECK (precio_usd > 0),
    CONSTRAINT area_positiva CHECK (area_m2 > 0),
    CONSTRAINT score_rango CHECK (score_calidad >= 0 AND score_calidad <= 100)
);

-- Indices
CREATE INDEX idx_propiedades_broker_broker ON propiedades_broker(broker_id);
CREATE INDEX idx_propiedades_broker_codigo ON propiedades_broker(codigo);
CREATE INDEX idx_propiedades_broker_estado ON propiedades_broker(estado);
CREATE INDEX idx_propiedades_broker_zona ON propiedades_broker(zona);
CREATE INDEX idx_propiedades_broker_precio ON propiedades_broker(precio_usd);
CREATE INDEX idx_propiedades_broker_dorms ON propiedades_broker(dormitorios);
CREATE INDEX idx_propiedades_broker_score ON propiedades_broker(score_calidad);
CREATE INDEX idx_propiedades_broker_publicada ON propiedades_broker(estado) WHERE estado = 'publicada';
CREATE INDEX idx_propiedades_broker_gps ON propiedades_broker USING GIST (
    ST_SetSRID(ST_MakePoint(longitud, latitud), 4326)
) WHERE latitud IS NOT NULL AND longitud IS NOT NULL;
CREATE INDEX idx_propiedades_broker_fuente ON propiedades_broker(fuente_origen);

-- Trigger para updated_at
CREATE TRIGGER update_propiedades_broker_timestamp
    BEFORE UPDATE ON propiedades_broker
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## Tabla: `propiedad_fotos`

Fotos de las propiedades (separada para mejor manejo).

```sql
CREATE TABLE propiedad_fotos (
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

    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT una_principal_por_propiedad UNIQUE (propiedad_id, es_principal)
        WHERE es_principal = true
);

-- Indices
CREATE INDEX idx_propiedad_fotos_propiedad ON propiedad_fotos(propiedad_id);
CREATE INDEX idx_propiedad_fotos_hash ON propiedad_fotos(hash);
CREATE INDEX idx_propiedad_fotos_orden ON propiedad_fotos(propiedad_id, orden);
CREATE INDEX idx_propiedad_fotos_watermark ON propiedad_fotos(tiene_watermark) WHERE tiene_watermark = true;
```

---

## Tabla: `propiedad_pdfs`

PDFs auto-generados para compartir.

```sql
CREATE TABLE propiedad_pdfs (
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

-- Indices
CREATE INDEX idx_propiedad_pdfs_propiedad ON propiedad_pdfs(propiedad_id);
CREATE UNIQUE INDEX idx_propiedad_pdfs_version ON propiedad_pdfs(propiedad_id, version);
```

### Contenido del PDF

El PDF se genera con el siguiente contenido:

```
┌─────────────────────────────────────────────┐
│  [FOTO PRINCIPAL - grande]                  │
│                                             │
│  $127,000 USD                               │
│  Vienna - Equipetrol Norte                  │
├─────────────────────────────────────────────┤
│  • 85 m²  • 2 dorms  • 2 baños             │
│  • Piscina • Gym • Seguridad 24h           │
│  • 1 parqueo incluido                       │
│  • Expensas: $85/mes                        │
├─────────────────────────────────────────────┤
│  [📷] [📷] [📷] [📷]  (galeria 2x2)        │
├─────────────────────────────────────────────┤
│  [QR CODE]  Ver mas: simon.bo/p/SIM-7K2M9  │
├─────────────────────────────────────────────┤
│  Juan Pérez | Century21 | 76543210         │
│  Ref: #SIM-7K2M9 | Powered by Simón        │
└─────────────────────────────────────────────┘
```

---

## Tabla: `broker_leads`

Contactos recibidos por el broker.

```sql
CREATE TABLE broker_leads (
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

-- Indices
CREATE INDEX idx_broker_leads_broker ON broker_leads(broker_id);
CREATE INDEX idx_broker_leads_propiedad ON broker_leads(propiedad_id);
CREATE INDEX idx_broker_leads_estado ON broker_leads(estado);
CREATE INDEX idx_broker_leads_codigo ON broker_leads(codigo_ref);
CREATE INDEX idx_broker_leads_fecha ON broker_leads(created_at);
```

---

## Tabla: `broker_cma_uso`

Historial de CMAs generados por el broker.

```sql
CREATE TABLE broker_cma_uso (
    id SERIAL PRIMARY KEY,

    -- Relacion
    broker_id UUID NOT NULL REFERENCES brokers(id) ON DELETE CASCADE,

    -- Tipo
    tipo TEXT NOT NULL, -- gratis, pagado, incentivo

    -- Propiedad analizada
    propiedad_analizada JSONB NOT NULL, -- snapshot de datos usados
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

-- Indices
CREATE INDEX idx_broker_cma_broker ON broker_cma_uso(broker_id);
CREATE INDEX idx_broker_cma_tipo ON broker_cma_uso(tipo);
CREATE INDEX idx_broker_cma_fecha ON broker_cma_uso(created_at);
```

---

## Tabla: `codigos_unicos`

Control de codigos generados para garantizar unicidad.

```sql
CREATE TABLE codigos_unicos (
    codigo TEXT PRIMARY KEY,
    tipo TEXT NOT NULL, -- SIM (propiedad), REF (lead), CMA
    entidad_id INTEGER, -- ID de la propiedad o lead
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indice
CREATE INDEX idx_codigos_tipo ON codigos_unicos(tipo);
```

---

## Funciones Utiles

### Generar Codigo Unico

```sql
CREATE OR REPLACE FUNCTION generar_codigo_unico(prefijo TEXT)
RETURNS TEXT AS $$
DECLARE
    nuevo_codigo TEXT;
    caracteres TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Sin 0,O,1,I,L
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
```

### Calcular Score de Calidad

```sql
CREATE OR REPLACE FUNCTION calcular_score_calidad(prop propiedades_broker)
RETURNS JSONB AS $$
DECLARE
    score_basicos INTEGER := 0;
    score_ubicacion INTEGER := 0;
    score_fotos INTEGER := 0;
    score_amenidades INTEGER := 0;
    score_financiero INTEGER := 0;
    score_estado INTEGER := 0;
    score_total INTEGER := 0;
BEGIN
    -- Datos Basicos (20 pts)
    IF prop.precio_usd IS NOT NULL THEN score_basicos := score_basicos + 4; END IF;
    IF prop.area_m2 IS NOT NULL THEN score_basicos := score_basicos + 4; END IF;
    IF prop.dormitorios IS NOT NULL THEN score_basicos := score_basicos + 4; END IF;
    IF prop.banos IS NOT NULL THEN score_basicos := score_basicos + 4; END IF;
    IF prop.zona IS NOT NULL THEN score_basicos := score_basicos + 4; END IF;

    -- Ubicacion (15 pts)
    IF prop.proyecto_nombre IS NOT NULL THEN score_ubicacion := score_ubicacion + 3; END IF;
    IF prop.direccion IS NOT NULL THEN score_ubicacion := score_ubicacion + 3; END IF;
    IF prop.latitud IS NOT NULL AND prop.longitud IS NOT NULL THEN
        score_ubicacion := score_ubicacion + 8;
    END IF;
    IF prop.microzona IS NOT NULL THEN score_ubicacion := score_ubicacion + 1; END IF;

    -- Fotos (20 pts) - con penalizacion por watermarks
    DECLARE
        fotos_con_watermark INTEGER;
    BEGIN
        SELECT COUNT(*) INTO fotos_con_watermark
        FROM propiedad_fotos
        WHERE propiedad_id = prop.id AND tiene_watermark = true;

        IF prop.cantidad_fotos >= 8 THEN
            IF fotos_con_watermark = 0 THEN
                score_fotos := 20; -- Perfecta
            ELSE
                score_fotos := 15; -- Con watermarks
            END IF;
        ELSIF prop.cantidad_fotos >= 5 THEN
            IF fotos_con_watermark = 0 THEN
                score_fotos := 15;
            ELSE
                score_fotos := 12;
            END IF;
        ELSIF prop.cantidad_fotos >= 3 THEN
            IF fotos_con_watermark = 0 THEN
                score_fotos := 10;
            ELSE
                score_fotos := 8;
            END IF;
        ELSE
            score_fotos := 0;
        END IF;
    END;

    -- Amenidades (15 pts)
    IF jsonb_typeof(prop.amenidades_edificio) = 'object' AND
       jsonb_array_length(jsonb_path_query_array(prop.amenidades_edificio, '$.* ? (@ == true)')) >= 6
    THEN score_amenidades := score_amenidades + 8;
    ELSIF jsonb_array_length(jsonb_path_query_array(prop.amenidades_edificio, '$.* ? (@ == true)')) >= 3
    THEN score_amenidades := score_amenidades + 5;
    END IF;

    IF jsonb_typeof(prop.equipamiento_unidad) = 'object' AND
       jsonb_array_length(jsonb_path_query_array(prop.equipamiento_unidad, '$.* ? (@ == true)')) >= 5
    THEN score_amenidades := score_amenidades + 7;
    ELSIF jsonb_array_length(jsonb_path_query_array(prop.equipamiento_unidad, '$.* ? (@ == true)')) >= 3
    THEN score_amenidades := score_amenidades + 4;
    END IF;

    -- Financiero (15 pts)
    IF prop.expensas_usd IS NOT NULL THEN score_financiero := score_financiero + 4; END IF;
    IF prop.parqueo_incluido IS NOT NULL THEN score_financiero := score_financiero + 4; END IF;
    IF prop.baulera_incluida IS NOT NULL THEN score_financiero := score_financiero + 3; END IF;
    IF prop.acepta_financiamiento IS NOT NULL THEN score_financiero := score_financiero + 2; END IF;
    IF prop.precio_negociable IS NOT NULL THEN score_financiero := score_financiero + 2; END IF;

    -- Estado (15 pts)
    IF prop.estado_construccion IS NOT NULL THEN score_estado := score_estado + 3; END IF;
    IF prop.estado_construccion != 'terminado' AND prop.fecha_entrega IS NOT NULL
        OR prop.estado_construccion = 'terminado'
    THEN score_estado := score_estado + 3; END IF;
    IF prop.antiguedad_anos IS NOT NULL THEN score_estado := score_estado + 2; END IF;
    IF prop.estado_unidad IS NOT NULL THEN score_estado := score_estado + 2; END IF;
    IF prop.disponibilidad IS NOT NULL THEN score_estado := score_estado + 3; END IF;
    IF prop.escritura_lista IS NOT NULL THEN score_estado := score_estado + 2; END IF;

    score_total := score_basicos + score_ubicacion + score_fotos + score_amenidades + score_financiero + score_estado;

    RETURN jsonb_build_object(
        'total', score_total,
        'datos_basicos', score_basicos,
        'ubicacion', score_ubicacion,
        'fotos', score_fotos,
        'amenidades', score_amenidades,
        'financiero', score_financiero,
        'estado', score_estado,
        'es_perfecta', score_total = 100
    );
END;
$$ LANGUAGE plpgsql;
```

### Verificar Duplicados por Hash

```sql
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
```

### Generar PDF (Trigger)

```sql
CREATE OR REPLACE FUNCTION generar_pdf_propiedad()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo generar si se publica por primera vez
    IF NEW.estado = 'publicada' AND OLD.estado != 'publicada' THEN
        -- Insertar registro de PDF (la generacion real es async via API)
        INSERT INTO propiedad_pdfs (propiedad_id, url, short_link)
        VALUES (
            NEW.id,
            'pending', -- Se actualiza via worker
            'simon.bo/p/' || NEW.codigo
        );

        -- TODO: Disparar evento para generacion async
        -- PERFORM pg_notify('generar_pdf', NEW.id::TEXT);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generar_pdf
    AFTER UPDATE OF estado ON propiedades_broker
    FOR EACH ROW
    EXECUTE FUNCTION generar_pdf_propiedad();
```

### Verificar Incentivo CMA

```sql
CREATE OR REPLACE FUNCTION verificar_incentivo_cma()
RETURNS TRIGGER AS $$
BEGIN
    -- Si la propiedad ahora tiene calidad perfecta
    IF NEW.es_calidad_perfecta = true AND OLD.es_calidad_perfecta = false THEN
        -- Incrementar contador del broker
        UPDATE brokers
        SET propiedades_perfectas = propiedades_perfectas + 1
        WHERE id = NEW.broker_id;

        -- Verificar si alcanza multiplo de 5
        IF (SELECT propiedades_perfectas FROM brokers WHERE id = NEW.broker_id) % 5 = 0 THEN
            -- Dar credito CMA
            UPDATE brokers
            SET cma_creditos = cma_creditos + 1
            WHERE id = NEW.broker_id;

            -- TODO: Enviar email de felicitacion
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_incentivo_cma
    AFTER UPDATE OF es_calidad_perfecta ON propiedades_broker
    FOR EACH ROW
    EXECUTE FUNCTION verificar_incentivo_cma();
```

---

## Row Level Security (RLS)

```sql
-- Habilitar RLS
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedades_broker ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE broker_cma_uso ENABLE ROW LEVEL SECURITY;

-- Brokers solo ven su propio perfil
CREATE POLICY broker_own_profile ON brokers
    FOR ALL
    USING (id = auth.uid());

-- Brokers solo ven sus propiedades
CREATE POLICY broker_own_properties ON propiedades_broker
    FOR ALL
    USING (broker_id = auth.uid());

-- Propiedades publicadas visibles para todos (lectura)
CREATE POLICY public_published_properties ON propiedades_broker
    FOR SELECT
    USING (estado = 'publicada');

-- Brokers solo ven sus leads
CREATE POLICY broker_own_leads ON broker_leads
    FOR ALL
    USING (broker_id = auth.uid());

-- Brokers solo ven su historial de CMAs
CREATE POLICY broker_own_cma ON broker_cma_uso
    FOR ALL
    USING (broker_id = auth.uid());
```

---

## Migracion Inicial

```sql
-- Archivo: sql/migrations/070_broker_system.sql

-- 1. Crear tablas en orden
-- (copiar CREATE TABLE de arriba)

-- 2. Crear funciones
-- (copiar funciones de arriba)

-- 3. Crear triggers
-- (copiar triggers de arriba)

-- 4. Habilitar RLS
-- (copiar politicas de arriba)

-- 5. Insertar datos iniciales si necesario
-- (ej: zonas, tipos de operacion, etc)
```

---

## Integracion con Sistema Actual

### Propiedades Broker vs propiedades_v2

| Aspecto | propiedades_v2 (actual) | propiedades_broker (nuevo) |
|---------|-------------------------|---------------------------|
| Origen | Scraping automatico | Carga manual broker |
| Calidad | Variable | Controlada (score) |
| Fotos | URLs externas | Upload directo |
| Broker | Extraido de anuncio | Registrado en sistema |
| Codigo | No tiene | SIM-XXXXX |

### Busqueda Unificada (Futuro)

```sql
-- Vista que combina ambas fuentes con campos normalizados
CREATE VIEW propiedades_todas AS
SELECT
    'scraping' as fuente_tipo,
    id,
    nombre_edificio as proyecto,
    zona,
    microzona,
    dormitorios,
    banos,
    area_total_m2 as area_m2,
    precio_usd,
    latitud,
    longitud,
    estado_construccion,
    tipo_operacion,
    datos_json->'agente'->>'nombre' as broker_nombre,
    datos_json->'agente'->>'telefono' as broker_telefono,
    datos_json_discovery->'fotos'->'propiedadThumbnail' as fotos,
    datos_json->'amenities' as amenidades,
    NULL::TEXT as codigo_sim,
    fecha_actualizacion as updated_at
FROM propiedades_v2
WHERE status = 'completado'
  AND es_activa = true
  AND tipo_operacion = 'venta'

UNION ALL

SELECT
    'broker' as fuente_tipo,
    id,
    proyecto_nombre as proyecto,
    zona,
    microzona,
    dormitorios,
    banos::numeric,
    area_m2,
    precio_usd,
    latitud,
    longitud,
    estado_construccion,
    tipo_operacion,
    (SELECT nombre FROM brokers WHERE id = pb.broker_id) as broker_nombre,
    (SELECT telefono FROM brokers WHERE id = pb.broker_id) as broker_telefono,
    (SELECT jsonb_agg(url ORDER BY orden) FROM propiedad_fotos WHERE propiedad_id = pb.id) as fotos,
    amenidades,
    codigo as codigo_sim,
    updated_at
FROM propiedades_broker pb
WHERE estado = 'publicada';
```

### Funcion buscar_unidades_reales() Actualizada

La funcion existente `buscar_unidades_reales()` debera modificarse para incluir propiedades de brokers:

```sql
-- En el futuro, agregar al final de buscar_unidades_reales():
UNION ALL
SELECT ... FROM propiedades_broker WHERE estado = 'publicada' AND ...
```

---

## Estado del Documento

| Version | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 0.1 | 2026-01-23 | Claude + Luis | Borrador inicial |
| 0.2 | 2026-01-23 | Claude + Luis | Tabla propiedad_pdfs, fuente_origen, deteccion watermarks, funciones duplicados y PDF |
| 0.3 | 2026-01-23 | Claude + Luis | Alineacion BD: ENUMs existentes, FK zonas_geograficas/proyectos_master, estructura amenities compatible |
