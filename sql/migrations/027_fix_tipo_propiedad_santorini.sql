-- =====================================================
-- MIGRACIÓN 027: Corregir tipo_propiedad SANTORINI VENTURA
-- Fecha: 9 Enero 2026
-- Propósito: Reclasificar parqueos/bauleras mal etiquetados
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- PROBLEMA: 22 registros de SANTORINI VENTURA tienen
-- tipo_propiedad_original = 'Departamento' pero son:
-- - 13 parqueos de 3m² ($3,520)
-- - 9 bauleras de 12.5m² ($3,520 - $12,571)
-- =====================================================

-- Verificar estado ANTES
SELECT 'ANTES de corrección:' as estado;
SELECT
  tipo_propiedad_original,
  COUNT(*) as cantidad,
  array_agg(id ORDER BY id) as ids
FROM propiedades_v2
WHERE id IN (122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143)
GROUP BY tipo_propiedad_original;

-- =====================================================
-- PASO 1: Corregir 13 BAULERAS de 3m² (descripción: "Vendo Bauleras de 3 mts2")
-- =====================================================
UPDATE propiedades_v2
SET tipo_propiedad_original = 'baulera'
WHERE id IN (131,132,134,135,136,137,138,139,140,141,142,143);

-- =====================================================
-- PASO 2: Corregir 8 PARQUEOS de 12.5m² (descripción: "Vendo Parqueo de 12,50 m²")
-- ID 130 ya era baulera, no tocar
-- =====================================================
UPDATE propiedades_v2
SET tipo_propiedad_original = 'parqueo'
WHERE id IN (122,123,124,125,126,127,128,129);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
SELECT 'DESPUÉS de corrección:' as estado;
SELECT
  tipo_propiedad_original,
  COUNT(*) as cantidad,
  array_agg(id ORDER BY id) as ids
FROM propiedades_v2
WHERE id IN (122,123,124,125,126,127,128,129,130,131,132,133,134,135,136,137,138,139,140,141,142,143)
GROUP BY tipo_propiedad_original;

-- Resumen general por tipo
SELECT 'Resumen general:' as estado;
SELECT
  tipo_propiedad_original,
  COUNT(*) as cantidad
FROM propiedades_v2
WHERE es_activa = true
  AND tipo_operacion::text = 'venta'
GROUP BY tipo_propiedad_original
ORDER BY cantidad DESC;
