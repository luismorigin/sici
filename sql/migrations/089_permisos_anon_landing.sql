-- ============================================
-- Migración 089: Permisos anon para Landing Simón
-- Fecha: 2026-01-29
-- Propósito: Permitir que el frontend (anon key) lea datos en vivo
--            para la sección "Equipetrol Hoy" del Market Lens
-- ============================================

-- Problema detectado: El frontend usaba datos de fallback porque
-- el rol 'anon' no tenía permisos SELECT en las tablas necesarias.

-- 1. Permisos para auditoria_snapshots (snapshot 24h)
GRANT SELECT ON auditoria_snapshots TO anon;

-- 2. Permisos para tc_binance_historial (tipo de cambio)
GRANT SELECT ON tc_binance_historial TO anon;

-- 3. Permisos para vista v_metricas_mercado (métricas por zona/dorms)
GRANT SELECT ON v_metricas_mercado TO anon;

-- 4. Permisos para propiedades_v2 (conteo TC paralelo, métricas)
-- Nota: Ya debería tener permisos por buscar_unidades_reales(), pero aseguramos
GRANT SELECT ON propiedades_v2 TO anon;

-- 5. Permisos para proyectos_master (conteo proyectos monitoreados)
GRANT SELECT ON proyectos_master TO anon;

-- Verificación: Después de ejecutar, el frontend debería mostrar:
-- - TC actual: ~9.21 (en lugar del fallback 9.72)
-- - Stock Equipetrol 2D: ~44 unidades (en lugar del fallback 31)
-- - Badge "Datos en vivo" visible en la sección

-- ============================================
-- FIN MIGRACIÓN 089
-- ============================================
