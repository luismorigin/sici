-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: funciones_auxiliares_merge.sql
-- Propósito: Funciones de utilidad para el proceso de merge
-- Versión: 2.0.0 (Compatible con merge_discovery_enrichment v2.0.0)
-- Fecha: 2025-12-23
-- =====================================================================================

-- =====================================================================================
-- FUNCIÓN 1: obtener_propiedades_pendientes_merge
-- =====================================================================================
-- Lista propiedades que están listas para merge
-- Criterios: status IN ('nueva', 'actualizado'), con discovery, activa
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
    fecha_enrichment TIMESTAMP,
    fecha_ultimo_merge TIMESTAMP
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
        p.fecha_enrichment,
        p.fecha_merge
    FROM propiedades_v2 p
    WHERE p.status::TEXT IN ('nueva', 'actualizado')  -- Status válidos para merge
      AND p.datos_json_discovery IS NOT NULL          -- Debe tener discovery
      AND p.es_activa = TRUE                          -- Solo activas
    ORDER BY 
        -- Priorizar: con enrichment primero, luego por fecha
        CASE WHEN p.datos_json_enrichment IS NOT NULL THEN 0 ELSE 1 END,
        p.fecha_enrichment DESC NULLS LAST,
        p.fecha_discovery DESC NULLS LAST
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION obtener_propiedades_pendientes_merge(INTEGER) IS 
'v2.0.0: Lista propiedades listas para merge.
Criterios: status IN (nueva, actualizado), con discovery, activa.
Prioriza propiedades con enrichment completo.';


-- =====================================================================================
-- FUNCIÓN 2: ejecutar_merge_batch
-- =====================================================================================
-- Ejecuta merge en lote para propiedades pendientes
-- Retorna resumen de la operación
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
    v_result JSONB;
    v_total_procesadas INTEGER := 0;
    v_exitosas INTEGER := 0;
    v_fallidas INTEGER := 0;
    v_errores JSONB := '[]'::JSONB;
    v_start_time TIMESTAMP := NOW();
BEGIN
    -- Procesar propiedades pendientes
    FOR v_prop IN 
        SELECT id, codigo_propiedad 
        FROM obtener_propiedades_pendientes_merge(p_limite)
    LOOP
        v_total_procesadas := v_total_procesadas + 1;
        
        -- Ejecutar merge
        v_result := merge_discovery_enrichment(v_prop.id);
        
        IF (v_result->>'success')::BOOLEAN THEN
            v_exitosas := v_exitosas + 1;
        ELSE
            v_fallidas := v_fallidas + 1;
            v_errores := v_errores || jsonb_build_array(jsonb_build_object(
                'id', v_prop.id,
                'codigo_propiedad', v_prop.codigo_propiedad,
                'error', v_result->>'error'
            ));
        END IF;
    END LOOP;
    
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'batch_merge',
        'version', '2.0.0',
        'total_procesadas', v_total_procesadas,
        'exitosas', v_exitosas,
        'fallidas', v_fallidas,
        'errores', v_errores,
        'duracion_segundos', EXTRACT(EPOCH FROM (NOW() - v_start_time)),
        'timestamp', NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'total_procesadas', v_total_procesadas,
        'exitosas', v_exitosas,
        'fallidas', v_fallidas,
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION ejecutar_merge_batch(INTEGER) IS 
'v2.0.0: Ejecuta merge en lote. Máximo 50 propiedades por defecto.
Retorna resumen con contadores y lista de errores si los hay.';


-- =====================================================================================
-- FUNCIÓN 3: estadisticas_merge
-- =====================================================================================
-- Dashboard de métricas del proceso de merge
-- =====================================================================================

DROP FUNCTION IF EXISTS estadisticas_merge();

