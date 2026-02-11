-- ============================================================================
-- TESTS ALQUILER - Versión queries simples para Supabase SQL Editor
-- Ejecutar CADA bloque por separado (seleccionar + F5)
-- ============================================================================

-- ============================================================
-- T01: Discovery INSERT nuevo alquiler
-- Esperado: accion = 'inserted'
-- ============================================================
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t01',
    p_fuente := 'remax',
    p_codigo_propiedad := 'TEST-AQ-001',
    p_precio_mensual_bob := 4500,
    p_area_total_m2 := 85,
    p_dormitorios := 2,
    p_banos := 2,
    p_zona := 'Equipetrol',
    p_datos_json_discovery := '{"test": "t01"}'::jsonb
);

-- ============================================================
-- T01-VERIFY: Verificar que se insertó correctamente
-- Esperado: tipo_operacion=alquiler, status=nueva, precio_mensual_bob=4500
-- ============================================================
SELECT id, tipo_operacion, status, precio_mensual_bob, precio_mensual_usd,
       precio_usd, area_total_m2, dormitorios, banos, zona, es_activa, es_para_matching
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T02: Discovery UPDATE mismo alquiler (cambio de precio)
-- Esperado: accion = 'updated'
-- ============================================================
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t01',
    p_fuente := 'remax',
    p_precio_mensual_bob := 5000,
    p_area_total_m2 := 90
);

-- ============================================================
-- T02-VERIFY: Verificar update
-- Esperado: precio_mensual_bob=5000, area=90, dorms=2 (no cambió)
-- ============================================================
SELECT id, precio_mensual_bob, precio_mensual_usd, area_total_m2, dormitorios
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T03: Discovery con parámetros NULL → error
-- Esperado: accion = 'error'
-- ============================================================
SELECT * FROM registrar_discovery_alquiler(
    p_url := NULL,
    p_fuente := NULL
);

-- ============================================================
-- T04: Discovery con candado → campo no se actualiza
-- Primero ponemos candado en precio, luego intentamos actualizar
-- ============================================================
UPDATE propiedades_v2
SET campos_bloqueados = '{"precio_mensual_bob": {"bloqueado": true, "por": "admin"}}'::jsonb
WHERE url = 'https://test.sici/alquiler/t01';

-- Intentar cambiar precio (debe ignorarse por candado)
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t01',
    p_fuente := 'remax',
    p_precio_mensual_bob := 9999
);

-- T04-VERIFY: Precio debe seguir en 5000, NO 9999
SELECT id, precio_mensual_bob, campos_bloqueados
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- Limpiar candado para siguientes tests
UPDATE propiedades_v2
SET campos_bloqueados = '{}'::jsonb
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T05: Enrichment LLM completo
-- Esperado: success=true
-- ============================================================
SELECT registrar_enrichment_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/alquiler/t01'),
    p_datos_llm := '{
        "precio_mensual_bob": 5500,
        "expensas_bs": 400,
        "deposito_meses": 2,
        "contrato_minimo_meses": 12,
        "area_total_m2": 88,
        "dormitorios": 2,
        "banos": 2,
        "estacionamientos": 1,
        "piso": 8,
        "amoblado": "Si",
        "acepta_mascotas": false,
        "servicios_incluidos": ["agua", "luz"],
        "nombre_edificio": "Sky Test Tower"
    }'::jsonb,
    p_modelo_usado := 'claude-haiku-4.0',
    p_tokens_usados := 3500
);

-- T05-VERIFY: Verificar enrichment
-- Esperado: amoblado='si' (normalizado), deposito=2, nombre_edificio='Sky Test Tower'
SELECT id, precio_mensual_bob, monto_expensas_bob, deposito_meses,
       contrato_minimo_meses, amoblado, acepta_mascotas, nombre_edificio,
       status, fecha_enrichment
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T06: Enrichment con requiere_revision
-- Esperado: success=true, flags_semanticos contiene 'requiere_revision_alquiler'
-- ============================================================
SELECT registrar_enrichment_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/alquiler/t01'),
    p_datos_llm := '{"precio_mensual_bob": 5500}'::jsonb,
    p_requiere_revision := TRUE,
    p_errores_validacion := ARRAY['precio_sospechoso']
);

-- T06-VERIFY: flags_semanticos debe tener entrada
SELECT id, flags_semanticos
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T07: Enrichment propiedad inexistente
-- Esperado: success=false
-- ============================================================
SELECT registrar_enrichment_alquiler(
    p_id := 999999,
    p_datos_llm := '{"test": true}'::jsonb
);

