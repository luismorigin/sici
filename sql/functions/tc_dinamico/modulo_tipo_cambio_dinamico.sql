-- =====================================================================================
-- SICI - Sistema Inteligente de Captura Inmobiliaria
-- Módulo 1: Property Matching - Arquitectura Dual v2.0
-- =====================================================================================
-- Archivo: modulo_tipo_cambio_dinamico.sql
-- Ubicación: sici/sql/functions/tc_dinamico/modulo_tipo_cambio_dinamico.sql
-- Propósito: Sistema completo de gestión de tipo de cambio con recálculo automático
-- Versión: 1.1.1 (Corrección lógica recálculo + compatibilidad config_global)
-- Fecha: 2024-12-13
-- =====================================================================================
-- CHANGELOG:
--   v1.1.1 (2024-12-13): Corregido bug en recalcular_precio_propiedad()
--          - Prioriza tipo_cambio_paralelo_usado sobre tipo_cambio_usado
--          - Orden: paralelo → oficial → tc_actual (fallback)
--   v1.1.0 (2024-12-13): Compatibilidad con config_global.valor NUMERIC
--   v1.0.0 (2024-12-12): Versión inicial
-- =====================================================================================
-- ESTRUCTURA REAL DE config_global:
--   - valor: NUMERIC (no TEXT)
--   - activo: BOOLEAN
--   - tipo_dato: VARCHAR
--   - actualizado_por: VARCHAR
--   - fecha_actualizacion: TIMESTAMP
-- =====================================================================================
-- COMPONENTES:
--   1. Tabla: auditoria_tipo_cambio
--   2. Función: actualizar_tipo_cambio()
--   3. Función: recalcular_precio_propiedad() ← CORREGIDA v1.1.1
--   4. Función: recalcular_precios_batch_nocturno()
--   5. Función: ver_historial_tc()
--   6. Función: obtener_propiedades_tc_pendiente()
--   7. Función: obtener_tc_actuales()
--   8. Trigger: trigger_tc_actualizado
-- =====================================================================================

-- =====================================================================================
-- VERIFICACIÓN DE ESTRUCTURA config_global
-- =====================================================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'config_global') THEN
        RAISE EXCEPTION 'Tabla config_global no existe. Crear primero.';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'config_global' 
        AND column_name = 'valor' 
        AND data_type IN ('numeric', 'decimal', 'double precision', 'real')
    ) THEN
        RAISE WARNING 'Columna valor en config_global no es numeric. Verificar estructura.';
    END IF;
    
    RAISE NOTICE '✅ Verificación config_global completada';
END $$;

