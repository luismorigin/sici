-- Migración 168: Normalizar precios TC paralelo en TODO el sistema
--
-- Reemplaza COALESCE(precio_usd_actualizado, precio_usd) y precio_usd crudo
-- con precio_normalizado(precio_usd, tipo_cambio_detectado) en:
--   1. buscar_unidades_reales()
--   2. v_metricas_mercado (vista)
--   3. v_alternativas_proyecto (vista)
--   4. snapshot_absorcion_mercado()
--   5. calcular_precio_m2_unidad() (trigger)
--   6. generar_razon_fiduciaria()
--   7. explicar_precio()
--   8. analisis_mercado_fiduciario()
--   9. recalcular_precio_propiedad() (fix fórmula)
--
-- Requiere: migración 167 (precio_normalizado helper)

-- ============================================================================
-- 1. buscar_unidades_reales() — CRÍTICO
-- ============================================================================

CREATE OR REPLACE FUNCTION public.buscar_unidades_reales(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id integer, nombre_proyecto text, desarrollador text, zona text, microzona text, dormitorios integer, banos numeric, precio_usd numeric, precio_m2 numeric, area_m2 numeric, score_calidad integer, agente_nombre text, agente_telefono text, agente_oficina text, fotos_urls text[], fotos_count integer, url text, amenities_lista jsonb, razon_fiduciaria text, es_multiproyecto boolean, estado_construccion text, es_precio_outlier boolean, dias_en_mercado integer, unidades_en_edificio integer, posicion_precio_edificio integer, precio_min_edificio numeric, precio_max_edificio numeric, unidades_misma_tipologia integer, posicion_en_tipologia integer, precio_min_tipologia numeric, precio_max_tipologia numeric, amenities_confirmados text[], amenities_por_verificar text[], equipamiento_detectado text[], descripcion text, posicion_mercado jsonb, latitud numeric, longitud numeric, estacionamientos integer, baulera boolean, fecha_entrega text)
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
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.area_total_m2 > 20
      AND pv.duplicado_de IS NULL
      AND es_propiedad_vigente(pv.estado_construccion::text, pv.fecha_publicacion, pv.fecha_discovery)
    GROUP BY pv.id_proyecto_master
  ),
  zona_stats AS (
    SELECT
      pmz.zona,
      AVG(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado) / NULLIF(pv.area_total_m2, 0)) as avg_precio_m2_zona
    FROM propiedades_v2 pv
    JOIN proyectos_master pmz ON pv.id_proyecto_master = pmz.id_proyecto_master
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.area_total_m2 > 20
      AND pv.duplicado_de IS NULL
      AND es_propiedad_vigente(pv.estado_construccion::text, pv.fecha_publicacion, pv.fecha_discovery)
    GROUP BY pmz.zona
  ),
  edificio_stats AS (
    SELECT
      pv.id_proyecto_master,
      COUNT(*) as total_unidades,
      MIN(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado)) as precio_min,
      MAX(precio_normalizado(pv.precio_usd, pv.tipo_cambio_detectado)) as precio_max
    FROM propiedades_v2 pv
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.tipo_operacion = 'venta'
      AND pv.area_total_m2 >= 20
      AND pv.duplicado_de IS NULL
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
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
    WHERE pv.status = 'completado'
      AND pv.es_activa = true
      AND pv.tipo_operacion = 'venta'
      AND pv.area_total_m2 >= 20
      AND pv.duplicado_de IS NULL
      AND lower(COALESCE(pv.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
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
    COALESCE(p.estado_construccion::TEXT, 'no_especificado'),

    CASE
      WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
        ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) > 0.55
      WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
        ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) > 0.55
      ELSE false
    END as es_precio_outlier,

    (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date))::INTEGER as dias_en_mercado,

    es.total_unidades::INTEGER as unidades_en_edificio,

    (SELECT COUNT(*) + 1
    FROM propiedades_v2 otras
    WHERE otras.id_proyecto_master = p.id_proyecto_master
      AND otras.status = 'completado'
      AND otras.es_activa = true
      AND otras.tipo_operacion = 'venta'
      AND otras.area_total_m2 >= 20
      AND otras.duplicado_de IS NULL
      AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND precio_normalizado(otras.precio_usd, otras.tipo_cambio_detectado) < precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)
      AND es_propiedad_vigente(otras.estado_construccion::text, otras.fecha_publicacion, otras.fecha_discovery)
    )::INTEGER as posicion_precio_edificio,

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
      AND otras.duplicado_de IS NULL
      AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND precio_normalizado(otras.precio_usd, otras.tipo_cambio_detectado) < precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)
      AND es_propiedad_vigente(otras.estado_construccion::text, otras.fecha_publicacion, otras.fecha_discovery)
    )::INTEGER as posicion_en_tipologia,

    ts.precio_min_tipologia as precio_min_tipologia,
    ts.precio_max_tipologia as precio_max_tipologia,

    CASE
      WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
           AND jsonb_array_length(p.datos_json->'amenities'->'lista') > 0
      THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
            FROM jsonb_array_elements_text(p.datos_json->'amenities'->'lista') AS elem)
      ELSE NULL
    END::TEXT[] as amenities_confirmados,

    CASE
      WHEN jsonb_typeof(p.datos_json->'amenities'->'estado_amenities') = 'object'
      THEN (SELECT ARRAY_AGG(key ORDER BY key)
            FROM jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS x(key, val)
            WHERE val->>'valor' = 'por_confirmar'
              OR (val->>'confianza' = 'baja' AND val->>'valor' = 'true'))
      ELSE NULL
    END::TEXT[] as amenities_por_verificar,

    CASE
      WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento') = 'array'
           AND jsonb_array_length(p.datos_json->'amenities'->'equipamiento') > 0
      THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
            FROM jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento') AS elem)
      ELSE NULL
    END::TEXT[] as equipamiento_detectado,

    COALESCE(
      p.datos_json_enrichment->>'descripcion',
      p.datos_json_discovery->>'descripcion',
      p.datos_json->'contenido'->>'descripcion'
    )::TEXT as descripcion,

    calcular_posicion_mercado(
      ROUND((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0))::numeric, 0),
      pm.zona,
      p.dormitorios
    ) as posicion_mercado,

    p.latitud,
    p.longitud,
    p.estacionamientos::INTEGER,
    p.baulera,

    (p.datos_json->>'fecha_entrega')::TEXT as fecha_entrega

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
      (p_filtros->>'incluir_outliers')::boolean IS TRUE
      OR (
        CASE
          WHEN ps.cnt >= 2 AND ps.avg_precio_m2 > 0 THEN
            ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) <= 0.55
          WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
            ABS((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) <= 0.55
          ELSE true
        END
      )
    )
    AND (
      (p_filtros->>'incluir_datos_viejos')::boolean IS TRUE
      OR es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery)
    )
    AND (
      p_filtros->>'dormitorios' IS NULL
      OR p.dormitorios = (p_filtros->>'dormitorios')::int
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
      OR pm.zona ILIKE '%' || (p_filtros->>'zona') || '%'
    )
    AND (
      p_filtros->'zonas_permitidas' IS NULL
      OR pm.zona = ANY(ARRAY(SELECT jsonb_array_elements_text(p_filtros->'zonas_permitidas')))
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
        THEN COALESCE(p.estado_construccion::text, '') != 'preventa'
        WHEN p_filtros->>'estado_entrega' = 'solo_preventa'
        THEN p.estado_construccion::text IN ('preventa', 'en_construccion', 'en_planos')
        ELSE true
      END
    )

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


