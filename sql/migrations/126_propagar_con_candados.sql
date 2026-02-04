-- =============================================================================
-- Migración 126: Propagar con Candados + Avisar Saltadas
-- =============================================================================
-- Mejora la función propagar_proyecto_a_propiedades() para:
-- 1. Contar y reportar propiedades SALTADAS (con candados existentes)
-- 2. Agregar candados automáticamente después de propagar
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
  -- NUEVO: Contadores de saltadas
  v_estado_saltadas INTEGER := 0;
  v_fecha_saltadas INTEGER := 0;
  v_amenidades_saltadas INTEGER := 0;
  v_equipamiento_saltadas INTEGER := 0;
  v_total_propiedades INTEGER := 0;
  --
  v_estado_enum estado_construccion_enum;
  v_proyecto_nombre TEXT;
  v_nuevas_amenidades JSONB;
  v_amenidad TEXT;
  v_estado_amenities_actual JSONB;
  v_amenidades_anteriores JSONB;
  v_nuevo_equipamiento JSONB;
  v_equipamiento_existente JSONB;
  v_fecha_hoy TEXT;
BEGIN
  -- Fecha actual para candados
  v_fecha_hoy := to_char(CURRENT_DATE, 'YYYY-MM-DD');

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

  -- Contar total de propiedades del proyecto
  SELECT COUNT(*) INTO v_total_propiedades
  FROM propiedades_v2
  WHERE id_proyecto_master = p_id_proyecto AND es_activa = true;

  -- =========================================================================
  -- PROPAGAR ESTADO DE CONSTRUCCIÓN
  -- =========================================================================
  IF p_propagar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
    v_estado_enum := v_proyecto.estado_construccion::estado_construccion_enum;

    -- Contar saltadas (con candado)
    SELECT COUNT(*) INTO v_estado_saltadas
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND es_activa = true
      AND (
        (jsonb_typeof(campos_bloqueados->'estado_construccion') = 'boolean'
         AND (campos_bloqueados->'estado_construccion')::text = 'true')
        OR
        (jsonb_typeof(campos_bloqueados->'estado_construccion') = 'object'
         AND (campos_bloqueados->'estado_construccion'->>'bloqueado')::boolean IS TRUE)
      );

    FOR v_prop IN
      SELECT id, estado_construccion as estado_anterior
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND es_activa = true
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
      -- Actualizar estado
      UPDATE propiedades_v2
      SET estado_construccion = v_estado_enum,
          -- NUEVO: Agregar candado
          campos_bloqueados = jsonb_set(
            COALESCE(campos_bloqueados, '{}'::jsonb),
            '{estado_construccion}',
            jsonb_build_object(
              'bloqueado', true,
              'fuente', 'propagacion_proyecto',
              'proyecto_id', p_id_proyecto,
              'fecha', v_fecha_hoy
            )
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
        'estado_construccion',
        to_jsonb(v_prop.estado_anterior::text),
        to_jsonb(v_estado_enum::text),
        'Propagado desde proyecto: ' || v_proyecto_nombre || ' (con candado)'
      );

      v_estado_count := v_estado_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_estado_count;
  END IF;

  -- =========================================================================
  -- PROPAGAR FECHA DE ENTREGA
  -- =========================================================================
  IF p_propagar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
    -- Contar saltadas (con candado)
    SELECT COUNT(*) INTO v_fecha_saltadas
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND es_activa = true
      AND (
        (jsonb_typeof(campos_bloqueados->'fecha_entrega') = 'boolean'
         AND (campos_bloqueados->'fecha_entrega')::text = 'true')
        OR
        (jsonb_typeof(campos_bloqueados->'fecha_entrega') = 'object'
         AND (campos_bloqueados->'fecha_entrega'->>'bloqueado')::boolean IS TRUE)
      );

    FOR v_prop IN
      SELECT id, datos_json->'fecha_entrega' as fecha_anterior
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND es_activa = true
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
          ),
          -- NUEVO: Agregar candado
          campos_bloqueados = jsonb_set(
            COALESCE(campos_bloqueados, '{}'::jsonb),
            '{fecha_entrega}',
            jsonb_build_object(
              'bloqueado', true,
              'fuente', 'propagacion_proyecto',
              'proyecto_id', p_id_proyecto,
              'fecha', v_fecha_hoy
            )
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
        'Propagado desde proyecto: ' || v_proyecto_nombre || ' (con candado)'
      );

      v_fecha_count := v_fecha_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_fecha_count;
  END IF;

  -- =========================================================================
  -- PROPAGAR AMENIDADES (merge - mantiene existentes + agrega nuevas)
  -- =========================================================================
  IF p_propagar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL
     AND jsonb_typeof(v_proyecto.amenidades_edificio) = 'array'
     AND jsonb_array_length(v_proyecto.amenidades_edificio) > 0 THEN

    -- Contar saltadas (con candado)
    SELECT COUNT(*) INTO v_amenidades_saltadas
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND es_activa = true
      AND (
        (jsonb_typeof(campos_bloqueados->'amenities') = 'boolean'
         AND (campos_bloqueados->'amenities')::text = 'true')
        OR
        (jsonb_typeof(campos_bloqueados->'amenities') = 'object'
         AND (campos_bloqueados->'amenities'->>'bloqueado')::boolean IS TRUE)
      );

    FOR v_prop IN
      SELECT id,
             datos_json->'amenities'->'lista' as amenidades_anteriores,
             datos_json->'amenities'->'estado_amenities' as estado_amenities_anterior,
             datos_json
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND es_activa = true
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
      v_estado_amenities_actual := COALESCE(v_prop.estado_amenities_anterior, '{}'::jsonb);

      FOR v_amenidad IN SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio)
      LOOP
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

      IF jsonb_typeof(v_prop.amenidades_anteriores) = 'array' THEN
        v_amenidades_anteriores := v_prop.amenidades_anteriores;
      ELSE
        v_amenidades_anteriores := '[]'::jsonb;
      END IF;

      SELECT COALESCE(jsonb_agg(DISTINCT value ORDER BY value), '[]'::jsonb)
      INTO v_nuevas_amenidades
      FROM (
        SELECT jsonb_array_elements_text(v_amenidades_anteriores) as value
        UNION
        SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio) as value
      ) combined;

      UPDATE propiedades_v2
      SET datos_json = jsonb_set(
            jsonb_set(
              COALESCE(datos_json, '{"amenities":{}}'::jsonb),
              '{amenities,lista}',
              v_nuevas_amenidades
            ),
            '{amenities,estado_amenities}',
            v_estado_amenities_actual
          ),
          -- NUEVO: Agregar candado
          campos_bloqueados = jsonb_set(
            COALESCE(campos_bloqueados, '{}'::jsonb),
            '{amenities}',
            jsonb_build_object(
              'bloqueado', true,
              'fuente', 'propagacion_proyecto',
              'proyecto_id', p_id_proyecto,
              'fecha', v_fecha_hoy
            )
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
        'amenities',
        COALESCE(v_prop.estado_amenities_anterior, '[]'::jsonb),
        v_estado_amenities_actual,
        'Propagado desde proyecto: ' || v_proyecto_nombre || ' (con candado)'
      );

      v_amenidades_count := v_amenidades_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_amenidades_count;
  END IF;

  -- =========================================================================
  -- PROPAGAR EQUIPAMIENTO BASE (REEMPLAZA completamente)
  -- =========================================================================
  IF p_propagar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL
     AND jsonb_typeof(v_proyecto.equipamiento_base) = 'array'
     AND jsonb_array_length(v_proyecto.equipamiento_base) > 0 THEN

    -- Contar saltadas (con candado)
    SELECT COUNT(*) INTO v_equipamiento_saltadas
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto
      AND es_activa = true
      AND (
        (jsonb_typeof(campos_bloqueados->'equipamiento') = 'boolean'
         AND (campos_bloqueados->'equipamiento')::text = 'true')
        OR
        (jsonb_typeof(campos_bloqueados->'equipamiento') = 'object'
         AND (campos_bloqueados->'equipamiento'->>'bloqueado')::boolean IS TRUE)
      );

    FOR v_prop IN
      SELECT id,
             datos_json->'amenities'->'equipamiento' as equipamiento_anterior,
             datos_json
      FROM propiedades_v2
      WHERE id_proyecto_master = p_id_proyecto
        AND es_activa = true
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
      IF jsonb_typeof(v_prop.equipamiento_anterior) = 'array' THEN
        v_equipamiento_existente := v_prop.equipamiento_anterior;
      ELSE
        v_equipamiento_existente := '[]'::jsonb;
      END IF;

      v_nuevo_equipamiento := v_proyecto.equipamiento_base;

      UPDATE propiedades_v2
      SET datos_json = jsonb_set(
            jsonb_set(
              COALESCE(datos_json, '{}'::jsonb),
              '{amenities}',
              COALESCE(datos_json->'amenities', '{}'::jsonb)
            ),
            '{amenities,equipamiento}',
            v_nuevo_equipamiento
          ),
          -- NUEVO: Agregar candado
          campos_bloqueados = jsonb_set(
            COALESCE(campos_bloqueados, '{}'::jsonb),
            '{equipamiento}',
            jsonb_build_object(
              'bloqueado', true,
              'fuente', 'propagacion_proyecto',
              'proyecto_id', p_id_proyecto,
              'fecha', v_fecha_hoy
            )
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
        'equipamiento',
        COALESCE(v_equipamiento_existente, '[]'::jsonb),
        v_nuevo_equipamiento,
        'Reemplazado equipamiento con base del proyecto: ' || v_proyecto_nombre || ' (con candado)'
      );

      v_equipamiento_count := v_equipamiento_count + 1;
    END LOOP;

    v_afectadas := v_afectadas + v_equipamiento_count;
  END IF;

  -- Respuesta con info de saltadas
  RETURN json_build_object(
    'success', true,
    'proyecto_id', p_id_proyecto,
    'proyecto_nombre', v_proyecto_nombre,
    'total_propiedades', v_total_propiedades,
    'propiedades_afectadas', v_afectadas,
    'detalle', json_build_object(
      'estado_propagado', v_estado_count,
      'fecha_propagada', v_fecha_count,
      'amenidades_propagadas', v_amenidades_count,
      'equipamiento_propagado', v_equipamiento_count
    ),
    -- NUEVO: Info de saltadas por candados
    'saltadas_por_candado', json_build_object(
      'estado', v_estado_saltadas,
      'fecha', v_fecha_saltadas,
      'amenidades', v_amenidades_saltadas,
      'equipamiento', v_equipamiento_saltadas
    ),
    'nota', CASE
      WHEN (v_estado_saltadas + v_fecha_saltadas + v_amenidades_saltadas + v_equipamiento_saltadas) > 0
      THEN 'Algunas propiedades fueron saltadas porque tienen candados activos'
      ELSE 'Todas las propiedades fueron actualizadas y ahora tienen candados'
    END
  );
END;
$$;

COMMENT ON FUNCTION propagar_proyecto_a_propiedades IS
'Propaga datos del proyecto master a sus propiedades vinculadas.
v4.0: Agrega candados automáticamente + reporta propiedades saltadas.
- estado_construccion: Se propaga + candado
- fecha_entrega: Se guarda en datos_json->fecha_entrega + candado
- amenidades: Merge + candado en amenities
- equipamiento: REEMPLAZA + candado en equipamiento
Retorna: total_propiedades, afectadas, saltadas_por_candado';

DO $$
BEGIN
    RAISE NOTICE 'Migración 126: Propagación ahora agrega candados y reporta saltadas';
END $$;
