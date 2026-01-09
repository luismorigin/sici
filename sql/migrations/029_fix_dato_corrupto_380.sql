-- =====================================================
-- MIGRACIÓN 029: Desactivar dato corrupto ID 380
-- Fecha: 9 Enero 2026
-- Propósito: Corregir precio inconsistente Spazios Edén
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- PROBLEMA: ID 380 tiene precio $57,153 por 105m² ($544/m²)
-- pero unidades idénticas (IDs 342, 344) cuestan $146,366
-- Claramente el precio o el área es incorrecto.
--
-- SOLUCIÓN: Desactivar hasta verificar datos reales
-- =====================================================

-- Verificar ANTES
SELECT 'ANTES:' as estado;
SELECT id, precio_usd, area_total_m2,
       ROUND(precio_usd / NULLIF(area_total_m2, 0)) as precio_m2,
       es_activa
FROM propiedades_v2 WHERE id = 380;

-- Desactivar
UPDATE propiedades_v2
SET es_activa = false
WHERE id = 380;

-- Verificar DESPUÉS
SELECT 'DESPUÉS:' as estado;
SELECT id, precio_usd, area_total_m2, es_activa
FROM propiedades_v2 WHERE id = 380;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
SELECT 'Migración 029 completada' as status;
