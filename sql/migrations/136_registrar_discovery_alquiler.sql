-- =====================================================
-- Migración 136: NUEVA función registrar_discovery_alquiler()
-- Propósito: INSERT/UPDATE idempotente para alquileres en propiedades_v2
-- Fecha: 11 Feb 2026
-- Prerequisito: 135 (columnas alquiler)
-- IMPORTANTE: NO modifica registrar_discovery() existente
-- =====================================================
-- Esta función es independiente del pipeline de venta.
-- Los workflows n8n de alquiler la llaman directamente.
-- Anticrético se rechaza (modelo financiero distinto).
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_discovery_alquiler(
    -- Identificación
    p_url VARCHAR,
    p_fuente VARCHAR,                -- 'century21', 'remax'
    p_codigo_propiedad VARCHAR DEFAULT NULL,

    -- Precio (en BOB, canónico para alquileres Bolivia)
    p_precio_mensual_bob NUMERIC DEFAULT NULL,
    p_precio_mensual_usd NUMERIC DEFAULT NULL,  -- convertido con TC oficial
    p_moneda_original VARCHAR DEFAULT 'BOB',

    -- Físico
    p_area_total_m2 NUMERIC DEFAULT NULL,
    p_dormitorios INTEGER DEFAULT NULL,
    p_banos NUMERIC DEFAULT NULL,
    p_estacionamientos INTEGER DEFAULT NULL,

    -- Clasificación
    p_tipo_propiedad_original TEXT DEFAULT NULL,  -- 'departamento', 'casa', etc.

    -- GPS
    p_latitud NUMERIC DEFAULT NULL,
    p_longitud NUMERIC DEFAULT NULL,

    -- Metadata
    p_fecha_publicacion DATE DEFAULT NULL,
    p_metodo_discovery VARCHAR DEFAULT 'api_rest',
    p_zona TEXT DEFAULT NULL,

    -- JSON completo discovery
    p_datos_json_discovery JSONB DEFAULT NULL
)
RETURNS TABLE(
    id INTEGER,
    accion TEXT,         -- 'inserted', 'updated', 'skipped', 'rejected'
    mensaje TEXT
) AS $$
DECLARE
    v_id INTEGER;
    v_status_actual estado_propiedad;
    v_campos_bloqueados JSONB;
    v_precio_usd_calc NUMERIC;
