-- =====================================================
-- MIGRACION 037: Filtro de precios outlier dinámico
-- Fecha: 11 Enero 2026
-- Lógica: Excluir propiedades con >55% desviación del promedio
--   - Proyectos con 2+ props: comparar vs promedio proyecto
--   - Proyectos con 1 prop: comparar vs promedio zona
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
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
  estado_construccion TEXT,
  -- v2.5: Nuevo campo para outliers
  es_precio_outlier BOOLEAN
) AS $func$
BEGIN
  RETURN QUERY
  WITH
  -- Stats por proyecto (para proyectos con 2+ propiedades)
  proyecto_stats AS (
    SELECT
      pv.id_proyecto_master,
      AVG(pv.precio_usd / NULLIF(pv.area_total_m2, 0)) as avg_precio_m2,
      COUNT(*) as cnt
    FROM propiedades_v2 pv
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.area_total_m2 > 20
    GROUP BY pv.id_proyecto_master
  ),
  -- Stats por zona (fallback para proyectos con 1 propiedad)
  zona_stats AS (
    SELECT
      pmz.zona,
      AVG(pv.precio_usd / NULLIF(pv.area_total_m2, 0)) as avg_precio_m2_zona
    FROM propiedades_v2 pv
    JOIN proyectos_master pmz ON pv.id_proyecto_master = pmz.id_proyecto_master
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.area_total_m2 > 20
    GROUP BY pmz.zona
  )
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

    -- Fotos (lógica v2.4)
    CASE
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
           AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'contenido'->'fotos_urls'))
      WHEN p.fuente = 'remax'
           AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
      THEN ARRAY[p.datos_json_discovery->'default_imagen'->>'url']
      WHEN p.fuente = 'century21'
           AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
           AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json_discovery->'fotos'->'propiedadThumbnail'))
      ELSE ARRAY[]::TEXT[]
    END,

    -- Cantidad fotos
    CASE
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
           AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
      THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')
      WHEN p.fuente = 'remax'
           AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
      THEN 1
      WHEN p.fuente = 'century21'
           AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
      THEN jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail')
      ELSE 0
    END::INTEGER,

    p.url::TEXT,

    CASE
      WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
      THEN p.datos_json->'amenities'->'lista'
      ELSE '[]'::jsonb
    END,

    razon_fiduciaria_texto(p.id),
    p.es_multiproyecto,
    COALESCE(p.estado_construccion::TEXT, 'no_especificado'),

    -- =====================================================
    -- v2.5: Detectar outlier de precio (>55% desviación)
    -- =====================================================
    CASE
      -- Proyecto con 2+ propiedades: comparar vs promedio proyecto
      WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
        ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) > 0.55
      -- Proyecto con 1 propiedad: comparar vs promedio zona
      WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
        ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) > 0.55
      -- Sin datos para comparar: no es outlier
      ELSE false
    END as es_precio_outlier

  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  LEFT JOIN proyecto_stats ps ON p.id_proyecto_master = ps.id_proyecto_master
  LEFT JOIN zona_stats zs ON pm.zona = zs.zona

  WHERE p.es_activa = true
    AND pm.activo = true
    AND p.status = 'completado'

    -- Solo ventas por defecto
    AND (
      CASE
        WHEN p_filtros->>'tipo_operacion' IS NOT NULL
        THEN p.tipo_operacion::text = (p_filtros->>'tipo_operacion')
        ELSE p.tipo_operacion::text = 'venta'
      END
    )

    -- Excluir bauleras, parqueos
    AND lower(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')

    -- Excluir areas < 20m2
    AND p.area_total_m2 >= 20

    -- Excluir multiproyecto por defecto
    AND (
      (p_filtros->>'incluir_multiproyecto')::boolean IS TRUE
      OR p.es_multiproyecto = false
      OR p.es_multiproyecto IS NULL
    )

    -- =====================================================
    -- v2.5: Excluir outliers por defecto (>55% desviación)
    -- Usar incluir_outliers=true para verlos
    -- =====================================================
    AND (
      (p_filtros->>'incluir_outliers')::boolean IS TRUE
      OR (
        CASE
          WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
            ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) <= 0.55
          WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
            ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) <= 0.55
          ELSE true
        END
      )
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
      OR (
        (jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
         AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0)
        OR (p.fuente = 'remax'
            AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL)
        OR (p.fuente = 'century21'
            AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
            AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0)
      )
    )

    -- Filtro: score minimo
    AND (
      p_filtros->>'score_min' IS NULL
      OR p.score_calidad_dato >= (p_filtros->>'score_min')::int
    )

    -- Filtro: estado_entrega
    AND (
      CASE
        WHEN p_filtros->>'estado_entrega' IS NULL
          OR p_filtros->>'estado_entrega' = 'no_importa'
          OR p_filtros->>'estado_entrega' = 'preventa_ok'
        THEN true
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
'v2.5: Filtro de precios outlier dinámico.
- Excluye propiedades con >55% desviación del promedio (proyecto o zona)
- Nuevo campo: es_precio_outlier
- Nuevo filtro: incluir_outliers (default false)
Filtros: tipo_operacion, dormitorios, precio, area, zona, microzona, proyecto,
desarrollador, solo_con_telefono, solo_con_fotos, score_min, estado_entrega, incluir_outliers';

-- =====================================================
-- TEST: Verificar outliers excluidos
-- =====================================================
SELECT 'TEST: Propiedades outlier que ahora se excluyen:' as info;

SELECT id, proyecto, precio_m2, es_precio_outlier
FROM buscar_unidades_reales('{"incluir_outliers": true, "limite": 500}'::jsonb)
WHERE es_precio_outlier = true
ORDER BY precio_m2;

SELECT 'TEST: Conteo con y sin outliers:' as info;

SELECT
    'Sin outliers (default)' as modo,
    COUNT(*) as total
FROM buscar_unidades_reales('{"limite": 500}'::jsonb)
UNION ALL
SELECT
    'Con outliers' as modo,
    COUNT(*) as total
FROM buscar_unidades_reales('{"incluir_outliers": true, "limite": 500}'::jsonb);

SELECT 'Migracion 037 completada - Filtro outliers activo' as status;
