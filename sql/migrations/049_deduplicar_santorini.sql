-- =====================================================
-- MIGRACION 049: Deduplicar SANTORINI VENTURA
-- Fecha: 13 Enero 2026
-- Proposito: Marcar duplicados y fotos rotas en SANTORINI
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Paso 1: Agregar columna duplicado_de si no existe
ALTER TABLE propiedades_v2
ADD COLUMN IF NOT EXISTS duplicado_de INTEGER REFERENCES propiedades_v2(id);

COMMENT ON COLUMN propiedades_v2.duplicado_de IS
'Si no es NULL, indica que esta propiedad es duplicado de otra.
El valor es el ID de la propiedad original.';

-- Paso 2: Marcar los 28 registros de SANTORINI

-- 2a. Fotos ROTAS (404) - IDs 71-84 (14 registros)
-- Estos tienen foto X01IDuJ7TZZRo8nUYddH.jpeg que no existe
-- Los marcamos como duplicados del ID 118 (que sí tiene foto)
UPDATE propiedades_v2
SET duplicado_de = 118
WHERE id IN (71,72,73,74,75,76,77,78,79,80,81,82,83,84);

-- 2b. Duplicados PARQUEOS $3,520 - IDs 132-143 (12 registros)
-- Todos tienen la misma foto, conservamos ID 131
UPDATE propiedades_v2
SET duplicado_de = 131
WHERE id IN (132,133,134,135,136,137,138,139,140,141,142,143);

-- 2c. Duplicados BAULERAS $12,571 misma foto - IDs 128-129 (2 registros)
-- Conservamos ID 122 (tiene foto distinta)
UPDATE propiedades_v2
SET duplicado_de = 122
WHERE id IN (128,129);

-- Verificar resultado
SELECT 'Registros marcados como duplicados:' as status, COUNT(*) as total
FROM propiedades_v2
WHERE duplicado_de IS NOT NULL;

SELECT 'Desglose por original:' as info;
SELECT
  duplicado_de as id_original,
  COUNT(*) as duplicados
FROM propiedades_v2
WHERE duplicado_de IS NOT NULL
GROUP BY duplicado_de
ORDER BY duplicado_de;
