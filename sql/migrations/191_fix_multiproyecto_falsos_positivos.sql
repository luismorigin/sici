-- Migración 191: Corregir 42 falsos positivos de es_multiproyecto
-- Problema: El detector de multiproyecto en los extractores n8n (especialmente C21,
-- que solo requiere 1 patrón) marca como multiproyecto listings que son unidades
-- individuales con área y dormitorios específicos.
-- Evidencia: 21 de estos tienen gemelo no-multi en el mismo proyecto (cross-source),
-- 7 están en proyectos donde otros listings son multi=false, y los 14 restantes
-- tienen datos específicos de unidad (área exacta, dorms, precio individual).
-- Proyectos afectados: Lofty Island (19), Sky Level (6), PORTOBELLO 5 (3),
-- Stone 3 (3), Stone 5 (2), y 9 listings individuales de otros proyectos.

BEGIN;

UPDATE propiedades_v2
SET
  es_multiproyecto = false,
  campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) || jsonb_build_object(
    'es_multiproyecto', jsonb_build_object(
      'bloqueado', true,
      'fecha', NOW()::text,
      'motivo', 'correccion_falso_positivo_multiproyecto_batch',
      'por', 'admin',
      'valor_original', true
    )
  )
WHERE id IN (
  -- Lofty Island (19)
  43, 44, 45, 46, 48, 49, 50, 51, 52, 510, 511,
  597, 628, 629, 823, 824, 825, 826, 833, 834,
  -- Sky Level (6)
  911, 914, 915, 919, 920, 923,
  -- PORTOBELLO 5 (3)
  1069, 1070, 1071,
  -- Stone 3 (3)
  1061, 1063, 1064,
  -- Stone 5 (2)
  1057, 1058,
  -- Individuales (9)
  506,   -- Luxe Suites
  829,   -- Edificio Spazios
  838,   -- Spazios Edén
  905,   -- Sky Plaza Italia
  999,   -- Condominio SKY EQUINOX
  1021,  -- Giardino
  1059,  -- Sky Collection Tulip
  1068   -- Portobello Green
)
AND es_multiproyecto = true;

-- Verificar: debe dar 0
SELECT COUNT(*) as multiproyecto_restantes
FROM propiedades_v2
WHERE status IN ('completado','actualizado')
  AND tipo_operacion = 'venta'
  AND zona IS NOT NULL
  AND es_multiproyecto = true
  AND duplicado_de IS NULL;

COMMIT;
