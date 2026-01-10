-- =====================================================
-- MIGRACIÓN 031: Ficha de Coherencia Fiduciaria
-- Fecha: 9 Enero 2026
-- Propósito: Extender analisis_mercado_fiduciario() con
--            evaluacion_coherencia, datos_faltantes, resumen_fiduciario
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- Referencia: docs/simon/fichas/FICHA_COHERENCIA_EJEMPLO_*.md
--
-- ESTRUCTURA DE FILTROS EXTENDIDOS:
-- {
--   // Filtros duros (nivel 1)
--   "dormitorios": 2,
--   "precio_max": 150000,
--   "area_min": 70,
--   "zona": "Equipetrol",
--   "solo_con_fotos": true,
--   "limite": 5,
--
--   // Innegociables (nivel 1)
--   "innegociables": ["seguridad", "estacionamiento", "pet_friendly"],
--
--   // Contexto fiduciario (nivel 2)
--   "contexto": {
--     "composicion": "familia_chica",
--     "hijos": 2,
--     "mascota": "perro_grande",
--     "meses_buscando": 9,
--     "estado_emocional": "cansado",
--     "horizonte": "7+",
--     "prioriza": "ubicacion",
--     "sensible_expensas": true,
--     "presion_externa": "bastante"
--   }
-- }
-- =====================================================

-- =====================================================
-- PASO 1: Función helper para evaluar coherencia
-- =====================================================

CREATE OR REPLACE FUNCTION evaluar_coherencia_innegociables(
  p_amenities JSONB,
  p_innegociables TEXT[],
  p_mascota TEXT DEFAULT 'no'
)
RETURNS JSONB AS $func$
DECLARE
  v_cumple TEXT[] := '{}';
  v_viola TEXT[] := '{}';
  v_sin_datos TEXT[] := '{}';
  v_amenities_lower TEXT[];
  v_innegociable TEXT;
BEGIN
  -- Convertir amenities a lowercase para comparación
  IF p_amenities IS NOT NULL AND jsonb_typeof(p_amenities) = 'array' THEN
    SELECT array_agg(lower(elem))
    INTO v_amenities_lower
    FROM jsonb_array_elements_text(p_amenities) as elem;
  ELSE
    v_amenities_lower := '{}';
  END IF;

  -- Si no hay innegociables o es "ninguno", retornar vacío
  IF p_innegociables IS NULL OR array_length(p_innegociables, 1) IS NULL
     OR 'ninguno' = ANY(p_innegociables) THEN
    RETURN jsonb_build_object(
      'cumple', '[]'::jsonb,
      'viola', '[]'::jsonb,
      'sin_datos', '[]'::jsonb,
      'evaluacion_completa', true
    );
  END IF;

  FOREACH v_innegociable IN ARRAY p_innegociables
  LOOP
    CASE v_innegociable
      -- SEGURIDAD: Evaluar contra "seguridad 24/7"
      WHEN 'seguridad' THEN
        IF 'seguridad 24/7' = ANY(v_amenities_lower)
           OR 'seguridad' = ANY(v_amenities_lower) THEN
          v_cumple := array_append(v_cumple, 'seguridad');
        ELSIF array_length(v_amenities_lower, 1) > 0 THEN
          -- Tiene amenities pero no seguridad
          v_viola := array_append(v_viola, 'seguridad');
        ELSE
          v_sin_datos := array_append(v_sin_datos, 'seguridad');
        END IF;

      -- ASCENSOR: Evaluar contra "ascensor"
      WHEN 'ascensor' THEN
        IF 'ascensor' = ANY(v_amenities_lower) THEN
          v_cumple := array_append(v_cumple, 'ascensor');
        ELSIF array_length(v_amenities_lower, 1) > 0 THEN
          v_viola := array_append(v_viola, 'ascensor');
        ELSE
          v_sin_datos := array_append(v_sin_datos, 'ascensor');
        END IF;

      -- BALCÓN: Evaluar contra "terraza/balcón"
      WHEN 'balcon' THEN
        IF 'terraza/balcón' = ANY(v_amenities_lower)
           OR 'balcón' = ANY(v_amenities_lower)
           OR 'terraza' = ANY(v_amenities_lower) THEN
          v_cumple := array_append(v_cumple, 'balcon');
        ELSIF array_length(v_amenities_lower, 1) > 0 THEN
          v_viola := array_append(v_viola, 'balcon');
        ELSE
          v_sin_datos := array_append(v_sin_datos, 'balcon');
        END IF;

      -- PET FRIENDLY: Evaluar contra "pet friendly"
      WHEN 'pet_friendly' THEN
        IF 'pet friendly' = ANY(v_amenities_lower) THEN
          v_cumple := array_append(v_cumple, 'pet_friendly');
        ELSIF array_length(v_amenities_lower, 1) > 0 THEN
          -- Solo viola si el usuario tiene mascota
          IF p_mascota != 'no' AND p_mascota IS NOT NULL THEN
            v_viola := array_append(v_viola, 'pet_friendly');
          ELSE
            v_sin_datos := array_append(v_sin_datos, 'pet_friendly');
          END IF;
        ELSE
          v_sin_datos := array_append(v_sin_datos, 'pet_friendly');
        END IF;

      -- ESTACIONAMIENTO: No tenemos dato explícito
      WHEN 'estacionamiento' THEN
        v_sin_datos := array_append(v_sin_datos, 'estacionamiento');

      ELSE
        -- Innegociable desconocido
        v_sin_datos := array_append(v_sin_datos, v_innegociable);
    END CASE;
  END LOOP;

  RETURN jsonb_build_object(
    'cumple', to_jsonb(v_cumple),
    'viola', to_jsonb(v_viola),
    'sin_datos', to_jsonb(v_sin_datos),
    'total_evaluados', array_length(p_innegociables, 1),
    'total_cumple', array_length(v_cumple, 1),
    'total_viola', array_length(v_viola, 1),
    'total_sin_datos', array_length(v_sin_datos, 1),
    'evaluacion_completa', array_length(v_sin_datos, 1) IS NULL OR array_length(v_sin_datos, 1) = 0
  );
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION evaluar_coherencia_innegociables IS
'Evalúa si una propiedad cumple los innegociables del usuario.
Retorna: cumple[], viola[], sin_datos[]
Innegociables soportados: seguridad, ascensor, balcon, pet_friendly, estacionamiento';

