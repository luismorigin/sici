CREATE OR REPLACE FUNCTION merge_discovery_enrichment(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
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
    -- FASE 1: BUSCAR PROPIEDAD
    BEGIN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE id = p_identificador::INTEGER;
    EXCEPTION WHEN OTHERS THEN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE codigo_propiedad = p_identificador;
        IF NOT FOUND THEN
            SELECT * INTO v_prop FROM propiedades_v2 WHERE url = p_identificador;
        END IF;
    END;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Propiedad no encontrada', 'timestamp', NOW());
    END IF;

    IF v_prop.datos_json_discovery IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Sin datos Discovery', 'timestamp', NOW());
    END IF;

    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::JSONB);
    v_discovery := v_prop.datos_json_discovery;
    v_enrichment := COALESCE(v_prop.datos_json_enrichment, '{}'::JSONB);
    v_status_anterior := v_prop.status::TEXT;

    -- FASE 2: MERGE CAMPOS
    
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

    -- ESTACIONAMIENTOS (CORREGIDO - Validar antes de cast)
    IF COALESCE((v_candados->>'estacionamientos')::boolean, false) THEN
        v_estacionamientos_final := v_prop.estacionamientos;
        v_campos_blocked := array_append(v_campos_blocked, 'estacionamientos');
        v_merged_from := v_merged_from || '{"estacionamientos": "blocked"}'::JSONB;
    ELSIF v_enrichment->>'estacionamientos' IS NOT NULL 
          AND v_enrichment->>'estacionamientos' ~ '^[0-9]+$'
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

    -- FASE 3: VERIFICAR DATOS CRÍTICOS
    IF v_precio_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'precio_usd');
    END IF;
    IF v_area_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'area_total_m2');
    END IF;
    IF v_latitud_final IS NULL OR v_longitud_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'gps');
    END IF;

    v_status_final := 'completado'::estado_propiedad;

    -- FASE 4: CONSTRUIR JSONs
    v_merged := jsonb_build_object(
        'fuente_merge', 'discovery_enrichment_combined',
        'timestamp_merge', NOW(),
        'version_merge', '1.2.0',
        'financiero', jsonb_build_object('precio_usd', v_precio_final),
        'fisico', jsonb_build_object(
            'area_total_m2', v_area_final,
            'dormitorios', v_dormitorios_final,
            'banos', v_banos_final,
            'estacionamientos', v_estacionamientos_final
        ),
        'ubicacion', jsonb_build_object('latitud', v_latitud_final, 'longitud', v_longitud_final)
    );

    v_cambios_merge := jsonb_build_object(
        'updated', v_campos_updated,
        'kept', v_campos_kept,
        'blocked', v_campos_blocked,
        'merged_from', v_merged_from,
        'timestamp', NOW()
    );

    -- FASE 5: UPDATE
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
        cambios_merge = v_cambios_merge,
        status = v_status_final,
        fecha_actualizacion = NOW()
    WHERE id = v_prop.id;

    RETURN jsonb_build_object(
        'success', true,
        'operation', 'merge',
        'version', '1.2.0',
        'property_id', v_prop.codigo_propiedad,
        'status_nuevo', v_status_final::TEXT,
        'cambios_merge', v_cambios_merge,
        'timestamp', NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'timestamp', NOW());
END;
$$;