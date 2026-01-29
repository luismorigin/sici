-- ============================================================================
-- MIGRACIÓN 087: Fotos Proyecto + Amenidades Opcionales
-- ============================================================================
-- Fecha: 2026-01-29
-- Propósito:
--   1. Agregar columna fotos_proyecto a proyectos_master
--   2. Actualizar inferir_datos_proyecto() para incluir amenidades <50%
-- ============================================================================

-- 1. Agregar columna fotos_proyecto
ALTER TABLE proyectos_master
ADD COLUMN IF NOT EXISTS fotos_proyecto JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN proyectos_master.fotos_proyecto IS
  'Array de fotos del proyecto: [{"url": "https://...", "orden": 1}, ...]';

-- 2. Actualizar función inferir_datos_proyecto con amenidades opcionales
CREATE OR REPLACE FUNCTION inferir_datos_proyecto(p_id_proyecto INTEGER)
RETURNS JSON AS $$
DECLARE
  v_resultado JSON;
  v_total_propiedades INTEGER;
  v_amenidades_frecuentes JSONB;
  v_amenidades_opcionales JSONB;
  v_estado_mas_comun TEXT;
  v_estado_porcentaje NUMERIC;
  v_piso_max INTEGER;
  v_fotos JSONB;
  v_frecuencia_amenidades JSONB;
BEGIN
  -- Contar propiedades del proyecto (solo departamentos >= 20m²)
  SELECT COUNT(*) INTO v_total_propiedades
  FROM propiedades_v2
  WHERE id_proyecto_master = p_id_proyecto
    AND status = 'completado'
    AND area_total_m2 >= 20;

  IF v_total_propiedades = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No hay propiedades vinculadas a este proyecto',
      'total_propiedades', 0
    );
  END IF;

  -- 1. Calcular frecuencia de amenidades (todas)
  WITH props_con_amenities AS (
    SELECT id, datos_json->'amenities'->'lista' as lista
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND area_total_m2 >= 20
      AND datos_json->'amenities'->'lista' IS NOT NULL
      AND jsonb_typeof(datos_json->'amenities'->'lista') = 'array'
  ),
  amenidades_expandidas AS (
    SELECT jsonb_array_elements_text(lista) as amenidad
    FROM props_con_amenities
  ),
  conteo_amenidades AS (
    SELECT
      amenidad,
      COUNT(*) as cantidad,
      ROUND(100.0 * COUNT(*) / v_total_propiedades, 0) as porcentaje
    FROM amenidades_expandidas
    GROUP BY amenidad
    ORDER BY cantidad DESC
  )
  SELECT COALESCE(jsonb_object_agg(amenidad, jsonb_build_object(
    'cantidad', cantidad,
    'porcentaje', porcentaje
  )), '{}'::jsonb)
  INTO v_frecuencia_amenidades
  FROM conteo_amenidades;

  -- 2. Amenidades frecuentes (≥50%)
  WITH props_con_amenities AS (
    SELECT id, datos_json->'amenities'->'lista' as lista
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND area_total_m2 >= 20
      AND datos_json->'amenities'->'lista' IS NOT NULL
      AND jsonb_typeof(datos_json->'amenities'->'lista') = 'array'
  ),
  amenidades_expandidas AS (
    SELECT jsonb_array_elements_text(lista) as amenidad
    FROM props_con_amenities
  ),
  conteo AS (
    SELECT amenidad, COUNT(*) as cnt,
           ROUND(100.0 * COUNT(*) / v_total_propiedades, 0) as pct
    FROM amenidades_expandidas
    GROUP BY amenidad
    HAVING COUNT(*) >= v_total_propiedades * 0.5
    ORDER BY cnt DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'amenidad', amenidad,
    'porcentaje', pct
  )), '[]'::jsonb)
  INTO v_amenidades_frecuentes
  FROM conteo;

  -- 3. Amenidades opcionales (<50% pero >0)
  WITH props_con_amenities AS (
    SELECT id, datos_json->'amenities'->'lista' as lista
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND area_total_m2 >= 20
      AND datos_json->'amenities'->'lista' IS NOT NULL
      AND jsonb_typeof(datos_json->'amenities'->'lista') = 'array'
  ),
  amenidades_expandidas AS (
    SELECT jsonb_array_elements_text(lista) as amenidad
    FROM props_con_amenities
  ),
  conteo AS (
    SELECT amenidad, COUNT(*) as cnt,
           ROUND(100.0 * COUNT(*) / v_total_propiedades, 0) as pct
    FROM amenidades_expandidas
    GROUP BY amenidad
    HAVING COUNT(*) < v_total_propiedades * 0.5
    ORDER BY cnt DESC
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'amenidad', amenidad,
    'porcentaje', pct
  )), '[]'::jsonb)
  INTO v_amenidades_opcionales
  FROM conteo;

  -- 4. Estado de construcción más común
  WITH estados AS (
    SELECT
      estado_construccion::text as estado,
      COUNT(*) as cnt,
      ROUND(100.0 * COUNT(*) / v_total_propiedades, 0) as pct
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND area_total_m2 >= 20
      AND estado_construccion IS NOT NULL
      AND estado_construccion::text != 'no_especificado'
    GROUP BY estado_construccion
    ORDER BY cnt DESC
    LIMIT 1
  )
  SELECT estado, pct
  INTO v_estado_mas_comun, v_estado_porcentaje
  FROM estados;

  -- 5. Piso máximo (para inferir cantidad de pisos)
  SELECT MAX(piso)
  INTO v_piso_max
  FROM propiedades_v2
  WHERE id_proyecto_master = p_id_proyecto
    AND status = 'completado'
    AND area_total_m2 >= 20
    AND piso IS NOT NULL;

  -- 6. Fotos del proyecto (primera foto de cada propiedad, max 20)
  WITH fotos_propiedades AS (
    SELECT
      id,
      datos_json->'contenido'->'fotos_urls'->0 as foto_url,
      precio_usd
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND area_total_m2 >= 20
      AND datos_json->'contenido'->'fotos_urls' IS NOT NULL
      AND jsonb_typeof(datos_json->'contenido'->'fotos_urls') = 'array'
    ORDER BY precio_usd DESC
    LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'propiedad_id', id,
    'url', foto_url
  )), '[]'::jsonb)
  INTO v_fotos
  FROM fotos_propiedades
  WHERE foto_url IS NOT NULL
    AND jsonb_typeof(foto_url) = 'string';

  -- Construir resultado
  v_resultado := json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'total_propiedades', v_total_propiedades,
    'amenidades_frecuentes', COALESCE(v_amenidades_frecuentes, '[]'::jsonb),
    'amenidades_opcionales', COALESCE(v_amenidades_opcionales, '[]'::jsonb),
    'frecuencia_amenidades', COALESCE(v_frecuencia_amenidades, '{}'::jsonb),
    'estado_sugerido', json_build_object(
      'estado', v_estado_mas_comun,
      'porcentaje', v_estado_porcentaje
    ),
    'pisos_max', v_piso_max,
    'fotos_proyecto', COALESCE(v_fotos, '[]'::jsonb)
  );

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION inferir_datos_proyecto IS
  'Analiza propiedades vinculadas y sugiere amenidades (frecuentes + opcionales), estado, pisos y fotos';

-- 3. Verificación
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'proyectos_master' AND column_name = 'fotos_proyecto'
  ) THEN
    RAISE NOTICE '✅ Migración 087 completada: fotos_proyecto + amenidades opcionales';
  ELSE
    RAISE EXCEPTION '❌ Error: columna fotos_proyecto no fue creada';
  END IF;
END $$;
