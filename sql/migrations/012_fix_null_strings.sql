-- =====================================================
-- MIGRACIÓN 012: Fix strings "null" de n8n
-- =====================================================
-- Fecha: 31 Diciembre 2025
-- Propósito: Cambiar p_proyecto_id a TEXT para manejar "null" de n8n
-- =====================================================

-- Eliminar función anterior (firma diferente)
DROP FUNCTION IF EXISTS procesar_decision_sin_match(INTEGER, VARCHAR, INTEGER, VARCHAR, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION procesar_decision_sin_match(
    p_propiedad_id INTEGER,
    p_accion VARCHAR,
    p_proyecto_id TEXT DEFAULT NULL,  -- Cambiado a TEXT para manejar "null" string
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
    v_proyecto_id_parsed INTEGER;
    v_resultado RECORD;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_nombre_actual VARCHAR;
    -- Variables limpias
    v_nombre_clean VARCHAR;
    v_gps_clean VARCHAR;
    v_notas_clean TEXT;
BEGIN
    -- Limpiar inputs: convertir string "null" a NULL real
    v_nombre_clean := NULLIF(NULLIF(TRIM(COALESCE(p_nombre_proyecto, '')), ''), 'null');
    v_gps_clean := NULLIF(NULLIF(TRIM(COALESCE(p_gps_nuevo, '')), ''), 'null');
    v_notas_clean := NULLIF(NULLIF(TRIM(COALESCE(p_notas, '')), ''), 'null');

    -- Parsear proyecto_id de TEXT a INTEGER (maneja "null", "", NULL)
    BEGIN
        v_proyecto_id_parsed := NULLIF(NULLIF(TRIM(COALESCE(p_proyecto_id, '')), ''), 'null')::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        v_proyecto_id_parsed := NULL;
    END;

    CASE p_accion
        WHEN 'asignar' THEN
            IF v_proyecto_id_parsed IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para asignar'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            UPDATE propiedades_v2
            SET id_proyecto_master = v_proyecto_id_parsed
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'asignado',
                proyecto_asignado = v_proyecto_id_parsed,
                fecha_procesado = NOW(),
                notas = v_notas_clean
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Proyecto asignado correctamente'::TEXT, v_proyecto_id_parsed;

        WHEN 'corregir' THEN
            IF v_proyecto_id_parsed IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para corregir'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            SELECT nombre_oficial INTO v_nombre_actual
            FROM proyectos_master
            WHERE id_proyecto_master = v_proyecto_id_parsed;

            IF v_nombre_actual IS NULL THEN
                RETURN QUERY SELECT FALSE, format('Proyecto ID %s no existe', v_proyecto_id_parsed)::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            -- Parsear GPS si existe
            IF v_gps_clean IS NOT NULL THEN
                BEGIN
                    v_lat := TRIM(SPLIT_PART(v_gps_clean, ',', 1))::NUMERIC;
                    v_lng := TRIM(SPLIT_PART(v_gps_clean, ',', 2))::NUMERIC;
                EXCEPTION WHEN OTHERS THEN
                    v_lat := NULL;
                    v_lng := NULL;
                END;
            END IF;

            -- Actualizar proyecto
            UPDATE proyectos_master
            SET
                nombre_oficial = COALESCE(v_nombre_clean, nombre_oficial),
                latitud = COALESCE(v_lat, latitud),
                longitud = COALESCE(v_lng, longitud),
                gps_verificado_google = CASE
                    WHEN v_lat IS NOT NULL THEN TRUE
                    ELSE gps_verificado_google
                END,
                fuente_verificacion = CASE
                    WHEN v_lat IS NOT NULL OR v_nombre_clean IS NOT NULL
                    THEN 'humano_correccion'
                    ELSE fuente_verificacion
                END
            WHERE id_proyecto_master = v_proyecto_id_parsed;

            -- Asignar propiedad
            UPDATE propiedades_v2
            SET id_proyecto_master = v_proyecto_id_parsed
            WHERE id = p_propiedad_id;

            -- Registrar en tracking
            UPDATE sin_match_exportados
            SET estado = 'corregido',
                proyecto_asignado = v_proyecto_id_parsed,
                fecha_procesado = NOW(),
                notas = format('Corregido: %s. %s',
                    CASE
                        WHEN v_nombre_clean IS NOT NULL AND v_lat IS NOT NULL THEN 'nombre + GPS'
                        WHEN v_nombre_clean IS NOT NULL THEN 'nombre'
                        WHEN v_lat IS NOT NULL THEN 'GPS'
                        ELSE 'sin cambios'
                    END,
                    COALESCE(v_notas_clean, ''))
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT
                TRUE,
                format('Proyecto "%s" corregido y asignado. Cambios: %s%s',
                    COALESCE(v_nombre_clean, v_nombre_actual),
                    CASE WHEN v_nombre_clean IS NOT NULL THEN 'nombre ' ELSE '' END,
                    CASE WHEN v_lat IS NOT NULL THEN 'GPS' ELSE '' END
                )::TEXT,
                v_proyecto_id_parsed;

        WHEN 'crear' THEN
            IF v_nombre_clean IS NULL THEN
                RETURN QUERY SELECT FALSE, 'nombre_proyecto requerido para crear'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            SELECT * INTO v_resultado
            FROM crear_proyecto_desde_sugerencia(
                v_nombre_clean,
                p_propiedad_id,
                0,
                COALESCE(v_gps_clean, '')
            );

            v_proyecto_id := v_resultado.proyecto_id;

            UPDATE sin_match_exportados
            SET estado = 'creado',
                proyecto_asignado = v_proyecto_id,
                fecha_procesado = NOW(),
                notas = v_notas_clean
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, v_resultado.mensaje, v_proyecto_id;

        WHEN 'sin_proyecto' THEN
            UPDATE propiedades_v2
            SET es_para_matching = FALSE
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'sin_proyecto',
                fecha_procesado = NOW(),
                notas = COALESCE(v_notas_clean, 'Marcado como propiedad sin edificio')
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Propiedad marcada como sin proyecto'::TEXT, NULL::INTEGER;

        ELSE
            RETURN QUERY SELECT FALSE, 'Acción no válida: ' || p_accion, NULL::INTEGER;
    END CASE;
END;
$$;

COMMENT ON FUNCTION procesar_decision_sin_match(INTEGER, VARCHAR, TEXT, VARCHAR, VARCHAR, TEXT) IS
'Procesa decisión humana del Sheet Sin Match.
Acciones: asignar, corregir, crear, sin_proyecto.
p_proyecto_id es TEXT para manejar el string "null" que envía n8n.';
