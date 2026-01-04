-- ============================================================================
-- FUNCIÓN PRINCIPAL: registrar_discovery()
-- Propósito: INSERT/UPDATE idempotente desde Flujo A (API/Grid)
-- Tabla: propiedades_v2
-- Compatible con: 100% estructura actual de propiedades_v2
-- ============================================================================

CREATE OR REPLACE FUNCTION registrar_discovery(
    -- Identificación
    p_url VARCHAR,
    p_fuente VARCHAR,
    p_codigo_propiedad VARCHAR DEFAULT NULL,
    
    -- Clasificación
    p_tipo_operacion VARCHAR DEFAULT NULL,
    p_tipo_propiedad_original TEXT DEFAULT NULL,
    p_estado_construccion VARCHAR DEFAULT NULL,
    
    -- Financiero
    p_precio_usd NUMERIC DEFAULT NULL,
    p_precio_usd_original NUMERIC DEFAULT NULL,
    p_moneda_original VARCHAR DEFAULT NULL,
    
    -- Físico
    p_area_total_m2 NUMERIC DEFAULT NULL,
    p_dormitorios INTEGER DEFAULT NULL,
    p_banos NUMERIC DEFAULT NULL,
    p_estacionamientos INTEGER DEFAULT NULL,
    
    -- GPS
    p_latitud NUMERIC DEFAULT NULL,
    p_longitud NUMERIC DEFAULT NULL,
    
    -- Metadata
    p_fecha_publicacion DATE DEFAULT NULL,
    p_metodo_discovery VARCHAR DEFAULT 'api_rest',
    
    -- JSON completo discovery
    p_datos_json_discovery JSONB DEFAULT NULL
)
RETURNS TABLE(
    id INTEGER,
    status estado_propiedad,
    es_nueva BOOLEAN,
    cambios_detectados JSONB
) AS $$
DECLARE
    v_id INTEGER;
    v_status_actual estado_propiedad;
    v_es_nueva BOOLEAN := FALSE;
    v_cambio_detectado BOOLEAN := FALSE;
    v_status_nuevo estado_propiedad;
    v_campos_bloqueados JSONB;
    v_discrepancias JSONB := '[]'::JSONB;
    
    -- Valores actuales (para comparación)
    v_precio_actual NUMERIC;
    v_area_actual NUMERIC;
    v_dormitorios_actual INTEGER;
    v_banos_actual NUMERIC;