-- =====================================================================================
-- TABLA 1: auditoria_tipo_cambio
-- =====================================================================================
CREATE TABLE IF NOT EXISTS auditoria_tipo_cambio (
    id SERIAL PRIMARY KEY,
    tipo_cambio VARCHAR(20) NOT NULL,
    valor_anterior NUMERIC(10,4),
    valor_nuevo NUMERIC(10,4),
    diferencia_porcentual NUMERIC(8,4),
    propiedades_afectadas INTEGER DEFAULT 0,
    propiedades_actualizadas INTEGER DEFAULT 0,
    ejecutado_por VARCHAR(100),
    metodo VARCHAR(50),
    notas TEXT,
    fecha_cambio TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auditoria_tc_fecha ON auditoria_tipo_cambio(fecha_cambio DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_tc_tipo ON auditoria_tipo_cambio(tipo_cambio);

COMMENT ON TABLE auditoria_tipo_cambio IS 
'Registro histórico de cambios en tipos de cambio y su impacto en propiedades.';

-- =====================================================================================
-- FUNCIÓN 1: actualizar_tipo_cambio
-- =====================================================================================
DROP FUNCTION IF EXISTS actualizar_tipo_cambio(VARCHAR, NUMERIC, VARCHAR, TEXT);

CREATE OR REPLACE FUNCTION actualizar_tipo_cambio(
    p_tipo VARCHAR,
    p_nuevo_valor NUMERIC,
    p_ejecutado_por VARCHAR DEFAULT 'sistema',
    p_notas TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clave VARCHAR;
    v_valor_anterior NUMERIC(10,4);
    v_diferencia_pct NUMERIC(8,4);
    v_propiedades_afectadas INTEGER;
    v_auditoria_id INTEGER;
BEGIN
    v_clave := CASE 
        WHEN p_tipo = 'oficial' THEN 'tipo_cambio_oficial'
        WHEN p_tipo = 'paralelo' THEN 'tipo_cambio_paralelo'
        ELSE NULL
    END;

    IF v_clave IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de cambio inválido. Usar: oficial o paralelo',
            'tipo_recibido', p_tipo
        );
    END IF;

    SELECT valor INTO v_valor_anterior
    FROM config_global 
    WHERE clave = v_clave AND COALESCE(activo, true) = true;

    IF v_valor_anterior IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Clave no encontrada o inactiva en config_global',
            'clave', v_clave
        );
    END IF;

    IF v_valor_anterior IS NOT NULL AND v_valor_anterior > 0 THEN
        v_diferencia_pct := ROUND(
            ((p_nuevo_valor - v_valor_anterior) / v_valor_anterior) * 100, 
            4
        );
    ELSE
        v_diferencia_pct := 0;
    END IF;

    IF p_tipo = 'oficial' THEN
        SELECT COUNT(*) INTO v_propiedades_afectadas
        FROM propiedades_v2
        WHERE tipo_cambio_detectado = 'oficial'
          AND depende_de_tc = TRUE
          AND es_activa = TRUE;
    ELSE
        SELECT COUNT(*) INTO v_propiedades_afectadas
        FROM propiedades_v2
        WHERE tipo_cambio_detectado = 'paralelo'
          AND depende_de_tc = TRUE
          AND es_activa = TRUE;
    END IF;

    UPDATE config_global 
    SET valor = p_nuevo_valor,
        actualizado_por = p_ejecutado_por,
        fecha_actualizacion = NOW()
    WHERE clave = v_clave;

    IF p_tipo = 'oficial' THEN
        UPDATE propiedades_v2
        SET requiere_actualizacion_precio = TRUE,
            fecha_actualizacion = NOW()
        WHERE tipo_cambio_detectado = 'oficial'
          AND depende_de_tc = TRUE
          AND es_activa = TRUE;
    ELSE
        UPDATE propiedades_v2
        SET requiere_actualizacion_precio = TRUE,
            fecha_actualizacion = NOW()
        WHERE tipo_cambio_detectado = 'paralelo'
          AND depende_de_tc = TRUE
          AND es_activa = TRUE;
    END IF;

    INSERT INTO auditoria_tipo_cambio (
        tipo_cambio, valor_anterior, valor_nuevo, 
        diferencia_porcentual, propiedades_afectadas,
        ejecutado_por, metodo, notas
    ) VALUES (
        p_tipo, v_valor_anterior, p_nuevo_valor,
        v_diferencia_pct, v_propiedades_afectadas,
        p_ejecutado_por, 'manual', p_notas
    )
    RETURNING id INTO v_auditoria_id;

    RETURN jsonb_build_object(
        'success', true,
        'operation', 'actualizar_tipo_cambio',
        'tipo', p_tipo,
        'valor_anterior', v_valor_anterior,
        'valor_nuevo', p_nuevo_valor,
        'diferencia_porcentual', v_diferencia_pct,
        'propiedades_afectadas', v_propiedades_afectadas,
        'auditoria_id', v_auditoria_id,
        'mensaje', v_propiedades_afectadas || ' propiedades marcadas para actualización',
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION actualizar_tipo_cambio(VARCHAR, NUMERIC, VARCHAR, TEXT) IS 
'Actualiza TC en config_global (valor NUMERIC nativo), marca propiedades y registra auditoría.';

-- =====================================================================================
-- FUNCIÓN 2: recalcular_precio_propiedad (CORREGIDA v1.1.1)
-- =====================================================================================
DROP FUNCTION IF EXISTS recalcular_precio_propiedad(INTEGER);

CREATE OR REPLACE FUNCTION recalcular_precio_propiedad(p_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prop RECORD;
    v_tc_actual NUMERIC(10,4);
    v_tc_usado_original NUMERIC(10,4);
    v_precio_original_bs NUMERIC(14,2);
    v_precio_nuevo_usd NUMERIC(14,2);
    v_precio_anterior_usd NUMERIC(14,2);
    v_candados JSONB;
BEGIN
    -- =========================================================================
    -- PASO 1: Obtener propiedad
    -- =========================================================================
    SELECT * INTO v_prop FROM propiedades_v2 WHERE id = p_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada',
            'id', p_id
        );
    END IF;

    -- =========================================================================
    -- PASO 2: Validar que depende de TC
    -- =========================================================================
    IF NOT COALESCE(v_prop.depende_de_tc, FALSE) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no depende de tipo de cambio',
            'property_id', v_prop.codigo_propiedad,
            'moneda_original', v_prop.moneda_original,
            'depende_de_tc', v_prop.depende_de_tc
        );
    END IF;

    -- =========================================================================
    -- PASO 3: Verificar candados
    -- =========================================================================
    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::JSONB);
    IF COALESCE((v_candados->>'precio_usd_actualizado')::boolean, false) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Campo precio_usd_actualizado está bloqueado',
            'property_id', v_prop.codigo_propiedad,
            'bloqueado_por', 'campos_bloqueados'
        );
    END IF;

    -- =========================================================================
    -- PASO 4: Obtener TC actual según tipo detectado
    -- =========================================================================
    IF v_prop.tipo_cambio_detectado = 'paralelo' THEN
        SELECT valor INTO v_tc_actual
        FROM config_global 
        WHERE clave = 'tipo_cambio_paralelo'
          AND COALESCE(activo, true) = true;
    ELSE
        SELECT valor INTO v_tc_actual
        FROM config_global 
        WHERE clave = 'tipo_cambio_oficial'
          AND COALESCE(activo, true) = true;
    END IF;

    IF v_tc_actual IS NULL OR v_tc_actual <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Tipo de cambio no válido en config_global',
            'tipo_cambio_detectado', v_prop.tipo_cambio_detectado
        );
    END IF;

    -- =========================================================================
    -- PASO 5: Determinar TC usado originalmente (CORRECCIÓN v1.1.1)
    -- Prioridad: paralelo → oficial → tc_actual (fallback)
    -- =========================================================================
    v_tc_usado_original := COALESCE(
        v_prop.tipo_cambio_paralelo_usado,  -- 1. Prioridad al paralelo si existe
        v_prop.tipo_cambio_usado,            -- 2. Fallback al oficial
        v_tc_actual                          -- 3. Último recurso: TC actual
    );

    -- =========================================================================
    -- PASO 6: Reconstruir precio original en BOB
    -- Fórmula: precio_usd × TC_usado_original = precio_BOB_original
    -- =========================================================================
    v_precio_original_bs := v_prop.precio_usd * v_tc_usado_original;
    
    -- =========================================================================
    -- PASO 7: Calcular nuevo precio USD con TC actual
    -- Fórmula: precio_BOB_original / TC_actual = precio_USD_nuevo
    -- =========================================================================
    v_precio_nuevo_usd := ROUND(v_precio_original_bs / v_tc_actual, 2);
    v_precio_anterior_usd := v_prop.precio_usd_actualizado;

    -- =========================================================================
    -- PASO 8: Actualizar propiedad
    -- =========================================================================
    UPDATE propiedades_v2 SET
        precio_usd_actualizado = v_precio_nuevo_usd,
        requiere_actualizacion_precio = FALSE,
        fecha_ultima_actualizacion_precio = NOW(),
        fecha_actualizacion = NOW()
    WHERE id = p_id;

    -- =========================================================================
    -- PASO 9: Retornar resultado detallado
    -- =========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'recalcular_precio',
        'version', '1.1.1',
        'property_id', v_prop.codigo_propiedad,
        'internal_id', p_id,
        'tipo_cambio_detectado', v_prop.tipo_cambio_detectado,
        'tc_usado_original', v_tc_usado_original,
        'tc_actual', v_tc_actual,
        'precio_usd_original', v_prop.precio_usd,
        'precio_bob_reconstruido', v_precio_original_bs,
        'precio_anterior_actualizado', v_precio_anterior_usd,
        'precio_nuevo_actualizado', v_precio_nuevo_usd,
        'diferencia_usd', v_precio_nuevo_usd - COALESCE(v_precio_anterior_usd, v_prop.precio_usd),
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION recalcular_precio_propiedad(INTEGER) IS 
'v1.1.1: Recalcula precio_usd_actualizado según TC actual.
Corregido: Prioriza tipo_cambio_paralelo_usado sobre tipo_cambio_usado.
Respeta campos_bloqueados. Compatible con config_global.valor NUMERIC.';

