-- =====================================================
-- MIGRACION 014: TC Binance Historial + Precios Historial
-- Fecha: 3 Enero 2026
-- Proposito:
--   1. Registrar consultas a Binance P2P para tipo de cambio
--   2. Preservar historial de precios para analisis de mercado
--
-- NOTA: config_global usa estructura key-value (clave, valor)
-- =====================================================

-- =====================================================
-- TABLA 1: tc_binance_historial
-- Registra cada consulta a Binance P2P
-- =====================================================
CREATE TABLE IF NOT EXISTS tc_binance_historial (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),

    -- Datos de precios
    tc_sell NUMERIC(10,4),              -- Precio SELL (venden USDT)
    tc_buy NUMERIC(10,4),               -- Precio BUY (compran USDT)
    spread_pct NUMERIC(5,2),            -- Diferencia porcentual

    -- Estadisticas de anuncios
    num_anuncios_sell INTEGER,
    num_anuncios_buy INTEGER,
    promedio_volumen NUMERIC(12,2),

    -- Datos crudos para debugging
    raw_response JSONB,

    -- Estado
    aplicado_a_config BOOLEAN DEFAULT FALSE,
    razon_no_aplicado TEXT
);

CREATE INDEX IF NOT EXISTS idx_tc_binance_timestamp
    ON tc_binance_historial(timestamp DESC);

COMMENT ON TABLE tc_binance_historial IS
    'Historial de consultas a Binance P2P para tipo de cambio USDT/BOB';

