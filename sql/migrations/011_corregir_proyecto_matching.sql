-- =====================================================
-- MIGRACIÓN 011: Acción CORREGIR para Pendientes Matching
-- =====================================================
-- Fecha: 31 Diciembre 2025
-- Propósito: Corregir nombre/GPS del proyecto sugerido y aprobar
-- =====================================================

CREATE OR REPLACE FUNCTION corregir_proyecto_matching(
    p_sugerencia_id INTEGER,
    p_nombre_nuevo VARCHAR DEFAULT NULL,
    p_gps_nuevo VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    mensaje TEXT,
    proyecto_id INTEGER,
    propiedad_actualizada BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_proyecto_id INTEGER;
    v_propiedad_id INTEGER;
    v_nombre_actual VARCHAR;
    v_lat NUMERIC;
    v_lng NUMERIC;
    v_cambios TEXT := '';
BEGIN
    -- Obtener datos de la sugerencia
    SELECT ms.proyecto_master_sugerido, ms.propiedad_id
    INTO v_proyecto_id, v_propiedad_id
    FROM matching_sugerencias ms
    WHERE ms.id = p_sugerencia_id
      AND ms.estado = 'pendiente';

    IF v_proyecto_id IS NULL THEN
        RETURN QUERY SELECT
            FALSE,
            format('Sugerencia %s no encontrada o no está pendiente', p_sugerencia_id)::TEXT,
            NULL::INTEGER,
            FALSE;
        RETURN;
    END IF;

    -- Obtener nombre actual del proyecto
    SELECT nombre_oficial INTO v_nombre_actual
    FROM proyectos_master
    WHERE id_proyecto_master = v_proyecto_id;

    -- Parsear GPS si existe
    IF p_gps_nuevo IS NOT NULL AND TRIM(p_gps_nuevo) != '' THEN
        BEGIN
            v_lat := TRIM(SPLIT_PART(p_gps_nuevo, ',', 1))::NUMERIC;
            v_lng := TRIM(SPLIT_PART(p_gps_nuevo, ',', 2))::NUMERIC;
            v_cambios := v_cambios || 'GPS ';
        EXCEPTION WHEN OTHERS THEN
            v_lat := NULL;
            v_lng := NULL;
        END;
    END IF;

    -- Registrar cambio de nombre
    IF p_nombre_nuevo IS NOT NULL AND TRIM(p_nombre_nuevo) != '' THEN
        v_cambios := v_cambios || 'nombre ';
    END IF;

    -- Actualizar proyecto
    UPDATE proyectos_master
    SET
        nombre_oficial = COALESCE(NULLIF(TRIM(p_nombre_nuevo), ''), nombre_oficial),
        latitud = COALESCE(v_lat, latitud),
        longitud = COALESCE(v_lng, longitud),
        gps_verificado_google = CASE
            WHEN v_lat IS NOT NULL THEN TRUE
            ELSE gps_verificado_google
        END,
        fuente_verificacion = CASE
            WHEN v_lat IS NOT NULL OR (p_nombre_nuevo IS NOT NULL AND TRIM(p_nombre_nuevo) != '')
            THEN 'humano_correccion'
            ELSE fuente_verificacion
        END
    WHERE id_proyecto_master = v_proyecto_id;

    -- Aprobar la sugerencia
    UPDATE matching_sugerencias
    SET estado = 'aprobado',
        revisado_por = 'humano_correccion',
        fecha_revision = NOW(),
        notas = format('Corregido: %s. Nombre original: %s',
            COALESCE(NULLIF(TRIM(v_cambios), ''), 'sin cambios'),
            v_nombre_actual)
    WHERE id = p_sugerencia_id;

    -- Asignar propiedad al proyecto
    UPDATE propiedades_v2
    SET id_proyecto_master = v_proyecto_id
    WHERE id = v_propiedad_id
      AND id_proyecto_master IS NULL;

    RETURN QUERY SELECT
        TRUE,
        format('Proyecto "%s" corregido (%s) y asignado a propiedad %s',
            COALESCE(NULLIF(TRIM(p_nombre_nuevo), ''), v_nombre_actual),
            COALESCE(NULLIF(TRIM(v_cambios), ''), 'sin cambios'),
            v_propiedad_id
        )::TEXT,
        v_proyecto_id,
        TRUE;
END;
$$;

COMMENT ON FUNCTION corregir_proyecto_matching(INTEGER, VARCHAR, VARCHAR) IS
'Corrige nombre/GPS del proyecto sugerido y aprueba la sugerencia.
Parámetros:
  - p_sugerencia_id: ID de la sugerencia pendiente
  - p_nombre_nuevo: Nuevo nombre del proyecto (opcional, de columna PROYECTO_ALTERNATIVO)
  - p_gps_nuevo: Nuevas coordenadas "lat, lng" (opcional, de columna GPS_ALTERNATIVO)
Resultado: Proyecto actualizado + sugerencia aprobada + propiedad asignada.
Usado por workflow Matching Supervisor cuando humano elige CORREGIR.';