-- =====================================================================================
-- FUNCIÓN 3: recalcular_precios_batch_nocturno
-- =====================================================================================
DROP FUNCTION IF EXISTS recalcular_precios_batch_nocturno(INTEGER);

CREATE OR REPLACE FUNCTION recalcular_precios_batch_nocturno(
    p_limite INTEGER DEFAULT 1000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_prop RECORD;
    v_resultado JSONB;
    v_procesadas INTEGER := 0;
    v_exitosas INTEGER := 0;
    v_fallidas INTEGER := 0;
    v_bloqueadas INTEGER := 0;
    v_inicio TIMESTAMP := NOW();
    v_tc_oficial NUMERIC(10,4);
    v_tc_paralelo NUMERIC(10,4);
BEGIN
    SELECT valor INTO v_tc_oficial
    FROM config_global 
    WHERE clave = 'tipo_cambio_oficial'
      AND COALESCE(activo, true) = true;
    
    SELECT valor INTO v_tc_paralelo
    FROM config_global 
    WHERE clave = 'tipo_cambio_paralelo'
      AND COALESCE(activo, true) = true;

    FOR v_prop IN 
        SELECT id, codigo_propiedad
        FROM propiedades_v2
        WHERE requiere_actualizacion_precio = TRUE
          AND depende_de_tc = TRUE
          AND es_activa = TRUE
        ORDER BY fecha_actualizacion ASC
        LIMIT p_limite
    LOOP
        v_procesadas := v_procesadas + 1;
        v_resultado := recalcular_precio_propiedad(v_prop.id);
        
        IF (v_resultado->>'success')::BOOLEAN THEN
            v_exitosas := v_exitosas + 1;
        ELSIF v_resultado->>'error' LIKE '%bloqueado%' THEN
            v_bloqueadas := v_bloqueadas + 1;
        ELSE
            v_fallidas := v_fallidas + 1;
        END IF;
    END LOOP;

    INSERT INTO auditoria_tipo_cambio (
        tipo_cambio, valor_anterior, valor_nuevo,
        propiedades_afectadas, propiedades_actualizadas,
        ejecutado_por, metodo, notas
    ) VALUES (
        'batch', NULL, NULL,
        v_procesadas, v_exitosas,
        'job_nocturno', 'batch_nocturno',
        'Batch: ' || v_exitosas || ' ok, ' || v_bloqueadas || ' bloq, ' || v_fallidas || ' fail'
    );

    RETURN jsonb_build_object(
        'success', true,
        'operation', 'batch_nocturno',
        'procesadas', v_procesadas,
        'exitosas', v_exitosas,
        'bloqueadas', v_bloqueadas,
        'fallidas', v_fallidas,
        'tc_oficial_usado', v_tc_oficial,
        'tc_paralelo_usado', v_tc_paralelo,
        'duracion_ms', EXTRACT(MILLISECONDS FROM (NOW() - v_inicio)),
        'pendientes_restantes', (
            SELECT COUNT(*) FROM propiedades_v2 
            WHERE requiere_actualizacion_precio = TRUE 
              AND depende_de_tc = TRUE 
              AND es_activa = TRUE
        ),
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION recalcular_precios_batch_nocturno(INTEGER) IS 
'Job nocturno para recalcular precios en batch. Usa recalcular_precio_propiedad v1.1.1.';

-- =====================================================================================
-- FUNCIÓN 4: ver_historial_tc
-- =====================================================================================
DROP FUNCTION IF EXISTS ver_historial_tc(INTEGER, VARCHAR);

CREATE OR REPLACE FUNCTION ver_historial_tc(
    p_limite INTEGER DEFAULT 30,
    p_tipo VARCHAR DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    tipo_cambio VARCHAR,
    valor_anterior NUMERIC,
    valor_nuevo NUMERIC,
    diferencia_pct NUMERIC,
    propiedades_afectadas INTEGER,
    propiedades_actualizadas INTEGER,
    ejecutado_por VARCHAR,
    metodo VARCHAR,
    notas TEXT,
    fecha_cambio TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.tipo_cambio,
        a.valor_anterior,
        a.valor_nuevo,
        a.diferencia_porcentual,
        a.propiedades_afectadas,
        a.propiedades_actualizadas,
        a.ejecutado_por,
        a.metodo,
        a.notas,
        a.fecha_cambio
    FROM auditoria_tipo_cambio a
    WHERE (p_tipo IS NULL OR a.tipo_cambio = p_tipo)
    ORDER BY a.fecha_cambio DESC
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION ver_historial_tc(INTEGER, VARCHAR) IS 
'Consulta historial de cambios TC con filtro opcional por tipo.';

-- =====================================================================================
-- FUNCIÓN 5: obtener_propiedades_tc_pendiente
-- =====================================================================================
DROP FUNCTION IF EXISTS obtener_propiedades_tc_pendiente(INTEGER);

CREATE OR REPLACE FUNCTION obtener_propiedades_tc_pendiente(
    p_limite INTEGER DEFAULT 100
)
RETURNS TABLE (
    id INTEGER,
    codigo_propiedad VARCHAR,
    precio_usd NUMERIC,
    precio_usd_actualizado NUMERIC,
    tipo_cambio_detectado VARCHAR,
    tipo_cambio_usado NUMERIC,
    fecha_ultima_actualizacion TIMESTAMP
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.codigo_propiedad,
        p.precio_usd,
        p.precio_usd_actualizado,
        p.tipo_cambio_detectado,
        p.tipo_cambio_usado,
        p.fecha_ultima_actualizacion_precio
    FROM propiedades_v2 p
    WHERE p.requiere_actualizacion_precio = TRUE
      AND p.depende_de_tc = TRUE
      AND p.es_activa = TRUE
    ORDER BY p.fecha_actualizacion ASC
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION obtener_propiedades_tc_pendiente(INTEGER) IS 
'Lista propiedades pendientes de actualización por cambio de TC.';

-- =====================================================================================
-- FUNCIÓN 6: obtener_tc_actuales
-- =====================================================================================
DROP FUNCTION IF EXISTS obtener_tc_actuales();

CREATE OR REPLACE FUNCTION obtener_tc_actuales()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_tc_oficial NUMERIC(10,4);
    v_tc_paralelo NUMERIC(10,4);
    v_fecha_oficial TIMESTAMP;
    v_fecha_paralelo TIMESTAMP;
BEGIN
    SELECT valor, fecha_actualizacion 
    INTO v_tc_oficial, v_fecha_oficial
    FROM config_global 
    WHERE clave = 'tipo_cambio_oficial'
      AND COALESCE(activo, true) = true;
    
    SELECT valor, fecha_actualizacion 
    INTO v_tc_paralelo, v_fecha_paralelo
    FROM config_global 
    WHERE clave = 'tipo_cambio_paralelo'
      AND COALESCE(activo, true) = true;

    RETURN jsonb_build_object(
        'oficial', jsonb_build_object(
            'valor', v_tc_oficial,
            'fecha_actualizacion', v_fecha_oficial
        ),
        'paralelo', jsonb_build_object(
            'valor', v_tc_paralelo,
            'fecha_actualizacion', v_fecha_paralelo
        ),
        'spread', CASE 
            WHEN v_tc_oficial > 0 THEN 
                ROUND(((v_tc_paralelo - v_tc_oficial) / v_tc_oficial) * 100, 2)
            ELSE NULL
        END,
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION obtener_tc_actuales() IS 
'Retorna tipos de cambio actuales con spread entre oficial y paralelo.';

-- =====================================================================================
-- TRIGGER: Marcar propiedades cuando cambia TC
-- =====================================================================================
DROP TRIGGER IF EXISTS trigger_tc_actualizado ON config_global;
DROP FUNCTION IF EXISTS fn_trigger_tc_actualizado();

CREATE OR REPLACE FUNCTION fn_trigger_tc_actualizado()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_tipo VARCHAR;
    v_propiedades_marcadas INTEGER;
    v_diferencia_pct NUMERIC(8,4);
BEGIN
    IF NEW.clave NOT IN ('tipo_cambio_oficial', 'tipo_cambio_paralelo') THEN
        RETURN NEW;
    END IF;

    IF OLD.valor IS NOT DISTINCT FROM NEW.valor THEN
        RETURN NEW;
    END IF;

    v_tipo := CASE 
        WHEN NEW.clave = 'tipo_cambio_oficial' THEN 'oficial'
        ELSE 'paralelo'
    END;

    IF OLD.valor IS NOT NULL AND OLD.valor > 0 THEN
        v_diferencia_pct := ROUND(((NEW.valor - OLD.valor) / OLD.valor) * 100, 4);
    ELSE
        v_diferencia_pct := 0;
    END IF;

    UPDATE propiedades_v2
    SET requiere_actualizacion_precio = TRUE,
        fecha_actualizacion = NOW()
    WHERE tipo_cambio_detectado = v_tipo
      AND depende_de_tc = TRUE
      AND es_activa = TRUE
      AND COALESCE((campos_bloqueados->>'precio_usd_actualizado')::boolean, false) = FALSE;

    GET DIAGNOSTICS v_propiedades_marcadas = ROW_COUNT;

    INSERT INTO auditoria_tipo_cambio (
        tipo_cambio, valor_anterior, valor_nuevo,
        diferencia_porcentual, propiedades_afectadas,
        ejecutado_por, metodo, notas
    ) VALUES (
        v_tipo,
        OLD.valor,
        NEW.valor,
        v_diferencia_pct,
        v_propiedades_marcadas,
        COALESCE(NEW.actualizado_por, 'trigger'),
        'trigger',
        'Auto: ' || v_propiedades_marcadas || ' propiedades marcadas'
    );

    RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_tc_actualizado
    AFTER UPDATE ON config_global
    FOR EACH ROW
    EXECUTE FUNCTION fn_trigger_tc_actualizado();

COMMENT ON FUNCTION fn_trigger_tc_actualizado() IS 
'Trigger automático cuando cambia TC. Marca propiedades y registra auditoría.';

-- =====================================================================================
-- GRANTS
-- =====================================================================================
GRANT SELECT, INSERT ON auditoria_tipo_cambio TO authenticated;
GRANT SELECT, INSERT ON auditoria_tipo_cambio TO service_role;
GRANT USAGE, SELECT ON SEQUENCE auditoria_tipo_cambio_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE auditoria_tipo_cambio_id_seq TO service_role;

GRANT EXECUTE ON FUNCTION actualizar_tipo_cambio(VARCHAR, NUMERIC, VARCHAR, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION actualizar_tipo_cambio(VARCHAR, NUMERIC, VARCHAR, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION recalcular_precio_propiedad(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION recalcular_precio_propiedad(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION recalcular_precios_batch_nocturno(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION recalcular_precios_batch_nocturno(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION ver_historial_tc(INTEGER, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION ver_historial_tc(INTEGER, VARCHAR) TO service_role;
GRANT EXECUTE ON FUNCTION obtener_propiedades_tc_pendiente(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_propiedades_tc_pendiente(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION obtener_tc_actuales() TO authenticated;
GRANT EXECUTE ON FUNCTION obtener_tc_actuales() TO service_role;

-- =====================================================================================
-- VERIFICACIÓN FINAL
-- =====================================================================================
DO $$
DECLARE
    v_funciones INTEGER;
    v_triggers INTEGER;
    v_tabla_auditoria BOOLEAN;
BEGIN
    SELECT COUNT(*) INTO v_funciones
    FROM pg_proc 
    WHERE proname IN (
        'actualizar_tipo_cambio',
        'recalcular_precio_propiedad',
        'recalcular_precios_batch_nocturno',
        'ver_historial_tc',
        'obtener_propiedades_tc_pendiente',
        'obtener_tc_actuales'
    );
    
    SELECT COUNT(*) INTO v_triggers
    FROM pg_trigger WHERE tgname = 'trigger_tc_actualizado';
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'auditoria_tipo_cambio'
    ) INTO v_tabla_auditoria;

    IF v_funciones = 6 AND v_triggers = 1 AND v_tabla_auditoria THEN
        RAISE NOTICE '═══════════════════════════════════════════════════════════';
        RAISE NOTICE '✅ Módulo TC Dinámico v1.1.1 instalado correctamente';
        RAISE NOTICE '═══════════════════════════════════════════════════════════';
        RAISE NOTICE '📋 Tabla: auditoria_tipo_cambio';
        RAISE NOTICE '⚙️  6 Funciones:';
        RAISE NOTICE '   • actualizar_tipo_cambio(VARCHAR, NUMERIC, VARCHAR, TEXT)';
        RAISE NOTICE '   • recalcular_precio_propiedad(INTEGER) ← v1.1.1 CORREGIDA';
        RAISE NOTICE '   • recalcular_precios_batch_nocturno(INTEGER)';
        RAISE NOTICE '   • ver_historial_tc(INTEGER, VARCHAR)';
        RAISE NOTICE '   • obtener_propiedades_tc_pendiente(INTEGER)';
        RAISE NOTICE '   • obtener_tc_actuales()';
        RAISE NOTICE '🔔 Trigger: trigger_tc_actualizado';
        RAISE NOTICE '═══════════════════════════════════════════════════════════';
        RAISE NOTICE '📌 Compatible con config_global.valor NUMERIC';
        RAISE NOTICE '📌 Corregido: Prioriza tipo_cambio_paralelo_usado';
        RAISE NOTICE '═══════════════════════════════════════════════════════════';
    ELSE
        RAISE EXCEPTION '❌ Error: % funciones, % triggers, tabla_auditoria=%', 
            v_funciones, v_triggers, v_tabla_auditoria;
    END IF;
END $$;