-- ============================================================================
-- 2. v_metricas_mercado (vista)
-- ============================================================================

CREATE OR REPLACE VIEW v_metricas_mercado AS
SELECT dormitorios,
    COALESCE(microzona, zona, 'Sin zona'::character varying) AS zona,
    count(*) AS stock,
    round(avg(precio_normalizado(precio_usd, tipo_cambio_detectado)), 0) AS precio_promedio,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY (precio_normalizado(precio_usd, tipo_cambio_detectado)::double precision))::numeric, 0) AS precio_mediana,
    round(min(precio_normalizado(precio_usd, tipo_cambio_detectado)), 0) AS precio_min,
    round(max(precio_normalizado(precio_usd, tipo_cambio_detectado)), 0) AS precio_max,
    round(avg(area_total_m2), 1) AS area_promedio,
    round(avg(precio_normalizado(precio_usd, tipo_cambio_detectado) / area_total_m2), 0) AS precio_m2,
    round(avg(CURRENT_DATE - fecha_publicacion), 0) AS dias_promedio,
    round(percentile_cont(0.5::double precision) WITHIN GROUP (ORDER BY ((CURRENT_DATE - fecha_publicacion)::double precision))::numeric, 0) AS dias_mediana
FROM propiedades_v2
WHERE es_activa = true AND tipo_operacion = 'venta'::tipo_operacion_enum
  AND precio_usd > 30000::numeric
  AND area_total_m2 > 25::numeric
  AND (precio_normalizado(precio_usd, tipo_cambio_detectado) / area_total_m2) >= 800::numeric
  AND (precio_normalizado(precio_usd, tipo_cambio_detectado) / area_total_m2) <= 4000::numeric
  AND fecha_publicacion IS NOT NULL
  AND (CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date)) <= 300
GROUP BY dormitorios, (COALESCE(microzona, zona, 'Sin zona'::character varying));


-- ============================================================================
-- 3. v_alternativas_proyecto (vista)
-- ============================================================================

CREATE OR REPLACE VIEW v_alternativas_proyecto AS
SELECT pm.id_proyecto_master,
    pm.nombre_oficial AS proyecto,
    pm.desarrollador,
    pm.zona,
    count(*) AS listings_publicados,
    round(min(precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)), 0) AS precio_desde,
    round(max(precio_normalizado(p.precio_usd, p.tipo_cambio_detectado)), 0) AS precio_hasta,
    COALESCE(( SELECT array_agg(DISTINCT d.value::integer ORDER BY (d.value::integer)) AS array_agg
           FROM propiedades_v2 p2,
            LATERAL jsonb_array_elements_text((p2.datos_json -> 'fisico'::text) -> 'dormitorios_opciones'::text) d(value)
          WHERE p2.id_proyecto_master = pm.id_proyecto_master AND p2.es_multiproyecto = true AND p2.es_activa = true AND jsonb_typeof((p2.datos_json -> 'fisico'::text) -> 'dormitorios_opciones'::text) = 'array'::text), array_agg(DISTINCT p.dormitorios ORDER BY p.dormitorios) FILTER (WHERE p.dormitorios IS NOT NULL)) AS tipologias_disponibles,
    bool_or(((p.datos_json -> 'proyecto'::text) ->> 'estado_construccion'::text) = 'preventa'::text) AS incluye_preventa,
    round(min(p.area_total_m2), 0) AS area_desde,
    round(max(p.area_total_m2), 0) AS area_hasta
FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.es_multiproyecto = true AND p.es_activa = true AND p.tipo_operacion = 'venta'::tipo_operacion_enum AND p.status = 'completado'::estado_propiedad AND p.precio_usd > 30000::numeric
GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.desarrollador, pm.zona
HAVING count(*) >= 1;


-- ============================================================================
-- 4. snapshot_absorcion_mercado()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.snapshot_absorcion_mercado()
 RETURNS TABLE(dormitorios_out integer, insertado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_fecha DATE := CURRENT_DATE;
  v_dorm INTEGER;
  v_venta_activas INTEGER;
  v_venta_absorbidas INTEGER;
  v_venta_nuevas INTEGER;
  v_tasa NUMERIC(5,2);
  v_meses NUMERIC(5,1);
  v_ticket_prom INTEGER;
  v_ticket_med INTEGER;
  v_ticket_p25 INTEGER;
  v_ticket_p75 INTEGER;
  v_usd_m2 INTEGER;
  v_area_prom INTEGER;
  v_abs_ticket INTEGER;
  v_abs_usd_m2 INTEGER;
  v_alq_activas INTEGER;
  v_alq_prom INTEGER;
  v_alq_med INTEGER;
  v_alq_p25 INTEGER;
  v_alq_p75 INTEGER;
  v_roi NUMERIC(5,2);
  v_retorno NUMERIC(5,1);
BEGIN
  FOR v_dorm IN 0..3 LOOP
    -- === VENTA: Inventario activo ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER,
      ROUND(AVG(area_total_m2))::INTEGER
    INTO v_venta_activas, v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75, v_usd_m2, v_area_prom
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm;

    -- === VENTA: Absorbidas últimos 30 días ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado)))::INTEGER,
      ROUND(AVG(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)))::INTEGER
    INTO v_venta_absorbidas, v_abs_ticket, v_abs_usd_m2
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND status = 'inactivo_confirmed'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm
      AND primera_ausencia_at >= CURRENT_DATE - INTERVAL '30 days';

    -- === VENTA: Nuevas últimos 30 días ===
    SELECT COUNT(*)
    INTO v_venta_nuevas
    FROM propiedades_v2
    WHERE tipo_operacion = 'venta'
      AND fuente IN ('century21', 'remax')
      AND precio_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm
      AND fecha_creacion >= CURRENT_DATE - INTERVAL '30 days'
      AND status NOT IN ('excluido_operacion');

    -- === Calcular tasa y meses ===
    IF (v_venta_activas + v_venta_absorbidas) > 0 THEN
      v_tasa := ROUND(100.0 * v_venta_absorbidas / (v_venta_activas + v_venta_absorbidas), 2);
    ELSE
      v_tasa := 0;
    END IF;

    IF v_venta_absorbidas > 0 THEN
      v_meses := ROUND(v_venta_activas::NUMERIC / v_venta_absorbidas, 1);
    ELSE
      v_meses := NULL;
    END IF;

    -- === ALQUILER (no normaliza — usa precio_mensual_usd) ===
    SELECT
      COUNT(*),
      ROUND(AVG(precio_mensual_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER,
      ROUND(PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY precio_mensual_usd))::INTEGER
    INTO v_alq_activas, v_alq_prom, v_alq_med, v_alq_p25, v_alq_p75
    FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler'
      AND status = 'completado'
      AND fuente IN ('century21', 'remax')
      AND precio_mensual_usd > 0
      AND area_total_m2 >= 20
      AND propiedades_v2.dormitorios = v_dorm;

    -- === ROI cruzado ===
    IF v_alq_prom > 0 AND v_ticket_prom > 0 THEN
      v_roi := ROUND((v_alq_prom * 12.0) / v_ticket_prom * 100, 2);
      v_retorno := ROUND(v_ticket_prom::NUMERIC / (v_alq_prom * 12.0), 1);
    ELSE
      v_roi := NULL;
      v_retorno := NULL;
    END IF;

    -- === INSERT (idempotente) ===
    INSERT INTO market_absorption_snapshots (
      fecha, dormitorios,
      venta_activas, venta_absorbidas_30d, venta_nuevas_30d,
      venta_tasa_absorcion, venta_meses_inventario,
      venta_ticket_promedio, venta_ticket_mediana, venta_ticket_p25, venta_ticket_p75,
      venta_usd_m2, venta_area_promedio,
      absorbidas_ticket_promedio, absorbidas_usd_m2,
      alquiler_activas, alquiler_mensual_promedio, alquiler_mensual_mediana,
      alquiler_mensual_p25, alquiler_mensual_p75,
      roi_bruto_anual, anos_retorno
    ) VALUES (
      v_fecha, v_dorm,
      v_venta_activas, v_venta_absorbidas, v_venta_nuevas,
      v_tasa, v_meses,
      v_ticket_prom, v_ticket_med, v_ticket_p25, v_ticket_p75,
      v_usd_m2, v_area_prom,
      v_abs_ticket, v_abs_usd_m2,
      v_alq_activas, v_alq_prom, v_alq_med,
      v_alq_p25, v_alq_p75,
      v_roi, v_retorno
    )
    ON CONFLICT (fecha, dormitorios) DO UPDATE SET
      venta_activas = EXCLUDED.venta_activas,
      venta_absorbidas_30d = EXCLUDED.venta_absorbidas_30d,
      venta_nuevas_30d = EXCLUDED.venta_nuevas_30d,
      venta_tasa_absorcion = EXCLUDED.venta_tasa_absorcion,
      venta_meses_inventario = EXCLUDED.venta_meses_inventario,
      venta_ticket_promedio = EXCLUDED.venta_ticket_promedio,
      venta_ticket_mediana = EXCLUDED.venta_ticket_mediana,
      venta_ticket_p25 = EXCLUDED.venta_ticket_p25,
      venta_ticket_p75 = EXCLUDED.venta_ticket_p75,
      venta_usd_m2 = EXCLUDED.venta_usd_m2,
      venta_area_promedio = EXCLUDED.venta_area_promedio,
      absorbidas_ticket_promedio = EXCLUDED.absorbidas_ticket_promedio,
      absorbidas_usd_m2 = EXCLUDED.absorbidas_usd_m2,
      alquiler_activas = EXCLUDED.alquiler_activas,
      alquiler_mensual_promedio = EXCLUDED.alquiler_mensual_promedio,
      alquiler_mensual_mediana = EXCLUDED.alquiler_mensual_mediana,
      alquiler_mensual_p25 = EXCLUDED.alquiler_mensual_p25,
      alquiler_mensual_p75 = EXCLUDED.alquiler_mensual_p75,
      roi_bruto_anual = EXCLUDED.roi_bruto_anual,
      anos_retorno = EXCLUDED.anos_retorno,
      created_at = NOW();

    dormitorios_out := v_dorm;
    insertado := TRUE;
    RETURN NEXT;
  END LOOP;
END;
$function$;


-- ============================================================================
-- 5. calcular_precio_m2_unidad() (trigger)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calcular_precio_m2_unidad()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.precio_usd > 0 AND NEW.area_total_m2 > 0 THEN
    NEW.precio_m2_usd = precio_normalizado(NEW.precio_usd, NEW.tipo_cambio_detectado) / NEW.area_total_m2;
  END IF;
  RETURN NEW;
END;
$function$;


-- ============================================================================
-- 6. generar_razon_fiduciaria()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generar_razon_fiduciaria(p_propiedad_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_prop RECORD;
    v_metricas RECORD;
    v_proyecto RECORD;
    v_razones JSONB := '[]'::jsonb;
    v_razon TEXT;
    v_diff_pct NUMERIC;
    v_stock_mismo_tipo INTEGER;
    v_stock_bajo_precio INTEGER;
    v_posicion_precio INTEGER;
    v_total_proyecto INTEGER;
BEGIN
    SELECT
        p.id,
        p.dormitorios,
        precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) as precio_usd,
        p.area_total_m2,
        ROUND((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
        COALESCE(p.microzona, p.zona, 'Equipetrol') as zona,
        p.id_proyecto_master,
        pm.nombre_oficial as proyecto_nombre,
        pm.desarrollador
    INTO v_prop
    FROM propiedades_v2 p
    LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
    WHERE p.id = p_propiedad_id;

    IF v_prop.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada'
        );
    END IF;

    SELECT
        stock,
        precio_promedio,
        precio_mediana,
        precio_min,
        precio_max,
        precio_m2 as precio_m2_promedio
    INTO v_metricas
    FROM v_metricas_mercado
    WHERE dormitorios = v_prop.dormitorios
      AND zona = v_prop.zona;

    SELECT COUNT(*) INTO v_stock_bajo_precio
    FROM propiedades_v2 p
    WHERE p.es_activa = true
      AND p.tipo_operacion = 'venta'
      AND p.status = 'completado'
      AND p.es_multiproyecto = false
      AND p.dormitorios = v_prop.dormitorios
      AND COALESCE(p.microzona, p.zona) = v_prop.zona
      AND precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) <= v_prop.precio_usd
      AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

    IF v_stock_bajo_precio <= 10 THEN
        v_razon := format(
            '1 de solo %s deptos %sD bajo $%s en %s',
            v_stock_bajo_precio,
            v_prop.dormitorios,
            to_char(v_prop.precio_usd, 'FM999,999'),
            v_prop.zona
        );
        v_razones := v_razones || jsonb_build_object(
            'tipo', 'escasez',
            'texto', v_razon,
            'valor', v_stock_bajo_precio,
            'impacto', CASE
                WHEN v_stock_bajo_precio <= 3 THEN 'alto'
                WHEN v_stock_bajo_precio <= 7 THEN 'medio'
                ELSE 'bajo'
            END
        );
    END IF;

    IF v_metricas.precio_promedio IS NOT NULL AND v_metricas.precio_promedio > 0 THEN
        v_diff_pct := ROUND(
            ((v_prop.precio_usd - v_metricas.precio_promedio) / v_metricas.precio_promedio * 100)::numeric,
            0
        );

        IF v_diff_pct <= -10 THEN
            v_razon := format(
                '%s%% bajo el promedio de %s ($%s vs $%s)',
                ABS(v_diff_pct),
                v_prop.zona,
                to_char(v_prop.precio_usd, 'FM999,999'),
                to_char(v_metricas.precio_promedio, 'FM999,999')
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'precio_bajo',
                'texto', v_razon,
                'valor', v_diff_pct,
                'impacto', CASE
                    WHEN v_diff_pct <= -20 THEN 'alto'
                    WHEN v_diff_pct <= -15 THEN 'medio'
                    ELSE 'bajo'
                END
            );
        ELSIF v_diff_pct >= 10 THEN
            v_razon := format(
                '%s%% sobre el promedio de zona (premium)',
                v_diff_pct
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'precio_premium',
                'texto', v_razon,
                'valor', v_diff_pct,
                'impacto', 'info'
            );
        END IF;
    END IF;

    IF v_metricas.precio_m2_promedio IS NOT NULL
       AND v_metricas.precio_m2_promedio > 0
       AND v_prop.precio_m2 IS NOT NULL THEN

        v_diff_pct := ROUND(
            ((v_prop.precio_m2 - v_metricas.precio_m2_promedio) / v_metricas.precio_m2_promedio * 100)::numeric,
            0
        );

        IF v_diff_pct <= -10 THEN
            v_razon := format(
                '$/m² %s%% bajo promedio ($%s vs $%s/m²)',
                ABS(v_diff_pct),
                v_prop.precio_m2,
                v_metricas.precio_m2_promedio
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'precio_m2_bajo',
                'texto', v_razon,
                'valor', v_diff_pct,
                'impacto', CASE
                    WHEN v_diff_pct <= -15 THEN 'alto'
                    ELSE 'medio'
                END
            );
        END IF;
    END IF;

    IF v_prop.id_proyecto_master IS NOT NULL THEN
        SELECT COUNT(*) INTO v_total_proyecto
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master = v_prop.id_proyecto_master
          AND p.es_activa = true
          AND p.es_multiproyecto = false
          AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

        SELECT COUNT(*) + 1 INTO v_posicion_precio
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master = v_prop.id_proyecto_master
          AND p.es_activa = true
          AND p.es_multiproyecto = false
          AND precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) < v_prop.precio_usd
          AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

        IF v_posicion_precio = 1 AND v_total_proyecto >= 3 THEN
            v_razon := format(
                'El más económico de %s unidades en %s',
                v_total_proyecto,
                v_prop.proyecto_nombre
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'mejor_precio_proyecto',
                'texto', v_razon,
                'valor', v_total_proyecto,
                'impacto', 'alto'
            );
        ELSIF v_posicion_precio <= 3 AND v_total_proyecto >= 5 THEN
            v_razon := format(
                'Top %s en precio de %s unidades en %s',
                v_posicion_precio,
                v_total_proyecto,
                v_prop.proyecto_nombre
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'top_precio_proyecto',
                'texto', v_razon,
                'valor', v_posicion_precio,
                'impacto', 'medio'
            );
        END IF;
    END IF;

    SELECT COUNT(*) INTO v_stock_mismo_tipo
    FROM propiedades_v2 p
    WHERE p.es_activa = true
      AND p.tipo_operacion = 'venta'
      AND p.status = 'completado'
      AND p.es_multiproyecto = false
      AND p.dormitorios = v_prop.dormitorios
      AND COALESCE(p.microzona, p.zona) = v_prop.zona
      AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

    IF v_stock_mismo_tipo = 1 THEN
        v_razon := format(
            'Único %sD disponible en %s',
            v_prop.dormitorios,
            v_prop.zona
        );
        v_razones := v_razones || jsonb_build_object(
            'tipo', 'unico',
            'texto', v_razon,
            'valor', 1,
            'impacto', 'alto'
        );
    ELSIF v_stock_mismo_tipo <= 5 THEN
        v_razon := format(
            'Solo %s opciones %sD en %s',
            v_stock_mismo_tipo,
            v_prop.dormitorios,
            v_prop.zona
        );
        v_razones := v_razones || jsonb_build_object(
            'tipo', 'escasez_tipologia',
            'texto', v_razon,
            'valor', v_stock_mismo_tipo,
            'impacto', 'medio'
        );
    END IF;

    IF v_prop.desarrollador IS NOT NULL AND v_prop.desarrollador != '' THEN
        IF v_prop.desarrollador IN ('Sky Properties', 'Port-Delux S.R.L.', 'Smart Studio', 'Elite Desarrollos') THEN
            v_razon := format(
                'Desarrollador reconocido: %s',
                v_prop.desarrollador
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'desarrollador',
                'texto', v_razon,
                'valor', v_prop.desarrollador,
                'impacto', 'info'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'propiedad_id', p_propiedad_id,
        'contexto', jsonb_build_object(
            'dormitorios', v_prop.dormitorios,
            'zona', v_prop.zona,
            'precio_usd', v_prop.precio_usd,
            'precio_m2', v_prop.precio_m2,
            'proyecto', v_prop.proyecto_nombre
        ),
        'metricas_zona', CASE WHEN v_metricas.stock IS NOT NULL THEN
            jsonb_build_object(
                'stock', v_metricas.stock,
                'precio_promedio', v_metricas.precio_promedio,
                'precio_m2_promedio', v_metricas.precio_m2_promedio
            )
        ELSE NULL END,
        'razones', v_razones,
        'razon_principal', CASE
            WHEN jsonb_array_length(v_razones) > 0
            THEN v_razones->0->>'texto'
            ELSE 'Opción disponible en ' || v_prop.zona
        END,
        'total_razones', jsonb_array_length(v_razones)
    );
