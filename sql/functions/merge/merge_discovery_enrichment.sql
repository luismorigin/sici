-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: merge_discovery_enrichment.sql
-- Propósito: Unificar datos de Discovery + Enrichment respetando candados
-- Versión: 1.2.0 (Contrato semántico: merge SIEMPRE → completado)
-- Fecha: 2024-12-13
-- =====================================================================================
-- ESTADOS VÁLIDOS DEL ENUM estado_propiedad:
--   nueva, pendiente_enriquecimiento, completado, actualizado,
--   inactivo_pending, inactivo_confirmed
-- =====================================================================================
-- STATUS FINAL (CONTRATO SEMÁNTICO):
--   - SIEMPRE 'completado' → Merge es el ÚNICO que cierra el pipeline
--   - Re-merge sobre propiedad completada → permanece 'completado'
--   - NUNCA devuelve 'actualizado' (eso es responsabilidad de enrichment)
-- =====================================================================================

DROP FUNCTION IF EXISTS merge_discovery_enrichment(INTEGER);
DROP FUNCTION IF EXISTS merge_discovery_enrichment(TEXT);

CREATE OR REPLACE FUNCTION merge_discovery_enrichment(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prop RECORD;
    v_candados JSONB;
    v_discovery JSONB;
    v_enrichment JSONB;
    v_merged JSONB;
    v_discrepancias JSONB := '[]'::JSONB;
    v_campos_updated TEXT[] := ARRAY[]::TEXT[];
    v_campos_kept TEXT[] := ARRAY[]::TEXT[];
    v_campos_blocked TEXT[] := ARRAY[]::TEXT[];
    v_merged_from JSONB := '{}'::JSONB;
    v_cambios_merge JSONB;
    v_status_anterior TEXT;
    v_status_final estado_propiedad;
    v_datos_criticos_faltantes TEXT[] := ARRAY[]::TEXT[];
    v_tiene_discrepancias_graves BOOLEAN := FALSE;
    v_result JSONB;
    v_precio_final NUMERIC(12,2);
    v_area_final NUMERIC(10,2);
    v_dormitorios_final INTEGER;
    v_banos_final NUMERIC(3,1);
    v_estacionamientos_final INTEGER;
    v_latitud_final NUMERIC(10,8);
    v_longitud_final NUMERIC(11,8);
BEGIN
    -- =========================================================================
    -- FASE 1: BUSCAR PROPIEDAD
    -- =========================================================================
    
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
            'identificador', p_identificador,
            'timestamp', NOW()
        );
    END IF;

    IF v_prop.datos_json_discovery IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad sin datos de Discovery',
            'property_id', v_prop.codigo_propiedad,
            'hint', 'Ejecutar registrar_discovery() primero',
            'timestamp', NOW()
        );
    END IF;

    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::JSONB);
    v_discovery := v_prop.datos_json_discovery;
    v_enrichment := COALESCE(v_prop.datos_json_enrichment, '{}'::JSONB);
    
    -- Guardar status anterior ANTES de cualquier modificación
    v_status_anterior := v_prop.status::TEXT;

    -- =========================================================================
    -- FASE 2: MERGE CAMPO POR CAMPO
    -- =========================================================================

    -- PRECIO_USD
    IF COALESCE((v_candados->>'precio_usd')::boolean, false) THEN
        v_precio_final := v_prop.precio_usd;
        v_campos_blocked := array_append(v_campos_blocked, 'precio_usd');
        v_merged_from := v_merged_from || '{"precio_usd": "blocked"}'::JSONB;
    ELSIF v_enrichment->>'precio_usd' IS NOT NULL 
          AND (v_enrichment->>'precio_usd')::NUMERIC(12,2) IS DISTINCT FROM v_prop.precio_usd THEN
        v_precio_final := (v_enrichment->>'precio_usd')::NUMERIC(12,2);
        v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        v_merged_from := v_merged_from || '{"precio_usd": "enrichment"}'::JSONB;
        IF v_discovery->>'precio_usd' IS NOT NULL 
           AND ABS((v_enrichment->>'precio_usd')::NUMERIC - (v_discovery->>'precio_usd')::NUMERIC) > 100 THEN
            v_discrepancias := v_discrepancias || jsonb_build_object(
                'campo', 'precio_usd',
                'discovery', v_discovery->>'precio_usd',
                'enrichment', v_enrichment->>'precio_usd'
            );
        END IF;
    ELSE
        v_precio_final := v_prop.precio_usd;
        v_campos_kept := array_append(v_campos_kept, 'precio_usd');
        v_merged_from := v_merged_from || '{"precio_usd": "discovery"}'::JSONB;
    END IF;

    -- AREA_TOTAL_M2
    IF COALESCE((v_candados->>'area_total_m2')::boolean, false) THEN
        v_area_final := v_prop.area_total_m2;
        v_campos_blocked := array_append(v_campos_blocked, 'area_total_m2');
        v_merged_from := v_merged_from || '{"area_total_m2": "blocked"}'::JSONB;
    ELSIF v_enrichment->>'area_total_m2' IS NOT NULL 
          AND (v_enrichment->>'area_total_m2')::NUMERIC(10,2) IS DISTINCT FROM v_prop.area_total_m2 THEN
        v_area_final := (v_enrichment->>'area_total_m2')::NUMERIC(10,2);
        v_campos_updated := array_append(v_campos_updated, 'area_total_m2');
        v_merged_from := v_merged_from || '{"area_total_m2": "enrichment"}'::JSONB;
        IF v_prop.area_total_m2 IS NOT NULL AND v_prop.area_total_m2 > 0 
           AND ABS((v_enrichment->>'area_total_m2')::NUMERIC - v_prop.area_total_m2) / v_prop.area_total_m2 > 0.10 THEN
            v_discrepancias := v_discrepancias || jsonb_build_object(
                'campo', 'area_total_m2',
                'discovery', v_prop.area_total_m2,
                'enrichment', v_enrichment->>'area_total_m2'
            );
            v_tiene_discrepancias_graves := TRUE;
        END IF;
    ELSE
        v_area_final := v_prop.area_total_m2;
        v_campos_kept := array_append(v_campos_kept, 'area_total_m2');
        v_merged_from := v_merged_from || '{"area_total_m2": "discovery"}'::JSONB;
    END IF;

    -- DORMITORIOS
    IF COALESCE((v_candados->>'dormitorios')::boolean, false) THEN
        v_dormitorios_final := v_prop.dormitorios;
        v_campos_blocked := array_append(v_campos_blocked, 'dormitorios');
        v_merged_from := v_merged_from || '{"dormitorios": "blocked"}'::JSONB;
    ELSIF v_enrichment->>'dormitorios' IS NOT NULL 
          AND (v_enrichment->>'dormitorios')::INTEGER IS DISTINCT FROM v_prop.dormitorios THEN
        v_dormitorios_final := (v_enrichment->>'dormitorios')::INTEGER;
        v_campos_updated := array_append(v_campos_updated, 'dormitorios');
        v_merged_from := v_merged_from || '{"dormitorios": "enrichment"}'::JSONB;
    ELSE
        v_dormitorios_final := v_prop.dormitorios;
        v_campos_kept := array_append(v_campos_kept, 'dormitorios');
        v_merged_from := v_merged_from || '{"dormitorios": "discovery"}'::JSONB;
    END IF;

    -- BAÑOS
    IF COALESCE((v_candados->>'banos')::boolean, false) THEN
        v_banos_final := v_prop.banos;
        v_campos_blocked := array_append(v_campos_blocked, 'banos');
        v_merged_from := v_merged_from || '{"banos": "blocked"}'::JSONB;
    ELSIF v_enrichment->>'banos' IS NOT NULL 
          AND (v_enrichment->>'banos')::NUMERIC(3,1) IS DISTINCT FROM v_prop.banos THEN
        v_banos_final := (v_enrichment->>'banos')::NUMERIC(3,1);
        v_campos_updated := array_append(v_campos_updated, 'banos');
        v_merged_from := v_merged_from || '{"banos": "enrichment"}'::JSONB;
    ELSE
        v_banos_final := v_prop.banos;
        v_campos_kept := array_append(v_campos_kept, 'banos');
        v_merged_from := v_merged_from || '{"banos": "discovery"}'::JSONB;
    END IF;

    -- ESTACIONAMIENTOS
    IF COALESCE((v_candados->>'estacionamientos')::boolean, false) THEN
        v_estacionamientos_final := v_prop.estacionamientos;
        v_campos_blocked := array_append(v_campos_blocked, 'estacionamientos');
        v_merged_from := v_merged_from || '{"estacionamientos": "blocked"}'::JSONB;
    ELSIF v_enrichment->>'estacionamientos' IS NOT NULL 
          AND (v_enrichment->>'estacionamientos')::INTEGER IS DISTINCT FROM v_prop.estacionamientos THEN
        v_estacionamientos_final := (v_enrichment->>'estacionamientos')::INTEGER;
        v_campos_updated := array_append(v_campos_updated, 'estacionamientos');
        v_merged_from := v_merged_from || '{"estacionamientos": "enrichment"}'::JSONB;
    ELSE
        v_estacionamientos_final := v_prop.estacionamientos;
        v_campos_kept := array_append(v_campos_kept, 'estacionamientos');
        v_merged_from := v_merged_from || '{"estacionamientos": "discovery"}'::JSONB;
    END IF;

    -- GPS (Discovery tiene prioridad)
    IF COALESCE((v_candados->>'latitud')::boolean, false) THEN
        v_latitud_final := v_prop.latitud;
        v_campos_blocked := array_append(v_campos_blocked, 'latitud');
        v_merged_from := v_merged_from || '{"latitud": "blocked"}'::JSONB;
    ELSIF v_prop.latitud IS NOT NULL THEN
        v_latitud_final := v_prop.latitud;
        v_campos_kept := array_append(v_campos_kept, 'latitud');
        v_merged_from := v_merged_from || '{"latitud": "discovery"}'::JSONB;
    ELSIF v_enrichment->>'latitud' IS NOT NULL THEN
        v_latitud_final := (v_enrichment->>'latitud')::NUMERIC(10,8);
        v_campos_updated := array_append(v_campos_updated, 'latitud');
        v_merged_from := v_merged_from || '{"latitud": "enrichment"}'::JSONB;
    END IF;

    IF COALESCE((v_candados->>'longitud')::boolean, false) THEN
        v_longitud_final := v_prop.longitud;
        v_campos_blocked := array_append(v_campos_blocked, 'longitud');
        v_merged_from := v_merged_from || '{"longitud": "blocked"}'::JSONB;
    ELSIF v_prop.longitud IS NOT NULL THEN
        v_longitud_final := v_prop.longitud;
        v_campos_kept := array_append(v_campos_kept, 'longitud');
        v_merged_from := v_merged_from || '{"longitud": "discovery"}'::JSONB;
    ELSIF v_enrichment->>'longitud' IS NOT NULL THEN
        v_longitud_final := (v_enrichment->>'longitud')::NUMERIC(11,8);
        v_campos_updated := array_append(v_campos_updated, 'longitud');
        v_merged_from := v_merged_from || '{"longitud": "enrichment"}'::JSONB;
    END IF;

    -- =========================================================================
    -- FASE 3: VERIFICAR DATOS CRÍTICOS
    -- =========================================================================
    
    IF v_precio_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'precio_usd');
    END IF;
    IF v_area_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'area_total_m2');
    END IF;
    IF v_latitud_final IS NULL OR v_longitud_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'gps');
    END IF;

    -- =========================================================================
    -- FASE 4: DETERMINAR STATUS FINAL (CONTRATO: merge SIEMPRE → completado)
    -- =========================================================================
    
    v_status_final := 'completado'::estado_propiedad;

    -- =========================================================================
    -- FASE 5: CONSTRUIR JSON MERGED
    -- =========================================================================
    
    v_merged := jsonb_build_object(
        'fuente_merge', 'discovery_enrichment_combined',
        'timestamp_merge', NOW(),
        'version_merge', '1.1.0',
        'identificacion', jsonb_build_object(
            'url', v_prop.url,
            'fuente', v_prop.fuente,
            'codigo_propiedad', v_prop.codigo_propiedad
        ),
        'financiero', jsonb_build_object(
            'precio_usd', v_precio_final,
            'precio_usd_actualizado', v_prop.precio_usd_actualizado,
            'moneda_original', v_prop.moneda_original,
            'depende_de_tc', v_prop.depende_de_tc
        ),
        'fisico', jsonb_build_object(
            'area_total_m2', v_area_final,
            'dormitorios', v_dormitorios_final,
            'banos', v_banos_final,
            'estacionamientos', v_estacionamientos_final
        ),
        'ubicacion', jsonb_build_object(
            'latitud', v_latitud_final,
            'longitud', v_longitud_final
        ),
        'matching', jsonb_build_object(
            'id_proyecto_master', v_prop.id_proyecto_master,
            'id_proyecto_master_sugerido', v_prop.id_proyecto_master_sugerido
        )
    );

    -- =========================================================================
    -- FASE 6: CONSTRUIR CAMBIOS_MERGE
    -- =========================================================================
    
    v_cambios_merge := jsonb_build_object(
        'updated', v_campos_updated,
        'kept', v_campos_kept,
        'blocked', v_campos_blocked,
        'merged_from', v_merged_from,
        'counts', jsonb_build_object(
            'updated', COALESCE(array_length(v_campos_updated, 1), 0),
            'kept', COALESCE(array_length(v_campos_kept, 1), 0),
            'blocked', COALESCE(array_length(v_campos_blocked, 1), 0)
        ),
        'discrepancias', v_discrepancias,
        'datos_criticos_faltantes', v_datos_criticos_faltantes,
        'timestamp', NOW()
    );

    -- =========================================================================
    -- FASE 7: ACTUALIZAR PROPIEDAD
    -- =========================================================================
    
    UPDATE propiedades_v2 SET
        precio_usd = v_precio_final,
        area_total_m2 = v_area_final,
        dormitorios = v_dormitorios_final,
        banos = v_banos_final,
        estacionamientos = v_estacionamientos_final,
        latitud = v_latitud_final,
        longitud = v_longitud_final,
        datos_json = v_merged,
        fecha_merge = NOW(),
        discrepancias_detectadas = CASE 
            WHEN jsonb_array_length(v_discrepancias) > 0 THEN v_discrepancias 
            ELSE NULL 
        END,
        campos_conflicto = CASE 
            WHEN jsonb_array_length(v_discrepancias) > 0 THEN v_discrepancias 
            ELSE '[]'::JSONB 
        END,
        cambios_merge = v_cambios_merge,
        status = v_status_final,
        es_para_matching = CASE 
            WHEN v_prop.id_proyecto_master IS NOT NULL THEN FALSE 
            ELSE TRUE 
        END,
        fecha_actualizacion = NOW()
    WHERE id = v_prop.id;

    -- =========================================================================
    -- FASE 8: CONSTRUIR RESPUESTA
    -- =========================================================================
    
    v_result := jsonb_build_object(
        'success', true,
        'operation', 'merge',
        'property_id', v_prop.codigo_propiedad,
        'internal_id', v_prop.id,
        'url', v_prop.url,
        'fuente', v_prop.fuente,
        'status_anterior', v_status_anterior,
        'status_nuevo', v_status_final::TEXT,
        'cambios_merge', v_cambios_merge,
        'tiene_discrepancias', jsonb_array_length(v_discrepancias) > 0,
        'datos_criticos_faltantes', v_datos_criticos_faltantes,
        'timestamp', NOW()
    );
    
    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE,
        'identificador', p_identificador,
        'timestamp', NOW()
    );
END;
$$;

-- Sobrecarga para INTEGER
CREATE OR REPLACE FUNCTION merge_discovery_enrichment(p_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN merge_discovery_enrichment(p_id::TEXT);
END;
$$;

-- =====================================================================================
-- COMENTARIOS Y GRANTS
-- =====================================================================================
COMMENT ON FUNCTION merge_discovery_enrichment(TEXT) IS 
'Unifica Discovery + Enrichment. CONTRATO: Status final SIEMPRE es completado.
Merge es el ÚNICO responsable de cerrar el pipeline.
Versión 1.2.0';

GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(INTEGER) TO service_role;

-- =====================================================================================
-- VERIFICACIÓN
-- =====================================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merge_discovery_enrichment') THEN
        RAISE NOTICE '✅ Función merge_discovery_enrichment() v1.2.0 creada';
        RAISE NOTICE '   CONTRATO: Status final SIEMPRE → completado';
    ELSE
        RAISE EXCEPTION '❌ Error: Función no fue creada';
    END IF;
END $$;