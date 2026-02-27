-- Función: procesar_validacion_auto_aprobado
-- Última migración: 113
-- Exportado de producción: 27 Feb 2026
-- Dominio: HITL / Validación Auto-aprobados
-- Acciones: confirmar, corregir
-- SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.procesar_validacion_auto_aprobado(p_sugerencia_id integer, p_accion character varying, p_proyecto_alternativo integer DEFAULT NULL::integer, p_validado_por character varying DEFAULT 'dashboard'::character varying)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_sugerencia RECORD;
    v_propiedad_id INTEGER;
    v_resultado JSONB;
BEGIN
    -- Obtener la sugerencia
    SELECT * INTO v_sugerencia
    FROM matching_sugerencias
    WHERE id = p_sugerencia_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Sugerencia no encontrada'
        );
    END IF;

    v_propiedad_id := v_sugerencia.propiedad_id;

    -- Procesar según acción
    IF p_accion = 'confirmar' THEN
        UPDATE matching_sugerencias
        SET validacion_humana = 'confirmado',
            fecha_validacion = NOW(),
            validado_por = p_validado_por
        WHERE id = p_sugerencia_id;

        v_resultado := jsonb_build_object(
            'success', true,
            'accion', 'confirmado',
            'sugerencia_id', p_sugerencia_id,
            'propiedad_id', v_propiedad_id
        );

    ELSIF p_accion = 'corregir' THEN
        IF p_proyecto_alternativo IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Debe proporcionar proyecto alternativo para corregir'
            );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM proyectos_master WHERE id_proyecto_master = p_proyecto_alternativo) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Proyecto alternativo no existe'
            );
        END IF;

        UPDATE matching_sugerencias
        SET validacion_humana = 'corregido',
            fecha_validacion = NOW(),
            validado_por = p_validado_por,
            proyecto_corregido = p_proyecto_alternativo
        WHERE id = p_sugerencia_id;

        UPDATE propiedades_v2
        SET id_proyecto_master = p_proyecto_alternativo,
            metodo_match = 'correccion_humana',
            fecha_actualizacion = NOW()
        WHERE id = v_propiedad_id;

        v_resultado := jsonb_build_object(
            'success', true,
            'accion', 'corregido',
            'sugerencia_id', p_sugerencia_id,
            'propiedad_id', v_propiedad_id,
            'proyecto_anterior', v_sugerencia.proyecto_master_sugerido,
            'proyecto_nuevo', p_proyecto_alternativo
        );

    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acción no válida. Use: confirmar, corregir'
        );
    END IF;

    RETURN v_resultado;
END;
$function$;