END;
$function$;


-- ============================================================================
-- 7. explicar_precio()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.explicar_precio(p_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_prop RECORD;
  v_metricas RECORD;
  v_proyecto RECORD;
  v_explicaciones JSONB := '[]'::jsonb;
  v_diff_pct NUMERIC;
  v_posicion_proyecto INTEGER;
  v_total_proyecto INTEGER;
BEGIN
  SELECT
    p.id,
    precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) as precio_usd,
    p.dormitorios,
    p.area_total_m2,
    ROUND((precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
    COALESCE(p.microzona, p.zona, 'Equipetrol') as zona,
    p.id_proyecto_master,
    pm.nombre_oficial as proyecto,
    pm.desarrollador,
    p.datos_json->'proyecto'->>'estado_construccion' as estado_construccion
  INTO v_prop
  FROM propiedades_v2 p
  LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.id = p_id;

  IF v_prop.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Propiedad no encontrada');
  END IF;

  SELECT * INTO v_metricas
  FROM v_metricas_mercado
  WHERE dormitorios = v_prop.dormitorios
    AND zona = v_prop.zona;

  IF v_metricas.precio_promedio IS NOT NULL AND v_metricas.precio_promedio > 0 THEN
    v_diff_pct := ROUND(
      ((v_prop.precio_usd - v_metricas.precio_promedio) / v_metricas.precio_promedio * 100)::numeric, 0
    );

    IF v_diff_pct <= -20 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'precio_muy_bajo',
        'texto', format('%s%% bajo promedio - investigar por qué', ABS(v_diff_pct)),
        'impacto', 'positivo_con_alerta'
      );
    ELSIF v_diff_pct <= -10 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'precio_bajo',
        'texto', format('%s%% bajo promedio de zona', ABS(v_diff_pct)),
        'impacto', 'positivo'
      );
    ELSIF v_diff_pct >= 15 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'precio_premium',
        'texto', format('%s%% sobre promedio - ubicación/amenities premium', v_diff_pct),
        'impacto', 'neutro'
      );
    END IF;
  END IF;

  IF v_prop.id_proyecto_master IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_proyecto
    FROM propiedades_v2
    WHERE id_proyecto_master = v_prop.id_proyecto_master
      AND es_activa = true AND es_multiproyecto = false;

    SELECT COUNT(*) + 1 INTO v_posicion_proyecto
    FROM propiedades_v2
    WHERE id_proyecto_master = v_prop.id_proyecto_master
      AND es_activa = true AND es_multiproyecto = false
      AND precio_normalizado(precio_usd, tipo_cambio_detectado) < v_prop.precio_usd;

    IF v_posicion_proyecto = 1 AND v_total_proyecto >= 3 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'mas_barato_proyecto',
        'texto', format('La más económica de %s unidades en %s', v_total_proyecto, v_prop.proyecto),
        'impacto', 'positivo'
      );
    ELSIF v_posicion_proyecto = v_total_proyecto AND v_total_proyecto >= 3 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'mas_caro_proyecto',
        'texto', format('La más cara de %s unidades (mejor ubicación/piso?)', v_total_proyecto),
        'impacto', 'neutro'
      );
    END IF;
  END IF;

  IF v_prop.estado_construccion = 'preventa' THEN
    v_explicaciones := v_explicaciones || jsonb_build_object(
      'factor', 'preventa',
      'texto', 'Precio de preventa (entrega futura)',
      'impacto', 'neutro_con_nota'
    );
  END IF;

  IF v_prop.desarrollador IS NULL OR v_prop.desarrollador = '' THEN
    v_explicaciones := v_explicaciones || jsonb_build_object(
      'factor', 'desarrollador_desconocido',
      'texto', 'Desarrollador no identificado',
      'impacto', 'negativo_leve'
    );
  ELSIF v_prop.desarrollador IN ('Sky Properties', 'Port-Delux S.R.L.', 'Smart Studio') THEN
    v_explicaciones := v_explicaciones || jsonb_build_object(
      'factor', 'desarrollador_reconocido',
      'texto', format('Desarrollador reconocido: %s', v_prop.desarrollador),
      'impacto', 'positivo'
    );
  END IF;

  IF v_metricas.area_promedio IS NOT NULL THEN
    IF v_prop.area_total_m2 < v_metricas.area_promedio * 0.8 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'area_menor',
        'texto', format('Área %s%% menor al promedio (%sm² vs %sm²)',
          ROUND((1 - v_prop.area_total_m2/v_metricas.area_promedio) * 100),
          v_prop.area_total_m2,
          v_metricas.area_promedio),
        'impacto', 'explica_precio_bajo'
      );
    ELSIF v_prop.area_total_m2 > v_metricas.area_promedio * 1.2 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'area_mayor',
        'texto', format('Área %s%% mayor al promedio',
          ROUND((v_prop.area_total_m2/v_metricas.area_promedio - 1) * 100)),
        'impacto', 'explica_precio_alto'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'propiedad_id', p_id,
    'precio_usd', v_prop.precio_usd,
    'precio_m2', v_prop.precio_m2,
    'zona', v_prop.zona,
    'promedio_zona', v_metricas.precio_promedio,
    'diferencia_pct', v_diff_pct,
    'explicaciones', v_explicaciones,
    'resumen', CASE
      WHEN jsonb_array_length(v_explicaciones) > 0
      THEN v_explicaciones->0->>'texto'
      ELSE 'Precio en rango normal de mercado'
    END
  );
