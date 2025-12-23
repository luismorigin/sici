-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: funciones_helper_merge.sql
-- Propósito: Helpers para normalizar paths diferentes por portal (Remax vs C21)
-- Versión: 2.0.0
-- Fecha: 2025-12-23
-- =====================================================================================
-- CONTEXTO:
--   Remax y Century21 tienen estructuras JSON completamente diferentes.
--   Este helper abstrae las diferencias para que merge_discovery_enrichment
--   pueda acceder a los campos de manera uniforme.
-- =====================================================================================
-- MAPPINGS:
--   | Campo            | REMAX Path                              | C21 Path         |
--   |------------------|-----------------------------------------|------------------|
--   | area_total_m2    | listing_information.construction_area_m | m2C              |
--   | dormitorios      | listing_information.number_bedrooms     | recamaras        |
--   | banos            | listing_information.number_bathrooms    | banos            |
--   | estacionamientos | listing_information.number_parking      | estacionamientos |
--   | latitud          | location.latitude (STRING)              | lat (NUMERIC)    |
--   | longitud         | location.longitude (STRING)             | lon (NUMERIC)    |
--   | precio_usd       | price.price_in_dollars                  | (condicional)    |
--   | id_original      | id                                      | id               |
--   | status_portal    | status_listing.name                     | status           |
--   | fecha_alta       | date_of_listing                         | fechaAlta        |
-- =====================================================================================

-- =====================================================================================
-- FUNCIÓN: get_discovery_value
-- =====================================================================================
-- Extrae un valor del JSON de discovery normalizando paths por portal
-- Incluye casteo automático para GPS de Remax (string → numeric)
-- =====================================================================================

