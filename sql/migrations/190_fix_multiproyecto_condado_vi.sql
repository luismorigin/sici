-- Migración 190: Corregir es_multiproyecto para Condado VI (IDs 53, 423, 821)
-- Problema: Los 3 listings de Condado VI en Remax fueron marcados como multiproyecto
-- porque la descripción del broker menciona "departamentos de 1, 2 y 3 dormitorios desde 62m²"
-- (matchea ≥2 patrones del detector). Pero son unidades individuales con precio y área específica.
-- Ref: Informe ESTUDIO_MERCADO_CONDADO_2026_03.md

BEGIN;

UPDATE propiedades_v2
SET
  es_multiproyecto = false,
  campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || jsonb_build_object(
    'es_multiproyecto', jsonb_build_object(
      'bloqueado', true,
      'fecha', NOW()::text,
      'motivo', 'correccion_falso_positivo_multiproyecto',
      'por', 'admin',
      'valor_original', true
    )
  )
WHERE id IN (53, 423, 821)
  AND es_multiproyecto = true;

-- Verificar
SELECT id, nombre_edificio, es_multiproyecto,
       campos_bloqueados->'es_multiproyecto' as candado
FROM propiedades_v2
WHERE id IN (53, 423, 821);

COMMIT;