END;
$function$;


-- ============================================================================
-- 8. analisis_mercado_fiduciario() — usa buscar_unidades_reales() que ya normaliza
--    Solo necesita normalizar la sección de "excluidas" y alertas
-- ============================================================================

CREATE OR REPLACE FUNCTION public.analisis_mercado_fiduciario(p_filtros jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_resultado JSONB;
  v_opciones_validas JSONB := '[]'::jsonb;
  v_opciones_excluidas JSONB := '[]'::jsonb;
  v_alertas JSONB := '[]'::jsonb;
  v_contexto JSONB;
  v_metricas RECORD;
  v_prop RECORD;
  v_ranking INTEGER := 0;
  v_total_validas INTEGER := 0;
  v_total_excluidas INTEGER := 0;
  v_stock_total INTEGER;
  v_precio_max NUMERIC;
  v_dormitorios INTEGER;
  v_zona TEXT;
BEGIN
  v_precio_max := (p_filtros->>'precio_max')::numeric;
  v_dormitorios := (p_filtros->>'dormitorios')::int;
  v_zona := p_filtros->>'zona';

  FOR v_prop IN
    SELECT
      r.*,
      ROW_NUMBER() OVER (ORDER BY r.precio_usd ASC) as ranking,
      COUNT(*) OVER () as total
    FROM buscar_unidades_reales(p_filtros) r
    ORDER BY r.precio_usd ASC
  LOOP
    v_ranking := v_prop.ranking;
    v_total_validas := v_prop.total;

    v_opciones_validas := v_opciones_validas || jsonb_build_object(
      'id', v_prop.id,
      'proyecto', v_prop.proyecto,
      'desarrollador', v_prop.desarrollador,
      'zona', v_prop.zona,
      'dormitorios', v_prop.dormitorios,
      'precio_usd', v_prop.precio_usd,
      'precio_m2', v_prop.precio_m2,
      'area_m2', v_prop.area_m2,
      'ranking', v_prop.ranking,
      'total_opciones', v_prop.total,
      'posicion_mercado', calcular_posicion_mercado(v_prop.precio_usd, v_prop.zona, v_prop.dormitorios),
      'explicacion_precio', explicar_precio(v_prop.id),
      'razon_fiduciaria', v_prop.razon_fiduciaria,
      'fotos', v_prop.cantidad_fotos,
      'asesor_wsp', v_prop.asesor_wsp
    );
  END LOOP;

  FOR v_prop IN
    SELECT
      p.id,
      precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) as precio_usd,
      p.dormitorios,
      p.area_total_m2,
      COALESCE(pm.nombre_oficial, 'Sin proyecto') as proyecto,
      COALESCE(p.microzona, p.zona, 'Sin zona') as zona
    FROM propiedades_v2 p
    LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
    WHERE p.es_activa = true
      AND precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) < COALESCE(v_precio_max, 999999999)
      AND p.precio_usd >= 30000
      AND p.id NOT IN (SELECT id FROM buscar_unidades_reales(p_filtros))
    ORDER BY precio_normalizado(p.precio_usd, p.tipo_cambio_detectado) ASC
    LIMIT 10
  LOOP
    v_total_excluidas := v_total_excluidas + 1;

    v_opciones_excluidas := v_opciones_excluidas || jsonb_build_object(
      'id', v_prop.id,
      'proyecto', v_prop.proyecto,
      'zona', v_prop.zona,
      'precio_usd', v_prop.precio_usd,
      'dormitorios', v_prop.dormitorios,
      'area_m2', v_prop.area_total_m2,
      'analisis_exclusion', detectar_razon_exclusion_v2(v_prop.id, p_filtros)
    );
  END LOOP;

  SELECT * INTO v_metricas
  FROM v_metricas_mercado
  WHERE (v_dormitorios IS NULL OR dormitorios = v_dormitorios)
    AND (v_zona IS NULL OR zona ILIKE '%' || v_zona || '%')
  LIMIT 1;

  SELECT COUNT(*) INTO v_stock_total
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.es_activa = true
    AND p.status = 'completado'
    AND p.tipo_operacion = 'venta'
    AND p.es_multiproyecto = false
    AND (v_dormitorios IS NULL OR p.dormitorios = v_dormitorios)
    AND (v_zona IS NULL OR pm.zona ILIKE '%' || v_zona || '%');

  v_contexto := jsonb_build_object(
    'stock_total', v_stock_total,
    'stock_cumple_filtros', v_total_validas,
    'stock_excluido_mas_barato', v_total_excluidas,
    'porcentaje_mercado', CASE
      WHEN v_stock_total > 0
      THEN ROUND(100.0 * v_total_validas / v_stock_total, 1)
      ELSE 0
    END,
    'metricas_zona', CASE WHEN v_metricas.stock IS NOT NULL THEN
      jsonb_build_object(
        'precio_promedio', v_metricas.precio_promedio,
        'precio_mediana', v_metricas.precio_mediana,
        'precio_min', v_metricas.precio_min,
        'precio_max', v_metricas.precio_max,
        'precio_m2_promedio', v_metricas.precio_m2,
        'area_promedio', v_metricas.area_promedio,
        'dias_promedio', v_metricas.dias_promedio,
        'dias_mediana', v_metricas.dias_mediana
      )
    ELSE NULL END,
    'diagnostico', CASE
      WHEN v_total_validas = 0 THEN
        'Sin opciones que cumplan todos tus filtros. Considerá flexibilizar.'
      WHEN v_total_validas <= 3 THEN
        format('Stock LIMITADO: solo %s opciones. Son el 100%% de lo disponible.', v_total_validas)
      WHEN v_total_validas <= 10 THEN
        format('Stock MODERADO: %s opciones disponibles.', v_total_validas)
      ELSE
        format('Stock AMPLIO: %s opciones. Podés ser selectivo.', v_total_validas)
    END
  );

  FOR v_prop IN
    SELECT id, precio_normalizado(precio_usd, tipo_cambio_detectado) as precio_usd_norm, area_total_m2,
           ROUND(precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)) as precio_m2
    FROM propiedades_v2
    WHERE es_activa = true
      AND precio_normalizado(precio_usd, tipo_cambio_detectado) BETWEEN 30000 AND COALESCE(v_precio_max, 999999999)
      AND area_total_m2 > 20
      AND (precio_normalizado(precio_usd, tipo_cambio_detectado) / NULLIF(area_total_m2, 0)) < 800
    LIMIT 5
  LOOP
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'precio_sospechoso',
      'propiedad_id', v_prop.id,
      'precio_usd', v_prop.precio_usd_norm,
      'precio_m2', v_prop.precio_m2,
      'mensaje', format('Precio/m² muy bajo ($%s). Verificar antes de visitar.', v_prop.precio_m2),
      'severidad', 'warning'
    );
  END LOOP;

  IF v_total_validas <= 2 AND v_stock_total >= 10 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'escasez_relativa',
      'mensaje', format('Solo %s de %s propiedades cumplen tus filtros (%s%%). Considerá flexibilizar.',
        v_total_validas, v_stock_total,
        ROUND(100.0 * v_total_validas / v_stock_total, 0)),
      'severidad', 'info'
    );
  END IF;

  RETURN jsonb_build_object(
    'filtros_aplicados', p_filtros,
    'timestamp', NOW(),
    'bloque_1_opciones_validas', jsonb_build_object(
      'total', v_total_validas,
      'opciones', v_opciones_validas
    ),
    'bloque_2_opciones_excluidas', jsonb_build_object(
      'total', v_total_excluidas,
      'nota', 'Propiedades más baratas que no cumplen algún filtro',
      'opciones', v_opciones_excluidas
    ),
    'bloque_3_contexto_mercado', v_contexto,
    'bloque_4_alertas', jsonb_build_object(
      'total', jsonb_array_length(v_alertas),
      'alertas', v_alertas
    )
  );