-- =====================================================
-- TABLA 2: precios_historial
-- Snapshots diarios de precios para analisis de mercado
-- =====================================================
CREATE TABLE IF NOT EXISTS precios_historial (
    id SERIAL,
    propiedad_id INTEGER NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,

    -- Precios
    precio_usd NUMERIC(12,2),              -- Precio USD original (inmutable)
    precio_usd_actualizado NUMERIC(12,2),  -- Precio con TC del dia

    -- TC usado
    tc_paralelo_usado NUMERIC(10,4),
    tc_oficial_usado NUMERIC(10,4),

    -- Contexto original
    moneda_original VARCHAR(10),
    precio_original NUMERIC(12,2),

    -- PK compuesta para evitar duplicados por dia
    PRIMARY KEY (propiedad_id, fecha),

    -- FK a propiedades_v2
    CONSTRAINT fk_precios_historial_propiedad
        FOREIGN KEY (propiedad_id)
        REFERENCES propiedades_v2(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_precios_historial_fecha
    ON precios_historial(fecha);
CREATE INDEX IF NOT EXISTS idx_precios_historial_propiedad
    ON precios_historial(propiedad_id);

COMMENT ON TABLE precios_historial IS
    'Snapshots diarios de precios para analisis de mercado.
     Preserva precio_usd_actualizado antes de recalculo por TC.';

-- =====================================================
-- FUNCION: validar_tc_binance
-- Valida si un TC nuevo es razonable antes de aplicar
-- NOTA: Usa estructura key-value de config_global
-- =====================================================
CREATE OR REPLACE FUNCTION validar_tc_binance(
    p_tc_nuevo NUMERIC,
    p_tipo VARCHAR DEFAULT 'paralelo'
)
RETURNS TABLE(
    es_valido BOOLEAN,
    razon TEXT,
    tc_actual NUMERIC,
    diferencia_pct NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_tc_actual NUMERIC;
    v_diferencia NUMERIC;
    v_min_tc NUMERIC := 8.0;
    v_max_tc NUMERIC := 15.0;
    v_max_cambio_pct NUMERIC := 10.0;
    v_min_cambio_pct NUMERIC := 0.5;
    v_clave VARCHAR;
BEGIN
    -- Determinar clave segun tipo (estructura key-value)
    IF p_tipo = 'oficial' THEN
        v_clave := 'tipo_cambio_oficial';
    ELSE
        v_clave := 'tipo_cambio_paralelo';
    END IF;

    -- Obtener TC actual desde config_global (key-value)
    SELECT valor INTO v_tc_actual
    FROM config_global
    WHERE clave = v_clave;

    -- Calcular diferencia porcentual
    v_diferencia := ROUND(ABS(100.0 * (p_tc_nuevo - v_tc_actual) / v_tc_actual), 2);

    -- Validar rango
    IF p_tc_nuevo < v_min_tc OR p_tc_nuevo > v_max_tc THEN
        RETURN QUERY SELECT
            FALSE,
            'TC fuera de rango valido (' || v_min_tc || ' - ' || v_max_tc || ')',
            v_tc_actual,
            v_diferencia;
        RETURN;
    END IF;

    -- Validar cambio no muy grande
    IF v_diferencia > v_max_cambio_pct THEN
        RETURN QUERY SELECT
            FALSE,
            'Cambio muy grande (' || v_diferencia || '% > ' || v_max_cambio_pct || '%)',
            v_tc_actual,
            v_diferencia;
        RETURN;
    END IF;

    -- Validar cambio significativo
    IF v_diferencia < v_min_cambio_pct THEN
        RETURN QUERY SELECT
            FALSE,
            'Cambio insignificante (' || v_diferencia || '% < ' || v_min_cambio_pct || '%)',
            v_tc_actual,
            v_diferencia;
        RETURN;
    END IF;

    -- TC valido
    RETURN QUERY SELECT
        TRUE,
        'TC valido para actualizacion'::TEXT,
        v_tc_actual,
        v_diferencia;
END;
$$;

COMMENT ON FUNCTION validar_tc_binance IS
    'Valida si un TC de Binance es razonable antes de aplicar.
     Rango: 8.0-15.0 | Max cambio: 10% | Min cambio: 0.5%';

-- =====================================================
-- FUNCION: guardar_snapshot_precios
-- Guarda snapshot de precios actuales (ejecutar ANTES de recalcular)
-- NOTA: Usa estructura key-value de config_global
-- =====================================================
CREATE OR REPLACE FUNCTION guardar_snapshot_precios()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
    v_tc_paralelo NUMERIC;
    v_tc_oficial NUMERIC;
BEGIN
    -- Obtener TC actual (estructura key-value)
    SELECT valor INTO v_tc_paralelo
    FROM config_global
    WHERE clave = 'tipo_cambio_paralelo';

    SELECT valor INTO v_tc_oficial
    FROM config_global
    WHERE clave = 'tipo_cambio_oficial';

    -- Insertar snapshot del dia (ON CONFLICT para idempotencia)
    INSERT INTO precios_historial (
        propiedad_id,
        fecha,
        precio_usd,
        precio_usd_actualizado,
        tc_paralelo_usado,
        tc_oficial_usado,
        moneda_original,
        precio_original
    )
    SELECT
        id,
        CURRENT_DATE,
        precio_usd,
        precio_usd_actualizado,
        v_tc_paralelo,
        v_tc_oficial,
        moneda_original,
        precio_usd_original  -- columna correcta en propiedades_v2
    FROM propiedades_v2
    WHERE status IN ('completado', 'nueva')
      AND precio_usd IS NOT NULL
    ON CONFLICT (propiedad_id, fecha) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RAISE NOTICE 'Snapshot de precios guardado: % propiedades, TC paralelo: %, TC oficial: %',
        v_count, v_tc_paralelo, v_tc_oficial;

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION guardar_snapshot_precios IS
    'Guarda snapshot diario de precios. Ejecutar ANTES de actualizar TC.
     Retorna cantidad de propiedades guardadas.';

-- =====================================================
-- FUNCION: registrar_consulta_binance
-- Registra resultado de consulta a Binance P2P
-- =====================================================
CREATE OR REPLACE FUNCTION registrar_consulta_binance(
    p_tc_sell NUMERIC,
    p_tc_buy NUMERIC,
    p_num_anuncios_sell INTEGER DEFAULT NULL,
    p_num_anuncios_buy INTEGER DEFAULT NULL,
    p_raw_response JSONB DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_id INTEGER;
    v_spread NUMERIC;
BEGIN
    -- Calcular spread
    IF p_tc_sell > 0 AND p_tc_buy > 0 THEN
        v_spread := 100.0 * (p_tc_sell - p_tc_buy) / p_tc_buy;
    END IF;

    INSERT INTO tc_binance_historial (
        tc_sell,
        tc_buy,
        spread_pct,
        num_anuncios_sell,
        num_anuncios_buy,
        raw_response
    ) VALUES (
        p_tc_sell,
        p_tc_buy,
        v_spread,
        p_num_anuncios_sell,
        p_num_anuncios_buy,
        p_raw_response
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION registrar_consulta_binance IS
    'Registra una consulta a Binance P2P. Retorna ID del registro.';

-- =====================================================
-- VERIFICACION
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '=== Migracion 014 completada ===';
    RAISE NOTICE 'Tablas creadas:';
    RAISE NOTICE '  - tc_binance_historial';
    RAISE NOTICE '  - precios_historial';
    RAISE NOTICE 'Funciones creadas:';
    RAISE NOTICE '  - validar_tc_binance()';
    RAISE NOTICE '  - guardar_snapshot_precios()';
    RAISE NOTICE '  - registrar_consulta_binance()';
    RAISE NOTICE 'NOTA: Usa estructura key-value de config_global';
END $$;
