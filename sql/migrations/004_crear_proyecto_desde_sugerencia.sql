-- =====================================================
-- MIGRACIÓN 004: crear_proyecto_desde_sugerencia
-- =====================================================
-- Fecha: 29 Diciembre 2025
-- Propósito: Función RPC para crear proyectos nuevos desde sugerencias humanas
-- Uso: Workflow Matching Supervisor - Proyecto Alternativo
-- =====================================================

-- Crear la función
CREATE OR REPLACE FUNCTION crear_proyecto_desde_sugerencia(
    p_nombre_proyecto TEXT,
    p_propiedad_id INTEGER,
    p_sugerencia_id INTEGER
)
RETURNS TABLE(
    proyecto_id INTEGER,
    proyecto_creado BOOLEAN,
    nueva_sugerencia_id INTEGER,
    mensaje TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_proyecto_existente INTEGER;
    v_nuevo_proyecto_id INTEGER;
    v_nueva_sugerencia_id INTEGER;
    v_zona TEXT;
    v_lat NUMERIC;
    v_lng NUMERIC;
BEGIN
    -- Normalizar nombre
    p_nombre_proyecto := TRIM(UPPER(p_nombre_proyecto));

    IF p_nombre_proyecto IS NULL OR p_nombre_proyecto = '' THEN
        RETURN QUERY SELECT
            NULL::INTEGER,
            FALSE,
            NULL::INTEGER,
            'Nombre de proyecto vacío'::TEXT;
        RETURN;
    END IF;

    -- 1. Verificar si ya existe el proyecto
    SELECT id_proyecto_master INTO v_proyecto_existente
    FROM proyectos_master
    WHERE UPPER(nombre_oficial) = p_nombre_proyecto
    LIMIT 1;

    -- 2. Si existe, crear sugerencia apuntando al existente
    IF v_proyecto_existente IS NOT NULL THEN
        -- Verificar que no existe ya una sugerencia para esta combinación
        IF EXISTS (
            SELECT 1 FROM matching_sugerencias
            WHERE propiedad_id = p_propiedad_id
              AND proyecto_master_sugerido = v_proyecto_existente
              AND estado IN ('pendiente', 'aprobado')
        ) THEN
            RETURN QUERY SELECT
                v_proyecto_existente,
                FALSE,
                NULL::INTEGER,
                'Ya existe sugerencia para este proyecto'::TEXT;
            RETURN;
        END IF;

        -- Crear nueva sugerencia con proyecto existente
        INSERT INTO matching_sugerencias (
            propiedad_id,
            proyecto_master_sugerido,
            metodo_matching,
            score_confianza,
            estado,
            revisado_por,
            notas
        )
        VALUES (
            p_propiedad_id,
            v_proyecto_existente,
            'humano_alternativo',
            95,
            'pendiente',
            NULL,
            format('Proyecto alternativo sugerido por humano. Sugerencia original ID: %s', p_sugerencia_id)
        )
        RETURNING id INTO v_nueva_sugerencia_id;

        RETURN QUERY SELECT
            v_proyecto_existente,
            FALSE,
            v_nueva_sugerencia_id,
            format('Proyecto existente. Nueva sugerencia ID %s creada', v_nueva_sugerencia_id)::TEXT;
        RETURN;
    END IF;

    -- 3. Proyecto no existe, obtener datos de la propiedad para heredar zona/GPS
    SELECT
        COALESCE(p.zona, 'Sin zona'),
        p.latitud,
        p.longitud
    INTO v_zona, v_lat, v_lng
    FROM propiedades_v2 p
    WHERE p.id = p_propiedad_id;

    -- 4. Crear proyecto nuevo
    INSERT INTO proyectos_master (
        nombre_oficial,
        zona,
        latitud,
        longitud,
        fuente_verificacion,
        notas,
        activo
    )
    VALUES (
        p_nombre_proyecto,
        v_zona,
        v_lat,
        v_lng,
        'humano_propuesto',
        format('Creado desde sugerencia humana. Propiedad origen ID: %s. Requiere verificación GPS.', p_propiedad_id),
        TRUE
    )
    RETURNING id_proyecto_master INTO v_nuevo_proyecto_id;

    -- 5. Crear sugerencia de matching con alta confianza
    INSERT INTO matching_sugerencias (
        propiedad_id,
        proyecto_master_sugerido,
        metodo_matching,
        score_confianza,
        estado,
        revisado_por,
        notas
    )
    VALUES (
        p_propiedad_id,
        v_nuevo_proyecto_id,
        'humano_alternativo',
        95,
        'pendiente',
        NULL,
        format('Proyecto nuevo creado por humano. Sugerencia original rechazada ID: %s', p_sugerencia_id)
    )
    RETURNING id INTO v_nueva_sugerencia_id;

    RETURN QUERY SELECT
        v_nuevo_proyecto_id,
        TRUE,
        v_nueva_sugerencia_id,
        format('Proyecto "%s" creado (ID %s). Nueva sugerencia ID %s', p_nombre_proyecto, v_nuevo_proyecto_id, v_nueva_sugerencia_id)::TEXT;
END;
$$;

COMMENT ON FUNCTION crear_proyecto_desde_sugerencia(TEXT, INTEGER, INTEGER) IS
'Crea un proyecto nuevo en proyectos_master desde una sugerencia humana.
Si el proyecto ya existe, crea sugerencia apuntando al existente.
Siempre crea nueva sugerencia con 95% confianza para revisión.
Usado por workflow Matching Supervisor cuando humano escribe PROYECTO_ALTERNATIVO.';

-- Verificar que la función existe
SELECT 'crear_proyecto_desde_sugerencia' as funcion_creada;