-- ============================================================
-- T08: Enrichment rechaza propiedad de VENTA
-- Primero crear una propiedad de venta temporal
-- ============================================================
INSERT INTO propiedades_v2 (url, fuente, tipo_operacion, status, precio_usd, area_total_m2, dormitorios, banos, fecha_creacion, fecha_actualizacion)
VALUES ('https://test.sici/venta/t08', 'remax', 'venta', 'nueva', 100000, 80, 2, 2, NOW(), NOW())
RETURNING id;

-- Intentar enrichment alquiler sobre venta → debe fallar
-- (reemplazar ID con el que devolvió el INSERT anterior)
SELECT registrar_enrichment_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/venta/t08'),
    p_datos_llm := '{"test": true}'::jsonb
);

-- ============================================================
-- T09: Enrichment con candado
-- ============================================================
UPDATE propiedades_v2
SET campos_bloqueados = '{"amoblado": {"bloqueado": true, "por": "admin"}}'::jsonb
WHERE url = 'https://test.sici/alquiler/t01';

SELECT registrar_enrichment_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/alquiler/t01'),
    p_datos_llm := '{"amoblado": "no"}'::jsonb
);

-- T09-VERIFY: amoblado debe seguir 'si', NO 'no'
SELECT id, amoblado, campos_bloqueados
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- Limpiar candado
UPDATE propiedades_v2
SET campos_bloqueados = '{}'::jsonb
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T10: Merge individual
-- Esperado: accion = 'merged', status → 'completado'
-- ============================================================
-- Resetear status para que merge lo procese
UPDATE propiedades_v2
SET status = 'actualizado'
WHERE url = 'https://test.sici/alquiler/t01';

SELECT * FROM merge_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/alquiler/t01')
);

-- T10-VERIFY: status=completado, es_para_matching=true, fecha_merge no null
SELECT id, status, es_para_matching, precio_mensual_bob, precio_mensual_usd,
       area_total_m2, dormitorios, fecha_merge, cambios_merge
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t01';

-- ============================================================
-- T11: Merge sin datos mínimos → es_para_matching = false
-- ============================================================
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t11',
    p_fuente := 'century21',
    p_precio_mensual_bob := 3000
    -- Sin area ni dormitorios
);

SELECT * FROM merge_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/alquiler/t11')
);

-- T11-VERIFY: es_para_matching debe ser FALSE (falta area y dorms)
SELECT id, status, es_para_matching, precio_mensual_bob, area_total_m2, dormitorios
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t11';

-- ============================================================
-- T12: Merge batch (NULL procesa todas las pendientes)
-- ============================================================
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t12a',
    p_fuente := 'remax',
    p_precio_mensual_bob := 6000,
    p_area_total_m2 := 100,
    p_dormitorios := 3
);

SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t12b',
    p_fuente := 'century21',
    p_precio_mensual_bob := 3500,
    p_area_total_m2 := 60,
    p_dormitorios := 1
);

-- Merge todas las pendientes
SELECT * FROM merge_alquiler();

-- T12-VERIFY: ambas deben estar completadas
SELECT id, url, status, es_para_matching
FROM propiedades_v2
WHERE url LIKE 'https://test.sici/alquiler/t12%';

-- ============================================================
-- T13: Merge respeta candados
-- ============================================================
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.sici/alquiler/t13',
    p_fuente := 'remax',
    p_precio_mensual_bob := 7000,
    p_area_total_m2 := 120,
    p_dormitorios := 3
);

UPDATE propiedades_v2
SET campos_bloqueados = '{"precio_mensual_bob": {"bloqueado": true, "por": "admin"}}'::jsonb,
    precio_mensual_bob = 8000
WHERE url = 'https://test.sici/alquiler/t13';

SELECT * FROM merge_alquiler(
    p_id := (SELECT id FROM propiedades_v2 WHERE url = 'https://test.sici/alquiler/t13')
);

-- T13-VERIFY: precio debe ser 8000 (candado), NO 7000
SELECT id, precio_mensual_bob, campos_bloqueados
FROM propiedades_v2
WHERE url = 'https://test.sici/alquiler/t13';

-- ============================================================
-- CLEANUP: Borrar todos los datos de test
-- ============================================================
DELETE FROM propiedades_v2
WHERE url LIKE 'https://test.sici/%';

-- VERIFY CLEANUP
SELECT COUNT(*) as remaining FROM propiedades_v2
WHERE url LIKE 'https://test.sici/%';
