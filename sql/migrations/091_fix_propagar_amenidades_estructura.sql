-- =============================================================================
-- Migración 091: Fix propagación de amenidades y fecha entrega
-- =============================================================================
-- Problema: La función propagar_proyecto_a_propiedades guardaba amenidades
-- en datos_json->'amenities'->'lista' pero la función buscar_unidades_reales
-- lee de datos_json->'amenities'->'estado_amenities'.
--
-- Solución: Actualizar la estructura estado_amenities con el formato correcto.
-- =============================================================================

CREATE OR REPLACE FUNCTION propagar_proyecto_a_propiedades(
  p_id_proyecto INTEGER,
  p_propagar_estado BOOLEAN DEFAULT FALSE,
  p_propagar_fecha BOOLEAN DEFAULT FALSE,
  p_propagar_amenidades BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proyecto RECORD;
  v_prop RECORD;
  v_afectadas INTEGER := 0;
  v_estado_count INTEGER := 0;
  v_fecha_count INTEGER := 0;
  v_amenidades_count INTEGER := 0;
  v_estado_enum estado_construccion_enum;
  v_proyecto_nombre TEXT;
  v_nuevas_amenidades JSONB;
  v_nuevo_estado_amenities JSONB;
  v_amenidad TEXT;
  v_estado_amenities_actual JSONB;
BEGIN
  -- Obtener datos del proyecto
  SELECT
    nombre_oficial,
    estado_construccion,
    fecha_entrega,
    amenidades_edificio
  INTO v_proyecto
  FROM proyectos_master
  WHERE id_proyecto_master = p_id_proyecto;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Proyecto no encontrado', 'success', false);
  END IF;

  v_proyecto_nombre := v_proyecto.nombre_oficial;

  -- =========================================================================
  -- PROPAGAR ESTADO DE CONSTRUCCIÓN
  -- =========================================================================
  IF p_propagar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
    v_estado_enum := v_proyecto.estado_construccion::estado_construccion_enum;

    FOR v_prop IN
      SELECT id, estado_construccion as estado_anterior
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND (
          campos_bloqueados IS NULL
          OR campos_bloqueados->'estado_construccion' IS NULL
          OR (campos_bloqueados->'estado_construccion'->>'bloqueado')::boolean IS NOT TRUE
        )
        AND (estado_construccion IS NULL OR estado_construccion = 'no_especificado'::estado_construccion_enum OR estado_construccion != v_estado_enum)
    LOOP
      UPDATE propiedades_v2
      SET estado_construccion = v_estado_enum
      WHERE id = v_prop.id;

      INSERT INTO propiedades_v2_historial (
        propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
        campo, valor_anterior, valor_nuevo, motivo
      ) VALUES (
        v_prop.id,
        'propagacion',
        'proyecto_' || p_id_proyecto,
        'Propagación desde Proyecto',
        'estado_construccion',
        to_jsonb(v_prop.estado_anterior::text),
        to_jsonb(v_estado_enum::text),
        'Propagado desde proyecto: ' || v_proyecto_nombre
      );

      v_estado_count := v_estado_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_estado_count;
  END IF;

  -- =========================================================================
  -- PROPAGAR FECHA DE ENTREGA
  -- =========================================================================
  IF p_propagar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
    FOR v_prop IN
      SELECT id, datos_json->'fecha_entrega' as fecha_anterior
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND (
          campos_bloqueados IS NULL
          OR campos_bloqueados->'fecha_entrega' IS NULL
          OR (campos_bloqueados->'fecha_entrega'->>'bloqueado')::boolean IS NOT TRUE
        )
    LOOP
      UPDATE propiedades_v2
      SET datos_json = jsonb_set(
        COALESCE(datos_json, '{}'::jsonb),
        '{fecha_entrega}',
        to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM'))
      )
      WHERE id = v_prop.id;

      INSERT INTO propiedades_v2_historial (
        propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
        campo, valor_anterior, valor_nuevo, motivo
      ) VALUES (
        v_prop.id,
        'propagacion',
        'proyecto_' || p_id_proyecto,
        'Propagación desde Proyecto',
        'fecha_entrega',
        COALESCE(v_prop.fecha_anterior, 'null'::jsonb),
        to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM')),
        'Propagado desde proyecto: ' || v_proyecto_nombre
      );

      v_fecha_count := v_fecha_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_fecha_count;
  END IF;

  -- =========================================================================
  -- PROPAGAR AMENIDADES (CORREGIDO)
  -- Ahora actualiza estado_amenities con la estructura correcta
  -- =========================================================================
  IF p_propagar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL
     AND jsonb_array_length(v_proyecto.amenidades_edificio) > 0 THEN

    FOR v_prop IN
      SELECT id,
             datos_json->'amenities'->'lista' as amenidades_anteriores,
             datos_json->'amenities'->'estado_amenities' as estado_amenities_anterior,
             datos_json
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND (
          campos_bloqueados IS NULL
          OR campos_bloqueados->'amenities' IS NULL
          OR (campos_bloqueados->'amenities'->>'bloqueado')::boolean IS NOT TRUE
        )
    LOOP
      -- Obtener estado_amenities actual o crear objeto vacío
      v_estado_amenities_actual := COALESCE(v_prop.estado_amenities_anterior, '{}'::jsonb);

      -- Agregar cada amenidad del proyecto con valor "por_confirmar"
      FOR v_amenidad IN SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio)
      LOOP
        -- Solo agregar si no existe ya en estado_amenities
        IF NOT v_estado_amenities_actual ? v_amenidad THEN
          v_estado_amenities_actual := v_estado_amenities_actual || jsonb_build_object(
            v_amenidad,
            jsonb_build_object(
              'valor', 'por_confirmar',
              'fuente', 'proyecto_master',
              'confianza', 'media'
            )
          );
        END IF;
      END LOOP;

      -- Calcular nueva lista (unión de existentes + proyecto)
      SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb)
      INTO v_nuevas_amenidades
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(v_prop.amenidades_anteriores, '[]'::jsonb)) as value
        UNION
        SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio) as value
      ) combined;

      -- Actualizar propiedad con ambos: lista y estado_amenities
      UPDATE propiedades_v2
      SET datos_json = jsonb_set(
        jsonb_set(
          COALESCE(datos_json, '{"amenities":{}}'::jsonb),
          '{amenities,lista}',
          v_nuevas_amenidades
        ),
        '{amenities,estado_amenities}',
        v_estado_amenities_actual
      )
      WHERE id = v_prop.id;

      -- Registrar en historial
      INSERT INTO propiedades_v2_historial (
        propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
        campo, valor_anterior, valor_nuevo, motivo
      ) VALUES (
        v_prop.id,
        'propagacion',
        'proyecto_' || p_id_proyecto,
        'Propagación desde Proyecto',
        'amenities',
        COALESCE(v_prop.estado_amenities_anterior, '[]'::jsonb),
        v_estado_amenities_actual,
        'Propagado desde proyecto: ' || v_proyecto_nombre
      );

      v_amenidades_count := v_amenidades_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_amenidades_count;
  END IF;

  RETURN json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'proyecto_nombre', v_proyecto_nombre,
    'propiedades_afectadas', v_afectadas,
    'detalle', json_build_object(
      'estado_propagado', v_estado_count,
      'fecha_propagada', v_fecha_count,
      'amenidades_propagadas', v_amenidades_count
    )
  );
END;
$$;

-- Otorgar permisos
GRANT EXECUTE ON FUNCTION propagar_proyecto_a_propiedades(INTEGER, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION propagar_proyecto_a_propiedades(INTEGER, BOOLEAN, BOOLEAN, BOOLEAN) TO anon;

COMMENT ON FUNCTION propagar_proyecto_a_propiedades IS
'Propaga datos del proyecto master a sus propiedades vinculadas.
v2.0: Corregido para actualizar estado_amenities con estructura correcta.
- estado_construccion: Se propaga directamente a la columna
- fecha_entrega: Se guarda en datos_json->fecha_entrega
- amenidades: Se actualiza tanto lista como estado_amenities';