END;
$function$;


-- ============================================================================
-- 9. recalcular_precio_propiedad() — FIX fórmula
-- ============================================================================

CREATE OR REPLACE FUNCTION public.recalcular_precio_propiedad(p_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_prop RECORD;
    v_tc_actual NUMERIC(10,4);
    v_precio_nuevo_usd NUMERIC(14,2);
    v_precio_anterior_usd NUMERIC(14,2);
    v_candados JSONB;
BEGIN
    SELECT * INTO v_prop FROM propiedades_v2 WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada',
            'id', p_id
        );
    END IF;

    IF NOT COALESCE(v_prop.depende_de_tc, FALSE) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no depende de tipo de cambio',
            'property_id', v_prop.codigo_propiedad,
            'moneda_original', v_prop.moneda_original,
            'depende_de_tc', v_prop.depende_de_tc
        );
    END IF;

    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::JSONB);
    IF COALESCE((v_candados->>'precio_usd_actualizado')::boolean, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Campo precio_usd_actualizado está bloqueado',
            'property_id', v_prop.codigo_propiedad,
            'bloqueado_por', 'campos_bloqueados'
        );
    END IF;

    -- Obtener TC paralelo actual
    IF v_prop.tipo_cambio_detectado = 'paralelo' THEN
        SELECT valor INTO v_tc_actual
        FROM config_global
        WHERE clave = 'tipo_cambio_paralelo'
          AND COALESCE(activo, true) = true;
    ELSE
        SELECT valor INTO v_tc_actual
        FROM config_global
        WHERE clave = 'tipo_cambio_oficial'
          AND COALESCE(activo, true) = true;
    END IF;

    IF v_tc_actual IS NULL OR v_tc_actual <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de cambio no válido en config_global',
            'tipo_cambio_detectado', v_prop.tipo_cambio_detectado
        );
    END IF;

    -- FIX v168: Fórmula correcta de normalización
    -- Paralelo: precio_usd × tc_paralelo_actual / 6.96
    -- Oficial: precio_usd sin cambio (6.96 / 6.96 = 1)
    IF v_prop.tipo_cambio_detectado = 'paralelo' THEN
        v_precio_nuevo_usd := ROUND(v_prop.precio_usd * v_tc_actual / 6.96, 2);
    ELSE
        v_precio_nuevo_usd := v_prop.precio_usd;
    END IF;

    v_precio_anterior_usd := v_prop.precio_usd_actualizado;

    UPDATE propiedades_v2 SET
        precio_usd_actualizado = v_precio_nuevo_usd,
        requiere_actualizacion_precio = FALSE,
        fecha_ultima_actualizacion_precio = NOW(),
        fecha_actualizacion = NOW()
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'success', true,
        'operation', 'recalcular_precio',
        'version', '2.0.0',
        'property_id', v_prop.codigo_propiedad,
        'internal_id', p_id,
        'tipo_cambio_detectado', v_prop.tipo_cambio_detectado,
        'tc_actual', v_tc_actual,
        'precio_usd_original', v_prop.precio_usd,
        'precio_anterior_actualizado', v_precio_anterior_usd,
        'precio_nuevo_actualizado', v_precio_nuevo_usd,
        'diferencia_usd', v_precio_nuevo_usd - COALESCE(v_precio_anterior_usd, v_prop.precio_usd),
        'formula', CASE
            WHEN v_prop.tipo_cambio_detectado = 'paralelo'
            THEN format('%s × %s / 6.96 = %s', v_prop.precio_usd, v_tc_actual, v_precio_nuevo_usd)
            ELSE 'sin cambio (TC oficial)'
        END,
        'timestamp', NOW()
    );
END;
$function$;
