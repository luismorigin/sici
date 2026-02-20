-- ============================================================================
-- Migracion 156: Agregar filtro de parqueo a buscar_unidades_alquiler
-- ============================================================================
-- Parametro: con_parqueo (boolean) — si true, solo propiedades con estacionamientos > 0
-- 88 de 181 alquileres tienen parqueo (49%)
-- Fix: deposito_meses NUMERIC (no INTEGER) — columna en BD es numeric(2,1)
-- ============================================================================

-- Necesario para cambiar el tipo de retorno
DROP FUNCTION IF EXISTS buscar_unidades_alquiler(jsonb);

CREATE OR REPLACE FUNCTION buscar_unidades_alquiler(p_filtros jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (
    id INTEGER,
    nombre_edificio TEXT,
    nombre_proyecto TEXT,
    desarrollador TEXT,
    zona TEXT,
    dormitorios INTEGER,
    banos NUMERIC,
    area_m2 NUMERIC,
    precio_mensual_bob NUMERIC,
    precio_mensual_usd NUMERIC,
    amoblado TEXT,
    acepta_mascotas BOOLEAN,
    deposito_meses NUMERIC,
    servicios_incluidos JSONB,
    contrato_minimo_meses INTEGER,
    monto_expensas_bob NUMERIC,
    piso INTEGER,
    estacionamientos INTEGER,
    baulera BOOLEAN,
    latitud NUMERIC,
    longitud NUMERIC,
    fotos_urls TEXT[],
    fotos_count INTEGER,
    url TEXT,
    fuente TEXT,
    agente_nombre TEXT,
    agente_telefono TEXT,
    agente_whatsapp TEXT,
    dias_en_mercado INTEGER,
    estado_construccion TEXT,
    id_proyecto_master INTEGER,
    amenities_lista TEXT[],
    equipamiento_lista TEXT[],
    descripcion TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
    v_zonas_expandidas TEXT[];
    v_incluir_sin_zona BOOLEAN := false;
    v_dorm_lista INT[];
    v_dorm_exactos INT[];
    v_dorm_tiene_3plus BOOLEAN := false;
BEGIN
    -- Expandir microzonas UI → zonas BD
    IF p_filtros->'zonas_permitidas' IS NOT NULL
       AND jsonb_array_length(p_filtros->'zonas_permitidas') > 0 THEN
        SELECT ARRAY_AGG(DISTINCT zona_bd) INTO v_zonas_expandidas
        FROM (
            SELECT jsonb_array_elements_text(p_filtros->'zonas_permitidas') AS zona_ui
        ) ui
        CROSS JOIN LATERAL (
            SELECT unnest(
                CASE zona_ui
                    WHEN 'equipetrol_centro'    THEN ARRAY['Equipetrol', 'Equipetrol Centro']
                    WHEN 'equipetrol_norte'     THEN ARRAY['Equipetrol Norte', 'Equipetrol Norte/Norte', 'Equipetrol Norte/Sur']
                    WHEN 'sirari'               THEN ARRAY['Sirari']
                    WHEN 'villa_brigida'        THEN ARRAY['Villa Brigida']
                    WHEN 'equipetrol_oeste'     THEN ARRAY['Faremafu']
                    WHEN 'equipetrol_3er_anillo' THEN ARRAY['Equipetrol Franja']
                    WHEN 'sin_zona'             THEN ARRAY['Sin zona', 'sin zona']
                    ELSE ARRAY[zona_ui]
                END
            ) AS zona_bd
        ) expanded;

        IF p_filtros->'zonas_permitidas' @> '"sin_zona"'::jsonb THEN
            v_incluir_sin_zona := true;
        END IF;
    END IF;

    -- Parse dormitorios_lista if provided
    IF p_filtros->'dormitorios_lista' IS NOT NULL
       AND jsonb_typeof(p_filtros->'dormitorios_lista') = 'array'
       AND jsonb_array_length(p_filtros->'dormitorios_lista') > 0 THEN
        SELECT ARRAY_AGG((e)::int)
        INTO v_dorm_lista
        FROM jsonb_array_elements_text(p_filtros->'dormitorios_lista') AS e;

        SELECT ARRAY_AGG(d) INTO v_dorm_exactos FROM unnest(v_dorm_lista) d WHERE d < 3;
        v_dorm_tiene_3plus := 3 = ANY(v_dorm_lista);
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.nombre_edificio::TEXT,
        pm.nombre_oficial::TEXT,
        COALESCE(pm.desarrollador, '')::TEXT,
        COALESCE(pm.zona, p.zona)::TEXT,
        p.dormitorios,
        p.banos,
        p.area_total_m2,
        p.precio_mensual_bob,
        p.precio_mensual_usd,
        p.amoblado::TEXT,
        p.acepta_mascotas,
        p.deposito_meses,
        p.servicios_incluidos,
        p.contrato_minimo_meses,
        p.monto_expensas_bob,
        p.piso,
        p.estacionamientos::INTEGER,
        p.baulera,
        p.latitud,
        p.longitud,

        -- Fotos
        CASE
            WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
                AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
            THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'contenido'->'fotos_urls'))
            WHEN p.fuente = 'remax'
                AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
            THEN ARRAY[p.datos_json_discovery->'default_imagen'->>'url']
            WHEN p.fuente = 'century21'
                AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
                AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0
            THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json_discovery->'fotos'->'propiedadThumbnail'))
            ELSE ARRAY[]::TEXT[]
        END,

        -- Fotos count
        CASE
            WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
                AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
            THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')
            WHEN p.fuente = 'remax'
                AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
            THEN 1
            WHEN p.fuente = 'century21'
                AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
            THEN jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail')
            ELSE 0
        END::INTEGER,

        p.url::TEXT,
        p.fuente::TEXT,

        -- Agente
        (p.datos_json->'agente'->>'nombre')::TEXT,
        (p.datos_json->'agente'->>'telefono')::TEXT,
        COALESCE(
            p.datos_json->'agente'->>'whatsapp',
            p.datos_json_discovery->>'whatsapp'
        )::TEXT,

        -- Días en mercado
        (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date))::INTEGER,

        COALESCE(p.estado_construccion::TEXT, 'no_especificado'),
        p.id_proyecto_master,

        -- Amenities
        CASE
            WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
                AND jsonb_array_length(p.datos_json->'amenities'->'lista') > 0
            THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                  FROM jsonb_array_elements_text(p.datos_json->'amenities'->'lista') AS elem)
            WHEN jsonb_typeof(pm.amenidades_edificio) = 'array'
                AND jsonb_array_length(pm.amenidades_edificio) > 0
            THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                  FROM jsonb_array_elements_text(pm.amenidades_edificio) AS elem)
            ELSE NULL
        END::TEXT[],

        -- Equipamiento
        CASE
            WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento') = 'array'
                AND jsonb_array_length(p.datos_json->'amenities'->'equipamiento') > 0
            THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                  FROM jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento') AS elem)
            ELSE NULL
        END::TEXT[],

        -- Descripción
        COALESCE(
            p.datos_json_enrichment->>'descripcion',
            p.datos_json_discovery->>'descripcion',
            p.datos_json->'contenido'->>'descripcion'
        )::TEXT

    FROM propiedades_v2 p
    LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master

    WHERE p.es_activa = true
      AND p.status IN ('completado', 'actualizado')
      AND p.tipo_operacion = 'alquiler'
      AND p.duplicado_de IS NULL
      AND p.area_total_m2 >= 20
      AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
      AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
      -- Filtro: precio mensual
      AND (
          p_filtros->>'precio_mensual_max' IS NULL
          OR p.precio_mensual_bob <= (p_filtros->>'precio_mensual_max')::numeric
      )
      AND (
          p_filtros->>'precio_mensual_min' IS NULL
          OR p.precio_mensual_bob >= (p_filtros->>'precio_mensual_min')::numeric
      )
      -- Filtro: dormitorios
      AND (
          CASE
              WHEN v_dorm_lista IS NOT NULL THEN (
                  (v_dorm_exactos IS NOT NULL AND p.dormitorios = ANY(v_dorm_exactos))
                  OR (v_dorm_tiene_3plus AND p.dormitorios >= 3)
              )
              WHEN p_filtros->>'dormitorios' IS NOT NULL THEN (
                  p.dormitorios = (p_filtros->>'dormitorios')::int
                  OR p.dormitorios IS NULL
              )
              WHEN p_filtros->>'dormitorios_min' IS NOT NULL THEN (
                  p.dormitorios >= (p_filtros->>'dormitorios_min')::int
              )
              ELSE true
          END
      )
      -- Filtro: amoblado
      AND (
          (p_filtros->>'amoblado')::boolean IS NOT TRUE
          OR p.amoblado IN ('si', 'semi')
      )
      -- Filtro: mascotas
      AND (
          (p_filtros->>'acepta_mascotas')::boolean IS NOT TRUE
          OR p.acepta_mascotas = true
      )
      -- Filtro: con parqueo
      AND (
          (p_filtros->>'con_parqueo')::boolean IS NOT TRUE
          OR (p.estacionamientos IS NOT NULL AND p.estacionamientos > 0)
      )
      -- Filtro: zonas
      AND (
          v_zonas_expandidas IS NULL
          OR COALESCE(pm.zona, p.zona) = ANY(v_zonas_expandidas)
          OR (v_incluir_sin_zona AND COALESCE(pm.zona, p.zona) IS NULL)
      )
      -- Filtro: solo con fotos
      AND (
          (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
          OR (
              (jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
              AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0)
              OR (p.fuente = 'remax'
                  AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL)
              OR (p.fuente = 'century21'
                  AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
                  AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0)
          )
      )
      -- Filtro: precio no nulo
      AND p.precio_mensual_bob IS NOT NULL

    ORDER BY
        CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN p.precio_mensual_bob END DESC NULLS LAST,
        CASE WHEN p_filtros->>'orden' = 'precio_asc' THEN p.precio_mensual_bob END ASC NULLS LAST,
        CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'recientes'
             THEN COALESCE(p.fecha_publicacion, p.fecha_discovery::date) END DESC NULLS LAST,
        p.id DESC
    LIMIT COALESCE((p_filtros->>'limite')::int, 50);
END;
$$;

GRANT EXECUTE ON FUNCTION buscar_unidades_alquiler TO anon;
GRANT EXECUTE ON FUNCTION buscar_unidades_alquiler TO authenticated;
