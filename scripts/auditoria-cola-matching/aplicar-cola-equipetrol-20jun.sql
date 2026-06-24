-- Audit cola matching EQUIPETROL — 20-jun-2026
-- 12 props. 2 correcciones con nombre (FP del motor); 10 sin-nombre se DEJAN en HITL (política founder).
-- Generado por /audit-cola-matching. NO usa aplicar_matches_aprobados.
BEGIN;

-- 1) Correcciones (motor sugirió el pm equivocado; lectura+GPS dan el real). Candado IS NULL.
CREATE TEMP TABLE _fix_eq (prop_id int, pm int) ON COMMIT DROP;
INSERT INTO _fix_eq (prop_id, pm) VALUES
  (2870, 340),   -- Edificio Le Grand  (anuncio "Edificio Legrand" + GPS 4m; motor decía Sky Palmetto @73m)
  (2878, 285);   -- Condominio Sky     (anuncio "EDIFICIO SKY" + más cercano @32m; motor decía Macororó 5)

UPDATE propiedades_v2 p
SET id_proyecto_master = m.pm,
    metodo_match = 'auditor_cola_20jun'
FROM _fix_eq m
WHERE p.id = m.prop_id
  AND p.id_proyecto_master IS NULL;   -- candado

-- 2) Marcar la cola: sugerencias erróneas del motor -> rechazado (con el pm real en notas)
UPDATE matching_sugerencias SET estado='rechazado',
  notas='auditor_cola_20jun: anuncio "Edificio Legrand" + GPS 4m -> corregido a pm 340 Le Grand (motor sugería Sky Palmetto @73m).'
WHERE id = 5091;  -- prop 2870

UPDATE matching_sugerencias SET estado='rechazado',
  notas='auditor_cola_20jun: anuncio "EDIFICIO SKY" + pm mas cercano @32m -> corregido a pm 285 Condominio Sky (motor sugería Macororó 5).'
WHERE id = 5093;  -- prop 2878

-- NOTA: las 10 sugerencias SIN_NOMBRE (1718,1728,1929,1930,1934,2402,2403,2404,2494,2674)
-- se DEJAN en estado='pendiente' a propósito → revisión visual en /admin/supervisor/matching.

-- 3) Verificación
SELECT 'fix' AS chk, p.id::text, p.id_proyecto_master::text, pm.nombre_oficial, p.metodo_match
FROM propiedades_v2 p JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
WHERE p.id IN (2870, 2878)
UNION ALL
SELECT 'cola_pendiente_restante', COUNT(*)::text, NULL, NULL, NULL
FROM matching_sugerencias WHERE estado='pendiente';

-- Esperado: 2 fix correctos + cola_pendiente_restante = 10 (las sin-nombre, intencional).
ROLLBACK;  -- cambiar a COMMIT para aplicar
