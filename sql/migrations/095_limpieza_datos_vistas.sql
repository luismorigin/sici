-- =====================================================
-- MIGRACION 020: Limpieza de Datos - Vistas SQL
-- Fecha: 8 Enero 2026
-- Plan: docs/PLAN_LIMPIEZA_DATOS.md
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- =====================================================
-- FASE 1: BACKUPS (ejecutar primero)
-- =====================================================

-- Backup de propiedades_v2 (antes de cualquier UPDATE)
CREATE TABLE IF NOT EXISTS propiedades_v2_backup_20260108 AS
SELECT * FROM propiedades_v2;

-- Verificar backup creado
SELECT 'propiedades_v2_backup_20260108' as tabla, COUNT(*) as filas
FROM propiedades_v2_backup_20260108;

-- Backup de proyectos_master (antes de enriquecer desarrolladores)
CREATE TABLE IF NOT EXISTS proyectos_master_backup_20260108 AS
SELECT * FROM proyectos_master;

-- Verificar backup creado
SELECT 'proyectos_master_backup_20260108' as tabla, COUNT(*) as filas
FROM proyectos_master_backup_20260108;

-- =====================================================
-- FASE 2: INDICE GIN PARA AMENITIES (faltante de 019)
-- =====================================================

-- Verificar si ya existe
SELECT indexname FROM pg_indexes
WHERE tablename = 'propiedades_v2' AND indexname LIKE '%amenities%';

-- Crear indice GIN para busquedas en amenities
CREATE INDEX IF NOT EXISTS idx_propiedades_amenities
ON propiedades_v2 USING GIN ((datos_json->'amenities') jsonb_path_ops);

-- Verificar creacion
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'propiedades_v2' AND indexname = 'idx_propiedades_amenities';

-- =====================================================
-- FASE 3: VISTA v_metricas_mercado (NUEVA - excluye multiproyecto)
-- =====================================================

-- Eliminar si existe
DROP VIEW IF EXISTS v_metricas_mercado CASCADE;

-- Crear vista de metricas por tipologia y zona
-- IMPORTANTE: Excluye multiproyecto para estadisticas puras
CREATE VIEW v_metricas_mercado AS
SELECT
    dormitorios,
    COALESCE(microzona, zona, 'Sin zona') as zona,
    COUNT(*) as stock,
    ROUND(AVG(precio_usd)::numeric, 0) as precio_promedio,
    ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_usd)::numeric, 0) as precio_mediana,
    ROUND(MIN(precio_usd)::numeric, 0) as precio_min,
    ROUND(MAX(precio_usd)::numeric, 0) as precio_max,
    ROUND(AVG(area_total_m2)::numeric, 1) as area_promedio,
    ROUND(AVG(precio_usd / NULLIF(area_total_m2, 0))::numeric, 0) as precio_m2
FROM propiedades_v2
WHERE es_activa = true
  AND tipo_operacion = 'venta'
  AND status = 'completado'
  AND es_multiproyecto = false  -- EXCLUIR multiproyecto
  AND precio_usd > 30000
  AND area_total_m2 > 25
  AND (precio_usd / NULLIF(area_total_m2, 0)) BETWEEN 800 AND 4000
GROUP BY dormitorios, COALESCE(microzona, zona, 'Sin zona');

COMMENT ON VIEW v_metricas_mercado IS
'Metricas de mercado Equipetrol - Solo unidades reales (excluye multiproyecto)';

-- Verificar vista creada
SELECT dormitorios, zona, stock, precio_promedio, precio_m2
FROM v_metricas_mercado
ORDER BY dormitorios, stock DESC
LIMIT 10;

-- =====================================================
-- FASE 4: VISTA v_alternativas_proyecto (multiproyecto)
-- =====================================================

-- Eliminar si existe
DROP VIEW IF EXISTS v_alternativas_proyecto CASCADE;

-- Crear vista para mostrar proyectos multiproyecto como "desde $X"
CREATE VIEW v_alternativas_proyecto AS
SELECT
    pm.id_proyecto_master,
    pm.nombre_oficial as proyecto,
    pm.desarrollador,
    pm.zona,
    COUNT(*) as listings_publicados,
    ROUND(MIN(p.precio_usd)::numeric, 0) as precio_desde,
    ROUND(MAX(p.precio_usd)::numeric, 0) as precio_hasta,
    -- Usar dormitorios_opciones de datos_json cuando existe Y es array
    COALESCE(
        (SELECT array_agg(DISTINCT d::int ORDER BY d::int)
         FROM propiedades_v2 p2,
              jsonb_array_elements_text(p2.datos_json->'fisico'->'dormitorios_opciones') d
         WHERE p2.id_proyecto_master = pm.id_proyecto_master
           AND p2.es_multiproyecto = true
           AND p2.es_activa = true
           AND jsonb_typeof(p2.datos_json->'fisico'->'dormitorios_opciones') = 'array'
        ),
        -- Fallback: usar dormitorios directos
        array_agg(DISTINCT p.dormitorios ORDER BY p.dormitorios)
            FILTER (WHERE p.dormitorios IS NOT NULL)
    ) as tipologias_disponibles,
    -- Detectar si incluye preventa
    bool_or(
        p.datos_json->'proyecto'->>'estado_construccion' = 'preventa'
    ) as incluye_preventa,
    -- Area rango
    ROUND(MIN(p.area_total_m2)::numeric, 0) as area_desde,
    ROUND(MAX(p.area_total_m2)::numeric, 0) as area_hasta
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.es_multiproyecto = true
  AND p.es_activa = true
  AND p.tipo_operacion = 'venta'
  AND p.status = 'completado'
  AND p.precio_usd > 30000
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona
HAVING COUNT(*) >= 1;

