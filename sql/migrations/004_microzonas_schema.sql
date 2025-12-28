-- =============================================================================
-- MIGRACION: 004_microzonas_schema.sql
-- DESCRIPCION: Crear infraestructura de microzonas geograficas
-- VERSION: 1.0.0
-- FECHA: 28 Diciembre 2025
-- =============================================================================
-- CONTEXTO:
--   - Agregar columna microzona a propiedades_v2
--   - Crear tabla zonas_geograficas con poligonos PostGIS
--   - Insertar 7 microzonas de Equipetrol (GeoJSON v4)
-- =============================================================================
-- PREREQUISITOS:
--   - Extension PostGIS habilitada (ya existe: 3.3.7)
-- =============================================================================

-- ============================================================================
-- PASO 1: Agregar columna microzona a propiedades_v2
-- ============================================================================
ALTER TABLE propiedades_v2
ADD COLUMN IF NOT EXISTS microzona VARCHAR(100);

-- Indice para queries por microzona
CREATE INDEX IF NOT EXISTS idx_propiedades_v2_microzona
ON propiedades_v2(microzona)
WHERE microzona IS NOT NULL;

-- ============================================================================
-- PASO 2: Crear tabla zonas_geograficas
-- ============================================================================
CREATE TABLE IF NOT EXISTS zonas_geograficas (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,           -- "Sirari", "Equipetrol Norte/Norte"
    zona_general VARCHAR(100) NOT NULL,     -- "Equipetrol" (paraguas)
    barrio_oficial VARCHAR(100),            -- "UV 34", "UV 58"
    descripcion TEXT,
    tipo_desarrollo VARCHAR(100),
    geom GEOMETRY(Polygon, 4326) NOT NULL,  -- Poligono WGS84
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Indice espacial para ST_Contains
CREATE INDEX IF NOT EXISTS idx_zonas_geograficas_geom
ON zonas_geograficas USING GIST(geom);

-- Indice para zona_general
CREATE INDEX IF NOT EXISTS idx_zonas_geograficas_zona_general
ON zonas_geograficas(zona_general);

-- ============================================================================
-- PASO 3: Insertar las 7 microzonas de Equipetrol (GeoJSON v4)
-- ============================================================================

-- Limpiar datos existentes (si re-ejecutamos)
DELETE FROM zonas_geograficas WHERE zona_general = 'Equipetrol';

-- Microzona 1: Equipetrol (Centro historico)
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Equipetrol',
    'Equipetrol',
    'Equipetrol (UV 34)',
    'Centro historico del barrio, zona residencial-comercial con desarrollo vertical consolidado. Entre 2do y 3er anillo.',
    'Consolidado - mixto',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.19121380486412, -17.77277814859248],
            [-63.18867759010905, -17.771781342921926],
            [-63.19112844425047, -17.767123789133294],
            [-63.19134514377477, -17.76424941082223],
            [-63.191639235987395, -17.76281957466078],
            [-63.19207263503678, -17.762510020997993],
            [-63.19603019125897, -17.76484530864562],
            [-63.19875644770809, -17.766720375306903],
            [-63.20154328763472, -17.76943197539201],
            [-63.19463677129566, -17.770297371017065],
            [-63.19121380486412, -17.77277814859248]
        ]]
    }'), 4326)
);

-- Microzona 2: Sirari
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Sirari',
    'Equipetrol',
    'Sirari (UV 58)',
    'Zona de transicion residencial-comercial, entre 3er y 4to anillo. Desarrollo vertical emergente.',
    'Transicion - emergente',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.19695593159071, -17.763226309317645],
            [-63.20083026739994, -17.757114582403133],
            [-63.20258001745347, -17.76179115955034],
            [-63.20543041673393, -17.76566133782815],
            [-63.203172674729586, -17.767972654352732],
            [-63.19695593159071, -17.763226309317645]
        ]]
    }'), 4326)
);

-- Microzona 3: Equipetrol Norte/Norte (Premium)
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Equipetrol Norte/Norte',
    'Equipetrol',
    'Equipetrol Norte',
    'Zona financiera premium cerca del 4to anillo. Ventura Mall, Green Tower, Manzana 40. Maximo desarrollo vertical.',
    'Financiero - corporativo premium',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.198641352212746, -17.76037880203745],
            [-63.195372522941696, -17.758387655069853],
            [-63.197228966317454, -17.756353442147073],
            [-63.19816098657502, -17.75496196028257],
            [-63.200783446200944, -17.756563469452857],
            [-63.20089402734983, -17.756774095647245],
            [-63.198641352212746, -17.76037880203745]
        ]]
    }'), 4326)
);

