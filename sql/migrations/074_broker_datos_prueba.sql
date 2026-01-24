-- =====================================================
-- MIGRACION 074: Datos de Prueba Sistema Broker
-- Fecha: 23 Enero 2026
-- Proposito: Insertar broker y propiedades de prueba para testing
-- =====================================================
-- SEGURIDAD: Solo inserta datos de test, no modifica estructuras
-- Para limpiar: DELETE FROM brokers WHERE email = 'broker.test@simon.bo';
-- =====================================================

-- =====================================================
-- 0. DESACTIVAR RLS TEMPORALMENTE (para poder insertar sin auth)
-- =====================================================
ALTER TABLE brokers DISABLE ROW LEVEL SECURITY;
ALTER TABLE propiedades_broker DISABLE ROW LEVEL SECURITY;
ALTER TABLE propiedad_fotos DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- 1. BROKER DE PRUEBA
-- =====================================================
INSERT INTO brokers (
    id,
    email,
    nombre,
    telefono,
    whatsapp,
    empresa,
    cma_creditos,
    es_founding_broker,
    tier,
    activo,
    email_verificado,
    badge
) VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,  -- ID fijo para testing
    'broker.test@simon.bo',
    'Broker de Prueba Simon',
    '70123456',
    '59170123456',
    'Simon Test Inmobiliaria',
    5,      -- 5 CMAs de cortesia
    true,   -- founding broker
    'beta',
    true,
    true,
    'founding_broker'
) ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    activo = true;

-- =====================================================
-- 2. CODIGOS UNICOS
-- =====================================================
INSERT INTO codigos_unicos (codigo, tipo, entidad_id)
VALUES
    ('SIM-TEST1', 'SIM', 1),
    ('SIM-TEST2', 'SIM', 2),
    ('SIM-TEST3', 'SIM', 3)
ON CONFLICT (codigo) DO NOTHING;

-- =====================================================
-- 3. PROPIEDAD 1: Depto 2 dorms en Equipetrol (precio bajo - oportunidad)
-- =====================================================
INSERT INTO propiedades_broker (
    broker_id,
    codigo,
    precio_usd,
    area_m2,
    dormitorios,
    banos,
    zona,
    proyecto_nombre,
    direccion,
    latitud,
    longitud,
    microzona,
    estado_construccion,
    tipo_operacion,
    estado,
    cantidad_fotos,
    score_calidad,
    es_calidad_perfecta,
    amenidades,
    parqueo_incluido,
    cantidad_parqueos,
    baulera_incluida,
    expensas_usd,
    desarrollador,
    descripcion,
    fecha_publicacion
) VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'SIM-TEST1',
    95000,      -- Precio bajo para destacar como oportunidad
    72,
    2,
    2,
    'Equipetrol',
    'Vienna Residences',
    'Av. San Martin 1234, Equipetrol',
    -17.7789,
    -63.1800,
    'Equipetrol',
    'entrega_inmediata',
    'venta',
    'publicada',
    8,
    92,
    false,
    '{
        "lista": ["Piscina", "Gimnasio", "Seguridad 24/7", "Ascensor"],
        "equipamiento": ["Aire Acondicionado", "Cocina Equipada", "Closets"],
        "estado_amenities": {
            "Piscina": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Gimnasio": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Seguridad 24/7": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Ascensor": {"valor": true, "fuente": "broker", "confianza": "alta"}
        }
    }'::JSONB,
    true,
    1,
    false,
    85,
    'Grupo Jenecheru',
    'Hermoso departamento de 2 dormitorios en Vienna Residences. Ubicacion privilegiada en Equipetrol, cerca de centros comerciales y restaurantes. Piso alto con excelente vista. Incluye 1 parqueo. Ideal para familia joven o inversion.',
    NOW()
);

