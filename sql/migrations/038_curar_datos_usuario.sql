-- =====================================================
-- MIGRACION 038: Curar datos para usuario final
-- Fecha: 11 Enero 2026
-- Problemas:
--   1. "Sin zona" aparece al usuario (dato interno)
--   2. Alertas de precio bajo incluyen excluidas
--   3. Razones de exclusión muestran errores internos
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- =====================================================
-- PASO 1: Actualizar buscar_unidades_reales()
-- Cambiar "Sin zona" por "Por confirmar"
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
  es_precio_outlier BOOLEAN
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
  )
  SELECT
    p.id,
    pm.nombre_oficial::TEXT,
    pm.desarrollador::TEXT,
    -- v2.6: "Sin zona" → "Por confirmar" para usuario
    CASE
      WHEN pm.zona = 'Sin zona' OR pm.zona IS NULL
      THEN 'Por confirmar'::TEXT
      ELSE pm.zona::TEXT
    END,
    p.microzona::TEXT,
    p.dormitorios,
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
    END as es_precio_outlier

  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  LEFT JOIN proyecto_stats ps ON p.id_proyecto_master = ps.id_proyecto_master
  LEFT JOIN zona_stats zs ON pm.zona = zs.zona

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
'v2.6: Curación de datos para usuario final.
- "Sin zona" → "Por confirmar"
- Filtro outliers 55%
Filtros: tipo_operacion, dormitorios, precio, area, zona, microzona, proyecto,
desarrollador, solo_con_telefono, solo_con_fotos, score_min, estado_entrega, incluir_outliers';

-- =====================================================
-- PASO 2: Actualizar analisis_mercado_fiduciario()
-- - Alertas solo para propiedades en TOP resultados
-- - Excluir razones internas de la lista de excluidas
-- =====================================================

DROP FUNCTION IF EXISTS analisis_mercado_fiduciario(JSONB);

CREATE OR REPLACE FUNCTION analisis_mercado_fiduciario(p_filtros JSONB)
RETURNS JSONB AS $func$
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
  v_top3_ids INTEGER[] := ARRAY[]::INTEGER[];
