-- =====================================================
-- MIGRACION 142: Ejecutar Batch Matching Alquileres
-- Fecha: 13 Febrero 2026
-- Dependencias: migración 141 (matching_alquileres_lookup)
--
-- Ejecuta el matching masivo para los 174 alquileres
-- existentes, habilita el trigger para futuros, y
-- propaga zonas desde proyectos_master.
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR DESPUÉS DE MIGRACIÓN 141
-- =====================================================

-- =====================================================
-- PASO 1: Estado previo (guardar para comparar)
-- =====================================================

SELECT
    COUNT(*) as total_alquileres,
    COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto_antes,
    COUNT(*) FILTER (WHERE zona IS NOT NULL) as con_zona_antes
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND status = 'completado';

-- =====================================================
-- PASO 2: Ejecutar batch matching
-- =====================================================

SELECT * FROM matching_alquileres_batch();

-- Resultado esperado:
-- total_procesadas: ~173 (174 - 1 ya matcheada)
-- tier1_exacto: ~55
-- tier2_normalizado: ~50
-- tier2_ambiguo: ~8
-- tier3_gps: ~10
-- sin_match: ~51
-- auto_aprobados: ~105
-- aliases_aprendidos: ~50

-- =====================================================
-- PASO 3: Verificar resultados
-- =====================================================

-- 3a. Resumen post-batch
SELECT
    COUNT(*) as total_alquileres,
    COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto_despues,
    COUNT(*) FILTER (WHERE zona IS NOT NULL) as con_zona
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND status = 'completado';

-- 3b. Desglose por método
SELECT metodo_match, count(*)
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND status = 'completado'
  AND id_proyecto_master IS NOT NULL
GROUP BY metodo_match
ORDER BY count(*) DESC;

-- 3c. Cola HITL generada
SELECT metodo_matching, estado, count(*)
FROM matching_sugerencias
WHERE metodo_matching LIKE 'alquiler_%'
GROUP BY metodo_matching, estado
ORDER BY metodo_matching;

-- 3d. Sin match (edificios nuevos que no están en proyectos_master)
SELECT p.id, p.nombre_edificio, p.latitud, p.longitud
FROM propiedades_v2 p
WHERE p.tipo_operacion = 'alquiler'
  AND p.status = 'completado'
  AND p.id_proyecto_master IS NULL
  AND p.nombre_edificio IS NOT NULL
ORDER BY p.nombre_edificio;

-- =====================================================
-- PASO 4: Habilitar trigger para matching real-time
-- =====================================================

ALTER TABLE propiedades_v2 ENABLE TRIGGER trg_alquiler_matching;

-- =====================================================
-- PASO 5: Propagar zona desde proyectos_master
-- Los proyectos tienen zona confiable (asignada por GPS
-- verificado). Esto es más preciso que el GPS del agente.
-- =====================================================

UPDATE propiedades_v2 p
SET zona = pm.zona
FROM proyectos_master pm
WHERE p.id_proyecto_master = pm.id_proyecto_master
  AND p.tipo_operacion = 'alquiler'
  AND pm.zona IS NOT NULL
  AND (p.zona IS NULL OR p.zona IS DISTINCT FROM pm.zona);

-- Verificar zonas propagadas
SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE zona IS NOT NULL) as con_zona_final
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND status = 'completado';

-- =====================================================
-- PASO 6: Aliases aprendidos
-- =====================================================

SELECT count(*) as proyectos_con_alias,
       (SELECT count(*) FROM proyectos_master
        WHERE alias_conocidos IS NOT NULL
          AND array_length(alias_conocidos, 1) > 0) as total_con_alias
FROM proyectos_master
WHERE alias_conocidos IS NOT NULL
  AND array_length(alias_conocidos, 1) > 2;  -- más de 2 = aprendió nuevos

-- =====================================================
-- RESUMEN FINAL
-- =====================================================

SELECT
    'Matching alquileres completado' as status,
    (SELECT count(*) FROM propiedades_v2
     WHERE tipo_operacion = 'alquiler' AND status = 'completado'
       AND id_proyecto_master IS NOT NULL) as matcheados,
    (SELECT count(*) FROM propiedades_v2
     WHERE tipo_operacion = 'alquiler' AND status = 'completado') as total,
    (SELECT count(*) FROM matching_sugerencias
     WHERE metodo_matching LIKE 'alquiler_%' AND estado = 'pendiente') as cola_hitl,
    (SELECT count(*) FROM propiedades_v2
     WHERE tipo_operacion = 'alquiler' AND status = 'completado'
       AND zona IS NOT NULL) as con_zona;
