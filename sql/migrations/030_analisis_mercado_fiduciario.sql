-- =====================================================
-- MIGRACIÓN 030: analisis_mercado_fiduciario()
-- Fecha: 9 Enero 2026
-- Propósito: EL MOAT - Análisis de mercado completo
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- Esta función implementa el análisis fiduciario completo:
-- - Bloque 1: Opciones válidas con ranking y explicación
-- - Bloque 2: Opciones excluidas con razón específica
-- - Bloque 3: Contexto de mercado y diagnóstico
-- - Bloque 4: Alertas fiduciarias
--
-- Alineado con: METODOLOGIA_FIDUCIARIA_PARTE_1.md
--               METODOLOGIA_FIDUCIARIA_PARTE_2.md
--               SICI_MVP_SPEC.md
-- =====================================================

-- =====================================================
-- PASO 1: Mejorar detectar_razon_exclusion()
-- =====================================================

DROP FUNCTION IF EXISTS detectar_razon_exclusion_v2(INTEGER, JSONB);

CREATE OR REPLACE FUNCTION detectar_razon_exclusion_v2(
  p_id INTEGER,
  p_filtros JSONB DEFAULT '{}'
)
RETURNS JSONB AS $func$
DECLARE
  v_prop RECORD;
  v_proyecto RECORD;
  v_razones JSONB := '[]'::jsonb;
  v_tiene_fotos BOOLEAN;
  v_precio_m2 NUMERIC;
