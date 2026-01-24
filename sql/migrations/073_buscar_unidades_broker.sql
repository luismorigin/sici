-- =====================================================
-- MIGRACION 073: Funcion buscar_unidades_broker
-- Fecha: 23 Enero 2026
-- Proposito: Buscar propiedades de brokers con campos compatibles con buscar_unidades_reales
-- =====================================================
-- SEGURIDAD: NO toca buscar_unidades_reales() ni propiedades_v2
-- Esta funcion lee SOLO de propiedades_broker
-- =====================================================

DROP FUNCTION IF EXISTS buscar_unidades_broker(jsonb);

CREATE OR REPLACE FUNCTION buscar_unidades_broker(p_filtros JSONB DEFAULT '{}')
RETURNS TABLE (
  -- Campos IDENTICOS a buscar_unidades_reales para compatibilidad UI
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
  -- Comparacion edificio (NULL para broker - no hay stats agregadas)
  unidades_en_edificio INTEGER,
  posicion_precio_edificio INTEGER,
  precio_min_edificio NUMERIC,
  precio_max_edificio NUMERIC,
  -- Comparacion tipologia (NULL para broker)
  unidades_misma_tipologia INTEGER,
  posicion_en_tipologia INTEGER,
  precio_min_tipologia NUMERIC,
  precio_max_tipologia NUMERIC,
  -- Amenities
  amenities_confirmados TEXT[],
  amenities_por_verificar TEXT[],
  equipamiento_detectado TEXT[],
  descripcion TEXT,
  posicion_mercado JSONB,
  latitud NUMERIC,
  longitud NUMERIC,
  estacionamientos INTEGER,
  baulera BOOLEAN,
  -- NUEVOS campos exclusivos para broker
  fuente_tipo TEXT,    -- 'broker' (vs NULL para scraping)
  codigo_sim TEXT      -- SIM-XXXXX
) AS $func$
BEGIN
  RETURN QUERY
  SELECT
    pb.id,
    pb.proyecto_nombre::TEXT as proyecto,
    pb.desarrollador::TEXT,
    pb.zona::TEXT,
    pb.microzona::TEXT,
    pb.dormitorios,
    pb.banos,
    pb.precio_usd,
    ROUND(pb.precio_usd / NULLIF(pb.area_m2, 0), 0) as precio_m2,
    pb.area_m2,
    pb.score_calidad,
    b.nombre::TEXT as asesor_nombre,
    COALESCE(b.whatsapp, b.telefono)::TEXT as asesor_wsp,
    b.empresa::TEXT as asesor_inmobiliaria,

    -- Fotos desde tabla separada (ordenadas por campo orden)
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

    -- Amenities lista (compatible con estructura existente)
    COALESCE(pb.amenidades->'lista', '[]'::jsonb) as amenities_lista,

    -- Razon fiduciaria simplificada
    (pb.proyecto_nombre || ' en ' || pb.zona || ' - ' || pb.dormitorios || ' dorm, ' || pb.area_m2::integer || 'm²')::TEXT as razon_fiduciaria,

    false as es_multiproyecto,  -- Broker elige proyecto, no hay ambiguedad
    COALESCE(pb.estado_construccion::TEXT, 'no_especificado') as estado_construccion,
    false as es_precio_outlier,  -- Broker confirma precio, no es outlier

    (CURRENT_DATE - pb.created_at::date)::INTEGER as dias_en_mercado,

    -- Stats edificio: NULL para broker (no tenemos data agregada de scraping)
    NULL::INTEGER as unidades_en_edificio,
    NULL::INTEGER as posicion_precio_edificio,
    NULL::NUMERIC as precio_min_edificio,
    NULL::NUMERIC as precio_max_edificio,

    -- Stats tipologia: NULL
    NULL::INTEGER as unidades_misma_tipologia,
    NULL::INTEGER as posicion_en_tipologia,
    NULL::NUMERIC as precio_min_tipologia,
    NULL::NUMERIC as precio_max_tipologia,

    -- Amenities confirmados (todo lo que el broker marca es confirmado)
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pb.amenidades->'lista')),
      ARRAY[]::TEXT[]
    ) as amenities_confirmados,

    ARRAY[]::TEXT[] as amenities_por_verificar,  -- Broker confirma, nada por verificar

    -- Equipamiento detectado desde amenidades
    COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(pb.amenidades->'equipamiento')),
      ARRAY[]::TEXT[]
    ) as equipamiento_detectado,

    pb.descripcion::TEXT,

    -- Posicion mercado calculada vs zona (usa funcion existente)
    calcular_posicion_mercado(
      ROUND(pb.precio_usd / NULLIF(pb.area_m2, 0), 0),
      pb.zona,
      pb.dormitorios
    ) as posicion_mercado,

    pb.latitud,
    pb.longitud,
    pb.cantidad_parqueos as estacionamientos,
    pb.baulera_incluida as baulera,

    -- Campos nuevos exclusivos broker
    'broker'::TEXT as fuente_tipo,
    pb.codigo as codigo_sim

  FROM propiedades_broker pb
  JOIN brokers b ON b.id = pb.broker_id

  WHERE pb.estado = 'publicada'
    AND b.activo = true

    -- Filtros dinamicos (misma estructura que buscar_unidades_reales)
    AND (
      p_filtros->>'dormitorios' IS NULL
      OR pb.dormitorios = (p_filtros->>'dormitorios')::int
    )
    AND (
      p_filtros->>'precio_max' IS NULL
      OR pb.precio_usd <= (p_filtros->>'precio_max')::numeric
    )
    AND (
      p_filtros->>'precio_min' IS NULL
      OR pb.precio_usd >= (p_filtros->>'precio_min')::numeric
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
    -- Estado entrega (compatible con formulario MOAT)
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
    -- Solo propiedades con fotos si se solicita
    AND (
      (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
      OR pb.cantidad_fotos > 0
    )
    -- Solo propiedades con telefono si se solicita
    AND (
      (p_filtros->>'solo_con_telefono')::boolean IS NOT TRUE
      OR b.telefono IS NOT NULL
    )

  ORDER BY
    CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN pb.precio_usd END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'precio_m2_asc' THEN (pb.precio_usd / NULLIF(pb.area_m2, 0)) END ASC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'precio_m2_desc' THEN (pb.precio_usd / NULLIF(pb.area_m2, 0)) END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' = 'score_desc' THEN pb.score_calidad END DESC NULLS LAST,
    CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'precio_asc' THEN pb.precio_usd END ASC NULLS LAST,
    pb.id DESC

  LIMIT COALESCE((p_filtros->>'limite')::int, 50);
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION buscar_unidades_broker IS
'v1.0: Busca propiedades de brokers. Retorna campos compatibles con buscar_unidades_reales.
Campos extra: fuente_tipo="broker", codigo_sim="SIM-XXXXX".
NO toca propiedades_v2 ni buscar_unidades_reales.';

-- Grant para que anon pueda llamar la funcion
GRANT EXECUTE ON FUNCTION buscar_unidades_broker(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION buscar_unidades_broker(jsonb) TO authenticated;

-- =====================================================
-- TEST: Verificar funcion creada
-- =====================================================
SELECT 'Migracion 073 completada. Funcion buscar_unidades_broker creada.' as status;

-- Este test solo funcionara despues de ejecutar 074 (datos de prueba)
-- SELECT id, proyecto, precio_usd, dormitorios, fuente_tipo, codigo_sim
-- FROM buscar_unidades_broker('{"limite": 10}'::jsonb);
