-- Migración 176: Corregir precio_usd inflado en 85 propiedades de venta
--
-- Root cause: normalizarPrecioUSD CASO 2 multiplicaba USD × TC_PARALELO / 6.96
-- cuando la descripción mencionaba "paralelo". El precio ya era USD → inflación 19-153%.
--
-- Ver docs/analysis/AUDITORIA_PRECIOS_VENTAS.md para auditoría completa.
--
-- Dependencias:
--   - Migración 174 (config_global): EJECUTADA 2026-03-07
--   - Migración 175 (fix extractor n8n): ejecutar ANTES de esta migración
--
-- Esta migración:
--   1. Corrige precio_usd con el precio real verificado en la descripción del listing
--   2. Resetea campos derivados (precio_usd_actualizado, depende_de_tc, etc.)
--   3. Agrega candado precio_usd a las 85 props (protege de merge nocturno)
--   4. Corrige 4 anticréticos mal clasificados como venta
--
-- IMPORTANTE: Los precios fueron verificados manualmente contra la descripción
--   del listing (datos_json_enrichment->>'descripcion'). Cada precio real es el
--   monto en USD que aparece en el texto publicado por la desarrolladora.

-- ============================================================================
-- VERIFICACIÓN PRE-EJECUCIÓN
-- ============================================================================
--
-- 1. Confirmar que las 85 props existen y tienen los precios inflados esperados:
--
-- SELECT id, precio_usd, status
-- FROM propiedades_v2
-- WHERE id IN (
--   151,152,153,154,155,157,169,174,175,177,196,197,204,207,
--   220,221,222,228,230,232,235,236,243,247,248,271,272,278,
--   288,295,298,302,317,323,342,343,349,353,355,357,367,382,
--   386,392,394,395,415,416,450,451,458,483,488,490,526,527,
--   529,530,555,559,577,578,595,602,619,622,636,829,835,838,
--   849,874,902,933,968,971,972,975,977,996,1010,1011,1040,1104,18
-- )
-- ORDER BY id;
--
-- 2. Confirmar migración 175 aplicada (extractor n8n ya no infla props nuevas)

-- ============================================================================
-- PASO 3: CORREGIR PRECIOS
-- ============================================================================

WITH precios_reales (id, precio_real_usd) AS (
  VALUES
    -- Auditoría original (57 props)
    (151, 71890),
    (152, 45760),
    (153, 71890),
    (154, 71890),
    (155, 71890),
    (157, 55000),
    (175, 240600),
    (177, 37212),
    (204, 195000),
    (207, 65024),
    (230, 110000),
    (232, 55000),
    (235, 60000),
    (236, 68000),
    (247, 51609),
    (248, 45376),
    (288, 78000),
    (295, 83500),
    (317, 396000),
    (342, 145530),
    (343, 58212),
    (349, 56826),
    (353, 52000),
    (355, 100000),
    (357, 110000),
    (367, 108400),
    (392, 125000),
    (394, 278000),
    (415, 255000),
    (416, 60000),
    (450, 249000),
    (458, 66528),
    (488, 145530),
    (526, 79050),
    (527, 79050),
    (529, 215000),
    (555, 75000),
    (559, 115000),
    (577, 115600),
    (578, 70550),
    (595, 320000),
    (602, 150000),
    (622, 66500),
    (636, 120000),
    (829, 56826),
    (835, 142000),
    (838, 145530),
    (849, 312717),
    (874, 109000),
    (902, 70000),
    (933, 115600),
    (968, 102647),
    (971, 76000),
    (972, 174000),
    (1010, 49500),
    (1011, 97500),
    (1040, 218500),
    -- Nuevas verificadas (28 props)
    (18, 170000),
    (169, 144573),
    (174, 99536),
    (196, 30942),
    (197, 82320),
    (220, 62700),
    (221, 53500),
    (222, 53130),
    (228, 56870),
    (243, 100000),
    (271, 46515),
    (272, 46515),
    (278, 170000),
    (298, 327000),
    (302, 526000),
    (323, 120000),
    (382, 97162),
    (386, 59449),
    (395, 89900),
    (451, 45000),
    (483, 82900),
    (490, 44000),
    (530, 140000),
    (619, 260000),
    (975, 73000),
    (977, 85000),
    (996, 58000),
    (1104, 82000)
)
UPDATE propiedades_v2 p
SET
    precio_usd = pr.precio_real_usd,
    precio_usd_actualizado = pr.precio_real_usd,
    depende_de_tc = false,
    requiere_actualizacion_precio = false