DROP FUNCTION IF EXISTS get_discovery_value(TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION get_discovery_value(
    p_campo TEXT,
    p_discovery JSONB,
    p_fuente TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_result TEXT;
BEGIN
    -- Validación de entrada
    IF p_discovery IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Normalizar fuente a lowercase
    p_fuente := LOWER(p_fuente);
    
    -- =========================================================================
    -- MAPPING POR CAMPO Y PORTAL
    -- =========================================================================
    
    CASE p_campo
        -- -----------------------------------------------------------------
        -- ÁREA
        -- -----------------------------------------------------------------
        WHEN 'area_total_m2' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'listing_information'->>'construction_area_m';
            ELSE -- century21
                v_result := p_discovery->>'m2C';
            END IF;
            
        -- -----------------------------------------------------------------
        -- DORMITORIOS
        -- -----------------------------------------------------------------
        WHEN 'dormitorios' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'listing_information'->>'number_bedrooms';
            ELSE -- century21
                v_result := p_discovery->>'recamaras';
            END IF;
            
        -- -----------------------------------------------------------------
        -- BAÑOS
        -- -----------------------------------------------------------------
        WHEN 'banos' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'listing_information'->>'number_bathrooms';
            ELSE -- century21
                v_result := p_discovery->>'banos';
            END IF;
            
        -- -----------------------------------------------------------------
        -- ESTACIONAMIENTOS
        -- -----------------------------------------------------------------
        WHEN 'estacionamientos' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'listing_information'->>'number_parking';
            ELSE -- century21
                v_result := p_discovery->>'estacionamientos';
            END IF;
            
        -- -----------------------------------------------------------------
        -- GPS - LATITUD (Remax viene como STRING, C21 como NUMERIC)
        -- -----------------------------------------------------------------
        WHEN 'latitud' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'location'->>'latitude';
            ELSE -- century21
                v_result := p_discovery->>'lat';
            END IF;
            
        -- -----------------------------------------------------------------
        -- GPS - LONGITUD (Remax viene como STRING, C21 como NUMERIC)
        -- -----------------------------------------------------------------
        WHEN 'longitud' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'location'->>'longitude';
            ELSE -- century21
                v_result := p_discovery->>'lon';
            END IF;
            
        -- -----------------------------------------------------------------
        -- PRECIO USD (Remax lo calcula, C21 solo si moneda=USD)
        -- -----------------------------------------------------------------
        WHEN 'precio_usd' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'price'->>'price_in_dollars';
            ELSE -- century21
                -- Solo retornar si moneda es USD
                IF UPPER(COALESCE(p_discovery->>'moneda', 'USD')) = 'USD' THEN
                    v_result := p_discovery->>'precio';
                ELSE
                    v_result := NULL; -- BOB requiere conversión, usar enrichment
                END IF;
            END IF;
            
        -- -----------------------------------------------------------------
        -- PRECIO ORIGINAL (sin conversión)
        -- -----------------------------------------------------------------
        WHEN 'precio_original' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'price'->>'amount';
            ELSE -- century21
                v_result := p_discovery->>'precio';
            END IF;
            
        -- -----------------------------------------------------------------
        -- MONEDA ORIGINAL
        -- -----------------------------------------------------------------
        WHEN 'moneda_original' THEN
            IF p_fuente = 'remax' THEN
                -- Remax: currency_id 1=BOB, 2=USD
                CASE (p_discovery->'price'->>'currency_id')::INTEGER
                    WHEN 1 THEN v_result := 'BOB';
                    WHEN 2 THEN v_result := 'USD';
                    ELSE v_result := 'USD'; -- Default
                END CASE;
            ELSE -- century21
                v_result := COALESCE(p_discovery->>'moneda', 'USD');
            END IF;
            
        -- -----------------------------------------------------------------
        -- ID ORIGINAL DEL PORTAL
        -- -----------------------------------------------------------------
        WHEN 'id_original' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->>'MLSID';
                IF v_result IS NULL THEN
                    v_result := (p_discovery->>'id')::TEXT;
                END IF;
            ELSE -- century21
                v_result := p_discovery->>'id';
            END IF;
            
        -- -----------------------------------------------------------------
        -- STATUS DEL PORTAL
        -- -----------------------------------------------------------------
        WHEN 'status_portal' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'status_listing'->>'name';
            ELSE -- century21
                v_result := p_discovery->>'status';
            END IF;
            
        -- -----------------------------------------------------------------
        -- FECHA PUBLICACIÓN
        -- -----------------------------------------------------------------
        WHEN 'fecha_alta' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->>'date_of_listing';
            ELSE -- century21
                v_result := p_discovery->>'fechaAlta';
            END IF;
            
        -- -----------------------------------------------------------------
        -- TIPO CAMBIO PORTAL (solo Remax)
        -- -----------------------------------------------------------------
        WHEN 'tc_portal_id' THEN
            IF p_fuente = 'remax' THEN
                v_result := p_discovery->'price'->>'exchange_rate_id';
            ELSE
                v_result := NULL;
            END IF;
            
        -- -----------------------------------------------------------------
        -- EXCLUSIVA (solo C21)
        -- -----------------------------------------------------------------
        WHEN 'exclusiva' THEN
            IF p_fuente = 'century21' THEN
                v_result := p_discovery->>'exclusiva';
            ELSE
                v_result := NULL;
            END IF;
            
        -- -----------------------------------------------------------------
        -- CUOTA MANTENIMIENTO (solo C21)
        -- -----------------------------------------------------------------
        WHEN 'cuota_mantenimiento' THEN
            IF p_fuente = 'century21' THEN
                v_result := p_discovery->>'cuotaMantenimiento';
            ELSE
                v_result := NULL;
            END IF;
            
        -- -----------------------------------------------------------------
        -- DEFAULT: Intentar acceso directo
        -- -----------------------------------------------------------------
        ELSE
            v_result := p_discovery->>p_campo;
    END CASE;
    
    RETURN v_result;
    
EXCEPTION WHEN OTHERS THEN
    -- En caso de error de parsing, retornar NULL silenciosamente
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION get_discovery_value(TEXT, JSONB, TEXT) IS 
'Helper v2.0.0: Extrae valores de discovery normalizando paths por portal (Remax vs C21).
Incluye casteo implícito y manejo de estructuras anidadas diferentes.
Uso: SELECT get_discovery_value(''area_total_m2'', datos_json_discovery, fuente)';


-- =====================================================================================
-- FUNCIÓN: get_discovery_value_numeric
-- =====================================================================================
-- Wrapper que retorna NUMERIC con casteo seguro
-- Útil para campos numéricos (área, precio, GPS)
-- =====================================================================================

DROP FUNCTION IF EXISTS get_discovery_value_numeric(TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION get_discovery_value_numeric(
    p_campo TEXT,
    p_discovery JSONB,
    p_fuente TEXT
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_text TEXT;
    v_result NUMERIC;
BEGIN
    v_text := get_discovery_value(p_campo, p_discovery, p_fuente);
    
    IF v_text IS NULL OR v_text = '' THEN
        RETURN NULL;
    END IF;
    
    -- Intentar casteo seguro
    BEGIN
        v_result := v_text::NUMERIC;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$;

COMMENT ON FUNCTION get_discovery_value_numeric(TEXT, JSONB, TEXT) IS 
'Helper v2.0.0: Wrapper de get_discovery_value con casteo seguro a NUMERIC.
Uso: SELECT get_discovery_value_numeric(''latitud'', datos_json_discovery, fuente)';


-- =====================================================================================
-- FUNCIÓN: get_discovery_value_integer
-- =====================================================================================
-- Wrapper que retorna INTEGER con casteo seguro
-- Útil para campos enteros (dormitorios, baños, estacionamientos)
-- =====================================================================================

DROP FUNCTION IF EXISTS get_discovery_value_integer(TEXT, JSONB, TEXT);

CREATE OR REPLACE FUNCTION get_discovery_value_integer(
    p_campo TEXT,
    p_discovery JSONB,
    p_fuente TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_text TEXT;
    v_result INTEGER;
BEGIN
    v_text := get_discovery_value(p_campo, p_discovery, p_fuente);
    
    IF v_text IS NULL OR v_text = '' THEN
        RETURN NULL;
    END IF;
    
    -- Intentar casteo seguro (manejar decimales como 2.0 → 2)
    BEGIN
        v_result := ROUND(v_text::NUMERIC)::INTEGER;
        RETURN v_result;
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$;

COMMENT ON FUNCTION get_discovery_value_integer(TEXT, JSONB, TEXT) IS 
'Helper v2.0.0: Wrapper de get_discovery_value con casteo seguro a INTEGER.
Uso: SELECT get_discovery_value_integer(''dormitorios'', datos_json_discovery, fuente)';


-- =====================================================================================
-- FUNCIÓN: calcular_discrepancia_porcentual
-- =====================================================================================
-- Calcula la discrepancia porcentual entre dos valores
-- Retorna objeto JSONB con diff_pct y flag según thresholds
-- =====================================================================================

DROP FUNCTION IF EXISTS calcular_discrepancia_porcentual(NUMERIC, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION calcular_discrepancia_porcentual(
    p_valor_discovery NUMERIC,
    p_valor_enrichment NUMERIC,
    p_campo TEXT DEFAULT 'generico'
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_diff_pct NUMERIC;
    v_flag TEXT;
    v_base NUMERIC;
BEGIN
    -- Si alguno es NULL, no hay discrepancia calculable
    IF p_valor_discovery IS NULL OR p_valor_enrichment IS NULL THEN
        RETURN jsonb_build_object(
            'discovery', p_valor_discovery,
            'enrichment', p_valor_enrichment,
            'diff_pct', NULL,
            'flag', NULL,
            'calculable', FALSE
        );
    END IF;
    
    -- Si ambos son 0, no hay discrepancia
    IF p_valor_discovery = 0 AND p_valor_enrichment = 0 THEN
        RETURN jsonb_build_object(
            'discovery', p_valor_discovery,
            'enrichment', p_valor_enrichment,
            'diff_pct', 0,
            'flag', NULL,
            'calculable', TRUE
        );
    END IF;
    
    -- Usar el valor de discovery como base (o enrichment si discovery es 0)
    v_base := CASE 
        WHEN p_valor_discovery != 0 THEN ABS(p_valor_discovery)
        ELSE ABS(p_valor_enrichment)
    END;
    
    -- Calcular diferencia porcentual
    v_diff_pct := ABS(p_valor_discovery - p_valor_enrichment) / v_base;
    
    -- Determinar flag según thresholds
    -- < 2% = OK (null), 2-10% = warning, > 10% = error
    v_flag := CASE
        WHEN v_diff_pct < 0.02 THEN NULL
        WHEN v_diff_pct <= 0.10 THEN 'warning'
        ELSE 'error'
    END;
    
    RETURN jsonb_build_object(
        'discovery', p_valor_discovery,
        'enrichment', p_valor_enrichment,
        'diff_pct', ROUND(v_diff_pct, 4),
        'flag', v_flag,
        'calculable', TRUE
    );
END;
$$;

COMMENT ON FUNCTION calcular_discrepancia_porcentual(NUMERIC, NUMERIC, TEXT) IS 
'Helper v2.0.0: Calcula discrepancia porcentual entre discovery y enrichment.
Thresholds: <2% OK, 2-10% warning, >10% error.
Uso: SELECT calcular_discrepancia_porcentual(100, 95, ''precio'')';


-- =====================================================================================
-- FUNCIÓN: calcular_discrepancia_exacta
-- =====================================================================================
-- Para campos que deben coincidir exactamente (dormitorios, baños)
-- =====================================================================================

DROP FUNCTION IF EXISTS calcular_discrepancia_exacta(INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION calcular_discrepancia_exacta(
    p_valor_discovery INTEGER,
    p_valor_enrichment INTEGER,
    p_campo TEXT DEFAULT 'generico'
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    -- Si alguno es NULL, no hay discrepancia calculable
    IF p_valor_discovery IS NULL OR p_valor_enrichment IS NULL THEN
        RETURN jsonb_build_object(
            'discovery', p_valor_discovery,
            'enrichment', p_valor_enrichment,
            'match', NULL,
            'flag', NULL
        );
    END IF;
    
    RETURN jsonb_build_object(
        'discovery', p_valor_discovery,
        'enrichment', p_valor_enrichment,
        'match', (p_valor_discovery = p_valor_enrichment),
        'flag', CASE WHEN p_valor_discovery != p_valor_enrichment THEN 'warning' ELSE NULL END
    );
END;
$$;

COMMENT ON FUNCTION calcular_discrepancia_exacta(INTEGER, INTEGER, TEXT) IS 
'Helper v2.0.0: Calcula discrepancia exacta para campos enteros (dorms, baños).
Uso: SELECT calcular_discrepancia_exacta(2, 3, ''dormitorios'')';


-- =====================================================================================
-- GRANTS
-- =====================================================================================

GRANT EXECUTE ON FUNCTION get_discovery_value(TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_value(TEXT, JSONB, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION get_discovery_value_numeric(TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_value_numeric(TEXT, JSONB, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION get_discovery_value_integer(TEXT, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_discovery_value_integer(TEXT, JSONB, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION calcular_discrepancia_porcentual(NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_discrepancia_porcentual(NUMERIC, NUMERIC, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION calcular_discrepancia_exacta(INTEGER, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION calcular_discrepancia_exacta(INTEGER, INTEGER, TEXT) TO service_role;


-- =====================================================================================
-- FIN DEL ARCHIVO
-- =====================================================================================
