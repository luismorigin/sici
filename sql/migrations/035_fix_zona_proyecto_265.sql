-- =====================================================
-- MIGRACION 035: Fix zona proyecto ID 265
-- Fecha: 11 Enero 2026
-- Problema: Proyecto cae dentro de polígono Equipetrol pero tiene 'Sin zona'
-- Causa: crear_proyecto_desde_sugerencia() no llamó get_zona_by_gps()
-- =====================================================

-- Verificar estado actual
SELECT
    id_proyecto_master,
    nombre_oficial,
    zona as zona_actual,
    latitud,
    longitud
FROM proyectos_master
WHERE id_proyecto_master = 265;

-- Fix: Asignar zona correcta
UPDATE proyectos_master
SET zona = 'Equipetrol',
    updated_at = NOW()
WHERE id_proyecto_master = 265
  AND zona = 'Sin zona';

-- Verificar fix
SELECT
    id_proyecto_master,
    nombre_oficial,
    zona as zona_nueva,
    'Corregido' as status
FROM proyectos_master
WHERE id_proyecto_master = 265;

SELECT 'Migracion 035 completada - Proyecto 265 corregido' as status;
