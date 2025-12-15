-- seed_data.sql
-- Estado base Módulo 1 (CONGELADO)
-- Fecha: 2024-12-13
-- Versión: 1.3.0

-- =====================================================================================
-- CLEANUP
-- =====================================================================================
DELETE FROM propiedades_v2 WHERE codigo_propiedad IN ('TEST-001', 'TEST-002', 'TEST-003');
DELETE FROM proyectos_master WHERE nombre_oficial = 'TEST - Edificio Seed Data';
DELETE FROM auditoria_tipo_cambio WHERE notas LIKE '%seed%' OR notas LIKE '%SEED%';

-- =====================================================================================
-- CONFIG_GLOBAL
-- =====================================================================================
INSERT INTO config_global (clave, valor, activo, tipo_dato, actualizado_por, fecha_actualizacion)
VALUES ('tipo_cambio_oficial', 6.96, true, 'numeric', 'seed_v1.3.0', NOW())
ON CONFLICT (clave) DO UPDATE SET 
    valor = 6.96, 
    actualizado_por = 'seed_v1.3.0', 
    fecha_actualizacion = NOW();

INSERT INTO config_global (clave, valor, activo, tipo_dato, actualizado_por, fecha_actualizacion)
VALUES ('tipo_cambio_paralelo', 10.50, true, 'numeric', 'seed_v1.3.0', NOW())
ON CONFLICT (clave) DO UPDATE SET 
    valor = 10.50, 
    actualizado_por = 'seed_v1.3.0', 
    fecha_actualizacion = NOW();

-- =====================================================================================
-- PROYECTO MASTER
-- =====================================================================================
INSERT INTO proyectos_master (
    nombre_oficial, alias_conocidos, latitud, longitud, radio_metros,
    zona, tipo_proyecto, desarrollador, fuente_verificacion,
    activo, created_at, updated_at
) VALUES (
    'TEST - Edificio Seed Data',
    ARRAY['Test Building'],
    -17.7634500, -63.1821200, 50,
    'Equipetrol Norte', 'edificio', 'Test Developer', 'seed_testing',
    true, NOW(), NOW()
) ON CONFLICT (nombre_oficial) DO UPDATE SET updated_at = NOW()
RETURNING id_proyecto_master;

-- =====================================================================================
-- TEST-001: USD PURO (Control negativo para TC)
-- =====================================================================================
INSERT INTO propiedades_v2 (
    url, fuente, codigo_propiedad, tipo_operacion, tipo_propiedad_original,
    estado_construccion, scraper_version,
    precio_usd, moneda_original, tipo_cambio_usado, tipo_cambio_detectado,
    tipo_cambio_paralelo_usado, precio_usd_actualizado, requiere_actualizacion_precio,
    depende_de_tc,
    area_total_m2, dormitorios, banos, estacionamientos, latitud, longitud,
    es_multiproyecto,
    id_proyecto_master,
    status, es_activa, es_para_matching,
    score_calidad_dato, score_fiduciario,
    datos_json_discovery, datos_json_enrichment, datos_json,
    fecha_discovery, fecha_enrichment, fecha_merge, metodo_discovery,
    campos_bloqueados,
    fecha_creacion, fecha_actualizacion
) VALUES (
    'https://test.sici.bo/TEST-001', 'century21', 'TEST-001', 'venta', 'departamento',
    'entrega_inmediata', 'v16.3',
    100000.00, 'USD', NULL, NULL,
    NULL, 100000.00, FALSE,
    FALSE,
    85.00, 2, 2, 1, -17.763450, -63.182120,
    FALSE,
    (SELECT id_proyecto_master FROM proyectos_master WHERE nombre_oficial = 'TEST - Edificio Seed Data'),
    'completado', TRUE, TRUE,
    92, 95,
    '{"source": "api", "currency": "USD"}'::JSONB,
    '{"amenities": ["gym", "pool"]}'::JSONB,
    '{"source": "api", "currency": "USD", "amenities": ["gym", "pool"]}'::JSONB,
    NOW(), NOW(), NOW(), 'api_rest',
    '{}'::JSONB,
    NOW(), NOW()
);