COMMENT ON VIEW v_alternativas_proyecto IS
'Proyectos multiproyecto - Mostrar como "desde $X" con tipologias disponibles';

-- Verificar vista creada
SELECT proyecto, desarrollador, precio_desde, precio_hasta, tipologias_disponibles, incluye_preventa
FROM v_alternativas_proyecto
ORDER BY listings_publicados DESC
LIMIT 10;

-- =====================================================
-- FASE 5: VISTA v_salud_datos (dashboard de gaps)
-- =====================================================

-- Eliminar si existe
DROP VIEW IF EXISTS v_salud_datos CASCADE;

-- Crear vista de salud de datos
CREATE VIEW v_salud_datos AS
SELECT
    -- Propiedades totales
    COUNT(*) as total_propiedades,
    COUNT(*) FILTER (WHERE status = 'completado') as completadas,
    COUNT(*) FILTER (WHERE status = 'inactivo_pending') as inactivas,
    COUNT(*) FILTER (WHERE status = 'excluido_operacion') as excluidas,

    -- Cobertura de campos
    COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto,
    COUNT(*) FILTER (WHERE precio_usd IS NOT NULL) as con_precio,
    COUNT(*) FILTER (WHERE dormitorios IS NOT NULL) as con_dormitorios,
    COUNT(*) FILTER (WHERE area_total_m2 IS NOT NULL) as con_area,

    -- Porcentajes de completitud (FIX: solo completadas en numerador Y denominador)
    ROUND(100.0 * COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL AND status = 'completado') /
          NULLIF(COUNT(*) FILTER (WHERE status = 'completado'), 0), 1) as pct_matched,
    ROUND(100.0 * COUNT(*) FILTER (WHERE precio_usd IS NOT NULL) /
          NULLIF(COUNT(*), 0), 1) as pct_con_precio,

    -- Multiproyecto
    COUNT(*) FILTER (WHERE es_multiproyecto = true) as multiproyecto,
    COUNT(*) FILTER (WHERE es_multiproyecto = false OR es_multiproyecto IS NULL) as unidades_reales,

    -- Huerfanas (completadas sin proyecto)
    COUNT(*) FILTER (WHERE status = 'completado' AND id_proyecto_master IS NULL) as huerfanas,

    -- Proyectos
    (SELECT COUNT(*) FROM proyectos_master WHERE activo = true) as total_proyectos,
    (SELECT COUNT(*) FROM proyectos_master WHERE activo = true AND desarrollador IS NOT NULL) as proyectos_con_desarrollador,
    (SELECT COUNT(*) FROM proyectos_master WHERE activo = true AND desarrollador IS NULL) as proyectos_sin_desarrollador,

    -- Colas HITL
    (SELECT COUNT(*) FROM matching_sugerencias WHERE estado = 'pendiente') as cola_matching,
    (SELECT COUNT(*) FROM sin_match_exportados WHERE estado = 'pendiente') as cola_sin_match,

    -- Timestamp
    CURRENT_TIMESTAMP as actualizado_at
FROM propiedades_v2
WHERE es_activa = true AND tipo_operacion = 'venta';

COMMENT ON VIEW v_salud_datos IS
'Dashboard de salud de datos - Gaps y metricas de completitud';

-- Verificar vista creada
SELECT * FROM v_salud_datos;

-- =====================================================
-- VERIFICACION FINAL
-- =====================================================

SELECT 'Migracion 020 - Componentes Instalados' as status;

SELECT 'Backups' as tipo,
    (SELECT COUNT(*) FROM propiedades_v2_backup_20260108) as propiedades,
    (SELECT COUNT(*) FROM proyectos_master_backup_20260108) as proyectos;

SELECT
    'Indice GIN' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_propiedades_amenities')
         THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'Vista v_metricas_mercado',
    CASE WHEN EXISTS(SELECT 1 FROM pg_views WHERE viewname = 'v_metricas_mercado')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Vista v_alternativas_proyecto',
    CASE WHEN EXISTS(SELECT 1 FROM pg_views WHERE viewname = 'v_alternativas_proyecto')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Vista v_salud_datos',
    CASE WHEN EXISTS(SELECT 1 FROM pg_views WHERE viewname = 'v_salud_datos')
         THEN 'OK' ELSE 'FALTA' END;
