-- ============================================================================
-- 212: Exponer tipo_cambio_detectado en buscar_unidades_reales
-- ============================================================================
-- El campo ya existe en propiedades_v2 y se usa internamente para normalizar
-- precios, pero no se devolvía al caller. Simon Advisor lo necesita para
-- flagear propiedades con TC no confirmado que podrían tener precio incorrecto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buscar_unidades_reales(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id integer, nombre_proyecto text, desarrollador text, zona text, microzona text, dormitorios integer, banos numeric, precio_usd numeric, precio_m2 numeric, area_m2 numeric, score_calidad integer, agente_nombre text, agente_telefono text, agente_oficina text, fotos_urls text[], fotos_count integer, url text, amenities_lista jsonb, razon_fiduciaria text, es_multiproyecto boolean, estado_construccion text, es_precio_outlier boolean, dias_en_mercado integer, unidades_en_edificio integer, posicion_precio_edificio integer, precio_min_edificio numeric, precio_max_edificio numeric, unidades_misma_tipologia integer, posicion_en_tipologia integer, precio_min_tipologia numeric, precio_max_tipologia numeric, amenities_confirmados text[], amenities_por_verificar text[], equipamiento_detectado text[], descripcion text, posicion_mercado jsonb, latitud numeric, longitud numeric, estacionamientos integer, baulera boolean, fecha_entrega text, tipo_cambio_detectado text)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH
  proyecto_stats AS (
    SELECT
      pv.id_proyecto_master,
      AVG(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado) / NULLIF(pv.area_total_m2, 0)) as avg_precio_m2,
      COUNT(*) as cnt
    FROM propiedades_v2 pv
    WHERE pv.status IN ('completado', 'actualizado')
      AND pv.es_activa = true
      AND pv.duplicado_de IS NULL
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND pv.area_total_m2 >= 20
    GROUP BY pv.id_proyecto_master
  ),
  zona_stats AS (
    SELECT
      pmz.zona,
      AVG(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado) / NULLIF(pv.area_total_m2, 0)) as avg_precio_m2_zona
    FROM propiedades_v2 pv
    JOIN proyectos_master pmz ON pv.id_proyecto_master = pmz.id_proyecto_master
    WHERE pv.status IN ('completado', 'actualizado')
      AND pv.es_activa = true
      AND pv.duplicado_de IS NULL
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND pv.area_total_m2 >= 20
    GROUP BY pmz.zona
  ),
  edificio_stats AS (
    SELECT
      pv.id_proyecto_master,
      COUNT(*) as total_unidades,
      MIN(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado)) as precio_min,
      MAX(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado)) as precio_max
    FROM propiedades_v2 pv
    WHERE pv.status IN ('completado', 'actualizado')
      AND pv.es_activa = true
      AND pv.duplicado_de IS NULL
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND pv.area_total_m2 >= 20
      AND es_propiedad_vigente(pv.estado_construccion::text, pv.fecha_publicacion, pv.fecha_discovery)
    GROUP BY pv.id_proyecto_master
  ),
  tipologia_stats AS (
    SELECT
      pv.id_proyecto_master,
      pv.dormitorios,
      COUNT(*) as total_unidades_tipologia,
      MIN(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado)) as precio_min_tipologia,
      MAX(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado)) as precio_max_tipologia
    FROM propiedades_v2 pv
    WHERE pv.status IN ('completado', 'actualizado')
      AND pv.es_activa = true
      AND pv.duplicado_de IS NULL
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND pv.area_total_m2 >= 20
      AND es_propiedad_vigente(pv.estado_construccion::text, pv.fecha_publicacion, pv.fecha_discovery)
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
    precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) as precio_usd,
    ROUND((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
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

    COALESCE(p.estado_construccion, 'no_especificado')::TEXT,

    CASE
      WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
        ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) > 0.55
      WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
        ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) > 0.55
      ELSE false
    END as es_precio_outlier,

    GREATEST(0,
      CASE
        WHEN p.fecha_publicacion IS NOT NULL THEN (CURRENT_DATE - p.fecha_publicacion::date)
        WHEN p.fecha_discovery IS NOT NULL THEN (CURRENT_DATE - p.fecha_discovery::date)
        ELSE 0
      END
    )::INTEGER as dias_en_mercado,

    COALESCE(es.total_unidades, 0)::INTEGER,

    (SELECT COUNT(*) + 1 FROM propiedades_v2 otras
      WHERE otras.id_proyecto_master = p.id_proyecto_master
      AND otras.id != p.id
      AND otras.status IN ('completado', 'actualizado')
      AND otras.es_activa = true
      AND otras.duplicado_de IS NULL
      AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND precio_normalizado(otras.precio_usd, otras.tipo_cambio_detectado) < precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)
      AND es_propiedad_vigente(otras.estado_construccion::text, otras.fecha_publicacion, otras.fecha_discovery)
    )::INTEGER as posicion_precio_edificio,

    COALESCE(es.precio_min, 0),
    COALESCE(es.precio_max, 0),

    COALESCE(ts.total_unidades_tipologia, 0)::INTEGER,

    (SELECT COUNT(*) + 1 FROM propiedades_v2 otras
      WHERE otras.id_proyecto_master = p.id_proyecto_master
      AND otras.dormitorios = p.dormitorios
      AND otras.id != p.id
      AND otras.status IN ('completado', 'actualizado')
      AND otras.es_activa = true
      AND otras.duplicado_de IS NULL
      AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND precio_normalizado(otras.precio_usd, otras.tipo_cambio_detectado) < precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)
      AND es_propiedad_vigente(otras.estado_construccion::text, otras.fecha_publicacion, otras.fecha_discovery)
    )::INTEGER as posicion_en_tipologia,

    COALESCE(ts.precio_min_tipologia, 0),
    COALESCE(ts.precio_max_tipologia, 0),

    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pm.amenidades_edificio->'confirmados'))
      FILTER (WHERE jsonb_typeof(pm.amenidades_edificio->'confirmados') = 'array'),
      ARRAY[]::TEXT[]
    ),

    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pm.amenidades_edificio->'por_verificar'))
      FILTER (WHERE jsonb_typeof(pm.amenidades_edificio->'por_verificar') = 'array'),
      ARRAY[]::TEXT[]
    ),

    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pm.equipamiento_base))
      FILTER (WHERE jsonb_typeof(pm.equipamiento_base) = 'array'),
      ARRAY[]::TEXT[]
    ),

    LEFT(COALESCE(
      p.datos_json->'contenido'->>'descripcion',
      p.datos_json_enrichment->>'descripcion',
      ''
    ), 500)::TEXT as descripcion,

    calcular_posicion_mercado(
      ROUND((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0))::numeric, 0),
      pm.zona,
      p.dormitorios
    ) as posicion_mercado,

    p.latitud,
    p.longitud,

    COALESCE((p.datos_json->'contenido'->>'estacionamientos')::INTEGER, 0) as estacionamientos,
    COALESCE((p.datos_json->'contenido'->>'baulera')::BOOLEAN, false) as baulera,

    (p.datos_json->>'fecha_entrega')::TEXT as fecha_entrega,

    COALESCE(p.tipo_cambio_detectado, 'no_especificado')::TEXT as tipo_cambio_detectado

  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  LEFT JOIN proyecto_stats ps ON p.id_proyecto_master = ps.id_proyecto_master
  LEFT JOIN zona_stats zs ON pm.zona = zs.zona
  LEFT JOIN edificio_stats es ON p.id_proyecto_master = es.id_proyecto_master
  LEFT JOIN tipologia_stats ts ON p.id_proyecto_master = ts.id_proyecto_master
                              AND p.dormitorios = ts.dormitorios

  WHERE p.es_activa = true
    AND pm.activo = true
    AND p.status IN ('completado', 'actualizado')
    AND pm.zona != 'Sin zona'
    AND p.duplicado_de IS NULL
    AND (
      CASE
        WHEN p_filtros->>'tipo_operacion' IS NOT NULL
        THEN p.tipo_operacion::text = (p_filtros->>'tipo_operacion')
        ELSE p.tipo_operacion::text = 'venta'
      END
    )
    AND lower(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    AND p.area_total_m2 >= 20
    AND precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) > 0
    AND (
      (p_filtros->>'incluir_multiproyecto')::boolean IS TRUE
      OR p.es_multiproyecto = false
      OR p.es_multiproyecto IS NULL
    )
    AND (
      (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
      OR (
        (jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
        AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0)
        OR (p.fuente = 'remax' AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL)
        OR (p.fuente = 'century21'
            AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
            AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0)
      )
    )
    AND (
      CASE
        WHEN p_filtros->>'excluir_outliers' = 'true' THEN
        CASE
          WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
            ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) <= 0.55
          WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
            ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) <= 0.55
          ELSE true
        END
        ELSE true
      END
    )
    AND (
      p_filtros->>'precio_max' IS NULL
      OR precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) <= (p_filtros->>'precio_max')::numeric
    )
    AND (
      p_filtros->>'precio_min' IS NULL
      OR precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) >= (p_filtros->>'precio_min')::numeric
    )
    AND (
      p_filtros->>'zona' IS NULL
      OR pm.zona = (p_filtros->>'zona')
    )
    AND (
      p_filtros->>'dormitorios' IS NULL
      OR p.dormitorios = (p_filtros->>'dormitorios')::int
    )
    AND (
      p_filtros->>'estado_entrega' IS NULL
      OR p_filtros->>'estado_entrega' = 'no_importa'
      OR (p_filtros->>'estado_entrega' = 'entrega_inmediata'
        AND p.estado_construccion IN ('terminado', 'entrega_inmediata', 'entregado'))
      OR (p_filtros->>'estado_entrega' = 'solo_preventa'
        AND p.estado_construccion IN ('en_construccion', 'preventa', 'pozo'))
    )
    AND (
      p_filtros->>'excluir_duplicados' IS NULL
      OR p_filtros->>'excluir_duplicados' != 'true'
      OR p.duplicado_de IS NULL
    )
    AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery)

  ORDER BY
    CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'precio_m2_asc' THEN (precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0)) END ASC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'precio_m2_desc' THEN (precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0)) END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'score_desc' THEN p.score_calidad_dato END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'precio_asc' THEN precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) END ASC NULLS LAST,
    p.id DESC
  LIMIT COALESCE((p_filtros->>'limite')::int, 50);
END;
$function$;
