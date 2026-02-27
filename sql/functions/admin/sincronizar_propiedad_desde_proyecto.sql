-- Función: sincronizar_propiedad_desde_proyecto
-- Última migración: 108
-- Exportado de producción: 27 Feb 2026
-- Dominio: Admin / Sincronizar una propiedad individual desde su proyecto
-- SECURITY DEFINER
-- A diferencia de propagar (batch), esta REEMPLAZA amenidades (no merge)

CREATE OR REPLACE FUNCTION public.sincronizar_propiedad_desde_proyecto(p_id_propiedad integer, p_id_proyecto integer, p_sincronizar_estado boolean DEFAULT false, p_sincronizar_fecha boolean DEFAULT false, p_sincronizar_amenidades boolean DEFAULT false, p_sincronizar_equipamiento boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  SELECT id, id_proyecto_master, estado_construccion, datos_json
  INTO v_propiedad FROM propiedades_v2 WHERE id = p_id_propiedad;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Propiedad no encontrada');
  END IF;

  IF v_propiedad.id_proyecto_master != p_id_proyecto THEN
    RETURN json_build_object('success', false, 'error', 'La propiedad no pertenece al proyecto especificado');
  END IF;

  SELECT nombre_oficial, estado_construccion, fecha_entrega, amenidades_edificio, equipamiento_base
  INTO v_proyecto FROM proyectos_master WHERE id_proyecto_master = p_id_proyecto;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Proyecto no encontrado');
  END IF;

  v_proyecto_nombre := v_proyecto.nombre_oficial;

  -- ESTADO
  IF p_sincronizar_estado AND v_proyecto.estado_construccion IS NOT NULL THEN
    v_estado_enum := v_proyecto.estado_construccion::estado_construccion_enum;
    UPDATE propiedades_v2 SET estado_construccion = v_estado_enum WHERE id = p_id_propiedad;
    INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id, usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
    VALUES (p_id_propiedad, 'sincronizacion', 'proyecto_' || p_id_proyecto, 'Sincronización desde Proyecto',
      'estado_construccion', to_jsonb(v_propiedad.estado_construccion::text), to_jsonb(v_estado_enum::text),
      'Sincronizado desde proyecto: ' || v_proyecto_nombre);
    v_cambios_realizados := v_cambios_realizados || jsonb_build_object('estado_construccion',
      jsonb_build_object('anterior', v_propiedad.estado_construccion::text, 'nuevo', v_estado_enum::text));
  END IF;

  -- FECHA
  IF p_sincronizar_fecha AND v_proyecto.fecha_entrega IS NOT NULL THEN
    UPDATE propiedades_v2 SET datos_json = jsonb_set(COALESCE(datos_json, '{}'::jsonb), '{fecha_entrega}',
      to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM'))) WHERE id = p_id_propiedad;
    INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id, usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
    VALUES (p_id_propiedad, 'sincronizacion', 'proyecto_' || p_id_proyecto, 'Sincronización desde Proyecto',
      'fecha_entrega', COALESCE(v_propiedad.datos_json->'fecha_entrega', 'null'::jsonb),
      to_jsonb(to_char(v_proyecto.fecha_entrega, 'YYYY-MM')), 'Sincronizado desde proyecto: ' || v_proyecto_nombre);
    v_cambios_realizados := v_cambios_realizados || jsonb_build_object('fecha_entrega',
      jsonb_build_object('anterior', v_propiedad.datos_json->>'fecha_entrega', 'nuevo', to_char(v_proyecto.fecha_entrega, 'YYYY-MM')));
  END IF;

  -- AMENIDADES (REEMPLAZA)
  IF p_sincronizar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL
     AND jsonb_typeof(v_proyecto.amenidades_edificio) = 'array' AND jsonb_array_length(v_proyecto.amenidades_edificio) > 0 THEN
    IF jsonb_typeof(v_propiedad.datos_json->'amenities'->'lista') = 'array' THEN
      v_amenidades_anteriores := v_propiedad.datos_json->'amenities'->'lista';
    ELSE v_amenidades_anteriores := '[]'::jsonb; END IF;

    v_nuevas_amenidades := v_proyecto.amenidades_edificio;
    v_estado_amenities_nuevo := '{}'::jsonb;
    FOR v_amenidad IN SELECT jsonb_array_elements_text(v_proyecto.amenidades_edificio) LOOP
      v_estado_amenities_nuevo := v_estado_amenities_nuevo || jsonb_build_object(
        v_amenidad, jsonb_build_object('valor', 'por_confirmar', 'fuente', 'proyecto_master', 'confianza', 'media'));
    END LOOP;

    UPDATE propiedades_v2 SET datos_json = jsonb_set(jsonb_set(
      COALESCE(datos_json, '{"amenities":{}}'::jsonb), '{amenities,lista}', v_nuevas_amenidades),
      '{amenities,estado_amenities}', v_estado_amenities_nuevo) WHERE id = p_id_propiedad;
    INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id, usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
    VALUES (p_id_propiedad, 'sincronizacion', 'proyecto_' || p_id_proyecto, 'Sincronización desde Proyecto',
      'amenities', v_amenidades_anteriores, v_nuevas_amenidades, 'Reemplazado amenidades desde proyecto: ' || v_proyecto_nombre);
    v_cambios_realizados := v_cambios_realizados || jsonb_build_object('amenidades',
      jsonb_build_object('anterior_count', jsonb_array_length(v_amenidades_anteriores), 'nuevo_count', jsonb_array_length(v_nuevas_amenidades)));
  END IF;

  -- EQUIPAMIENTO (REEMPLAZA)
  IF p_sincronizar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL
     AND jsonb_typeof(v_proyecto.equipamiento_base) = 'array' AND jsonb_array_length(v_proyecto.equipamiento_base) > 0 THEN
    IF jsonb_typeof(v_propiedad.datos_json->'amenities'->'equipamiento') = 'array' THEN
      v_equipamiento_anterior := v_propiedad.datos_json->'amenities'->'equipamiento';
    ELSE v_equipamiento_anterior := '[]'::jsonb; END IF;

    UPDATE propiedades_v2 SET datos_json = jsonb_set(jsonb_set(
      COALESCE(datos_json, '{}'::jsonb), '{amenities}', COALESCE(datos_json->'amenities', '{}'::jsonb)),
      '{amenities,equipamiento}', v_proyecto.equipamiento_base) WHERE id = p_id_propiedad;
    INSERT INTO propiedades_v2_historial (propiedad_id, usuario_tipo, usuario_id, usuario_nombre, campo, valor_anterior, valor_nuevo, motivo)
    VALUES (p_id_propiedad, 'sincronizacion', 'proyecto_' || p_id_proyecto, 'Sincronización desde Proyecto',
      'equipamiento', v_equipamiento_anterior, v_proyecto.equipamiento_base,
      'Reemplazado equipamiento desde proyecto: ' || v_proyecto_nombre);
    v_cambios_realizados := v_cambios_realizados || jsonb_build_object('equipamiento',
      jsonb_build_object('anterior_count', jsonb_array_length(v_equipamiento_anterior), 'nuevo_count', jsonb_array_length(v_proyecto.equipamiento_base)));
  END IF;

  RETURN json_build_object(
    'success', true, 'propiedad_id', p_id_propiedad, 'proyecto_id', p_id_proyecto,
    'proyecto_nombre', v_proyecto_nombre, 'cambios', v_cambios_realizados,
    'detalle', json_build_object(
      'estado_sincronizado', p_sincronizar_estado AND v_proyecto.estado_construccion IS NOT NULL,
      'fecha_sincronizada', p_sincronizar_fecha AND v_proyecto.fecha_entrega IS NOT NULL,
      'amenidades_sincronizadas', p_sincronizar_amenidades AND v_proyecto.amenidades_edificio IS NOT NULL,
      'equipamiento_sincronizado', p_sincronizar_equipamiento AND v_proyecto.equipamiento_base IS NOT NULL));
END;
$function$;