BEGIN
    
    -- ========================================================================
    -- PASO 1: Verificar si existe (por url + fuente)
    -- ========================================================================
    SELECT 
        pv.id, 
        pv.status,
        pv.campos_bloqueados,
        pv.precio_usd,
        pv.area_total_m2,
        pv.dormitorios,
        pv.banos
    INTO 
        v_id,
        v_status_actual,
        v_campos_bloqueados,
        v_precio_actual,
        v_area_actual,
        v_dormitorios_actual,
        v_banos_actual
    FROM propiedades_v2 pv
    WHERE pv.url = p_url AND pv.fuente = p_fuente;
    
    -- ========================================================================
    -- PASO 2: NUEVA PROPIEDAD (INSERT)
    -- ========================================================================
    IF v_id IS NULL THEN
        v_es_nueva := TRUE;
        
        INSERT INTO propiedades_v2 (
            -- Identificación
            url,
            fuente,
            codigo_propiedad,
            
            -- Clasificación
            tipo_operacion,
            tipo_propiedad_original,
            estado_construccion,
            
            -- Financiero
            precio_usd,
            precio_usd_original,
            moneda_original,
            
            -- Físico
            area_total_m2,
            dormitorios,
            banos,
            estacionamientos,
            
            -- GPS
            latitud,
            longitud,
            
            -- Discovery
            datos_json_discovery,
            fecha_discovery,
            metodo_discovery,
            
            -- Status y fechas
            status,
            fecha_publicacion,
            fecha_creacion,
            fecha_actualizacion,
            
            -- Flags
            es_activa,
            es_para_matching
        )
        VALUES (
            p_url,
            p_fuente,
            p_codigo_propiedad,
            
            p_tipo_operacion::tipo_operacion_enum,
            p_tipo_propiedad_original,
            p_estado_construccion::estado_construccion_enum,
            
            p_precio_usd,
            p_precio_usd_original,
            p_moneda_original,
            
            p_area_total_m2,
            p_dormitorios,
            p_banos,
            p_estacionamientos,
            
            p_latitud,
            p_longitud,
            
            p_datos_json_discovery,
            NOW(),
            p_metodo_discovery,
            
            CASE
                WHEN p_tipo_operacion NOT IN ('venta') THEN 'excluido_operacion'::estado_propiedad
                ELSE 'nueva'::estado_propiedad
            END,
            p_fecha_publicacion,
            NOW(),
            NOW(),
            
            TRUE,
            TRUE
        )
        RETURNING propiedades_v2.id INTO v_id;

        v_status_nuevo := CASE
            WHEN p_tipo_operacion NOT IN ('venta') THEN 'excluido_operacion'::estado_propiedad
            ELSE 'nueva'::estado_propiedad
        END;
        
    -- ========================================================================
    -- PASO 3: PROPIEDAD EXISTENTE (UPDATE)
    -- ========================================================================
    ELSE
        -- 3.1 Detectar cambios críticos (solo si no están bloqueados)
        IF (v_campos_bloqueados->>'precio_usd')::BOOLEAN IS NOT TRUE THEN
            IF v_precio_actual IS DISTINCT FROM p_precio_usd THEN
                v_cambio_detectado := TRUE;
                v_discrepancias := v_discrepancias || jsonb_build_array(
                    registrar_discrepancia_cambio(
                        'precio_usd',
                        v_precio_actual,
                        p_precio_usd
                    )
                );
            END IF;
        END IF;
        
        IF (v_campos_bloqueados->>'area_total_m2')::BOOLEAN IS NOT TRUE THEN
            IF v_area_actual IS DISTINCT FROM p_area_total_m2 THEN
                v_cambio_detectado := TRUE;
                v_discrepancias := v_discrepancias || jsonb_build_array(
                    registrar_discrepancia_cambio(
                        'area_total_m2',
                        v_area_actual,
                        p_area_total_m2
                    )
                );
            END IF;
        END IF;
        
        IF (v_campos_bloqueados->>'dormitorios')::BOOLEAN IS NOT TRUE THEN
            IF v_dormitorios_actual IS DISTINCT FROM p_dormitorios THEN
                v_cambio_detectado := TRUE;
                v_discrepancias := v_discrepancias || jsonb_build_array(
                    registrar_discrepancia_cambio(
                        'dormitorios',
                        v_dormitorios_actual,
                        p_dormitorios
                    )
                );
            END IF;
        END IF;
        
        -- 3.2 Determinar nuevo status
        v_status_nuevo := determinar_status_post_discovery(
            v_id,
            v_status_actual,
            v_cambio_detectado
        );
        
        -- 3.3 UPDATE respetando candados
        UPDATE propiedades_v2
        SET
            -- Actualizar solo si NO están bloqueados
            codigo_propiedad = CASE 
                WHEN (campos_bloqueados->>'codigo_propiedad')::BOOLEAN = TRUE 
                THEN codigo_propiedad 
                ELSE COALESCE(p_codigo_propiedad, codigo_propiedad) 
            END,
            
            tipo_operacion = CASE 
                WHEN (campos_bloqueados->>'tipo_operacion')::BOOLEAN = TRUE 
                THEN tipo_operacion 
                ELSE COALESCE(p_tipo_operacion::tipo_operacion_enum, tipo_operacion) 
            END,
            
            tipo_propiedad_original = CASE 
                WHEN (campos_bloqueados->>'tipo_propiedad_original')::BOOLEAN = TRUE 
                THEN tipo_propiedad_original 
                ELSE COALESCE(p_tipo_propiedad_original, tipo_propiedad_original) 
            END,
            
            estado_construccion = CASE 
                WHEN (campos_bloqueados->>'estado_construccion')::BOOLEAN = TRUE 
                THEN estado_construccion 
                ELSE COALESCE(p_estado_construccion::estado_construccion_enum, estado_construccion) 
            END,
            
            -- Financiero
            precio_usd = CASE 
                WHEN (campos_bloqueados->>'precio_usd')::BOOLEAN = TRUE 
                THEN precio_usd 
                ELSE COALESCE(p_precio_usd, precio_usd) 
            END,
            
            precio_usd_original = COALESCE(p_precio_usd_original, precio_usd_original),
            moneda_original = COALESCE(p_moneda_original, moneda_original),
            
            -- Físico
            area_total_m2 = CASE 
                WHEN (campos_bloqueados->>'area_total_m2')::BOOLEAN = TRUE 
                THEN area_total_m2 
                ELSE COALESCE(p_area_total_m2, area_total_m2) 
            END,
            
            dormitorios = CASE 
                WHEN (campos_bloqueados->>'dormitorios')::BOOLEAN = TRUE 
                THEN dormitorios 
                ELSE COALESCE(p_dormitorios, dormitorios) 
            END,
            
            banos = CASE 
                WHEN (campos_bloqueados->>'banos')::BOOLEAN = TRUE 
                THEN banos 
                ELSE COALESCE(p_banos, banos) 
            END,
            
            estacionamientos = CASE 
                WHEN (campos_bloqueados->>'estacionamientos')::BOOLEAN = TRUE 
                THEN estacionamientos 
                ELSE COALESCE(p_estacionamientos, estacionamientos) 
            END,
            
            -- GPS
            latitud = CASE 
                WHEN (campos_bloqueados->>'latitud')::BOOLEAN = TRUE 
                THEN latitud 
                ELSE COALESCE(p_latitud, latitud) 
            END,
            
            longitud = CASE 
                WHEN (campos_bloqueados->>'longitud')::BOOLEAN = TRUE 
                THEN longitud 
                ELSE COALESCE(p_longitud, longitud) 
            END,
            
            -- Discovery
            datos_json_discovery = p_datos_json_discovery,
            fecha_discovery = NOW(),
            metodo_discovery = p_metodo_discovery,
            
            -- Status (determinar según cambios)
            status = v_status_nuevo,
            
            -- Metadata
            fecha_publicacion = COALESCE(p_fecha_publicacion, fecha_publicacion),
            fecha_actualizacion = NOW(),
            
            -- Discrepancias (agregar nuevas)
            campos_conflicto = CASE 
                WHEN jsonb_array_length(v_discrepancias) > 0 
                THEN COALESCE(campos_conflicto, '[]'::JSONB) || v_discrepancias
                ELSE campos_conflicto
            END,
            
            -- Flags
            es_activa = TRUE,
            depende_de_tc = CASE 
                WHEN p_moneda_original != 'USD' THEN TRUE
                ELSE COALESCE(depende_de_tc, FALSE)
            END
            
        WHERE propiedades_v2.id = v_id;
        
    END IF;
    
    -- ========================================================================
    -- PASO 4: Retornar resultado
    -- ========================================================================
    RETURN QUERY
    SELECT 
        v_id,
        v_status_nuevo,
        v_es_nueva,
        v_discrepancias;
    
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMENTARIOS Y DOCUMENTACIÓN
-- ============================================================================

