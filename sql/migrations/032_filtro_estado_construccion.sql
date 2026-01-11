-- =====================================================
-- MIGRACION 032: Filtro estado_construccion en buscar_unidades_reales()
-- Fecha: 11 Enero 2026
-- Proposito: Agregar filtro "Para cuando lo necesitas?" del Nivel 1
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- Campo 4 del Nivel 1: "Para cuando lo necesitas?"
-- Opciones:
--   - "entrega_inmediata" → Solo: entrega_inmediata, nuevo_a_estrenar, usado
--   - "preventa_ok" → TODO (incluye preventa)
--   - "no_importa" → TODO (sin filtro)
--
-- Valores en BD:
--   - entrega_inmediata: 77 (listas)
--   - nuevo_a_estrenar: 29 (listas)
--   - usado: 2 (listas)
--   - preventa: 94
--   - no_especificado: 116
--   - NULL: 13
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
  es_multiproyecto BOOLEAN,
  estado_construccion TEXT  -- NUEVO: para mostrar en UI
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
    -- Razon fiduciaria (de migracion 025)
    razon_fiduciaria_texto(p.id),
    p.es_multiproyecto,
    -- NUEVO: estado_construccion para UI
    COALESCE(p.estado_construccion::TEXT, 'no_especificado')
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
    -- Excluir bauleras, parqueos explicitos
    AND lower(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    -- Excluir areas < 20m2 (parqueos/bauleras mal clasificados como "Departamento")
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
    -- Filtro: precio maximo
    AND (
      p_filtros->>'precio_max' IS NULL
      OR p.precio_usd <= (p_filtros->>'precio_max')::numeric
    )
    -- Filtro: precio minimo
    AND (
      p_filtros->>'precio_min' IS NULL
      OR p.precio_usd >= (p_filtros->>'precio_min')::numeric
    )
    -- Filtro: area minima
    AND (
      p_filtros->>'area_min' IS NULL
      OR p.area_total_m2 >= (p_filtros->>'area_min')::numeric
    )
    -- Filtro: area maxima
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
    -- Filtro: proyecto especifico
    AND (
      p_filtros->>'proyecto' IS NULL
      OR pm.nombre_oficial ILIKE '%' || (p_filtros->>'proyecto') || '%'
    )
    -- Filtro: desarrollador
    AND (
      p_filtros->>'desarrollador' IS NULL
      OR pm.desarrollador ILIKE '%' || (p_filtros->>'desarrollador') || '%'
    )
    -- Filtro: solo con telefono
    AND (
      (p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE
      OR p.datos_json->'agente'->>'telefono' IS NOT NULL
    )
    -- Filtro: solo con fotos
    AND (
      (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
      OR jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
    )
    -- Filtro: score minimo
    AND (
      p_filtros->>'score_min' IS NULL
      OR p.score_calidad_dato >= (p_filtros->>'score_min')::int
    )
    -- =====================================================
    -- NUEVO: Filtro estado_construccion
    -- =====================================================
    -- "entrega_inmediata" = Solo listas para entrega
    -- "preventa_ok" o "no_importa" o NULL = Todo
    AND (
      CASE
        -- Si no hay filtro o es "no_importa", mostrar todo
        WHEN p_filtros->>'estado_entrega' IS NULL
          OR p_filtros->>'estado_entrega' = 'no_importa'
          OR p_filtros->>'estado_entrega' = 'preventa_ok'
        THEN true
        -- Si es "entrega_inmediata", solo mostrar listas
        WHEN p_filtros->>'estado_entrega' = 'entrega_inmediata'
        THEN p.estado_construccion::text IN ('entrega_inmediata', 'nuevo_a_estrenar', 'usado')
        ELSE true
      END
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
'v2.2: Busqueda de unidades reales para MVP Simon.
NUEVO: Filtro estado_entrega (entrega_inmediata | preventa_ok | no_importa)
Campos: desarrollador, microzona, precio_m2, score_calidad, fotos_urls[], razon_fiduciaria, estado_construccion
Filtros: tipo_operacion, microzona, desarrollador, area_min/max, solo_con_fotos, score_min, estado_entrega';

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Sin filtro de estado (debe mostrar TODO)
SELECT 'Test 1: Sin filtro estado_entrega' as test;
SELECT COUNT(*) as total FROM buscar_unidades_reales('{}');

-- Test 2: Solo entrega inmediata (debe ser ~108)
SELECT 'Test 2: Solo entrega_inmediata' as test;
SELECT COUNT(*) as total FROM buscar_unidades_reales('{"estado_entrega": "entrega_inmediata"}');

-- Test 3: Preventa OK (debe ser igual que sin filtro)
SELECT 'Test 3: preventa_ok (todo)' as test;
SELECT COUNT(*) as total FROM buscar_unidades_reales('{"estado_entrega": "preventa_ok"}');

-- Test 4: Verificar que estado_construccion viene en resultado
SELECT 'Test 4: Verificar campo estado_construccion' as test;
SELECT id, proyecto, estado_construccion, precio_usd
FROM buscar_unidades_reales('{"limite": 5}');

-- Test 5: Combinado con otros filtros
SELECT 'Test 5: entrega_inmediata + 2 dorms + precio_max' as test;
SELECT id, proyecto, estado_construccion, dormitorios, precio_usd
FROM buscar_unidades_reales('{
  "estado_entrega": "entrega_inmediata",
  "dormitorios": 2,
  "precio_max": 150000
}');

-- =====================================================
-- VERIFICACION
-- =====================================================

SELECT 'Migracion 032 - Filtro estado_construccion' as status;

SELECT
    'buscar_unidades_reales() v2.2' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'buscar_unidades_reales')
         THEN 'OK' ELSE 'FALTA' END as estado;

-- Verificar conteos
SELECT 'Conteo por estado_entrega:' as info;
SELECT
  CASE
    WHEN estado_construccion IN ('entrega_inmediata', 'nuevo_a_estrenar', 'usado')
    THEN 'entrega_inmediata'
    ELSE 'preventa_o_desconocido'
  END as grupo,
  COUNT(*) as cantidad
FROM buscar_unidades_reales('{}')
GROUP BY 1;
