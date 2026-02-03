-- =====================================================
-- MIGRACION 027: calcular_confianza_datos()
-- Fecha: 11 Enero 2026
-- Proposito: Calcular score de confianza de datos para propiedades
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

DROP FUNCTION IF EXISTS calcular_confianza_datos(INTEGER);

CREATE OR REPLACE FUNCTION calcular_confianza_datos(p_id INTEGER)
RETURNS JSONB AS $$
DECLARE
  v_prop RECORD;
  v_proyecto RECORD;
  v_score INTEGER := 0;
  v_max_score INTEGER := 100;
  v_detalles JSONB := '[]'::jsonb;
  v_tiene_fotos BOOLEAN;
  v_cantidad_fotos INTEGER;
  v_precio_m2 NUMERIC;
BEGIN
  -- Obtener datos de la propiedad
  SELECT
    p.id,
    p.precio_usd,
    p.dormitorios,
    p.area_total_m2,
    p.id_proyecto_master,
    p.score_calidad_dato,
    p.datos_json->'asesor'->>'whatsapp' as asesor_wsp,
    p.datos_json->'asesor'->>'nombre' as asesor_nombre,
    CASE
      WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
      THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')
      ELSE 0
    END as cantidad_fotos
  INTO v_prop
  FROM propiedades_v2 p
  WHERE p.id = p_id;

  IF v_prop.id IS NULL THEN
    RETURN jsonb_build_object(
      'error', 'Propiedad no encontrada',
      'score', 0
    );
  END IF;

  -- Calcular precio/m2
  v_precio_m2 := CASE
    WHEN v_prop.area_total_m2 > 0
    THEN v_prop.precio_usd / v_prop.area_total_m2
    ELSE 0
  END;

  v_cantidad_fotos := COALESCE(v_prop.cantidad_fotos, 0);
  v_tiene_fotos := v_cantidad_fotos > 0;

  -- 1. Precio presente y valido (15 puntos)
  IF v_prop.precio_usd IS NOT NULL AND v_prop.precio_usd >= 30000 THEN
    v_score := v_score + 15;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'precio',
      'puntos', 15,
      'maximo', 15,
      'nota', 'Precio valido'
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'precio',
      'puntos', 0,
      'maximo', 15,
      'nota', 'Sin precio o precio invalido'
    );
  END IF;

  -- 2. Area presente y valida (15 puntos)
  IF v_prop.area_total_m2 IS NOT NULL AND v_prop.area_total_m2 >= 20 THEN
    v_score := v_score + 15;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'area',
      'puntos', 15,
      'maximo', 15,
      'nota', 'Area: ' || v_prop.area_total_m2 || 'm2'
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'area',
      'puntos', 0,
      'maximo', 15,
      'nota', 'Sin area o area muy pequena'
    );
  END IF;

  -- 3. Dormitorios presente (10 puntos)
  IF v_prop.dormitorios IS NOT NULL AND v_prop.dormitorios >= 0 THEN
    v_score := v_score + 10;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'dormitorios',
      'puntos', 10,
      'maximo', 10,
      'nota', v_prop.dormitorios || ' dormitorios'
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'dormitorios',
      'puntos', 0,
      'maximo', 10,
      'nota', 'Sin datos de dormitorios'
    );
  END IF;

  -- 4. Fotos (20 puntos, escalonado)
  IF v_cantidad_fotos >= 10 THEN
    v_score := v_score + 20;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'fotos',
      'puntos', 20,
      'maximo', 20,
      'nota', v_cantidad_fotos || ' fotos (excelente)'
    );
  ELSIF v_cantidad_fotos >= 5 THEN
    v_score := v_score + 15;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'fotos',
      'puntos', 15,
      'maximo', 20,
      'nota', v_cantidad_fotos || ' fotos (bueno)'
    );
  ELSIF v_cantidad_fotos >= 1 THEN
    v_score := v_score + 8;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'fotos',
      'puntos', 8,
      'maximo', 20,
      'nota', v_cantidad_fotos || ' fotos (minimo)'
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'fotos',
      'puntos', 0,
      'maximo', 20,
      'nota', 'Sin fotos'
    );
  END IF;

  -- 5. Proyecto asignado (15 puntos)
  IF v_prop.id_proyecto_master IS NOT NULL THEN
    SELECT activo, desarrollador INTO v_proyecto
    FROM proyectos_master
    WHERE id_proyecto_master = v_prop.id_proyecto_master;

    IF v_proyecto.activo = true THEN
      v_score := v_score + 15;
      v_detalles := v_detalles || jsonb_build_object(
        'componente', 'proyecto',
        'puntos', 15,
        'maximo', 15,
        'nota', 'Proyecto verificado y activo'
      );
    ELSE
      v_score := v_score + 8;
      v_detalles := v_detalles || jsonb_build_object(
        'componente', 'proyecto',
        'puntos', 8,
        'maximo', 15,
        'nota', 'Proyecto asignado pero inactivo'
      );
    END IF;
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'proyecto',
      'puntos', 0,
      'maximo', 15,
      'nota', 'Sin proyecto asignado'
    );
  END IF;

  -- 6. Desarrollador conocido (10 puntos)
  IF v_proyecto.desarrollador IS NOT NULL AND v_proyecto.desarrollador != '' THEN
    v_score := v_score + 10;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'desarrollador',
      'puntos', 10,
      'maximo', 10,
      'nota', 'Desarrollador: ' || v_proyecto.desarrollador
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'desarrollador',
      'puntos', 0,
      'maximo', 10,
      'nota', 'Desarrollador desconocido'
    );
  END IF;

  -- 7. Asesor con contacto (10 puntos)
  IF v_prop.asesor_wsp IS NOT NULL AND v_prop.asesor_wsp != '' THEN
    v_score := v_score + 10;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'asesor',
      'puntos', 10,
      'maximo', 10,
      'nota', 'Asesor con WhatsApp'
    );
  ELSIF v_prop.asesor_nombre IS NOT NULL AND v_prop.asesor_nombre != '' THEN
    v_score := v_score + 5;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'asesor',
      'puntos', 5,
      'maximo', 10,
      'nota', 'Asesor sin contacto directo'
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'asesor',
      'puntos', 0,
      'maximo', 10,
      'nota', 'Sin datos de asesor'
    );
  END IF;

  -- 8. Precio/m2 en rango normal (5 puntos)
  IF v_precio_m2 >= 800 AND v_precio_m2 <= 3000 THEN
    v_score := v_score + 5;
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'precio_m2',
      'puntos', 5,
      'maximo', 5,
      'nota', 'Precio/m2 normal: $' || ROUND(v_precio_m2)::text
    );
  ELSIF v_precio_m2 > 0 THEN
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'precio_m2',
      'puntos', 0,
      'maximo', 5,
      'nota', 'Precio/m2 fuera de rango: $' || ROUND(v_precio_m2)::text
    );
  ELSE
    v_detalles := v_detalles || jsonb_build_object(
      'componente', 'precio_m2',
      'puntos', 0,
      'maximo', 5,
      'nota', 'No se puede calcular precio/m2'
    );
  END IF;

  -- Resultado
  RETURN jsonb_build_object(
    'propiedad_id', p_id,
    'score', v_score,
    'max_score', v_max_score,
    'porcentaje', ROUND(100.0 * v_score / v_max_score),
    'categoria', CASE
      WHEN v_score >= 85 THEN 'excelente'
      WHEN v_score >= 70 THEN 'bueno'
      WHEN v_score >= 50 THEN 'aceptable'
      ELSE 'bajo'
    END,
    'detalles', v_detalles,
    'resumen', v_score::text || '/100 - ' || CASE
      WHEN v_score >= 85 THEN 'Datos muy completos'
      WHEN v_score >= 70 THEN 'Datos suficientes'
      WHEN v_score >= 50 THEN 'Datos minimos'
      ELSE 'Datos incompletos'
    END
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calcular_confianza_datos IS 'Calcula score de confianza (0-100) basado en completitud de datos';

-- Test
SELECT calcular_confianza_datos(355);