-- =====================================================
-- PASO 2: Función helper para detectar señales de alerta
-- =====================================================

CREATE OR REPLACE FUNCTION detectar_senales_alerta(
  p_contexto JSONB,
  p_precio_usd NUMERIC,
  p_precio_max NUMERIC,
  p_coherencia JSONB
)
RETURNS JSONB AS $func$
DECLARE
  v_alertas JSONB := '[]'::jsonb;
  v_estado TEXT;
  v_meses INTEGER;
  v_presion TEXT;
  v_sensible_expensas BOOLEAN;
BEGIN
  -- Extraer contexto
  v_estado := p_contexto->>'estado_emocional';
  v_meses := COALESCE((p_contexto->>'meses_buscando')::int, 0);
  v_presion := p_contexto->>'presion_externa';
  v_sensible_expensas := COALESCE((p_contexto->>'sensible_expensas')::boolean, false);

  -- ALERTA 1: Estado emocional de riesgo
  IF v_estado IN ('cansado', 'frustrado', 'presionado') THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'estado_emocional',
      'severidad', CASE
        WHEN v_estado = 'presionado' THEN 'alta'
        WHEN v_estado = 'frustrado' THEN 'alta'
        ELSE 'media'
      END,
      'mensaje', CASE v_estado
        WHEN 'cansado' THEN '"Quiero terminar con esto" no es evaluación, es agotamiento. La guía recomienda pausar.'
        WHEN 'frustrado' THEN 'La frustración puede llevar a bajar el estándar. Recordá tus innegociables.'
        WHEN 'presionado' THEN 'Decisiones bajo presión suelen generar arrepentimiento. Tomá distancia.'
      END,
      'recomendacion', 'Pausar 1-2 semanas antes de decidir'
    );
  END IF;

  -- ALERTA 2: Fatiga de búsqueda
  IF v_meses >= 9 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'fatiga_busqueda',
      'severidad', 'media',
      'mensaje', format('Llevás %s meses buscando. El cansancio puede afectar el juicio.', v_meses),
      'recomendacion', 'No bajes el estándar por agotamiento'
    );
  END IF;

  -- ALERTA 3: Presión externa alta
  IF v_presion = 'bastante' THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'presion_externa',
      'severidad', 'alta',
      'mensaje', 'La presión externa puede forzar decisiones que no te convencen.',
      'recomendacion', 'Identificá de dónde viene la presión y evaluá si es legítima'
    );
  END IF;

  -- ALERTA 4: Viola innegociables
  IF (p_coherencia->>'total_viola')::int > 0 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'viola_innegociables',
      'severidad', 'alta',
      'mensaje', format('Esta propiedad viola %s innegociable(s) que definiste.',
                       (p_coherencia->>'total_viola')::int),
      'detalle', p_coherencia->'viola',
      'recomendacion', 'Si no cumple innegociables, no importa que sea "mejor" en otras cosas'
    );
  END IF;

  -- ALERTA 5: Precio al límite
  IF p_precio_max IS NOT NULL AND p_precio_usd >= p_precio_max * 0.95 THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'precio_al_limite',
      'severidad', 'baja',
      'mensaje', format('Precio al %s%% de tu presupuesto máximo.',
                       ROUND(p_precio_usd / p_precio_max * 100)),
      'recomendacion', 'Verificá que no estés estirando el presupuesto por "esta es la indicada"'
    );
  END IF;

  -- ALERTA 6: Sensible a expensas pero propiedad tiene muchos amenities
  -- (amenities = expensas altas generalmente)
  IF v_sensible_expensas THEN
    v_alertas := v_alertas || jsonb_build_object(
      'tipo', 'riesgo_expensas',
      'severidad', 'media',
      'mensaje', 'Indicaste sensibilidad a expensas. No tenemos datos de expensas de esta propiedad.',
      'recomendacion', 'Preguntar monto de expensas ANTES de visitar'
    );
  END IF;

  RETURN v_alertas;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION detectar_senales_alerta IS
