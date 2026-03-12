-- Migración 192: Marcar 7 duplicados en Lofty Island
-- Criterio: same-source + mismo agente + mismo dorms + área ±2m²
-- Desempate: 1) fecha_publicacion más nueva, 2) más fotos, 3) ID mayor
--
-- Remax (agente: Laurent Lorena Eguez Alvarez):
--   1D 68.19m²: 44=49 (precio exacto) → conservar 49
--   1D 69.76m²: 48=50, 510=511 (exactos) + 50≈511 (probable, ±3%) → conservar 511
--   2D 101.46m²: 51=52 (exacto) + 45≈52 (probable, ±3%) → conservar 52
-- C21 (agente: Fernando Talavera):
--   2D 101.46m²: 597=823 (precio exacto) → conservar 823 (más reciente)

BEGIN;

UPDATE propiedades_v2
SET duplicado_de = 49
WHERE id = 44;

UPDATE propiedades_v2
SET duplicado_de = 511
WHERE id IN (48, 50, 510);

UPDATE propiedades_v2
SET duplicado_de = 52
WHERE id IN (45, 51);

UPDATE propiedades_v2
SET duplicado_de = 823
WHERE id = 597;

-- Verificar: 7 filas actualizadas
SELECT id, nombre_edificio, dormitorios, area_total_m2, duplicado_de,
       datos_json_enrichment->>'agente_nombre' as agente
FROM propiedades_v2
WHERE id IN (44, 48, 50, 510, 45, 51, 597)
ORDER BY duplicado_de, id;

COMMIT;