BEGIN
  v_precio_max := (p_filtros->>'precio_max')::numeric;
  v_dormitorios := (p_filtros->>'dormitorios')::int;
  v_zona := p_filtros->>'zona';

  -- ==========================================
  -- BLOQUE 1: OPCIONES VÁLIDAS CON RANKING
  -- ==========================================

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

    -- Guardar IDs de TOP 3 para alertas
    IF v_prop.ranking <= 3 THEN
      v_top3_ids := array_append(v_top3_ids, v_prop.id);
    END IF;

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

  -- ==========================================
  -- BLOQUE 2: OPCIONES EXCLUIDAS
  -- v2.6: Solo mostrar excluidas por razones FIDUCIARIAS
  --       NO mostrar errores internos (sin proyecto, multiproyecto)
  -- ==========================================

  FOR v_prop IN
    SELECT
      p.id,
      p.precio_usd,
      p.dormitorios,
      p.area_total_m2,
      COALESCE(pm.nombre_oficial, 'Proyecto pendiente') as proyecto,
      CASE
        WHEN pm.zona = 'Sin zona' OR pm.zona IS NULL
        THEN 'Por confirmar'
        ELSE COALESCE(pm.zona, 'Por confirmar')
      END as zona,
      p.id_proyecto_master,
      p.es_multiproyecto,
      p.tipo_operacion,
      p.status,
      CASE
        WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
        THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
        ELSE false
      END as tiene_fotos,
      ROUND((p.precio_usd / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2
    FROM propiedades_v2 p
    LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
    WHERE p.es_activa = true
      AND p.precio_usd < COALESCE(v_precio_max, 999999999)
      AND p.precio_usd >= 30000
      AND p.id NOT IN (SELECT id FROM buscar_unidades_reales(p_filtros))
      -- v2.6: SOLO incluir excluidas con razones fiduciarias válidas
      -- Excluir: sin proyecto, multiproyecto (errores internos)
      AND p.id_proyecto_master IS NOT NULL
      AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
      -- Solo excluidas por filtros del usuario o calidad
      AND p.status = 'completado'
      AND p.tipo_operacion = 'venta'
    ORDER BY p.precio_usd ASC
    LIMIT 10
  LOOP
    v_total_excluidas := v_total_excluidas + 1;

    -- Generar razón fiduciaria curada (no técnica)
    v_opciones_excluidas := v_opciones_excluidas || jsonb_build_object(
      'id', v_prop.id,
      'proyecto', v_prop.proyecto,
      'zona', v_prop.zona,
      'precio_usd', v_prop.precio_usd,
      'dormitorios', v_prop.dormitorios,
      'area_m2', v_prop.area_total_m2,
      'analisis_exclusion', jsonb_build_object(
        'propiedad_id', v_prop.id,
        'es_excluida', true,
        'razon_principal', CASE
          -- Razones fiduciarias válidas para mostrar al usuario
          WHEN NOT v_prop.tiene_fotos AND (p_filtros->>'solo_con_fotos')::boolean IS TRUE
            THEN 'Sin fotos disponibles'
          WHEN v_dormitorios IS NOT NULL AND v_prop.dormitorios != v_dormitorios
            THEN format('%s dormitorios (buscás %s)', v_prop.dormitorios, v_dormitorios)
          WHEN v_prop.precio_m2 < 800
            THEN format('Precio/m² muy bajo ($%s) - verificar', v_prop.precio_m2)
          WHEN v_prop.area_total_m2 < 20
            THEN 'Área muy pequeña'
          ELSE 'No cumple filtros seleccionados'
        END
      )
    );
  END LOOP;

  -- ==========================================
  -- BLOQUE 3: CONTEXTO DE MERCADO
  -- ==========================================

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
        'area_promedio', v_metricas.area_promedio
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

  -- ==========================================
  -- BLOQUE 4: ALERTAS FIDUCIARIAS
  -- v2.6: SOLO alertas para propiedades en TOP 3
  --       NO mostrar alertas de excluidas
  -- ==========================================

  -- Alertas de precios sospechosos SOLO en TOP 3
  FOR v_prop IN
    SELECT id, precio_usd, area_total_m2,
           ROUND(precio_usd / NULLIF(area_total_m2, 0)) as precio_m2
    FROM propiedades_v2
    WHERE id = ANY(v_top3_ids)
      AND area_total_m2 > 20
      AND (precio_usd / NULLIF(area_total_m2, 0)) < 1000
  LOOP
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'precio_bajo_top3',
      'propiedad_id', v_prop.id,
      'precio_usd', v_prop.precio_usd,
      'precio_m2', v_prop.precio_m2,
      'mensaje', format('TOP %s tiene precio/m² bajo ($%s). Verificar antes de visitar.',
        array_position(v_top3_ids, v_prop.id), v_prop.precio_m2),
      'severidad', 'info'
    );
  END LOOP;

  -- Alerta si hay mucha escasez
  IF v_total_validas <= 2 AND v_stock_total >= 10 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'escasez_relativa',
      'mensaje', format('Solo %s de %s propiedades cumplen tus filtros (%s%%). Considerá flexibilizar.',
        v_total_validas, v_stock_total,
        ROUND(100.0 * v_total_validas / v_stock_total, 0)),
      'severidad', 'info'
    );
  END IF;

  -- ==========================================
  -- RESULTADO FINAL
  -- ==========================================

  RETURN jsonb_build_object(
    'filtros_aplicados', p_filtros,
    'timestamp', NOW(),
    'bloque_1_opciones_validas', jsonb_build_object(
      'total', v_total_validas,
      'opciones', v_opciones_validas
    ),
    'bloque_2_opciones_excluidas', jsonb_build_object(
      'total', v_total_excluidas,
      'nota', 'Propiedades más baratas que no cumplen tus filtros',
      'opciones', v_opciones_excluidas
    ),
    'bloque_3_contexto_mercado', v_contexto,
    'bloque_4_alertas', jsonb_build_object(
      'total', jsonb_array_length(v_alertas),
      'alertas', v_alertas
    )
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION analisis_mercado_fiduciario IS
'v2.6: Curación fiduciaria para usuario final.
- Alertas SOLO para TOP 3, no excluidas
- Excluidas solo con razones fiduciarias (no errores internos)
- "Sin zona" → "Por confirmar"
Bloque 1: Opciones válidas con ranking, posición mercado, explicación precio
Bloque 2: Opciones excluidas con razón fiduciaria curada
Bloque 3: Contexto de mercado
Bloque 4: Alertas fiduciarias solo TOP 3';

-- =====================================================
-- TEST: Verificar curación
-- =====================================================

SELECT 'TEST: Verificar que "Sin zona" no aparece' as info;

SELECT zona, COUNT(*) as total
FROM buscar_unidades_reales('{"limite": 500}'::jsonb)
GROUP BY zona
ORDER BY total DESC;

SELECT 'TEST: Verificar alertas solo de TOP 3' as info;

SELECT jsonb_array_length(
  (analisis_mercado_fiduciario('{"limite": 10}'::jsonb))->'bloque_4_alertas'->'alertas'
) as total_alertas;

SELECT 'Migración 038 completada - Datos curados para usuario' as status;
