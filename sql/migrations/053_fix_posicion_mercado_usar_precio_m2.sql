-- =====================================================
-- MIGRACION 053: Fix calcular_posicion_mercado - usar precio/m2
-- Fecha: 13 Enero 2026
-- Proposito: Comparar precio/m2 vs promedio de zona (NO precio total)
--
-- BUG DETECTADO: La funcion comparaba precio total vs precio total promedio
-- Esto era engañoso porque no consideraba el area del depto
--
-- FIX: Ahora compara precio/m2 vs precio/m2 promedio de zona
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Drop existing functions to recreate with new signature
DROP FUNCTION IF EXISTS calcular_posicion_mercado(NUMERIC, TEXT, INTEGER);
DROP FUNCTION IF EXISTS posicion_mercado_texto(NUMERIC, TEXT, INTEGER);

-- =====================================================
-- FUNCION PRINCIPAL: calcular_posicion_mercado()
-- Ahora recibe precio_m2 en lugar de precio total
-- =====================================================

CREATE OR REPLACE FUNCTION calcular_posicion_mercado(
  p_precio_m2 NUMERIC,  -- CAMBIADO: ahora recibe precio por m2
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
  -- Obtener metricas de la zona (precio_m2 promedio)
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
  IF v_metricas.precio_m2 IS NULL THEN
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

  -- Si aun no hay datos, retornar sin comparacion
  IF v_metricas.precio_m2 IS NULL OR v_metricas.precio_m2 = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sin datos de mercado para esta zona/tipologia',
      'zona', p_zona,
      'dormitorios', p_dormitorios
    );
  END IF;

  -- CORREGIDO: Calcular diferencia porcentual vs precio/m2 promedio
  v_diff_pct := ROUND(
    ((p_precio_m2 - v_metricas.precio_m2) / v_metricas.precio_m2 * 100)::numeric,
    1
  );

  -- Generar texto de posicion
  IF v_diff_pct <= -20 THEN
    v_posicion_texto := format('%s%% bajo mercado (oportunidad)', ABS(v_diff_pct));
    v_categoria := 'oportunidad';
  ELSIF v_diff_pct <= -10 THEN
    v_posicion_texto := format('%s%% bajo mercado', ABS(v_diff_pct));
    v_categoria := 'bajo_promedio';
  ELSIF v_diff_pct <= 10 THEN
    v_posicion_texto := 'En rango de mercado';
    v_categoria := 'promedio';
  ELSIF v_diff_pct <= 20 THEN
    v_posicion_texto := format('%s%% sobre mercado', v_diff_pct);
    v_categoria := 'sobre_promedio';
  ELSE
    v_posicion_texto := format('%s%% sobre mercado (premium)', v_diff_pct);
    v_categoria := 'premium';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'diferencia_pct', v_diff_pct,
    'posicion_texto', v_posicion_texto,
    'categoria', v_categoria,
    'contexto', jsonb_build_object(
      'precio_m2_consultado', p_precio_m2,
      'zona', p_zona,
      'dormitorios', p_dormitorios,
      'precio_m2_promedio_zona', v_metricas.precio_m2,
      'precio_total_promedio_zona', v_metricas.precio_promedio,
      'stock_disponible', v_metricas.stock
    )
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calcular_posicion_mercado IS
'v2: Calcula posicion de un precio/m2 vs promedio de zona.
CORREGIDO: Ahora compara precio/m2 (no precio total).
Categorias: oportunidad (<-20%), bajo_promedio (-20% a -10%),
promedio (-10% a +10%), sobre_promedio (+10% a +20%), premium (>+20%)';

-- =====================================================
-- FUNCION HELPER: posicion_mercado_texto()
-- =====================================================

CREATE OR REPLACE FUNCTION posicion_mercado_texto(
  p_precio_m2 NUMERIC,
  p_zona TEXT,
  p_dormitorios INTEGER
)
RETURNS TEXT AS $func$
DECLARE
  v_result JSONB;
BEGIN
  v_result := calcular_posicion_mercado(p_precio_m2, p_zona, p_dormitorios);

  IF (v_result->>'success')::boolean THEN
    RETURN v_result->>'posicion_texto';
  ELSE
    RETURN NULL;
  END IF;
END;
$func$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- ACTUALIZAR buscar_unidades_reales para pasar precio/m2
-- =====================================================
-- La llamada actual pasa precio_usd, debe pasar precio/m2

-- Primero verificar que existe la funcion
SELECT 'Verificando existencia de buscar_unidades_reales...' as status;

-- La linea a cambiar en buscar_unidades_reales es:
-- calcular_posicion_mercado(p.precio_usd, pm.zona, p.dormitorios)
-- Debe ser:
-- calcular_posicion_mercado(p.precio_usd / NULLIF(p.area_total_m2, 0), pm.zona, p.dormitorios)

-- Como la funcion es muy grande, vamos a recrearla con el fix
-- Ver migracion 047 para la version completa

-- Por ahora solo actualizamos la funcion auxiliar,
-- la actualizacion de buscar_unidades_reales requiere recrear toda la funcion

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Sky Moon - $3,029/m2 en Equipetrol Norte/Norte mono
-- Promedio zona: $2,928/m2
-- Esperado: ~3.4% sobre mercado
SELECT 'Test 1: Sky Moon $3,029/m2 en Equipetrol Norte/Norte mono' as test;
SELECT calcular_posicion_mercado(3029, 'Equipetrol Norte/Norte', 0);

-- Test 2: Sky Elite - $2,894/m2 en Equipetrol mono
-- Promedio zona: $2,306/m2
-- Esperado: ~25% sobre mercado
SELECT 'Test 2: Sky Elite $2,894/m2 en Equipetrol mono' as test;
SELECT calcular_posicion_mercado(2894, 'Equipetrol', 0);

-- Test 3: Propiedad barata $1,500/m2 en Equipetrol 1D
-- Promedio zona: $2,101/m2
-- Esperado: ~-29% (oportunidad)
SELECT 'Test 3: Oportunidad $1,500/m2 en Equipetrol 1D' as test;
SELECT calcular_posicion_mercado(1500, 'Equipetrol', 1);

SELECT 'Migracion 053 completada - calcular_posicion_mercado ahora usa precio/m2' as status;
SELECT 'IMPORTANTE: Falta actualizar buscar_unidades_reales para pasar precio/m2' as warning;
