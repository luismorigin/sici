-- Migración 188: Limpiar "Aire Acondicionado" fantasma de equipamiento
--
-- Bug: regex del extractor Remax usaba /aire\s+acondicionado|split|ac/i
-- El patrón |ac matcheaba cualquier palabra con "ac": espacios, ubicación,
-- extractor, elegancia, capacidad, etc.
--
-- Impacto: 440 props de venta con A/C fantasma (80% del total con A/C).
-- Solo 57 props realmente mencionan aire acondicionado en la descripción.
--
-- Fix regex: removido |ac → /aire\s+acondicionado|split/i
-- Fix BD: remover "Aire Acondicionado" de equipamiento donde la descripción
-- NO menciona aire acondicionado ni split.
--
-- Query de verificación previa:
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE datos_json::text LIKE '%Aire Acondicionado%'
--   AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%aire acondicionado%'
--   AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%split%';
-- Resultado esperado: ~440

-- Limpiar equipamiento: remover "Aire Acondicionado" del array
UPDATE propiedades_v2
SET datos_json = jsonb_set(
    datos_json,
    '{amenities,equipamiento}',
    (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(datos_json->'amenities'->'equipamiento') AS elem
        WHERE elem::text NOT IN ('"Aire Acondicionado"', '"Aire acondicionado"')
    )
)
WHERE datos_json::text SIMILAR TO '%Aire [Aa]condicionado%'
  AND datos_json->'amenities'->'equipamiento' IS NOT NULL
  AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%aire acondicionado%'
  AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%aire%acondicionado%'
  AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%split%';

-- También limpiar en datos_json_enrichment top-level
UPDATE propiedades_v2
SET datos_json_enrichment = jsonb_set(
    datos_json_enrichment,
    '{equipamiento}',
    (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(datos_json_enrichment->'equipamiento') AS elem
        WHERE elem::text NOT IN ('"Aire Acondicionado"', '"Aire acondicionado"')
    )
)
WHERE datos_json_enrichment::text SIMILAR TO '%Aire [Aa]condicionado%'
  AND datos_json_enrichment->'equipamiento' IS NOT NULL
  AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%aire acondicionado%'
  AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%aire%acondicionado%'
  AND datos_json->'contenido'->>'descripcion' NOT ILIKE '%split%';
