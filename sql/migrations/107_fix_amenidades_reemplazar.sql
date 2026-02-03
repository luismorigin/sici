-- =============================================================================
-- Migración 107: Fix Amenidades - Reemplazar en lugar de Merge
-- =============================================================================
-- Corrige la función propagar_proyecto_a_propiedades() para que las amenidades
-- sean REEMPLAZADAS completamente por las del proyecto en lugar de hacer merge.
-- =============================================================================

CREATE OR REPLACE FUNCTION propagar_proyecto_a_propiedades(
  p_id_proyecto INTEGER,
  p_propagar_estado BOOLEAN DEFAULT FALSE,
  p_propagar_fecha BOOLEAN DEFAULT FALSE,
  p_propagar_amenidades BOOLEAN DEFAULT FALSE,
  p_propagar_equipamiento BOOLEAN DEFAULT FALSE
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
  v_equipamiento_count INTEGER := 0;
  v_estado_enum estado_construccion_enum;
  v_proyecto_nombre TEXT;
  v_nuevas_amenidades JSONB;
  v_amenidad TEXT;
  v_estado_amenities_nuevo JSONB;
  v_amenidades_anteriores JSONB;
  v_nuevo_equipamiento JSONB;
  v_equipamiento_existente JSONB;
BEGIN
  -- Obtener datos del proyecto
  SELECT
    nombre_oficial,
    estado_construccion,
    fecha_entrega,
    amenidades_edificio,
    equipamiento_base
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
          OR (
            jsonb_typeof(campos_bloqueados->'estado_construccion') = 'boolean'
            AND (campos_bloqueados->'estado_construccion')::text != 'true'
          )
          OR (
            jsonb_typeof(campos_bloqueados->'estado_construccion') = 'object'
            AND (campos_bloqueados->'estado_construccion'->>'bloqueado')::boolean IS NOT TRUE
          )
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
          OR (
            jsonb_typeof(campos_bloqueados->'fecha_entrega') = 'boolean'
            AND (campos_bloqueados->'fecha_entrega')::text != 'true'
          )
          OR (
            jsonb_typeof(campos_bloqueados->'fecha_entrega') = 'object'
            AND (campos_bloqueados->'fecha_entrega'->>'bloqueado')::boolean IS NOT TRUE
          )
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
  -- PROPAGAR AMENIDADES
  -- REEMPLAZA completamente datos_json->'amenities'->'lista'
  -- =========================================================================
  IF p_propagar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL
     AND jsonb_typeof(v_proyecto.amenidades_edificio) = 'array'
     AND jsonb_array_length(v_proyecto.amenidades_edificio) > 0 THEN

    FOR v_prop IN
      SELECT id,
             datos_json->'amenities'->'lista' as amenidades_anteriores,
             datos_json
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND (
          campos_bloqueados IS NULL
          OR campos_bloqueados->'amenities' IS NULL
          OR (
            jsonb_typeof(campos_bloqueados->'amenities') = 'boolean'
            AND (campos_bloqueados->'amenities')::text != 'true'
          )
          OR (
            jsonb_typeof(campos_bloqueados->'amenities') = 'object'
            AND (campos_bloqueados->'amenities'->>'bloqueado')::boolean IS NOT TRUE
          )
        )
    LOOP
      -- Guardar amenidades anteriores para historial
      IF jsonb_typeof(v_prop.amenidades_anteriores) = 'array' THEN
        v_amenidades_anteriores := v_prop.amenidades_anteriores;
      ELSE
        v_amenidades_anteriores := '[]'::jsonb;
      END IF;

      -- REEMPLAZAR con amenidades del proyecto (no merge)
      v_nuevas_amenidades := v_proyecto.amenidades_edificio;

      -- Crear estado_amenities nuevo con todas las amenidades del proyecto
      v_estado_amenities_nuevo := '{}'::jsonb;
      FOR v_amenidad IN SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio)
      LOOP
        v_estado_amenities_nuevo := v_estado_amenities_nuevo || jsonb_build_object(
          v_amenidad,
          jsonb_build_object(
            'valor', 'por_confirmar',
            'fuente', 'proyecto_master',
            'confianza', 'media'
          )
        );
      END LOOP;

      -- Actualizar propiedad con ambos: lista y estado_amenities
      UPDATE propiedades_v2
      SET datos_json = jsonb_set(
        jsonb_set(
          COALESCE(datos_json, '{"amenities":{}}'::jsonb),
          '{amenities,lista}',
          v_nuevas_amenidades
        ),
        '{amenities,estado_amenities}',
        v_estado_amenities_nuevo
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
        COALESCE(v_amenidades_anteriores, '[]'::jsonb),
        v_nuevas_amenidades,
        'Reemplazado amenidades con las del proyecto: ' || v_proyecto_nombre
      );

      v_amenidades_count := v_amenidades_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_amenidades_count;
  END IF;

  -- =========================================================================
  -- PROPAGAR EQUIPAMIENTO BASE
  -- REEMPLAZA completamente datos_json->'amenities'->'equipamiento'
  -- =========================================================================
  IF p_propagar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL
     AND jsonb_typeof(v_proyecto.equipamiento_base) = 'array'
     AND jsonb_array_length(v_proyecto.equipamiento_base) > 0 THEN

    FOR v_prop IN
      SELECT id,
             datos_json->'amenities'->'equipamiento' as equipamiento_anterior,
             datos_json
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND (
          campos_bloqueados IS NULL
          OR campos_bloqueados->'equipamiento' IS NULL
          OR (
            jsonb_typeof(campos_bloqueados->'equipamiento') = 'boolean'
            AND (campos_bloqueados->'equipamiento')::text != 'true'
          )
          OR (
            jsonb_typeof(campos_bloqueados->'equipamiento') = 'object'
            AND (campos_bloqueados->'equipamiento'->>'bloqueado')::boolean IS NOT TRUE
          )
        )
    LOOP
      -- Obtener equipamiento existente para historial
      IF jsonb_typeof(v_prop.equipamiento_anterior) = 'array' THEN
        v_equipamiento_existente := v_prop.equipamiento_anterior;
      ELSE
        v_equipamiento_existente := '[]'::jsonb;
      END IF;

      -- REEMPLAZAR completamente con equipamiento del proyecto (no merge)
      v_nuevo_equipamiento := v_proyecto.equipamiento_base;

      -- Actualizar propiedad: datos_json->'amenities'->'equipamiento'
      UPDATE propiedades_v2
      SET datos_json = jsonb_set(
        jsonb_set(
          COALESCE(datos_json, '{}'::jsonb),
          '{amenities}',
          COALESCE(datos_json->'amenities', '{}'::jsonb)
        ),
        '{amenities,equipamiento}',
        v_nuevo_equipamiento
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
        'equipamiento',
        COALESCE(v_equipamiento_existente, '[]'::jsonb),
        v_nuevo_equipamiento,
        'Reemplazado equipamiento con base del proyecto: ' || v_proyecto_nombre
      );

      v_equipamiento_count := v_equipamiento_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_equipamiento_count;
  END IF;

  RETURN json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'proyecto_nombre', v_proyecto_nombre,
    'propiedades_afectadas', v_afectadas,
    'detalle', json_build_object(
      'estado_propagado', v_estado_count,
      'fecha_propagada', v_fecha_count,
      'amenidades_propagadas', v_amenidades_count,
      'equipamiento_propagado', v_equipamiento_count
    )
  );
END;
$$;

COMMENT ON FUNCTION propagar_proyecto_a_propiedades IS
'Propaga datos del proyecto master a sus propiedades vinculadas.
v3.2: Tanto amenidades como equipamiento ahora REEMPLAZAN en lugar de hacer merge.
- estado_construccion: Se propaga directamente a la columna
- fecha_entrega: Se guarda en datos_json->fecha_entrega
- amenidades: REEMPLAZA datos_json->amenities->lista con amenidades_edificio del proyecto
- equipamiento: REEMPLAZA datos_json->amenities->equipamiento con equipamiento_base del proyecto';
