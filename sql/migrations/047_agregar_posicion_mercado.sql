-- =====================================================
-- MIGRACIN 047: Agregar posicion_mercado a buscar_unidades_reales
-- Fecha: 12 Enero 2026
-- Propsito: Incluir comparacin de precio vs promedio zona directamente
-- BASADA EN: migracin 046
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
  banos NUMERIC,
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
  dias_en_mercado INTEGER,
  unidades_en_edificio INTEGER,
  posicion_precio_edificio INTEGER,
  precio_min_edificio NUMERIC,
  precio_max_edificio NUMERIC,
  unidades_misma_tipologia INTEGER,
  posicion_en_tipologia INTEGER,
  precio_min_tipologia NUMERIC,
  precio_max_tipologia NUMERIC,
  amenities_confirmados TEXT[],
  amenities_por_verificar TEXT[],
  equipamiento_detectado TEXT[],
  descripcion TEXT,
  posicion_mercado JSONB  -- v2.13: NUEVO - comparacin precio vs promedio zona
) AS $func$
BEGIN
  RETURN QUERY
  WITH
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
  ),
  edificio_stats AS (
    SELECT
      pv.id_proyecto_master,
      COUNT(*) as total_unidades,
      MIN(pv.precio_usd) as precio_min,
      MAX(pv.precio_usd) as precio_max
    FROM propiedades_v2 pv
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.tipo_operacion = 'venta'
      AND pv.area_total_m2 >= 20
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    GROUP BY pv.id_proyecto_master
  ),
  tipologia_stats AS (
    SELECT
      pv.id_proyecto_master,
      pv.dormitorios,
      COUNT(*) as total_unidades_tipologia,
      MIN(pv.precio_usd) as precio_min_tipologia,
      MAX(pv.precio_usd) as precio_max_tipologia
    FROM propiedades_v2 pv
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.tipo_operacion = 'venta'
      AND pv.area_total_m2 >= 20
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    GROUP BY pv.id_proyecto_master, pv.dormitorios
  )
  SELECT
    p.id,
    pm.nombre_oficial::TEXT,
    pm.desarrollador::TEXT,
    pm.zona::TEXT,
    p.microzona::TEXT,
    p.dormitorios,
    p.banos,
    p.precio_usd,
    ROUND((p.precio_usd / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
    p.area_total_m2,
    p.score_calidad_dato,
    (p.datos_json->'agente'->>'nombre')::TEXT,
    (p.datos_json->'agente'->>'telefono')::TEXT,
    (p.datos_json->'agente'->>'oficina_nombre')::TEXT,

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

    CASE
      WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
        ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) > 0.55
      WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
        ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) > 0.55
      ELSE false
    END as es_precio_outlier,

    (CURRENT_DATE - p.fecha_publicacion::date)::INTEGER as dias_en_mercado,

    es.total_unidades::INTEGER as unidades_en_edificio,

    (SELECT COUNT(*) + 1
     FROM propiedades_v2 otras
     WHERE otras.id_proyecto_master = p.id_proyecto_master
       AND otras.status = 'completado'
       AND otras.es_activa = true
       AND otras.tipo_operacion = 'venta'
       AND otras.area_total_m2 >= 20
       AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
       AND otras.precio_usd < p.precio_usd)::INTEGER as posicion_precio_edificio,

    es.precio_min as precio_min_edificio,
    es.precio_max as precio_max_edificio,

    ts.total_unidades_tipologia::INTEGER as unidades_misma_tipologia,

    (SELECT COUNT(*) + 1
     FROM propiedades_v2 otras
     WHERE otras.id_proyecto_master = p.id_proyecto_master
       AND otras.dormitorios = p.dormitorios
       AND otras.status = 'completado'
       AND otras.es_activa = true
       AND otras.tipo_operacion = 'venta'
       AND otras.area_total_m2 >= 20
       AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
       AND otras.precio_usd < p.precio_usd)::INTEGER as posicion_en_tipologia,

    ts.precio_min_tipologia as precio_min_tipologia,
    ts.precio_max_tipologia as precio_max_tipologia,

    (SELECT ARRAY_AGG(key ORDER BY key)
     FROM jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS x(key, val)
     WHERE val->>'valor' = 'true'
       AND val->>'confianza' IN ('alta', 'media')
    )::TEXT[] as amenities_confirmados,

    (SELECT ARRAY_AGG(key ORDER BY key)
     FROM jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS x(key, val)
     WHERE val->>'valor' = 'por_confirmar'
        OR (val->>'confianza' = 'baja' AND val->>'valor' = 'true')
    )::TEXT[] as amenities_por_verificar,

    (SELECT ARRAY_AGG(item ORDER BY item)
     FROM (
       SELECT 'Aire acondicionado' as item
       WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%aire acondicionado%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%aire%acondicionado%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%a/c%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%con aire%'

       UNION

       SELECT 'Cocina equipada' as item
       WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina equipada%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina americana%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina completa%'

       UNION

       SELECT 'Amoblado' as item
       WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%amoblado%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%totalmente equipado%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%completamente equipado%'

       UNION

       SELECT 'Closets empotrados' as item
       WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%closet%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%ropero empotrado%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%roperos empotrados%'
          OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%roperos de techo%'
     ) items
    )::TEXT[] as equipamiento_detectado,

    COALESCE(
      p.datos_json_enrichment->>'descripcion',
      p.datos_json_discovery->>'descripcion',
      p.datos_json->'contenido'->>'descripcion'
    )::TEXT as descripcion,

    -- v2.13: NUEVO - Posicin de mercado (comparacin vs promedio zona)
    calcular_posicion_mercado(p.precio_usd, pm.zona, p.dormitorios) as posicion_mercado

  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  LEFT JOIN proyecto_stats ps ON p.id_proyecto_master = ps.id_proyecto_master
  LEFT JOIN zona_stats zs ON pm.zona = zs.zona
  LEFT JOIN edificio_stats es ON p.id_proyecto_master = es.id_proyecto_master
  LEFT JOIN tipologia_stats ts ON p.id_proyecto_master = ts.id_proyecto_master
                               AND p.dormitorios = ts.dormitorios

  WHERE p.es_activa = true
    AND pm.activo = true
    AND p.status = 'completado'
    AND (
      CASE
        WHEN p_filtros->>'tipo_operacion' IS NOT NULL
        THEN p.tipo_operacion::text = (p_filtros->>'tipo_operacion')
        ELSE p.tipo_operacion::text = 'venta'
      END
    )
    AND lower(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    AND p.area_total_m2 >= 20
    AND (
      (p_filtros->>'incluir_multiproyecto')::boolean IS TRUE
      OR p.es_multiproyecto = false
      OR p.es_multiproyecto IS NULL
    )
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
    AND (
      p_filtros->>'dormitorios' IS NULL
      OR p.dormitorios = (p_filtros->>'dormitorios')::int
    )
    AND (
      p_filtros->>'precio_max' IS NULL
      OR p.precio_usd <= (p_filtros->>'precio_max')::numeric
    )
    AND (
      p_filtros->>'precio_min' IS NULL
      OR p.precio_usd >= (p_filtros->>'precio_min')::numeric
    )
    AND (
      p_filtros->>'area_min' IS NULL
      OR p.area_total_m2 >= (p_filtros->>'area_min')::numeric
    )
    AND (
      p_filtros->>'area_max' IS NULL
      OR p.area_total_m2 <= (p_filtros->>'area_max')::numeric
    )
    AND (
      p_filtros->>'zona' IS NULL
      OR pm.zona ILIKE '%' || (p_filtros->>'zona') || '%'
    )
    AND (
      p_filtros->>'microzona' IS NULL
      OR p.microzona ILIKE '%' || (p_filtros->>'microzona') || '%'
    )
    AND (
      p_filtros->>'proyecto' IS NULL
      OR pm.nombre_oficial ILIKE '%' || (p_filtros->>'proyecto') || '%'
    )
    AND (
      p_filtros->>'desarrollador' IS NULL
      OR pm.desarrollador ILIKE '%' || (p_filtros->>'desarrollador') || '%'
    )
    AND (
      (p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE
      OR p.datos_json->'agente'->>'telefono' IS NOT NULL
    )
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
    AND (
      p_filtros->>'score_min' IS NULL
      OR p.score_calidad_dato >= (p_filtros->>'score_min')::int
    )
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
'v2.13: Agregar posicion_mercado (JSONB con comparacin vs promedio zona).
Ahora cada propiedad trae directamente su comparacin de precio.';

-- Test
SELECT 'Migracin 047 - Test posicion_mercado:' as status;
SELECT
  id,
  proyecto,
  zona,
  precio_usd,
  posicion_mercado->>'categoria' as categoria,
  posicion_mercado->>'diferencia_pct' as diferencia_pct
FROM buscar_unidades_reales('{"dormitorios": 2, "limite": 5}'::jsonb);
