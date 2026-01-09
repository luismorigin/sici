-- =====================================================
-- MIGRACIÓN 028: calcular_posicion_mercado()
-- Fecha: 9 Enero 2026
-- Propósito: Comparar precio vs mercado de zona
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- INPUT: precio_usd, zona, dormitorios
-- OUTPUT: { diferencia_pct, posicion_texto, contexto }
--
-- EJEMPLOS:
-- -15 → "15% bajo promedio"
-- +10 → "10% sobre promedio (premium)"
-- =====================================================

CREATE OR REPLACE FUNCTION calcular_posicion_mercado(
  p_precio_usd NUMERIC,
  p_zona TEXT,
  p_dormitorios INTEGER
)
RETURNS JSONB AS $func$
DECLARE
  v_metricas RECORD;
  v_diff_pct NUMERIC;
  v_posicion_texto TEXT;
  v_categoria TEXT;
BEGIN
  -- Obtener métricas de la zona
  SELECT
    stock,
    precio_promedio,
    precio_mediana,
    precio_min,
    precio_max,
    precio_m2
  INTO v_metricas
  FROM v_metricas_mercado
  WHERE zona = p_zona
    AND dormitorios = p_dormitorios;

  -- Si no hay datos de la zona, intentar sin filtro de dormitorios
  IF v_metricas.precio_promedio IS NULL THEN
    SELECT
      stock,
      precio_promedio,
      precio_mediana,
      precio_min,
      precio_max,
      precio_m2
    INTO v_metricas
    FROM v_metricas_mercado
    WHERE zona = p_zona
      AND dormitorios IS NULL;
  END IF;

  -- Si aún no hay datos, retornar sin comparación
  IF v_metricas.precio_promedio IS NULL OR v_metricas.precio_promedio = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sin datos de mercado para esta zona/tipología',
      'zona', p_zona,
      'dormitorios', p_dormitorios
    );
  END IF;

  -- Calcular diferencia porcentual vs promedio
  v_diff_pct := ROUND(
    ((p_precio_usd - v_metricas.precio_promedio) / v_metricas.precio_promedio * 100)::numeric,
    1
  );

  -- Generar texto de posición
  IF v_diff_pct <= -20 THEN
    v_posicion_texto := format('%s%% bajo promedio (oportunidad)', ABS(v_diff_pct));
    v_categoria := 'oportunidad';
  ELSIF v_diff_pct <= -10 THEN
    v_posicion_texto := format('%s%% bajo promedio', ABS(v_diff_pct));
    v_categoria := 'bajo_promedio';
  ELSIF v_diff_pct <= 10 THEN
    v_posicion_texto := 'En rango de mercado';
    v_categoria := 'promedio';
  ELSIF v_diff_pct <= 20 THEN
    v_posicion_texto := format('%s%% sobre promedio', v_diff_pct);
    v_categoria := 'sobre_promedio';
  ELSE
    v_posicion_texto := format('%s%% sobre promedio (premium)', v_diff_pct);
    v_categoria := 'premium';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'diferencia_pct', v_diff_pct,
    'posicion_texto', v_posicion_texto,
    'categoria', v_categoria,
    'contexto', jsonb_build_object(
      'precio_consultado', p_precio_usd,
      'zona', p_zona,
      'dormitorios', p_dormitorios,
      'promedio_zona', v_metricas.precio_promedio,
      'mediana_zona', v_metricas.precio_mediana,
      'rango', jsonb_build_object(
        'min', v_metricas.precio_min,
        'max', v_metricas.precio_max
      ),
      'stock_disponible', v_metricas.stock
    )
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calcular_posicion_mercado IS
'Calcula posición de un precio vs mercado de zona.
Categorías: oportunidad (<-20%), bajo_promedio (-20% a -10%),
promedio (-10% a +10%), sobre_promedio (+10% a +20%), premium (>+20%)';

-- =====================================================
-- FUNCIÓN HELPER: posicion_mercado_texto()
-- Retorna solo el texto para uso simple
-- =====================================================

CREATE OR REPLACE FUNCTION posicion_mercado_texto(
  p_precio_usd NUMERIC,
  p_zona TEXT,
  p_dormitorios INTEGER
)
RETURNS TEXT AS $func$
DECLARE
  v_result JSONB;
BEGIN
  v_result := calcular_posicion_mercado(p_precio_usd, p_zona, p_dormitorios);

  IF (v_result->>'success')::boolean THEN
    RETURN v_result->>'posicion_texto';
  ELSE
    RETURN NULL;
  END IF;
END;
$func$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Precio bajo promedio
SELECT 'Test 1: Precio $80,000 en Equipetrol 2D' as test;
SELECT calcular_posicion_mercado(80000, 'Equipetrol', 2);

-- Test 2: Precio alto
SELECT 'Test 2: Precio $200,000 en Equipetrol 2D' as test;
SELECT calcular_posicion_mercado(200000, 'Equipetrol', 2);

-- Test 3: Helper de texto
SELECT 'Test 3: Solo texto' as test;
SELECT posicion_mercado_texto(100000, 'Equipetrol', 2);

-- Test 4: Zona sin datos
SELECT 'Test 4: Zona inexistente' as test;
SELECT calcular_posicion_mercado(100000, 'ZonaFalsa', 2);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 028 - Componentes' as status;

SELECT 'calcular_posicion_mercado()' as componente,
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'calcular_posicion_mercado')
       THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'posicion_mercado_texto()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'posicion_mercado_texto')
       THEN 'OK' ELSE 'FALTA' END;
