-- ============================================================================
-- MIGRACIÓN 086: Inferir Datos de Proyecto desde Propiedades
-- ============================================================================
-- Fecha: 2026-01-28
-- Propósito: Función para extraer/inferir datos del proyecto analizando
--            las propiedades vinculadas (amenidades, estado, fotos, pisos)
-- ============================================================================

CREATE OR REPLACE FUNCTION inferir_datos_proyecto(p_id_proyecto INTEGER)
RETURNS JSON AS $$
DECLARE
  v_resultado JSON;
  v_total_propiedades INTEGER;
  v_amenidades_frecuentes JSONB;
  v_estado_mas_comun TEXT;
  v_estado_porcentaje NUMERIC;
  v_piso_max INTEGER;
  v_fotos JSONB;
  v_frecuencia_amenidades JSONB;
BEGIN
  -- Contar propiedades del proyecto
  SELECT COUNT(*) INTO v_total_propiedades
  FROM propiedades_v2
  WHERE id_proyecto_master = p_id_proyecto
    AND status = 'completado';

  IF v_total_propiedades = 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No hay propiedades vinculadas a este proyecto',
      'total_propiedades', 0
    );
  END IF;

  -- 1. Calcular frecuencia de amenidades
  WITH amenidades_expandidas AS (
    SELECT jsonb_array_elements_text(
      COALESCE(datos_json->'amenities'->'lista', '[]'::jsonb)
    ) as amenidad
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
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
  SELECT jsonb_object_agg(amenidad, jsonb_build_object(
    'cantidad', cantidad,
    'porcentaje', porcentaje
  ))
  INTO v_frecuencia_amenidades
  FROM conteo_amenidades;

  -- 2. Amenidades frecuentes (≥50%)
  WITH amenidades_expandidas AS (
    SELECT jsonb_array_elements_text(
      COALESCE(datos_json->'amenities'->'lista', '[]'::jsonb)
    ) as amenidad
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
  ),
  conteo AS (
    SELECT amenidad, COUNT(*) as cnt
    FROM amenidades_expandidas
    GROUP BY amenidad
    HAVING COUNT(*) >= v_total_propiedades * 0.5
    ORDER BY cnt DESC
  )
  SELECT COALESCE(jsonb_agg(amenidad), '[]'::jsonb)
  INTO v_amenidades_frecuentes
  FROM conteo;

  -- 3. Estado de construcción más común
  WITH estados AS (
    SELECT
      estado_construccion,
      COUNT(*) as cnt,
      ROUND(100.0 * COUNT(*) / v_total_propiedades, 0) as pct
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND estado_construccion IS NOT NULL
      AND estado_construccion != 'no_especificado'
    GROUP BY estado_construccion
    ORDER BY cnt DESC
    LIMIT 1
  )
  SELECT estado_construccion, pct
  INTO v_estado_mas_comun, v_estado_porcentaje
  FROM estados;

  -- 4. Piso máximo (para inferir cantidad de pisos)
  SELECT MAX(piso)
  INTO v_piso_max
  FROM propiedades_v2
  WHERE id_proyecto_master = p_id_proyecto
    AND status = 'completado'
    AND piso IS NOT NULL;

  -- 5. Fotos del proyecto (primera foto de cada propiedad, max 20)
  WITH fotos_propiedades AS (
    SELECT
      id,
      datos_json->'contenido'->'fotos_urls'->0 as foto_url,
      precio_usd
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND status = 'completado'
      AND jsonb_array_length(COALESCE(datos_json->'contenido'->'fotos_urls', '[]'::jsonb)) > 0
    ORDER BY precio_usd DESC
    LIMIT 20
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'propiedad_id', id,
    'url', foto_url
  )), '[]'::jsonb)
  INTO v_fotos
  FROM fotos_propiedades
  WHERE foto_url IS NOT NULL;

  -- Construir resultado
  v_resultado := json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'total_propiedades', v_total_propiedades,
    'amenidades_sugeridas', v_amenidades_frecuentes,
    'frecuencia_amenidades', COALESCE(v_frecuencia_amenidades, '{}'::jsonb),
    'estado_sugerido', json_build_object(
      'estado', v_estado_mas_comun,
      'porcentaje', v_estado_porcentaje
    ),
    'pisos_max', v_piso_max,
    'fotos_proyecto', v_fotos
  );

  RETURN v_resultado;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION inferir_datos_proyecto IS
  'Analiza propiedades vinculadas y sugiere amenidades, estado, pisos y fotos para el proyecto';

-- Verificación
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'inferir_datos_proyecto'
  ) THEN
    RAISE NOTICE '✅ Migración 086 completada: función inferir_datos_proyecto() creada';
  ELSE
    RAISE EXCEPTION '❌ Error: función no fue creada';
  END IF;
END $$;
