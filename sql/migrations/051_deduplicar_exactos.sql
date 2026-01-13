-- =====================================================
-- MIGRACION 051: Deduplicar registros exactos
-- Fecha: 13 Enero 2026
-- Proposito: Marcar duplicados con MISMA foto + descripcion + precio
-- NO toca multiproyectos (MARE, ITAJU, T-VEINTICINCO)
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Condominio Avanti: ID 38 es duplicado de 35
-- Evidencia: MISMA foto (QsjxagiPJX9d3a4svu7Y.jpg)
UPDATE propiedades_v2
SET duplicado_de = 35
WHERE id = 38;

-- Edificio Spazios $57,153: IDs 350,351 son duplicados de 349
-- Evidencia: MISMA foto (69285a6218459.jpg)
UPDATE propiedades_v2
SET duplicado_de = 349
WHERE id IN (350, 351);

-- Edificio Spazios $58,547: IDs 345,346 son duplicados de 343
-- Evidencia: MISMA foto (69285d0471eeb.jpg)
UPDATE propiedades_v2
SET duplicado_de = 343
WHERE id IN (345, 346);

-- Spazios Edén: ID 344 es duplicado de 342
-- Evidencia: MISMA foto (69285bede222c.jpg)
UPDATE propiedades_v2
SET duplicado_de = 342
WHERE id = 344;

-- SANTORINI VENTURA $70,402: IDs 118,119 son duplicados de 120
-- Evidencia: Mismo precio/area/dorms, conservar el de mas fotos (10)
UPDATE propiedades_v2
SET duplicado_de = 120
WHERE id IN (118, 119);

-- Verificar resultado
SELECT 'Duplicados marcados en migracion 051:' as status;

SELECT
  pm.nombre_oficial as proyecto,
  p.duplicado_de as id_original,
  ARRAY_AGG(p.id ORDER BY p.id) as ids_marcados,
  COUNT(*) as cantidad
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.duplicado_de IN (35, 349, 343, 342, 120)
GROUP BY pm.nombre_oficial, p.duplicado_de
ORDER BY pm.nombre_oficial;

-- Resumen total de duplicados en el sistema
SELECT 'Total duplicados marcados en sistema:' as info;
SELECT COUNT(*) as total_duplicados
FROM propiedades_v2
WHERE duplicado_de IS NOT NULL;