-- =====================================================================================
-- TEST-002: BOB CON TC PARALELO (Candidata a recálculo TC)
-- =====================================================================================
INSERT INTO propiedades_v2 (
    url, fuente, codigo_propiedad, tipo_operacion, tipo_propiedad_original,
    estado_construccion, scraper_version,
    precio_usd, moneda_original, tipo_cambio_usado, tipo_cambio_detectado,
    tipo_cambio_paralelo_usado, precio_usd_actualizado, requiere_actualizacion_precio,
    depende_de_tc,
    area_total_m2, dormitorios, banos, estacionamientos, latitud, longitud,
    es_multiproyecto,
    id_proyecto_master,
    status, es_activa, es_para_matching,
    score_calidad_dato, score_fiduciario,
    datos_json_discovery, datos_json_enrichment, datos_json,
    fecha_discovery, fecha_enrichment, fecha_merge, metodo_discovery,
    campos_bloqueados,
    fecha_creacion, fecha_actualizacion
) VALUES (
    'https://test.sici.bo/TEST-002', 'remax', 'TEST-002', 'venta', 'departamento',
    'entrega_inmediata', 'v1.6',
    120000.00, 'BOB', 10.50, 'paralelo',
    10.50, 120000.00, FALSE,
    TRUE,
    95.00, 3, 2, 2, -17.763500, -63.182200,
    FALSE,
    (SELECT id_proyecto_master FROM proyectos_master WHERE nombre_oficial = 'TEST - Edificio Seed Data'),
    'completado', TRUE, TRUE,
    91, 94,
    '{"source": "api", "currency": "BOB", "precio_bob": 1260000}'::JSONB,
    '{"amenities": ["gym", "sauna"], "tc_paralelo": 10.50}'::JSONB,
    '{"source": "api", "currency": "BOB", "precio_bob": 1260000, "amenities": ["gym", "sauna"]}'::JSONB,
    NOW(), NOW(), NOW(), 'api_rest',
    '{}'::JSONB,
    NOW(), NOW()
);

-- =====================================================================================
-- TEST-003: USD MULTIPROYECTO (Control negativo para TC)
-- =====================================================================================
INSERT INTO propiedades_v2 (
    url, fuente, codigo_propiedad, tipo_operacion, tipo_propiedad_original,
    estado_construccion, scraper_version,
    precio_usd, moneda_original, tipo_cambio_usado, tipo_cambio_detectado,
    tipo_cambio_paralelo_usado, precio_usd_actualizado, requiere_actualizacion_precio,
    depende_de_tc,
    area_total_m2, dormitorios, banos, estacionamientos, latitud, longitud,
    es_multiproyecto, dormitorios_opciones, precio_min_usd, precio_max_usd, area_min_m2, area_max_m2,
    id_proyecto_master,
    status, es_activa, es_para_matching,
    score_calidad_dato, score_fiduciario,
    datos_json_discovery, datos_json_enrichment, datos_json,
    fecha_discovery, fecha_enrichment, fecha_merge, metodo_discovery,
    campos_bloqueados,
    fecha_creacion, fecha_actualizacion
) VALUES (
    'https://test.sici.bo/TEST-003', 'century21', 'TEST-003', 'venta', 'departamento',
    'en_construccion', 'v16.3',
    105000.00, 'USD', NULL, NULL,
    NULL, 105000.00, FALSE,
    FALSE,
    80.00, 2, 2, 1, -17.763600, -63.182300,
    TRUE, '2-3', 85000.00, 125000.00, 68.00, 92.00,
    (SELECT id_proyecto_master FROM proyectos_master WHERE nombre_oficial = 'TEST - Edificio Seed Data'),
    'completado', TRUE, TRUE,
    90, 93,
    '{"source": "api", "currency": "USD", "multiproyecto": true}'::JSONB,
    '{"opciones": ["2D 68m2", "3D 92m2"]}'::JSONB,
    '{"source": "api", "currency": "USD", "multiproyecto": true, "opciones": ["2D 68m2", "3D 92m2"]}'::JSONB,
    NOW(), NOW(), NOW(), 'api_rest',
    '{}'::JSONB,
    NOW(), NOW()
);

-- =====================================================================================
-- VERIFICACIÓN
-- =====================================================================================
DO $$
DECLARE
    v_tc_oficial NUMERIC;
    v_tc_paralelo NUMERIC;
    v_props INTEGER;
BEGIN
    SELECT valor INTO v_tc_oficial FROM config_global WHERE clave = 'tipo_cambio_oficial';
    SELECT valor INTO v_tc_paralelo FROM config_global WHERE clave = 'tipo_cambio_paralelo';
    SELECT COUNT(*) INTO v_props FROM propiedades_v2 WHERE codigo_propiedad LIKE 'TEST-%';
    
    RAISE NOTICE '════════════════════════════════════════════════';
    RAISE NOTICE '✅ SEED v1.3.0 CARGADO - MÓDULO 1 CONGELADO';
    RAISE NOTICE '════════════════════════════════════════════════';
    RAISE NOTICE 'TC Oficial: % | TC Paralelo: %', v_tc_oficial, v_tc_paralelo;
    RAISE NOTICE 'Propiedades TEST: %', v_props;
    RAISE NOTICE '────────────────────────────────────────────────';
    RAISE NOTICE 'TEST-001: USD puro     | depende_de_tc = FALSE';
    RAISE NOTICE 'TEST-002: BOB paralelo | depende_de_tc = TRUE';
    RAISE NOTICE 'TEST-003: USD multi    | depende_de_tc = FALSE';
    RAISE NOTICE '════════════════════════════════════════════════';
END $$;