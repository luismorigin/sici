-- Función: procesar_decision_sin_match (2 overloads: INTEGER y TEXT)
-- Última migración: 010
-- Exportado de producción: 27 Feb 2026
-- Dominio: HITL / Supervisión Sin Match
-- Acciones: asignar, corregir, crear, sin_proyecto

-- =============================================
-- OVERLOAD 1: p_proyecto_id INTEGER
-- =============================================
CREATE OR REPLACE FUNCTION public.procesar_decision_sin_match(p_propiedad_id integer, p_accion character varying, p_proyecto_id integer DEFAULT NULL::integer, p_nombre_proyecto character varying DEFAULT NULL::character varying, p_gps_nuevo character varying DEFAULT NULL::character varying, p_notas text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, mensaje text, proyecto_id integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_proyecto_id INTEGER;
    v_resultado RECORD;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_nombre_actual VARCHAR;
    v_nombre_clean VARCHAR;
    v_gps_clean VARCHAR;
    v_notas_clean TEXT;
BEGIN
    -- Limpiar strings "null" que vienen de n8n
    v_nombre_clean := NULLIF(NULLIF(TRIM(COALESCE(p_nombre_proyecto, '')), ''), 'null');
    v_gps_clean := NULLIF(NULLIF(TRIM(COALESCE(p_gps_nuevo, '')), ''), 'null');
    v_notas_clean := NULLIF(NULLIF(TRIM(COALESCE(p_notas, '')), ''), 'null');

    CASE p_accion
        WHEN 'asignar' THEN
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
                notas = v_notas_clean
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Proyecto asignado correctamente'::TEXT, p_proyecto_id;

        WHEN 'corregir' THEN
            IF p_proyecto_id IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para corregir'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            SELECT nombre_oficial INTO v_nombre_actual
            FROM proyectos_master
            WHERE id_proyecto_master = p_proyecto_id;

            IF v_nombre_actual IS NULL THEN
                RETURN QUERY SELECT FALSE, format('Proyecto ID %s no existe', p_proyecto_id)::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            IF v_gps_clean IS NOT NULL THEN
                BEGIN
                    v_lat := TRIM(SPLIT_PART(v_gps_clean, ',', 1))::NUMERIC;
                    v_lng := TRIM(SPLIT_PART(v_gps_clean, ',', 2))::NUMERIC;
                EXCEPTION WHEN OTHERS THEN
                    v_lat := NULL;
                    v_lng := NULL;
                END;
            END IF;

            UPDATE proyectos_master
            SET
                nombre_oficial = COALESCE(v_nombre_clean, nombre_oficial),
                latitud = COALESCE(v_lat, latitud),
                longitud = COALESCE(v_lng, longitud),
                gps_verificado_google = CASE WHEN v_lat IS NOT NULL THEN TRUE ELSE gps_verificado_google END,
                fuente_verificacion = CASE WHEN v_lat IS NOT NULL OR v_nombre_clean IS NOT NULL THEN 'humano_correccion' ELSE fuente_verificacion END
            WHERE id_proyecto_master = p_proyecto_id;

            UPDATE propiedades_v2
            SET id_proyecto_master = p_proyecto_id
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'corregido',
                proyecto_asignado = p_proyecto_id,
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
                format('Proyecto "%s" corregido y asignado',
                    COALESCE(v_nombre_clean, v_nombre_actual))::TEXT,
                p_proyecto_id;

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
$function$;

-- =============================================
-- OVERLOAD 2: p_proyecto_id_text TEXT (para n8n)
-- =============================================
CREATE OR REPLACE FUNCTION public.procesar_decision_sin_match(p_propiedad_id integer, p_accion character varying, p_proyecto_id_text text DEFAULT NULL::text, p_nombre_proyecto character varying DEFAULT NULL::character varying, p_gps_nuevo character varying DEFAULT NULL::character varying, p_notas text DEFAULT NULL::text)
 RETURNS TABLE(success boolean, mensaje text, proyecto_id integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_proyecto_id INTEGER;
    v_resultado RECORD;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_nombre_actual VARCHAR;
    v_nombre_clean VARCHAR;
    v_gps_clean VARCHAR;
    v_notas_clean TEXT;
    p_proyecto_id INTEGER;
BEGIN
    -- Limpiar strings "null" que vienen de n8n
    v_nombre_clean := NULLIF(NULLIF(TRIM(COALESCE(p_nombre_proyecto, '')), ''), 'null');
    v_gps_clean := NULLIF(NULLIF(TRIM(COALESCE(p_gps_nuevo, '')), ''), 'null');
    v_notas_clean := NULLIF(NULLIF(TRIM(COALESCE(p_notas, '')), ''), 'null');

    -- Convertir proyecto_id de TEXT a INTEGER, manejando "null"
    IF p_proyecto_id_text IS NULL OR TRIM(p_proyecto_id_text) = '' OR LOWER(TRIM(p_proyecto_id_text)) = 'null' THEN
        p_proyecto_id := NULL;
    ELSE
        p_proyecto_id := p_proyecto_id_text::INTEGER;
    END IF;

    CASE p_accion
        WHEN 'asignar' THEN
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
                notas = v_notas_clean
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Proyecto asignado correctamente'::TEXT, p_proyecto_id;

        WHEN 'corregir' THEN
            IF p_proyecto_id IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para corregir'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            SELECT nombre_oficial INTO v_nombre_actual
            FROM proyectos_master
            WHERE id_proyecto_master = p_proyecto_id;

            IF v_nombre_actual IS NULL THEN
                RETURN QUERY SELECT FALSE, format('Proyecto ID %s no existe', p_proyecto_id)::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            IF v_gps_clean IS NOT NULL THEN
                BEGIN
                    v_lat := TRIM(SPLIT_PART(v_gps_clean, ',', 1))::NUMERIC;
                    v_lng := TRIM(SPLIT_PART(v_gps_clean, ',', 2))::NUMERIC;
                EXCEPTION WHEN OTHERS THEN
                    v_lat := NULL;
                    v_lng := NULL;
                END;
            END IF;

            UPDATE proyectos_master
            SET
                nombre_oficial = COALESCE(v_nombre_clean, nombre_oficial),
                latitud = COALESCE(v_lat, latitud),
                longitud = COALESCE(v_lng, longitud),
                gps_verificado_google = CASE WHEN v_lat IS NOT NULL THEN TRUE ELSE gps_verificado_google END,
                fuente_verificacion = CASE WHEN v_lat IS NOT NULL OR v_nombre_clean IS NOT NULL THEN 'humano_correccion' ELSE fuente_verificacion END
            WHERE id_proyecto_master = p_proyecto_id;

            UPDATE propiedades_v2
            SET id_proyecto_master = p_proyecto_id
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'corregido',
                proyecto_asignado = p_proyecto_id,
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
                format('Proyecto "%s" corregido y asignado',
                    COALESCE(v_nombre_clean, v_nombre_actual))::TEXT,
                p_proyecto_id;

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
$function$;