CREATE OR REPLACE FUNCTION estadisticas_merge()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_stats JSONB;
BEGIN
    SELECT jsonb_build_object(
        -- Contadores por status
        'por_status', (
            SELECT jsonb_object_agg(status::TEXT, cnt)
            FROM (
                SELECT status, COUNT(*) as cnt
                FROM propiedades_v2
                WHERE es_activa = TRUE
                GROUP BY status
            ) s
        ),
        
        -- Pendientes de merge
        'pendientes_merge', (
            SELECT COUNT(*)
            FROM propiedades_v2
            WHERE status::TEXT IN ('nueva', 'actualizado')
              AND datos_json_discovery IS NOT NULL
              AND es_activa = TRUE
        ),
        
        -- Con merge completado
        'completados', (
            SELECT COUNT(*)
            FROM propiedades_v2
            WHERE status::TEXT = 'completado'
              AND es_activa = TRUE
        ),
        
        -- Por fuente
        'por_fuente', (
            SELECT jsonb_object_agg(fuente, cnt)
            FROM (
                SELECT fuente, COUNT(*) as cnt
                FROM propiedades_v2
                WHERE es_activa = TRUE
                GROUP BY fuente
            ) f
        ),
        
        -- Scores promedio
        'scores_promedio', (
            SELECT jsonb_build_object(
                'calidad_dato', ROUND(AVG(score_calidad_dato), 1),
                'fiduciario', ROUND(AVG(score_fiduciario), 1)
            )
            FROM propiedades_v2
            WHERE status::TEXT = 'completado'
              AND score_calidad_dato IS NOT NULL
              AND es_activa = TRUE
        ),
        
        -- Con discrepancias
        'con_discrepancias', (
            SELECT COUNT(*)
            FROM propiedades_v2
            WHERE discrepancias_detectadas IS NOT NULL
              AND discrepancias_detectadas != '{}'::JSONB
              AND es_activa = TRUE
        ),
        
        -- Aptos para matching
        'aptos_matching', (
            SELECT COUNT(*)
            FROM propiedades_v2
            WHERE es_para_matching = TRUE
              AND es_activa = TRUE
        ),
        
        -- Último merge
        'ultimo_merge', (
            SELECT MAX(fecha_merge)
            FROM propiedades_v2
        ),
        
        -- Timestamp consulta
        'timestamp', NOW()
    ) INTO v_stats;
    
    RETURN v_stats;
END;
$$;

COMMENT ON FUNCTION estadisticas_merge() IS 
'v2.0.0: Dashboard de métricas del proceso de merge.
Incluye contadores por status, fuente, scores y discrepancias.';


-- =====================================================================================
-- FUNCIÓN 4: obtener_discrepancias
-- =====================================================================================
-- Consulta propiedades con discrepancias significativas
-- =====================================================================================

