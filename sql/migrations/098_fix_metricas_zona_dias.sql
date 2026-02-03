-- =====================================================
-- MIGRACIÓN 039: Fix metricas_zona para incluir días
-- Fecha: 12 Enero 2026
-- Propósito: Agregar dias_promedio/mediana a metricas_zona
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- Actualizar la función analisis_mercado_fiduciario para incluir
-- dias_promedio y dias_mediana en metricas_zona

CREATE OR REPLACE FUNCTION analisis_mercado_fiduciario(p_filtros JSONB)
RETURNS JSONB AS $func$
DECLARE
  v_resultado JSONB;
  v_opciones_validas JSONB := '[]'::jsonb;
  v_opciones_excluidas JSONB := '[]'::jsonb;
  v_alertas JSONB := '[]'::jsonb;
  v_contexto JSONB;
  v_metricas RECORD;
  v_prop RECORD;
  v_ranking INTEGER := 0;
  v_total_validas INTEGER := 0;
  v_total_excluidas INTEGER := 0;
  v_stock_total INTEGER;
  v_precio_max NUMERIC;
  v_dormitorios INTEGER;
  v_zona TEXT;
BEGIN
  -- Extraer filtros
  v_precio_max := (p_filtros->>'precio_max')::numeric;
  v_dormitorios := (p_filtros->>'dormitorios')::int;
  v_zona := p_filtros->>'zona';

  -- ==========================================
  -- BLOQUE 1: OPCIONES VÁLIDAS CON RANKING
  -- ==========================================

  FOR v_prop IN
    SELECT
      r.*,
      ROW_NUMBER() OVER (ORDER BY r.precio_usd ASC) as ranking,
      COUNT(*) OVER () as total
    FROM buscar_unidades_reales(p_filtros) r
    ORDER BY r.precio_usd ASC
  LOOP
    v_ranking := v_prop.ranking;
    v_total_validas := v_prop.total;

    v_opciones_validas := v_opciones_validas || jsonb_build_object(
      'id', v_prop.id,
      'proyecto', v_prop.proyecto,
      'desarrollador', v_prop.desarrollador,
      'zona', v_prop.zona,
      'dormitorios', v_prop.dormitorios,
      'precio_usd', v_prop.precio_usd,
      'precio_m2', v_prop.precio_m2,
      'area_m2', v_prop.area_m2,
      'ranking', v_prop.ranking,
      'total_opciones', v_prop.total,
      'posicion_mercado', calcular_posicion_mercado(v_prop.precio_usd, v_prop.zona, v_prop.dormitorios),
      'explicacion_precio', explicar_precio(v_prop.id),
      'razon_fiduciaria', v_prop.razon_fiduciaria,
      'fotos', v_prop.cantidad_fotos,
      'asesor_wsp', v_prop.asesor_wsp
    );
  END LOOP;

  -- ==========================================
  -- BLOQUE 2: OPCIONES EXCLUIDAS (más baratas)
  -- ==========================================

  FOR v_prop IN
    SELECT
      p.id,
      p.precio_usd,
      p.dormitorios,
      p.area_total_m2,
      COALESCE(pm.nombre_oficial, 'Sin proyecto') as proyecto,
      COALESCE(p.microzona, p.zona, 'Sin zona') as zona
    FROM propiedades_v2 p
    LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
    WHERE p.es_activa = true
      AND p.precio_usd < COALESCE(v_precio_max, 999999999)
      AND p.precio_usd >= 30000
      -- Que NO aparezca en búsqueda normal
      AND p.id NOT IN (SELECT id FROM buscar_unidades_reales(p_filtros))
    ORDER BY p.precio_usd ASC
    LIMIT 10
  LOOP
    v_total_excluidas := v_total_excluidas + 1;

    v_opciones_excluidas := v_opciones_excluidas || jsonb_build_object(
      'id', v_prop.id,
      'proyecto', v_prop.proyecto,
      'zona', v_prop.zona,
      'precio_usd', v_prop.precio_usd,
      'dormitorios', v_prop.dormitorios,
      'area_m2', v_prop.area_total_m2,
      'analisis_exclusion', detectar_razon_exclusion_v2(v_prop.id, p_filtros)
    );
  END LOOP;

  -- ==========================================
  -- BLOQUE 3: CONTEXTO DE MERCADO
  -- ==========================================

  -- Obtener métricas de la zona/tipología (AHORA INCLUYE DÍAS)
  SELECT * INTO v_metricas
  FROM v_metricas_mercado
  WHERE (v_dormitorios IS NULL OR dormitorios = v_dormitorios)
    AND (v_zona IS NULL OR zona ILIKE '%' || v_zona || '%')
  LIMIT 1;

  -- Stock total en la zona
  SELECT COUNT(*) INTO v_stock_total
  FROM propiedades_v2 p
  JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.es_activa = true
    AND p.status = 'completado'
    AND p.tipo_operacion = 'venta'
    AND p.es_multiproyecto = false
    AND (v_dormitorios IS NULL OR p.dormitorios = v_dormitorios)
    AND (v_zona IS NULL OR pm.zona ILIKE '%' || v_zona || '%');

  v_contexto := jsonb_build_object(
    'stock_total', v_stock_total,
    'stock_cumple_filtros', v_total_validas,
    'stock_excluido_mas_barato', v_total_excluidas,
    'porcentaje_mercado', CASE
      WHEN v_stock_total > 0
      THEN ROUND(100.0 * v_total_validas / v_stock_total, 1)
      ELSE 0
    END,
    'metricas_zona', CASE WHEN v_metricas.stock IS NOT NULL THEN
      jsonb_build_object(
        'precio_promedio', v_metricas.precio_promedio,
        'precio_mediana', v_metricas.precio_mediana,
        'precio_min', v_metricas.precio_min,
        'precio_max', v_metricas.precio_max,
        'precio_m2_promedio', v_metricas.precio_m2,
        'area_promedio', v_metricas.area_promedio,
        -- FIX: Agregar días para umbrales dinámicos
        'dias_promedio', v_metricas.dias_promedio,
        'dias_mediana', v_metricas.dias_mediana
      )
    ELSE NULL END,
    'diagnostico', CASE
      WHEN v_total_validas = 0 THEN
        'Sin opciones que cumplan todos tus filtros. Considerá flexibilizar.'
      WHEN v_total_validas <= 3 THEN
        format('Stock LIMITADO: solo %s opciones. Son el 100%% de lo disponible.', v_total_validas)
      WHEN v_total_validas <= 10 THEN
        format('Stock MODERADO: %s opciones disponibles.', v_total_validas)
      ELSE
        format('Stock AMPLIO: %s opciones. Podés ser selectivo.', v_total_validas)
    END
  );

  -- ==========================================
  -- BLOQUE 4: ALERTAS FIDUCIARIAS
  -- ==========================================

  -- Alertas de precios sospechosos
  FOR v_prop IN
    SELECT id, precio_usd, area_total_m2,
           ROUND(precio_usd / NULLIF(area_total_m2, 0)) as precio_m2
    FROM propiedades_v2
    WHERE es_activa = true
      AND precio_usd BETWEEN 30000 AND COALESCE(v_precio_max, 999999999)
      AND area_total_m2 > 20
      AND (precio_usd / NULLIF(area_total_m2, 0)) < 800
    LIMIT 5
  LOOP
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'precio_sospechoso',
      'propiedad_id', v_prop.id,
      'precio_usd', v_prop.precio_usd,
      'precio_m2', v_prop.precio_m2,
      'mensaje', format('Precio/m² muy bajo ($%s). Verificar antes de visitar.', v_prop.precio_m2),
      'severidad', 'warning'
    );
  END LOOP;

  -- Alerta si hay mucha escasez
  IF v_total_validas <= 2 AND v_stock_total >= 10 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'escasez_relativa',
      'mensaje', format('Solo %s de %s propiedades cumplen tus filtros (%s%%). Considerá flexibilizar.',
        v_total_validas, v_stock_total,
        ROUND(100.0 * v_total_validas / v_stock_total, 0)),
      'severidad', 'info'
    );
  END IF;

  -- ==========================================
  -- RESULTADO FINAL
  -- ==========================================

  RETURN jsonb_build_object(
    'filtros_aplicados', p_filtros,
    'timestamp', NOW(),
    'bloque_1_opciones_validas', jsonb_build_object(
      'total', v_total_validas,
      'opciones', v_opciones_validas
    ),
    'bloque_2_opciones_excluidas', jsonb_build_object(
      'total', v_total_excluidas,
      'nota', 'Propiedades más baratas que no cumplen algún filtro',
      'opciones', v_opciones_excluidas
    ),
    'bloque_3_contexto_mercado', v_contexto,
    'bloque_4_alertas', jsonb_build_object(
      'total', jsonb_array_length(v_alertas),
      'alertas', v_alertas
    )
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION analisis_mercado_fiduciario IS
'v1.1: EL MOAT DE SIMÓN - Análisis de mercado fiduciario completo.
FIX: Ahora incluye dias_promedio y dias_mediana en metricas_zona.
Bloque 1: Opciones válidas con ranking, posición mercado, explicación precio
Bloque 2: Opciones excluidas con razón específica de cada filtro
Bloque 3: Contexto de mercado (stock, escasez, métricas zona + DÍAS)
Bloque 4: Alertas fiduciarias (precios sospechosos, escasez)';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 039 - Verificación días en metricas_zona' as status;

-- Test: Verificar que dias viene en la respuesta
SELECT
  (analisis_mercado_fiduciario('{"dormitorios": 2, "precio_max": 150000, "solo_con_fotos": true}'::jsonb)
   ->'bloque_3_contexto_mercado'->'metricas_zona'->>'dias_promedio') as dias_promedio,
  (analisis_mercado_fiduciario('{"dormitorios": 2, "precio_max": 150000, "solo_con_fotos": true}'::jsonb)
   ->'bloque_3_contexto_mercado'->'metricas_zona'->>'dias_mediana') as dias_mediana;
