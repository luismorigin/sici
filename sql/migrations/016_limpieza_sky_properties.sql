-- =====================================================
-- MIGRACIÓN 016: Limpieza Sky Properties
-- Fecha: 4 Enero 2026
-- Propósito: Corregir duplicados, GPS incorrectos,
--            y propiedades mal asignadas
-- =====================================================
-- EJECUTAR PASO A PASO - NO CORRER TODO DE UNA VEZ
-- =====================================================

-- =====================================================
-- FASE 0: BACKUP (OBLIGATORIO)
-- =====================================================
CREATE TABLE proyectos_master_backup_20260104 AS
SELECT * FROM proyectos_master;

CREATE TABLE propiedades_v2_backup_20260104 AS
SELECT id, id_proyecto_master, metodo_match, nombre_edificio
FROM propiedades_v2;

CREATE TABLE matching_sugerencias_backup_20260104 AS
SELECT * FROM matching_sugerencias
WHERE proyecto_master_sugerido IN (51, 107, 100, 105, 110);

-- Verificar backups
SELECT 'proyectos_master_backup' as tabla, COUNT(*) as registros
FROM proyectos_master_backup_20260104
UNION ALL
SELECT 'propiedades_backup', COUNT(*) FROM propiedades_v2_backup_20260104
UNION ALL
SELECT 'sugerencias_backup', COUNT(*) FROM matching_sugerencias_backup_20260104;

-- =====================================================
-- FASE 1: CREAR PROYECTOS NUEVOS (antes de reasignar)
-- =====================================================

-- 1.1 Eurodesign Soho (el GPS de ID 51 es de este edificio)
INSERT INTO proyectos_master (
    nombre_oficial,
    desarrollador,
    zona,
    activo,
    google_place_id,
    latitud,
    longitud,
    notas
)
VALUES (
    'Eurodesign Soho',
    'Eurodesign',
    'Equipetrol',
    true,
    'ChIJy--AitXn8ZMRmIMtBfoaz4Y',
    -17.7693967,
    -63.1968892,
    'Creado desde limpieza Sky Properties - GPS era de ID 51'
)
RETURNING id_proyecto_master;
-- ⚠️ ANOTAR ID RETORNADO: ___________

-- 1.2 Sky Icon (propiedad 322 menciona este edificio)
INSERT INTO proyectos_master (
    nombre_oficial,
    desarrollador,
    zona,
    activo,
    notas
)
VALUES (
    'Sky Icon',
    'Sky Properties',
    'Equipetrol',
    true,
    'Creado desde limpieza Sky Properties - prop 322'
)
RETURNING id_proyecto_master;
-- ⚠️ ANOTAR ID RETORNADO: ___________

-- 1.3 Otros proyectos faltantes (sin propiedades asignadas por ahora)
INSERT INTO proyectos_master (nombre_oficial, desarrollador, zona, activo)
VALUES
    ('Sky Aqualina Residence', 'Sky Properties', 'Equipetrol', true),
    ('Madero Residence', 'Sky Properties', 'Equipetrol', true),
    ('Westgate', 'Sky Properties', 'Equipetrol', true),
    ('Sky Plaza Italia', 'Sky Properties', 'Equipetrol', true);

-- Verificar proyectos creados
SELECT id_proyecto_master, nombre_oficial
FROM proyectos_master
WHERE nombre_oficial IN ('Eurodesign Soho', 'Sky Icon', 'Sky Aqualina Residence',
                         'Madero Residence', 'Westgate', 'Sky Plaza Italia');

-- =====================================================
-- FASE 2: REASIGNAR PROPIEDADES
-- =====================================================
-- IMPORTANTE: Usar los IDs anotados en Fase 1

-- 2.1 Propiedades de ID 51 (mal nombrado como Art Deco)
-- Prop 173 (ART DECO) → ID 58 (Sky Collection Art Deco correcto)
UPDATE propiedades_v2
SET id_proyecto_master = 58,
    metodo_match = 'correccion_manual_limpieza_2026-01-04'
WHERE id = 173;

-- Prop 194 (URL dice eurodesign-soho) → Eurodesign Soho nuevo
-- ⚠️ REEMPLAZAR [ID_EURODESIGN_SOHO] con el ID anotado
UPDATE propiedades_v2
SET id_proyecto_master = [ID_EURODESIGN_SOHO],
    metodo_match = 'correccion_manual_limpieza_2026-01-04'
WHERE id = 194;

-- Prop 182 ("De Pre" = error scraper, tomó "De Pre-venta") → ID 16 (Sky Level)
-- GPS -17.7689, -63.1969 corresponde a Sky Level
UPDATE propiedades_v2
SET id_proyecto_master = 16,
    metodo_match = 'correccion_manual_limpieza_2026-01-04'
WHERE id = 182;

-- 2.2 Propiedades de ID 110 (Condominio Sky genérico)
-- Prop 204 (Sky Art Deco) → ID 145 (Sky art decor - Enrique Finot 361)
-- GPS -17.7707, -63.1944 corresponde a Sky art decor, NO a Sky Collection Art Deco
UPDATE propiedades_v2
SET id_proyecto_master = 145,
    metodo_match = 'correccion_manual_limpieza_2026-01-04'
WHERE id = 204;

-- Prop 238 (Sky Tower) → ID 48 (Sky Tower)
UPDATE propiedades_v2
SET id_proyecto_master = 48,
    metodo_match = 'correccion_manual_limpieza_2026-01-04'
WHERE id = 238;

