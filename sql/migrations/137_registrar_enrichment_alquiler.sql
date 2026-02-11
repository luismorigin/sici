-- =====================================================
-- Migración 137: NUEVA función registrar_enrichment_alquiler()
-- Propósito: Guardar datos del LLM para alquileres en propiedades_v2
-- Fecha: 11 Feb 2026
-- Prerequisito: 135 (columnas), 136 (discovery alquiler)
-- IMPORTANTE: NO modifica registrar_enrichment() existente
-- =====================================================
-- Recibe JSON validado del LLM (ya parseado y validado por n8n).
-- Escribe a columnas directas + datos_json_enrichment.
-- Respeta campos_bloqueados con _is_campo_bloqueado().
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_enrichment_alquiler(
    p_id INTEGER,                                  -- ID en propiedades_v2
    p_datos_llm JSONB,                             -- JSON completo del LLM
    p_modelo_usado TEXT DEFAULT 'claude-haiku-4.0',
    p_tokens_usados INTEGER DEFAULT NULL,
    p_requiere_revision BOOLEAN DEFAULT FALSE,
    p_errores_validacion TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_prop RECORD;
    v_candados JSONB;
    v_status_nuevo estado_propiedad;
    v_rows INTEGER;
BEGIN
    -- ========================================================================
    -- PASO 1: Validar que existe y es alquiler
    -- ========================================================================
    SELECT
        id, tipo_operacion, status, campos_bloqueados
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Propiedad ID %s no encontrada', p_id)
        );
    END IF;

    IF v_prop.tipo_operacion != 'alquiler' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Propiedad ID %s no es alquiler (es %s)', p_id, v_prop.tipo_operacion)
        );
    END IF;

    -- No enriquecer inactivas confirmadas
    IF v_prop.status = 'inactivo_confirmed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Propiedad ID %s inactiva confirmada', p_id)
        );
    END IF;

    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::jsonb);

    -- Determinar status post-enrichment
    IF p_requiere_revision THEN
        -- No hay 'requiere_revision' en el enum, usar flag en datos_json
        v_status_nuevo := 'actualizado'::estado_propiedad;
    ELSE
        v_status_nuevo := 'actualizado'::estado_propiedad;
    END IF;

    -- ========================================================================
    -- PASO 2: UPDATE columnas directas + JSON enrichment
    -- ========================================================================
    UPDATE propiedades_v2
    SET
        -- COLUMNAS ESPECÍFICAS DE ALQUILER
        precio_mensual_bob = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_mensual_bob')
            THEN precio_mensual_bob
            WHEN (p_datos_llm->>'precio_mensual_bob') IS NOT NULL
            THEN (p_datos_llm->>'precio_mensual_bob')::NUMERIC
            ELSE precio_mensual_bob
        END,

        precio_mensual_usd = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_mensual_usd')
            THEN precio_mensual_usd
            WHEN (p_datos_llm->>'precio_mensual_usd') IS NOT NULL
            THEN (p_datos_llm->>'precio_mensual_usd')::NUMERIC
            -- Auto-calcular si tenemos BOB pero no USD
            WHEN (p_datos_llm->>'precio_mensual_bob') IS NOT NULL AND precio_mensual_usd IS NULL
            THEN ROUND((p_datos_llm->>'precio_mensual_bob')::NUMERIC / 6.96, 2)
            ELSE precio_mensual_usd
        END,

        monto_expensas_bob = CASE
            WHEN _is_campo_bloqueado(v_candados, 'monto_expensas_bob')
            THEN monto_expensas_bob
            WHEN (p_datos_llm->>'expensas_bs') IS NOT NULL
            THEN (p_datos_llm->>'expensas_bs')::NUMERIC
            ELSE monto_expensas_bob
        END,

        -- FIX BUG-05: clamp deposito_meses al rango del CHECK (0-6)
        deposito_meses = CASE
            WHEN _is_campo_bloqueado(v_candados, 'deposito_meses')
            THEN deposito_meses
            WHEN (p_datos_llm->>'deposito_meses') IS NOT NULL
                AND (p_datos_llm->>'deposito_meses')::NUMERIC BETWEEN 0 AND 6
            THEN (p_datos_llm->>'deposito_meses')::NUMERIC
            ELSE deposito_meses
        END,

        -- FIX BUG-04: LOWER() + mapeo para amoblado (CHECK: si/no/semi/null)
        amoblado = CASE
            WHEN _is_campo_bloqueado(v_candados, 'amoblado')
            THEN amoblado
            WHEN (p_datos_llm->>'amoblado') IS NOT NULL
            THEN CASE LOWER(p_datos_llm->>'amoblado')
                WHEN 'si' THEN 'si'
                WHEN 'sí' THEN 'si'
                WHEN 'no' THEN 'no'
                WHEN 'semi' THEN 'semi'
                WHEN 'parcial' THEN 'semi'
                WHEN 'parcialmente' THEN 'semi'
                ELSE NULL  -- valor desconocido del LLM → null seguro
            END
            ELSE amoblado
        END,

        acepta_mascotas = CASE
            WHEN _is_campo_bloqueado(v_candados, 'acepta_mascotas')
            THEN acepta_mascotas
            WHEN (p_datos_llm->>'acepta_mascotas') IS NOT NULL
            THEN (p_datos_llm->>'acepta_mascotas')::BOOLEAN
            ELSE acepta_mascotas
        END,

        servicios_incluidos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'servicios_incluidos')
            THEN servicios_incluidos
            WHEN p_datos_llm->'servicios_incluidos' IS NOT NULL
                AND jsonb_typeof(p_datos_llm->'servicios_incluidos') = 'array'
            THEN p_datos_llm->'servicios_incluidos'
            ELSE servicios_incluidos
        END,

        contrato_minimo_meses = CASE
            WHEN _is_campo_bloqueado(v_candados, 'contrato_minimo_meses')
            THEN contrato_minimo_meses
            WHEN (p_datos_llm->>'contrato_minimo_meses') IS NOT NULL
            THEN (p_datos_llm->>'contrato_minimo_meses')::INTEGER
            ELSE contrato_minimo_meses
        END,

        -- COLUMNAS COMPARTIDAS (físico)
        area_total_m2 = CASE
            WHEN _is_campo_bloqueado(v_candados, 'area_total_m2')
            THEN area_total_m2
            WHEN (p_datos_llm->>'area_total_m2') IS NOT NULL
                AND (p_datos_llm->>'area_total_m2')::NUMERIC > 0
            THEN (p_datos_llm->>'area_total_m2')::NUMERIC
            ELSE area_total_m2
        END,

        dormitorios = CASE
            WHEN _is_campo_bloqueado(v_candados, 'dormitorios')
            THEN dormitorios
            WHEN (p_datos_llm->>'dormitorios') IS NOT NULL
            THEN (p_datos_llm->>'dormitorios')::INTEGER
            ELSE dormitorios
        END,

        banos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'banos')
            THEN banos
            WHEN (p_datos_llm->>'banos') IS NOT NULL
                AND (p_datos_llm->>'banos')::NUMERIC < 100
            THEN (p_datos_llm->>'banos')::NUMERIC
            ELSE banos
        END,

        estacionamientos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'estacionamientos')
            THEN estacionamientos
            WHEN (p_datos_llm->>'estacionamientos') IS NOT NULL
            THEN (p_datos_llm->>'estacionamientos')::INTEGER
            ELSE estacionamientos
        END,

        baulera = CASE
            WHEN _is_campo_bloqueado(v_candados, 'baulera')
            THEN baulera
            WHEN (p_datos_llm->>'baulera') IS NOT NULL
            THEN (p_datos_llm->>'baulera')::BOOLEAN
            ELSE baulera
        END,

        piso = CASE
            WHEN _is_campo_bloqueado(v_candados, 'piso')
            THEN piso
            WHEN (p_datos_llm->>'piso') IS NOT NULL
            THEN (p_datos_llm->>'piso')::INTEGER
            ELSE piso
        END,

        nombre_edificio = CASE
            WHEN _is_campo_bloqueado(v_candados, 'nombre_edificio')
            THEN nombre_edificio
            WHEN (p_datos_llm->>'nombre_edificio') IS NOT NULL
            THEN p_datos_llm->>'nombre_edificio'
            ELSE nombre_edificio
        END,

        -- JSONB ENRICHMENT (guardar todo el output del LLM)
        datos_json_enrichment = jsonb_build_object(
            'llm_output', p_datos_llm,
            'metadata', jsonb_build_object(
                'modelo', p_modelo_usado,
                'tokens', p_tokens_usados,
                'fecha', NOW(),
                'requiere_revision', p_requiere_revision,
                'errores_validacion', COALESCE(
                    to_jsonb(p_errores_validacion),
                    '[]'::jsonb
                )
            )
        ),

        -- STATUS Y FECHAS
        status = v_status_nuevo,
        fecha_enrichment = NOW(),
        fecha_actualizacion = NOW(),

        -- Flag de revisión en flags_semanticos si hay errores
        flags_semanticos = CASE
            WHEN p_requiere_revision THEN
                COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(
                    jsonb_build_object(
                        'tipo', 'requiere_revision_alquiler',
                        'errores', COALESCE(to_jsonb(p_errores_validacion), '[]'::jsonb),
                        'fecha', NOW()
                    )
                )
            ELSE flags_semanticos
        END

    WHERE id = p_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Update falló');
    END IF;

    -- ========================================================================
    -- PASO 3: Retornar resultado
    -- ========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'property_id', p_id,
        'status', v_status_nuevo,
        'modelo', p_modelo_usado,
        'tokens', p_tokens_usados,
        'requiere_revision', p_requiere_revision,
        'timestamp', NOW()
    );

