-- =====================================================
-- MIGRACIÓN 026: buscar_unidades_reales() v2.1
-- Fecha: 9 Enero 2026
-- Propósito: Agregar campos para MVP Simón
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- CAMBIOS v2.0:
-- + fotos_urls TEXT[] (array completo, no solo cantidad)
-- + precio_m2 NUMERIC (calculado)
-- + score_calidad INTEGER
-- + desarrollador TEXT
-- + razon_fiduciaria TEXT (usa función migración 025)
-- + Filtro tipo_operacion = 'venta'
-- + Filtro tipo_propiedad (excluye baulera, parqueo)
--
-- CAMBIOS v2.1:
-- + Fix ENUM cast para tipo_operacion
-- + Filtro área >= 20m² (excluye parqueos/bauleras mal clasificados)
-- =====================================================

DROP FUNCTION IF EXISTS buscar_unidades_reales(JSONB);

CREATE OR REPLACE FUNCTION buscar_unidades_reales(p_filtros JSONB DEFAULT '{}')
RETURNS TABLE (
  id INTEGER,
  proyecto TEXT,
  desarrollador TEXT,
  zona TEXT,
  microzona TEXT,
  dormitorios INTEGER,
  precio_usd NUMERIC,
  precio_m2 NUMERIC,
  area_m2 NUMERIC,
  score_calidad INTEGER,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  asesor_inmobiliaria TEXT,
  fotos_urls TEXT[],
  cantidad_fotos INTEGER,
  url TEXT,
  amenities_lista JSONB,
  razon_fiduciaria TEXT,
  es_multiproyecto BOOLEAN
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    pm.nombre_oficial::TEXT,
    pm.desarrollador::TEXT,
    pm.zona::TEXT,
    p.microzona::TEXT,
    p.dormitorios,
    p.precio_usd,
    ROUND((p.precio_usd / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
    p.area_total_m2,
    p.score_calidad_dato,
    (p.datos_json->'agente'->>'nombre')::TEXT,
    (p.datos_json->'agente'->>'telefono')::TEXT,
    (p.datos_json->'agente'->>'oficina_nombre')::TEXT,
    -- Fotos como array de TEXT
    CASE
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'contenido'->'fotos_urls'))
      ELSE ARRAY[]::TEXT[]
    END,
    -- Cantidad de fotos
    CASE
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
      THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')
      ELSE 0
    END::INTEGER,
    p.url::TEXT,
    CASE
      WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
      THEN p.datos_json->'amenities'->'lista'
      ELSE '[]'::jsonb
    END,
    -- Razón fiduciaria (de migración 025)
    razon_fiduciaria_texto(p.id),
    p.es_multiproyecto
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.es_activa = true
    AND pm.activo = true
    AND p.status = 'completado'
    -- Solo ventas por defecto (fix ENUM cast)
    AND (
      CASE
        WHEN p_filtros->>'tipo_operacion' IS NOT NULL
        THEN p.tipo_operacion::text = (p_filtros->>'tipo_operacion')
        ELSE p.tipo_operacion::text = 'venta'
      END
    )
    -- Excluir bauleras, parqueos explícitos
    AND lower(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    -- Excluir áreas < 20m² (parqueos/bauleras mal clasificados como "Departamento")
    AND p.area_total_m2 >= 20
    -- Excluir multiproyecto por defecto
    AND (
      (p_filtros->>'incluir_multiproyecto')::boolean IS TRUE
      OR p.es_multiproyecto = false
      OR p.es_multiproyecto IS NULL
    )
    -- Filtro: dormitorios
    AND (
      p_filtros->>'dormitorios' IS NULL
      OR p.dormitorios = (p_filtros->>'dormitorios')::int
    )
    -- Filtro: precio máximo
    AND (
      p_filtros->>'precio_max' IS NULL
      OR p.precio_usd <= (p_filtros->>'precio_max')::numeric
    )
    -- Filtro: precio mínimo
    AND (
      p_filtros->>'precio_min' IS NULL
      OR p.precio_usd >= (p_filtros->>'precio_min')::numeric
    )
    -- Filtro: área mínima
    AND (
      p_filtros->>'area_min' IS NULL
      OR p.area_total_m2 >= (p_filtros->>'area_min')::numeric
    )
    -- Filtro: área máxima
    AND (
      p_filtros->>'area_max' IS NULL
      OR p.area_total_m2 <= (p_filtros->>'area_max')::numeric
    )
    -- Filtro: zona
    AND (
      p_filtros->>'zona' IS NULL
      OR pm.zona ILIKE '%' || (p_filtros->>'zona') || '%'
    )
    -- Filtro: microzona
    AND (
      p_filtros->>'microzona' IS NULL
      OR p.microzona ILIKE '%' || (p_filtros->>'microzona') || '%'
    )
    -- Filtro: proyecto específico
    AND (
      p_filtros->>'proyecto' IS NULL
      OR pm.nombre_oficial ILIKE '%' || (p_filtros->>'proyecto') || '%'
    )
    -- Filtro: desarrollador
    AND (
      p_filtros->>'desarrollador' IS NULL
      OR pm.desarrollador ILIKE '%' || (p_filtros->>'desarrollador') || '%'
    )
    -- Filtro: solo con teléfono
    AND (
      (p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE
      OR p.datos_json->'agente'->>'telefono' IS NOT NULL
    )
    -- Filtro: solo con fotos
    AND (
      (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
      OR jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
    )
    -- Filtro: score mínimo
    AND (
      p_filtros->>'score_min' IS NULL
      OR p.score_calidad_dato >= (p_filtros->>'score_min')::int
    )
  ORDER BY
    CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN p.precio_usd END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'precio_m2_asc' THEN (p.precio_usd / NULLIF(p.area_total_m2, 0)) END ASC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'precio_m2_desc' THEN (p.precio_usd / NULLIF(p.area_total_m2, 0)) END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'score_desc' THEN p.score_calidad_dato END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'precio_asc' THEN p.precio_usd END ASC NULLS LAST,
    p.id DESC
  LIMIT COALESCE((p_filtros->>'limite')::int, 50);
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION buscar_unidades_reales IS
'v2.1: Búsqueda de unidades reales para MVP Simón.
Campos: desarrollador, microzona, precio_m2, score_calidad, fotos_urls[], razon_fiduciaria
Filtros: tipo_operacion, microzona, desarrollador, area_min/max, solo_con_fotos, score_min
Excluye: alquileres (default), bauleras/parqueos explícitos, áreas <25m² sin clasificar, multiproyecto';

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Búsqueda básica (solo ventas, excluye bauleras)
SELECT 'Test 1: Búsqueda básica' as test;
SELECT id, proyecto, desarrollador, dormitorios, precio_usd, precio_m2, razon_fiduciaria
FROM buscar_unidades_reales('{}')
LIMIT 5;

-- Test 2: Con filtros completos
SELECT 'Test 2: Filtros completos' as test;
SELECT id, proyecto, precio_usd, precio_m2, score_calidad, cantidad_fotos
FROM buscar_unidades_reales('{
  "dormitorios": 2,
  "precio_max": 150000,
  "solo_con_fotos": true
}')
LIMIT 5;

-- Test 3: Verificar que excluye bauleras y parqueos
SELECT 'Test 3: Verificar exclusión bauleras/parqueos' as test;
SELECT COUNT(*) as total_resultados
FROM buscar_unidades_reales('{}');

-- Test 4: Buscar alquileres explícitamente
SELECT 'Test 4: Buscar alquileres' as test;
SELECT id, proyecto, precio_usd, precio_m2
FROM buscar_unidades_reales('{"tipo_operacion": "alquiler"}')
LIMIT 5;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 026 - buscar_unidades_reales v2' as status;

SELECT
    'buscar_unidades_reales()' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'buscar_unidades_reales')
         THEN 'OK' ELSE 'FALTA' END as estado;
