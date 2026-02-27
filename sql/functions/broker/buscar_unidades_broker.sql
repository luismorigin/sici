-- Función: buscar_unidades_broker
-- Última migración: 101
-- Exportado de producción: 27 Feb 2026
-- Dominio: Broker B2B / Búsqueda propiedades broker
-- Recalcula precios con TC paralelo dinámico

CREATE OR REPLACE FUNCTION public.buscar_unidades_broker(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id integer, proyecto text, desarrollador text, zona text, microzona text, dormitorios integer, banos numeric, precio_usd numeric, precio_m2 numeric, area_m2 numeric, score_calidad integer, asesor_nombre text, asesor_wsp text, asesor_inmobiliaria text, fotos_urls text[], cantidad_fotos integer, url text, amenities_lista jsonb, razon_fiduciaria text, es_multiproyecto boolean, estado_construccion text, es_precio_outlier boolean, dias_en_mercado integer, unidades_en_edificio integer, posicion_precio_edificio integer, precio_min_edificio numeric, precio_max_edificio numeric, unidades_misma_tipologia integer, posicion_en_tipologia integer, precio_min_tipologia numeric, precio_max_tipologia numeric, amenities_confirmados text[], amenities_por_verificar text[], equipamiento_detectado text[], descripcion text, posicion_mercado jsonb, latitud numeric, longitud numeric, estacionamientos integer, baulera boolean, fuente_tipo text, codigo_sim text)
 LANGUAGE plpgsql
 STABLE