-- =====================================================
-- 4. PROPIEDAD 2: Depto 3 dorms en Sirari (premium, score perfecto)
-- =====================================================
INSERT INTO propiedades_broker (
    broker_id,
    codigo,
    precio_usd,
    area_m2,
    dormitorios,
    banos,
    zona,
    proyecto_nombre,
    direccion,
    latitud,
    longitud,
    microzona,
    estado_construccion,
    tipo_operacion,
    estado,
    cantidad_fotos,
    score_calidad,
    es_calidad_perfecta,
    amenidades,
    parqueo_incluido,
    cantidad_parqueos,
    baulera_incluida,
    expensas_usd,
    desarrollador,
    descripcion,
    fecha_entrega,
    fecha_publicacion
) VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'SIM-TEST2',
    185000,
    145,
    3,
    3,
    'Sirari',
    'Sky Gardens',
    'Av. Banzer Km 5, Sirari',
    -17.7650,
    -63.1950,
    'Sirari',
    'preventa',
    'venta',
    'publicada',
    12,
    100,    -- Score perfecto
    true,   -- Calidad perfecta
    '{
        "lista": ["Piscina", "Gimnasio", "Seguridad 24/7", "Ascensor", "Pet Friendly", "Co-working", "Churrasquera", "Sauna/Jacuzzi"],
        "equipamiento": ["Aire Acondicionado", "Cocina Equipada", "Closets", "Roperos Empotrados", "Balcón", "Cortinas"],
        "estado_amenities": {
            "Piscina": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Gimnasio": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Seguridad 24/7": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Ascensor": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Pet Friendly": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Co-working": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Churrasquera": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Sauna/Jacuzzi": {"valor": true, "fuente": "broker", "confianza": "alta"}
        }
    }'::JSONB,
    true,
    2,
    true,
    120,
    'Constructora Premium',
    'Espectacular departamento de 3 dormitorios en Sky Gardens. Edificio de ultima generacion con las mejores amenidades de Sirari. Vista panoramica, acabados de lujo, piso de porcelanato. Entrega prevista Dic 2026. 2 parqueos + baulera incluidos.',
    '2026-12-01',
    NOW()
);

-- =====================================================
-- 5. PROPIEDAD 3: Depto 1 dorm barato (para test sin parqueo incluido)
-- =====================================================
INSERT INTO propiedades_broker (
    broker_id,
    codigo,
    precio_usd,
    area_m2,
    dormitorios,
    banos,
    zona,
    proyecto_nombre,
    direccion,
    latitud,
    longitud,
    microzona,
    estado_construccion,
    tipo_operacion,
    estado,
    cantidad_fotos,
    score_calidad,
    es_calidad_perfecta,
    amenidades,
    parqueo_incluido,
    cantidad_parqueos,
    baulera_incluida,
    precio_parqueo_extra,
    expensas_usd,
    desarrollador,
    descripcion,
    fecha_publicacion
) VALUES (
    '00000000-0000-0000-0000-000000000001'::UUID,
    'SIM-TEST3',
    62000,
    48,
    1,
    1,
    'Equipetrol',
    'Loft Modern',
    'Calle Suarez Arana 567, Equipetrol',
    -17.7810,
    -63.1820,
    'Equipetrol',
    'entrega_inmediata',
    'venta',
    'publicada',
    5,
    75,     -- Score medio (pocas fotos)
    false,
    '{
        "lista": ["Seguridad 24/7", "Ascensor"],
        "equipamiento": ["Aire Acondicionado"],
        "estado_amenities": {
            "Seguridad 24/7": {"valor": true, "fuente": "broker", "confianza": "alta"},
            "Ascensor": {"valor": true, "fuente": "broker", "confianza": "alta"}
        }
    }'::JSONB,
    false,  -- Sin parqueo incluido
    0,
    false,
    12000,  -- Parqueo extra $12k
    45,
    'Desarrollos Modernos',
    'Loft moderno de 1 dormitorio, ideal para solteros o pareja sin hijos. Ubicacion centrica en Equipetrol. Parqueo disponible por $12,000 adicionales.',
    NOW()
);

-- =====================================================
-- 6. FOTOS DE PRUEBA (usando picsum.photos para imagenes reales)
-- =====================================================