-- Microzona 4: Equipetrol Norte/Sur (Transicion)
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Equipetrol Norte/Sur',
    'Equipetrol',
    'Equipetrol Norte',
    'Zona de transicion cerca del 3er anillo. Av. La Salle, Hotel Los Tajibos. Desarrollo mixto residencial-comercial.',
    'Transicion - mixto',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.19867295545953, -17.760397101282393],
            [-63.19684939930464, -17.763136389854125],
            [-63.19674162597717, -17.763309586887758],
            [-63.192971930269806, -17.760958756280985],
            [-63.19536808798995, -17.758393078936294],
            [-63.19867295545953, -17.760397101282393]
        ]]
    }'), 4326)
);

-- Microzona 5: Villa Brigida
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Villa Brigida',
    'Equipetrol',
    'Villa Brigida (UV 59)',
    'Zona emergente norte-oeste, condominios residenciales en desarrollo.',
    'Residencial - emergente',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.19297489506691, -17.760926373655465],
            [-63.19175262423447, -17.760324633752404],
            [-63.19096684096701, -17.756143459867175],
            [-63.19085075974991, -17.75488073557831],
            [-63.19101670828704, -17.75368531576828],
            [-63.19134680932663, -17.753049068650796],
            [-63.191826241788775, -17.75257001050521],
            [-63.19242356747948, -17.752420304571004],
            [-63.192832264004494, -17.75245024576745],
            [-63.19621186988617, -17.753894902558784],
            [-63.198135617649385, -17.754935128150834],
            [-63.19723877161469, -17.756306393795896],
            [-63.19297489506691, -17.760926373655465]
        ]]
    }'), 4326)
);

-- Microzona 6: Faremafu
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Faremafu',
    'Equipetrol',
    'Faremafu',
    'Zona sur de Equipetrol, limite con zonas residenciales tradicionales.',
    'Buffer - mixto',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.19111981404373, -17.772860187995974],
            [-63.194522406988554, -17.770387769802767],
            [-63.2015043955376, -17.769448924366856],
            [-63.20228272999606, -17.77136707691548],
            [-63.202455476165824, -17.77204004277408],
            [-63.20213524224144, -17.772150860153545],
            [-63.191767555820405, -17.773465181054604],
            [-63.19111981404373, -17.772860187995974]
        ]]
    }'), 4326)
);

-- Microzona 7: Equipetrol Franja
INSERT INTO zonas_geograficas (nombre, zona_general, barrio_oficial, descripcion, tipo_desarrollo, geom)
VALUES (
    'Equipetrol Franja',
    'Equipetrol',
    'Equipetrol (3er Anillo)',
    'Franja de equipamiento sobre 3er anillo, entre Av. Busch y Av. La Salle. Zona comercial y de servicios.',
    'Comercial - equipamiento',
    ST_SetSRID(ST_GeomFromGeoJSON('{
        "type": "Polygon",
        "coordinates": [[
            [-63.20286191575644, -17.767992027272328],
            [-63.20167486431747, -17.769367732876233],
            [-63.19979858215369, -17.767323807472692],
            [-63.19614831555354, -17.76473539487526],
            [-63.19241768411783, -17.762688325273913],
            [-63.1922079300071, -17.7625796686996],
            [-63.19209567051918, -17.762453517276],
            [-63.19198764395439, -17.76237450668367],
            [-63.19176615548086, -17.76229415234036],
            [-63.19171955882405, -17.76038860591818],
            [-63.19636278617972, -17.76321260546443],
            [-63.19809897233442, -17.764252623144813],
            [-63.199413167780165, -17.765141739603322],
            [-63.20130012449245, -17.766573798733774],
            [-63.20286191575644, -17.767992027272328]
        ]]
    }'), 4326)
);

-- ============================================================================
-- VERIFICACION
-- ============================================================================
-- SELECT id, nombre, zona_general, ST_AsText(geom) FROM zonas_geograficas;
-- SELECT COUNT(*) FROM zonas_geograficas WHERE zona_general = 'Equipetrol';
-- Esperado: 7 microzonas

-- =============================================================================
-- FIN MIGRACION 004
-- =============================================================================