'Detecta señales de alerta del contexto fiduciario del usuario.
Tipos: estado_emocional, fatiga_busqueda, presion_externa, viola_innegociables, precio_al_limite, riesgo_expensas';

-- =====================================================
-- PASO 3: Función helper para generar resumen fiduciario
-- =====================================================

CREATE OR REPLACE FUNCTION generar_resumen_fiduciario(
  p_proyecto TEXT,
  p_precio_usd NUMERIC,
  p_precio_max NUMERIC,
  p_diferencia_pct NUMERIC,
  p_coherencia JSONB,
  p_alertas JSONB
)
RETURNS TEXT AS $func$
DECLARE
  v_total_viola INTEGER;
  v_total_cumple INTEGER;
  v_total_alertas INTEGER;
  v_precio_texto TEXT;
  v_coherencia_texto TEXT;
BEGIN
  v_total_viola := COALESCE((p_coherencia->>'total_viola')::int, 0);
  v_total_cumple := COALESCE((p_coherencia->>'total_cumple')::int, 0);
  v_total_alertas := COALESCE(jsonb_array_length(p_alertas), 0);

  -- Texto de precio
  IF p_diferencia_pct IS NOT NULL THEN
    IF p_diferencia_pct <= -15 THEN
      v_precio_texto := format('%s%% bajo promedio', ABS(p_diferencia_pct)::int);
    ELSIF p_diferencia_pct >= 15 THEN
      v_precio_texto := format('%s%% sobre promedio', p_diferencia_pct::int);
    ELSE
      v_precio_texto := 'precio normal de zona';
    END IF;
  ELSE
    v_precio_texto := 'sin datos de comparación';
  END IF;

  -- CASO 1: Viola innegociables (peor caso)
  IF v_total_viola > 0 THEN
    RETURN format('Viola %s innegociable(s); el precio bajo no compensa lo que falta.',
                  v_total_viola);
  END IF;

  -- CASO 2: Alertas de estado emocional
  IF v_total_alertas > 0 AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_alertas) a
    WHERE a->>'tipo' IN ('estado_emocional', 'presion_externa')
  ) THEN
    RETURN 'Cumple filtros pero hay señales de decisión emocional; tomá distancia antes de avanzar.';
  END IF;

  -- CASO 3: Todo bien, diferencia de precio notable
  IF v_total_viola = 0 AND p_diferencia_pct IS NOT NULL THEN
    IF p_diferencia_pct <= -20 THEN
      RETURN format('Cumple innegociables y está %s%% bajo promedio - investigar por qué.',
                   ABS(p_diferencia_pct)::int);
    ELSIF p_diferencia_pct <= -10 THEN
      RETURN format('Cumple innegociables y buen precio (%s).',
                   v_precio_texto);
    ELSIF p_diferencia_pct >= 15 THEN
      RETURN format('Cumple innegociables pero %s - evaluar si el premium lo vale.',
                   v_precio_texto);
    END IF;
  END IF;

  -- CASO 4: Default - cumple básico
  IF v_total_cumple > 0 THEN
    RETURN format('Cumple %s innegociable(s) verificable(s); %s.',
                  v_total_cumple, v_precio_texto);
  ELSE
    RETURN format('Sin innegociables definidos; %s.', v_precio_texto);
  END IF;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION generar_resumen_fiduciario IS
