-- ============================================
-- Migración 104: Validación Humana de Auto-Aprobados
-- Fecha: 2026-02-01
-- Propósito: Agregar campos para tracking de validación humana
--            de matches auto-aprobados por el sistema
-- ============================================

-- 1. Agregar columnas a matching_sugerencias
ALTER TABLE matching_sugerencias
ADD COLUMN IF NOT EXISTS validacion_humana VARCHAR(20) DEFAULT NULL;
-- Valores: NULL (sin revisar), 'confirmado', 'corregido'

ALTER TABLE matching_sugerencias
ADD COLUMN IF NOT EXISTS fecha_validacion TIMESTAMPTZ;

ALTER TABLE matching_sugerencias
ADD COLUMN IF NOT EXISTS validado_por VARCHAR(100);

ALTER TABLE matching_sugerencias
ADD COLUMN IF NOT EXISTS proyecto_corregido INTEGER REFERENCES proyectos_master(id_proyecto_master);

COMMENT ON COLUMN matching_sugerencias.validacion_humana IS 'Estado de validación humana: NULL=pendiente, confirmado=match correcto, corregido=asignado otro proyecto';
COMMENT ON COLUMN matching_sugerencias.fecha_validacion IS 'Timestamp de cuando se validó';
COMMENT ON COLUMN matching_sugerencias.validado_por IS 'Identificador de quien validó (dashboard, usuario, etc)';
COMMENT ON COLUMN matching_sugerencias.proyecto_corregido IS 'Proyecto alternativo asignado si se corrigió el match';

-- 2. Índice para consultas de pendientes
CREATE INDEX IF NOT EXISTS idx_matching_sugerencias_validacion
ON matching_sugerencias(validacion_humana, estado, revisado_por)
WHERE estado = 'aprobado' AND revisado_por = 'sistema_automatico';

-- ============================================
-- 3. Función RPC: Obtener auto-aprobados para revisión
-- ============================================
CREATE OR REPLACE FUNCTION obtener_auto_aprobados_para_revision(
    p_metodo VARCHAR DEFAULT NULL,
    p_confianza_min INTEGER DEFAULT 85,
    p_confianza_max INTEGER DEFAULT 100,
    p_dias INTEGER DEFAULT 7,
    p_solo_sin_revisar BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    id_sugerencia INTEGER,
    propiedad_id INTEGER,
    url_propiedad TEXT,
    nombre_edificio TEXT,
    dormitorios INTEGER,
    area_m2 NUMERIC,
    precio_usd NUMERIC,
    fuente VARCHAR,
    proyecto_id INTEGER,
    proyecto_nombre TEXT,
    metodo_matching TEXT,
    score_confianza INTEGER,
    distancia_metros NUMERIC,
    fecha_match TIMESTAMPTZ,
    validacion_humana VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ms.id::INTEGER as id_sugerencia,
        ms.propiedad_id::INTEGER,
        p.url::TEXT as url_propiedad,
        p.nombre_edificio::TEXT,
        p.dormitorios::INTEGER,
        p.area_total_m2::NUMERIC as area_m2,
        p.precio_usd::NUMERIC,
        p.fuente::VARCHAR,
        ms.proyecto_master_sugerido::INTEGER as proyecto_id,
        pm.nombre_oficial::TEXT as proyecto_nombre,
        ms.metodo_matching::TEXT,
        ms.score_confianza::INTEGER,
        ms.distancia_metros::NUMERIC,
        ms.created_at::TIMESTAMPTZ as fecha_match,
        ms.validacion_humana::VARCHAR
    FROM matching_sugerencias ms
    JOIN propiedades_v2 p ON p.id = ms.propiedad_id
    JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
    WHERE ms.estado = 'aprobado'
      AND ms.revisado_por = 'sistema_automatico'
      AND ms.score_confianza >= p_confianza_min
      AND ms.score_confianza <= p_confianza_max
      AND ms.created_at >= NOW() - (p_dias || ' days')::INTERVAL
      AND (p_metodo IS NULL OR ms.metodo_matching = p_metodo)
      AND (NOT p_solo_sin_revisar OR ms.validacion_humana IS NULL)
    ORDER BY ms.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION obtener_auto_aprobados_para_revision IS
'Obtiene matches auto-aprobados (>=85%) para revisión humana con filtros opcionales';

-- ============================================
-- 4. Función RPC: Procesar validación
-- ============================================
CREATE OR REPLACE FUNCTION procesar_validacion_auto_aprobado(
    p_sugerencia_id INTEGER,
    p_accion VARCHAR,  -- 'confirmar', 'corregir'
    p_proyecto_alternativo INTEGER DEFAULT NULL,
    p_validado_por VARCHAR DEFAULT 'dashboard'
)
RETURNS JSONB AS $$
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
        -- Solo marcar como confirmado, no tocar la propiedad
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
        -- Validar que se proporcionó proyecto alternativo
        IF p_proyecto_alternativo IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Debe proporcionar proyecto alternativo para corregir'
            );
        END IF;

        -- Verificar que el proyecto existe
        IF NOT EXISTS (SELECT 1 FROM proyectos_master WHERE id_proyecto_master = p_proyecto_alternativo) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Proyecto alternativo no existe'
            );
        END IF;

        -- Actualizar sugerencia
        UPDATE matching_sugerencias
        SET validacion_humana = 'corregido',
            fecha_validacion = NOW(),
            validado_por = p_validado_por,
            proyecto_corregido = p_proyecto_alternativo
        WHERE id = p_sugerencia_id;

        -- Actualizar propiedad con el nuevo proyecto
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION procesar_validacion_auto_aprobado IS
'Procesa la validación humana de un match auto-aprobado: confirmar o corregir';

-- ============================================
-- 5. Función auxiliar: Contar pendientes de validación
-- ============================================
CREATE OR REPLACE FUNCTION contar_auto_aprobados_sin_validar()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM matching_sugerencias
        WHERE estado = 'aprobado'
          AND revisado_por = 'sistema_automatico'
          AND validacion_humana IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION contar_auto_aprobados_sin_validar IS
'Cuenta matches auto-aprobados pendientes de validación humana';

-- ============================================
-- 6. Grants para anon (dashboard público)
-- ============================================
GRANT EXECUTE ON FUNCTION obtener_auto_aprobados_para_revision TO anon;
GRANT EXECUTE ON FUNCTION procesar_validacion_auto_aprobado TO anon;
GRANT EXECUTE ON FUNCTION contar_auto_aprobados_sin_validar TO anon;

-- ============================================
-- FIN MIGRACIÓN 104
-- ============================================
