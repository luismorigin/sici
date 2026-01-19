-- =====================================================
-- MIGRACION 061: Agregar dias_en_mercado a buscar_unidades_reales
-- Fecha: 19 Enero 2026
-- Problema: CMA y landing no muestran días en mercado por propiedad
-- Solucion: Calcular dias desde fecha_publicacion (o fecha_discovery como fallback)
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Verificar datos de fechas antes
SELECT 'ANTES: Muestra de fechas disponibles:' as info;
SELECT
  id,
  fecha_publicacion,
  fecha_discovery,
  CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) as dias_calculados
FROM propiedades_v2
WHERE es_activa = true AND status = 'completado'
LIMIT 5;

-- =====================================================
-- ACTUALIZAR FUNCION
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
  es_precio_outlier BOOLEAN,
  es_duplicado BOOLEAN,
  -- v2.7: Días en mercado (DATA REAL)
  dias_en_mercado INTEGER
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
      AND pv.duplicado_de IS NULL
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
      AND pv.duplicado_de IS NULL
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

    -- Fotos
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

    -- Detectar outlier de precio (>55% desviacion)
    CASE
      WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
        ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) > 0.55
      WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
        ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) > 0.55
      ELSE false
    END as es_precio_outlier,

    -- es_duplicado (debug)
    (p.duplicado_de IS NOT NULL) as es_duplicado,

    -- v2.7: DIAS EN MERCADO (DATA REAL)
    -- Usa fecha_publicacion si existe, sino fecha_discovery
    (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date))::INTEGER as dias_en_mercado

  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  LEFT JOIN proyecto_stats ps ON p.id_proyecto_master = ps.id_proyecto_master
  LEFT JOIN zona_stats zs ON pm.zona = zs.zona

  WHERE p.es_activa = true
    AND pm.activo = true
    AND p.status = 'completado'

    -- Excluir duplicados
    AND p.duplicado_de IS NULL

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

    -- Excluir outliers por defecto
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

    -- Filtro: zonas_permitidas (array de zonas)
    AND (
      p_filtros->'zonas_permitidas' IS NULL
      OR pm.zona = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filtros->'zonas_permitidas')))
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
        WHEN p_filtros->>'estado_entrega' = 'solo_preventa'
        THEN p.estado_construccion::text IN ('preventa', 'en_construccion', 'en_planos')
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
'v2.7: Agrega dias_en_mercado (DATA REAL desde fecha_publicacion).
- Calcula: CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery)
- Habilita mostrar días por propiedad en CMA y landing compradores
Filtros: tipo_operacion, dormitorios, precio, area, zona, zonas_permitidas, microzona,
proyecto, desarrollador, solo_con_telefono, solo_con_fotos, score_min, estado_entrega, incluir_outliers';

-- =====================================================
-- VERIFICACION
-- =====================================================

SELECT 'DESPUES: Verificar dias_en_mercado:' as info;
SELECT id, proyecto, dias_en_mercado, precio_usd
FROM buscar_unidades_reales('{"dormitorios": 1, "limite": 5}'::jsonb);

SELECT 'Migracion 061 completada - dias_en_mercado agregado' as status;
