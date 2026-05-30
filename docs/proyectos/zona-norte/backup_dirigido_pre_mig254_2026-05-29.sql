-- =============================================================================
-- BACKUP DIRIGIDO PRE-MIGRACIÓN 254 — Microzonas Zona Norte
-- =============================================================================
-- Fecha     : 2026-05-29
-- Generado  : Claude vía MCP postgres-sici (readonly), estado leído de producción
-- Branch    : feat/zn-microzonas-aplicacion
-- Propósito : Restaurar el estado EXACTO de las filas que la mig 254 modifica,
--             si el rollback estándar (254_..._rollback.sql) no alcanzara.
--
-- COBERTURA (todo lo que 254 muta):
--   - propiedades_v2 : zona/microzona de 520 props (zona='Zona Norte')
--   - proyectos_master : zona de 73 pm (zona='Zona Norte')
--   - matching_sugerencias : estado de 149 filas (estado='pendiente_zn')
--   - zonas_geograficas : 1 macro reactivado + 14 polígonos nuevos borrados
--
-- DELTA vs el rollback estándar (lo que ESTE backup agrega):
--   1. Los 3 props anómalos (843, 1018 microzona='Sin zona'; 1942 microzona=NULL)
--      que el rollback estándar dejaría en microzona='Zona Norte' (pérdida de dato).
--   2. Restauración de sugerencias por ID EXACTO (149 ids capturados), en vez de
--      por estado (que podría pisar filas 'pendiente_zona_norte' creadas después).
--
-- USO: aplicar dentro de su BEGIN/COMMIT. Es idempotente.
-- =============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. propiedades_v2 — 520 props ZN
-- ----------------------------------------------------------------------------
-- Paso A: restaurar las 520 a su zona macro (zona='Zona Norte').
-- Tras la mig 254 estas props tienen zona = nombre de microzona específica
-- (las que cayeron en gap siguen en 'Zona Norte'). Este UPDATE las cubre todas.
UPDATE propiedades_v2
SET zona = 'Zona Norte', microzona = 'Zona Norte'
WHERE zona IN (
  '2do-3er anillo La Salle-Banzer','2do-3er anillo Banzer-Alemana',
  '2do-3er anillo Alemana-Mutualista','3er-4to anillo La Salle-Banzer',
  '3er-4to anillo Banzer-Alemana','3er-4to anillo Alemana-Mutualista',
  '4to-6to anillo Radial 26-Banzer','4to-6to anillo Banzer-Alemana',
  '4to-6to anillo Alemana-Mutualista','6to-8vo anillo Radial 26-Banzer',
  '6to-8vo anillo Banzer-Alemana','6to-8vo anillo Alemana-Mutualista',
  '8vo anillo Paraiso - Radial 26-Banzer','8vo anillo Viru Viru - Banzer-G77',
  'Zona Norte'
);

-- Paso B: corregir los 3 props ANÓMALOS a su microzona original exacta.
-- (Antes de mig 254: zona='Zona Norte' pero microzona != 'Zona Norte'.)
UPDATE propiedades_v2 SET microzona = 'Sin zona' WHERE id IN (843, 1018);
UPDATE propiedades_v2 SET microzona = NULL       WHERE id = 1942;

-- ----------------------------------------------------------------------------
-- 2. proyectos_master — 73 pm ZN
-- ----------------------------------------------------------------------------
UPDATE proyectos_master
SET zona = 'Zona Norte'
WHERE zona IN (
  '2do-3er anillo La Salle-Banzer','2do-3er anillo Banzer-Alemana',
  '2do-3er anillo Alemana-Mutualista','3er-4to anillo La Salle-Banzer',
  '3er-4to anillo Banzer-Alemana','3er-4to anillo Alemana-Mutualista',
  '4to-6to anillo Radial 26-Banzer','4to-6to anillo Banzer-Alemana',
  '4to-6to anillo Alemana-Mutualista','6to-8vo anillo Radial 26-Banzer',
  '6to-8vo anillo Banzer-Alemana','6to-8vo anillo Alemana-Mutualista',
  '8vo anillo Paraiso - Radial 26-Banzer','8vo anillo Viru Viru - Banzer-G77',
  'Zona Norte'
);

