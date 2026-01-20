-- =====================================================
-- MIGRACION 069: Expandir equipamiento_detectado a 69 items
-- Fecha: 20 Enero 2026
-- Propósito: Detección en tiempo real de TODOS los amenities/equipamiento
-- =====================================================
-- SEGURIDAD: Solo modifica el subquery de equipamiento_detectado
-- No toca: CTEs, WHERE, ORDER BY, LIMIT, ni otras columnas
-- =====================================================
-- Basado en migración 064 (69 campos: 45 equipamiento + 24 amenities)
-- =====================================================

DROP FUNCTION IF EXISTS buscar_unidades_reales(jsonb);

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
  posicion_mercado JSONB,
  latitud NUMERIC,
  longitud NUMERIC,
  estacionamientos INTEGER,
  baulera BOOLEAN
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
      AND pv.duplicado_de IS NULL
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
      AND pv.duplicado_de IS NULL
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
      AND pv.duplicado_de IS NULL
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
      AND pv.duplicado_de IS NULL
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
      AND otras.duplicado_de IS NULL
      AND lower(COALESCE(otras.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND otras.precio_usd < p.precio_usd)::INTEGER as posicion_en_tipologia,

    ts.precio_min_tipologia as precio_min_tipologia,
    ts.precio_max_tipologia as precio_max_tipologia,

    CASE
      WHEN jsonb_typeof(p.datos_json->'amenities'->'estado_amenities') = 'object'
      THEN (SELECT ARRAY_AGG(key ORDER BY key)
            FROM jsonb_each(p.datos_json->'amenities'->'estado_amenities') AS x(key, val)
            WHERE val->>'valor' = 'true'
              AND val->>'confianza' IN ('alta', 'media'))
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

    -- =====================================================
    -- v2.24: EQUIPAMIENTO DETECTADO EXPANDIDO (69 items)
    -- Detección en tiempo real desde descripción
    -- Basado en migración 064
    -- =====================================================
    (SELECT ARRAY_AGG(item ORDER BY item)
    FROM (
      -- =============== EQUIPAMIENTO COCINA ===============
      SELECT 'Encimera' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%encimera%'

      UNION
      SELECT 'Heladera' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%heladera%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%refrigerador%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%nevera%'

      UNION
      SELECT 'Muebles cocina' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%muebles de cocina%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%muebles cocina%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%mobiliario cocina%'

      UNION
      SELECT 'Campana extractora' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%campana%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%extractor%'

      UNION
      SELECT 'Horno empotrado' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%horno empotrado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%horno electrico%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%horno eléctrico%'

      UNION
      SELECT 'Microondas' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%microondas%'

      UNION
      SELECT 'Cocina equipada' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina equipada%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina americana%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina completa%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cocina integral%'

      UNION
      SELECT 'Grifería' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%griferia%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%grifería%'

      UNION
      SELECT 'Mesada piedra natural' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%granito%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%marmol%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%mármol%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%mesada de piedra%'

      UNION
      SELECT 'Lavavajillas' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%lavavajilla%'

      -- =============== EQUIPAMIENTO DORMITORIO ===============
      UNION
      SELECT 'Closets' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%closet%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%clóset%'

      UNION
      SELECT 'Vestidor' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%vestidor%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%walking closet%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%walk in closet%'

      UNION
      SELECT 'Roperos empotrados' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%ropero empotrado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%roperos empotrados%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%roperos de techo%'

      UNION
      SELECT 'Cortinas' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%cortinas%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%persianas%'

      UNION
      SELECT 'Blackout' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%blackout%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%black out%'

      -- =============== EQUIPAMIENTO BAÑO ===============
      UNION
      SELECT 'Box ducha' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%box%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cabina ducha%'

      UNION
      SELECT 'Tina/Bañera' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%tina%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%bañera%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%banera%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%jacuzzi%'

      UNION
      SELECT 'Muebles de baño' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%vanity%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%vanitorio%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%tocador%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%mueble de baño%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%mueble baño%'

      UNION
      SELECT 'Espejo' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%espejo%'

      UNION
      SELECT 'Ducha española' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%ducha española%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%ducha espanola%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%ducha multiple%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%ducha múltiple%'

      -- =============== EQUIPAMIENTO LAVANDERÍA ===============
      UNION
      SELECT 'Área de lavado' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%area de lavado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%área de lavado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%lavanderia%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%lavandería%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cuarto de lavado%'

      UNION
      SELECT 'Lavadora' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%lavadora%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%lavarropas%'

      UNION
      SELECT 'Secadora' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%secadora%'

      UNION
      SELECT 'Tendedero' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%tendedero%'

      -- =============== EQUIPAMIENTO AGUA CALIENTE ===============
      UNION
      SELECT 'Termotanque' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%termotanque%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%termo tanque%'

      UNION
      SELECT 'Calefón' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%calefon%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%calefón%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%calentador%'

      -- =============== EQUIPAMIENTO TECNOLOGÍA ===============
      UNION
      SELECT 'Aire acondicionado' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%aire acondicionado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%a/c%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%split%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%climatizacion%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%climatización%'

      UNION
      SELECT 'Iluminación LED' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%led%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%iluminacion%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%iluminación%'

      UNION
      SELECT 'Cerradura inteligente' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%cerradura inteligente%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cerradura digital%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cerradura electronica%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cerradura electrónica%'

      UNION
      SELECT 'Internet/WiFi' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%wifi%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%wi-fi%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%internet%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%fibra optica%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%fibra óptica%'

      UNION
      SELECT 'Intercomunicador' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%intercomunicador%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%citofono%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%citófono%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%videoportero%'

      UNION
      SELECT 'Domótica' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%domotica%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%domótica%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%smart home%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%casa inteligente%'

      UNION
      SELECT 'Alarma de seguridad' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%alarma%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%sistema de seguridad%'

      -- =============== EQUIPAMIENTO SERVICIOS ===============
      UNION
      SELECT 'Gas domiciliario' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%gas domiciliario%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%gas natural%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%gas centralizado%'

      UNION
      SELECT 'Balcón' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%balcon%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%balcón%'

      UNION
      SELECT 'Terraza privada' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%terraza privada%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%terraza propia%'

      UNION
      SELECT 'Vista panorámica' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%vista panoramica%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%vista panorámica%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%vista a la ciudad%'

      UNION
      SELECT 'Amoblado' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%amoblado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%amueblado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%totalmente equipado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%completamente equipado%'

      -- =============== EQUIPAMIENTO ACABADOS ===============
      UNION
      SELECT 'Acabados premium' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%acabados de lujo%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%acabados premium%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%acabados de primera%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%finos acabados%'

      UNION
      SELECT 'Piso porcelanato' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%porcelanato%'

      UNION
      SELECT 'Vidrio doble' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%doble vidrio%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%vidrio doble%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%termopanel%'

      UNION
      SELECT 'Aislamiento acústico' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%aislamiento acustico%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%aislamiento acústico%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%insonorizado%'

      UNION
      SELECT 'Construcción antisísmica' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%antisism%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%sismo resist%'

      -- =============== AMENITIES EDIFICIO ===============
      UNION
      SELECT 'Piscina' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%piscina%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%alberca%'

      UNION
      SELECT 'Piscina infinita' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%piscina infinita%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%infinity pool%'

      UNION
      SELECT 'Gimnasio' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%gimnasio%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%gym%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%fitness%'

      UNION
      SELECT 'Cowork' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%cowork%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%co-work%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%sala de trabajo%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%business center%'

      UNION
      SELECT 'Sala TV/Cine' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%sala de cine%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cine%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%home theater%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%sala tv%'

      UNION
      SELECT 'Jacuzzi' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%jacuzzi%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%hidromasaje%'

      UNION
      SELECT 'Sauna' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%sauna%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%spa%'

      UNION
      SELECT 'Seguridad 24h' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%seguridad 24%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%vigilancia 24%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%guardia 24%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%porteria 24%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%portería 24%'

      UNION
      SELECT 'Cámaras seguridad' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%camara%seguridad%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cámara%seguridad%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%circuito cerrado%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%cctv%'

      UNION
      SELECT 'Sala de juegos' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%sala de juegos%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%game room%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%juegos infantiles%'

      UNION
      SELECT 'Billar' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%billar%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%pool%'

      UNION
      SELECT 'Bar/Lounge' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%bar%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%lounge%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%sky bar%'

      UNION
      SELECT 'Churrasquera' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%churrasquera%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%parrilla%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%bbq%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%asador%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%quincho%'

      UNION
      SELECT 'Roof garden' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%roof%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%rooftop%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%terraza comun%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%terraza común%'

      UNION
      SELECT 'Lobby/Recepción' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%lobby%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%recepcion%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%recepción%'

      UNION
      SELECT 'Jardín' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%jardin%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%jardín%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%area verde%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%área verde%'

      UNION
      SELECT 'Parque infantil' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%parque infantil%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%juegos para niños%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%area infantil%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%área infantil%'

      UNION
      SELECT 'Canchas deportivas' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%cancha%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%padel%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%pádel%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%tenis%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%squash%'

      UNION
      SELECT 'Sala yoga' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%yoga%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%pilates%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%meditacion%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%meditación%'

      UNION
      SELECT 'Pet friendly' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%pet friendly%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%mascotas%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%acepta mascotas%'

      UNION
      SELECT 'Ascensor' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%ascensor%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%elevador%'

      UNION
      SELECT 'Salón de eventos' as item
      WHERE (p.datos_json->'contenido'->>'descripcion') ILIKE '%salon de eventos%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%salón de eventos%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%salon social%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%salón social%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%area social%'
         OR (p.datos_json->'contenido'->>'descripcion') ILIKE '%área social%'

    ) items
    )::TEXT[] as equipamiento_detectado,
    -- =====================================================
    -- FIN equipamiento_detectado expandido
    -- =====================================================

    COALESCE(
      p.datos_json_enrichment->>'descripcion',
      p.datos_json_discovery->>'descripcion',
      p.datos_json->'contenido'->>'descripcion'
    )::TEXT as descripcion,

    calcular_posicion_mercado(
      ROUND((p.precio_usd / NULLIF(p.area_total_m2, 0))::numeric, 0),
      pm.zona,
      p.dormitorios
    ) as posicion_mercado,

    p.latitud,
    p.longitud,
    p.estacionamientos::INTEGER,
    p.baulera

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
            ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - ps.avg_precio_m2) / ps.avg_precio_m2) <= 0.55
          WHEN ps.cnt = 1 AND zs.avg_precio_m2_zona > 0 THEN
            ABS((p.precio_usd / NULLIF(p.area_total_m2, 0) - zs.avg_precio_m2_zona) / zs.avg_precio_m2_zona) <= 0.55
          ELSE true
        END
      )
    )
    AND (
      (p_filtros->>'incluir_datos_viejos')::boolean IS TRUE
      OR (
        CASE
          WHEN p.estado_construccion = 'preventa' THEN
            CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) <= 730
          ELSE
            CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) <= 300
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
'v2.24: Expande equipamiento_detectado a 69 items (detección tiempo real).
Incluye: cocina, baño, lavandería, tecnología, acabados, amenities edificio.
Basado en migración 064.';

-- Test
SELECT 'Migracion 069 - Test equipamiento expandido:' as status;
SELECT id, proyecto, array_length(equipamiento_detectado, 1) as num_amenities, equipamiento_detectado
FROM buscar_unidades_reales('{"limite": 5}'::jsonb);
