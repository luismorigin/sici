-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: merge_discovery_enrichment.sql
-- Propósito: Unificar datos de Discovery + Enrichment respetando candados
-- Versión: 2.0.0
-- Fecha: 2025-12-23
-- =====================================================================================
-- CAMBIOS v2.0.0:
--   - Helper obligatorio para paths por portal (get_discovery_value)
--   - Regla precio: Discovery si USD puro, fallback Enrichment si discrepancia >10%
--   - Regla área/dorms/baños: Discovery > Enrichment (INVERTIDO de v1.2.0)
--   - Estructura datos_json agrupada (11 secciones)
--   - Scoring post-merge integrado
--   - Validación status antes de merge (solo 'nueva', 'actualizado')
--   - Cálculo de discrepancias con thresholds
-- =====================================================================================
-- DEPENDENCIAS:
--   - funciones_helper_merge.sql (get_discovery_value, calcular_discrepancia_*)
-- =====================================================================================
-- ESTADOS VÁLIDOS PARA MERGE:
--   - 'nueva' (sin enrichment aún)
--   - 'actualizado' (con enrichment procesado)
-- =====================================================================================
-- STATUS FINAL (CONTRATO SEMÁNTICO):
--   - SIEMPRE 'completado' → Merge es el ÚNICO que cierra el pipeline
-- =====================================================================================

DROP FUNCTION IF EXISTS merge_discovery_enrichment(INTEGER);
DROP FUNCTION IF EXISTS merge_discovery_enrichment(TEXT);