DROP FUNCTION IF EXISTS obtener_discrepancias(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION obtener_discrepancias(
    p_nivel TEXT DEFAULT 'all',  -- 'warning', 'error', 'all'
    p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    codigo_propiedad VARCHAR,
    fuente VARCHAR,
    discrepancia_precio JSONB,
    discrepancia_area JSONB,
    discrepancia_dormitorios JSONB,
    discrepancia_banos JSONB,
    discrepancia_gps JSONB,
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
        p.fuente,
        p.discrepancias_detectadas->'precio',
        p.discrepancias_detectadas->'area',
        p.discrepancias_detectadas->'dormitorios',
        p.discrepancias_detectadas->'banos',
        p.discrepancias_detectadas->'gps',
        p.fecha_merge
    FROM propiedades_v2 p
    WHERE p.discrepancias_detectadas IS NOT NULL
      AND p.discrepancias_detectadas != '{}'::JSONB
      AND p.es_activa = TRUE
      AND (
          p_nivel = 'all'
          OR (p_nivel = 'warning' AND (
              p.discrepancias_detectadas->'precio'->>'flag' = 'warning' OR
              p.discrepancias_detectadas->'area'->>'flag' = 'warning' OR
              p.discrepancias_detectadas->'dormitorios'->>'flag' = 'warning' OR
              p.discrepancias_detectadas->'banos'->>'flag' = 'warning'
          ))
          OR (p_nivel = 'error' AND (
              p.discrepancias_detectadas->'precio'->>'flag' = 'error' OR
              p.discrepancias_detectadas->'area'->>'flag' = 'error'
          ))
      )
    ORDER BY p.fecha_merge DESC NULLS LAST
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION obtener_discrepancias(TEXT, INTEGER) IS 
'v2.0.0: Lista propiedades con discrepancias.
Niveles: all, warning, error. Útil para auditoría de calidad.';


-- =====================================================================================
-- FUNCIÓN 5: resetear_merge
-- =====================================================================================
-- Permite re-ejecutar merge en una propiedad específica
-- Cambia status a 'actualizado' para que pueda ser procesada de nuevo
-- =====================================================================================

DROP FUNCTION IF EXISTS resetear_merge(TEXT);

CREATE OR REPLACE FUNCTION resetear_merge(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prop RECORD;
    v_status_anterior TEXT;
BEGIN
    -- Buscar propiedad
    BEGIN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE id = p_identificador::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE codigo_propiedad = p_identificador;
    END;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada',
            'timestamp', NOW()
        );
    END IF;
    
    v_status_anterior := v_prop.status::TEXT;
    
    -- Solo resetear si ya fue mergeada
    IF v_prop.status::TEXT != 'completado' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no está en status completado',
            'status_actual', v_prop.status::TEXT,
            'timestamp', NOW()
        );
    END IF;
    
    -- Resetear a estado pre-merge
    UPDATE propiedades_v2 SET
        status = 'actualizado'::estado_propiedad,
        datos_json = NULL,
        fecha_merge = NULL,
        discrepancias_detectadas = NULL,
        cambios_merge = NULL,
        score_calidad_dato = NULL,
        score_fiduciario = NULL,
        flags_semanticos = NULL,
        fecha_actualizacion = NOW()
    WHERE id = v_prop.id;
    
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'reset_merge',
        'property_id', v_prop.codigo_propiedad,
        'status_anterior', v_status_anterior,
        'status_nuevo', 'actualizado',
        'mensaje', 'Propiedad lista para re-merge',
        'timestamp', NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION resetear_merge(TEXT) IS 
'v2.0.0: Resetea una propiedad para permitir re-merge.
Solo funciona en propiedades con status=completado.
Limpia datos_json, scores y discrepancias.';


-- =====================================================================================
-- FUNCIÓN 6: propiedades_requieren_revision
-- =====================================================================================
-- Lista propiedades que requieren revisión humana
-- =====================================================================================

DROP FUNCTION IF EXISTS propiedades_requieren_revision(INTEGER);

CREATE OR REPLACE FUNCTION propiedades_requieren_revision(
    p_limite INTEGER DEFAULT 50
)
RETURNS TABLE (
    id INTEGER,
    codigo_propiedad VARCHAR,
    url VARCHAR,
    fuente VARCHAR,
    score_calidad_dato INTEGER,
    score_fiduciario INTEGER,
    motivo_revision TEXT,
    flags_semanticos JSONB,
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
        p.score_calidad_dato,
        p.score_fiduciario,
        CASE 
            WHEN p.score_fiduciario < 50 THEN 'score_fiduciario_muy_bajo'
            WHEN p.datos_json->'calidad'->>'requiere_revision_humana' = 'true' THEN 'flag_revision'
            WHEN p.discrepancias_detectadas->'precio'->>'flag' = 'error' THEN 'discrepancia_precio_grave'
            WHEN p.datos_json->'financiero'->>'fuente_precio' = 'enrichment_fallback' THEN 'precio_fallback_usado'
            ELSE 'otro'
        END,
        p.flags_semanticos,
        p.fecha_merge
    FROM propiedades_v2 p
    WHERE p.status::TEXT = 'completado'
      AND p.es_activa = TRUE
      AND (
          p.score_fiduciario < 50
          OR p.datos_json->'calidad'->>'requiere_revision_humana' = 'true'
          OR p.discrepancias_detectadas->'precio'->>'flag' = 'error'
          OR p.datos_json->'financiero'->>'fuente_precio' = 'enrichment_fallback'
      )
    ORDER BY p.score_fiduciario ASC NULLS FIRST
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION propiedades_requieren_revision(INTEGER) IS 
'v2.0.0: Lista propiedades que requieren revisión humana.
Criterios: score bajo, fallback precio, discrepancias graves.';


-- =====================================================================================
-- GRANTS
-- =====================================================================================

GRANT EXECUTE ON FUNCTION obtener_propiedades_pendientes_merge(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_propiedades_pendientes_merge(INTEGER) TO service_role;

GRANT EXECUTE ON FUNCTION ejecutar_merge_batch(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION ejecutar_merge_batch(INTEGER) TO service_role;

GRANT EXECUTE ON FUNCTION estadisticas_merge() TO authenticated;
GRANT EXECUTE ON FUNCTION estadisticas_merge() TO service_role;

GRANT EXECUTE ON FUNCTION obtener_discrepancias(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_discrepancias(TEXT, INTEGER) TO service_role;

GRANT EXECUTE ON FUNCTION resetear_merge(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION resetear_merge(TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION propiedades_requieren_revision(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION propiedades_requieren_revision(INTEGER) TO service_role;


-- =====================================================================================
-- FIN DEL ARCHIVO
-- =====================================================================================
