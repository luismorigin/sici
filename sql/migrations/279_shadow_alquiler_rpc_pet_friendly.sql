-- =============================================================================
-- Migración 279 (SHADOW) — RPC feed alquiler: chip pet_friendly del EDIFICIO
-- -----------------------------------------------------------------------------
-- Sigue a mig 278 (columna proyectos_master.pet_friendly derivada por edificio).
-- Este mig re-crea buscar_unidades_alquiler_shadow con 2 cambios:
--   1. + columna `pet_friendly boolean` al final del RETURNS TABLE (de pm.pet_friendly,
--      el edificio; ya se joinea proyectos_master). El front lo muestra como CHIP.
--   2. Saca "Pet Friendly" de `amenities_lista` en la salida (deja de ser una
--      amenidad más → ahora es el chip dedicado; la lógica vive en la RPC, no en
--      cada frontend).
-- Cambiar el RETURNS TABLE exige DROP + CREATE. Base = def de mig 276, intacta
-- salvo esos 2 cambios. AISLADA de venta.
--
-- ⚠️ Aplicar vía Supabase UI o psql (NO desde MCP readonly). Rollback al final.
--   Registrar en docs/migrations/MIGRATION_INDEX.md.
-- =============================================================================

DROP FUNCTION IF EXISTS public.buscar_unidades_alquiler_shadow(jsonb);

CREATE FUNCTION public.buscar_unidades_alquiler_shadow(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id integer, nombre_edificio text, nombre_proyecto text, desarrollador text, zona text, dormitorios integer, banos numeric, area_m2 numeric, precio_mensual_bob numeric, precio_mensual_usd numeric, amoblado text, acepta_mascotas boolean, deposito_meses numeric, servicios_incluidos jsonb, contrato_minimo_meses integer, monto_expensas_bob numeric, piso integer, estacionamientos integer, baulera boolean, latitud numeric, longitud numeric, fotos_urls text[], fotos_count integer, url text, fuente text, agente_nombre text, agente_telefono text, agente_whatsapp text, dias_en_mercado integer, estado_construccion text, id_proyecto_master integer, amenities_lista text[], equipamiento_lista text[], descripcion text, equipado boolean, uso_inmueble text, expensas_incluidas boolean, amenities_extra text[], equipamiento_otros text[], pet_friendly boolean)
 LANGUAGE plpgsql
 STABLE
