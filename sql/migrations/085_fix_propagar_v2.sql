-- ============================================================================
-- FIX v2: Corregir función propagar_proyecto_a_propiedades
-- ============================================================================
-- Problema adicional: estado_construccion en propiedades_v2 es ENUM
-- ============================================================================

CREATE OR REPLACE FUNCTION propagar_proyecto_a_propiedades(
  p_id_proyecto INTEGER,
  p_propagar_estado BOOLEAN DEFAULT FALSE,
  p_propagar_fecha BOOLEAN DEFAULT FALSE,
  p_propagar_amenidades BOOLEAN DEFAULT FALSE
)
RETURNS JSON AS $$
DECLARE
  v_proyecto RECORD;
  v_afectadas INTEGER := 0;
  v_estado_count INTEGER := 0;
  v_fecha_count INTEGER := 0;
  v_amenidades_count INTEGER := 0;
  v_estado_enum estado_construccion_enum;
BEGIN
  -- Obtener datos del proyecto
  SELECT
    estado_construccion,
    fecha_entrega,
    amenidades_edificio
  INTO v_proyecto
  FROM proyectos_master
  WHERE id_proyecto_master = p_id_proyecto;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Proyecto no encontrado', 'success', false);
  END IF;

  -- Propagar estado de construcción (respetando candados)
  IF p_propagar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
    -- Cast a ENUM
    v_estado_enum := v_proyecto.estado_construccion::estado_construccion_enum;

    UPDATE propiedades_v2
    SET estado_construccion = v_estado_enum
    WHERE id_proyecto_master = p_id_proyecto
      AND (
        campos_bloqueados IS NULL
        OR campos_bloqueados->'estado_construccion' IS NULL
        OR (campos_bloqueados->'estado_construccion'->>'bloqueado')::boolean IS NOT TRUE
      )
      AND (estado_construccion IS NULL OR estado_construccion = 'no_especificado'::estado_construccion_enum OR estado_construccion != v_estado_enum);

    GET DIAGNOSTICS v_estado_count = ROW_COUNT;
    v_afectadas := v_afectadas + v_estado_count;
  END IF;

  -- Propagar fecha de entrega (respetando candados)
  IF p_propagar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
    UPDATE propiedades_v2
    SET datos_json = jsonb_set(
      COALESCE(datos_json, '{}'::jsonb),
      '{fecha_entrega}',
      to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM'))
    )
    WHERE id_proyecto_master = p_id_proyecto
      AND (
        campos_bloqueados IS NULL
        OR campos_bloqueados->'fecha_entrega' IS NULL
        OR (campos_bloqueados->'fecha_entrega'->>'bloqueado')::boolean IS NOT TRUE
      );

    GET DIAGNOSTICS v_fecha_count = ROW_COUNT;
    v_afectadas := v_afectadas + v_fecha_count;
  END IF;

  -- Propagar amenidades del edificio (agregar sin sobrescribir, respetando candados)
  IF p_propagar_amenidades AND jsonb_array_length(COALESCE(v_proyecto.amenidades_edificio, '[]'::jsonb)) > 0 THEN
    UPDATE propiedades_v2
    SET datos_json = jsonb_set(
      COALESCE(datos_json, '{}'::jsonb),
      '{amenities,lista}',
      (
        SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb)
        FROM (
          SELECT jsonb_array_elements_text(COALESCE(datos_json->'amenities'->'lista', '[]'::jsonb)) as value
          UNION
          SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio) as value
        ) combined
      )
    )
    WHERE id_proyecto_master = p_id_proyecto
      AND (
        campos_bloqueados IS NULL
        OR campos_bloqueados->'amenities' IS NULL
        OR (campos_bloqueados->'amenities'->>'bloqueado')::boolean IS NOT TRUE
      );

    GET DIAGNOSTICS v_amenidades_count = ROW_COUNT;
    v_afectadas := v_afectadas + v_amenidades_count;
  END IF;

  RETURN json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'propiedades_afectadas', v_afectadas,
    'detalle', json_build_object(
      'estado_propagado', v_estado_count,
      'fecha_propagada', v_fecha_count,
      'amenidades_propagadas', v_amenidades_count
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Verificación
DO $$
BEGIN
  RAISE NOTICE '✅ Función propagar_proyecto_a_propiedades v2 con cast a ENUM';
END $$;
