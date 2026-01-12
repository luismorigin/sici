-- =====================================================
-- MIGRACION 036: Recalcular zonas de proyectos por GPS
-- Fecha: 11 Enero 2026
-- Problema: Proyectos tienen "Equipetrol" genérico en vez de microzona correcta
-- Causa: get_zona_by_gps() nunca se llamó al crear proyectos
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR - REVISAR ANTES DE EJECUTAR
-- =====================================================

-- =====================================================
-- PASO 1: Agregar columna backup (si no existe)
-- =====================================================
ALTER TABLE proyectos_master
ADD COLUMN IF NOT EXISTS zona_anterior TEXT;

COMMENT ON COLUMN proyectos_master.zona_anterior IS
'Backup de zona antes de migración 036 (11 Ene 2026). Permite revertir si hay problemas.';

-- =====================================================
-- PASO 2: Backup de zonas actuales
-- =====================================================
UPDATE proyectos_master
SET zona_anterior = zona
WHERE zona_anterior IS NULL;

-- =====================================================
-- PASO 3: Vista previa de cambios (NO EJECUTA CAMBIOS)
-- =====================================================
SELECT 'VISTA PREVIA - Cambios que se aplicarán:' as info;

SELECT
    pm.id_proyecto_master,
    pm.nombre_oficial,
    pm.zona as zona_actual,
    COALESCE(
        (SELECT zg.nombre
         FROM zonas_geograficas zg
         WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
         LIMIT 1),
        'Sin zona'
    ) as zona_nueva,
    CASE
        WHEN pm.zona != COALESCE(
            (SELECT zg.nombre
             FROM zonas_geograficas zg
             WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
             LIMIT 1),
            'Sin zona'
        ) THEN 'CAMBIO'
        ELSE 'sin cambio'
    END as accion,
    pm.latitud,
    pm.longitud
FROM proyectos_master pm
WHERE pm.activo = true
  AND pm.latitud IS NOT NULL
  AND pm.longitud IS NOT NULL
ORDER BY
    CASE WHEN pm.zona != COALESCE(
        (SELECT zg.nombre
         FROM zonas_geograficas zg
         WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
         LIMIT 1),
        'Sin zona'
    ) THEN 0 ELSE 1 END,
    pm.zona,
    pm.nombre_oficial;

-- =====================================================
-- PASO 4: Resumen de cambios
-- =====================================================
SELECT 'RESUMEN - Proyectos por tipo de cambio:' as info;

SELECT
    pm.zona as zona_actual,
    COALESCE(
        (SELECT zg.nombre
         FROM zonas_geograficas zg
         WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
         LIMIT 1),
        'Sin zona'
    ) as zona_nueva,
    COUNT(*) as proyectos,
    STRING_AGG(pm.nombre_oficial, ', ' ORDER BY pm.nombre_oficial)
        FILTER (WHERE pm.id_proyecto_master <= 5) as ejemplos
FROM proyectos_master pm
WHERE pm.activo = true
  AND pm.latitud IS NOT NULL
  AND pm.longitud IS NOT NULL
  AND pm.zona != COALESCE(
      (SELECT zg.nombre
       FROM zonas_geograficas zg
       WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
       LIMIT 1),
      'Sin zona'
  )
GROUP BY zona_actual, zona_nueva
ORDER BY proyectos DESC;

-- =====================================================
-- PASO 5: UPDATE (COMENTADO - DESCOMENTAR PARA EJECUTAR)
-- =====================================================
/*
UPDATE proyectos_master pm
SET
    zona = COALESCE(
        (SELECT zg.nombre
         FROM zonas_geograficas zg
         WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
         LIMIT 1),
        'Sin zona'
    ),
    updated_at = NOW()
WHERE pm.activo = true
  AND pm.latitud IS NOT NULL
  AND pm.longitud IS NOT NULL
  AND pm.zona != COALESCE(
      (SELECT zg.nombre
       FROM zonas_geograficas zg
       WHERE ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
       LIMIT 1),
      'Sin zona'
  );
*/

-- =====================================================
-- PASO 6: Verificación post-UPDATE (después de ejecutar PASO 5)
-- =====================================================
/*
SELECT 'VERIFICACION POST-UPDATE:' as info;

SELECT
    zona,
    COUNT(*) as proyectos
FROM proyectos_master
WHERE activo = true
GROUP BY zona
ORDER BY proyectos DESC;

-- Verificar que zona_anterior tiene backup
SELECT
    COUNT(*) as total,
    COUNT(zona_anterior) as con_backup,
    COUNT(*) - COUNT(zona_anterior) as sin_backup
FROM proyectos_master
WHERE activo = true;
*/

-- =====================================================
-- ROLLBACK (en caso de problemas)
-- =====================================================
/*
UPDATE proyectos_master
SET zona = zona_anterior
WHERE zona_anterior IS NOT NULL;
*/

SELECT 'Migración 036 preparada - Revisar VISTA PREVIA antes de ejecutar UPDATE' as status;
