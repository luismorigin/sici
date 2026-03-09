-- 186_normalizar_zonas_residuales.sql
-- Normalizar zonas sucias post-migración 184
-- Fecha: 2026-03-09

-- 1A: 28 props con microzona='Equipetrol' (legacy) → 'Equipetrol Centro'
UPDATE propiedades_v2
SET microzona = 'Equipetrol Centro'
WHERE microzona = 'Equipetrol';

-- 1B: 1 prop venta con zona='Villa Brígida' (tilde) → 'Villa Brigida'
UPDATE propiedades_v2
SET zona = 'Villa Brigida'
WHERE zona = 'Villa Brígida';

-- 1C: 6 props alquiler con zona=NULL — todas fuera de polígonos GPS → excluida_zona
UPDATE propiedades_v2
SET status = 'excluida_zona'
WHERE id IN (705, 725, 726, 727, 1082, 1088)
AND status = 'completado';

-- 1D: 2 props alquiler con microzona=NULL pero zona correcta
UPDATE propiedades_v2
SET microzona = zona
WHERE id IN (693, 857)
AND microzona IS NULL;

-- Verificación:
-- SELECT COUNT(*) FROM propiedades_v2 WHERE microzona = 'Equipetrol';       -- debe ser 0
-- SELECT COUNT(*) FROM propiedades_v2 WHERE zona = 'Villa Brígida';         -- debe ser 0
-- SELECT COUNT(*) FROM propiedades_v2 WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND zona IS NULL;  -- debe ser 0
-- SELECT COUNT(*) FROM propiedades_v2 WHERE tipo_operacion = 'alquiler' AND status = 'completado' AND microzona IS NULL;  -- debe ser 0
