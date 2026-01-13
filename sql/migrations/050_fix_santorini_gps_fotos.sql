-- =====================================================
-- MIGRACION 050: Fix GPS y fotos SANTORINI VENTURA
-- Fecha: 13 Enero 2026
-- Proposito:
--   1. Corregir coordenadas GPS del proyecto
--   2. Recalcular zona segun nuevas coordenadas
--   3. Limpiar fotos rotas (404) del ID 121
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Paso 1: Corregir GPS de SANTORINI VENTURA
-- Coordenadas actuales: -17.7627711, -63.1983632 (incorrectas)
-- Coordenadas Google Maps: -17.7550121, -63.1945909 (correctas)

UPDATE proyectos_master
SET
  latitud = -17.7550121,
  longitud = -63.1945909,
  gps_google_lat = -17.7550121,
  gps_google_lng = -63.1945909,
  gps_verificado_google = true,
  fecha_verificacion_google = NOW(),
  zona_anterior = zona,
  notas = COALESCE(notas, '') || ' | GPS corregido 13-Ene-2026 desde Google Maps'
WHERE nombre_oficial = 'SANTORINI VENTURA';

-- Verificar actualizacion GPS
SELECT 'GPS actualizado:' as status,
  nombre_oficial, latitud, longitud, zona_anterior
FROM proyectos_master
WHERE nombre_oficial = 'SANTORINI VENTURA';

-- Paso 2: Recalcular zona segun nuevas coordenadas
-- Coordenadas -63.1945909, -17.7550121 caen en "Villa Brigida" (zona_general: Equipetrol)
UPDATE proyectos_master
SET zona = 'Villa Brigida'
WHERE nombre_oficial = 'SANTORINI VENTURA';

-- Verificar zona recalculada
SELECT 'Zona recalculada:' as status,
  nombre_oficial, zona, zona_anterior, latitud, longitud
FROM proyectos_master
WHERE nombre_oficial = 'SANTORINI VENTURA';

-- Paso 3: Limpiar fotos rotas de ID 121
-- Las fotos con UUID dafb8e3d-b891-4d51-8ffb-f624e7be6598 dan 404
-- Las fotos con UUID f8812875-9dec-457b-9d06-9f6d49c58c93 funcionan

UPDATE propiedades_v2
SET datos_json = jsonb_set(
  datos_json,
  '{contenido,fotos_urls}',
  (
    SELECT jsonb_agg(foto)
    FROM jsonb_array_elements_text(datos_json->'contenido'->'fotos_urls') AS foto
    WHERE foto NOT LIKE '%dafb8e3d-b891-4d51-8ffb-f624e7be6598%'
  )
)
WHERE id = 121;

-- Actualizar cantidad_fotos
UPDATE propiedades_v2
SET datos_json = jsonb_set(
  datos_json,
  '{contenido,cantidad_fotos}',
  to_jsonb(jsonb_array_length(datos_json->'contenido'->'fotos_urls'))
)
WHERE id = 121;

-- Verificar limpieza de fotos
SELECT 'Fotos limpiadas ID 121:' as status,
  id,
  jsonb_array_length(datos_json->'contenido'->'fotos_urls') as fotos_validas,
  datos_json->'contenido'->'fotos_urls'->0 as primera_foto
FROM propiedades_v2
WHERE id = 121;

-- Resumen final
SELECT 'RESUMEN MIGRACION 050:' as info;
SELECT
  pm.nombre_oficial,
  pm.zona as zona_nueva,
  pm.zona_anterior,
  pm.latitud,
  pm.longitud,
  pm.gps_verificado_google,
  (SELECT COUNT(*) FROM propiedades_v2 p
   WHERE p.id_proyecto_master = pm.id_proyecto_master
   AND p.duplicado_de IS NULL) as propiedades_activas
FROM proyectos_master pm
WHERE pm.nombre_oficial = 'SANTORINI VENTURA';
