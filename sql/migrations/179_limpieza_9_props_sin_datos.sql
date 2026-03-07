-- ============================================================
-- Migración 179: Limpiar 9 props con datos faltantes o incorrectos
-- Fecha: 2026-03-07
-- ============================================================

-- PARTE 1: Avisos terminados → inactivo_confirmed
UPDATE propiedades_v2
SET status = 'inactivo_confirmed'
WHERE id IN (285, 286);

-- PARTE 2: ID 609 (Miro Tower) — precio "desde" genérico no corresponde al área
UPDATE propiedades_v2
SET status = 'excluido_calidad'
WHERE id = 609;

-- PARTE 3: ID 1007 (BRICKELL) — es anticrético, no venta
UPDATE propiedades_v2
SET tipo_operacion = 'anticretico',
    status = 'excluido_operacion'
WHERE id = 1007;

-- PARTE 4: Re-enrichment para 5 props sin descripción ni datos extraídos
-- Resetear fecha_enrichment para que el pipeline nocturno las procese
UPDATE propiedades_v2
SET fecha_enrichment = NULL,
    status = 'pendiente_enriquecimiento'
WHERE id IN (586, 590, 837, 842, 1096);

-- ============================================================
-- Verificación:
-- ============================================================
-- SELECT id, status, tipo_operacion, fecha_enrichment FROM propiedades_v2
-- WHERE id IN (285, 286, 609, 1007, 586, 590, 837, 842, 1096)
-- ORDER BY id;
-- Esperado:
--   285, 286: inactivo_confirmed
--   609: excluido_calidad
--   1007: excluido_operacion, tipo_operacion = anticretico
--   586, 590, 837, 842, 1096: pendiente_enriquecimiento, fecha_enrichment = NULL
-- ============================================================