-- Prop 322 (SKY ICON) → Sky Icon nuevo
-- ⚠️ REEMPLAZAR [ID_SKY_ICON] con el ID anotado
UPDATE propiedades_v2
SET id_proyecto_master = [ID_SKY_ICON],
    metodo_match = 'correccion_manual_limpieza_2026-01-04'
WHERE id = 322;

-- Verificar reasignaciones
SELECT
    pv.id,
    pv.nombre_edificio,
    pv.id_proyecto_master,
    pm.nombre_oficial as proyecto_nuevo,
    pv.metodo_match
FROM propiedades_v2 pv
LEFT JOIN proyectos_master pm ON pm.id_proyecto_master = pv.id_proyecto_master
WHERE pv.id IN (173, 182, 194, 204, 238, 322);

-- =====================================================
-- FASE 3: LIMPIAR SUGERENCIAS HISTÓRICAS (FK constraint)
-- =====================================================

-- Limpiar sugerencias de proyectos que serán eliminados
DELETE FROM matching_sugerencias
WHERE proyecto_master_sugerido IN (107, 100, 105, 51, 110);

-- Verificar limpieza
SELECT COUNT(*) as sugerencias_restantes
FROM matching_sugerencias
WHERE proyecto_master_sugerido IN (107, 100, 105, 51, 110);
-- Debe dar 0

-- =====================================================
-- FASE 4: ELIMINAR PROYECTOS PROBLEMÁTICOS
-- =====================================================

-- 4.1 Verificar que no queden propiedades asignadas
SELECT id_proyecto_master, COUNT(*) as props
FROM propiedades_v2
WHERE id_proyecto_master IN (107, 100, 105, 51, 110)
GROUP BY id_proyecto_master;
-- Debe dar 0 rows o todas con 0 props

-- 4.2 Eliminar duplicados confirmados (0 propiedades)
DELETE FROM proyectos_master
WHERE id_proyecto_master IN (107, 100, 105);
-- 107: Condominio Sky Eclipse (duplicado de 30)
-- 100: Condominio SKY Élite (duplicado de 7)
-- 105: Condominio SKY LEVEL (duplicado de 16)

-- 4.3 Eliminar ID 51 (era Eurodesign Soho, no Art Deco)
DELETE FROM proyectos_master WHERE id_proyecto_master = 51;

-- 4.4 Eliminar ID 110 (Condominio Sky genérico)
DELETE FROM proyectos_master WHERE id_proyecto_master = 110;

-- Verificar eliminaciones
SELECT COUNT(*) as eliminados_pendientes
FROM proyectos_master
WHERE id_proyecto_master IN (107, 100, 105, 51, 110);
-- Debe dar 0

-- =====================================================
-- FASE 5: ACTUALIZAR METADATA
-- =====================================================

-- 5.1 Corregir typo en Sky Collection
UPDATE proyectos_master
SET nombre_oficial = 'Sky Collection Equipetrol'
WHERE id_proyecto_master = 104;

-- 5.2 Asignar desarrollador a todos los Sky sin desarrollador
UPDATE proyectos_master
SET desarrollador = 'Sky Properties'
WHERE id_proyecto_master IN (
    58, 62, 50, 222, 142, 140, 144, 141, 106, 108, 109, 135, 145, 104
)
AND (desarrollador IS NULL OR desarrollador = '');

-- 5.3 Quitar Sky Properties de Green Tower (no es Sky)
UPDATE proyectos_master
SET desarrollador = NULL,
    notas = COALESCE(notas, '') || ' | Corregido: no es Sky Properties'
WHERE id_proyecto_master = 23;

-- =====================================================
-- FASE 6: VERIFICACIÓN FINAL
-- =====================================================

-- Estado final de proyectos Sky
SELECT
    id_proyecto_master,
    nombre_oficial,
    desarrollador,
    (SELECT COUNT(*) FROM propiedades_v2 pv
     WHERE pv.id_proyecto_master = pm.id_proyecto_master) as propiedades
FROM proyectos_master pm
WHERE nombre_oficial ILIKE '%sky%'
ORDER BY nombre_oficial;

-- Propiedades huérfanas (sin proyecto asignado que deberían tener)
SELECT id, nombre_edificio, url
FROM propiedades_v2
WHERE id_proyecto_master IS NULL
  AND nombre_edificio ILIKE '%sky%';

-- Resumen
SELECT
    'Proyectos Sky' as metrica,
    COUNT(*) as valor
FROM proyectos_master WHERE nombre_oficial ILIKE '%sky%'
UNION ALL
SELECT 'Con desarrollador', COUNT(*)
FROM proyectos_master WHERE desarrollador = 'Sky Properties'
UNION ALL
SELECT 'Props corregidas hoy', COUNT(*)
FROM propiedades_v2 WHERE metodo_match LIKE '%2026-01-04%';

-- =====================================================
-- ROLLBACK (si algo sale mal)
-- =====================================================
/*
-- Restaurar proyectos
INSERT INTO proyectos_master
SELECT * FROM proyectos_master_backup_20260104
WHERE id_proyecto_master NOT IN (SELECT id_proyecto_master FROM proyectos_master);

-- Restaurar propiedades
UPDATE propiedades_v2 pv
SET id_proyecto_master = b.id_proyecto_master,
    metodo_match = b.metodo_match
FROM propiedades_v2_backup_20260104 b
WHERE pv.id = b.id;

-- Restaurar sugerencias
INSERT INTO matching_sugerencias
SELECT * FROM matching_sugerencias_backup_20260104;
*/
