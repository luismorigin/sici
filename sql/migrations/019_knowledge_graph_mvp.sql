-- =====================================================
-- MIGRACIÓN 019: Knowledge Graph MVP
-- Fecha: 5 Enero 2026
-- Propósito: Query Layer para búsqueda de propiedades
--            con filtros por amenities, precio, dormitorios
-- Plan: docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md
-- =====================================================
-- EJECUTAR EN ORDEN - Verificar cada paso
-- =====================================================

-- =====================================================
-- FASE 1: ÍNDICE GIN PARA AMENITIES
-- =====================================================

-- Verificar si ya existe el índice
SELECT indexname FROM pg_indexes
WHERE tablename = 'propiedades_v2' AND indexname LIKE '%amenities%';

-- Crear índice GIN para búsquedas en amenities
CREATE INDEX IF NOT EXISTS idx_propiedades_amenities
ON propiedades_v2 USING GIN ((datos_json->'amenities') jsonb_path_ops);

-- Verificar creación
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'propiedades_v2' AND indexname = 'idx_propiedades_amenities';

-- =====================================================
-- FASE 2: FUNCIONES HELPER
-- =====================================================

-- 2.1 Función para normalizar labels de amenities a keys estándar
-- Los 16 amenities detectados en MCP: Piscina, Pet Friendly, Gimnasio,
-- Churrasquera, Sauna/Jacuzzi, Ascensor, Seguridad 24/7, Co-working,
-- Área Social, Salón de Eventos, Terraza/Balcón, Jardín,
-- Parque Infantil, Recepción, Lavadero, Estacionamiento para Visitas

