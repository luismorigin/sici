-- Migración 165: Fix fecha_discovery para Bien Inmuebles en registrar_discovery_alquiler()
--
-- Problema: fecha_discovery se sobreescribía con NOW() en cada corrida nocturna.
-- Para Bien Inmuebles (sin fecha_publicacion), esto hacía que días_en_mercado = 0 siempre.
-- C21/Remax no se afectaban porque usan fecha_publicacion para días en mercado.
--
-- Fix: solo actualizar fecha_discovery si la fuente trae fecha_publicacion (C21/Remax).
-- Si no trae (Bien Inmuebles), conservar la fecha_discovery original.
-- También: reactivar expirado_stale si se redescubre.

CREATE OR REPLACE FUNCTION public.registrar_discovery_alquiler(
    p_url TEXT,
    p_fuente TEXT,
    p_codigo_propiedad TEXT DEFAULT NULL,
    p_tipo_propiedad_original TEXT DEFAULT NULL,
    p_precio_mensual_bob NUMERIC DEFAULT NULL,
    p_precio_mensual_usd NUMERIC DEFAULT NULL,
    p_moneda_original TEXT DEFAULT NULL,
    p_area_total_m2 NUMERIC DEFAULT NULL,
    p_dormitorios INTEGER DEFAULT NULL,
    p_banos NUMERIC DEFAULT NULL,
    p_estacionamientos TEXT DEFAULT NULL,
    p_latitud NUMERIC DEFAULT NULL,
    p_longitud NUMERIC DEFAULT NULL,
    p_zona TEXT DEFAULT NULL,
    p_datos_json_discovery JSONB DEFAULT NULL,
    p_metodo_discovery TEXT DEFAULT 'scraping_api',
    p_fecha_publicacion DATE DEFAULT NULL
)
RETURNS TABLE(id INTEGER, status TEXT, message TEXT)
LANGUAGE plpgsql
AS $$
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
            'alquiler'::tipo_operacion_enum,
            p_tipo_propiedad_original,
            v_precio_usd_calc,
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
            'nueva'::estado_propiedad,
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
        -- v165: Solo actualizar fecha_discovery si la fuente tiene fecha_publicacion.
        -- Bien Inmuebles no tiene fecha_publicacion, así que necesita conservar
        -- la fecha_discovery original para calcular días en mercado correctamente.
        fecha_discovery = CASE
            WHEN p_fecha_publicacion IS NOT NULL THEN NOW()  -- C21/Remax: tienen fecha_pub, discovery se actualiza
            ELSE fecha_discovery                              -- BI: sin fecha_pub, conservar original
        END,
        metodo_discovery = p_metodo_discovery,
        fecha_publicacion = COALESCE(p_fecha_publicacion, fecha_publicacion),
        fecha_actualizacion = NOW(),
        es_activa = TRUE,

        -- Si estaba excluida, inactiva pending o expirada, reactivar
        status = CASE
            WHEN status IN ('excluido_operacion', 'inactivo_pending', 'expirado_stale') THEN 'nueva'::estado_propiedad
            WHEN status = 'completado' THEN 'actualizado'::estado_propiedad
            ELSE status
        END

    WHERE propiedades_v2.id = v_id;

    RETURN QUERY SELECT
        v_id,
        'updated'::TEXT,
        format('Alquiler actualizado (id=%s)', v_id)::TEXT;

END;
$$;

-- Fix retroactivo: restaurar fecha_discovery original para Bien Inmuebles
-- Usar fecha_creacion como proxy (es la fecha del primer INSERT)
UPDATE propiedades_v2
SET fecha_discovery = fecha_creacion
WHERE fuente = 'bien_inmuebles'
  AND tipo_operacion = 'alquiler'
  AND fecha_creacion < fecha_discovery;