AS $function$
  DECLARE
    v_tc_paralelo NUMERIC;
  BEGIN
    SELECT valor INTO v_tc_paralelo
    FROM config_global
    WHERE clave = 'tipo_cambio_paralelo' AND COALESCE(activo, true) = true;

    IF v_tc_paralelo IS NULL OR v_tc_paralelo <= 0 THEN
      v_tc_paralelo := 9.09;
    END IF;

    RETURN QUERY
    SELECT
      pb.id,
      pb.proyecto_nombre::TEXT as proyecto,
      pb.desarrollador::TEXT,
      pb.zona::TEXT,
      pb.microzona::TEXT,
      pb.dormitorios,
      pb.banos,
      CASE
        WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
             AND pb.precio_usd_original IS NOT NULL
             AND pb.tipo_cambio_usado IS NOT NULL
             AND pb.tipo_cambio_usado > 0
        THEN ROUND((pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo, 0)
        ELSE pb.precio_usd
      END as precio_usd,
      ROUND(
        CASE
          WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
               AND pb.precio_usd_original IS NOT NULL
               AND pb.tipo_cambio_usado IS NOT NULL
               AND pb.tipo_cambio_usado > 0
          THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
          ELSE pb.precio_usd
        END / NULLIF(pb.area_m2, 0), 0
      ) as precio_m2,
      pb.area_m2,
      pb.score_calidad,
      b.nombre::TEXT as asesor_nombre,
      COALESCE(b.whatsapp, b.telefono)::TEXT as asesor_wsp,
      b.empresa::TEXT as asesor_inmobiliaria,
      COALESCE(
        ARRAY(SELECT pf.url FROM propiedad_fotos pf WHERE pf.propiedad_id = pb.id ORDER BY pf.orden),
        ARRAY[]::TEXT[]
      ) as fotos_urls,
      pb.cantidad_fotos,
      ('https://simon.bo/p/' || pb.codigo)::TEXT as url,
      COALESCE(pb.amenidades->'lista', '[]'::jsonb) as amenities_lista,
      (pb.proyecto_nombre || ' en ' || pb.zona || ' - ' || pb.dormitorios || ' dorm, ' || pb.area_m2::integer || 'm²')::TEXT as razon_fiduciaria,
      false as es_multiproyecto,
      COALESCE(pb.estado_construccion::TEXT, 'no_especificado') as estado_construccion,
      false as es_precio_outlier,
      (CURRENT_DATE - pb.created_at::date)::INTEGER as dias_en_mercado,
      NULL::INTEGER as unidades_en_edificio,
      NULL::INTEGER as posicion_precio_edificio,
      NULL::NUMERIC as precio_min_edificio,
      NULL::NUMERIC as precio_max_edificio,
      NULL::INTEGER as unidades_misma_tipologia,
      NULL::INTEGER as posicion_en_tipologia,
      NULL::NUMERIC as precio_min_tipologia,
      NULL::NUMERIC as precio_max_tipologia,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(pb.amenidades->'lista')), ARRAY[]::TEXT[]) as amenities_confirmados,
      ARRAY[]::TEXT[] as amenities_por_verificar,
      COALESCE(ARRAY(SELECT jsonb_array_elements_text(pb.amenidades->'equipamiento')), ARRAY[]::TEXT[]) as equipamiento_detectado,
      pb.descripcion::TEXT,
      calcular_posicion_mercado(
        ROUND(
          CASE
            WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
                 AND pb.precio_usd_original IS NOT NULL
                 AND pb.tipo_cambio_usado IS NOT NULL
                 AND pb.tipo_cambio_usado > 0
            THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
            ELSE pb.precio_usd
          END / NULLIF(pb.area_m2, 0), 0
        ), pb.zona, pb.dormitorios
      ) as posicion_mercado,
      pb.latitud,
      pb.longitud,
      pb.cantidad_parqueos as estacionamientos,
      pb.baulera_incluida as baulera,
      'broker'::TEXT as fuente_tipo,
      pb.codigo as codigo_sim
    FROM propiedades_broker pb
    JOIN brokers b ON b.id = pb.broker_id
    WHERE pb.estado = 'publicada'
      AND b.activo = true
      AND (p_filtros->>'dormitorios' IS NULL OR pb.dormitorios = (p_filtros->>'dormitorios')::int)
      AND (p_filtros->>'precio_max' IS NULL OR
           CASE WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE AND pb.precio_usd_original IS NOT NULL AND pb.tipo_cambio_usado IS NOT NULL
                THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
                ELSE pb.precio_usd END <= (p_filtros->>'precio_max')::numeric)
      AND (p_filtros->>'precio_min' IS NULL OR
           CASE WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE AND pb.precio_usd_original IS NOT NULL AND pb.tipo_cambio_usado IS NOT NULL
                THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
                ELSE pb.precio_usd END >= (p_filtros->>'precio_min')::numeric)
      AND (p_filtros->>'area_min' IS NULL OR pb.area_m2 >= (p_filtros->>'area_min')::numeric)
      AND (p_filtros->>'area_max' IS NULL OR pb.area_m2 <= (p_filtros->>'area_max')::numeric)
      AND (p_filtros->>'zona' IS NULL OR pb.zona ILIKE '%' || (p_filtros->>'zona') || '%')
      AND (p_filtros->>'proyecto' IS NULL OR pb.proyecto_nombre ILIKE '%' || (p_filtros->>'proyecto') || '%')
      AND (CASE
        WHEN p_filtros->>'estado_entrega' IS NULL OR p_filtros->>'estado_entrega' = 'no_importa' OR p_filtros->>'estado_entrega' = 'preventa_ok' THEN true
        WHEN p_filtros->>'estado_entrega' = 'entrega_inmediata' THEN COALESCE(pb.estado_construccion::text, '') != 'preventa'
        WHEN p_filtros->>'estado_entrega' = 'solo_preventa' THEN pb.estado_construccion::text IN ('preventa', 'construccion', 'planos')
        ELSE true END)
      AND ((p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE OR pb.cantidad_fotos > 0)
      AND ((p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE OR b.telefono IS NOT NULL)
    ORDER BY
      CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN
        CASE WHEN COALESCE(pb.depende_de_tc, FALSE) THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo ELSE pb.precio_usd END
      END DESC NULLS LAST,
      CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'precio_asc' THEN
        CASE WHEN COALESCE(pb.depende_de_tc, FALSE) THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo ELSE pb.precio_usd END
      END ASC NULLS LAST,
      pb.id DESC
    LIMIT COALESCE((p_filtros->>'limite')::int, 50);
  END;
  $function$;
