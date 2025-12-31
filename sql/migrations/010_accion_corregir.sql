-- =====================================================
-- MIGRACIÓN 010: Acción CORREGIR para Sin Match
-- =====================================================
-- Fecha: 30 Diciembre 2025
-- Propósito: Permitir corregir nombre/GPS de proyecto existente
--            y asignar propiedad en una sola acción
-- =====================================================

-- Actualizar función para incluir acción 'corregir'
CREATE OR REPLACE FUNCTION procesar_decision_sin_match(
    p_propiedad_id INTEGER,
    p_accion VARCHAR,  -- 'asignar', 'crear', 'sin_proyecto', 'corregir'
    p_proyecto_id INTEGER DEFAULT NULL,
    p_nombre_proyecto VARCHAR DEFAULT NULL,
    p_gps_nuevo VARCHAR DEFAULT NULL,
    p_notas TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    mensaje TEXT,
    proyecto_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_proyecto_id INTEGER;
    v_resultado RECORD;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_nombre_actual VARCHAR;
BEGIN
    CASE p_accion
        WHEN 'asignar' THEN
            -- Asignar proyecto existente
            IF p_proyecto_id IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para asignar'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            UPDATE propiedades_v2
            SET id_proyecto_master = p_proyecto_id
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'asignado',
                proyecto_asignado = p_proyecto_id,
                fecha_procesado = NOW(),
                notas = p_notas
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Proyecto asignado correctamente'::TEXT, p_proyecto_id;

        WHEN 'corregir' THEN
            -- Corregir proyecto existente y asignar
            IF p_proyecto_id IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para corregir'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            -- Obtener nombre actual del proyecto
            SELECT nombre_oficial INTO v_nombre_actual
            FROM proyectos_master
            WHERE id_proyecto_master = p_proyecto_id;

            IF v_nombre_actual IS NULL THEN
                RETURN QUERY SELECT FALSE, format('Proyecto ID %s no existe', p_proyecto_id)::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            -- Parsear GPS si existe
            IF p_gps_nuevo IS NOT NULL AND p_gps_nuevo != '' THEN
                BEGIN
                    v_lat := TRIM(SPLIT_PART(p_gps_nuevo, ',', 1))::NUMERIC;
                    v_lng := TRIM(SPLIT_PART(p_gps_nuevo, ',', 2))::NUMERIC;
                EXCEPTION WHEN OTHERS THEN
                    v_lat := NULL;
                    v_lng := NULL;
                END;
            END IF;

            -- Actualizar proyecto
            UPDATE proyectos_master
            SET
                nombre_oficial = COALESCE(NULLIF(TRIM(p_nombre_proyecto), ''), nombre_oficial),
                latitud = COALESCE(v_lat, latitud),
                longitud = COALESCE(v_lng, longitud),
                gps_verificado_google = CASE
                    WHEN v_lat IS NOT NULL THEN TRUE
                    ELSE gps_verificado_google
                END,
                fuente_verificacion = CASE
                    WHEN v_lat IS NOT NULL OR p_nombre_proyecto IS NOT NULL
                    THEN 'humano_correccion'
                    ELSE fuente_verificacion
                END
            WHERE id_proyecto_master = p_proyecto_id;

            -- Asignar propiedad al proyecto
            UPDATE propiedades_v2
            SET id_proyecto_master = p_proyecto_id
            WHERE id = p_propiedad_id;

            -- Registrar en tracking
            UPDATE sin_match_exportados
            SET estado = 'corregido',
                proyecto_asignado = p_proyecto_id,
                fecha_procesado = NOW(),
                notas = format('Corregido: %s. %s',
                    CASE
                        WHEN p_nombre_proyecto IS NOT NULL AND v_lat IS NOT NULL THEN 'nombre + GPS'
                        WHEN p_nombre_proyecto IS NOT NULL THEN 'nombre'
                        WHEN v_lat IS NOT NULL THEN 'GPS'
                        ELSE 'sin cambios'
                    END,
                    COALESCE(p_notas, ''))
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT
                TRUE,
                format('Proyecto "%s" corregido y asignado. Cambios: %s%s',
                    COALESCE(NULLIF(TRIM(p_nombre_proyecto), ''), v_nombre_actual),
                    CASE WHEN p_nombre_proyecto IS NOT NULL THEN 'nombre ' ELSE '' END,
                    CASE WHEN v_lat IS NOT NULL THEN 'GPS' ELSE '' END
                )::TEXT,
                p_proyecto_id;

        WHEN 'crear' THEN
            -- Crear proyecto nuevo usando función existente
            IF p_nombre_proyecto IS NULL OR p_nombre_proyecto = '' THEN
                RETURN QUERY SELECT FALSE, 'nombre_proyecto requerido para crear'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            -- Reutilizar crear_proyecto_desde_sugerencia
            SELECT * INTO v_resultado
            FROM crear_proyecto_desde_sugerencia(
                p_nombre_proyecto,
                p_propiedad_id,
                0,  -- sugerencia_id dummy
                COALESCE(p_gps_nuevo, '')
            );

            v_proyecto_id := v_resultado.proyecto_id;

            UPDATE sin_match_exportados
            SET estado = 'creado',
                proyecto_asignado = v_proyecto_id,
                fecha_procesado = NOW(),
                notas = p_notas
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, v_resultado.mensaje, v_proyecto_id;

        WHEN 'sin_proyecto' THEN
            -- Marcar como sin proyecto
            UPDATE propiedades_v2
            SET es_para_matching = FALSE
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'sin_proyecto',
                fecha_procesado = NOW(),
                notas = COALESCE(p_notas, 'Marcado como propiedad sin edificio')
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Propiedad marcada como sin proyecto'::TEXT, NULL::INTEGER;

        ELSE
            RETURN QUERY SELECT FALSE, 'Acción no válida: ' || p_accion, NULL::INTEGER;
    END CASE;
END;
$$;

COMMENT ON FUNCTION procesar_decision_sin_match(INTEGER, VARCHAR, INTEGER, VARCHAR, VARCHAR, TEXT) IS
'Procesa decisión humana del Sheet Sin Match.
Acciones:
  - asignar: proyecto existente
  - corregir: actualiza nombre/GPS del proyecto y asigna
  - crear: proyecto nuevo
  - sin_proyecto: no aplica matching
Para corregir: p_proyecto_id = ID a corregir, p_nombre_proyecto = nuevo nombre (opcional), p_gps_nuevo = nuevo GPS (opcional)';
