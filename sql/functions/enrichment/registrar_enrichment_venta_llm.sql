-- ═══════════════════════════════════════════════════════
-- registrar_enrichment_venta_llm() v1.0.0
-- ═══════════════════════════════════════════════════════
-- Registra resultados del enrichment LLM para ventas.
-- Respeta campos_bloqueados (candados manuales).
-- No sobreescribe campos con confianza alta existente.
--
-- NOTA: Esta función es para producción futura.
-- Durante testing se usa la tabla llm_enrichment_test_results.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION registrar_enrichment_venta_llm(
    p_id INTEGER,
    p_datos_llm JSONB,
    p_modelo_usado TEXT DEFAULT 'claude-haiku-4.5',
    p_tokens_usados INTEGER DEFAULT NULL,
    p_requiere_revision BOOLEAN DEFAULT FALSE,
    p_errores_validacion TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_prop RECORD;
    v_bloqueados JSONB;
    v_cambios JSONB := '{}';
    v_campo TEXT;
    v_llm_valor JSONB;
BEGIN
    -- 1. Validar que la propiedad existe y es venta
    SELECT id, tipo_operacion, campos_bloqueados, nombre_edificio,
           estado_construccion, tipo_cambio_detectado, depende_de_tc,
           parqueo_incluido, parqueo_precio_adicional,
           baulera, baulera_incluido, baulera_precio_adicional,
           piso, plan_pagos_desarrollador, descuento_contado_pct,
           acepta_permuta, precio_negociable, solo_tc_paralelo
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Propiedad no encontrada: ' || p_id);
    END IF;

    IF v_prop.tipo_operacion != 'venta' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Propiedad no es venta: ' || p_id);
    END IF;

    v_bloqueados := COALESCE(v_prop.campos_bloqueados, '{}'::JSONB);

    -- 2. Helper: verificar si campo está bloqueado
    -- Soporta ambos formatos: {"campo": true} y {"campo": {"bloqueado": true}}
    -- Si está bloqueado, no se actualiza

    -- 3. Actualizar campos directos (solo si no bloqueados)

    -- nombre_edificio
    IF p_datos_llm->>'nombre_edificio' IS NOT NULL
       AND NOT (v_bloqueados->>'nombre_edificio')::boolean IS TRUE
       AND NOT (v_bloqueados->'nombre_edificio'->>'bloqueado')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET nombre_edificio = p_datos_llm->>'nombre_edificio'
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('nombre_edificio', p_datos_llm->>'nombre_edificio');
    END IF;

    -- estado_construccion
    IF p_datos_llm->>'estado_construccion' IS NOT NULL
       AND NOT (v_bloqueados->>'estado_construccion')::boolean IS TRUE
       AND NOT (v_bloqueados->'estado_construccion'->>'bloqueado')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET estado_construccion = (p_datos_llm->>'estado_construccion')::estado_construccion_enum
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('estado_construccion', p_datos_llm->>'estado_construccion');
    END IF;

    -- tipo_cambio_detectado
    IF p_datos_llm->>'tipo_cambio_detectado' IS NOT NULL
       AND NOT (v_bloqueados->>'tipo_cambio_detectado')::boolean IS TRUE
       AND NOT (v_bloqueados->'tipo_cambio_detectado'->>'bloqueado')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET tipo_cambio_detectado = p_datos_llm->>'tipo_cambio_detectado'
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('tipo_cambio_detectado', p_datos_llm->>'tipo_cambio_detectado');
    END IF;

    -- depende_de_tc
    IF p_datos_llm->'depende_de_tc' IS NOT NULL AND p_datos_llm->>'depende_de_tc' != 'null'
       AND NOT (v_bloqueados->>'depende_de_tc')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET depende_de_tc = (p_datos_llm->>'depende_de_tc')::boolean
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('depende_de_tc', p_datos_llm->'depende_de_tc');
    END IF;

    -- piso
    IF p_datos_llm->'piso' IS NOT NULL AND p_datos_llm->>'piso' != 'null'
       AND NOT (v_bloqueados->>'piso')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET piso = (p_datos_llm->>'piso')::integer
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('piso', p_datos_llm->'piso');
    END IF;

    -- parqueo_incluido
    IF p_datos_llm->'parqueo_incluido' IS NOT NULL AND p_datos_llm->>'parqueo_incluido' != 'null'
       AND NOT (v_bloqueados->>'parqueo_incluido')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET parqueo_incluido = (p_datos_llm->>'parqueo_incluido')::boolean
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('parqueo_incluido', p_datos_llm->'parqueo_incluido');
    END IF;

    -- parqueo_precio_adicional
    IF p_datos_llm->'parqueo_precio_adicional_usd' IS NOT NULL AND p_datos_llm->>'parqueo_precio_adicional_usd' != 'null'
       AND NOT (v_bloqueados->>'parqueo_precio_adicional')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET parqueo_precio_adicional = (p_datos_llm->>'parqueo_precio_adicional_usd')::numeric
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('parqueo_precio_adicional', p_datos_llm->'parqueo_precio_adicional_usd');
    END IF;

    -- baulera
    IF p_datos_llm->'baulera_incluida' IS NOT NULL AND p_datos_llm->>'baulera_incluida' != 'null'
       AND NOT (v_bloqueados->>'baulera')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET baulera = (p_datos_llm->>'baulera_incluida')::boolean
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('baulera', p_datos_llm->'baulera_incluida');
    END IF;

    -- baulera_incluido + baulera_precio_adicional
    IF p_datos_llm->'baulera_incluida' IS NOT NULL AND p_datos_llm->>'baulera_incluida' != 'null'
       AND NOT (v_bloqueados->>'baulera_incluido')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET baulera_incluido = (p_datos_llm->>'baulera_incluida')::boolean
        WHERE id = p_id;
    END IF;

    IF p_datos_llm->'baulera_precio_adicional_usd' IS NOT NULL AND p_datos_llm->>'baulera_precio_adicional_usd' != 'null'
       AND NOT (v_bloqueados->>'baulera_precio_adicional')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET baulera_precio_adicional = (p_datos_llm->>'baulera_precio_adicional_usd')::numeric
        WHERE id = p_id;
    END IF;

    -- plan_pagos_desarrollador
    IF p_datos_llm->'plan_pagos' IS NOT NULL
       AND p_datos_llm->'plan_pagos'->>'tiene_plan_pagos' IS NOT NULL
       AND NOT (v_bloqueados->>'plan_pagos_desarrollador')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET plan_pagos_desarrollador = (p_datos_llm->'plan_pagos'->>'tiene_plan_pagos')::boolean
        WHERE id = p_id;
        v_cambios := v_cambios || jsonb_build_object('plan_pagos_desarrollador', p_datos_llm->'plan_pagos'->'tiene_plan_pagos');
    END IF;

    -- descuento_contado_pct
    IF p_datos_llm->'plan_pagos'->'descuento_contado_pct' IS NOT NULL
       AND p_datos_llm->'plan_pagos'->>'descuento_contado_pct' != 'null'
       AND NOT (v_bloqueados->>'descuento_contado_pct')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET descuento_contado_pct = (p_datos_llm->'plan_pagos'->>'descuento_contado_pct')::numeric
        WHERE id = p_id;
    END IF;

    -- acepta_permuta
    IF p_datos_llm->'plan_pagos'->'acepta_permuta' IS NOT NULL
       AND p_datos_llm->'plan_pagos'->>'acepta_permuta' != 'null'
       AND NOT (v_bloqueados->>'acepta_permuta')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET acepta_permuta = (p_datos_llm->'plan_pagos'->>'acepta_permuta')::boolean
        WHERE id = p_id;
    END IF;

    -- precio_negociable
    IF p_datos_llm->'plan_pagos'->'precio_negociable' IS NOT NULL
       AND p_datos_llm->'plan_pagos'->>'precio_negociable' != 'null'
       AND NOT (v_bloqueados->>'precio_negociable')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET precio_negociable = (p_datos_llm->'plan_pagos'->>'precio_negociable')::boolean
        WHERE id = p_id;
    END IF;

    -- solo_tc_paralelo
    IF p_datos_llm->'plan_pagos'->'solo_tc_paralelo' IS NOT NULL
       AND p_datos_llm->'plan_pagos'->>'solo_tc_paralelo' != 'null'
       AND NOT (v_bloqueados->>'solo_tc_paralelo')::boolean IS TRUE
    THEN
        UPDATE propiedades_v2
        SET solo_tc_paralelo = (p_datos_llm->'plan_pagos'->>'solo_tc_paralelo')::boolean
        WHERE id = p_id;
    END IF;

    -- 4. Guardar LLM output completo en datos_json_enrichment
    UPDATE propiedades_v2
    SET datos_json_enrichment = COALESCE(datos_json_enrichment, '{}'::jsonb)
        || jsonb_build_object(
            'llm_output', p_datos_llm,
            'llm_metadata', jsonb_build_object(
                'modelo', p_modelo_usado,
                'tokens', p_tokens_usados,
                'fecha', NOW(),
                'requiere_revision', p_requiere_revision,
                'errores_validacion', COALESCE(to_jsonb(p_errores_validacion), '[]'::jsonb),
                'cambios_aplicados', v_cambios
            )
        ),
        fecha_enrichment = NOW(),
        fecha_actualizacion = NOW()
    WHERE id = p_id;

    -- 5. Si requiere revisión, agregar flag
    IF p_requiere_revision THEN
        UPDATE propiedades_v2
        SET flags_semanticos = COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
                'tipo', 'llm_revision',
                'mensaje', 'LLM enrichment requiere revisión: ' || array_to_string(COALESCE(p_errores_validacion, ARRAY[]::text[]), ', '),
                'fecha', NOW()
            )
        )
        WHERE id = p_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'property_id', p_id,
        'modelo', p_modelo_usado,
        'tokens', p_tokens_usados,
        'requiere_revision', p_requiere_revision,
        'cambios', v_cambios,
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql;
