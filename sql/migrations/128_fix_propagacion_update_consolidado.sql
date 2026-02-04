-- =============================================================================
-- Migración 128: Fix propagar_proyecto_a_propiedades() v4.1
-- =============================================================================
-- Problema: Múltiples UPDATEs causan pérdida de candados por condición de carrera
-- Solución: UN SOLO UPDATE consolidado por propiedad
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
  v_estado_saltadas INTEGER := 0;
  v_fecha_saltadas INTEGER := 0;
  v_amenidades_saltadas INTEGER := 0;
  v_equipamiento_saltadas INTEGER := 0;
  v_total_propiedades INTEGER := 0;
  v_estado_enum estado_construccion_enum;
  v_proyecto_nombre TEXT;
  v_fecha_hoy TEXT;
  -- Variables para UPDATE consolidado
  v_nuevo_estado estado_construccion_enum;
  v_nuevo_datos_json JSONB;
  v_nuevos_candados JSONB;
  v_cambio_estado BOOLEAN;
  v_cambio_fecha BOOLEAN;
  v_cambio_amenidades BOOLEAN;
  v_cambio_equipamiento BOOLEAN;
  v_amenidad TEXT;
  v_estado_amenities_actual JSONB;
  v_nuevas_amenidades JSONB;
  v_amenidades_anteriores JSONB;