CREATE OR REPLACE FUNCTION normalizar_amenity(p_label TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE lower(trim(p_label))
    -- Piscina
    WHEN 'piscina' THEN 'piscina'
    WHEN 'pileta' THEN 'piscina'
    WHEN 'alberca' THEN 'piscina'
    -- Pet Friendly
    WHEN 'pet friendly' THEN 'pet_friendly'
    WHEN 'mascotas' THEN 'pet_friendly'
    WHEN 'permite mascotas' THEN 'pet_friendly'
    -- Gimnasio
    WHEN 'gimnasio' THEN 'gimnasio'
    WHEN 'gym' THEN 'gimnasio'
    WHEN 'fitness' THEN 'gimnasio'
    -- Churrasquera
    WHEN 'churrasquera' THEN 'churrasquera'
    WHEN 'parrilla' THEN 'churrasquera'
    WHEN 'bbq' THEN 'churrasquera'
    -- Sauna/Jacuzzi
    WHEN 'sauna/jacuzzi' THEN 'sauna_jacuzzi'
    WHEN 'sauna' THEN 'sauna_jacuzzi'
    WHEN 'jacuzzi' THEN 'sauna_jacuzzi'
    WHEN 'spa' THEN 'sauna_jacuzzi'
    WHEN 'hidromasaje' THEN 'sauna_jacuzzi'
    -- Ascensor
    WHEN 'ascensor' THEN 'ascensor'
    WHEN 'elevador' THEN 'ascensor'
    -- Seguridad
    WHEN 'seguridad 24/7' THEN 'seguridad_24h'
    WHEN 'vigilancia' THEN 'seguridad_24h'
    WHEN 'porteria' THEN 'seguridad_24h'
    WHEN 'portería' THEN 'seguridad_24h'
    -- Co-working
    WHEN 'co-working' THEN 'coworking'
    WHEN 'coworking' THEN 'coworking'
    WHEN 'cowork' THEN 'coworking'
    WHEN 'oficina compartida' THEN 'coworking'
    -- Área Social
    WHEN 'área social' THEN 'area_social'
    WHEN 'area social' THEN 'area_social'
    WHEN 'salon social' THEN 'area_social'
    WHEN 'salón social' THEN 'area_social'
    -- Salón de Eventos
    WHEN 'salón de eventos' THEN 'salon_eventos'
    WHEN 'salon de eventos' THEN 'salon_eventos'
    WHEN 'salon fiestas' THEN 'salon_eventos'
    WHEN 'salón fiestas' THEN 'salon_eventos'
    -- Terraza
    WHEN 'terraza/balcón' THEN 'terraza'
    WHEN 'terraza' THEN 'terraza'
    WHEN 'balcón' THEN 'terraza'
    WHEN 'balcon' THEN 'terraza'
    WHEN 'rooftop' THEN 'terraza'
    -- Jardín
    WHEN 'jardín' THEN 'jardin'
    WHEN 'jardin' THEN 'jardin'
    WHEN 'areas verdes' THEN 'jardin'
    WHEN 'áreas verdes' THEN 'jardin'
    -- Parque Infantil
    WHEN 'parque infantil' THEN 'parque_infantil'
    WHEN 'juegos niños' THEN 'parque_infantil'
    WHEN 'playground' THEN 'parque_infantil'
    -- Recepción
    WHEN 'recepción' THEN 'recepcion'
    WHEN 'recepcion' THEN 'recepcion'
    WHEN 'lobby' THEN 'recepcion'
    WHEN 'hall' THEN 'recepcion'
    -- Lavadero
    WHEN 'lavadero' THEN 'lavadero'
    WHEN 'lavanderia' THEN 'lavadero'
    WHEN 'lavandería' THEN 'lavadero'
    -- Estacionamiento Visitas
    WHEN 'estacionamiento para visitas' THEN 'estacionamiento_visitas'
    WHEN 'parqueo visitas' THEN 'estacionamiento_visitas'
    -- Default: convertir a snake_case
    ELSE lower(regexp_replace(trim(p_label), '[^a-z0-9áéíóúñ]', '_', 'g'))
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test de normalización
SELECT
  normalizar_amenity('Pet Friendly') as pet,
  normalizar_amenity('Piscina') as piscina,
  normalizar_amenity('Co-working') as cowork,
  normalizar_amenity('Seguridad 24/7') as seguridad;

-- 2.2 Función para interpretar valor de amenity (maneja bug boolean/string)
-- El campo valor puede ser: true (boolean), "por_confirmar" (string), false, null

CREATE OR REPLACE FUNCTION interpretar_valor_amenity(p_valor JSONB)
RETURNS TEXT AS $$
BEGIN
  IF p_valor IS NULL THEN
    RETURN 'no_tiene';
  ELSIF jsonb_typeof(p_valor) = 'boolean' THEN
    RETURN CASE WHEN p_valor::text = 'true' THEN 'confirmado' ELSE 'no_tiene' END;
  ELSIF jsonb_typeof(p_valor) = 'string' THEN
    RETURN CASE
      WHEN p_valor::text = '"por_confirmar"' THEN 'posible'
      WHEN p_valor::text = '"true"' THEN 'confirmado'
      ELSE 'no_tiene'
    END;
  ELSE
    RETURN 'no_tiene';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Test de interpretación
SELECT
  interpretar_valor_amenity('true'::jsonb) as bool_true,
  interpretar_valor_amenity('"por_confirmar"'::jsonb) as string_confirmar,
  interpretar_valor_amenity('false'::jsonb) as bool_false,
  interpretar_valor_amenity(NULL) as null_val;

-- =====================================================
-- FASE 3: VISTA MATERIALIZADA v_amenities_proyecto
-- =====================================================

-- Eliminar si existe (para recrear)
DROP MATERIALIZED VIEW IF EXISTS v_amenities_proyecto;

-- Crear vista que agrega amenities por proyecto
CREATE MATERIALIZED VIEW v_amenities_proyecto AS
WITH amenities_extraidos AS (
  SELECT
    p.id_proyecto_master,
    e.amenity,
    e.estado->>'valor' as valor_raw,
    e.estado->>'confianza' as confianza,
    interpretar_valor_amenity(e.estado->'valor') as interpretacion
  FROM propiedades_v2 p
  CROSS JOIN LATERAL jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS e(amenity, estado)
  WHERE p.es_activa = true
    AND p.id_proyecto_master IS NOT NULL
    AND jsonb_typeof(p.datos_json->'amenities'->'estado_amenities') = 'object'
)
SELECT
  pm.id_proyecto_master,
  pm.nombre_oficial,
  pm.zona,
  -- Amenities confirmados: confianza >= media Y valor = true
  COALESCE(
    jsonb_agg(DISTINCT ae.amenity) FILTER (
      WHERE ae.interpretacion = 'confirmado'
        AND ae.confianza IN ('alta', 'media')
    ),
    '[]'::jsonb
  ) as amenities_confirmados,
  -- Amenities posibles: confianza baja O valor = por_confirmar
  COALESCE(
    jsonb_agg(DISTINCT ae.amenity) FILTER (
      WHERE ae.interpretacion = 'posible'
         OR (ae.confianza = 'baja' AND ae.interpretacion = 'confirmado')
    ),
    '[]'::jsonb
  ) as amenities_posibles,
  -- Conteo de propiedades activas
  (SELECT COUNT(*) FROM propiedades_v2 pv
   WHERE pv.id_proyecto_master = pm.id_proyecto_master
     AND pv.es_activa = true) as propiedades_activas
FROM proyectos_master pm
LEFT JOIN amenities_extraidos ae ON ae.id_proyecto_master = pm.id_proyecto_master
WHERE pm.activo = true
GROUP BY pm.id_proyecto_master;

-- Índice único para refresh concurrent
CREATE UNIQUE INDEX ON v_amenities_proyecto (id_proyecto_master);

-- Verificar vista creada
SELECT
  COUNT(*) as proyectos,
  COUNT(*) FILTER (WHERE jsonb_array_length(amenities_confirmados) > 0) as con_amenities
FROM v_amenities_proyecto;

-- Ver ejemplos
SELECT nombre_oficial, amenities_confirmados, propiedades_activas
FROM v_amenities_proyecto
WHERE jsonb_array_length(amenities_confirmados) > 3
ORDER BY propiedades_activas DESC
LIMIT 5;

-- =====================================================
-- FASE 4: FUNCIÓN buscar_unidades_reales()
-- =====================================================

-- Función principal de búsqueda para Simón/API
-- NOTA: Usa keys reales 'agente', 'oficina_nombre', 'fotos_urls'

CREATE OR REPLACE FUNCTION buscar_unidades_reales(p_filtros JSONB DEFAULT '{}')
RETURNS TABLE (
  id INTEGER,
  proyecto TEXT,
  zona TEXT,
  dormitorios INTEGER,
  precio_usd NUMERIC,
  area_m2 NUMERIC,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  asesor_inmobiliaria TEXT,
  cantidad_fotos INTEGER,
  url TEXT,
  amenities_lista JSONB,
  es_multiproyecto BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    pm.nombre_oficial::TEXT,
    pm.zona::TEXT,
    p.dormitorios,
    p.precio_usd,
    p.area_total_m2,
    -- Usar key real 'agente' (no 'asesor')
    (p.datos_json->'agente'->>'nombre')::TEXT,
    (p.datos_json->'agente'->>'telefono')::TEXT,
    -- Usar key real 'oficina_nombre' (no 'inmobiliaria')
    (p.datos_json->'agente'->>'oficina_nombre')::TEXT,
    -- Usar key real 'fotos_urls' (no 'fotos') - verificar que sea array
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
    p.es_multiproyecto
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.es_activa = true
    AND pm.activo = true
    -- Filtro: excluir multiproyecto por defecto (unidades reales)
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
    -- Filtro: zona (búsqueda parcial)
    AND (
      p_filtros->>'zona' IS NULL
      OR pm.zona ILIKE '%' || (p_filtros->>'zona') || '%'
    )
    -- Filtro: proyecto específico
    AND (
      p_filtros->>'proyecto' IS NULL
      OR pm.nombre_oficial ILIKE '%' || (p_filtros->>'proyecto') || '%'
    )
    -- Filtro: solo con teléfono (accionable)
    AND (
      (p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE
      OR p.datos_json->'agente'->>'telefono' IS NOT NULL
    )
  ORDER BY
    -- Ordenar por precio por defecto
    CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN p.precio_usd END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'precio_asc' THEN p.precio_usd END ASC NULLS LAST,
    p.id DESC
  LIMIT COALESCE((p_filtros->>'limite')::int, 50);
END;
$$ LANGUAGE plpgsql STABLE;

-- Tests de la función
-- Test 1: Búsqueda básica
SELECT * FROM buscar_unidades_reales('{}') LIMIT 5;

-- Test 2: Filtro por dormitorios
SELECT id, proyecto, dormitorios, precio_usd
FROM buscar_unidades_reales('{"dormitorios": 2}')
LIMIT 5;

-- Test 3: Filtro por precio máximo
SELECT id, proyecto, dormitorios, precio_usd
FROM buscar_unidades_reales('{"precio_max": 100000}')
LIMIT 5;

-- Test 4: Filtro combinado
SELECT id, proyecto, dormitorios, precio_usd, asesor_nombre
FROM buscar_unidades_reales('{
  "dormitorios": 2,
  "precio_max": 150000,
  "solo_con_telefono": true
}')
LIMIT 10;

-- =====================================================
-- FASE 5: FUNCIÓN buscar_con_amenities()
-- =====================================================

-- Función especializada para búsqueda por amenities
CREATE OR REPLACE FUNCTION buscar_unidades_con_amenities(
  p_amenities TEXT[],
  p_filtros JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id INTEGER,
  proyecto TEXT,
  zona TEXT,
  dormitorios INTEGER,
  precio_usd NUMERIC,
  area_m2 NUMERIC,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  url TEXT,
  amenities_match TEXT[],
  match_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH amenities_normalizados AS (
    SELECT unnest(p_amenities) as amenity_buscado
  ),
  propiedades_con_amenities AS (
    SELECT
      p.id,
      pm.nombre_oficial::TEXT as proyecto,
      pm.zona::TEXT as zona,
      p.dormitorios,
      p.precio_usd,
      p.area_total_m2,
      (p.datos_json->'agente'->>'nombre')::TEXT as asesor_nombre,
      (p.datos_json->'agente'->>'telefono')::TEXT as asesor_wsp,
      p.url::TEXT as url,
      -- Extraer amenities de la propiedad
      ARRAY(
        SELECT normalizar_amenity(a.value::text)
        FROM jsonb_array_elements_text(p.datos_json->'amenities'->'lista') a
      ) as amenities_prop
    FROM propiedades_v2 p
    JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
    WHERE p.es_activa = true
      AND pm.activo = true
      AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
      AND jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
      -- Filtros adicionales
      AND (p_filtros->>'dormitorios' IS NULL
           OR p.dormitorios = (p_filtros->>'dormitorios')::int)
      AND (p_filtros->>'precio_max' IS NULL
           OR p.precio_usd <= (p_filtros->>'precio_max')::numeric)
  )
  SELECT
    pa.id,
    pa.proyecto,
    pa.zona,
    pa.dormitorios,
    pa.precio_usd,
    pa.area_total_m2,
    pa.asesor_nombre,
    pa.asesor_wsp,
    pa.url,
    -- Amenities que matchean
    ARRAY(
      SELECT an.amenity_buscado
      FROM amenities_normalizados an
      WHERE an.amenity_buscado = ANY(pa.amenities_prop)
    ) as amenities_match,
    -- Cantidad de matches
    (SELECT COUNT(*) FROM amenities_normalizados an
     WHERE an.amenity_buscado = ANY(pa.amenities_prop))::INTEGER as match_count
  FROM propiedades_con_amenities pa
  WHERE
    -- Al menos un amenity debe matchear
    EXISTS (
      SELECT 1 FROM amenities_normalizados an
      WHERE an.amenity_buscado = ANY(pa.amenities_prop)
    )
  ORDER BY match_count DESC, pa.precio_usd ASC
  LIMIT COALESCE((p_filtros->>'limite')::int, 50);
END;
$$ LANGUAGE plpgsql STABLE;

-- Tests de búsqueda por amenities
-- Test 1: Buscar con piscina
SELECT id, proyecto, amenities_match, match_count
FROM buscar_unidades_con_amenities(ARRAY['piscina'])
LIMIT 5;

-- Test 2: Buscar con piscina Y pet friendly
SELECT id, proyecto, precio_usd, amenities_match, match_count
FROM buscar_unidades_con_amenities(
  ARRAY['piscina', 'pet_friendly'],
  '{"precio_max": 150000}'::jsonb
)
LIMIT 10;

-- =====================================================
-- FASE 6: HEALTH CHECK FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION knowledge_graph_health_check()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'timestamp', NOW(),
    'vista_amenities_existe', EXISTS(
      SELECT 1 FROM pg_matviews WHERE matviewname = 'v_amenities_proyecto'
    ),
    'vista_registros', (
      SELECT COUNT(*) FROM v_amenities_proyecto
    ),
    'indice_gin_existe', EXISTS(
      SELECT 1 FROM pg_indexes WHERE indexname = 'idx_propiedades_amenities'
    ),
    'funcion_buscar_existe', EXISTS(
      SELECT 1 FROM pg_proc WHERE proname = 'buscar_unidades_reales'
    ),
    'propiedades_activas', (
      SELECT COUNT(*) FROM propiedades_v2 WHERE es_activa = true
    ),
    'propiedades_con_amenities', (
      SELECT COUNT(*) FROM propiedades_v2
      WHERE es_activa = true
        AND datos_json->'amenities' IS NOT NULL
    ),
    'cobertura_amenities_pct', (
      SELECT ROUND(100.0 *
        COUNT(*) FILTER (WHERE datos_json->'amenities' IS NOT NULL) /
        NULLIF(COUNT(*), 0), 1)
      FROM propiedades_v2 WHERE es_activa = true
    ),
    'proyectos_activos', (
      SELECT COUNT(*) FROM proyectos_master WHERE activo = true
    ),
    'proyectos_con_amenities_consolidados', (
      SELECT COUNT(*) FROM v_amenities_proyecto
      WHERE jsonb_array_length(amenities_confirmados) > 0
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Ejecutar health check
SELECT knowledge_graph_health_check();

-- =====================================================
-- FASE 7: REFRESH DE VISTA (para cron)
-- =====================================================

-- Función para refresh seguro de la vista
CREATE OR REPLACE FUNCTION refresh_v_amenities_proyecto()
RETURNS JSONB AS $$
DECLARE
  v_inicio TIMESTAMP;
  v_fin TIMESTAMP;
  v_filas INTEGER;
BEGIN
  v_inicio := NOW();

  -- Refresh concurrente (no bloquea lecturas)
  REFRESH MATERIALIZED VIEW CONCURRENTLY v_amenities_proyecto;

  v_fin := NOW();
  SELECT COUNT(*) INTO v_filas FROM v_amenities_proyecto;

  RETURN jsonb_build_object(
    'success', true,
    'inicio', v_inicio,
    'fin', v_fin,
    'duracion_ms', EXTRACT(MILLISECONDS FROM (v_fin - v_inicio)),
    'filas', v_filas
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'inicio', v_inicio
  );
END;
$$ LANGUAGE plpgsql;

-- Test de refresh
SELECT refresh_v_amenities_proyecto();

-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

-- Resumen de componentes creados
SELECT 'MVP Knowledge Graph - Componentes Instalados' as status;

SELECT
  'Índice GIN' as componente,
  CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_propiedades_amenities')
       THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'Función normalizar_amenity()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'normalizar_amenity')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función interpretar_valor_amenity()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'interpretar_valor_amenity')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Vista v_amenities_proyecto',
  CASE WHEN EXISTS(SELECT 1 FROM pg_matviews WHERE matviewname = 'v_amenities_proyecto')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función buscar_unidades_reales()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'buscar_unidades_reales')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función buscar_unidades_con_amenities()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'buscar_unidades_con_amenities')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función knowledge_graph_health_check()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'knowledge_graph_health_check')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función refresh_v_amenities_proyecto()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'refresh_v_amenities_proyecto')
       THEN 'OK' ELSE 'FALTA' END;

-- Health check final
SELECT knowledge_graph_health_check();
