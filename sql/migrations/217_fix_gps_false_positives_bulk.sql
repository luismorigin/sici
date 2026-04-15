-- ============================================================
-- Migración 217: Corregir falsos positivos del matching GPS
-- ============================================================
-- 38 propiedades fueron auto-aprobadas por GPS (<50m) pero asignadas
-- al proyecto equivocado porque hay múltiples proyectos en el mismo radio.
-- Tasa de error GPS auto-aprobado: ~33% (38/115).
--
-- Cada corrección está verificada por cruce de señales:
-- nombre_edificio, llm_output.nombre_edificio, URL del portal, PM existente.

BEGIN;

-- ============================================================
-- PARTE 1: Corregir id_proyecto_master (37 props, excl. 1415-1419 ya corregidas)
-- ============================================================

-- Domus Infinity (4 props) → pm 18
UPDATE propiedades_v2 SET id_proyecto_master = 18
WHERE id IN (246, 247, 272, 1244);

-- Edificio ITAJU (3 props) → pm 167
UPDATE propiedades_v2 SET id_proyecto_master = 167
WHERE id IN (1287, 1288, 1289);

-- Edificio Gold (2 props) → pm 89
UPDATE propiedades_v2 SET id_proyecto_master = 89
WHERE id IN (1035, 1305);

-- Sky Tower (2 props) → pm 48
UPDATE propiedades_v2 SET id_proyecto_master = 48
WHERE id IN (56, 245);

-- Props individuales
UPDATE propiedades_v2 SET id_proyecto_master = 57  WHERE id = 162;   -- Uptown Drei
UPDATE propiedades_v2 SET id_proyecto_master = 127 WHERE id = 174;   -- CONDADO IV
UPDATE propiedades_v2 SET id_proyecto_master = 13  WHERE id = 274;   -- Edificio Spazios
UPDATE propiedades_v2 SET id_proyecto_master = 2   WHERE id = 283;   -- Lofty Island
UPDATE propiedades_v2 SET id_proyecto_master = 98  WHERE id = 290;   -- Equipetrol Norte
UPDATE propiedades_v2 SET id_proyecto_master = 25  WHERE id = 305;   -- Platinum II
UPDATE propiedades_v2 SET id_proyecto_master = 40  WHERE id = 308;   -- Sky Lux
UPDATE propiedades_v2 SET id_proyecto_master = 15  WHERE id = 315;   -- Sky Moon
UPDATE propiedades_v2 SET id_proyecto_master = 330 WHERE id = 355;   -- Edificio Omnia Suites
UPDATE propiedades_v2 SET id_proyecto_master = 298 WHERE id = 428;   -- Condominio Las Palmeras
UPDATE propiedades_v2 SET id_proyecto_master = 253 WHERE id = 888;   -- TORRE ARA
UPDATE propiedades_v2 SET id_proyecto_master = 265 WHERE id = 907;   -- SMART STUDIO EQUIPE 1.0
UPDATE propiedades_v2 SET id_proyecto_master = 64  WHERE id = 958;   -- SÖLO Industrial Apartments
UPDATE propiedades_v2 SET id_proyecto_master = 280 WHERE id = 988;   -- Sky Plaza Italia
UPDATE propiedades_v2 SET id_proyecto_master = 27  WHERE id = 997;   -- Macororo 7
UPDATE propiedades_v2 SET id_proyecto_master = 76  WHERE id = 1063;  -- Stone 3
UPDATE propiedades_v2 SET id_proyecto_master = 286 WHERE id = 1199;  -- Condominio Macororo 8
UPDATE propiedades_v2 SET id_proyecto_master = 255 WHERE id = 1283;  -- T-VEINTICINCO
UPDATE propiedades_v2 SET id_proyecto_master = 134 WHERE id = 1334;  -- Condominio equipetrol
UPDATE propiedades_v2 SET id_proyecto_master = 283 WHERE id = 1411;  -- SPERANTO RESIDENZE
UPDATE propiedades_v2 SET id_proyecto_master = 63  WHERE id = 981;   -- Nomad by Smart Studio
UPDATE propiedades_v2 SET id_proyecto_master = 58  WHERE id = 1140;  -- Sky Collection Art Deco
UPDATE propiedades_v2 SET id_proyecto_master = 295 WHERE id = 1201;  -- Edificio Malibú Friendly
UPDATE propiedades_v2 SET id_proyecto_master = 333 WHERE id = 29;    -- S15 PARK

-- ID 30: Sky Luxia → pm 109 (Condominio SKY LUXIA), no pm 40
UPDATE propiedades_v2 SET id_proyecto_master = 109 WHERE id = 30;

-- ID 901: nombre_edificio dice "Macororo 12" pero LLM dice "Macororo Once" → se queda en pm 219 (Macororó 11)
-- Solo corregir nombre_edificio
UPDATE propiedades_v2 SET nombre_edificio = 'Edificio Macororó 11' WHERE id = 901;

-- ============================================================
-- PARTE 2: Agregar alias para matching futuro por nombre
-- ============================================================

UPDATE proyectos_master SET alias_conocidos = array_cat(COALESCE(alias_conocidos, '{}'), ARRAY['Condominio Nomad'])
WHERE id_proyecto_master = 63;

UPDATE proyectos_master SET alias_conocidos = array_cat(COALESCE(alias_conocidos, '{}'), ARRAY['Sky Art Collection'])
WHERE id_proyecto_master = 58;

UPDATE proyectos_master SET alias_conocidos = array_cat(COALESCE(alias_conocidos, '{}'), ARRAY['Malibú Friendly', 'Malibu Friendly'])
WHERE id_proyecto_master = 295;

-- ============================================================
-- PARTE 3: Marcar sugerencias GPS como corregidas
-- ============================================================

UPDATE matching_sugerencias
SET estado = 'rechazado',
    revisado_por = 'migracion_217_fix_gps_fp',
    fecha_revision = NOW()
WHERE metodo_matching = 'gps_verificado'
  AND estado = 'aprobado'
  AND propiedad_id IN (
    29, 30, 56, 162, 174, 245, 246, 247, 272, 274, 283, 290, 305, 308,
    315, 355, 428, 888, 907, 958, 981, 988, 997, 1035, 1063, 1140,
    1199, 1201, 1244, 1283, 1287, 1288, 1289, 1305, 1334, 1411
  );

COMMIT;