COMMENT ON FUNCTION registrar_discovery IS 'Función principal Flujo A: INSERT/UPDATE idempotente desde API/Grid con respeto a candados';

-- ============================================================================
-- EJEMPLO DE USO
-- ============================================================================

/*
-- Ejemplo 1: Nueva propiedad (Century21)
SELECT * FROM registrar_discovery(
    p_url := 'https://c21.com.bo/propiedad/12345',
    p_fuente := 'century21',
    p_codigo_propiedad := 'C21-12345',
    p_tipo_operacion := 'venta',
    p_tipo_propiedad_original := 'Departamento',
    p_precio_usd := 120000,
    p_area_total_m2 := 85,
    p_dormitorios := 2,
    p_banos := 2,
    p_estacionamientos := 1,
    p_latitud := -17.7680,
    p_longitud := -63.1885,
    p_metodo_discovery := 'map_grid',
    p_datos_json_discovery := '{"fuente": "map_grid", "timestamp": "2025-12-11T01:00:00Z"}'::JSONB
);

-- Ejemplo 2: Actualizar existente (Remax)
SELECT * FROM registrar_discovery(
    p_url := 'https://remax.bo/propiedades/12345',
    p_fuente := 'remax',
    p_codigo_propiedad := 'RMX-12345',
    p_precio_usd := 95000,  -- Cambió el precio
    p_area_total_m2 := 72,
    p_dormitorios := 2,
    p_banos := 1,
    p_latitud := -17.7560,
    p_longitud := -63.0820,
    p_metodo_discovery := 'api_rest',
    p_datos_json_discovery := '{"fuente": "api_rest", "MLSID": "120047032-21"}'::JSONB
);

-- Verificar resultado
SELECT 
    id,
    url,
    status,
    precio_usd,
    campos_conflicto,
    fecha_discovery,
    fecha_actualizacion
FROM propiedades_v2
WHERE fuente = 'century21'
ORDER BY fecha_discovery DESC
LIMIT 5;
*/