CREATE OR REPLACE FUNCTION registrar_enrichment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_id INTEGER;
    v_property_id TEXT;
    v_url TEXT;
    v_existing RECORD;
    v_candados JSONB;
    v_campos_updated TEXT[] := ARRAY[]::TEXT[];
    v_campos_blocked TEXT[] := ARRAY[]::TEXT[];
    v_campos_skipped TEXT[] := ARRAY[]::TEXT[];
    v_cambios_enrichment JSONB;
    v_status_anterior TEXT;
    v_result JSONB;
BEGIN
    -- FASE 1: BUSCAR PROPIEDAD
    BEGIN
        v_id := (p_data->>'_internal_id')::INTEGER;
        IF v_id IS NOT NULL THEN
            SELECT * INTO v_existing FROM propiedades_v2 WHERE id = v_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_id := NULL;
    END;
    
    IF NOT FOUND OR v_id IS NULL THEN
        v_property_id := p_data->>'property_id';
        IF v_property_id IS NOT NULL THEN
            SELECT * INTO v_existing FROM propiedades_v2 WHERE codigo_propiedad = v_property_id;
        END IF;
    END IF;
    
    IF NOT FOUND THEN
        v_url := p_data->>'url';
        IF v_url IS NOT NULL THEN
            SELECT * INTO v_existing FROM propiedades_v2 WHERE url = v_url;
        END IF;
    END IF;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Propiedad no encontrada', 'timestamp', NOW());
    END IF;

    v_candados := COALESCE(v_existing.campos_bloqueados, '{}'::JSONB);
    v_status_anterior := v_existing.status::TEXT;

    -- FASE 2: CALCULAR CAMBIOS
    IF p_data->>'precio_usd' IS NOT NULL AND NOT COALESCE((v_candados->>'precio_usd')::boolean, false) THEN
        IF (p_data->>'precio_usd')::NUMERIC(12,2) IS DISTINCT FROM v_existing.precio_usd THEN
            v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        END IF;
    END IF;

    v_cambios_enrichment := jsonb_build_object(
        'updated', v_campos_updated,
        'blocked', v_campos_blocked,
        'skipped', v_campos_skipped,
        'timestamp', NOW()
    );

    -- FASE 3: UPDATE
    UPDATE propiedades_v2 SET
        precio_usd = CASE 
            WHEN COALESCE((v_candados->>'precio_usd')::boolean, false) THEN propiedades_v2.precio_usd
            WHEN p_data->>'precio_usd' IS NOT NULL THEN (p_data->>'precio_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_usd
        END,
        
        precio_min_usd = CASE 
            WHEN COALESCE((v_candados->>'precio_min_usd')::boolean, false) THEN propiedades_v2.precio_min_usd
            WHEN p_data->>'precio_min_usd' IS NOT NULL THEN (p_data->>'precio_min_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_min_usd
        END,
        
        precio_max_usd = CASE 
            WHEN COALESCE((v_candados->>'precio_max_usd')::boolean, false) THEN propiedades_v2.precio_max_usd
            WHEN p_data->>'precio_max_usd' IS NOT NULL THEN (p_data->>'precio_max_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_max_usd
        END,
        
        moneda_original = CASE 
            WHEN p_data->>'moneda_original' IS NOT NULL THEN p_data->>'moneda_original'
            ELSE propiedades_v2.moneda_original
        END,
        
        tipo_cambio_usado = CASE 
            WHEN p_data->>'tipo_cambio_usado' IS NOT NULL THEN (p_data->>'tipo_cambio_usado')::NUMERIC(6,4)
            ELSE propiedades_v2.tipo_cambio_usado
        END,
        
        area_total_m2 = CASE 
            WHEN COALESCE((v_candados->>'area_total_m2')::boolean, false) THEN propiedades_v2.area_total_m2
            WHEN p_data->>'area_total_m2' IS NOT NULL THEN (p_data->>'area_total_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_total_m2
        END,
        
        dormitorios = CASE 
            WHEN COALESCE((v_candados->>'dormitorios')::boolean, false) THEN propiedades_v2.dormitorios
            WHEN p_data->>'dormitorios' IS NOT NULL THEN (p_data->>'dormitorios')::INTEGER
            ELSE propiedades_v2.dormitorios
        END,
        
        banos = CASE 
            WHEN COALESCE((v_candados->>'banos')::boolean, false) THEN propiedades_v2.banos
            WHEN p_data->>'banos' IS NOT NULL THEN (p_data->>'banos')::NUMERIC(3,1)
            ELSE propiedades_v2.banos
        END,
        
        estacionamientos = CASE 
            WHEN COALESCE((v_candados->>'estacionamientos')::boolean, false) THEN propiedades_v2.estacionamientos
            WHEN p_data->>'estacionamientos' ~ '^[0-9]+$' THEN (p_data->>'estacionamientos')::INTEGER
            ELSE propiedades_v2.estacionamientos
        END,
        
        latitud = CASE 
            WHEN COALESCE((v_candados->>'latitud')::boolean, false) THEN propiedades_v2.latitud
            WHEN p_data->>'latitud' IS NOT NULL THEN (p_data->>'latitud')::NUMERIC(10,8)
            ELSE propiedades_v2.latitud
        END,
        
        longitud = CASE 
            WHEN COALESCE((v_candados->>'longitud')::boolean, false) THEN propiedades_v2.longitud
            WHEN p_data->>'longitud' IS NOT NULL THEN (p_data->>'longitud')::NUMERIC(11,8)
            ELSE propiedades_v2.longitud
        END,
        
        estado_construccion = CASE 
            WHEN COALESCE((v_candados->>'estado_construccion')::boolean, false) THEN propiedades_v2.estado_construccion
            WHEN p_data->>'estado_construccion' = 'sin_informacion' THEN 'no_especificado'::estado_construccion_enum
            WHEN p_data->>'estado_construccion' IS NOT NULL THEN (p_data->>'estado_construccion')::estado_construccion_enum
            ELSE propiedades_v2.estado_construccion
        END,
        
        tipo_operacion = CASE 
            WHEN p_data->>'tipo_operacion' IS NOT NULL THEN (p_data->>'tipo_operacion')::tipo_operacion_enum
            ELSE propiedades_v2.tipo_operacion
        END,
        
        tipo_propiedad_original = CASE 
            WHEN p_data->>'tipo_propiedad_original' IS NOT NULL THEN p_data->>'tipo_propiedad_original'
            ELSE propiedades_v2.tipo_propiedad_original
        END,
        
        es_multiproyecto = CASE 
            WHEN p_data->>'es_multiproyecto' IS NOT NULL THEN (p_data->>'es_multiproyecto')::BOOLEAN
            ELSE propiedades_v2.es_multiproyecto
        END,
        
        datos_json_enrichment = p_data,
        fecha_enrichment = NOW(),
        status = 'actualizado'::estado_propiedad,
        cambios_enrichment = v_cambios_enrichment,
        fecha_actualizacion = NOW(),
        scraper_version = COALESCE(p_data->>'scraper_version', propiedades_v2.scraper_version)
        
    WHERE id = v_existing.id;

    RETURN jsonb_build_object(
        'success', true,
        'operation', 'enrichment',
        'version', '1.4.1',
        'property_id', v_existing.codigo_propiedad,
        'internal_id', v_existing.id,
        'status_nuevo', 'actualizado',
        'timestamp', NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'detail', SQLSTATE, 'timestamp', NOW());
END;
$$;