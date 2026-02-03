-- =============================================================================
-- Migración 108: Sincronizar Propiedad Individual desde Proyecto
-- =============================================================================
-- Nueva función para sincronizar UNA propiedad específica desde su proyecto.
-- A diferencia de propagar_proyecto_a_propiedades() que afecta a TODAS las
-- propiedades del proyecto, esta función solo afecta a la propiedad indicada.
-- Usa lógica de REEMPLAZO (no merge) para amenidades y equipamiento.
-- =============================================================================

CREATE OR REPLACE FUNCTION sincronizar_propiedad_desde_proyecto(
  p_id_propiedad INTEGER,
  p_id_proyecto INTEGER,
  p_sincronizar_estado BOOLEAN DEFAULT FALSE,
  p_sincronizar_fecha BOOLEAN DEFAULT FALSE,
  p_sincronizar_amenidades BOOLEAN DEFAULT FALSE,
  p_sincronizar_equipamiento BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proyecto RECORD;
  v_propiedad RECORD;
  v_proyecto_nombre TEXT;
  v_cambios_realizados JSONB := '{}'::jsonb;
  v_estado_enum estado_construccion_enum;
  v_nuevas_amenidades JSONB;
  v_amenidad TEXT;
  v_estado_amenities_nuevo JSONB;
  v_amenidades_anteriores JSONB;
  v_equipamiento_anterior JSONB;
BEGIN
  -- Verificar que la propiedad existe y pertenece al proyecto
  SELECT id, id_proyecto_master, estado_construccion, datos_json
  INTO v_propiedad
  FROM propiedades_v2
  WHERE id = p_id_propiedad;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Propiedad no encontrada');
  END IF;

  IF v_propiedad.id_proyecto_master != p_id_proyecto THEN
    RETURN json_build_object('success', false, 'error', 'La propiedad no pertenece al proyecto especificado');
  END IF;

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
    RETURN json_build_object('success', false, 'error', 'Proyecto no encontrado');
  END IF;

  v_proyecto_nombre := v_proyecto.nombre_oficial;

  -- =========================================================================
  -- SINCRONIZAR ESTADO DE CONSTRUCCIÓN
  -- =========================================================================
  IF p_sincronizar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
    v_estado_enum := v_proyecto.estado_construccion::estado_construccion_enum;

    UPDATE propiedades_v2
    SET estado_construccion = v_estado_enum
    WHERE id = p_id_propiedad;

    INSERT INTO propiedades_v2_historial (
      propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
      campo, valor_anterior, valor_nuevo, motivo
    ) VALUES (
      p_id_propiedad,
      'sincronizacion',
      'proyecto_' || p_id_proyecto,
      'Sincronización desde Proyecto',
      'estado_construccion',
      to_jsonb(v_propiedad.estado_construccion::text),
      to_jsonb(v_estado_enum::text),
      'Sincronizado desde proyecto: ' || v_proyecto_nombre
    );

    v_cambios_realizados := v_cambios_realizados || jsonb_build_object(
      'estado_construccion', jsonb_build_object(
        'anterior', v_propiedad.estado_construccion::text,
        'nuevo', v_estado_enum::text
      )
    );
  END IF;

  -- =========================================================================
  -- SINCRONIZAR FECHA DE ENTREGA
  -- =========================================================================
  IF p_sincronizar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
    UPDATE propiedades_v2
    SET datos_json = jsonb_set(
      COALESCE(datos_json, '{}'::jsonb),
      '{fecha_entrega}',
      to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM'))
    )
    WHERE id = p_id_propiedad;

    INSERT INTO propiedades_v2_historial (
      propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
      campo, valor_anterior, valor_nuevo, motivo
    ) VALUES (
      p_id_propiedad,
      'sincronizacion',
      'proyecto_' || p_id_proyecto,
      'Sincronización desde Proyecto',
      'fecha_entrega',
      COALESCE(v_propiedad.datos_json->'fecha_entrega', 'null'::jsonb),
      to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM')),
      'Sincronizado desde proyecto: ' || v_proyecto_nombre
    );

    v_cambios_realizados := v_cambios_realizados || jsonb_build_object(
      'fecha_entrega', jsonb_build_object(
        'anterior', v_propiedad.datos_json->>'fecha_entrega',
        'nuevo', to_char(v_proyecto.fecha_entrega, 'YYYY-MM')
      )
    );
  END IF;

  -- =========================================================================
  -- SINCRONIZAR AMENIDADES (REEMPLAZA completamente)
  -- =========================================================================
  IF p_sincronizar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL
     AND jsonb_typeof(v_proyecto.amenidades_edificio) = 'array'
     AND jsonb_array_length(v_proyecto.amenidades_edificio) > 0 THEN

    -- Guardar amenidades anteriores para historial
    IF jsonb_typeof(v_propiedad.datos_json->'amenities'->'lista') = 'array' THEN
      v_amenidades_anteriores := v_propiedad.datos_json->'amenities'->'lista';
    ELSE
      v_amenidades_anteriores := '[]'::jsonb;
    END IF;

    -- REEMPLAZAR con amenidades del proyecto
    v_nuevas_amenidades := v_proyecto.amenidades_edificio;

    -- Crear estado_amenities nuevo
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

    -- Actualizar propiedad
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
    WHERE id = p_id_propiedad;

    INSERT INTO propiedades_v2_historial (
      propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
      campo, valor_anterior, valor_nuevo, motivo
    ) VALUES (
      p_id_propiedad,
      'sincronizacion',
      'proyecto_' || p_id_proyecto,
      'Sincronización desde Proyecto',
      'amenities',
      v_amenidades_anteriores,
      v_nuevas_amenidades,
      'Reemplazado amenidades desde proyecto: ' || v_proyecto_nombre
    );

    v_cambios_realizados := v_cambios_realizados || jsonb_build_object(
      'amenidades', jsonb_build_object(
        'anterior_count', jsonb_array_length(v_amenidades_anteriores),
        'nuevo_count', jsonb_array_length(v_nuevas_amenidades)
      )
    );
  END IF;

  -- =========================================================================
  -- SINCRONIZAR EQUIPAMIENTO (REEMPLAZA completamente)
  -- =========================================================================
  IF p_sincronizar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL
     AND jsonb_typeof(v_proyecto.equipamiento_base) = 'array'
     AND jsonb_array_length(v_proyecto.equipamiento_base) > 0 THEN

    -- Obtener equipamiento anterior para historial
    IF jsonb_typeof(v_propiedad.datos_json->'amenities'->'equipamiento') = 'array' THEN
      v_equipamiento_anterior := v_propiedad.datos_json->'amenities'->'equipamiento';
    ELSE
      v_equipamiento_anterior := '[]'::jsonb;
    END IF;

    -- REEMPLAZAR completamente con equipamiento del proyecto
    UPDATE propiedades_v2
    SET datos_json = jsonb_set(
      jsonb_set(
        COALESCE(datos_json, '{}'::jsonb),
        '{amenities}',
        COALESCE(datos_json->'amenities', '{}'::jsonb)
      ),
      '{amenities,equipamiento}',
      v_proyecto.equipamiento_base
    )
    WHERE id = p_id_propiedad;

    INSERT INTO propiedades_v2_historial (
      propiedad_id, usuario_tipo, usuario_id, usuario_nombre,
      campo, valor_anterior, valor_nuevo, motivo
    ) VALUES (
      p_id_propiedad,
      'sincronizacion',
      'proyecto_' || p_id_proyecto,
      'Sincronización desde Proyecto',
      'equipamiento',
      v_equipamiento_anterior,
      v_proyecto.equipamiento_base,
      'Reemplazado equipamiento desde proyecto: ' || v_proyecto_nombre
    );

    v_cambios_realizados := v_cambios_realizados || jsonb_build_object(
      'equipamiento', jsonb_build_object(
        'anterior_count', jsonb_array_length(v_equipamiento_anterior),
        'nuevo_count', jsonb_array_length(v_proyecto.equipamiento_base)
      )
    );
  END IF;

  RETURN json_build_object(
    'success', true,
    'propiedad_id', p_id_propiedad,
    'proyecto_id', p_id_proyecto,
    'proyecto_nombre', v_proyecto_nombre,
    'cambios', v_cambios_realizados,
    'detalle', json_build_object(
      'estado_sincronizado', p_sincronizar_estado AND v_proyecto.estado_construccion IS NOT NULL,
      'fecha_sincronizada', p_sincronizar_fecha AND v_proyecto.fecha_entrega IS NOT NULL,
      'amenidades_sincronizadas', p_sincronizar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL,
      'equipamiento_sincronizado', p_sincronizar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL
    )
  );
END;
$$;

-- Permisos
GRANT EXECUTE ON FUNCTION sincronizar_propiedad_desde_proyecto(INTEGER, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION sincronizar_propiedad_desde_proyecto(INTEGER, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO anon;

COMMENT ON FUNCTION sincronizar_propiedad_desde_proyecto IS
'Sincroniza UNA propiedad específica desde su proyecto master.
A diferencia de propagar_proyecto_a_propiedades() que afecta a todas las propiedades,
esta función solo modifica la propiedad indicada.
- Usa lógica de REEMPLAZO (no merge) para amenidades y equipamiento
- No verifica campos_bloqueados (se asume que el frontend ya los desbloqueó)
- Registra todos los cambios en propiedades_v2_historial';
