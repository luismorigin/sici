-- ============================================================================
-- Migración 215: Fix registrar_discovery() — limpiar primera_ausencia_at
--
-- ROOT CAUSE: Cuando discovery re-encuentra una prop que estaba inactiva,
-- registrar_discovery() la reactiva (es_activa=true, status=actualizado)
-- pero NO limpia primera_ausencia_at ni razon_inactiva.
--
-- EFECTO: Si el scraper falla en encontrar la prop una noche, "Marcar Ausentes"
-- la pone como inactivo_pending con COALESCE(primera_ausencia_at, NOW())
-- preservando el valor viejo (semanas atrás). El verificador ve dias_desde_ausencia
-- >> 2 días y auto-confirma INMEDIATAMENTE en vez de dar 2 días de gracia.
--
-- IMPACTO: 57 de 118 props Remax activas tienen primera_ausencia_at stale.
-- 48% del inventario Remax es vulnerable a falsos positivos.
--
-- FIX: Agregar primera_ausencia_at = NULL, razon_inactiva = NULL al UPDATE
-- del PASO 3 de registrar_discovery().
--
-- SEGURIDAD ABSORCIÓN: El cleanup solo toca props con status='completado' +
-- es_activa=true. Los snapshots de absorción solo cuentan status='inactivo_confirmed'.
-- Conjuntos disjuntos — cero impacto en absorción.
--
-- Fecha: 2026-04-15
-- ============================================================================

-- ============================================================================
-- PARTE 1: FIX registrar_discovery()
-- Cambio: 2 líneas nuevas en PASO 3 UPDATE (marcadas con -- FIX 215)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_discovery(
    p_url VARCHAR,
    p_fuente VARCHAR,
    p_codigo_propiedad VARCHAR DEFAULT NULL,
    p_tipo_operacion VARCHAR DEFAULT NULL,
    p_tipo_propiedad_original TEXT DEFAULT NULL,
    p_estado_construccion VARCHAR DEFAULT NULL,
    p_precio_usd NUMERIC DEFAULT NULL,
    p_precio_usd_original NUMERIC DEFAULT NULL,
    p_moneda_original VARCHAR DEFAULT NULL,
    p_area_total_m2 NUMERIC DEFAULT NULL,
    p_dormitorios INTEGER DEFAULT NULL,
    p_banos NUMERIC DEFAULT NULL,
    p_estacionamientos INTEGER DEFAULT NULL,
    p_latitud NUMERIC DEFAULT NULL,
    p_longitud NUMERIC DEFAULT NULL,
    p_fecha_publicacion DATE DEFAULT NULL,
    p_metodo_discovery VARCHAR DEFAULT 'api_rest',
    p_datos_json_discovery JSONB DEFAULT NULL
)
RETURNS TABLE(
    id INTEGER,
    status estado_propiedad,
    es_nueva BOOLEAN,
    cambios_detectados JSONB
) AS $function$
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
    -- Usa _is_campo_bloqueado() que soporta ambos formatos de candados:
    -- Formato viejo: {"campo": true}
    -- Formato nuevo: {"campo": {"bloqueado": true, "por": "admin", ...}}

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
            url, fuente, codigo_propiedad,
            tipo_operacion, tipo_propiedad_original, estado_construccion,
            precio_usd, precio_usd_original, moneda_original,
            area_total_m2, dormitorios, banos, estacionamientos,
            latitud, longitud,
            datos_json_discovery, fecha_discovery, metodo_discovery,
            status, fecha_publicacion, fecha_creacion, fecha_actualizacion,
            es_activa, es_para_matching
        )
        VALUES (
            p_url, p_fuente, p_codigo_propiedad,
            p_tipo_operacion::tipo_operacion_enum, p_tipo_propiedad_original,
            p_estado_construccion::estado_construccion_enum,
            p_precio_usd, p_precio_usd_original, p_moneda_original,
            p_area_total_m2, p_dormitorios, p_banos, p_estacionamientos,
            p_latitud, p_longitud,
            p_datos_json_discovery, NOW(), p_metodo_discovery,
            CASE
                WHEN p_tipo_operacion NOT IN ('venta') THEN 'excluido_operacion'::estado_propiedad
                ELSE 'nueva'::estado_propiedad
            END,
            p_fecha_publicacion, NOW(), NOW(),
            TRUE, TRUE
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
        IF NOT _is_campo_bloqueado(v_campos_bloqueados, 'precio_usd') THEN
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

        IF NOT _is_campo_bloqueado(v_campos_bloqueados, 'area_total_m2') THEN
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

        IF NOT _is_campo_bloqueado(v_campos_bloqueados, 'dormitorios') THEN
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

        -- 3.3 UPDATE respetando candados (soporta formato viejo y nuevo)
        UPDATE propiedades_v2
        SET
            -- Actualizar solo si NO están bloqueados
            codigo_propiedad = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'codigo_propiedad')
                THEN codigo_propiedad
                ELSE COALESCE(p_codigo_propiedad, codigo_propiedad)
            END,

            tipo_operacion = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'tipo_operacion')
                THEN tipo_operacion
                ELSE COALESCE(p_tipo_operacion::tipo_operacion_enum, tipo_operacion)
            END,

            tipo_propiedad_original = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'tipo_propiedad_original')
                THEN tipo_propiedad_original
                ELSE COALESCE(p_tipo_propiedad_original, tipo_propiedad_original)
            END,

            estado_construccion = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'estado_construccion')
                THEN estado_construccion
                ELSE COALESCE(p_estado_construccion::estado_construccion_enum, estado_construccion)
            END,

            -- Financiero
            precio_usd = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'precio_usd')
                THEN precio_usd
                ELSE COALESCE(p_precio_usd, precio_usd)
            END,

            precio_usd_original = COALESCE(p_precio_usd_original, precio_usd_original),
            moneda_original = COALESCE(p_moneda_original, moneda_original),

            -- Físico
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

            -- GPS
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
            END,

            -- FIX 215: Limpiar metadata de verificación al re-encontrar prop
            -- Sin esto, primera_ausencia_at stale causa auto-confirmación
            -- inmediata del verificador (dias_desde_ausencia >> 2)
            primera_ausencia_at = NULL,
            razon_inactiva = NULL

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
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION registrar_discovery IS 'Función principal Flujo A: INSERT/UPDATE idempotente desde API/Grid con respeto a candados. Fix 215: limpia primera_ausencia_at al re-encontrar.';

-- ============================================================================
-- PARTE 2: Cleanup one-time — limpiar stale en props activas
-- Solo toca status='completado' + es_activa=true (NO afecta absorción)
-- ============================================================================

UPDATE propiedades_v2
SET primera_ausencia_at = NULL,
    razon_inactiva = NULL
WHERE status = 'completado'
  AND es_activa = true
  AND (primera_ausencia_at IS NOT NULL OR razon_inactiva IS NOT NULL);

-- ============================================================================
-- PARTE 3: Verificación post-deploy
-- ============================================================================

-- Debe retornar 0 filas:
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE status = 'completado' AND es_activa = true
--   AND (primera_ausencia_at IS NOT NULL OR razon_inactiva IS NOT NULL);
