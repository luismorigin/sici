-- ============================================================
-- Migración 183: Corregir 11 props restantes con zona = 'Equipetrol Centro'
-- Fecha: 2026-03-09
-- ============================================================
-- Contexto:
--   Migración 182 limpió 13 + 45 props con zona problemática, pero quedaron
--   11 props activas con zona = 'Equipetrol Centro' (valor legacy inválido).
--   PostGIS confirmó la microzona real para 10 de ellas; ID 1021 (Giardino)
--   fue verificado manualmente como Sirari (GPS cae fuera de polígonos).
--
-- Post-migración: 'Equipetrol Centro' no debe existir en ninguna prop activa.
-- ============================================================

-- 5 props → Equipetrol
UPDATE propiedades_v2
SET zona = 'Equipetrol', microzona = 'Equipetrol'
WHERE id IN (
  716,   -- Edificio San Martín
  718,   -- Hotel Yotaú Suites
  844,   -- Madero Residence
  898,   -- Condominio Toborochi
  1045   -- Edificio Cristina
);

-- 1 prop → Equipetrol Norte/Norte
UPDATE propiedades_v2
SET zona = 'Equipetrol Norte/Norte', microzona = 'Equipetrol Norte/Norte'
WHERE id = 770;  -- Sky Moon

-- 1 prop → Faremafu
UPDATE propiedades_v2
SET zona = 'Faremafu', microzona = 'Faremafu'
WHERE id = 834;  -- Lofty Island

-- 3 props → Villa Brigida
UPDATE propiedades_v2
SET zona = 'Villa Brigida', microzona = 'Villa Brigida'
WHERE id IN (
  839,   -- Stone 3
  840,   -- Stone 3
  1086   -- Stone 3
);

-- 1 prop → Sirari (verificado manualmente, GPS fuera de polígonos)
UPDATE propiedades_v2
SET zona = 'Sirari', microzona = 'Sirari'
WHERE id = 1021;  -- Giardino

-- ============================================================
-- Verificación:
-- ============================================================
-- SELECT id, nombre_edificio, zona, microzona
-- FROM propiedades_v2
-- WHERE id IN (716, 718, 770, 834, 839, 840, 844, 898, 1021, 1045, 1086)
-- ORDER BY zona, id;
-- Esperado: 5 Equipetrol, 1 Eq Norte/Norte, 1 Faremafu, 1 Sirari, 3 V. Brigida

-- Verificación final — 'Equipetrol Centro' eliminado del sistema:
-- SELECT COUNT(*) FROM propiedades_v2 WHERE zona = 'Equipetrol Centro';
-- Esperado: 0