BEGIN
  -- Obtener datos de la propiedad
  SELECT
    p.id,
    p.precio_usd,
    p.dormitorios,
    p.area_total_m2,
    p.tipo_operacion,
    p.status,
    p.es_activa,
    p.es_multiproyecto,
    p.tipo_propiedad_original,
    p.id_proyecto_master,
    p.score_calidad_dato,
    COALESCE(p.microzona, p.zona, 'Sin zona') as zona,
    CASE
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
      THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
      ELSE false
    END as tiene_fotos
  INTO v_prop
  FROM propiedades_v2 p
  WHERE p.id = p_id;

  IF v_prop.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Propiedad no encontrada');
  END IF;

  -- Obtener proyecto si existe
  IF v_prop.id_proyecto_master IS NOT NULL THEN
    SELECT activo INTO v_proyecto
    FROM proyectos_master
    WHERE id_proyecto_master = v_prop.id_proyecto_master;
  END IF;

  -- Calcular precio/m²
  v_precio_m2 := CASE
    WHEN v_prop.area_total_m2 > 0
    THEN ROUND(v_prop.precio_usd / v_prop.area_total_m2)
    ELSE 0
  END;

  -- ==========================================
  -- DETECTAR TODAS LAS RAZONES DE EXCLUSIÓN
  -- ==========================================

  -- 1. No está activa
  IF NOT v_prop.es_activa THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'es_activa',
      'razon', 'Propiedad inactiva (vendida o retirada)',
      'valor_actual', false,
      'valor_requerido', true,
      'severidad', 'hard'
    );
  END IF;

  -- 2. Status no es completado
  IF v_prop.status != 'completado' THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'status',
      'razon', CASE v_prop.status
        WHEN 'excluido_operacion' THEN 'Excluida: alquiler o anticrético'
        WHEN 'inactivo_pending' THEN 'Pendiente de verificación'
        WHEN 'nueva' THEN 'Recién ingresada, sin procesar'
        ELSE 'Status: ' || v_prop.status
      END,
      'valor_actual', v_prop.status,
      'valor_requerido', 'completado',
      'severidad', 'hard'
    );
  END IF;

  -- 3. Tipo operación no es venta
  IF v_prop.tipo_operacion != 'venta' THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'tipo_operacion',
      'razon', 'No es venta: ' || COALESCE(v_prop.tipo_operacion::TEXT, 'desconocido'),
      'valor_actual', v_prop.tipo_operacion::TEXT,
      'valor_requerido', 'venta',
      'severidad', 'hard'
    );
  END IF;

  -- 4. Es multiproyecto
  IF v_prop.es_multiproyecto = true THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'es_multiproyecto',
      'razon', 'Es listing de proyecto completo, no unidad específica',
      'valor_actual', true,
      'valor_requerido', false,
      'severidad', 'medium',
      'sugerencia', 'Contactar para ver unidades específicas'
    );
  END IF;

  -- 5. Área menor a 20m²
  IF v_prop.area_total_m2 < 20 THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'area_minima',
      'razon', 'Área muy pequeña: ' || v_prop.area_total_m2 || 'm² (probable parqueo/baulera)',
      'valor_actual', v_prop.area_total_m2,
      'valor_requerido', 20,
      'severidad', 'hard'
    );
  END IF;

  -- 6. Tipo propiedad es baulera/parqueo
  IF lower(COALESCE(v_prop.tipo_propiedad_original, '')) IN ('baulera', 'parqueo', 'garaje', 'deposito') THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'tipo_propiedad',
      'razon', 'No es departamento: ' || v_prop.tipo_propiedad_original,
      'valor_actual', v_prop.tipo_propiedad_original,
      'valor_requerido', 'departamento',
      'severidad', 'hard'
    );
  END IF;

  -- 7. Sin proyecto asignado
  IF v_prop.id_proyecto_master IS NULL THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'proyecto_asignado',
      'razon', 'Sin proyecto identificado (datos incompletos)',
      'valor_actual', null,
      'valor_requerido', 'proyecto válido',
      'severidad', 'medium'
    );
  -- 7b. Proyecto inactivo
  ELSIF v_proyecto.activo = false THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'proyecto_activo',
      'razon', 'Proyecto marcado como inactivo',
      'valor_actual', false,
      'valor_requerido', true,
      'severidad', 'hard'
    );
  END IF;

  -- 8. Sin fotos (si filtro activo)
  IF NOT v_prop.tiene_fotos AND (p_filtros->>'solo_con_fotos')::boolean IS TRUE THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'fotos',
      'razon', 'Sin fotos disponibles',
      'valor_actual', 0,
      'valor_requerido', '>0',
      'severidad', 'soft',
      'sugerencia', 'Pedir fotos al asesor'
    );
  END IF;

  -- 9. Dormitorios no coinciden
  IF p_filtros->>'dormitorios' IS NOT NULL THEN
    IF v_prop.dormitorios IS NULL THEN
      v_razones := v_razones || jsonb_build_object(
        'filtro', 'dormitorios',
        'razon', 'Sin datos de dormitorios',
        'valor_actual', null,
        'valor_requerido', (p_filtros->>'dormitorios')::int,
        'severidad', 'soft'
      );
    ELSIF v_prop.dormitorios != (p_filtros->>'dormitorios')::int THEN
      v_razones := v_razones || jsonb_build_object(
        'filtro', 'dormitorios',
        'razon', format('%s dormitorios (buscás %s)', v_prop.dormitorios, p_filtros->>'dormitorios'),
        'valor_actual', v_prop.dormitorios,
        'valor_requerido', (p_filtros->>'dormitorios')::int,
        'severidad', 'soft',
        'sugerencia', CASE
          WHEN v_prop.dormitorios < (p_filtros->>'dormitorios')::int
          THEN '¿Te serviría uno más chico?'
          ELSE '¿Te interesaría uno más grande?'
        END
      );
    END IF;
  END IF;

  -- 10. Precio fuera de rango
  IF p_filtros->>'precio_max' IS NOT NULL AND v_prop.precio_usd > (p_filtros->>'precio_max')::numeric THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'precio_max',
      'razon', format('$%s excede tu presupuesto ($%s)',
        to_char(v_prop.precio_usd, 'FM999,999'),
        to_char((p_filtros->>'precio_max')::numeric, 'FM999,999')),
      'valor_actual', v_prop.precio_usd,
      'valor_requerido', (p_filtros->>'precio_max')::numeric,
      'exceso_pct', ROUND((v_prop.precio_usd - (p_filtros->>'precio_max')::numeric) / (p_filtros->>'precio_max')::numeric * 100, 1),
      'severidad', 'soft',
      'sugerencia', '¿Podrías estirar presupuesto?'
    );
  END IF;

  -- 11. Precio/m² sospechoso
  IF v_precio_m2 > 0 AND v_precio_m2 < 800 THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'precio_m2_sospechoso',
      'razon', format('Precio/m² muy bajo: $%s (normal: $1,200-1,800)', v_precio_m2),
      'valor_actual', v_precio_m2,
      'valor_requerido', '>800',
      'severidad', 'alert',
      'sugerencia', 'Verificar si precio es correcto'
    );
  END IF;

  -- 12. Dormitorios = 0 (probable parqueo mal clasificado)
  IF v_prop.dormitorios = 0 AND v_prop.area_total_m2 < 50 THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'dormitorios_cero',
      'razon', '0 dormitorios + área pequeña (probable parqueo/baulera)',
      'valor_actual', 0,
      'valor_requerido', '>=1',
      'severidad', 'hard'
    );
  END IF;

  -- Resultado
  RETURN jsonb_build_object(
    'propiedad_id', p_id,
    'precio_usd', v_prop.precio_usd,
    'dormitorios', v_prop.dormitorios,
    'zona', v_prop.zona,
    'es_excluida', jsonb_array_length(v_razones) > 0,
    'cantidad_razones', jsonb_array_length(v_razones),
    'razones', v_razones,
    'razon_principal', CASE
      WHEN jsonb_array_length(v_razones) > 0
      THEN v_razones->0->>'razon'
      ELSE null
    END
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION detectar_razon_exclusion_v2 IS
'v2.0: Detecta TODAS las razones por las que una propiedad no aparece en búsqueda.
Categorías de severidad:
- hard: No puede aparecer nunca (status, tipo_operacion, área)
- medium: Limitación estructural (multiproyecto, sin proyecto)
- soft: Filtro del usuario (dorms, precio, fotos)
- alert: Anomalía a investigar (precio/m² bajo)';

-- =====================================================
-- PASO 2: Función explicar_precio()
-- =====================================================

CREATE OR REPLACE FUNCTION explicar_precio(p_id INTEGER)
RETURNS JSONB AS $func$
DECLARE
  v_prop RECORD;
  v_metricas RECORD;
  v_proyecto RECORD;
  v_explicaciones JSONB := '[]'::jsonb;
  v_diff_pct NUMERIC;
  v_posicion_proyecto INTEGER;
  v_total_proyecto INTEGER;
BEGIN
  -- Obtener datos
  SELECT
    p.id,
    p.precio_usd,
    p.dormitorios,
    p.area_total_m2,
    ROUND((p.precio_usd / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
    COALESCE(p.microzona, p.zona, 'Equipetrol') as zona,
    p.id_proyecto_master,
    pm.nombre_oficial as proyecto,
    pm.desarrollador,
    p.datos_json->'proyecto'->>'estado_construccion' as estado_construccion
  INTO v_prop
  FROM propiedades_v2 p
  LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
  WHERE p.id = p_id;

  IF v_prop.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Propiedad no encontrada');
  END IF;

  -- Métricas de zona
  SELECT * INTO v_metricas
  FROM v_metricas_mercado
  WHERE dormitorios = v_prop.dormitorios
    AND zona = v_prop.zona;

  -- Calcular diferencia vs promedio
  IF v_metricas.precio_promedio IS NOT NULL AND v_metricas.precio_promedio > 0 THEN
    v_diff_pct := ROUND(
      ((v_prop.precio_usd - v_metricas.precio_promedio) / v_metricas.precio_promedio * 100)::numeric, 0
    );

    -- Explicación por precio
    IF v_diff_pct <= -20 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'precio_muy_bajo',
        'texto', format('%s%% bajo promedio - investigar por qué', ABS(v_diff_pct)),
        'impacto', 'positivo_con_alerta'
      );
    ELSIF v_diff_pct <= -10 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'precio_bajo',
        'texto', format('%s%% bajo promedio de zona', ABS(v_diff_pct)),
        'impacto', 'positivo'
      );
    ELSIF v_diff_pct >= 15 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'precio_premium',
        'texto', format('%s%% sobre promedio - ubicación/amenities premium', v_diff_pct),
        'impacto', 'neutro'
      );
    END IF;
  END IF;

  -- Posición en proyecto
  IF v_prop.id_proyecto_master IS NOT NULL THEN
    SELECT COUNT(*) INTO v_total_proyecto
    FROM propiedades_v2
    WHERE id_proyecto_master = v_prop.id_proyecto_master
      AND es_activa = true AND es_multiproyecto = false;

    SELECT COUNT(*) + 1 INTO v_posicion_proyecto
    FROM propiedades_v2
    WHERE id_proyecto_master = v_prop.id_proyecto_master
      AND es_activa = true AND es_multiproyecto = false
      AND precio_usd < v_prop.precio_usd;

    IF v_posicion_proyecto = 1 AND v_total_proyecto >= 3 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'mas_barato_proyecto',
        'texto', format('La más económica de %s unidades en %s', v_total_proyecto, v_prop.proyecto),
        'impacto', 'positivo'
      );
    ELSIF v_posicion_proyecto = v_total_proyecto AND v_total_proyecto >= 3 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'mas_caro_proyecto',
        'texto', format('La más cara de %s unidades (mejor ubicación/piso?)', v_total_proyecto),
        'impacto', 'neutro'
      );
    END IF;
  END IF;

  -- Estado construcción
  IF v_prop.estado_construccion = 'preventa' THEN
    v_explicaciones := v_explicaciones || jsonb_build_object(
      'factor', 'preventa',
      'texto', 'Precio de preventa (entrega futura)',
      'impacto', 'neutro_con_nota'
    );
  END IF;

  -- Desarrollador
  IF v_prop.desarrollador IS NULL OR v_prop.desarrollador = '' THEN
    v_explicaciones := v_explicaciones || jsonb_build_object(
      'factor', 'desarrollador_desconocido',
      'texto', 'Desarrollador no identificado',
      'impacto', 'negativo_leve'
    );
  ELSIF v_prop.desarrollador IN ('Sky Properties', 'Port-Delux S.R.L.', 'Smart Studio') THEN
    v_explicaciones := v_explicaciones || jsonb_build_object(
      'factor', 'desarrollador_reconocido',
      'texto', format('Desarrollador reconocido: %s', v_prop.desarrollador),
      'impacto', 'positivo'
    );
  END IF;

  -- Área vs promedio
  IF v_metricas.area_promedio IS NOT NULL THEN
    IF v_prop.area_total_m2 < v_metricas.area_promedio * 0.8 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'area_menor',
        'texto', format('Área %s%% menor al promedio (%sm² vs %sm²)',
          ROUND((1 - v_prop.area_total_m2/v_metricas.area_promedio) * 100),
          v_prop.area_total_m2,
          v_metricas.area_promedio),
        'impacto', 'explica_precio_bajo'
      );
    ELSIF v_prop.area_total_m2 > v_metricas.area_promedio * 1.2 THEN
      v_explicaciones := v_explicaciones || jsonb_build_object(
        'factor', 'area_mayor',
        'texto', format('Área %s%% mayor al promedio',
          ROUND((v_prop.area_total_m2/v_metricas.area_promedio - 1) * 100)),
        'impacto', 'explica_precio_alto'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'propiedad_id', p_id,
    'precio_usd', v_prop.precio_usd,
    'precio_m2', v_prop.precio_m2,
    'zona', v_prop.zona,
    'promedio_zona', v_metricas.precio_promedio,
    'diferencia_pct', v_diff_pct,
    'explicaciones', v_explicaciones,
    'resumen', CASE
      WHEN jsonb_array_length(v_explicaciones) > 0
      THEN v_explicaciones->0->>'texto'
      ELSE 'Precio en rango normal de mercado'
    END
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION explicar_precio IS
'Explica POR QUÉ una propiedad tiene su precio.
Factores: posición vs promedio, posición en proyecto, estado construcción,
desarrollador, área vs promedio.';

-- =====================================================
-- PASO 3: Función principal analisis_mercado_fiduciario()
-- =====================================================

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

  -- Obtener métricas de la zona/tipología
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
        'area_promedio', v_metricas.area_promedio
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
'EL MOAT DE SIMÓN - Análisis de mercado fiduciario completo.
Bloque 1: Opciones válidas con ranking, posición mercado, explicación precio
Bloque 2: Opciones excluidas con razón específica de cada filtro
Bloque 3: Contexto de mercado (stock, escasez, métricas zona)
Bloque 4: Alertas fiduciarias (precios sospechosos, escasez)
Alineado con METODOLOGIA_FIDUCIARIA.md';

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Búsqueda típica
SELECT 'Test 1: Análisis 2D bajo $150k en Equipetrol' as test;
SELECT analisis_mercado_fiduciario('{
  "dormitorios": 2,
  "precio_max": 150000,
  "solo_con_fotos": true,
  "limite": 5
}'::jsonb);

-- Test 2: Búsqueda restrictiva (pocas opciones)
SELECT 'Test 2: Análisis 3D bajo $100k' as test;
SELECT analisis_mercado_fiduciario('{
  "dormitorios": 3,
  "precio_max": 100000,
  "solo_con_fotos": true
}'::jsonb);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 030 - Componentes' as status;

SELECT 'detectar_razon_exclusion_v2()' as componente,
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'detectar_razon_exclusion_v2')
       THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'explicar_precio()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'explicar_precio')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'analisis_mercado_fiduciario()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'analisis_mercado_fiduciario')
       THEN 'OK' ELSE 'FALTA' END;