-- Fotos para propiedad SIM-TEST1 (8 fotos)
INSERT INTO propiedad_fotos (propiedad_id, url, thumbnail_url, orden, es_principal, tipo, hash)
SELECT
    (SELECT id FROM propiedades_broker WHERE codigo = 'SIM-TEST1'),
    'https://picsum.photos/seed/simtest1-' || n || '/800/600',
    'https://picsum.photos/seed/simtest1-' || n || '/200/150',
    n,
    n = 1,  -- Primera es principal
    CASE n
        WHEN 1 THEN 'fachada'
        WHEN 2 THEN 'living'
        WHEN 3 THEN 'cocina'
        WHEN 4 THEN 'dormitorio'
        WHEN 5 THEN 'bano'
        WHEN 6 THEN 'dormitorio'
        WHEN 7 THEN 'vista'
        WHEN 8 THEN 'amenidades'
    END,
    md5('simtest1-' || n || '-' || now()::text)
FROM generate_series(1, 8) n;

-- Fotos para propiedad SIM-TEST2 (12 fotos - score perfecto)
INSERT INTO propiedad_fotos (propiedad_id, url, thumbnail_url, orden, es_principal, tipo, hash)
SELECT
    (SELECT id FROM propiedades_broker WHERE codigo = 'SIM-TEST2'),
    'https://picsum.photos/seed/simtest2-' || n || '/800/600',
    'https://picsum.photos/seed/simtest2-' || n || '/200/150',
    n,
    n = 1,
    CASE n
        WHEN 1 THEN 'fachada'
        WHEN 2 THEN 'living'
        WHEN 3 THEN 'cocina'
        WHEN 4 THEN 'dormitorio'
        WHEN 5 THEN 'dormitorio'
        WHEN 6 THEN 'dormitorio'
        WHEN 7 THEN 'bano'
        WHEN 8 THEN 'bano'
        WHEN 9 THEN 'vista'
        WHEN 10 THEN 'amenidades'
        WHEN 11 THEN 'amenidades'
        WHEN 12 THEN 'plano'
    END,
    md5('simtest2-' || n || '-' || now()::text)
FROM generate_series(1, 12) n;

-- Fotos para propiedad SIM-TEST3 (5 fotos - score medio)
INSERT INTO propiedad_fotos (propiedad_id, url, thumbnail_url, orden, es_principal, tipo, hash)
SELECT
    (SELECT id FROM propiedades_broker WHERE codigo = 'SIM-TEST3'),
    'https://picsum.photos/seed/simtest3-' || n || '/800/600',
    'https://picsum.photos/seed/simtest3-' || n || '/200/150',
    n,
    n = 1,
    CASE n
        WHEN 1 THEN 'fachada'
        WHEN 2 THEN 'living'
        WHEN 3 THEN 'cocina'
        WHEN 4 THEN 'dormitorio'
        WHEN 5 THEN 'bano'
    END,
    md5('simtest3-' || n || '-' || now()::text)
FROM generate_series(1, 5) n;

-- =====================================================
-- 7. REACTIVAR RLS
-- =====================================================
ALTER TABLE brokers ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedades_broker ENABLE ROW LEVEL SECURITY;
ALTER TABLE propiedad_fotos ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 8. VERIFICACION
-- =====================================================
SELECT 'Migracion 074 completada. Datos de prueba insertados:' as status;

SELECT 'Broker:' as tipo, email, nombre, tier FROM brokers WHERE email = 'broker.test@simon.bo';

SELECT 'Propiedades:' as tipo, codigo, proyecto_nombre, precio_usd, dormitorios, estado, score_calidad
FROM propiedades_broker
WHERE broker_id = '00000000-0000-0000-0000-000000000001'::UUID
ORDER BY codigo;

SELECT 'Fotos por propiedad:' as tipo, pb.codigo, COUNT(pf.id) as total_fotos
FROM propiedades_broker pb
LEFT JOIN propiedad_fotos pf ON pf.propiedad_id = pb.id
WHERE pb.broker_id = '00000000-0000-0000-0000-000000000001'::UUID
GROUP BY pb.codigo
ORDER BY pb.codigo;

-- =====================================================
-- 8. TEST: Funcion buscar_unidades_broker
-- =====================================================
SELECT 'Test buscar_unidades_broker:' as status;
SELECT id, proyecto, precio_usd, dormitorios, fuente_tipo, codigo_sim, cantidad_fotos
FROM buscar_unidades_broker('{"limite": 10}'::jsonb);
