-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: funciones_auxiliares_merge.sql
-- Propósito: Funciones helper para el proceso de merge
-- Versión: 1.2.0 (Contrato semántico: filtrar por status = 'actualizado')
-- Fecha: 2024-12-13
-- =====================================================================================

-- =====================================================================================
-- FUNCIÓN 1: obtener_propiedades_pendientes_merge
-- =====================================================================================
DROP FUNCTION IF EXISTS obtener_propiedades_pendientes_merge(INTEGER);

CREATE OR REPLACE FUNCTION obtener_propiedades_pendientes_merge(
    p_limite INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    codigo_propiedad VARCHAR,
    url VARCHAR,
    fuente VARCHAR,
    status TEXT,
    tiene_discovery BOOLEAN,
    tiene_enrichment BOOLEAN,
    fecha_discovery TIMESTAMP,
    fecha_enrichment TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.codigo_propiedad,
        p.url,
        p.fuente,
        p.status::TEXT,
        (p.datos_json_discovery IS NOT NULL),
        (p.datos_json_enrichment IS NOT NULL),
        p.fecha_discovery,
        p.fecha_enrichment
    FROM propiedades_v2 p
    WHERE p.status::TEXT = 'actualizado'
      AND p.datos_json_discovery IS NOT NULL
      AND p.datos_json_enrichment IS NOT NULL
      AND p.es_activa = TRUE
    ORDER BY p.fecha_enrichment DESC NULLS LAST
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION obtener_propiedades_pendientes_merge(INTEGER) IS 
'Lista propiedades con status=actualizado listas para merge.';

-- =====================================================================================
-- FUNCIÓN 2: ejecutar_merge_batch
-- =====================================================================================
DROP FUNCTION IF EXISTS ejecutar_merge_batch(INTEGER);

CREATE OR REPLACE FUNCTION ejecutar_merge_batch(
    p_limite INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prop RECORD;
    v_resultado JSONB;
    v_exitosos INTEGER := 0;
    v_fallidos INTEGER := 0;
    v_resultados JSONB := '[]'::JSONB;
    v_inicio TIMESTAMP := NOW();
BEGIN
    FOR v_prop IN 
        SELECT p.id, p.codigo_propiedad 
        FROM propiedades_v2 p
        WHERE p.status::TEXT = 'actualizado'
          AND p.datos_json_discovery IS NOT NULL
          AND p.datos_json_enrichment IS NOT NULL
          AND p.es_activa = TRUE
        ORDER BY p.fecha_enrichment DESC NULLS LAST
        LIMIT p_limite
    LOOP
        v_resultado := merge_discovery_enrichment(v_prop.id);
        
        IF (v_resultado->>'success')::BOOLEAN THEN
            v_exitosos := v_exitosos + 1;
        ELSE
            v_fallidos := v_fallidos + 1;
        END IF;
        
        v_resultados := v_resultados || jsonb_build_object(
            'property_id', v_prop.codigo_propiedad,
            'success', (v_resultado->>'success')::BOOLEAN,
            'status', v_resultado->>'status_nuevo'
        );
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'merge_batch',
        'procesados', v_exitosos + v_fallidos,
        'exitosos', v_exitosos,
        'fallidos', v_fallidos,
        'duracion_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_inicio)),
        'resultados', v_resultados,
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION ejecutar_merge_batch(INTEGER) IS 
'Ejecuta merge en lote para propiedades con status=actualizado.';

-- =====================================================================================
-- FUNCIÓN 3: obtener_discrepancias
-- =====================================================================================
DROP FUNCTION IF EXISTS obtener_discrepancias(TEXT);

CREATE OR REPLACE FUNCTION obtener_discrepancias(
    p_filtro_campo TEXT DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    codigo_propiedad VARCHAR,
    url VARCHAR,
    fuente VARCHAR,
    campo TEXT,
    valor_discovery TEXT,
    valor_enrichment TEXT,
    fecha_merge TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.codigo_propiedad,
        p.url,
        p.fuente,
        (d.elem->>'campo')::TEXT,
        (d.elem->>'discovery')::TEXT,
        (d.elem->>'enrichment')::TEXT,
        p.fecha_merge
    FROM propiedades_v2 p,
         LATERAL jsonb_array_elements(p.discrepancias_detectadas) AS d(elem)
    WHERE p.discrepancias_detectadas IS NOT NULL
      AND jsonb_array_length(p.discrepancias_detectadas) > 0
      AND (p_filtro_campo IS NULL OR d.elem->>'campo' = p_filtro_campo)
    ORDER BY p.fecha_merge DESC;
END;
$$;

COMMENT ON FUNCTION obtener_discrepancias(TEXT) IS 
'Consulta discrepancias detectadas durante merge.';

-- =====================================================================================
-- FUNCIÓN 4: resetear_merge
-- =====================================================================================
DROP FUNCTION IF EXISTS resetear_merge(TEXT);

CREATE OR REPLACE FUNCTION resetear_merge(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prop RECORD;
    v_nuevo_status estado_propiedad;
BEGIN
    -- Buscar propiedad
    BEGIN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE id = p_identificador::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE codigo_propiedad = p_identificador;
        IF NOT FOUND THEN
            SELECT * INTO v_prop FROM propiedades_v2 WHERE url = p_identificador;
        END IF;
    END;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada',
            'identificador', p_identificador
        );
    END IF;

    -- Determinar nuevo status según CONTRATO:
    -- Si tiene enrichment → actualizado (listo para merge)
    -- Si solo tiene discovery → nueva
    IF v_prop.datos_json_enrichment IS NOT NULL THEN
        v_nuevo_status := 'actualizado'::estado_propiedad;
    ELSE
        v_nuevo_status := 'nueva'::estado_propiedad;
    END IF;

    UPDATE propiedades_v2 SET
        datos_json = NULL,
        fecha_merge = NULL,
        discrepancias_detectadas = NULL,
        campos_conflicto = '[]'::JSONB,
        cambios_merge = NULL,
        status = v_nuevo_status,
        fecha_actualizacion = NOW()
    WHERE id = v_prop.id;

    RETURN jsonb_build_object(
        'success', true,
        'operation', 'resetear_merge',
        'property_id', v_prop.codigo_propiedad,
        'internal_id', v_prop.id,
        'status_nuevo', v_nuevo_status::TEXT,
        'mensaje', 'Merge reseteado. Puede ejecutar merge_discovery_enrichment() nuevamente.',
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION resetear_merge(TEXT) IS 
'Resetea merge para re-ejecución. Si tiene enrichment → actualizado, si no → nueva.';

-- =====================================================================================
-- FUNCIÓN 5: estadisticas_merge
-- =====================================================================================
DROP FUNCTION IF EXISTS estadisticas_merge();

CREATE OR REPLACE FUNCTION estadisticas_merge()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'total_propiedades', COUNT(*),
        'por_status', jsonb_build_object(
            'nueva', COUNT(*) FILTER (WHERE status::TEXT = 'nueva'),
            'pendiente_enriquecimiento', COUNT(*) FILTER (WHERE status::TEXT = 'pendiente_enriquecimiento'),
            'actualizado', COUNT(*) FILTER (WHERE status::TEXT = 'actualizado'),
            'completado', COUNT(*) FILTER (WHERE status::TEXT = 'completado'),
            'inactivo_pending', COUNT(*) FILTER (WHERE status::TEXT = 'inactivo_pending'),
            'inactivo_confirmed', COUNT(*) FILTER (WHERE status::TEXT = 'inactivo_confirmed')
        ),
        'cobertura', jsonb_build_object(
            'con_discovery', COUNT(*) FILTER (WHERE datos_json_discovery IS NOT NULL),
            'con_enrichment', COUNT(*) FILTER (WHERE datos_json_enrichment IS NOT NULL),
            'con_merge', COUNT(*) FILTER (WHERE datos_json IS NOT NULL)
        ),
        'pendientes_merge', COUNT(*) FILTER (
            WHERE status::TEXT = 'actualizado'
            AND datos_json_discovery IS NOT NULL
            AND datos_json_enrichment IS NOT NULL
            AND es_activa = TRUE
        ),
        'por_fuente', jsonb_build_object(
            'century21', COUNT(*) FILTER (WHERE fuente = 'century21'),
            'remax', COUNT(*) FILTER (WHERE fuente = 'remax')
        ),
        'timestamp', NOW()
    ) INTO v_result
    FROM propiedades_v2;
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION estadisticas_merge() IS 
'Dashboard de métricas del proceso de merge.';

-- =====================================================================================
-- GRANTS
-- =====================================================================================
GRANT EXECUTE ON FUNCTION obtener_propiedades_pendientes_merge(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_propiedades_pendientes_merge(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION ejecutar_merge_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION ejecutar_merge_batch(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION obtener_discrepancias(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_discrepancias(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION resetear_merge(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resetear_merge(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION estadisticas_merge() TO authenticated;
GRANT EXECUTE ON FUNCTION estadisticas_merge() TO service_role;

-- =====================================================================================
-- VERIFICACIÓN
-- =====================================================================================
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count 
    FROM pg_proc 
    WHERE proname IN (
        'obtener_propiedades_pendientes_merge',
        'ejecutar_merge_batch',
        'obtener_discrepancias',
        'resetear_merge',
        'estadisticas_merge'
    );
    
    IF v_count = 5 THEN
        RAISE NOTICE '✅ 5 funciones auxiliares de merge v1.2.0 creadas';
        RAISE NOTICE '   CONTRATO: Filtran por status = actualizado';
    ELSE
        RAISE EXCEPTION '❌ Error: Solo se crearon % de 5 funciones', v_count;
    END IF;
END $$;