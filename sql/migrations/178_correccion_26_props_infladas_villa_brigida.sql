-- ============================================================
-- Migración 178: Corregir 26 props infladas por CASO 2 + candados + excluir ID 1105 + normalizar Villa Brígida
-- Fecha: 2026-03-07
-- ============================================================

-- PARTE 1: Agregar valor 'excluido_calidad' al enum estado_propiedad
-- IMPORTANTE: ejecutar este ALTER TYPE por separado ANTES del resto.
-- PostgreSQL no permite usar un nuevo valor de enum en la misma transacción.
ALTER TYPE estado_propiedad ADD VALUE IF NOT EXISTS 'excluido_calidad';

-- ============================================================
-- EJECUTAR DESDE AQUÍ EN UNA SEGUNDA EJECUCIÓN (después de commitear el ALTER TYPE)
-- ============================================================

-- PARTE 2: Excluir ID 1105 (garbage data: descripcion = ".", precio $1.47M para 66m²)
UPDATE propiedades_v2
SET status = 'excluido_calidad'
WHERE id = 1105;

-- PARTE 3: Corregir 26 props infladas por CASO 2
-- Edge cases no detectados en migración 176:
--   - 18 props: enrichment regex clasificó moneda como BOB cuando era USD
--   - 8 props: enrichment no detectó paralelo pero merge lo detectó por regex en descripción
WITH precios_reales (id, precio_real_usd) AS (
  VALUES
    -- Remax (3)
    (30,   65000),    -- Torre Oasis, monoambiente 31m²
    (61,   168000),   -- Sky Eclipse, 2 dorm 105m²
    (832,  229500),   -- Sky Eclipse, 3 dorm 135m²
    -- C21 (23)
    (180,  63000),    -- Sky Plaza Italia, monoambiente 45m²
    (198,  128000),   -- OMNIA PRIME, 2 dorm 88m²
    (429,  63000),    -- Sky Magnolia, monoambiente 40m²
    (430,  135000),   -- Luciana, 86m²
    (453,  129000),   -- Sky 1, 2 dorm 110m²
    (479,  110000),   -- Sky Eclipse, 1 dorm 68m²
    (497,  61000),    -- Sky Plaza Italia, monoambiente 42m²
    (499,  109990),   -- Platinum II, 2 dorm 73m²
    (500,  163117),   -- Platinum II, 2 dorm 108m²
    (501,  173250),   -- Sky Eclipse, 2 dorm 105m²
    (506,  118300),   -- Luxe Suites, 1 dorm 91m²
    (562,  98100),    -- Aura Residences, duplex 2 dorm 107m²
    (563,  89900),    -- Aura Residences, 3 dorm 86m²
    (564,  99900),    -- Aura Residences, duplex 2 dorm 111m²
    (565,  85353),    -- Aura Residences, 2 dorm 74m²
    (572,  65000),    -- Elite Sirari, monoambiente 37m²
    (585,  210000),   -- Platinum, 3 dorm 168m²
    (627,  87500),    -- Alto Busch, 2 dorm 62m²
    (635,  50000),    -- Bellini Suites, monoambiente 30m²
    (816,  140000),   -- Condado Park V, 85m²
    (891,  54000),    -- Element by Elite, monoambiente 37m²
    (1041, 250000),   -- El Mirador, 181m²
    (1074, 150000)    -- Sky Collection, 2 dorm 115m²
)
UPDATE propiedades_v2 p
SET precio_usd = pr.precio_real_usd,
    precio_usd_actualizado = pr.precio_real_usd,
    depende_de_tc = false,
    requiere_actualizacion_precio = false
FROM precios_reales pr
WHERE p.id = pr.id;

-- PARTE 4: Actualizar candados existentes (22 props) — valor_original al precio corregido
WITH candados_update (id, precio_real_usd) AS (
  VALUES
    (30,   65000),
    (61,   168000),
    (832,  229500),
    (180,  63000),
    (429,  63000),
    (430,  135000),
    (479,  110000),
    (497,  61000),
    (499,  109990),
    (500,  163117),
    (501,  173250),
    (506,  118300),
    (562,  98100),
    (563,  89900),
    (564,  99900),
    (565,  85353),
    (572,  65000),
    (585,  210000),
    (627,  87500),
    (635,  50000),
    (816,  140000),
    (891,  54000)
)
UPDATE propiedades_v2 p
SET campos_bloqueados = jsonb_set(
      p.campos_bloqueados,
      '{precio_usd,valor_original}',
      to_jsonb(cu.precio_real_usd)
    )
FROM candados_update cu
WHERE p.id = cu.id
  AND p.campos_bloqueados->'precio_usd' IS NOT NULL;

-- PARTE 5: Crear candado nuevo (4 props sin candado: 198, 453, 1041, 1074)
WITH candados_nuevos (id, precio_real_usd) AS (
  VALUES
    (198,  128000),
    (453,  129000),
    (1041, 250000),
    (1074, 150000)
)
UPDATE propiedades_v2 p
SET campos_bloqueados = COALESCE(p.campos_bloqueados, '{}'::jsonb) || jsonb_build_object(
      'precio_usd', jsonb_build_object(
        'bloqueado', true,
        'por', 'migracion_178',
        'fecha', NOW()::text,
        'usuario_id', 'migracion_178',
        'usuario_nombre', 'Migración 178 — corrección CASO 2',
        'valor_original', cn.precio_real_usd
      )
    )
FROM candados_nuevos cn
WHERE p.id = cn.id;

-- PARTE 6: Normalizar Villa Brígida → Villa Brigida (31 props con tilde)
UPDATE propiedades_v2
SET zona = 'Villa Brigida'
WHERE zona = 'Villa Brígida';

-- ============================================================
-- Verificación post-migración:
-- ============================================================
-- 1. Confirmar 26 props corregidas:
--    SELECT id, precio_usd, depende_de_tc,
--           (campos_bloqueados->'precio_usd'->>'valor_original')::numeric as candado_valor
--    FROM propiedades_v2
--    WHERE id IN (30,61,832,180,198,429,430,453,479,497,499,500,501,506,
--                 562,563,564,565,572,585,627,635,816,891,1041,1074)
--    ORDER BY id;
--
-- 2. Confirmar ID 1105 excluido:
--    SELECT id, status FROM propiedades_v2 WHERE id = 1105;
--
-- 3. Confirmar Villa Brígida normalizada:
--    SELECT zona, COUNT(*) FROM propiedades_v2
--    WHERE zona LIKE '%Br%gida%' GROUP BY zona;
--    -- Esperado: solo 'Villa Brigida' con ~98 props
--
-- 4. Props activas con ratio > 1.15 (solo enrichment regex corrupto, NO inflación):
--    SELECT id, precio_usd,
--           (datos_json_enrichment->>'precio_usd_original')::numeric as enrich_precio,
--           ROUND(precio_usd / NULLIF((datos_json_enrichment->>'precio_usd_original')::numeric, 0), 2) as ratio
--    FROM propiedades_v2
--    WHERE tipo_operacion = 'venta' AND status = 'completado'
--      AND duplicado_de IS NULL AND precio_usd IS NOT NULL
--      AND (datos_json_enrichment->>'precio_usd_original')::numeric > 0
--      AND precio_usd / (datos_json_enrichment->>'precio_usd_original')::numeric > 1.15;
--    -- Esperado: 5 props (335,459,629,824,826) — enrichment regex corrupto, precio_usd correcto
-- ============================================================
