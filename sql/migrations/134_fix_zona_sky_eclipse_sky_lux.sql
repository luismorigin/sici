-- Migración 134: Fix zona Sky Eclipse + Sky Lux
-- Sky Eclipse (proyecto 30): zona proyecto = Faremafu (Eq. Oeste)
-- 6 propiedades tienen GPS que cae en polígono "Equipetrol" pero el edificio está en Faremafu
-- Sky Lux ID 308: verificar zona correcta según proyecto (Villa Brigida)

-- Fix 1: Sky Eclipse - mover 6 propiedades de Eq. Centro a Eq. Oeste
-- IDs: 31, 56, 59, 61, 62, 579 — todas del proyecto 30 (Sky Eclipse)
UPDATE propiedades_v2
SET microzona = 'Faremafu', zona = 'Equipetrol Oeste'
WHERE id IN (31, 56, 59, 61, 62, 579)
  AND id_proyecto_master = 30;

-- Verificación
-- SELECT id, zona, microzona FROM propiedades_v2 WHERE id_proyecto_master = 30 AND status = 'completado';
