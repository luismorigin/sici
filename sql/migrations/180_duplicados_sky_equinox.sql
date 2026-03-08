-- ============================================================
-- Migración 180: Marcar 7 duplicados Sky Equinox como duplicado_de = 999
-- Fecha: 2026-03-08
-- ============================================================
-- IDs 1000-1004, 1049, 1050: todos monoambientes ~35m² Sky Equinox,
-- mismas coordenadas GPS (-17.7655, -63.2047), URLs distintas de C21.
-- ID 999 ya matcheado a PM 50 (Condominio SKY EQUINOX).

UPDATE propiedades_v2
SET duplicado_de = 999
WHERE id IN (1000, 1001, 1002, 1003, 1004, 1049, 1050);

-- ============================================================
-- Verificación:
-- ============================================================
-- SELECT id, status, duplicado_de, nombre_edificio
-- FROM propiedades_v2
-- WHERE id IN (999, 1000, 1001, 1002, 1003, 1004, 1049, 1050)
-- ORDER BY id;
-- Esperado: 999 = completado, resto = duplicado con duplicado_de = 999
-- ============================================================