BEGIN
  v_fecha_hoy := to_char(CURRENT_DATE, 'YYYY-MM-DD');

  -- Obtener datos del proyecto
  SELECT nombre_oficial, estado_construccion, fecha_entrega,
         amenidades_edificio, equipamiento_base
  INTO v_proyecto
  FROM proyectos_master
  WHERE id_proyecto_master = p_id_proyecto;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Proyecto no encontrado', 'success', false);
  END IF;

  v_proyecto_nombre := v_proyecto.nombre_oficial;

  -- Contar total de propiedades
  SELECT COUNT(*) INTO v_total_propiedades
  FROM propiedades_v2
  WHERE id_proyecto_master = p_id_proyecto AND es_activa = true;

  -- Contar saltadas por candados (para cada campo)
  IF p_propagar_estado THEN
    SELECT COUNT(*) INTO v_estado_saltadas FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto AND es_activa = true
      AND ((jsonb_typeof(campos_bloqueados->'estado_construccion') = 'boolean'
            AND (campos_bloqueados->'estado_construccion')::text = 'true')
           OR (jsonb_typeof(campos_bloqueados->'estado_construccion') = 'object'
               AND (campos_bloqueados->'estado_construccion'->>'bloqueado')::boolean IS TRUE));
  END IF;

  IF p_propagar_fecha THEN
    SELECT COUNT(*) INTO v_fecha_saltadas FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto AND es_activa = true
      AND ((jsonb_typeof(campos_bloqueados->'fecha_entrega') = 'boolean'
            AND (campos_bloqueados->'fecha_entrega')::text = 'true')
           OR (jsonb_typeof(campos_bloqueados->'fecha_entrega') = 'object'
               AND (campos_bloqueados->'fecha_entrega'->>'bloqueado')::boolean IS TRUE));
  END IF;

  IF p_propagar_amenidades THEN
    SELECT COUNT(*) INTO v_amenidades_saltadas FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto AND es_activa = true
      AND ((jsonb_typeof(campos_bloqueados->'amenities') = 'boolean'
            AND (campos_bloqueados->'amenities')::text = 'true')
           OR (jsonb_typeof(campos_bloqueados->'amenities') = 'object'
               AND (campos_bloqueados->'amenities'->>'bloqueado')::boolean IS TRUE));
  END IF;

  IF p_propagar_equipamiento THEN
    SELECT COUNT(*) INTO v_equipamiento_saltadas FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto AND es_activa = true
      AND ((jsonb_typeof(campos_bloqueados->'equipamiento') = 'boolean'
            AND (campos_bloqueados->'equipamiento')::text = 'true')
           OR (jsonb_typeof(campos_bloqueados->'equipamiento') = 'object'
               AND (campos_bloqueados->'equipamiento'->>'bloqueado')::boolean IS TRUE));
  END IF;

  -- =========================================================================
  -- LOOP PRINCIPAL: UN SOLO UPDATE POR PROPIEDAD
  -- =========================================================================
  FOR v_prop IN
    SELECT id, estado_construccion, datos_json, campos_bloqueados
    FROM propiedades_v2
    WHERE id_proyecto_master = p_id_proyecto AND es_activa = true
  LOOP
    -- Inicializar con valores actuales
    v_nuevo_estado := v_prop.estado_construccion;
    v_nuevo_datos_json := COALESCE(v_prop.datos_json, '{}'::jsonb);
    v_nuevos_candados := COALESCE(v_prop.campos_bloqueados, '{}'::jsonb);
    v_cambio_estado := FALSE;
    v_cambio_fecha := FALSE;
    v_cambio_amenidades := FALSE;
    v_cambio_equipamiento := FALSE;

    -- =====================================================================
    -- ESTADO DE CONSTRUCCIÓN
    -- =====================================================================
    IF p_propagar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
      v_estado_enum := v_proyecto.estado_construccion::estado_construccion_enum;

      -- Solo si NO tiene candado en este campo
      IF NOT (
        (jsonb_typeof(v_nuevos_candados->'estado_construccion') = 'boolean'
         AND (v_nuevos_candados->'estado_construccion')::text = 'true')
        OR (jsonb_typeof(v_nuevos_candados->'estado_construccion') = 'object'
            AND (v_nuevos_candados->'estado_construccion'->>'bloqueado')::boolean IS TRUE)
      ) THEN
        -- Solo si el valor es diferente
        IF v_prop.estado_construccion IS NULL
           OR v_prop.estado_construccion = 'no_especificado'::estado_construccion_enum
           OR v_prop.estado_construccion != v_estado_enum THEN
          v_nuevo_estado := v_estado_enum;
          v_nuevos_candados := jsonb_set(v_nuevos_candados, '{estado_construccion}',
            jsonb_build_object('bloqueado', true, 'fuente', 'propagacion_proyecto',
                               'proyecto_id', p_id_proyecto, 'fecha', v_fecha_hoy));
          v_cambio_estado := TRUE;
          v_estado_count := v_estado_count + 1;
        END IF;
      END IF;
    END IF;

    -- =====================================================================
    -- FECHA DE ENTREGA
    -- =====================================================================
    IF p_propagar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
      IF NOT (
        (jsonb_typeof(v_nuevos_candados->'fecha_entrega') = 'boolean'
         AND (v_nuevos_candados->'fecha_entrega')::text = 'true')
        OR (jsonb_typeof(v_nuevos_candados->'fecha_entrega') = 'object'
            AND (v_nuevos_candados->'fecha_entrega'->>'bloqueado')::boolean IS TRUE)
      ) THEN
        v_nuevo_datos_json := jsonb_set(v_nuevo_datos_json, '{fecha_entrega}',
          to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM')));
        v_nuevos_candados := jsonb_set(v_nuevos_candados, '{fecha_entrega}',
          jsonb_build_object('bloqueado', true, 'fuente', 'propagacion_proyecto',
                             'proyecto_id', p_id_proyecto, 'fecha', v_fecha_hoy));
        v_cambio_fecha := TRUE;
        v_fecha_count := v_fecha_count + 1;
      END IF;
    END IF;

    -- =====================================================================
    -- AMENIDADES (merge)
    -- =====================================================================
    IF p_propagar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL
       AND jsonb_typeof(v_proyecto.amenidades_edificio) = 'array'
       AND jsonb_array_length(v_proyecto.amenidades_edificio) > 0 THEN
      IF NOT (
        (jsonb_typeof(v_nuevos_candados->'amenities') = 'boolean'
         AND (v_nuevos_candados->'amenities')::text = 'true')
        OR (jsonb_typeof(v_nuevos_candados->'amenities') = 'object'
            AND (v_nuevos_candados->'amenities'->>'bloqueado')::boolean IS TRUE)
      ) THEN
        -- Preparar estado_amenities
        v_estado_amenities_actual := COALESCE(v_nuevo_datos_json->'amenities'->'estado_amenities', '{}'::jsonb);
        FOR v_amenidad IN SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio)
        LOOP
          IF NOT v_estado_amenities_actual ? v_amenidad THEN
            v_estado_amenities_actual := v_estado_amenities_actual || jsonb_build_object(
              v_amenidad, jsonb_build_object('valor', 'por_confirmar', 'fuente', 'proyecto_master', 'confianza', 'media'));
          END IF;
        END LOOP;

        -- Preparar lista de amenidades (merge)
        IF jsonb_typeof(v_nuevo_datos_json->'amenities'->'lista') = 'array' THEN
          v_amenidades_anteriores := v_nuevo_datos_json->'amenities'->'lista';
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

        -- Aplicar cambios a datos_json
        v_nuevo_datos_json := jsonb_set(
          jsonb_set(
            COALESCE(v_nuevo_datos_json, '{"amenities":{}}'::jsonb),
            '{amenities,lista}', v_nuevas_amenidades
          ),
          '{amenities,estado_amenities}', v_estado_amenities_actual
        );
        v_nuevos_candados := jsonb_set(v_nuevos_candados, '{amenities}',
          jsonb_build_object('bloqueado', true, 'fuente', 'propagacion_proyecto',
                             'proyecto_id', p_id_proyecto, 'fecha', v_fecha_hoy));
        v_cambio_amenidades := TRUE;
        v_amenidades_count := v_amenidades_count + 1;
      END IF;
    END IF;

    -- =====================================================================
    -- EQUIPAMIENTO (reemplaza)
    -- =====================================================================
    IF p_propagar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL
       AND jsonb_typeof(v_proyecto.equipamiento_base) = 'array'
       AND jsonb_array_length(v_proyecto.equipamiento_base) > 0 THEN
      IF NOT (
        (jsonb_typeof(v_nuevos_candados->'equipamiento') = 'boolean'
         AND (v_nuevos_candados->'equipamiento')::text = 'true')
        OR (jsonb_typeof(v_nuevos_candados->'equipamiento') = 'object'
            AND (v_nuevos_candados->'equipamiento'->>'bloqueado')::boolean IS TRUE)
      ) THEN
        -- Asegurar que existe la estructura amenities
        IF v_nuevo_datos_json->'amenities' IS NULL THEN
          v_nuevo_datos_json := jsonb_set(v_nuevo_datos_json, '{amenities}', '{}'::jsonb);
        END IF;
        v_nuevo_datos_json := jsonb_set(v_nuevo_datos_json, '{amenities,equipamiento}',
          v_proyecto.equipamiento_base);
        v_nuevos_candados := jsonb_set(v_nuevos_candados, '{equipamiento}',
          jsonb_build_object('bloqueado', true, 'fuente', 'propagacion_proyecto',
                             'proyecto_id', p_id_proyecto, 'fecha', v_fecha_hoy));
        v_cambio_equipamiento := TRUE;
        v_equipamiento_count := v_equipamiento_count + 1;
      END IF;
    END IF;

    -- =====================================================================
    -- UN SOLO UPDATE CONSOLIDADO
    -- =====================================================================
    IF v_cambio_estado OR v_cambio_fecha OR v_cambio_amenidades OR v_cambio_equipamiento THEN
      UPDATE propiedades_v2
      SET estado_construccion = v_nuevo_estado,
          datos_json = v_nuevo_datos_json,
          campos_bloqueados = v_nuevos_candados
      WHERE id = v_prop.id;

      v_afectadas := v_afectadas + 1;

      -- Registrar en historial (después del UPDATE exitoso)
      IF v_cambio_estado THEN
        INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id,
          usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
        VALUES (v_prop.id, 'propagacion', 'proyecto_' || p_id_proyecto,
          'Propagación desde Proyecto', 'estado_construccion',
          to_jsonb(v_prop.estado_construccion::text), to_jsonb(v_nuevo_estado::text),
          'Propagado desde proyecto: ' || v_proyecto_nombre || ' (con candado)');
      END IF;

      IF v_cambio_fecha THEN
        INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id,
          usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
        VALUES (v_prop.id, 'propagacion', 'proyecto_' || p_id_proyecto,
          'Propagación desde Proyecto', 'fecha_entrega',
          COALESCE(v_prop.datos_json->'fecha_entrega', 'null'::jsonb),
          to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM')),
          'Propagado desde proyecto: ' || v_proyecto_nombre || ' (con candado)');
      END IF;

      IF v_cambio_amenidades THEN
        INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id,
          usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
        VALUES (v_prop.id, 'propagacion', 'proyecto_' || p_id_proyecto,
          'Propagación desde Proyecto', 'amenities',
          COALESCE(v_prop.datos_json->'amenities'->'estado_amenities', '[]'::jsonb),
          v_estado_amenities_actual,
          'Propagado desde proyecto: ' || v_proyecto_nombre || ' (con candado)');
      END IF;

      IF v_cambio_equipamiento THEN
        INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id,
          usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
        VALUES (v_prop.id, 'propagacion', 'proyecto_' || p_id_proyecto,
          'Propagación desde Proyecto', 'equipamiento',
          COALESCE(v_prop.datos_json->'amenities'->'equipamiento', '[]'::jsonb),
          v_proyecto.equipamiento_base,
          'Reemplazado equipamiento con base del proyecto: ' || v_proyecto_nombre || ' (con candado)');
      END IF;
    END IF;

  END LOOP;

  -- Respuesta
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
    'saltadas_por_candado', json_build_object(
      'estado', v_estado_saltadas,
      'fecha', v_fecha_saltadas,
      'amenidades', v_amenidades_saltadas,
      'equipamiento', v_equipamiento_saltadas
    ),
    'nota', CASE
      WHEN (v_estado_saltadas + v_fecha_saltadas + v_amenidades_saltadas + v_equipamiento_saltadas) > 0
      THEN 'Algunas propiedades fueron saltadas porque tienen candados activos'
      ELSE 'Todas las propiedades fueron actualizadas con candados'
    END
  );
END;
$$;

COMMENT ON FUNCTION propagar_proyecto_a_propiedades IS
'v4.1: Fix bug de candados - UN SOLO UPDATE consolidado por propiedad.
Propaga estado, fecha, amenidades y/o equipamiento desde proyecto a propiedades.
Agrega candados automáticamente y reporta saltadas.';

-- Permisos
GRANT EXECUTE ON FUNCTION propagar_proyecto_a_propiedades(INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION propagar_proyecto_a_propiedades(INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO anon;

-- Verificación
DO $$
BEGIN
  RAISE NOTICE '✅ Migración 128: propagar_proyecto_a_propiedades() v4.1 - UN SOLO UPDATE consolidado';
END $$;
