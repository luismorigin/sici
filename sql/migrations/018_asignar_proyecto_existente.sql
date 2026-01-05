-- =====================================================
-- MIGRACIÓN 018: Función para Asignar Proyecto Existente
-- Fecha: 5 Enero 2026
-- Propósito: Permitir asignar un proyecto ya existente
--            a una propiedad desde el Matching Supervisor
-- =====================================================

-- =====================================================
-- asignar_proyecto_existente()
-- =====================================================
-- Cuando el humano revisa una sugerencia y decide que
-- la propiedad pertenece a un proyecto diferente que
-- YA EXISTE en la base de datos.
--
-- Flujo:
-- 1. Verifica que el proyecto existe y está activo
-- 2. Asigna la propiedad a ese proyecto
-- 3. Marca la sugerencia como rechazada (la original era incorrecta)
-- 4. Opcionalmente marca la sugerencia para mejorar matching
-- =====================================================

CREATE OR REPLACE FUNCTION asignar_proyecto_existente(
    p_sugerencia_id INTEGER,
    p_propiedad_id INTEGER,
    p_proyecto_id INTEGER
)
RETURNS TABLE (
    success BOOLEAN,
    mensaje TEXT,
    proyecto_asignado INTEGER,
    nombre_proyecto TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_proyecto_nombre TEXT;
    v_proyecto_activo BOOLEAN;
    v_sugerencia_existe BOOLEAN;
BEGIN
    -- Verificar que el proyecto existe y está activo
    SELECT nombre_oficial, activo
    INTO v_proyecto_nombre, v_proyecto_activo
    FROM proyectos_master
    WHERE id_proyecto_master = p_proyecto_id;

    IF v_proyecto_nombre IS NULL THEN
        RETURN QUERY SELECT
            FALSE,
            format('Proyecto ID %s no existe', p_proyecto_id)::TEXT,
            NULL::INTEGER,
            NULL::TEXT;
        RETURN;
    END IF;

    IF NOT v_proyecto_activo THEN
        RETURN QUERY SELECT
            FALSE,
            format('Proyecto "%s" (ID %s) está inactivo', v_proyecto_nombre, p_proyecto_id)::TEXT,
            NULL::INTEGER,
            NULL::TEXT;
        RETURN;
    END IF;

    -- Verificar que la sugerencia existe
    SELECT EXISTS(
        SELECT 1 FROM matching_sugerencias WHERE id = p_sugerencia_id
    ) INTO v_sugerencia_existe;

    -- Asignar propiedad al proyecto
    UPDATE propiedades_v2
    SET
        id_proyecto_master = p_proyecto_id,
        metodo_match = 'correccion_supervisor_proyecto_existente',
        fecha_actualizacion = NOW()
    WHERE id = p_propiedad_id;

    -- Marcar sugerencia como procesada (si existe)
    IF v_sugerencia_existe THEN
        UPDATE matching_sugerencias
        SET
            estado = 'rechazado',
            revisado_por = 'humano_correccion',
            fecha_revision = NOW(),
            notas = format('Asignado manualmente a proyecto existente: %s (ID %s)',
                          v_proyecto_nombre, p_proyecto_id)
        WHERE id = p_sugerencia_id;
    END IF;

    RETURN QUERY SELECT
        TRUE,
        format('Propiedad %s asignada a "%s" (ID %s)',
               p_propiedad_id, v_proyecto_nombre, p_proyecto_id)::TEXT,
        p_proyecto_id,
        v_proyecto_nombre;
END;
$$;

COMMENT ON FUNCTION asignar_proyecto_existente(INTEGER, INTEGER, INTEGER) IS
'Asigna una propiedad a un proyecto EXISTENTE, diferente al sugerido.
Usado por Matching Supervisor cuando humano elige CORREGIR con ID numérico.
Parámetros:
  - p_sugerencia_id: ID de la sugerencia original (para marcar como rechazada)
  - p_propiedad_id: ID de la propiedad a asignar
  - p_proyecto_id: ID del proyecto existente al que asignar
Resultado: Propiedad asignada + sugerencia marcada como rechazada.';


-- =====================================================
-- VERIFICACIÓN
-- =====================================================
DO $$
DECLARE
    v_func_exists BOOLEAN;
BEGIN
    SELECT EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'asignar_proyecto_existente'
    ) INTO v_func_exists;

    IF v_func_exists THEN
        RAISE NOTICE 'Función asignar_proyecto_existente() creada correctamente';
    ELSE
        RAISE WARNING 'Error: Función no fue creada';
    END IF;
END $$;


-- =====================================================
-- EJEMPLO DE USO
-- =====================================================
/*
-- Desde workflow Matching Supervisor:
SELECT * FROM asignar_proyecto_existente(
    927,    -- sugerencia_id
    14,     -- propiedad_id
    91      -- proyecto_id existente (Alto Busch)
);

-- Resultado esperado:
-- success | mensaje | proyecto_asignado | nombre_proyecto
-- TRUE    | Propiedad 14 asignada a "Alto Busch" (ID 91) | 91 | Alto Busch
*/
