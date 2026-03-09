-- ============================================================
-- Migración 182: Normalizar 51 props con zona problemática
-- Fecha: 2026-03-09
-- ============================================================
-- Contexto:
--   Auditoría PostGIS reveló 51 props activas con zona incorrecta:
--   - 22 con zona = 'Equipetrol Centro' (valor legacy, NO es microzona válida)
--   - 29 con zona = NULL (proyectos "Sin zona", GPS fuera de polígonos)
--
-- Acciones:
--   PARTE 1: 13 props dentro de polígonos → corregir zona/microzona
--   PARTE 2: 45 props fuera de polígonos → excluida_zona
--   NOTA: ID 1021 (Giardino) corregido manualmente a Sirari, no incluido aquí
-- ============================================================

-- ============================================================
-- PARTE 1: Corregir zona/microzona de 13 props DENTRO de polígonos
-- (todas tenían zona = 'Equipetrol Centro', PostGIS confirmó microzona real)
-- ============================================================

-- 7 props → Equipetrol
UPDATE propiedades_v2
SET zona = 'Equipetrol', microzona = 'Equipetrol'
WHERE id IN (
  837,   -- Edificio Spazios
  842,   -- Edificio Macororó 11
  902,   -- Nomad by Smart Studio
  910,   -- Edificio Aura Concept
  971,   -- Sky Onix
  980,   -- Madero Residence
  1096   -- Edificio Fragata
);

-- 5 props → Villa Brigida
UPDATE propiedades_v2
SET zona = 'Villa Brigida', microzona = 'Villa Brigida'
WHERE id IN (
  1011,  -- + Plus Isuto
  1061,  -- Stone 3
  1064,  -- Stone 3
  1069,  -- Portobello 5
  1071   -- Portobello 5
);

-- 1 prop → Faremafu
UPDATE propiedades_v2
SET zona = 'Faremafu', microzona = 'Faremafu'
WHERE id = 1095;  -- Sky Eclipse

-- ============================================================
-- PARTE 2: Excluir 45 props FUERA de todos los polígonos
-- (GPS válido pero fuera de cobertura de microzonas)
-- ============================================================

-- 2a. 30 props con zona = NULL, NO multiproyecto
UPDATE propiedades_v2
SET status = 'excluida_zona'
WHERE id IN (
  66,    -- Swissôtel Santa Cruz
  170,   -- Edificio Zona IC Norte (sin nombre)
  171,   -- Edificio Zona IC Norte (sin nombre)
  219,   -- Nancy 2
  231,   -- La Casona Dpto
  232,   -- Canal Isuto (Smart Studio Isuto)
  233,   -- Ruben Dario Vazquez (One Isuto)
  243,   -- La Casona
  255,   -- Portofino Novo
  257,   -- Multifamiliar (Torre La Salle)
  279,   -- Ovidio Barbery (Edificio Ankay)
  280,   -- Edificio Ankay
  286,   -- (sin nombre de edificio)
  392,   -- Swissôtel Santa Cruz
  395,   -- Condominio Curupau Isuto
  415,   -- Condominio Curupau Isuto
  431,   -- One Isuto Av La Salle
  477,   -- Leblon
  587,   -- Barcelona 04 / Miro Tower (1D)
  588,   -- Barcelona 04 / Miro Tower (1D)
  589,   -- Barcelona 04 / Miro Tower (1D)
  590,   -- Miro Tower
  591,   -- Miro Tower
  592,   -- Barcelona 04 / Miro Tower (3D)
  593,   -- Barcelona 04 / Miro Tower (2D)
  594,   -- Barcelona 04 / Miro Tower (2D)
  1013,  -- Miro Tower
  1014,  -- Miro Tower
  1015,  -- Miro Tower
  1041   -- Edificio El Mirador de Equipetrol
);

-- 2b. 7 props con zona = 'Equipetrol Centro', fuera de polígonos
UPDATE propiedades_v2
SET status = 'excluida_zona'
WHERE id IN (
  586,   -- Miro Tower (zona era 'Equipetrol Centro')
  1018,  -- Stone 4
  1060,  -- Stone 4
  1062,  -- Stone 4
  1065,  -- Stone 4
  1066,  -- Condominio Portobello Isuto
  1067   -- Condominio Portobello Isuto
);

-- 2c. 8 props Miro Tower multiproyecto (ya filtradas por es_multiproyecto=true,
--     pero excluir para consistencia y evitar confusión)
UPDATE propiedades_v2
SET status = 'excluida_zona'
WHERE id IN (
  605,   -- Miro Tower (multiproyecto)
  606,   -- Miro Tower (multiproyecto)
  607,   -- Miro Tower (multiproyecto)
  608,   -- Miro Tower (multiproyecto)
  610,   -- Miro Tower (multiproyecto)
  978,   -- Miro Tower (multiproyecto)
  979,   -- Miro Tower (multiproyecto)
  1076   -- Miro Tower (multiproyecto)
);

-- ============================================================
-- Verificación PARTE 1 — 13 props con zona corregida:
-- ============================================================
-- SELECT id, nombre_edificio, zona, microzona
-- FROM propiedades_v2
-- WHERE id IN (837, 842, 902, 910, 971, 980, 1096,
--              1011, 1061, 1064, 1069, 1071,
--              1095)
-- ORDER BY zona, id;
-- Esperado: 7 Equipetrol, 5 Villa Brigida, 1 Faremafu

-- ============================================================
-- Verificación PARTE 2 — 45 props excluidas:
-- ============================================================
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE id IN (66,170,171,219,231,232,233,243,255,257,279,280,286,392,395,
--              415,431,477,587,588,589,590,591,592,593,594,1013,1014,1015,1041,
--              586,1018,1060,1062,1065,1066,1067,
--              605,606,607,608,610,978,979,1076)
--   AND status = 'excluida_zona';
-- Esperado: 45

-- ============================================================
-- Verificación final — 'Equipetrol Centro' eliminado de props activas:
-- ============================================================
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE zona = 'Equipetrol Centro'
--   AND status IN ('completado', 'actualizado');
-- Esperado: 0
