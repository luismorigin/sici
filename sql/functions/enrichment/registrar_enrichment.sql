-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: registrar_enrichment.sql
-- Propósito: Registrar datos del extractor HTML (Flujo B) respetando candados
-- Versión: 1.4.8
-- Fecha: 2026-01-29
-- =====================================================================================
-- CHANGELOG:
--   v1.4.8 (29 Ene 2026):
--     - Fix: soportar nuevo formato de candados del admin panel
--       Antes: {"campo": true}
--       Ahora: {"campo": {"bloqueado": true, "por": "admin", ...}}
--   v1.4.7 (29 Ene 2026):
--     - Fix: validación tipo_cambio_usado < 100 (evita overflow en NUMERIC(6,4))
--   v1.4.6 (29 Ene 2026):
--     - Fix: validación regex para dormitorios y banos (evita "sin_confirmar" → INTEGER)
--   v1.4.5 (24 Dic 2025):
--     - Fix estado_construccion: solo mapear valores inválidos
--     - 'sin_informacion', 'no_definido' → 'no_especificado'
--     - Quitar mapeo de 'nuevo_a_estrenar' (ahora valor válido del ENUM)
--     - 'usado' y 'nuevo_a_estrenar' pasan directo al ENUM
--   v1.4.4 (24 Dic 2025):
--     - Agregados campos multiproyecto: area_min_m2, area_max_m2, dormitorios_opciones
--   v1.4.3 (24 Dic 2025):
--     - Fix estado_construccion: mapear valores no válidos del extractor
--   v1.4.1 (22 Dic 2025):
--     - Búsqueda por _internal_id primero (performance)
--     - GPS con campos separados (latitud, longitud)
-- =====================================================================================
-- ESTADOS VÁLIDOS DEL ENUM estado_propiedad:
--   nueva, pendiente_enriquecimiento, completado, actualizado,
--   inactivo_pending, inactivo_confirmed
-- =====================================================================================
-- VALORES VÁLIDOS DEL ENUM estado_construccion_enum:
--   entrega_inmediata, preventa, construccion, planos, no_especificado,
--   usado, nuevo_a_estrenar
-- =====================================================================================