END;
$$ LANGUAGE plpgsql;

-- Permisos
GRANT EXECUTE ON FUNCTION registrar_enrichment_alquiler TO authenticated;
GRANT EXECUTE ON FUNCTION registrar_enrichment_alquiler TO service_role;

COMMENT ON FUNCTION registrar_enrichment_alquiler IS 'Enrichment LLM para alquileres en propiedades_v2. Independiente del enrichment regex de venta.';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
/*
-- Test (requiere una propiedad alquiler existente)
SELECT * FROM registrar_enrichment_alquiler(
    p_id := 42,  -- ID de un alquiler existente
    p_datos_llm := '{
        "precio_mensual_bob": 5500,
        "precio_mensual_usd": null,
        "expensas_bs": 400,
        "deposito_meses": 2,
        "contrato_minimo_meses": 12,
        "area_total_m2": 85,
        "dormitorios": 2,
        "banos": 2,
        "estacionamientos": 1,
        "piso": 8,
        "amoblado": "si",
        "acepta_mascotas": false,
        "servicios_incluidos": ["agua", "luz"],
        "nombre_edificio": "Sky Moon Tower",
        "descripcion_limpia": "Departamento amoblado 2 dorms",
        "amenities_confirmados": ["piscina", "gimnasio"],
        "equipamiento_detectado": ["cocina_equipada", "calefon"]
    }'::jsonb,
    p_modelo_usado := 'claude-haiku-4.0',
    p_tokens_usados := 3500
);
*/