FROM precios_reales pr
WHERE p.id = pr.id;
-- Esperado: UPDATE 85

-- ============================================================================
-- PASO 4: CANDADOS — proteger precio_usd de merge nocturno
-- ============================================================================
--
-- Formato real de campos_bloqueados->'precio_usd' en producción:
--   {"bloqueado": true, "por": "admin", "fecha": "...", "motivo": "...", "valor_original": N}
-- NO es un boolean simple.
--
-- 30 de las 85 ya tienen candado (puesto sobre valor inflado, ahora protege el correcto).
-- Las otras 55 necesitan candado nuevo.
-- Este UPDATE es idempotente: si ya tiene candado, lo preserva.

UPDATE propiedades_v2
SET campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || jsonb_build_object(
    'precio_usd', jsonb_build_object(
        'bloqueado', true,
        'por', 'migracion_176',
        'fecha', NOW()::text,
        'motivo', 'correccion_precio_inflado_caso2',
        'valor_original', precio_usd
    )
)
WHERE id IN (
    151,152,153,154,155,157,169,174,175,177,196,197,204,207,
    220,221,222,228,230,232,235,236,243,247,248,271,272,278,
    288,295,298,302,317,323,342,343,349,353,355,357,367,382,
    386,392,394,395,415,416,450,451,458,483,488,490,526,527,
    529,530,555,559,577,578,595,602,619,622,636,829,835,838,
    849,874,902,933,968,971,972,975,977,996,1010,1011,1040,1104,18
)
AND NOT COALESCE((campos_bloqueados->'precio_usd'->>'bloqueado')::boolean, false);
-- Esperado: UPDATE ~55 (las que no tenían candado)

-- ============================================================================
-- ANTICRÉTICO MAL CLASIFICADO (4 props)
-- ============================================================================

UPDATE propiedades_v2
SET tipo_operacion = 'anticretico'
WHERE id IN (495, 596, 637, 950);
-- Esperado: UPDATE 4

-- ============================================================================
-- VERIFICACIÓN POST-EJECUCIÓN
-- ============================================================================
--
-- 1. Confirmar corrección de precios:
--
-- SELECT id, precio_usd, precio_usd_actualizado, depende_de_tc,
--        requiere_actualizacion_precio,
--        campos_bloqueados->>'precio_usd' AS candado
-- FROM propiedades_v2
-- WHERE id IN (577, 972, 1040, 483, 1104)
-- ORDER BY id;
--
-- Esperado:
--   577: precio_usd=115600, actualizado=115600, depende_tc=false, candado=true
--   972: precio_usd=174000, actualizado=174000, depende_tc=false, candado=true
--  1040: precio_usd=218500, actualizado=218500, depende_tc=false, candado=true
--   483: precio_usd=82900,  actualizado=82900,  depende_tc=false, candado=true
--  1104: precio_usd=82000,  actualizado=82000,  depende_tc=false, candado=true
--
-- 2. Confirmar que NO se tocaron las 6 OK ni el falso positivo:
--
-- SELECT id, precio_usd FROM propiedades_v2
-- WHERE id IN (276, 376, 833, 834, 841, 887, 465);
-- Esperado: precios sin cambios
--
-- 3. Confirmar anticréticos:
--
-- SELECT id, tipo_operacion FROM propiedades_v2
-- WHERE id IN (495, 596, 637, 950);
-- Esperado: todos 'anticretico'
--
-- 4. Spot-check de candados (props que NO tenían candado antes):
--
-- SELECT id, campos_bloqueados->>'precio_usd' AS candado
-- FROM propiedades_v2
-- WHERE id IN (353, 235, 971, 1040, 483, 1104, 977, 996);
-- Esperado: todos candado = 'true'
--
-- 5. Al día siguiente: verificar que merge nocturno NO sobreescribió precios:
--
-- SELECT id, precio_usd, fecha_merge
-- FROM propiedades_v2
-- WHERE id IN (577, 972, 1040) AND fecha_merge >= CURRENT_DATE;
-- Si fecha_merge es hoy pero precio_usd sigue correcto → candado funciona
