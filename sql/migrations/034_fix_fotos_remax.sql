-- =====================================================
-- MIGRACION 034: Fix conteo fotos para Remax
-- Fecha: 11 Enero 2026
-- Problema: Remax tiene fotos en default_imagen, no en fotos_urls
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
  estado_construccion TEXT
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

    -- =====================================================
    -- FIX: Fotos como array de TEXT
    -- Prioridad: 1) datos_json normalizado, 2) discovery por fuente
    -- =====================================================
    CASE
      -- Primero: intentar datos_json normalizado
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
           AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'contenido'->'fotos_urls'))

      -- Fallback Remax: default_imagen tiene URL de foto principal
      WHEN p.fuente = 'remax'
           AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
      THEN ARRAY[p.datos_json_discovery->'default_imagen'->>'url']

      -- Fallback C21: fotos->propiedadThumbnail cuando merge no copió
      WHEN p.fuente = 'century21'
           AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
           AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json_discovery->'fotos'->'propiedadThumbnail'))

      -- Sin fotos
      ELSE ARRAY[]::TEXT[]
    END,

    -- =====================================================
    -- FIX: Cantidad de fotos
    -- =====================================================
    CASE
      -- Normalizado
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
           AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
      THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')

      -- Remax: 1 si tiene default_imagen
      WHEN p.fuente = 'remax'
           AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
      THEN 1

      -- C21: fallback a discovery
      WHEN p.fuente = 'century21'
           AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
      THEN jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail')

      -- Sin fotos
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
    COALESCE(p.estado_construccion::TEXT, 'no_especificado')
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
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
    -- Excluir bauleras, parqueos explicitos
    AND lower(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
    -- Excluir areas < 20m2
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
    -- =====================================================
    -- FIX: Filtro solo_con_fotos con soporte ambas fuentes
    -- =====================================================
    AND (
      (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
      OR (
        -- Normalizado: tiene array de fotos
        (jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
         AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0)
        OR
        -- Remax: tiene default_imagen
        (p.fuente = 'remax'
         AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL)
        OR
        -- C21: tiene fotos en discovery
        (p.fuente = 'century21'
         AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
         AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0)
      )
    )
    -- Filtro: score minimo
    AND (
      p_filtros->>'score_min' IS NULL
      OR p.score_calidad_dato >= (p_filtros->>'score_min')::int
    )
    -- Filtro estado_entrega
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
'v2.4: Fix fotos para Remax (default_imagen) y C21 (fotos_urls).
Filtros: tipo_operacion, dormitorios, precio, area, zona, microzona, proyecto, desarrollador,
solo_con_telefono, solo_con_fotos, score_min, estado_entrega';

-- =====================================================
-- TEST: Verificar que todas las propiedades tienen fotos
-- =====================================================

SELECT 'Test: Propiedades sin fotos ANTES vs DESPUES del fix' as test;

SELECT
    COUNT(*) FILTER (WHERE fotos_sin_fix = 0) as sin_fotos_antes,
    COUNT(*) FILTER (WHERE fotos_con_fix = 0) as sin_fotos_despues,
    COUNT(*) FILTER (WHERE fotos_sin_fix = 0 AND fotos_con_fix > 0) as arregladas_por_fix
FROM (
    SELECT
        p.id,
        -- Lógica CON fix
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
        END as fotos_con_fix,
        -- Lógica SIN fix (original)
        CASE
          WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
          THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')
          ELSE 0
        END as fotos_sin_fix
    FROM propiedades_v2 p
    WHERE p.status = 'completado'
) sub;

SELECT 'Migracion 034 completada - Bug fotos corregido' as status;
