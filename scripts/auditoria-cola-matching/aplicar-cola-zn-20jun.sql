-- Audit cola matching ZN — 20-jun-2026
-- 3 props / 9 sugerencias. Veredicto por lectura de anuncio + GPS.
-- Generado por /audit-cola-matching. Aplicar en Supabase. NO usa aplicar_matches_aprobados.
BEGIN;

-- 1) Matches confirmados (candado IS NULL protege matches previos)
CREATE TEMP TABLE _matches_zn (prop_id int, pm int) ON COMMIT DROP;
INSERT INTO _matches_zn (prop_id, pm) VALUES
  (2872, 450),   -- Edificio San Miguel  (nombre "Cond. San Miguel" + GPS 0m)
  (2874, 426),   -- Habita Beni          (nombre_exacto + GPS 0m)
  (2876, 356);   -- DOMUS LUXURY         (nombre_exacto + GPS 34m; gana a Brickell 4 atractor)

UPDATE propiedades_v2 p
SET id_proyecto_master = m.pm,
    metodo_match = 'auditor_cola_20jun'
FROM _matches_zn m
WHERE p.id = m.prop_id
  AND p.id_proyecto_master IS NULL;   -- candado

-- 2) Marcar la cola: sugerencias correctas -> aprobado
UPDATE matching_sugerencias
SET estado = 'aprobado'
WHERE id IN (5088, 5081, 5082, 5084, 5089, 5079, 5085, 5090);

-- 3) Sugerencia espuria (atractor Brickell 4 sobre prop Domus Luxury) -> rechazado
UPDATE matching_sugerencias
SET estado = 'rechazado',
    notas = 'auditor_cola_20jun: anuncio dice "Domus Luxury" textual; Brickell 4 es atractor a 31m (torre vecina). Real = pm 356.'
WHERE id = 5092;

-- 4) Verificación
SELECT 'matches' AS chk, p.id, p.id_proyecto_master, pm.nombre_oficial, p.metodo_match
FROM propiedades_v2 p JOIN proyectos_master pm ON pm.id_proyecto_master = p.id_proyecto_master
WHERE p.id IN (2872, 2874, 2876)
UNION ALL
SELECT 'cola_restante', COUNT(*), NULL, NULL, NULL
FROM matching_sugerencias WHERE estado = 'pendiente_zona_norte';

-- Revisar arriba: 3 matches correctos + cola_restante = 0.
-- COMMIT;  -- descomentar para aplicar
ROLLBACK;