CREATE OR REPLACE FUNCTION merge_discovery_enrichment(p_identificador TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    -- Propiedad
    v_prop RECORD;
    v_fuente TEXT;
    
    -- JSONs fuente
    v_candados JSONB;
    v_discovery JSONB;
    v_enrichment JSONB;
    
    -- Valores Discovery extraídos con helper
    v_disc_precio_usd NUMERIC(12,2);
    v_disc_area NUMERIC(10,2);
    v_disc_dormitorios INTEGER;
    v_disc_banos NUMERIC(3,1);
    v_disc_estacionamientos INTEGER;
    v_disc_latitud NUMERIC(10,8);
    v_disc_longitud NUMERIC(11,8);
    v_disc_moneda TEXT;
    
    -- Valores Enrichment
    v_enr_precio_usd NUMERIC(12,2);
    v_enr_area NUMERIC(10,2);
    v_enr_dormitorios INTEGER;
    v_enr_banos NUMERIC(3,1);
    v_enr_estacionamientos INTEGER;
    v_enr_latitud NUMERIC(10,8);
    v_enr_longitud NUMERIC(11,8);
    v_enr_precio_fue_normalizado BOOLEAN;
    v_enr_tipo_cambio_usado NUMERIC(10,4);
    v_enr_tipo_cambio_detectado TEXT;
    
    -- Valores finales (resultado del merge)
    v_precio_final NUMERIC(12,2);
    v_area_final NUMERIC(10,2);
    v_dormitorios_final INTEGER;
    v_banos_final NUMERIC(3,1);
    v_estacionamientos_final INTEGER;
    v_latitud_final NUMERIC(10,8);
    v_longitud_final NUMERIC(11,8);
    
    -- Fuentes de cada campo
    v_fuente_precio TEXT := 'none';
    v_fuente_area TEXT := 'none';
    v_fuente_dormitorios TEXT := 'none';
    v_fuente_banos TEXT := 'none';
    v_fuente_estacionamientos TEXT := 'none';
    v_fuente_gps TEXT := 'none';
    
    -- Discrepancias
    v_disc_precio JSONB;
    v_disc_area_calc JSONB;
    v_disc_dormitorios_calc JSONB;
    v_disc_banos_calc JSONB;
    v_disc_gps JSONB;
    v_discrepancias JSONB;
    
    -- Tracking
    v_campos_updated TEXT[] := ARRAY[]::TEXT[];
    v_campos_kept TEXT[] := ARRAY[]::TEXT[];
    v_campos_blocked TEXT[] := ARRAY[]::TEXT[];
    v_datos_criticos_faltantes TEXT[] := ARRAY[]::TEXT[];
    
    -- Status
    v_status_anterior TEXT;
    v_status_final estado_propiedad := 'completado';
    
    -- Scoring
    v_score_calidad_dato INTEGER := 0;
    v_score_fiduciario INTEGER := 0;
    v_score_core INTEGER := 0;
    v_score_opcionales INTEGER := 0;
    v_flags_semanticos JSONB := '[]'::JSONB;
    v_precio_m2 NUMERIC(10,2);
    
    -- Resultado final
    v_datos_json_final JSONB;
    v_cambios_merge JSONB;
    v_result JSONB;
    
    -- Discovery metadata
    v_discovery_metadata JSONB;
    
BEGIN
    -- =========================================================================
    -- FASE 0: BUSCAR PROPIEDAD Y VALIDAR STATUS
    -- =========================================================================
    
    -- Buscar por codigo_propiedad primero (más común), luego por ID, luego por URL
    SELECT * INTO v_prop FROM propiedades_v2 WHERE codigo_propiedad = p_identificador;
    
    IF NOT FOUND THEN
        -- Intentar por ID numérico
        BEGIN
            SELECT * INTO v_prop FROM propiedades_v2 WHERE id = p_identificador::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            -- No es un número válido, ignorar
            NULL;
        END;
    END IF;
    
    IF NOT FOUND THEN
        -- Intentar por URL
        SELECT * INTO v_prop FROM propiedades_v2 WHERE url = p_identificador;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Propiedad no encontrada',
            'identificador', p_identificador,
            'timestamp', NOW()
        );
    END IF;
    
    -- Guardar status anterior
    v_status_anterior := v_prop.status::TEXT;
    
    -- Validar status (solo 'nueva' o 'actualizado')
    IF v_prop.status::TEXT NOT IN ('nueva', 'actualizado') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Status no válido para merge',
            'status_actual', v_prop.status::TEXT,
            'status_permitidos', ARRAY['nueva', 'actualizado'],
            'property_id', v_prop.codigo_propiedad,
            'timestamp', NOW()
        );
    END IF;
    
    -- Validar que tenga discovery
    IF v_prop.datos_json_discovery IS NULL THEN
        RETURN jsonb_build_object(
            'success', false, 
            'error', 'Sin datos Discovery',
            'property_id', v_prop.codigo_propiedad,
            'timestamp', NOW()
        );
    END IF;

    -- Extraer datos base
    v_fuente := LOWER(v_prop.fuente);
    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::JSONB);
    v_discovery := v_prop.datos_json_discovery;
    v_enrichment := COALESCE(v_prop.datos_json_enrichment, '{}'::JSONB);

    -- =========================================================================
    -- FASE 1: EXTRAER VALORES DE DISCOVERY (usando helper)
    -- =========================================================================
    
    v_disc_precio_usd := get_discovery_value_numeric('precio_usd', v_discovery, v_fuente);
    v_disc_area := get_discovery_value_numeric('area_total_m2', v_discovery, v_fuente);
    v_disc_dormitorios := get_discovery_value_integer('dormitorios', v_discovery, v_fuente);
    v_disc_banos := get_discovery_value_numeric('banos', v_discovery, v_fuente);
    v_disc_estacionamientos := get_discovery_value_integer('estacionamientos', v_discovery, v_fuente);
    v_disc_latitud := get_discovery_value_numeric('latitud', v_discovery, v_fuente);
    v_disc_longitud := get_discovery_value_numeric('longitud', v_discovery, v_fuente);
    v_disc_moneda := get_discovery_value('moneda_original', v_discovery, v_fuente);

    -- =========================================================================
    -- FASE 2: EXTRAER VALORES DE ENRICHMENT
    -- =========================================================================
    
    v_enr_precio_usd := (v_enrichment->>'precio_usd')::NUMERIC(12,2);
    v_enr_area := (v_enrichment->>'area_total_m2')::NUMERIC(10,2);
    v_enr_dormitorios := (v_enrichment->>'dormitorios')::INTEGER;
    v_enr_banos := (v_enrichment->>'banos')::NUMERIC(3,1);
    v_enr_estacionamientos := CASE 
        WHEN v_enrichment->>'estacionamientos' ~ '^[0-9]+$' 
        THEN (v_enrichment->>'estacionamientos')::INTEGER 
        ELSE NULL 
    END;
    v_enr_latitud := (v_enrichment->>'latitud')::NUMERIC(10,8);
    v_enr_longitud := (v_enrichment->>'longitud')::NUMERIC(11,8);
    v_enr_precio_fue_normalizado := COALESCE((v_enrichment->>'precio_fue_normalizado')::BOOLEAN, false);
    v_enr_tipo_cambio_usado := (v_enrichment->>'tipo_cambio_usado')::NUMERIC(10,4);
    v_enr_tipo_cambio_detectado := COALESCE(v_enrichment->>'tipo_cambio_detectado', 'no_especificado');

    -- =========================================================================
    -- FASE 3: RESOLVER CAMPOS CON PRIORIDAD
    -- =========================================================================
    
    -- -----------------------------------------------------------------
    -- PRECIO USD (Regla especial con fallback)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'precio_usd')::BOOLEAN, false) THEN
        -- Candado: mantener valor actual
        v_precio_final := v_prop.precio_usd;
        v_fuente_precio := 'blocked';
        v_campos_blocked := array_append(v_campos_blocked, 'precio_usd');
        
    ELSIF v_enr_precio_fue_normalizado OR v_enr_tipo_cambio_detectado != 'no_especificado' THEN
        -- Enrichment hizo conversión especial (BOB→USD), usar enrichment
        v_precio_final := v_enr_precio_usd;
        v_fuente_precio := 'enrichment';
        v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        
    ELSIF v_disc_precio_usd IS NOT NULL THEN
        -- Discovery tiene precio USD (Remax siempre, C21 solo si moneda=USD)
        -- Calcular discrepancia
        v_disc_precio := calcular_discrepancia_porcentual(v_disc_precio_usd, v_enr_precio_usd, 'precio');
        
        -- Si discrepancia > 10%, usar enrichment como fallback
        IF (v_disc_precio->>'diff_pct')::NUMERIC > 0.10 THEN
            v_precio_final := v_enr_precio_usd;
            v_fuente_precio := 'enrichment_fallback';
            v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        ELSE
            -- Discrepancia aceptable, usar discovery
            v_precio_final := v_disc_precio_usd;
            v_fuente_precio := 'discovery';
            v_campos_kept := array_append(v_campos_kept, 'precio_usd');
        END IF;
    ELSE
        -- Sin precio discovery, usar enrichment
        v_precio_final := v_enr_precio_usd;
        v_fuente_precio := 'enrichment';
        IF v_enr_precio_usd IS DISTINCT FROM v_prop.precio_usd THEN
            v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        ELSE
            v_campos_kept := array_append(v_campos_kept, 'precio_usd');
        END IF;
    END IF;
    
    -- -----------------------------------------------------------------
    -- ÁREA (Discovery > Enrichment)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'area_total_m2')::BOOLEAN, false) THEN
        v_area_final := v_prop.area_total_m2;
        v_fuente_area := 'blocked';
        v_campos_blocked := array_append(v_campos_blocked, 'area_total_m2');
    ELSIF v_disc_area IS NOT NULL THEN
        v_area_final := v_disc_area;
        v_fuente_area := 'discovery';
        v_campos_kept := array_append(v_campos_kept, 'area_total_m2');
    ELSIF v_enr_area IS NOT NULL THEN
        v_area_final := v_enr_area;
        v_fuente_area := 'enrichment';
        v_campos_updated := array_append(v_campos_updated, 'area_total_m2');
    ELSE
        v_area_final := v_prop.area_total_m2;
        v_fuente_area := 'existing';
        v_campos_kept := array_append(v_campos_kept, 'area_total_m2');
    END IF;
    
    -- -----------------------------------------------------------------
    -- DORMITORIOS (Discovery > Enrichment)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'dormitorios')::BOOLEAN, false) THEN
        v_dormitorios_final := v_prop.dormitorios;
        v_fuente_dormitorios := 'blocked';
        v_campos_blocked := array_append(v_campos_blocked, 'dormitorios');
    ELSIF v_disc_dormitorios IS NOT NULL THEN
        v_dormitorios_final := v_disc_dormitorios;
        v_fuente_dormitorios := 'discovery';
        v_campos_kept := array_append(v_campos_kept, 'dormitorios');
    ELSIF v_enr_dormitorios IS NOT NULL THEN
        v_dormitorios_final := v_enr_dormitorios;
        v_fuente_dormitorios := 'enrichment';
        v_campos_updated := array_append(v_campos_updated, 'dormitorios');
    ELSE
        v_dormitorios_final := v_prop.dormitorios;
        v_fuente_dormitorios := 'existing';
        v_campos_kept := array_append(v_campos_kept, 'dormitorios');
    END IF;
    
    -- -----------------------------------------------------------------
    -- BAÑOS (Discovery > Enrichment)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'banos')::BOOLEAN, false) THEN
        v_banos_final := v_prop.banos;
        v_fuente_banos := 'blocked';
        v_campos_blocked := array_append(v_campos_blocked, 'banos');
    ELSIF v_disc_banos IS NOT NULL THEN
        v_banos_final := v_disc_banos;
        v_fuente_banos := 'discovery';
        v_campos_kept := array_append(v_campos_kept, 'banos');
    ELSIF v_enr_banos IS NOT NULL THEN
        v_banos_final := v_enr_banos;
        v_fuente_banos := 'enrichment';
        v_campos_updated := array_append(v_campos_updated, 'banos');
    ELSE
        v_banos_final := v_prop.banos;
        v_fuente_banos := 'existing';
        v_campos_kept := array_append(v_campos_kept, 'banos');
    END IF;
    
    -- -----------------------------------------------------------------
    -- ESTACIONAMIENTOS (Discovery > Enrichment)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'estacionamientos')::BOOLEAN, false) THEN
        v_estacionamientos_final := v_prop.estacionamientos;
        v_fuente_estacionamientos := 'blocked';
        v_campos_blocked := array_append(v_campos_blocked, 'estacionamientos');
    ELSIF v_disc_estacionamientos IS NOT NULL THEN
        v_estacionamientos_final := v_disc_estacionamientos;
        v_fuente_estacionamientos := 'discovery';
        v_campos_kept := array_append(v_campos_kept, 'estacionamientos');
    ELSIF v_enr_estacionamientos IS NOT NULL THEN
        v_estacionamientos_final := v_enr_estacionamientos;
        v_fuente_estacionamientos := 'enrichment';
        v_campos_updated := array_append(v_campos_updated, 'estacionamientos');
    ELSE
        v_estacionamientos_final := v_prop.estacionamientos;
        v_fuente_estacionamientos := 'existing';
        v_campos_kept := array_append(v_campos_kept, 'estacionamientos');
    END IF;
    
    -- -----------------------------------------------------------------
    -- GPS - LATITUD (Discovery > Enrichment)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'latitud')::BOOLEAN, false) THEN
        v_latitud_final := v_prop.latitud;
        v_fuente_gps := 'blocked';
        v_campos_blocked := array_append(v_campos_blocked, 'latitud');
    ELSIF v_disc_latitud IS NOT NULL THEN
        v_latitud_final := v_disc_latitud;
        v_fuente_gps := 'discovery';
        v_campos_kept := array_append(v_campos_kept, 'latitud');
    ELSIF v_enr_latitud IS NOT NULL THEN
        v_latitud_final := v_enr_latitud;
        v_fuente_gps := 'enrichment';
        v_campos_updated := array_append(v_campos_updated, 'latitud');
    ELSE
        v_latitud_final := v_prop.latitud;
    END IF;
    
    -- -----------------------------------------------------------------
    -- GPS - LONGITUD (Discovery > Enrichment)
    -- -----------------------------------------------------------------
    IF COALESCE((v_candados->>'longitud')::BOOLEAN, false) THEN
        v_longitud_final := v_prop.longitud;
        v_campos_blocked := array_append(v_campos_blocked, 'longitud');
    ELSIF v_disc_longitud IS NOT NULL THEN
        v_longitud_final := v_disc_longitud;
        v_campos_kept := array_append(v_campos_kept, 'longitud');
    ELSIF v_enr_longitud IS NOT NULL THEN
        v_longitud_final := v_enr_longitud;
        v_campos_updated := array_append(v_campos_updated, 'longitud');
    ELSE
        v_longitud_final := v_prop.longitud;
    END IF;

    -- =========================================================================
    -- FASE 4: CALCULAR DISCREPANCIAS
    -- =========================================================================
    
    -- Precio (ya calculado si aplica)
    IF v_disc_precio IS NULL THEN
        v_disc_precio := calcular_discrepancia_porcentual(v_disc_precio_usd, v_enr_precio_usd, 'precio');
    END IF;
    -- Agregar fuente usada
    v_disc_precio := v_disc_precio || jsonb_build_object('fuente_usada', v_fuente_precio);
    
    -- Área
    v_disc_area_calc := calcular_discrepancia_porcentual(v_disc_area, v_enr_area, 'area');
    
    -- Dormitorios
    v_disc_dormitorios_calc := calcular_discrepancia_exacta(v_disc_dormitorios, v_enr_dormitorios, 'dormitorios');
    
    -- Baños (convertir a integer para comparación)
    v_disc_banos_calc := calcular_discrepancia_exacta(
        CASE WHEN v_disc_banos IS NOT NULL THEN v_disc_banos::INTEGER ELSE NULL END,
        CASE WHEN v_enr_banos IS NOT NULL THEN v_enr_banos::INTEGER ELSE NULL END,
        'banos'
    );
    
    -- GPS (distancia aproximada en metros)
    IF v_disc_latitud IS NOT NULL AND v_enr_latitud IS NOT NULL THEN
        v_disc_gps := jsonb_build_object(
            'distancia_metros', ROUND(
                111000 * SQRT(
                    POWER(v_disc_latitud - v_enr_latitud, 2) + 
                    POWER((v_disc_longitud - v_enr_longitud) * COS(RADIANS(v_disc_latitud)), 2)
                )
            ),
            'flag', CASE 
                WHEN 111000 * SQRT(
                    POWER(v_disc_latitud - v_enr_latitud, 2) + 
                    POWER((v_disc_longitud - v_enr_longitud) * COS(RADIANS(v_disc_latitud)), 2)
                ) > 100 THEN 'warning'
                ELSE NULL
            END
        );
    ELSE
        v_disc_gps := jsonb_build_object('distancia_metros', NULL, 'flag', NULL);
    END IF;
    
    -- Compilar discrepancias
    v_discrepancias := jsonb_build_object(
        'precio', v_disc_precio,
        'area', v_disc_area_calc,
        'dormitorios', v_disc_dormitorios_calc,
        'banos', v_disc_banos_calc,
        'gps', v_disc_gps
    );

    -- =========================================================================
    -- FASE 5: VERIFICAR DATOS CRÍTICOS FALTANTES
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
    IF v_dormitorios_final IS NULL THEN
        v_datos_criticos_faltantes := array_append(v_datos_criticos_faltantes, 'dormitorios');
    END IF;

    -- =========================================================================
    -- FASE 6: SCORING POST-MERGE (try/catch separado)
    -- =========================================================================
    
    BEGIN
        -- Score campos core (70 pts máx = 7 campos × 10 pts)
        v_score_core := 0;
        
        IF v_precio_final IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        IF v_area_final IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        IF v_dormitorios_final IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        IF v_banos_final IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        IF v_latitud_final IS NOT NULL AND v_longitud_final IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        IF v_prop.tipo_operacion IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        IF v_prop.estado_construccion IS NOT NULL THEN v_score_core := v_score_core + 10; END IF;
        
        -- Score opcionales (30 pts máx)
        v_score_opcionales := 0;
        
        IF v_estacionamientos_final IS NOT NULL THEN v_score_opcionales := v_score_opcionales + 5; END IF;
        IF v_enrichment->>'nombre_edificio' IS NOT NULL THEN v_score_opcionales := v_score_opcionales + 5; END IF;
        IF v_enrichment->'amenities' IS NOT NULL THEN v_score_opcionales := v_score_opcionales + 5; END IF;
        IF v_enrichment->>'descripcion' IS NOT NULL THEN v_score_opcionales := v_score_opcionales + 5; END IF;
        IF v_enrichment->>'agente_nombre' IS NOT NULL THEN v_score_opcionales := v_score_opcionales + 5; END IF;
        IF (v_enrichment->>'cantidad_fotos')::INTEGER > 0 THEN v_score_opcionales := v_score_opcionales + 5; END IF;
        
        v_score_calidad_dato := v_score_core + v_score_opcionales;
        
        -- Validaciones coherencia para score fiduciario
        v_score_fiduciario := v_score_calidad_dato;
        v_flags_semanticos := '[]'::JSONB;
        
        -- Precio/m²
        IF v_precio_final IS NOT NULL AND v_area_final IS NOT NULL AND v_area_final > 0 THEN
            v_precio_m2 := v_precio_final / v_area_final;
            
            IF v_precio_m2 < 500 THEN
                v_score_fiduciario := v_score_fiduciario - 15;
                v_flags_semanticos := v_flags_semanticos || jsonb_build_array(jsonb_build_object(
                    'tipo', 'error',
                    'campo', 'precio_m2',
                    'valor', v_precio_m2,
                    'razon', 'Precio/m² muy bajo (<500 USD)'
                ));
            ELSIF v_precio_m2 > 5000 THEN
                v_score_fiduciario := v_score_fiduciario - 10;
                v_flags_semanticos := v_flags_semanticos || jsonb_build_array(jsonb_build_object(
                    'tipo', 'warning',
                    'campo', 'precio_m2',
                    'valor', v_precio_m2,
                    'razon', 'Precio/m² muy alto (>5000 USD)'
                ));
            END IF;
        END IF;
        
        -- Área vs Dormitorios
        IF v_area_final IS NOT NULL AND v_area_final < 30 AND v_dormitorios_final IS NOT NULL AND v_dormitorios_final > 1 THEN
            v_score_fiduciario := v_score_fiduciario - 5;
            v_flags_semanticos := v_flags_semanticos || jsonb_build_array(jsonb_build_object(
                'tipo', 'warning',
                'campo', 'area_vs_dormitorios',
                'razon', 'Área pequeña (<30m²) para múltiples dormitorios'
            ));
        END IF;
        
        -- Baños vs Dormitorios
        IF v_banos_final IS NOT NULL AND v_dormitorios_final IS NOT NULL AND v_banos_final > v_dormitorios_final + 2 THEN
            v_score_fiduciario := v_score_fiduciario - 5;
            v_flags_semanticos := v_flags_semanticos || jsonb_build_array(jsonb_build_object(
                'tipo', 'warning',
                'campo', 'banos_vs_dormitorios',
                'razon', 'Más baños de lo típico para cantidad de dormitorios'
            ));
        END IF;
        
        -- Asegurar score mínimo de 0
        v_score_fiduciario := GREATEST(0, v_score_fiduciario);
        
    EXCEPTION WHEN OTHERS THEN
        -- Si scoring falla, usar valores por defecto
        v_score_calidad_dato := 0;
        v_score_fiduciario := 0;
        v_flags_semanticos := jsonb_build_array(jsonb_build_object(
            'tipo', 'error',
            'campo', 'scoring',
            'razon', 'Error calculando scores: ' || SQLERRM
        ));
    END;

    -- =========================================================================
    -- FASE 7: CONSTRUIR DISCOVERY METADATA
    -- =========================================================================
    
    v_discovery_metadata := jsonb_build_object(
        'status_portal', get_discovery_value('status_portal', v_discovery, v_fuente),
        'cuota_mantenimiento', get_discovery_value('cuota_mantenimiento', v_discovery, v_fuente),
        'tc_portal_id', get_discovery_value('tc_portal_id', v_discovery, v_fuente),
        'id_original', get_discovery_value('id_original', v_discovery, v_fuente),
        'exclusiva', CASE 
            WHEN get_discovery_value('exclusiva', v_discovery, v_fuente) = 'true' THEN true
            ELSE false
        END,
        'fecha_alta', get_discovery_value('fecha_alta', v_discovery, v_fuente)
    );

    -- =========================================================================
    -- FASE 8: CONSTRUIR datos_json FINAL (estructura agrupada)
    -- =========================================================================
    
    v_datos_json_final := jsonb_build_object(
        -- METADATA MERGE
        'version_merge', '2.0.0',
        'timestamp_merge', NOW(),
        'fuente', v_fuente,
        
        -- FINANCIERO
        'financiero', jsonb_build_object(
            'precio_usd', v_precio_final,
            'precio_usd_original', COALESCE(v_disc_precio_usd, v_enr_precio_usd),
            'precio_fue_normalizado', v_enr_precio_fue_normalizado,
            'precio_m2', CASE 
                WHEN v_precio_final IS NOT NULL AND v_area_final IS NOT NULL AND v_area_final > 0 
                THEN ROUND(v_precio_final / v_area_final, 2)
                ELSE NULL
            END,
            'moneda_original', COALESCE(v_disc_moneda, v_enrichment->>'moneda_original'),
            'tipo_cambio_usado', v_enr_tipo_cambio_usado,
            'tipo_cambio_detectado', v_enr_tipo_cambio_detectado,
            'fuente_precio', v_fuente_precio,
            'precio_sospechoso', COALESCE((v_enrichment->>'precio_sospechoso')::BOOLEAN, false),
            'precio_conflicto', COALESCE((v_enrichment->>'precio_conflicto')::BOOLEAN, false)
        ),
        
        -- FÍSICO
        'fisico', jsonb_build_object(
            'area_total_m2', v_area_final,
            'fuente_area', v_fuente_area,
            'dormitorios', v_dormitorios_final,
            'fuente_dormitorios', v_fuente_dormitorios,
            'banos', v_banos_final,
            'fuente_banos', v_fuente_banos,
            'estacionamientos', v_estacionamientos_final,
            'es_monoambiente', (v_dormitorios_final IS NULL OR v_dormitorios_final = 0),
            'es_multiproyecto', COALESCE(v_prop.es_multiproyecto, false),
            'dormitorios_opciones', v_enrichment->'dormitorios_opciones',
            'precio_min_usd', v_prop.precio_min_usd,
            'precio_max_usd', v_prop.precio_max_usd,
            'area_min_m2', (v_enrichment->>'area_min_m2')::NUMERIC,
            'area_max_m2', (v_enrichment->>'area_max_m2')::NUMERIC
        ),
        
        -- UBICACIÓN
        'ubicacion', jsonb_build_object(
            'latitud', v_latitud_final,
            'longitud', v_longitud_final,
            'fuente_gps', v_fuente_gps,
            'zona_validada_gps', v_enrichment->>'zona_validada_gps',
            'metodo_gps', CASE 
                WHEN v_fuente_gps = 'discovery' THEN 'api_portal'
                WHEN v_fuente_gps = 'enrichment' THEN 'html_parsing'
                ELSE 'unknown'
            END
        ),
        
        -- PROYECTO
        'proyecto', jsonb_build_object(
            'nombre_edificio', v_enrichment->>'nombre_edificio',
            'fuente_nombre_edificio', v_enrichment->>'fuente_nombre_edificio',
            'nombre_edificio_nivel_confianza', (v_enrichment->>'nombre_edificio_nivel_confianza')::NUMERIC,
            'id_proyecto_master_sugerido', v_enrichment->>'id_proyecto_master_sugerido',
            'metodo_match_sugerido', v_enrichment->>'metodo_match_sugerido',
            'estado_construccion', v_prop.estado_construccion
        ),
        
        -- AMENITIES (de enrichment)
        'amenities', jsonb_build_object(
            'lista', v_enrichment->'amenities',
            'equipamiento', v_enrichment->'equipamiento',
            'estado_amenities', v_enrichment->'estado_amenities'
        ),
        
        -- AGENTE (de enrichment)
        'agente', jsonb_build_object(
            'nombre', v_enrichment->>'agente_nombre',
            'telefono', v_enrichment->>'agente_telefono',
            'oficina_nombre', v_enrichment->>'oficina_nombre'
        ),
        
        -- CONTENIDO (de enrichment)
        'contenido', jsonb_build_object(
            'descripcion', v_enrichment->>'descripcion',
            'titulo', v_enrichment->>'titulo',
            'fotos_urls', v_enrichment->'fotos_urls',
            'cantidad_fotos', (v_enrichment->>'cantidad_fotos')::INTEGER
        ),
        
        -- CALIDAD
        'calidad', jsonb_build_object(
            'score_calidad_dato', v_score_calidad_dato,
            'score_fiduciario', v_score_fiduciario,
            'score_core', v_score_core,
            'score_opcionales', v_score_opcionales,
            'nivel_confianza_general', (v_enrichment->>'nivel_confianza_general')::NUMERIC,
            'conflictos', v_enrichment->'conflictos',
            'flags_semanticos', v_flags_semanticos,
            'requiere_revision_humana', (
                array_length(v_datos_criticos_faltantes, 1) > 0 OR 
                v_score_fiduciario < 50 OR
                v_fuente_precio = 'enrichment_fallback'
            ),
            'fuente_precio', v_fuente_precio,
            'fuente_confianza_area', v_enrichment->>'fuente_confianza_area',
            'fuente_confianza_dormitorios', v_enrichment->>'fuente_confianza_dormitorios',
            'fuente_confianza_banos', v_enrichment->>'fuente_confianza_banos',
            'precio_conflicto', COALESCE((v_enrichment->>'precio_conflicto')::BOOLEAN, false),
            'conflicto_banos', COALESCE((v_enrichment->>'conflicto_banos')::BOOLEAN, false),
            'precio_sospechoso', COALESCE((v_enrichment->>'precio_sospechoso')::BOOLEAN, false),
            'es_para_matching_verificado', (v_score_fiduciario >= 80 AND array_length(v_datos_criticos_faltantes, 1) IS NULL),
            'motivo_no_matching', CASE 
                WHEN v_score_fiduciario < 80 THEN 'score_fiduciario_bajo'
                WHEN array_length(v_datos_criticos_faltantes, 1) > 0 THEN 'datos_criticos_faltantes'
                ELSE NULL
            END
        ),
        
        -- DISCOVERY METADATA
        'discovery_metadata', v_discovery_metadata,
        
        -- DISCREPANCIAS
        'discrepancias', v_discrepancias,
        
        -- TRAZABILIDAD
        'trazabilidad', jsonb_build_object(
            'scraper_version', v_enrichment->>'scraper_version',
            'extractor_version', v_enrichment->>'extractor_version',
            'verificador_version', v_enrichment->>'verificador_version',
            'merge_version', '2.0.0',
            'fecha_scraping', v_enrichment->>'fecha_scraping',
            'fecha_enrichment', v_prop.fecha_enrichment,
            'fecha_merge', NOW()
        )
    );

    -- =========================================================================
    -- FASE 9: CONSTRUIR CAMBIOS MERGE (para auditoría)
    -- =========================================================================
    
    v_cambios_merge := jsonb_build_object(
        'updated', v_campos_updated,
        'kept', v_campos_kept,
        'blocked', v_campos_blocked,
        'fuentes', jsonb_build_object(
            'precio_usd', v_fuente_precio,
            'area_total_m2', v_fuente_area,
            'dormitorios', v_fuente_dormitorios,
            'banos', v_fuente_banos,
            'estacionamientos', v_fuente_estacionamientos,
            'gps', v_fuente_gps
        ),
        'datos_criticos_faltantes', v_datos_criticos_faltantes,
        'timestamp', NOW()
    );

    -- =========================================================================
    -- FASE 10: UPDATE PROPIEDAD
    -- =========================================================================
    
    UPDATE propiedades_v2 SET
        -- Columnas principales
        precio_usd = v_precio_final,
        area_total_m2 = v_area_final,
        dormitorios = v_dormitorios_final,
        banos = v_banos_final,
        estacionamientos = v_estacionamientos_final,
        latitud = v_latitud_final,
        longitud = v_longitud_final,
        
        -- JSON consolidado
        datos_json = v_datos_json_final,
        
        -- Scores
        score_calidad_dato = v_score_calidad_dato,
        score_fiduciario = v_score_fiduciario,
        flags_semanticos = v_flags_semanticos,
        
        -- Tracking merge
        fecha_merge = NOW(),
        discrepancias_detectadas = v_discrepancias,
        cambios_merge = v_cambios_merge,
        
        -- Status y matching
        status = v_status_final,
        es_para_matching = CASE 
            WHEN v_prop.id_proyecto_master IS NOT NULL THEN FALSE 
            ELSE (v_score_fiduciario >= 80 AND array_length(v_datos_criticos_faltantes, 1) IS NULL)
        END,
        
        -- Timestamp
        fecha_actualizacion = NOW()
    WHERE id = v_prop.id;

    -- =========================================================================
    -- FASE 11: CONSTRUIR RESPUESTA
    -- =========================================================================
    
    v_result := jsonb_build_object(
        'success', true,
        'operation', 'merge',
        'version', '2.0.0',
        'property_id', v_prop.codigo_propiedad,
        'internal_id', v_prop.id,
        'url', v_prop.url,
        'fuente', v_fuente,
        'status_anterior', v_status_anterior,
        'status_nuevo', v_status_final::TEXT,
        'cambios_merge', v_cambios_merge,
        'scores', jsonb_build_object(
            'calidad_dato', v_score_calidad_dato,
            'fiduciario', v_score_fiduciario,
            'core', v_score_core,
            'opcionales', v_score_opcionales
        ),
        'tiene_discrepancias', (
            (v_disc_precio->>'flag') IS NOT NULL OR
            (v_disc_area_calc->>'flag') IS NOT NULL OR
            (v_disc_dormitorios_calc->>'flag') IS NOT NULL OR
            (v_disc_banos_calc->>'flag') IS NOT NULL
        ),
        'datos_criticos_faltantes', v_datos_criticos_faltantes,
        'es_para_matching', (v_score_fiduciario >= 80 AND array_length(v_datos_criticos_faltantes, 1) IS NULL),
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


-- =====================================================================================
-- SOBRECARGA PARA INTEGER
-- =====================================================================================

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
'SICI Merge v2.0.0: Unifica Discovery + Enrichment con reglas de prioridad.
- Candados SIEMPRE respetados
- Discovery > Enrichment para: área, dorms, baños, GPS
- Precio: Discovery si USD puro, fallback Enrichment si discrepancia >10%
- Status final SIEMPRE es completado
- Scoring post-merge integrado
Uso: SELECT merge_discovery_enrichment(''12345'')';

COMMENT ON FUNCTION merge_discovery_enrichment(INTEGER) IS 
'Sobrecarga para INTEGER. Ver merge_discovery_enrichment(TEXT) para documentación.';

GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION merge_discovery_enrichment(INTEGER) TO service_role;


-- =====================================================================================
-- FIN DEL ARCHIVO
-- =====================================================================================
