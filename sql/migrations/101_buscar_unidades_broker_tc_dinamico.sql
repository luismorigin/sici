-- =====================================================
-- MIGRACION 088: buscar_unidades_broker v2.0 - TC Dinámico
-- Fecha: 30 Enero 2026
-- Propósito: Recalcular precio en tiempo real si depende_de_tc
-- =====================================================
-- CAMBIOS:
-- - Obtiene TC paralelo actual de config_global
-- - Recalcula precio_usd si depende_de_tc = TRUE
-- - Formula: (precio_original × tc_usado) / tc_actual
-- - Filtros y ordenamiento usan precio recalculado
-- =====================================================

DROP FUNCTION IF EXISTS buscar_unidades_broker(jsonb);

CREATE OR REPLACE FUNCTION buscar_unidades_broker(p_filtros JSONB DEFAULT '{}')
RETURNS TABLE (
  id INTEGER,
  proyecto TEXT,
  desarrollador TEXT,
  zona TEXT,
  microzona TEXT,
  dormitorios INTEGER,
  banos NUMERIC,
  precio_usd NUMERIC,
  precio_m2 NUMERIC,
  area_m2 NUMERIC,
  score_calidad INTEGER,
  asesor_nombre TEXT,
  asesor_wsp TEXT,
  asesor_inmobiliaria TEXT,
  fotos_urls TEXT[],
  cantidad_fotos INTEGER,
  url TEXT,
  amenities_lista JSONB,
  razon_fiduciaria TEXT,
  es_multiproyecto BOOLEAN,
  estado_construccion TEXT,
  es_precio_outlier BOOLEAN,
  dias_en_mercado INTEGER,
  unidades_en_edificio INTEGER,
  posicion_precio_edificio INTEGER,
  precio_min_edificio NUMERIC,
  precio_max_edificio NUMERIC,
  unidades_misma_tipologia INTEGER,
  posicion_en_tipologia INTEGER,
  precio_min_tipologia NUMERIC,
  precio_max_tipologia NUMERIC,
  amenities_confirmados TEXT[],
  amenities_por_verificar TEXT[],
  equipamiento_detectado TEXT[],
  descripcion TEXT,
  posicion_mercado JSONB,
  latitud NUMERIC,
  longitud NUMERIC,
  estacionamientos INTEGER,
  baulera BOOLEAN,
  fuente_tipo TEXT,
  codigo_sim TEXT
) AS $func$
DECLARE
  v_tc_paralelo NUMERIC;
BEGIN
  -- Obtener TC paralelo actual UNA sola vez
  SELECT valor INTO v_tc_paralelo
  FROM config_global
  WHERE clave = 'tipo_cambio_paralelo' AND COALESCE(activo, true) = true;

  -- Fallback si no existe
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

    -- PRECIO RECALCULADO si depende de TC
    CASE
      WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
           AND pb.precio_usd_original IS NOT NULL
           AND pb.tipo_cambio_usado IS NOT NULL
           AND pb.tipo_cambio_usado > 0
      THEN
        ROUND(
          (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo,
          0
        )
      ELSE
        pb.precio_usd
    END as precio_usd,

    -- PRECIO/M2 también recalculado
    ROUND(
      CASE
        WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
             AND pb.precio_usd_original IS NOT NULL
             AND pb.tipo_cambio_usado IS NOT NULL
             AND pb.tipo_cambio_usado > 0
        THEN
          (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
        ELSE
          pb.precio_usd
      END / NULLIF(pb.area_m2, 0),
      0
    ) as precio_m2,

    pb.area_m2,
    pb.score_calidad,
    b.nombre::TEXT as asesor_nombre,
    COALESCE(b.whatsapp, b.telefono)::TEXT as asesor_wsp,
    b.empresa::TEXT as asesor_inmobiliaria,

    COALESCE(
      ARRAY(
        SELECT pf.url
        FROM propiedad_fotos pf
        WHERE pf.propiedad_id = pb.id
        ORDER BY pf.orden
      ),
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

    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pb.amenidades->'lista')),
      ARRAY[]::TEXT[]
    ) as amenities_confirmados,
    ARRAY[]::TEXT[] as amenities_por_verificar,
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pb.amenidades->'equipamiento')),
      ARRAY[]::TEXT[]
    ) as equipamiento_detectado,
    pb.descripcion::TEXT,

    calcular_posicion_mercado(
      ROUND(
        CASE
          WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
               AND pb.precio_usd_original IS NOT NULL
               AND pb.tipo_cambio_usado IS NOT NULL
               AND pb.tipo_cambio_usado > 0
          THEN
            (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
          ELSE
            pb.precio_usd
        END / NULLIF(pb.area_m2, 0),
        0
      ),
      pb.zona,
      pb.dormitorios
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
    AND (
      p_filtros->>'dormitorios' IS NULL
      OR pb.dormitorios = (p_filtros->>'dormitorios')::int
    )
    AND (
      p_filtros->>'precio_max' IS NULL
      OR CASE
           WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
                AND pb.precio_usd_original IS NOT NULL
                AND pb.tipo_cambio_usado IS NOT NULL
           THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
           ELSE pb.precio_usd
         END <= (p_filtros->>'precio_max')::numeric
    )
    AND (
      p_filtros->>'precio_min' IS NULL
      OR CASE
           WHEN COALESCE(pb.depende_de_tc, FALSE) = TRUE
                AND pb.precio_usd_original IS NOT NULL
                AND pb.tipo_cambio_usado IS NOT NULL
           THEN (pb.precio_usd_original * pb.tipo_cambio_usado) / v_tc_paralelo
           ELSE pb.precio_usd
         END >= (p_filtros->>'precio_min')::numeric
    )
    AND (
      p_filtros->>'area_min' IS NULL
      OR pb.area_m2 >= (p_filtros->>'area_min')::numeric
    )
    AND (
      p_filtros->>'area_max' IS NULL
      OR pb.area_m2 <= (p_filtros->>'area_max')::numeric
    )
    AND (
      p_filtros->>'zona' IS NULL
      OR pb.zona ILIKE '%' || (p_filtros->>'zona') || '%'
    )
    AND (
      p_filtros->>'proyecto' IS NULL
      OR pb.proyecto_nombre ILIKE '%' || (p_filtros->>'proyecto') || '%'
    )
    AND (
      CASE
        WHEN p_filtros->>'estado_entrega' IS NULL
          OR p_filtros->>'estado_entrega' = 'no_importa'
          OR p_filtros->>'estado_entrega' = 'preventa_ok'
        THEN true
        WHEN p_filtros->>'estado_entrega' = 'entrega_inmediata'
        THEN COALESCE(pb.estado_construccion::text, '') != 'preventa'
        WHEN p_filtros->>'estado_entrega' = 'solo_preventa'
        THEN pb.estado_construccion::text IN ('preventa', 'construccion', 'planos')
        ELSE true
      END
    )
    AND (
      (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
      OR pb.cantidad_fotos > 0
    )
    AND (
      (p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE
      OR b.telefono IS NOT NULL
    )

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
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION buscar_unidades_broker IS
'v2.0: Recalcula precio en tiempo real si depende_de_tc=TRUE.
Formula: (precio_original × tc_usado) / tc_actual = precio_normalizado.
Campos extra: fuente_tipo="broker", codigo_sim="SIM-XXXXX".';

GRANT EXECUTE ON FUNCTION buscar_unidades_broker(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION buscar_unidades_broker(jsonb) TO authenticated;

SELECT 'Migración 088 completada: buscar_unidades_broker v2.0 con TC dinámico.' as status;
