-- =====================================================
-- FUNCIONES AUXILIARES PARA registrar_discovery()
-- Fecha: 5 Enero 2026
-- Propósito: Helper functions que faltaban
-- =====================================================

-- =====================================================
-- 1. registrar_discrepancia_cambio()
-- =====================================================
-- Genera un objeto JSONB documentando un cambio de valor
-- Usado para tracking de cambios en discovery
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_discrepancia_cambio(
    p_campo TEXT,
    p_valor_anterior NUMERIC,
    p_valor_nuevo NUMERIC
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'campo', p_campo,
        'valor_anterior', p_valor_anterior,
        'valor_nuevo', p_valor_nuevo,
        'fecha', NOW(),
        'fuente', 'discovery'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Overload para valores INTEGER
CREATE OR REPLACE FUNCTION registrar_discrepancia_cambio(
    p_campo TEXT,
    p_valor_anterior INTEGER,
    p_valor_nuevo INTEGER
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'campo', p_campo,
        'valor_anterior', p_valor_anterior,
        'valor_nuevo', p_valor_nuevo,
        'fecha', NOW(),
        'fuente', 'discovery'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Overload para valores TEXT
CREATE OR REPLACE FUNCTION registrar_discrepancia_cambio(
    p_campo TEXT,
    p_valor_anterior TEXT,
    p_valor_nuevo TEXT
) RETURNS JSONB AS $$
BEGIN
    RETURN jsonb_build_object(
        'campo', p_campo,
        'valor_anterior', p_valor_anterior,
        'valor_nuevo', p_valor_nuevo,
        'fecha', NOW(),
        'fuente', 'discovery'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION registrar_discrepancia_cambio(TEXT, NUMERIC, NUMERIC) IS
'Genera JSONB documentando cambio de valor numérico en discovery';


-- =====================================================
-- 2. determinar_status_post_discovery()
-- =====================================================
-- Determina el nuevo status después de un discovery update
-- Basado en status actual y si hubo cambios
-- =====================================================

CREATE OR REPLACE FUNCTION determinar_status_post_discovery(
    p_id INTEGER,
    p_status_actual estado_propiedad,
    p_hubo_cambios BOOLEAN
) RETURNS estado_propiedad AS $$
DECLARE
    v_tiene_enrichment BOOLEAN;
BEGIN
    -- Verificar si tiene datos de enrichment
    SELECT fecha_enrichment IS NOT NULL
    INTO v_tiene_enrichment
    FROM propiedades_v2
    WHERE id = p_id;

    -- Lógica de transición de status
    CASE p_status_actual
        -- Si es nueva y hubo cambios, sigue nueva (pendiente enrichment)
        WHEN 'nueva' THEN
            RETURN 'nueva';

        -- Si está pendiente enriquecimiento, sigue así
        WHEN 'pendiente_enriquecimiento' THEN
            RETURN 'pendiente_enriquecimiento';

        -- Si está completado y hubo cambios significativos
        WHEN 'completado' THEN
            IF p_hubo_cambios AND v_tiene_enrichment THEN
                -- Podría necesitar re-merge, pero por ahora mantener
                RETURN 'completado';
            ELSE
                RETURN 'completado';
            END IF;

        -- Si está actualizado
        WHEN 'actualizado' THEN
            IF p_hubo_cambios THEN
                RETURN 'actualizado';
            ELSE
                RETURN 'actualizado';
            END IF;

        -- Inactivos: si discovery los encuentra, reactivar
        WHEN 'inactivo_pending' THEN
            RETURN 'actualizado';

        WHEN 'inactivo_confirmed' THEN
            RETURN 'actualizado';

        -- Excluidos por operación (alquiler/anticrético) no cambian
        WHEN 'excluido_operacion' THEN
            RETURN 'excluido_operacion';

        ELSE
            -- Default: mantener status actual
            RETURN COALESCE(p_status_actual, 'nueva');
    END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION determinar_status_post_discovery IS
'Determina nuevo status después de discovery basado en status actual y cambios detectados';


-- =====================================================
-- VERIFICACIÓN
-- =====================================================
DO $$
BEGIN
    -- Test registrar_discrepancia_cambio
    PERFORM registrar_discrepancia_cambio('test', 100.00, 200.00);
    RAISE NOTICE 'registrar_discrepancia_cambio() OK';

    RAISE NOTICE 'Funciones auxiliares creadas correctamente';
END $$;