'Genera el "resumen en 1 frase" para la tarjeta de propiedad.
Prioriza: violaciones > alertas emocionales > precio.';

-- =====================================================
-- PASO 4: Actualizar analisis_mercado_fiduciario()
-- =====================================================

DROP FUNCTION IF EXISTS analisis_mercado_fiduciario(JSONB);

CREATE OR REPLACE FUNCTION analisis_mercado_fiduciario(p_filtros JSONB)
RETURNS JSONB AS $func$
DECLARE
  v_resultado JSONB;
  v_opciones_validas JSONB := '[]'::jsonb;
  v_opciones_excluidas JSONB := '[]'::jsonb;
  v_alertas_globales JSONB := '[]'::jsonb;
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
  -- Nuevos: para ficha coherencia
  v_innegociables TEXT[];
  v_contexto_fiduciario JSONB;
  v_mascota TEXT;
  v_coherencia JSONB;
  v_alertas_prop JSONB;
  v_resumen TEXT;
  v_posicion JSONB;
  v_diff_pct NUMERIC;
BEGIN
  -- Extraer filtros básicos
  v_precio_max := (p_filtros->>'precio_max')::numeric;
  v_dormitorios := (p_filtros->>'dormitorios')::int;
  v_zona := p_filtros->>'zona';

  -- Extraer innegociables y contexto fiduciario
  IF p_filtros->'innegociables' IS NOT NULL AND jsonb_typeof(p_filtros->'innegociables') = 'array' THEN
    SELECT array_agg(elem) INTO v_innegociables
    FROM jsonb_array_elements_text(p_filtros->'innegociables') as elem;
  ELSE
    v_innegociables := '{}';
  END IF;

  v_contexto_fiduciario := COALESCE(p_filtros->'contexto', '{}'::jsonb);
  v_mascota := COALESCE(v_contexto_fiduciario->>'mascota', 'no');

  -- ==========================================
  -- BLOQUE 1: OPCIONES VÁLIDAS CON RANKING
  -- + evaluacion_coherencia
  -- + datos_faltantes
  -- + resumen_fiduciario
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

    -- Calcular posición de mercado
    v_posicion := calcular_posicion_mercado(v_prop.precio_usd, v_prop.zona, v_prop.dormitorios);
    v_diff_pct := (v_posicion->>'diferencia_pct')::numeric;

    -- Evaluar coherencia con innegociables
    v_coherencia := evaluar_coherencia_innegociables(
      v_prop.amenities_lista,
      v_innegociables,
      v_mascota
    );

    -- Detectar señales de alerta para esta propiedad
    v_alertas_prop := detectar_senales_alerta(
      v_contexto_fiduciario,
      v_prop.precio_usd,
      v_precio_max,
      v_coherencia
    );

    -- Generar resumen fiduciario (la frase para tarjeta)
    v_resumen := generar_resumen_fiduciario(
      v_prop.proyecto,
      v_prop.precio_usd,
      v_precio_max,
      v_diff_pct,
      v_coherencia,
      v_alertas_prop
    );

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
      'posicion_mercado', v_posicion,
      'explicacion_precio', explicar_precio(v_prop.id),
      -- NUEVOS CAMPOS FICHA COHERENCIA:
      'evaluacion_coherencia', v_coherencia,
      'alertas', v_alertas_prop,
      'resumen_fiduciario', v_resumen,
      -- Campos existentes
      'fotos', v_prop.cantidad_fotos,
      'asesor_wsp', v_prop.asesor_wsp,
      'amenities', v_prop.amenities_lista
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
      COALESCE(p.microzona, p.zona, 'Sin zona') as zona,
      CASE
        WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
        THEN p.datos_json->'amenities'->'lista'
        ELSE '[]'::jsonb
      END as amenities_lista
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

    -- Evaluar coherencia también para excluidas
    v_coherencia := evaluar_coherencia_innegociables(
      v_prop.amenities_lista,
      v_innegociables,
      v_mascota
    );

    v_opciones_excluidas := v_opciones_excluidas || jsonb_build_object(
      'id', v_prop.id,
      'proyecto', v_prop.proyecto,
      'zona', v_prop.zona,
      'precio_usd', v_prop.precio_usd,
      'dormitorios', v_prop.dormitorios,
      'area_m2', v_prop.area_total_m2,
      'analisis_exclusion', detectar_razon_exclusion_v2(v_prop.id, p_filtros),
      'evaluacion_coherencia', v_coherencia
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
  -- BLOQUE 4: ALERTAS GLOBALES (del contexto usuario)
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
    v_alertas_globales := v_alertas_globales || jsonb_build_object(
      'tipo', 'precio_sospechoso',
      'propiedad_id', v_prop.id,
      'precio_usd', v_prop.precio_usd,
      'precio_m2', v_prop.precio_m2,
      'mensaje', format('Precio/m² muy bajo ($%s). Verificar antes de visitar.', v_prop.precio_m2),
      'severidad', 'warning'
    );
  END LOOP;

  -- Alerta de escasez relativa
  IF v_total_validas <= 2 AND v_stock_total >= 10 THEN
    v_alertas_globales := v_alertas_globales || jsonb_build_object(
      'tipo', 'escasez_relativa',
      'mensaje', format('Solo %s de %s propiedades cumplen tus filtros (%s%%). Considerá flexibilizar.',
        v_total_validas, v_stock_total,
        ROUND(100.0 * v_total_validas / v_stock_total, 0)),
      'severidad', 'info'
    );
  END IF;

  -- Alertas del contexto emocional (globales, no por propiedad)
  IF v_contexto_fiduciario->>'estado_emocional' IN ('cansado', 'frustrado', 'presionado') THEN
    v_alertas_globales := v_alertas_globales || jsonb_build_object(
      'tipo', 'estado_emocional_global',
      'mensaje', 'Tu estado emocional sugiere riesgo de decisión apresurada. Considerá pausar 1-2 semanas.',
      'severidad', 'warning',
      'estado', v_contexto_fiduciario->>'estado_emocional'
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
      'total', jsonb_array_length(v_alertas_globales),
      'alertas', v_alertas_globales
    )
  );
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION analisis_mercado_fiduciario IS
'EL MOAT DE SIMÓN - Análisis de mercado fiduciario completo.
v2.0: Agrega Ficha de Coherencia Fiduciaria:
- evaluacion_coherencia: cumple/viola/sin_datos innegociables
- alertas: señales de decisión emocional
- resumen_fiduciario: frase para tarjeta
Referencia: docs/simon/fichas/FICHA_COHERENCIA_EJEMPLO_*.md';

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Búsqueda con innegociables y contexto emocional
SELECT 'Test 1: Análisis 2D con innegociables y contexto' as test;
SELECT analisis_mercado_fiduciario('{
  "dormitorios": 2,
  "precio_max": 150000,
  "solo_con_fotos": true,
  "limite": 3,
  "innegociables": ["seguridad", "ascensor"],
  "contexto": {
    "estado_emocional": "cansado",
    "meses_buscando": 9,
    "mascota": "perro_grande",
    "sensible_expensas": true,
    "presion_externa": "poco"
  }
}'::jsonb);

-- Test 2: Usuario presionado (debería generar alertas)
SELECT 'Test 2: Usuario presionado' as test;
SELECT analisis_mercado_fiduciario('{
  "dormitorios": 2,
  "precio_max": 120000,
  "limite": 2,
  "innegociables": ["pet_friendly", "seguridad"],
  "contexto": {
    "estado_emocional": "presionado",
    "meses_buscando": 15,
    "mascota": "perro_chico",
    "presion_externa": "bastante"
  }
}'::jsonb);

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 031 - Ficha Coherencia Fiduciaria' as status;

SELECT 'evaluar_coherencia_innegociables()' as componente,
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'evaluar_coherencia_innegociables')
       THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'detectar_senales_alerta()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'detectar_senales_alerta')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'generar_resumen_fiduciario()',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'generar_resumen_fiduciario')
       THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'analisis_mercado_fiduciario() v2',
  CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'analisis_mercado_fiduciario')
       THEN 'OK' ELSE 'FALTA' END;
