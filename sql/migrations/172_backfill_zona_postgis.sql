-- Migración 172: Backfill zona y microzona para propiedades de venta sin zona usando PostGIS
--
-- 232 propiedades de venta tienen zona IS NULL y microzona IS NULL.
-- Todas tienen GPS (latitud/longitud). El trigger PostGIS solo existía para alquileres.
--
-- Fix: derivar zona y microzona desde zonas_geograficas usando ST_Contains.
-- Usa nombres crudos (= zonas_geograficas.nombre), consistente con migración 171.
--
-- Afecta: ~232 propiedades de venta
-- Ejecutar DESPUÉS de migración 171.
--
-- Verificación pre-ejecución:
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL
--   AND zona IS NULL AND latitud IS NOT NULL;
-- Esperado: 232

UPDATE propiedades_v2 p
SET
  microzona = zg.nombre,
  zona = zg.nombre
FROM zonas_geograficas zg
WHERE p.tipo_operacion = 'venta'
  AND p.duplicado_de IS NULL
  AND p.zona IS NULL
  AND p.latitud IS NOT NULL
  AND ST_Contains(zg.geom, ST_SetSRID(ST_Point(p.longitud::float, p.latitud::float), 4326))
  AND zg.activo = TRUE;

-- Verificación post-ejecución:
--
-- 1. ¿Cuántas siguen sin zona?
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL AND zona IS NULL;
-- Esperado: 0 (o pocas si su GPS cae fuera de todos los polígonos)
--
-- 2. Distribución final de zonas:
-- SELECT zona, COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL AND zona IS NOT NULL
-- GROUP BY zona ORDER BY COUNT(*) DESC;
-- Esperado: ~660 propiedades distribuidas en 7 microzonas
--
-- 3. Consistencia zona = microzona:
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE tipo_operacion = 'venta' AND duplicado_de IS NULL
--   AND zona IS NOT NULL AND microzona IS NOT NULL AND zona != microzona;
-- Esperado: 0
