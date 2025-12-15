-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: registrar_enrichment.sql
-- Propósito: Registrar datos del extractor HTML (Flujo B) respetando candados
-- Versión: 1.3.0 (Contrato semántico: enrichment SIEMPRE → actualizado)
-- Fecha: 2024-12-13
-- =====================================================================================
-- ESTADOS VÁLIDOS DEL ENUM estado_propiedad:
--   nueva, pendiente_enriquecimiento, completado, actualizado,
--   inactivo_pending, inactivo_confirmed
-- =====================================================================================
-- TRANSICIÓN DE STATUS (CONTRATO SEMÁNTICO):
--   nueva → actualizado
--   pendiente_enriquecimiento → actualizado
--   actualizado → actualizado (re-enrichment)
--   NUNCA asigna 'completado' (eso es responsabilidad de merge)
-- =====================================================================================

DROP FUNCTION IF EXISTS registrar_enrichment(JSONB);

CREATE OR REPLACE FUNCTION registrar_enrichment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
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
    v_tc_oficial NUMERIC(10,4);
    v_tc_paralelo NUMERIC(10,4);
BEGIN
    -- =========================================================================
    -- FASE 1: VALIDACIÓN DE ENTRADA
    -- =========================================================================
    
    v_property_id := p_data->>'property_id';
    v_url := p_data->>'url';
    
    IF v_property_id IS NULL AND v_url IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Se requiere property_id o url',
            'timestamp', NOW()
        );
    END IF;

    -- =========================================================================
    -- FASE 2: BUSCAR PROPIEDAD EXISTENTE
    -- =========================================================================
    
    IF v_property_id IS NOT NULL THEN
        SELECT * INTO v_existing FROM propiedades_v2 
        WHERE codigo_propiedad = v_property_id;
    ELSE
        SELECT * INTO v_existing FROM propiedades_v2 
        WHERE url = v_url;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada. Ejecutar Discovery primero.',
            'property_id', COALESCE(v_property_id, v_url),
            'hint', 'La propiedad debe existir via registrar_discovery() antes de enriquecer',
            'timestamp', NOW()
        );
    END IF;

    v_candados := COALESCE(v_existing.campos_bloqueados, '{}'::JSONB);

    -- =========================================================================
    -- FASE 3: OBTENER TIPOS DE CAMBIO ACTUALES
    -- =========================================================================
    
    SELECT valor INTO v_tc_oficial
    FROM config_global 
    WHERE clave = 'tipo_cambio_oficial'
      AND COALESCE(activo, true) = true;
    
    SELECT valor INTO v_tc_paralelo
    FROM config_global 
    WHERE clave = 'tipo_cambio_paralelo'
      AND COALESCE(activo, true) = true;

    -- =========================================================================
    -- FASE 4: CALCULAR CAMPOS UPDATED / SKIPPED / BLOCKED
    -- =========================================================================
    
    -- precio_usd
    IF p_data->>'precio_usd' IS NOT NULL THEN
        IF COALESCE((v_candados->>'precio_usd')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'precio_usd');
        ELSIF (p_data->>'precio_usd')::NUMERIC(12,2) IS DISTINCT FROM v_existing.precio_usd THEN
            v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'precio_usd');
        END IF;
    END IF;
    
    -- precio_min_usd
    IF p_data->>'precio_min_usd' IS NOT NULL THEN
        IF COALESCE((v_candados->>'precio_min_usd')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'precio_min_usd');
        ELSIF (p_data->>'precio_min_usd')::NUMERIC(12,2) IS DISTINCT FROM v_existing.precio_min_usd THEN
            v_campos_updated := array_append(v_campos_updated, 'precio_min_usd');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'precio_min_usd');
        END IF;
    END IF;
    
    -- precio_max_usd
    IF p_data->>'precio_max_usd' IS NOT NULL THEN
        IF COALESCE((v_candados->>'precio_max_usd')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'precio_max_usd');
        ELSIF (p_data->>'precio_max_usd')::NUMERIC(12,2) IS DISTINCT FROM v_existing.precio_max_usd THEN
            v_campos_updated := array_append(v_campos_updated, 'precio_max_usd');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'precio_max_usd');
        END IF;
    END IF;
    
    -- area_total_m2
    IF p_data->>'area_total_m2' IS NOT NULL THEN
        IF COALESCE((v_candados->>'area_total_m2')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'area_total_m2');
        ELSIF (p_data->>'area_total_m2')::NUMERIC(10,2) IS DISTINCT FROM v_existing.area_total_m2 THEN
            v_campos_updated := array_append(v_campos_updated, 'area_total_m2');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'area_total_m2');
        END IF;
    END IF;
    
    -- dormitorios
    IF p_data->>'dormitorios' IS NOT NULL THEN
        IF COALESCE((v_candados->>'dormitorios')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'dormitorios');
        ELSIF (p_data->>'dormitorios')::INTEGER IS DISTINCT FROM v_existing.dormitorios THEN
            v_campos_updated := array_append(v_campos_updated, 'dormitorios');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'dormitorios');
        END IF;
    END IF;
    
    -- banos
    IF p_data->>'banos' IS NOT NULL THEN
        IF COALESCE((v_candados->>'banos')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'banos');
        ELSIF (p_data->>'banos')::NUMERIC(3,1) IS DISTINCT FROM v_existing.banos THEN
            v_campos_updated := array_append(v_campos_updated, 'banos');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'banos');
        END IF;
    END IF;
    
    -- estacionamientos
    IF p_data->>'estacionamientos' IS NOT NULL THEN
        IF COALESCE((v_candados->>'estacionamientos')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'estacionamientos');
        ELSIF (p_data->>'estacionamientos')::INTEGER IS DISTINCT FROM v_existing.estacionamientos THEN
            v_campos_updated := array_append(v_campos_updated, 'estacionamientos');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'estacionamientos');
        END IF;
    END IF;
    
    -- latitud
    IF p_data->>'latitud' IS NOT NULL THEN
        IF COALESCE((v_candados->>'latitud')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'latitud');
        ELSIF (p_data->>'latitud')::NUMERIC(10,8) IS DISTINCT FROM v_existing.latitud THEN
            v_campos_updated := array_append(v_campos_updated, 'latitud');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'latitud');
        END IF;
    END IF;
    
    -- longitud
    IF p_data->>'longitud' IS NOT NULL THEN
        IF COALESCE((v_candados->>'longitud')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'longitud');
        ELSIF (p_data->>'longitud')::NUMERIC(11,8) IS DISTINCT FROM v_existing.longitud THEN
            v_campos_updated := array_append(v_campos_updated, 'longitud');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'longitud');
        END IF;
    END IF;
    
    -- id_proyecto_master_sugerido
    IF p_data->>'id_proyecto_master_sugerido' IS NOT NULL THEN
        IF COALESCE((v_candados->>'id_proyecto_master_sugerido')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'id_proyecto_master_sugerido');
        ELSIF (p_data->>'id_proyecto_master_sugerido')::INTEGER IS DISTINCT FROM v_existing.id_proyecto_master_sugerido THEN
            v_campos_updated := array_append(v_campos_updated, 'id_proyecto_master_sugerido');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'id_proyecto_master_sugerido');
        END IF;
    END IF;
    
    -- tipo_cambio_usado
    IF p_data->>'tipo_cambio_usado' IS NOT NULL THEN
        IF COALESCE((v_candados->>'tipo_cambio_usado')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'tipo_cambio_usado');
        ELSIF (p_data->>'tipo_cambio_usado')::NUMERIC(6,4) IS DISTINCT FROM v_existing.tipo_cambio_usado THEN
            v_campos_updated := array_append(v_campos_updated, 'tipo_cambio_usado');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'tipo_cambio_usado');
        END IF;
    END IF;
    
    -- moneda_original
    IF p_data->>'moneda_original' IS NOT NULL THEN
        IF COALESCE((v_candados->>'moneda_original')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'moneda_original');
        ELSIF p_data->>'moneda_original' IS DISTINCT FROM v_existing.moneda_original THEN
            v_campos_updated := array_append(v_campos_updated, 'moneda_original');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'moneda_original');
        END IF;
    END IF;
    
    -- estado_construccion (ENUM)
    IF p_data->>'estado_construccion' IS NOT NULL THEN
        IF COALESCE((v_candados->>'estado_construccion')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'estado_construccion');
        ELSIF (p_data->>'estado_construccion')::estado_construccion_enum IS DISTINCT FROM v_existing.estado_construccion THEN
            v_campos_updated := array_append(v_campos_updated, 'estado_construccion');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'estado_construccion');
        END IF;
    END IF;
    
    -- tipo_propiedad_original
    IF p_data->>'tipo_propiedad_original' IS NOT NULL THEN
        IF COALESCE((v_candados->>'tipo_propiedad_original')::boolean, false) THEN
            v_campos_blocked := array_append(v_campos_blocked, 'tipo_propiedad_original');
        ELSIF p_data->>'tipo_propiedad_original' IS DISTINCT FROM v_existing.tipo_propiedad_original THEN
            v_campos_updated := array_append(v_campos_updated, 'tipo_propiedad_original');
        ELSE
            v_campos_skipped := array_append(v_campos_skipped, 'tipo_propiedad_original');
        END IF;
    END IF;

    -- Construir JSONB cambios_enrichment
    v_cambios_enrichment := jsonb_build_object(
        'updated', v_campos_updated,
        'skipped', v_campos_skipped,
        'blocked', v_campos_blocked,
        'counts', jsonb_build_object(
            'updated', COALESCE(array_length(v_campos_updated, 1), 0),
            'skipped', COALESCE(array_length(v_campos_skipped, 1), 0),
            'blocked', COALESCE(array_length(v_campos_blocked, 1), 0)
        ),
        'timestamp', NOW()
    );

    -- Guardar status anterior ANTES del UPDATE
    v_status_anterior := v_existing.status::TEXT;

    -- =========================================================================
    -- FASE 5: ACTUALIZACIÓN EN BASE DE DATOS
    -- =========================================================================
    
    UPDATE propiedades_v2 SET
        -- GRUPO: FINANCIERO
        precio_usd = CASE 
            WHEN COALESCE((v_candados->>'precio_usd')::boolean, false) THEN propiedades_v2.precio_usd
            WHEN p_data->>'precio_usd' IS NOT NULL THEN (p_data->>'precio_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_usd
        END,
        
        moneda_original = CASE 
            WHEN COALESCE((v_candados->>'moneda_original')::boolean, false) THEN propiedades_v2.moneda_original
            WHEN p_data->>'moneda_original' IS NOT NULL THEN p_data->>'moneda_original'
            ELSE propiedades_v2.moneda_original
        END,
        
        tipo_cambio_usado = CASE 
            WHEN COALESCE((v_candados->>'tipo_cambio_usado')::boolean, false) THEN propiedades_v2.tipo_cambio_usado
            WHEN p_data->>'tipo_cambio_usado' IS NOT NULL THEN (p_data->>'tipo_cambio_usado')::NUMERIC(6,4)
            ELSE propiedades_v2.tipo_cambio_usado
        END,
        
        tipo_cambio_detectado = CASE 
            WHEN COALESCE((v_candados->>'tipo_cambio_detectado')::boolean, false) THEN propiedades_v2.tipo_cambio_detectado
            WHEN p_data->>'tipo_cambio_detectado' IS NOT NULL THEN p_data->>'tipo_cambio_detectado'
            ELSE propiedades_v2.tipo_cambio_detectado
        END,
        
        tipo_cambio_paralelo_usado = CASE 
            WHEN COALESCE((v_candados->>'tipo_cambio_paralelo_usado')::boolean, false) THEN propiedades_v2.tipo_cambio_paralelo_usado
            WHEN p_data->>'tipo_cambio_paralelo_usado' IS NOT NULL THEN (p_data->>'tipo_cambio_paralelo_usado')::NUMERIC(6,4)
            ELSE propiedades_v2.tipo_cambio_paralelo_usado
        END,
        
        precio_usd_actualizado = CASE 
            WHEN COALESCE((v_candados->>'precio_usd_actualizado')::boolean, false) THEN propiedades_v2.precio_usd_actualizado
            WHEN p_data->>'precio_usd_actualizado' IS NOT NULL THEN (p_data->>'precio_usd_actualizado')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_usd_actualizado
        END,
        
        depende_de_tc = CASE 
            WHEN p_data->>'depende_de_tc' IS NOT NULL THEN (p_data->>'depende_de_tc')::BOOLEAN
            WHEN p_data->>'tipo_cambio_paralelo_usado' IS NOT NULL THEN TRUE
            ELSE propiedades_v2.depende_de_tc
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

        -- GRUPO: FÍSICO
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
            WHEN p_data->>'estacionamientos' IS NOT NULL THEN (p_data->>'estacionamientos')::INTEGER
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

        -- GRUPO: MULTIPROYECTO
        es_multiproyecto = CASE 
            WHEN p_data->>'es_multiproyecto' IS NOT NULL THEN (p_data->>'es_multiproyecto')::BOOLEAN
            ELSE propiedades_v2.es_multiproyecto
        END,
        
        dormitorios_opciones = CASE 
            WHEN COALESCE((v_candados->>'dormitorios_opciones')::boolean, false) THEN propiedades_v2.dormitorios_opciones
            WHEN p_data->>'dormitorios_opciones' IS NOT NULL THEN p_data->>'dormitorios_opciones'
            ELSE propiedades_v2.dormitorios_opciones
        END,
        
        area_min_m2 = CASE 
            WHEN COALESCE((v_candados->>'area_min_m2')::boolean, false) THEN propiedades_v2.area_min_m2
            WHEN p_data->>'area_min_m2' IS NOT NULL THEN (p_data->>'area_min_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_min_m2
        END,
        
        area_max_m2 = CASE 
            WHEN COALESCE((v_candados->>'area_max_m2')::boolean, false) THEN propiedades_v2.area_max_m2
            WHEN p_data->>'area_max_m2' IS NOT NULL THEN (p_data->>'area_max_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_max_m2
        END,

        -- GRUPO: MATCHING
        id_proyecto_master_sugerido = CASE 
            WHEN COALESCE((v_candados->>'id_proyecto_master_sugerido')::boolean, false) THEN propiedades_v2.id_proyecto_master_sugerido
            WHEN p_data->>'id_proyecto_master_sugerido' IS NOT NULL THEN (p_data->>'id_proyecto_master_sugerido')::INTEGER
            ELSE propiedades_v2.id_proyecto_master_sugerido
        END,
        
        confianza_sugerencia_extractor = CASE 
            WHEN p_data->>'confianza_sugerencia_extractor' IS NOT NULL THEN (p_data->>'confianza_sugerencia_extractor')::NUMERIC(3,2)
            ELSE propiedades_v2.confianza_sugerencia_extractor
        END,
        
        metodo_match = CASE 
            WHEN p_data->>'metodo_match' IS NOT NULL THEN p_data->>'metodo_match'
            ELSE propiedades_v2.metodo_match
        END,

        -- GRUPO: CLASIFICACIÓN (con cast a ENUM)
        estado_construccion = CASE 
            WHEN COALESCE((v_candados->>'estado_construccion')::boolean, false) THEN propiedades_v2.estado_construccion
            WHEN p_data->>'estado_construccion' IS NOT NULL THEN (p_data->>'estado_construccion')::estado_construccion_enum
            ELSE propiedades_v2.estado_construccion
        END,
        
        tipo_propiedad_original = CASE 
            WHEN COALESCE((v_candados->>'tipo_propiedad_original')::boolean, false) THEN propiedades_v2.tipo_propiedad_original
            WHEN p_data->>'tipo_propiedad_original' IS NOT NULL THEN p_data->>'tipo_propiedad_original'
            ELSE propiedades_v2.tipo_propiedad_original
        END,

        -- GRUPO: SCORES
        score_calidad_dato = CASE 
            WHEN p_data->>'score_calidad_dato' IS NOT NULL THEN (p_data->>'score_calidad_dato')::INTEGER
            ELSE propiedades_v2.score_calidad_dato
        END,
        
        score_fiduciario = CASE 
            WHEN p_data->>'score_fiduciario' IS NOT NULL THEN (p_data->>'score_fiduciario')::INTEGER
            ELSE propiedades_v2.score_fiduciario
        END,

        -- GRUPO: ARQUITECTURA DUAL - ENRICHMENT
        datos_json_enrichment = p_data,
        fecha_enrichment = NOW(),
        
        -- GRUPO: STATUS Y CONTROL (CONTRATO: enrichment SIEMPRE → actualizado)
        status = 'actualizado'::estado_propiedad,
        
        es_para_matching = CASE
            WHEN v_existing.id_proyecto_master IS NOT NULL THEN FALSE
            ELSE TRUE
        END,
        
        requiere_actualizacion_precio = CASE
            WHEN p_data->>'tipo_cambio_paralelo_usado' IS NOT NULL THEN TRUE
            ELSE propiedades_v2.requiere_actualizacion_precio
        END,
        
        -- GRUPO: CAMBIOS ENRICHMENT
        cambios_enrichment = v_cambios_enrichment,
        
        -- TIMESTAMPS
        fecha_actualizacion = NOW(),
        scraper_version = COALESCE(p_data->>'scraper_version', propiedades_v2.scraper_version)
        
    WHERE id = v_existing.id;

    -- =========================================================================
    -- FASE 6: CONSTRUIR RESPUESTA
    -- =========================================================================
    
    v_result := jsonb_build_object(
        'success', true,
        'operation', 'enrichment',
        'property_id', v_existing.codigo_propiedad,
        'internal_id', v_existing.id,
        'url', v_existing.url,
        'fuente', v_existing.fuente,
        'status_anterior', v_status_anterior,
        'status_nuevo', 'actualizado',
        'cambios_enrichment', v_cambios_enrichment,
        'tiene_candados', (v_candados != '{}'::JSONB),
        'listo_para_merge', true,
        'timestamp', NOW()
    );
    
    RETURN v_result;

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE,
        'property_id', COALESCE(v_property_id, v_url),
        'timestamp', NOW()
    );
END;
$$;

-- =====================================================================================
-- COMENTARIOS Y GRANTS
-- =====================================================================================
COMMENT ON FUNCTION registrar_enrichment(JSONB) IS 
'Registra datos del extractor HTML (Flujo B) respetando candados.
CONTRATO: Status final SIEMPRE es actualizado (nunca completado).
El cierre del pipeline es responsabilidad exclusiva de merge.
Versión 1.3.0';

GRANT EXECUTE ON FUNCTION registrar_enrichment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_enrichment(JSONB) TO service_role;

-- =====================================================================================
-- VERIFICACIÓN
-- =====================================================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'registrar_enrichment') THEN
        RAISE NOTICE '✅ Función registrar_enrichment() v1.3.0 creada exitosamente';
        RAISE NOTICE '   CONTRATO: Status final SIEMPRE → actualizado';
    ELSE
        RAISE EXCEPTION '❌ Error: Función no fue creada';
    END IF;
END $$;