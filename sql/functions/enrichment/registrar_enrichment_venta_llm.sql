-- ═══════════════════════════════════════════════════════
-- registrar_enrichment_venta_llm() v2.0.0
-- ═══════════════════════════════════════════════════════
-- MODO OBSERVACIÓN: solo guarda en datos_json_enrichment.
-- NO actualiza columnas directamente.
-- Fase C (futuro) activará escritura a columnas vía merge.
--
-- Cambios v2.0 vs v1.0:
--   - Modo observación: solo guarda llm_output + llm_metadata
--   - Removido: depende_de_tc
--   - Validación: estado_construccion solo preventa/entrega_inmediata
--   - Validación: dormitorios 0-6, baños 0-6
--   - Mantiene flags_semanticos para requiere_revision
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION registrar_enrichment_venta_llm(
    p_id INTEGER,
    p_datos_llm JSONB,
    p_modelo_usado TEXT DEFAULT 'claude-haiku-4-5-20251001',
    p_tokens_usados INTEGER DEFAULT NULL,
    p_requiere_revision BOOLEAN DEFAULT FALSE,
    p_errores_validacion TEXT[] DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_prop RECORD;
    v_estado TEXT;
    v_dorms INTEGER;
    v_banos NUMERIC;
    v_errores TEXT[] := COALESCE(p_errores_validacion, ARRAY[]::TEXT[]);
BEGIN
    -- 1. Validar que la propiedad existe y es venta
    SELECT id, tipo_operacion
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Propiedad no encontrada: ' || p_id);
    END IF;

    IF v_prop.tipo_operacion != 'venta' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Propiedad no es venta: ' || p_id);
    END IF;

    -- 2. Validaciones server-side (defensa en profundidad)

    -- estado_construccion: solo preventa o entrega_inmediata
    v_estado := p_datos_llm->>'estado_construccion';
    IF v_estado IS NOT NULL AND v_estado NOT IN ('preventa', 'entrega_inmediata') THEN
        v_errores := array_append(v_errores, 'estado_construccion_invalido: ' || v_estado);
        -- Limpiar del JSONB
        p_datos_llm := p_datos_llm - 'estado_construccion';
    END IF;

    -- dormitorios: 0-6
    IF p_datos_llm->'dormitorios' IS NOT NULL AND p_datos_llm->>'dormitorios' != 'null' THEN
        v_dorms := (p_datos_llm->>'dormitorios')::INTEGER;
        IF v_dorms < 0 OR v_dorms > 6 THEN
            v_errores := array_append(v_errores, 'dormitorios_fuera_rango: ' || v_dorms);
            p_datos_llm := p_datos_llm - 'dormitorios';
        END IF;
    END IF;

    -- banos: 0-6
    IF p_datos_llm->'banos' IS NOT NULL AND p_datos_llm->>'banos' != 'null' THEN
        v_banos := (p_datos_llm->>'banos')::NUMERIC;
        IF v_banos < 0 OR v_banos > 6 THEN
            v_errores := array_append(v_errores, 'banos_fuera_rango: ' || v_banos);
            p_datos_llm := p_datos_llm - 'banos';
        END IF;
    END IF;

    -- 3. Guardar LLM output en datos_json_enrichment (SOLO observación)
    -- Si p_datos_llm es NULL (parse error), solo guardar metadata sin llm_output
    -- para que el filtro IS NULL lo recoja en el siguiente retry
    IF p_datos_llm IS NOT NULL THEN
        UPDATE propiedades_v2
        SET datos_json_enrichment = COALESCE(datos_json_enrichment, '{}'::jsonb)
            || jsonb_build_object(
                'llm_output', p_datos_llm,
                'llm_metadata', jsonb_build_object(
                    'modelo', p_modelo_usado,
                    'tokens', p_tokens_usados,
                    'fecha', NOW(),
                    'version', 'v4.1',
                    'requiere_revision', p_requiere_revision OR (array_length(v_errores, 1) > 2),
                    'errores_validacion', COALESCE(to_jsonb(v_errores), '[]'::jsonb)
                )
            ),
            fecha_actualizacion = NOW()
        WHERE id = p_id;
    ELSE
        -- Parse error: guardar solo metadata, NO llm_output
        -- La prop queda elegible para retry (llm_output IS NULL)
        UPDATE propiedades_v2
        SET datos_json_enrichment = COALESCE(datos_json_enrichment, '{}'::jsonb)
            || jsonb_build_object(
                'llm_metadata', jsonb_build_object(
                    'modelo', p_modelo_usado,
                    'tokens', p_tokens_usados,
                    'fecha', NOW(),
                    'version', 'v4.1',
                    'parse_error', true,
                    'requiere_revision', true,
                    'errores_validacion', COALESCE(to_jsonb(v_errores), '[]'::jsonb)
                )
            ),
            fecha_actualizacion = NOW()
        WHERE id = p_id;
    END IF;

    -- 4. Si requiere revisión, agregar flag semántico
    IF p_requiere_revision OR (array_length(v_errores, 1) > 2) THEN
        UPDATE propiedades_v2
        SET flags_semanticos = COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object(
                'tipo', 'llm_revision',
                'mensaje', 'LLM enrichment venta requiere revisión: ' || array_to_string(v_errores, ', '),
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
        'requiere_revision', p_requiere_revision OR (array_length(v_errores, 1) > 2),
        'errores_validacion', to_jsonb(v_errores),
        'modo', 'observacion',
        'timestamp', NOW()
    );
END;
$$ LANGUAGE plpgsql;