AS $function$
  DECLARE
      v_zonas_expandidas TEXT[];
      v_incluir_sin_zona BOOLEAN := false;
      v_dorm_lista INT[];
      v_dorm_exactos INT[];
      v_dorm_tiene_3plus BOOLEAN := false;
      v_paralelo NUMERIC;   -- Binance vivo, leído una vez (deriva el Bs de los avisos en USD)
  BEGIN
      SELECT cg.valor::numeric INTO v_paralelo
      FROM config_global cg
      WHERE cg.clave = 'tipo_cambio_paralelo' AND cg.activo
      LIMIT 1;

      IF p_filtros->'zonas_permitidas' IS NOT NULL
         AND jsonb_array_length(p_filtros->'zonas_permitidas') > 0 THEN
          SELECT ARRAY_AGG(DISTINCT zona_bd) INTO v_zonas_expandidas
          FROM (
              SELECT jsonb_array_elements_text(p_filtros->'zonas_permitidas') AS zona_ui
          ) ui
          CROSS JOIN LATERAL (
              SELECT unnest(
                  CASE zona_ui
                      WHEN 'equipetrol_centro'    THEN ARRAY['Equipetrol Centro', 'Equipetrol', 'Equipetrol Centro']
                      WHEN 'equipetrol_norte'     THEN ARRAY['Equipetrol Norte', 'Equipetrol Norte/Norte', 'Equipetrol Norte/Sur']
                      WHEN 'sirari'               THEN ARRAY['Sirari']
                      WHEN 'villa_brigida'        THEN ARRAY['Villa Brigida']
                      WHEN 'equipetrol_oeste'     THEN ARRAY['Equipetrol Oeste', 'Faremafu']
                      WHEN 'equipetrol_3er_anillo' THEN ARRAY['Eq. 3er Anillo', 'Equipetrol Franja']
                      WHEN 'sin_zona'             THEN ARRAY['Sin zona', 'sin zona']
                      ELSE ARRAY[zona_ui]
                  END
              ) AS zona_bd
          ) expanded;

          IF p_filtros->'zonas_permitidas' @> '"sin_zona"'::jsonb THEN
              v_incluir_sin_zona := true;
          END IF;
      END IF;

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
          COALESCE(p.precio_mensual_bob, ROUND(p.precio_mensual_usd * v_paralelo, 2)),
          public.precio_normalizado_alquiler(p.precio_mensual_bob, p.precio_mensual_usd, p.tipo_cambio_detectado::text),
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

          CASE
              WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
                  AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json->'contenido'->'fotos_urls'))
              WHEN jsonb_typeof(p.datos_json_enrichment->'llm_output'->'fotos_urls') = 'array'
                  AND jsonb_array_length(p.datos_json_enrichment->'llm_output'->'fotos_urls') > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json_enrichment->'llm_output'->'fotos_urls'))
              WHEN p.fuente = 'remax'
                  AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
              THEN ARRAY[p.datos_json_discovery->'default_imagen'->>'url']
              WHEN p.fuente = 'century21'
                  AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
                  AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0
              THEN ARRAY(SELECT jsonb_array_elements_text(p.datos_json_discovery->'fotos'->'propiedadThumbnail'))
              WHEN p.fuente = 'bien_inmuebles'
                  AND p.datos_json_discovery->>'nomb_img' IS NOT NULL
                  AND p.datos_json_discovery->>'nomb_img' != ''
              THEN ARRAY['https://www.bieninmuebles.com.bo/admin/uploads/catalogo/pics/' || (p.datos_json_discovery->>'nomb_img')]
              ELSE ARRAY[]::TEXT[]
          END,

          CASE
              WHEN jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
                  AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0
              THEN jsonb_array_length(p.datos_json->'contenido'->'fotos_urls')
              WHEN jsonb_typeof(p.datos_json_enrichment->'llm_output'->'fotos_urls') = 'array'
                  AND jsonb_array_length(p.datos_json_enrichment->'llm_output'->'fotos_urls') > 0
              THEN jsonb_array_length(p.datos_json_enrichment->'llm_output'->'fotos_urls')
              WHEN p.fuente = 'remax'
                  AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL
              THEN 1
              WHEN p.fuente = 'century21'
                  AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
              THEN jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail')
              WHEN p.fuente = 'bien_inmuebles'
                  AND p.datos_json_discovery->>'nomb_img' IS NOT NULL
                  AND p.datos_json_discovery->>'nomb_img' != ''
              THEN 1
              ELSE 0
          END::INTEGER,

          p.url::TEXT,
          p.fuente::TEXT,

          COALESCE(
              p.datos_json_enrichment->'llm_output'->>'agente_nombre',
              p.datos_json->'agente'->>'nombre',
              p.datos_json_discovery->'agent'->'user'->>'name_to_show',
              p.datos_json_discovery->>'amigo_clie',
              p.datos_json_discovery->>'asesorNombre'
          )::TEXT,

          COALESCE(
              p.datos_json_enrichment->'llm_output'->>'agente_telefono',
              p.datos_json->'agente'->>'telefono',
              p.datos_json_discovery->>'telefono'
          )::TEXT,

          COALESCE(
              p.datos_json->'agente'->>'whatsapp',
              p.datos_json_discovery->>'whatsapp',
              p.datos_json_enrichment->'llm_output'->>'agente_telefono',
              p.datos_json->'agente'->>'telefono',
              p.datos_json_discovery->>'telefono'
          )::TEXT,

          (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_creacion::date))::INTEGER,

          COALESCE(p.estado_construccion::TEXT, 'no_especificado'),
          p.id_proyecto_master,

          CASE
              WHEN jsonb_typeof(p.datos_json->'amenities'->'lista') = 'array'
                  AND jsonb_array_length(p.datos_json->'amenities'->'lista') > 0
              THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                    FROM jsonb_array_elements_text(p.datos_json->'amenities'->'lista') AS elem
                    WHERE elem <> 'Pet Friendly')   -- v279: Pet Friendly = chip propio (pet_friendly), NO amenidad
              WHEN jsonb_typeof(pm.amenidades_edificio) = 'array'
                  AND jsonb_array_length(pm.amenidades_edificio) > 0
              THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                    FROM jsonb_array_elements_text(pm.amenidades_edificio) AS elem
                    WHERE elem <> 'Pet Friendly')
              ELSE NULL
          END::TEXT[],

          CASE
              WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento') = 'array'
                  AND jsonb_array_length(p.datos_json->'amenities'->'equipamiento') > 0
              THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                    FROM jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento') AS elem)
              ELSE NULL
          END::TEXT[],

          COALESCE(
              p.datos_json_enrichment->>'descripcion',
              p.datos_json_enrichment->'llm_output'->>'descripcion_limpia',
              p.datos_json_discovery->>'descripcion',
              p.datos_json->'contenido'->>'descripcion'
          )::TEXT,

          -- ── v276: campos nuevos para el frontend (todos de datos_json ya canonicalizado) ──
          (p.datos_json->>'equipado')::boolean,                          -- flag electrodomésticos (true/null)
          p.datos_json->>'uso_inmueble',                                 -- residencial | mixto (filtro, no exclusión)
          (p.datos_json->>'expensas_incluidas')::boolean,               -- true si el texto dice "incluye expensas" (null = no sabemos)
          CASE
              WHEN jsonb_typeof(p.datos_json->'amenities'->'extra') = 'array'
                  AND jsonb_array_length(p.datos_json->'amenities'->'extra') > 0
              THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                    FROM jsonb_array_elements_text(p.datos_json->'amenities'->'extra') AS elem)
              ELSE NULL
          END::TEXT[],                                                    -- cola de amenidades del edificio (no canónicas)
          CASE
              WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento_otros') = 'array'
                  AND jsonb_array_length(p.datos_json->'amenities'->'equipamiento_otros') > 0
              THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                    FROM jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento_otros') AS elem)
              ELSE NULL
          END::TEXT[],                                                    -- cola de equipamiento de unidad (no canónico)

          COALESCE(pm.pet_friendly, false)                                -- v279: chip pet-friendly del EDIFICIO (derivado, mig 278)

      FROM propiedades_v2_shadow p
      LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master

      WHERE p.es_activa = true
        AND p.status IN ('completado', 'actualizado')
        AND p.tipo_operacion = 'alquiler'
        AND p.duplicado_de IS NULL
        AND p.area_total_m2 >= 20
        AND COALESCE(p.tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')
        AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
        AND (
          p_filtros->'ids' IS NULL
          OR p.id = ANY(ARRAY(SELECT (jsonb_array_elements_text(p_filtros->'ids'))::int))
        )
        AND (
            p_filtros->>'precio_mensual_max' IS NULL
            OR COALESCE(p.precio_mensual_bob, ROUND(p.precio_mensual_usd * v_paralelo, 2)) <= (p_filtros->>'precio_mensual_max')::numeric
        )
        AND (
            p_filtros->>'precio_mensual_min' IS NULL
            OR COALESCE(p.precio_mensual_bob, ROUND(p.precio_mensual_usd * v_paralelo, 2)) >= (p_filtros->>'precio_mensual_min')::numeric
        )
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
        AND (
            (p_filtros->>'amoblado')::boolean IS NOT TRUE
            OR p.amoblado IN ('si', 'semi')
        )
        AND (
            (p_filtros->>'acepta_mascotas')::boolean IS NOT TRUE
            OR p.acepta_mascotas IS NOT FALSE
        )
        AND (
            (p_filtros->>'con_parqueo')::boolean IS NOT TRUE
            OR (p.estacionamientos IS NOT NULL AND p.estacionamientos > 0)
        )
        AND (
            v_zonas_expandidas IS NULL
            OR COALESCE(pm.zona, p.zona) = ANY(v_zonas_expandidas)
            OR (v_incluir_sin_zona AND COALESCE(pm.zona, p.zona) IS NULL)
        )
        AND (
            (p_filtros->>'solo_con_fotos')::boolean IS NOT TRUE
            OR (
                (jsonb_typeof(p.datos_json->'contenido'->'fotos_urls') = 'array'
                AND jsonb_array_length(p.datos_json->'contenido'->'fotos_urls') > 0)
                OR (jsonb_typeof(p.datos_json_enrichment->'llm_output'->'fotos_urls') = 'array'
                    AND jsonb_array_length(p.datos_json_enrichment->'llm_output'->'fotos_urls') > 0)
                OR (p.fuente = 'remax'
                    AND p.datos_json_discovery->'default_imagen'->>'url' IS NOT NULL)
                OR (p.fuente = 'century21'
                    AND jsonb_typeof(p.datos_json_discovery->'fotos'->'propiedadThumbnail') = 'array'
                    AND jsonb_array_length(p.datos_json_discovery->'fotos'->'propiedadThumbnail') > 0)
                OR (p.fuente = 'bien_inmuebles'
                    AND p.datos_json_discovery->>'nomb_img' IS NOT NULL
                    AND p.datos_json_discovery->>'nomb_img' != '')
            )
        )
        AND CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_creacion::date) <= 150
        AND public.precio_normalizado_alquiler(p.precio_mensual_bob, p.precio_mensual_usd, p.tipo_cambio_detectado::text) > 0
        AND (
            p_filtros->>'proyecto' IS NULL
            OR p.nombre_edificio ILIKE '%' || (p_filtros->>'proyecto') || '%'
            OR pm.nombre_oficial ILIKE '%' || (p_filtros->>'proyecto') || '%'
        )

      ORDER BY
          CASE WHEN (p_filtros->>'acepta_mascotas')::boolean IS TRUE AND p.acepta_mascotas = true THEN 0 ELSE 1 END,
          CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN COALESCE(p.precio_mensual_bob, ROUND(p.precio_mensual_usd * v_paralelo, 2)) END DESC NULLS LAST,
          CASE WHEN p_filtros->>'orden' = 'precio_asc' THEN COALESCE(p.precio_mensual_bob, ROUND(p.precio_mensual_usd * v_paralelo, 2)) END ASC NULLS LAST,
          CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'recientes'
               THEN COALESCE(p.fecha_publicacion, p.fecha_creacion::date) END DESC NULLS LAST,
          p.id DESC
      LIMIT COALESCE((p_filtros->>'limite')::int, 50)
      OFFSET COALESCE((p_filtros->>'offset')::int, 0);
  END;