-- Helper function para verificar candados (soporta ambos formatos)
CREATE OR REPLACE FUNCTION _is_campo_bloqueado(p_candados JSONB, p_campo TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $helper$
BEGIN
    -- Nuevo formato del admin: {"campo": {"bloqueado": true, ...}}
    IF jsonb_typeof(p_candados->p_campo) = 'object' THEN
        RETURN COALESCE((p_candados->p_campo->>'bloqueado')::boolean, false);
    END IF;
    -- Formato antiguo: {"campo": true}
    RETURN COALESCE((p_candados->>p_campo)::boolean, false);
END;
$helper$;

CREATE OR REPLACE FUNCTION registrar_enrichment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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
    -- =========================================================================
    -- FASE 1: BUSCAR PROPIEDAD (prioridad: _internal_id > property_id > url)
    -- =========================================================================
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
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada',
            'timestamp', NOW()
        );
    END IF;

    v_candados := COALESCE(v_existing.campos_bloqueados, '{}'::JSONB);
    v_status_anterior := v_existing.status::TEXT;

    -- =========================================================================
    -- FASE 2: CALCULAR CAMBIOS (simplificado)
    -- =========================================================================
    IF p_data->>'precio_usd' IS NOT NULL AND NOT _is_campo_bloqueado(v_candados, 'precio_usd') THEN
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

    -- =========================================================================
    -- FASE 3: UPDATE
    -- =========================================================================
    UPDATE propiedades_v2 SET
        precio_usd = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_usd') THEN propiedades_v2.precio_usd
            WHEN p_data->>'precio_usd' IS NOT NULL THEN (p_data->>'precio_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_usd
        END,

        precio_min_usd = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_min_usd') THEN propiedades_v2.precio_min_usd
            WHEN p_data->>'precio_min_usd' IS NOT NULL THEN (p_data->>'precio_min_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_min_usd
        END,

        precio_max_usd = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_max_usd') THEN propiedades_v2.precio_max_usd
            WHEN p_data->>'precio_max_usd' IS NOT NULL THEN (p_data->>'precio_max_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_max_usd
        END,
        
        -- Campos multiproyecto (v1.4.4)
        area_min_m2 = CASE 
            WHEN p_data->>'area_min_m2' IS NOT NULL THEN (p_data->>'area_min_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_min_m2
        END,
        
        area_max_m2 = CASE 
            WHEN p_data->>'area_max_m2' IS NOT NULL THEN (p_data->>'area_max_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_max_m2
        END,
        
        dormitorios_opciones = CASE 
            WHEN p_data->>'dormitorios_opciones' IS NOT NULL THEN p_data->>'dormitorios_opciones'
            ELSE propiedades_v2.dormitorios_opciones
        END,
        
        moneda_original = CASE 
            WHEN p_data->>'moneda_original' IS NOT NULL THEN p_data->>'moneda_original'
            ELSE propiedades_v2.moneda_original
        END,
        
        tipo_cambio_usado = CASE
            WHEN p_data->>'tipo_cambio_usado' IS NOT NULL
                 AND (p_data->>'tipo_cambio_usado')::NUMERIC < 100
            THEN (p_data->>'tipo_cambio_usado')::NUMERIC(6,4)
            ELSE propiedades_v2.tipo_cambio_usado
        END,
        
        area_total_m2 = CASE
            WHEN _is_campo_bloqueado(v_candados, 'area_total_m2') THEN propiedades_v2.area_total_m2
            WHEN p_data->>'area_total_m2' IS NOT NULL THEN (p_data->>'area_total_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_total_m2
        END,

        dormitorios = CASE
            WHEN _is_campo_bloqueado(v_candados, 'dormitorios') THEN propiedades_v2.dormitorios
            WHEN p_data->>'dormitorios' ~ '^[0-9]+$' THEN (p_data->>'dormitorios')::INTEGER
            ELSE propiedades_v2.dormitorios
        END,

        banos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'banos') THEN propiedades_v2.banos
            WHEN p_data->>'banos' ~ '^[0-9]+\.?[0-9]*$'
                 AND (p_data->>'banos')::NUMERIC < 100
            THEN (p_data->>'banos')::NUMERIC(3,1)
            ELSE propiedades_v2.banos
        END,

        estacionamientos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'estacionamientos') THEN propiedades_v2.estacionamientos
            WHEN p_data->>'estacionamientos' ~ '^[0-9]+$' THEN (p_data->>'estacionamientos')::INTEGER
            ELSE propiedades_v2.estacionamientos
        END,

        latitud = CASE
            WHEN _is_campo_bloqueado(v_candados, 'latitud') THEN propiedades_v2.latitud
            WHEN p_data->>'latitud' IS NOT NULL THEN (p_data->>'latitud')::NUMERIC(10,8)
            ELSE propiedades_v2.latitud
        END,

        longitud = CASE
            WHEN _is_campo_bloqueado(v_candados, 'longitud') THEN propiedades_v2.longitud
            WHEN p_data->>'longitud' IS NOT NULL THEN (p_data->>'longitud')::NUMERIC(11,8)
            ELSE propiedades_v2.longitud
        END,

        -- FIX v1.4.5: estado_construccion - solo mapear valores inválidos
        estado_construccion = CASE
            WHEN _is_campo_bloqueado(v_candados, 'estado_construccion') THEN propiedades_v2.estado_construccion
            -- Solo estos se mapean (no son estados válidos, son "sin info")
            WHEN p_data->>'estado_construccion' IN ('sin_informacion', 'no_definido') THEN 'no_especificado'::estado_construccion_enum
            -- El resto pasa directo (usado, nuevo_a_estrenar, entrega_inmediata, preventa, etc.)
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

    -- =========================================================================
    -- FASE 4: RESPUESTA
    -- =========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'enrichment',
        'version', '1.4.8',
        'property_id', v_existing.codigo_propiedad,
        'internal_id', v_existing.id,
        'status_nuevo', 'actualizado',
        'timestamp', NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE,
        'timestamp', NOW()
    );
END;
$$;

-- =====================================================================================
-- COMENTARIOS Y GRANTS
-- =====================================================================================

COMMENT ON FUNCTION registrar_enrichment(JSONB) IS
'SICI Enrichment v1.4.8: Registra datos de extractor HTML respetando candados.
- Búsqueda priorizada: _internal_id > property_id > url
- Candados SIEMPRE respetados (formato admin: {bloqueado:true} o legacy: true)
- estado_construccion: mapea valores inválidos a no_especificado
- Campos multiproyecto: area_min_m2, area_max_m2, dormitorios_opciones
- Status final SIEMPRE es actualizado
Uso: SELECT registrar_enrichment(''{"property_id":"12345", ...}''::JSONB)';

COMMENT ON FUNCTION _is_campo_bloqueado(JSONB, TEXT) IS
'Helper para verificar candados en ambos formatos: {"campo": true} y {"campo": {"bloqueado": true}}';

GRANT EXECUTE ON FUNCTION _is_campo_bloqueado(JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION _is_campo_bloqueado(JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION registrar_enrichment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_enrichment(JSONB) TO service_role;

-- =====================================================================================
-- FIN DEL ARCHIVO
-- =====================================================================================
