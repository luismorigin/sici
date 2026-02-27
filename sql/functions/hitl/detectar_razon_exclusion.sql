-- Función: detectar_razon_exclusion (v1 simple + v2 detallada)
-- Última migración: 023
-- Exportado de producción: 27 Feb 2026
-- Dominio: HITL / Diagnóstico de exclusión

-- =============================================
-- V1: Retorna TEXT simple con razones separadas por |
-- =============================================
CREATE OR REPLACE FUNCTION public.detectar_razon_exclusion(p_id integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
AS $function$
  DECLARE
      v_prop RECORD;
      v_razones TEXT[] := '{}';
  BEGIN
      SELECT
          precio_usd,
          dormitorios,
          area_total_m2,
          score_calidad_dato,
          zona,
          nombre_edificio,
          CASE WHEN area_total_m2 > 0
               THEN ROUND((precio_usd / area_total_m2)::numeric, 0)
               ELSE NULL END as precio_m2
      INTO v_prop
      FROM propiedades_v2
      WHERE id = p_id;

      IF v_prop.precio_usd IS NULL THEN
          v_razones := array_append(v_razones, 'Sin precio');
      END IF;

      IF v_prop.dormitorios IS NULL THEN
          v_razones := array_append(v_razones, 'Sin dormitorios');
      END IF;

      IF v_prop.dormitorios > 10 THEN
          v_razones := array_append(v_razones, 'Dormitorios anómalos: ' || v_prop.dormitorios);
      END IF;

      IF v_prop.precio_m2 IS NOT NULL AND v_prop.precio_m2 < 500 THEN
          v_razones := array_append(v_razones, 'Precio/m² muy bajo: $' || v_prop.precio_m2);
      END IF;

      IF v_prop.precio_m2 IS NOT NULL AND v_prop.precio_m2 > 5000 THEN
          v_razones := array_append(v_razones, 'Precio/m² muy alto: $' || v_prop.precio_m2);
      END IF;

      IF v_prop.score_calidad_dato < 70 THEN
          v_razones := array_append(v_razones, 'Score bajo: ' || v_prop.score_calidad_dato);
      END IF;

      IF array_length(v_razones, 1) > 0 THEN
          RETURN array_to_string(v_razones, ' | ');
      ELSE
          RETURN 'Razón desconocida';
      END IF;
  END;
  $function$;

-- =============================================
-- V2: Retorna JSONB detallado con severidad y sugerencias
-- =============================================
CREATE OR REPLACE FUNCTION public.detectar_razon_exclusion_v2(p_id integer, p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_prop RECORD;
  v_proyecto RECORD;
  v_razones JSONB := '[]'::jsonb;
  v_tiene_fotos BOOLEAN;
  v_precio_m2 NUMERIC;
BEGIN
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

  IF v_prop.id_proyecto_master IS NOT NULL THEN
    SELECT activo INTO v_proyecto
    FROM proyectos_master
    WHERE id_proyecto_master = v_prop.id_proyecto_master;
  END IF;

  v_precio_m2 := CASE
    WHEN v_prop.area_total_m2 > 0
    THEN ROUND(v_prop.precio_usd / v_prop.area_total_m2)
    ELSE 0
  END;

  -- 1. No está activa
  IF NOT v_prop.es_activa THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'es_activa', 'razon', 'Propiedad inactiva (vendida o retirada)',
      'valor_actual', false, 'valor_requerido', true, 'severidad', 'hard');
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
      'valor_actual', v_prop.status, 'valor_requerido', 'completado', 'severidad', 'hard');
  END IF;

  -- 3. Tipo operación no es venta
  IF v_prop.tipo_operacion != 'venta' THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'tipo_operacion',
      'razon', 'No es venta: ' || COALESCE(v_prop.tipo_operacion::TEXT, 'desconocido'),
      'valor_actual', v_prop.tipo_operacion::TEXT, 'valor_requerido', 'venta', 'severidad', 'hard');
  END IF;

  -- 4. Es multiproyecto
  IF v_prop.es_multiproyecto = true THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'es_multiproyecto', 'razon', 'Es listing de proyecto completo, no unidad específica',
      'valor_actual', true, 'valor_requerido', false, 'severidad', 'medium',
      'sugerencia', 'Contactar para ver unidades específicas');
  END IF;

  -- 5. Área menor a 20m²
  IF v_prop.area_total_m2 < 20 THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'area_minima',
      'razon', 'Área muy pequeña: ' || v_prop.area_total_m2 || 'm² (probable parqueo/baulera)',
      'valor_actual', v_prop.area_total_m2, 'valor_requerido', 20, 'severidad', 'hard');
  END IF;

  -- 6. Tipo propiedad es baulera/parqueo
  IF lower(COALESCE(v_prop.tipo_propiedad_original, '')) IN ('baulera', 'parqueo', 'garaje', 'deposito') THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'tipo_propiedad',
      'razon', 'No es departamento: ' || v_prop.tipo_propiedad_original,
      'valor_actual', v_prop.tipo_propiedad_original, 'valor_requerido', 'departamento', 'severidad', 'hard');
  END IF;

  -- 7. Sin proyecto asignado
  IF v_prop.id_proyecto_master IS NULL THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'proyecto_asignado', 'razon', 'Sin proyecto identificado (datos incompletos)',
      'valor_actual', null, 'valor_requerido', 'proyecto válido', 'severidad', 'medium');
  ELSIF v_proyecto.activo = false THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'proyecto_activo', 'razon', 'Proyecto marcado como inactivo',
      'valor_actual', false, 'valor_requerido', true, 'severidad', 'hard');
  END IF;

  -- 8. Sin fotos (si filtro activo)
  IF NOT v_prop.tiene_fotos AND (p_filtros->>'solo_con_fotos')::boolean IS TRUE THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'fotos', 'razon', 'Sin fotos disponibles',
      'valor_actual', 0, 'valor_requerido', '>0', 'severidad', 'soft',
      'sugerencia', 'Pedir fotos al asesor');
  END IF;

  -- 9. Dormitorios no coinciden
  IF p_filtros->>'dormitorios' IS NOT NULL THEN
    IF v_prop.dormitorios IS NULL THEN
      v_razones := v_razones || jsonb_build_object(
        'filtro', 'dormitorios', 'razon', 'Sin datos de dormitorios',
        'valor_actual', null, 'valor_requerido', (p_filtros->>'dormitorios')::int, 'severidad', 'soft');
    ELSIF v_prop.dormitorios != (p_filtros->>'dormitorios')::int THEN
      v_razones := v_razones || jsonb_build_object(
        'filtro', 'dormitorios',
        'razon', format('%s dormitorios (buscás %s)', v_prop.dormitorios, p_filtros->>'dormitorios'),
        'valor_actual', v_prop.dormitorios, 'valor_requerido', (p_filtros->>'dormitorios')::int, 'severidad', 'soft',
        'sugerencia', CASE
          WHEN v_prop.dormitorios < (p_filtros->>'dormitorios')::int THEN '¿Te serviría uno más chico?'
          ELSE '¿Te interesaría uno más grande?'
        END);
    END IF;
  END IF;

  -- 10. Precio fuera de rango
  IF p_filtros->>'precio_max' IS NOT NULL AND v_prop.precio_usd > (p_filtros->>'precio_max')::numeric THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'precio_max',
      'razon', format('$%s excede tu presupuesto ($%s)',
        to_char(v_prop.precio_usd, 'FM999,999'),
        to_char((p_filtros->>'precio_max')::numeric, 'FM999,999')),
      'valor_actual', v_prop.precio_usd, 'valor_requerido', (p_filtros->>'precio_max')::numeric,
      'exceso_pct', ROUND((v_prop.precio_usd - (p_filtros->>'precio_max')::numeric) / (p_filtros->>'precio_max')::numeric * 100, 1),
      'severidad', 'soft', 'sugerencia', '¿Podrías estirar presupuesto?');
  END IF;

  -- 11. Precio/m² sospechoso
  IF v_precio_m2 > 0 AND v_precio_m2 < 800 THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'precio_m2_sospechoso',
      'razon', format('Precio/m² muy bajo: $%s (normal: $1,200-1,800)', v_precio_m2),
      'valor_actual', v_precio_m2, 'valor_requerido', '>800', 'severidad', 'alert',
      'sugerencia', 'Verificar si precio es correcto');
  END IF;

  -- 12. Dormitorios = 0 (probable parqueo mal clasificado)
  IF v_prop.dormitorios = 0 AND v_prop.area_total_m2 < 50 THEN
    v_razones := v_razones || jsonb_build_object(
      'filtro', 'dormitorios_cero',
      'razon', '0 dormitorios + área pequeña (probable parqueo/baulera)',
      'valor_actual', 0, 'valor_requerido', '>=1', 'severidad', 'hard');
  END IF;

  RETURN jsonb_build_object(
    'propiedad_id', p_id,
    'precio_usd', v_prop.precio_usd,
    'dormitorios', v_prop.dormitorios,
    'zona', v_prop.zona,
    'es_excluida', jsonb_array_length(v_razones) > 0,
    'cantidad_razones', jsonb_array_length(v_razones),
    'razones', v_razones,
    'razon_principal', CASE
      WHEN jsonb_array_length(v_razones) > 0 THEN v_razones->0->>'razon'
      ELSE null
    END
  );
END;
$function$;
