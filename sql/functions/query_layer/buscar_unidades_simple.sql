-- buscar_unidades_simple(p_filtros JSONB)
-- Versión simplificada de buscar_unidades_reales() para el feed /ventas.
-- Elimina: razon_fiduciaria_texto(), calcular_posicion_mercado(),
--          CTEs de stats (proyecto/zona/edificio/tipologia),
--          subqueries de ranking, es_precio_outlier.
-- Mantiene: todos los filtros de calidad, fotos multi-source, amenidades, agente.
-- Fix vs original: status IN ('completado','actualizado') en vez de solo 'completado'.
-- Creada: 18 Mar 2026

CREATE OR REPLACE FUNCTION public.buscar_unidades_simple(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE(
  id integer,
  nombre_proyecto text,
  desarrollador text,
  zona text,
  microzona text,
  dormitorios integer,
  banos numeric,
  precio_usd numeric,
  precio_m2 numeric,
  area_m2 numeric,
  score_calidad integer,
  agente_nombre text,
  agente_telefono text,
  agente_oficina text,
  fotos_urls text[],
  fotos_count integer,
  url text,
  amenities_lista jsonb,
  es_multiproyecto boolean,
  estado_construccion text,
  dias_en_mercado integer,
  amenities_confirmados text[],
  amenities_por_verificar text[],
  equipamiento_detectado text[],
  descripcion text,
  latitud numeric,
  longitud numeric,
  estacionamientos integer,
  baulera boolean,
  fecha_entrega text,
  piso text,
  plan_pagos_desarrollador boolean,
  acepta_permuta boolean,
  solo_tc_paralelo boolean,
  precio_negociable boolean,
  descuento_contado_pct numeric,
  parqueo_incluido boolean,
  parqueo_precio_adicional numeric,
  baulera_incluido boolean,
  baulera_precio_adicional numeric,
  plan_pagos_cuotas jsonb,
  plan_pagos_texto text,
  fuente text
)
LANGUAGE plpgsql
AS $function$
  BEGIN
    RETURN QUERY
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

      -- Fotos multi-source (C21, Remax, contenido manual)
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

      -- Fotos count
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

      -- Amenities lista
      CASE
        WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
        THEN p.datos_json->'amenities'->'lista'
        ELSE '[]'::jsonb
      END,

      p.es_multiproyecto,
      COALESCE(p.estado_construccion::TEXT, 'no_especificado'),

      (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date))::INTEGER as dias_en_mercado,

      -- Amenities confirmados
      CASE
        WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
             AND jsonb_array_length(p.datos_json->'amenities'->'lista') > 0
        THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
              FROM jsonb_array_elements_text(p.datos_json->'amenities'->'lista') AS elem)
        ELSE NULL
      END::TEXT[],

      -- Amenities por verificar
      CASE
        WHEN jsonb_typeof(p.datos_json->'amenities'->'estado_amenities') = 'object'
        THEN (SELECT ARRAY_AGG(key ORDER BY key)
              FROM jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS x(key, val)
              WHERE val->>'valor' = 'por_confirmar'
                OR (val->>'confianza' = 'baja' AND val->>'valor' = 'true'))
        ELSE NULL
      END::TEXT[],

      -- Equipamiento detectado
      CASE
        WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento') = 'array'
             AND jsonb_array_length(p.datos_json->'amenities'->'equipamiento') > 0
        THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
              FROM jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento') AS elem)
        ELSE NULL
      END::TEXT[],

      -- Descripción (cascade enrichment → discovery → contenido)
      COALESCE(
        p.datos_json_enrichment->>'descripcion',
        p.datos_json_discovery->>'descripcion',
        p.datos_json->'contenido'->>'descripcion'
      )::TEXT,

      p.latitud,
      p.longitud,
      p.estacionamientos::INTEGER,
      p.baulera,

      (p.datos_json->>'fecha_entrega')::TEXT,

      -- Campos adicionales para cards de venta
      p.piso::TEXT,
      (p.datos_json->>'plan_pagos_desarrollador')::BOOLEAN,
      (p.datos_json->>'acepta_permuta')::BOOLEAN,
      p.solo_tc_paralelo,
      (p.datos_json->>'precio_negociable')::BOOLEAN,
      (p.datos_json->>'descuento_contado_pct')::NUMERIC,
      (p.datos_json->>'parqueo_incluido')::BOOLEAN,
      (p.datos_json->>'parqueo_precio_adicional')::NUMERIC,
      (p.datos_json->>'baulera_incluido')::BOOLEAN,
      (p.datos_json->>'baulera_precio_adicional')::NUMERIC,
      p.datos_json->'plan_pagos'->'cuotas',
      (p.datos_json->'plan_pagos'->>'texto')::TEXT,
      p.fuente::TEXT

    FROM propiedades_v2 p
    JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master

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
      AND (
        (p_filtros->>'incluir_multiproyecto')::boolean IS TRUE
        OR p.es_multiproyecto = false
        OR p.es_multiproyecto IS NULL
      )
      AND (
        (p_filtros->>'incluir_datos_viejos')::boolean IS TRUE
        OR es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery)
      )
      -- Filtros de usuario
      AND (
        p_filtros->>'dormitorios' IS NULL
        OR p.dormitorios = (p_filtros->>'dormitorios')::int
      )
      AND (
        p_filtros->'dormitorios_lista' IS NULL
        OR p.dormitorios = ANY(ARRAY(SELECT (jsonb_array_elements_text(p_filtros->'dormitorios_lista'))::int))
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
        p_filtros->>'area_min' IS NULL
        OR p.area_total_m2 >= (p_filtros->>'area_min')::numeric
      )
      AND (
        p_filtros->>'area_max' IS NULL
        OR p.area_total_m2 <= (p_filtros->>'area_max')::numeric
      )
      AND (
        p_filtros->>'zona' IS NULL
        OR pm.zona = (p_filtros->>'zona')
      )
      AND (
        p_filtros->'zonas_permitidas' IS NULL
        OR pm.zona = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filtros->'zonas_permitidas')))
      )
      AND (
        p_filtros->>'microzona' IS NULL
        OR p.microzona = (p_filtros->>'microzona')
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
          THEN COALESCE(p.estado_construccion::text, '') != 'preventa'
          WHEN p_filtros->>'estado_entrega' = 'solo_preventa'
          THEN p.estado_construccion::text IN ('preventa', 'en_construccion', 'en_planos')
          ELSE true
        END
      )

    ORDER BY
      CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) END DESC NULLS LAST,
      CASE WHEN p_filtros->>'orden' = 'recientes' THEN COALESCE(p.fecha_publicacion, p.fecha_discovery::date) END DESC NULLS LAST,
      CASE WHEN p_filtros->>'orden' = 'precio_m2_asc' THEN (precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0)) END ASC NULLS LAST,
      CASE WHEN p_filtros->>'orden' = 'precio_m2_desc' THEN (precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0)) END DESC NULLS LAST,
      CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'precio_asc' THEN precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) END ASC NULLS LAST,
      p.id DESC
    LIMIT COALESCE((p_filtros->>'limite')::int, 500);
  END;
$function$;