$function$;

COMMENT ON FUNCTION public.buscar_unidades_alquiler_shadow(jsonb) IS
  'RPC feed alquiler SHADOW (mig 275 + 276). Clon de buscar_unidades_alquiler sobre '
  'propiedades_v2_shadow. mig 276: + equipado, uso_inmueble, expensas_incluidas, '
  'amenities_extra, equipamiento_otros (append al final del RETURNS TABLE). Aislada de venta.';

GRANT EXECUTE ON FUNCTION public.buscar_unidades_alquiler_shadow(jsonb) TO service_role, claude_readonly;
-- (deliberadamente SIN anon / authenticated → invisible al Data API público)

-- =============================================================================
-- VERIFICACIÓN (tras aplicar):
--   SELECT id, pet_friendly, amenities_lista
--   FROM public.buscar_unidades_alquiler_shadow('{}'::jsonb)
--   WHERE pet_friendly LIMIT 5;   -- pet_friendly=true y 'Pet Friendly' NO debe estar en amenities_lista
-- =============================================================================
-- ROLLBACK (vuelve a la firma de mig 276, sin pet_friendly):
--   DROP FUNCTION IF EXISTS public.buscar_unidades_alquiler_shadow(jsonb);
--   -- y re-aplicar mig 276.
-- =============================================================================