-- ----------------------------------------------------------------------------
-- 3. matching_sugerencias — 149 filas (por ID exacto)
-- ----------------------------------------------------------------------------
UPDATE matching_sugerencias SET estado = 'pendiente_zn' WHERE id IN (
  3872,3873,3874,3875,3876,3877,3878,3879,3880,3881,3882,3883,3884,3885,3886,
  3887,3888,3889,3890,3891,3895,3897,3898,3899,3900,3901,3903,3904,3905,3906,
  3907,3908,3909,3910,3911,3912,3914,3921,3922,3931,3932,3981,3986,3987,3992,
  3994,3995,3997,3998,4001,4003,4005,4006,4010,4012,4013,4014,4015,4018,4019,
  4020,4021,4023,4024,4025,4026,4027,4028,4029,4030,4031,4032,4033,4034,4036,
  4037,4038,4042,4044,4045,4048,4049,4050,4051,4052,4053,4055,4056,4058,4060,
  4061,4062,4063,4064,4066,4068,4069,4070,4071,4072,4073,4074,4075,4077,4079,
  4080,4081,4082,4083,4084,4085,4087,4088,4089,4092,4095,4096,4097,4098,4099,
  4101,4102,4103,4104,4105,4108,4109,4110,4111,4112,4113,4114,4115,4116,4118,
  4119,4120,4121,4122,4123,4124,4125,4126,4127,4128,4129,4131,4132,4136
);

-- ----------------------------------------------------------------------------
-- 4. zonas_geograficas — reactivar macro + borrar las 14 microzonas nuevas
-- ----------------------------------------------------------------------------
UPDATE zonas_geograficas SET activo = TRUE WHERE nombre = 'Zona Norte';

DELETE FROM zonas_geograficas
WHERE zona_general = 'Zona Norte'
  AND nombre IN (
    '2do-3er anillo La Salle-Banzer','2do-3er anillo Banzer-Alemana',
    '2do-3er anillo Alemana-Mutualista','3er-4to anillo La Salle-Banzer',
    '3er-4to anillo Banzer-Alemana','3er-4to anillo Alemana-Mutualista',
    '4to-6to anillo Radial 26-Banzer','4to-6to anillo Banzer-Alemana',
    '4to-6to anillo Alemana-Mutualista','6to-8vo anillo Radial 26-Banzer',
    '6to-8vo anillo Banzer-Alemana','6to-8vo anillo Alemana-Mutualista',
    '8vo anillo Paraiso - Radial 26-Banzer','8vo anillo Viru Viru - Banzer-G77'
  );

COMMIT;

-- =============================================================================
-- VALIDACIÓN POST-RESTAURACIÓN (esperado tras aplicar este backup)
-- =============================================================================
--   SELECT COUNT(*) FROM propiedades_v2 WHERE zona='Zona Norte';          -- 520
--   SELECT microzona, COUNT(*) FROM propiedades_v2 WHERE zona='Zona Norte'
--     GROUP BY microzona;  -- 'Zona Norte'=517, 'Sin zona'=2, NULL=1
--   SELECT COUNT(*) FROM proyectos_master WHERE zona='Zona Norte';        -- 73
--   SELECT COUNT(*) FROM matching_sugerencias WHERE estado='pendiente_zn';-- 149
--   SELECT COUNT(*) FROM zonas_geograficas WHERE zona_general='Zona Norte';-- 1
-- =============================================================================
-- NOTA: este backup NO restaura el trigger HITL ni get_zona_by_gps(). Para eso
-- usar 254_..._rollback.sql (PASO 1 y PASO 7), que sí los revierte.
-- Este archivo es complementario: cubre el estado de DATOS con precisión exacta.
-- =============================================================================
