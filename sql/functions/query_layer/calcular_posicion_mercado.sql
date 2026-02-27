-- ============================================================================
-- calcular_posicion_mercado(p_precio_m2, p_zona, p_dormitorios)
-- Canonical export from production — 27 Feb 2026
-- ============================================================================
-- Compara precio/m² vs promedio de zona+tipología usando v_metricas_mercado.
-- Categorías: oportunidad (<-20%), bajo_promedio (-20 a -10%), promedio (+-10%),
--             sobre_promedio (+10 a +20%), premium (>+20%).
-- Última migración: 168 (normalizar_precios_tc_paralelo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.calcular_posicion_mercado(p_precio_m2 numeric, p_zona text, p_dormitorios integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
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

  -- Calcular diferencia porcentual vs precio/m2 promedio
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
$function$;