BEGIN
    -- ========================================================================
    -- PASO 0: Validaciones
    -- ========================================================================
    IF p_url IS NULL OR p_fuente IS NULL THEN
        RETURN QUERY SELECT
            NULL::INTEGER,
            'error'::TEXT,
            'Parámetros obligatorios faltantes (url, fuente)'::TEXT;
        RETURN;
    END IF;

    -- Calcular precio USD si no viene (para compatibilidad con columnas existentes)
    IF p_precio_mensual_usd IS NOT NULL THEN
        v_precio_usd_calc := p_precio_mensual_usd;
    ELSIF p_precio_mensual_bob IS NOT NULL THEN
        -- TC oficial Bolivia: 6.96 (fijo desde 2011)
        v_precio_usd_calc := ROUND(p_precio_mensual_bob / 6.96, 2);
    ELSE
        v_precio_usd_calc := NULL;
    END IF;

    -- ========================================================================
    -- PASO 1: Verificar si existe (por url + fuente)
    -- ========================================================================
    SELECT
        pv.id,
        pv.status,
        pv.campos_bloqueados
    INTO
        v_id,
        v_status_actual,
        v_campos_bloqueados
    FROM propiedades_v2 pv
    -- FIX WARNING-04: filtrar por tipo_operacion para no colisionar con ventas
    WHERE pv.url = p_url AND pv.fuente = p_fuente AND pv.tipo_operacion = 'alquiler';

    -- ========================================================================
    -- PASO 2: NUEVA PROPIEDAD (INSERT)
    -- ========================================================================
    IF v_id IS NULL THEN
        INSERT INTO propiedades_v2 (
            url,
            fuente,
            codigo_propiedad,
            tipo_operacion,
            tipo_propiedad_original,
            precio_usd,
            precio_mensual_bob,
            precio_mensual_usd,
            moneda_original,
            area_total_m2,
            dormitorios,
            banos,
            estacionamientos,
            latitud,
            longitud,
            zona,
            datos_json_discovery,
            fecha_discovery,
            metodo_discovery,
            status,
            fecha_publicacion,
            fecha_creacion,
            fecha_actualizacion,
            es_activa,
            es_para_matching
        )
        VALUES (
            p_url,
            p_fuente,
            p_codigo_propiedad,
            'alquiler'::tipo_operacion_enum,   -- SIEMPRE alquiler
            p_tipo_propiedad_original,
            v_precio_usd_calc,                  -- precio_usd para compatibilidad
            p_precio_mensual_bob,
            p_precio_mensual_usd,
            p_moneda_original,
            p_area_total_m2,
            p_dormitorios,
            p_banos,
            p_estacionamientos,
            p_latitud,
            p_longitud,
            p_zona,
            p_datos_json_discovery,
            NOW(),
            p_metodo_discovery,
            'nueva'::estado_propiedad,          -- Siempre nueva (no excluida)
            p_fecha_publicacion,
            NOW(),
            NOW(),
            TRUE,
            TRUE
        )
        RETURNING propiedades_v2.id INTO v_id;

        RETURN QUERY SELECT
            v_id,
            'inserted'::TEXT,
            format('Nuevo alquiler: %s (%s)', COALESCE(p_codigo_propiedad, p_url), p_fuente)::TEXT;
        RETURN;
    END IF;

    -- ========================================================================
    -- PASO 3: EXISTE → UPDATE (respetando candados)
    -- ========================================================================

    -- Si está inactiva, skip
    IF v_status_actual IN ('inactivo_confirmed') THEN
        RETURN QUERY SELECT
            v_id,
            'skipped'::TEXT,
            format('Alquiler inactivo confirmado (id=%s)', v_id)::TEXT;
        RETURN;
    END IF;

    -- Update respetando candados
    UPDATE propiedades_v2
    SET
        codigo_propiedad = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'codigo_propiedad')
            THEN codigo_propiedad
            ELSE COALESCE(p_codigo_propiedad, codigo_propiedad)
        END,

        tipo_propiedad_original = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'tipo_propiedad_original')
            THEN tipo_propiedad_original
            ELSE COALESCE(p_tipo_propiedad_original, tipo_propiedad_original)
        END,

        precio_usd = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'precio_usd')
            THEN precio_usd
            ELSE COALESCE(v_precio_usd_calc, precio_usd)
        END,

        precio_mensual_bob = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'precio_mensual_bob')
            THEN precio_mensual_bob
            ELSE COALESCE(p_precio_mensual_bob, precio_mensual_bob)
        END,

        -- FIX BUG-06: recalcular USD si tenemos BOB nuevo pero no USD explícito
        precio_mensual_usd = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'precio_mensual_usd')
            THEN precio_mensual_usd
            WHEN p_precio_mensual_usd IS NOT NULL
            THEN p_precio_mensual_usd
            WHEN p_precio_mensual_bob IS NOT NULL
            THEN ROUND(p_precio_mensual_bob / 6.96, 2)
            ELSE precio_mensual_usd
        END,

        moneda_original = COALESCE(p_moneda_original, moneda_original),

        area_total_m2 = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'area_total_m2')
            THEN area_total_m2
            ELSE COALESCE(p_area_total_m2, area_total_m2)
        END,

        dormitorios = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'dormitorios')
            THEN dormitorios
            ELSE COALESCE(p_dormitorios, dormitorios)
        END,

        banos = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'banos')
            THEN banos
            ELSE COALESCE(p_banos, banos)
        END,

        estacionamientos = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'estacionamientos')
            THEN estacionamientos
            ELSE COALESCE(p_estacionamientos, estacionamientos)
        END,

        latitud = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'latitud')
            THEN latitud
            ELSE COALESCE(p_latitud, latitud)
        END,

        longitud = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'longitud')
            THEN longitud
            ELSE COALESCE(p_longitud, longitud)
        END,

        zona = CASE
            WHEN _is_campo_bloqueado(campos_bloqueados, 'zona')
            THEN zona
            ELSE COALESCE(p_zona, zona)
        END,

        datos_json_discovery = COALESCE(p_datos_json_discovery, datos_json_discovery),
        fecha_discovery = NOW(),
        metodo_discovery = p_metodo_discovery,
        fecha_publicacion = COALESCE(p_fecha_publicacion, fecha_publicacion),
        fecha_actualizacion = NOW(),
        es_activa = TRUE,

        -- Si estaba excluida o inactiva, reactivar como nueva
        status = CASE
            WHEN status IN ('excluido_operacion', 'inactivo_pending') THEN 'nueva'::estado_propiedad
            WHEN status = 'completado' THEN 'actualizado'::estado_propiedad
            ELSE status
        END

    WHERE propiedades_v2.id = v_id;

    RETURN QUERY SELECT
        v_id,
        'updated'::TEXT,
        format('Alquiler actualizado (id=%s)', v_id)::TEXT;

END;
$$ LANGUAGE plpgsql;

-- Permisos
GRANT EXECUTE ON FUNCTION registrar_discovery_alquiler TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_discovery_alquiler TO service_role;

COMMENT ON FUNCTION registrar_discovery_alquiler IS 'Discovery alquiler: INSERT/UPDATE en propiedades_v2 con candados. Independiente de registrar_discovery() de venta.';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
/*
-- Test insert
SELECT * FROM registrar_discovery_alquiler(
    p_url := 'https://test.com/alquiler/999',
    p_fuente := 'remax',
    p_codigo_propiedad := 'TEST-AQ-001',
    p_precio_mensual_bob := 4500,
    p_area_total_m2 := 85,
    p_dormitorios := 2,
    p_banos := 2,
    p_zona := 'Equipetrol',
    p_datos_json_discovery := '{"test": true}'::jsonb
);

-- Verificar
SELECT id, tipo_operacion, status, precio_mensual_bob, precio_usd
FROM propiedades_v2
WHERE url = 'https://test.com/alquiler/999';

-- Cleanup
DELETE FROM propiedades_v2 WHERE url = 'https://test.com/alquiler/999';
*/
