-- ============================================================================
-- Migración 221: Casas y Terrenos — Schema + Matching filter
-- Fecha: 2026-04-17
-- PRD: docs/backlog/CASAS_TERRENOS_PRD.md (Fase 1)
-- ============================================================================
-- Agrega columnas para terrenos (area_terreno, frente, fondo) y filtra
-- casas/terrenos del matching (solo departamentos/penthouses se matchean
-- contra proyectos_master).
-- ============================================================================

-- ============================================================================
-- PARTE 1: Nuevas columnas en propiedades_v2
-- ============================================================================

ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS area_terreno_m2 NUMERIC;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS frente_m NUMERIC;
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS fondo_m NUMERIC;

COMMENT ON COLUMN propiedades_v2.area_terreno_m2 IS 'Área del terreno en m2 (casas y terrenos). Para deptos = NULL';
COMMENT ON COLUMN propiedades_v2.frente_m IS 'Metros de frente del terreno';
COMMENT ON COLUMN propiedades_v2.fondo_m IS 'Metros de fondo del terreno';

-- ============================================================================
-- PARTE 2: Filtro matching — skipear casas/terrenos en las 5 sub-funciones
-- ============================================================================
-- Criterio: LOWER(tipo_propiedad_original) NOT IN ('casa', 'terreno', 'lote')
-- Esto preserva el comportamiento actual (1395 deptos/penthouses) y excluye
-- los nuevos tipos que no tienen proyectos_master asociados.
-- ============================================================================

-- 2.1 generar_matches_por_nombre
CREATE OR REPLACE FUNCTION public.generar_matches_por_nombre()
 RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, metodo text)
 LANGUAGE plpgsql
AS $function$
  BEGIN
      RETURN QUERY
      WITH propiedades_con_nombre AS (
          SELECT
              p.id,
              COALESCE(
                  NULLIF(TRIM(p.nombre_edificio), ''),
                  TRIM(p.datos_json_enrichment->>'nombre_edificio'),
                  TRIM(p.datos_json->'proyecto'->>'nombre_edificio')
              ) as nombre_busqueda
          FROM propiedades_v2 p
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
      )
      SELECT
          pcn.id,
          pm.id_proyecto_master,
          95 as confianza,
          'nombre_exacto'::text as metodo
      FROM propiedades_con_nombre pcn
      JOIN proyectos_master pm
          ON LOWER(pcn.nombre_busqueda) = LOWER(TRIM(pm.nombre_oficial))
          OR LOWER(pcn.nombre_busqueda) = ANY(
              SELECT LOWER(TRIM(a)) FROM unnest(pm.alias_conocidos) a
          )
      WHERE pcn.nombre_busqueda IS NOT NULL
        AND LENGTH(pcn.nombre_busqueda) > 3;
  END;
  $function$;

-- 2.2 generar_matches_por_url
CREATE OR REPLACE FUNCTION public.generar_matches_por_url()
 RETURNS TABLE(matches_insertados integer, matches_duplicados integer, matches_alta_confianza integer, matches_media_confianza integer)
 LANGUAGE plpgsql
AS $function$
  DECLARE
      v_inserted INTEGER := 0;
      v_duplicated INTEGER := 0;
      v_alta INTEGER := 0;
      v_media INTEGER := 0;
  BEGIN
      WITH slugs_extraidos AS (
          SELECT
              p.id,
              (regexp_match(p.url, 'propiedad/\d+_([a-z0-9-]+)', 'i'))[1] as slug
          FROM propiedades_v2 p
          WHERE p.fuente = 'century21'
            AND p.id_proyecto_master IS NULL
            AND p.url IS NOT NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = true
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
            AND (p.campos_bloqueados IS NULL
                 OR NOT (p.campos_bloqueados::jsonb ? 'id_proyecto_master'))
      ),
      matches_encontrados AS (
          SELECT DISTINCT ON (s.id)
              s.id as propiedad_id,
              pm.id_proyecto_master,
              pm.nombre_oficial,
              CASE
                  WHEN LENGTH(pm.nombre_oficial) >= 6
                       AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)')
                  THEN 90
                  WHEN LENGTH(pm.nombre_oficial) >= 4
                       AND (s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '%')
                            OR s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '') || '%'))
                  THEN 85
                  ELSE 0
              END as confianza
          FROM slugs_extraidos s
          CROSS JOIN proyectos_master pm
          WHERE
              (LENGTH(pm.nombre_oficial) >= 6
               AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)'))
              OR
              (LENGTH(pm.nombre_oficial) >= 4
               AND (s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '%')
                    OR s.slug ILIKE ('%' || REPLACE(LOWER(pm.nombre_oficial), ' ', '') || '%')))
          ORDER BY s.id,
                   CASE
                       WHEN LENGTH(pm.nombre_oficial) >= 6
                            AND s.slug ~* ('(^|-)' || REPLACE(LOWER(pm.nombre_oficial), ' ', '-') || '(-|$)')
                       THEN 1 ELSE 2
                   END,
                   LENGTH(pm.nombre_oficial) DESC
      ),
      stats AS (
          SELECT
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE confianza = 90) as alta,
              COUNT(*) FILTER (WHERE confianza = 85) as media
          FROM matches_encontrados
          WHERE confianza > 0
      ),
      inserted AS (
          INSERT INTO matching_sugerencias (
              propiedad_id,
              proyecto_master_sugerido,
              metodo_matching,
              score_confianza,
              estado
          )
          SELECT
              me.propiedad_id,
              me.id_proyecto_master,
              'url_slug_parcial',
              me.confianza,
              'pendiente'
          FROM matches_encontrados me
          WHERE me.confianza > 0
          ON CONFLICT (propiedad_id, proyecto_master_sugerido, metodo_matching)
          DO NOTHING
          RETURNING *
      )
      SELECT
          (SELECT COUNT(*) FROM inserted)::INTEGER,
          (SELECT total FROM stats)::INTEGER - (SELECT COUNT(*) FROM inserted)::INTEGER,
          (SELECT alta FROM stats)::INTEGER,
          (SELECT media FROM stats)::INTEGER
      INTO v_inserted, v_duplicated, v_alta, v_media;

      RETURN QUERY SELECT v_inserted, v_duplicated, v_alta, v_media;
  END;
  $function$;

-- 2.3 generar_matches_fuzzy
CREATE OR REPLACE FUNCTION public.generar_matches_fuzzy()
 RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, metodo text, similitud_porcentaje integer, uso_gps_desempate boolean)
 LANGUAGE plpgsql
AS $function$
  BEGIN
      RETURN QUERY
      WITH propiedades_con_nombre AS (
          SELECT
              p.id,
              COALESCE(
                  NULLIF(TRIM(p.nombre_edificio), ''),
                  TRIM(p.datos_json_enrichment->>'nombre_edificio'),
                  TRIM(p.datos_json->'proyecto'->>'nombre_edificio')
              ) as nombre_busqueda,
              p.latitud,
              p.longitud,
              p.zona
          FROM propiedades_v2 p
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = true
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
            AND (p.campos_bloqueados IS NULL
                 OR NOT (p.campos_bloqueados::jsonb ? 'id_proyecto_master'))
      ),
      palabras_propiedades AS (
          SELECT
              pcn.id as prop_id,
              pcn.nombre_busqueda,
              pcn.latitud,
              pcn.longitud,
              pcn.zona,
              array_agg(DISTINCT word) FILTER (WHERE LENGTH(word) >= 4) as palabras
          FROM propiedades_con_nombre pcn,
          LATERAL regexp_split_to_table(LOWER(pcn.nombre_busqueda), '\s+') as word
          WHERE pcn.nombre_busqueda IS NOT NULL
            AND LENGTH(pcn.nombre_busqueda) > 5
          GROUP BY pcn.id, pcn.nombre_busqueda, pcn.latitud, pcn.longitud, pcn.zona
      ),
      palabras_proyectos AS (
          SELECT
              pm.id_proyecto_master as proy_id,
              pm.nombre_oficial,
              pm.latitud,
              pm.longitud,
              pm.zona,
              array_agg(DISTINCT word) FILTER (WHERE LENGTH(word) >= 4) as palabras
          FROM proyectos_master pm,
          LATERAL regexp_split_to_table(LOWER(pm.nombre_oficial), '\s+') as word
          WHERE pm.activo = TRUE
          GROUP BY pm.id_proyecto_master, pm.nombre_oficial, pm.latitud, pm.longitud, pm.zona
      ),
      similitudes AS (
          SELECT
              pp.prop_id,
              ppm.proy_id,
              (SELECT COUNT(*) FROM unnest(pp.palabras) palabra
               WHERE palabra = ANY(ppm.palabras)) as palabras_comunes,
              array_length(ppm.palabras, 1) as total_palabras_proyecto,
              CASE
                  WHEN array_length(ppm.palabras, 1) > 0 THEN
                      ROUND(100.0 * (
                          SELECT COUNT(*) FROM unnest(pp.palabras) palabra
                          WHERE palabra = ANY(ppm.palabras)
                      ) / array_length(ppm.palabras, 1))
                  ELSE 0
              END as similitud,
              (6371000 * acos(
                  cos(radians(pp.latitud::numeric)) *
                  cos(radians(ppm.latitud::numeric)) *
                  cos(radians(ppm.longitud::numeric) - radians(pp.longitud::numeric)) +
                  sin(radians(pp.latitud::numeric)) *
                  sin(radians(ppm.latitud::numeric))
              ))::int as distancia_gps
          FROM palabras_propiedades pp
          CROSS JOIN palabras_proyectos ppm
          WHERE pp.zona = ppm.zona
            AND EXISTS (
                SELECT 1 FROM unnest(pp.palabras) palabra
                WHERE palabra = ANY(ppm.palabras)
            )
      ),
      ranked_matches AS (
          SELECT
              s.prop_id,
              s.proy_id,
              s.similitud,
              s.distancia_gps,
              s.palabras_comunes,
              s.total_palabras_proyecto,
              ROW_NUMBER() OVER (PARTITION BY s.prop_id ORDER BY s.similitud DESC, s.distancia_gps ASC) as rank,
              COUNT(*) OVER (PARTITION BY s.prop_id) as total_matches
          FROM similitudes s
          WHERE s.similitud >= 70
      )
      SELECT
          rm.prop_id,
          rm.proy_id,
          CASE
              WHEN rm.similitud = 100 AND rm.total_palabras_proyecto >= 2 THEN 90
              WHEN rm.similitud >= 90 THEN 85
              WHEN rm.similitud >= 80 THEN 80
              ELSE 75
          END as confianza,
          'fuzzy_nombre'::TEXT,
          rm.similitud::INT,
          (rm.total_matches > 1) as uso_gps_desempate
      FROM ranked_matches rm
      WHERE rm.rank = 1;
  END;
  $function$;

-- 2.4 generar_matches_trigram
CREATE OR REPLACE FUNCTION public.generar_matches_trigram()
 RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, metodo text, nombre_extraido text, score_trigram numeric)
 LANGUAGE plpgsql
 STABLE
AS $function$
  BEGIN
      RETURN QUERY
      WITH propiedades_sin_match AS (
          SELECT
              p.id,
              COALESCE(
                  NULLIF(TRIM(p.nombre_edificio), ''),
                  NULLIF(TRIM(p.datos_json->'proyecto'->>'nombre_edificio'), ''),
                  extraer_nombre_de_descripcion(p.datos_json->'contenido'->>'descripcion')
              ) as nombre_para_buscar,
              p.zona
          FROM propiedades_v2 p
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = true
            AND p.tipo_operacion = 'venta'
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
            AND (p.campos_bloqueados IS NULL
                 OR NOT (p.campos_bloqueados ? 'id_proyecto_master'))
      ),
      matches_encontrados AS (
          SELECT DISTINCT ON (psm.id)
              psm.id as prop_id,
              psm.nombre_para_buscar,
              bpf.id_proyecto,
              bpf.nombre as nombre_proyecto,
              bpf.score,
              bpf.match_tipo
          FROM propiedades_sin_match psm
          CROSS JOIN LATERAL buscar_proyecto_fuzzy(psm.nombre_para_buscar, 0.4, 3) bpf
          WHERE psm.nombre_para_buscar IS NOT NULL
            AND LENGTH(psm.nombre_para_buscar) >= 3
          ORDER BY psm.id, bpf.score DESC
      )
      SELECT
          me.prop_id,
          me.id_proyecto,
          CASE
              WHEN me.score >= 0.95 THEN 95
              WHEN me.score >= 0.8 THEN 90
              WHEN me.score >= 0.6 THEN 80
              WHEN me.score >= 0.5 THEN 70
              ELSE 60
          END::INTEGER as confianza,
          'trigram_' || me.match_tipo,
          me.nombre_para_buscar,
          me.score
      FROM matches_encontrados me
      WHERE me.score >= 0.4;
  END;
  $function$;

-- 2.5 generar_matches_gps
CREATE OR REPLACE FUNCTION public.generar_matches_gps()
 RETURNS TABLE(propiedad_id integer, proyecto_sugerido integer, confianza integer, distancia_metros numeric, metodo text)
 LANGUAGE plpgsql
AS $function$
  BEGIN
      RETURN QUERY
      WITH
      gps_confiables AS (
          SELECT latitud, longitud
          FROM propiedades_v2
          WHERE latitud IS NOT NULL
            AND longitud IS NOT NULL
            AND latitud::text NOT LIKE '0.0%'
            AND longitud::text NOT LIKE '0.0%'
          GROUP BY latitud, longitud
          HAVING COUNT(*) <= 3
      ),
      distancias AS (
          SELECT
              p.id as prop_id,
              pm.id_proyecto_master as proy_id,
              pm.nombre_oficial as nombre_proyecto,
              (6371000 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                      cos(radians(p.latitud::numeric)) *
                      cos(radians(pm.latitud::numeric)) *
                      cos(radians(pm.longitud::numeric) - radians(p.longitud::numeric)) +
                      sin(radians(p.latitud::numeric)) *
                      sin(radians(pm.latitud::numeric))
                  ))
              ))::numeric as distancia
          FROM propiedades_v2 p
          JOIN gps_confiables gc
              ON p.latitud = gc.latitud
              AND p.longitud = gc.longitud
          JOIN proyectos_master pm
              ON pm.activo = TRUE
              AND pm.gps_verificado_google = TRUE
              AND p.zona = pm.zona
          WHERE p.id_proyecto_master IS NULL
            AND p.status IN ('completado', 'actualizado')
            AND p.es_para_matching = TRUE
            AND p.zona IS NOT NULL
            AND LOWER(COALESCE(p.tipo_propiedad_original, '')) NOT IN ('casa', 'terreno', 'lote')
      ),
      matches_cercanos AS (
          SELECT DISTINCT ON (prop_id)
              prop_id,
              proy_id,
              nombre_proyecto,
              distancia,
              CASE
                  WHEN distancia < 50 THEN 85
                  WHEN distancia < 100 THEN 80
                  WHEN distancia < 150 THEN 75
                  WHEN distancia < 200 THEN 70
                  WHEN distancia < 250 THEN 65
                  ELSE 60
              END as score
          FROM distancias
          WHERE distancia < 250
          ORDER BY prop_id, distancia ASC
      ),
      -- Contar proyectos vecinos a <100m del proyecto candidato
      vecinos AS (
          SELECT
              mc.proy_id,
              COUNT(*) as proyectos_cercanos
          FROM matches_cercanos mc
          JOIN proyectos_master pm_base ON pm_base.id_proyecto_master = mc.proy_id
          JOIN proyectos_master pm_vecino
              ON pm_vecino.activo = TRUE
              AND pm_vecino.id_proyecto_master != mc.proy_id
              AND pm_vecino.zona = pm_base.zona
              AND (6371000 * acos(
                  LEAST(1.0, GREATEST(-1.0,
                      cos(radians(pm_base.latitud::numeric)) *
                      cos(radians(pm_vecino.latitud::numeric)) *
                      cos(radians(pm_vecino.longitud::numeric) - radians(pm_base.longitud::numeric)) +
                      sin(radians(pm_base.latitud::numeric)) *
                      sin(radians(pm_vecino.latitud::numeric))
                  ))
              ))::numeric < 100
          GROUP BY mc.proy_id
      )
      SELECT
          mc.prop_id,
          mc.proy_id,
          -- Si hay vecinos a <100m, cap score a 70 (pendiente HITL)
          CASE
              WHEN COALESCE(v.proyectos_cercanos, 0) > 0 THEN LEAST(mc.score, 70)
              ELSE mc.score
          END,
          ROUND(mc.distancia, 1),
          'gps_verificado'::TEXT
      FROM matches_cercanos mc
      LEFT JOIN vecinos v ON v.proy_id = mc.proy_id
      WHERE NOT EXISTS (
          SELECT 1 FROM matching_sugerencias ms
          WHERE ms.propiedad_id = mc.prop_id
            AND ms.proyecto_master_sugerido = mc.proy_id
      );
  END;
  $function$;

-- ============================================================================
-- PARTE 3: registrar_discovery() — nuevo parámetro p_area_terreno_m2
-- ============================================================================
-- Parámetro DEFAULT NULL: callers existentes (5 workflows) no se rompen.
-- Solo los workflows nuevos de casas/terrenos pasan este valor.
-- IMPORTANTE: PARTE 1 (ALTER TABLE) debe ejecutarse ANTES que esto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_discovery(
    p_url character varying,
    p_fuente character varying,
    p_codigo_propiedad character varying DEFAULT NULL::character varying,
    p_tipo_operacion character varying DEFAULT NULL::character varying,
    p_tipo_propiedad_original text DEFAULT NULL::text,
    p_estado_construccion character varying DEFAULT NULL::character varying,
    p_precio_usd numeric DEFAULT NULL::numeric,
    p_precio_usd_original numeric DEFAULT NULL::numeric,
    p_moneda_original character varying DEFAULT NULL::character varying,
    p_area_total_m2 numeric DEFAULT NULL::numeric,
    p_dormitorios integer DEFAULT NULL::integer,
    p_banos numeric DEFAULT NULL::numeric,
    p_estacionamientos integer DEFAULT NULL::integer,
    p_latitud numeric DEFAULT NULL::numeric,
    p_longitud numeric DEFAULT NULL::numeric,
    p_fecha_publicacion date DEFAULT NULL::date,
    p_metodo_discovery character varying DEFAULT 'api_rest'::character varying,
    p_datos_json_discovery jsonb DEFAULT NULL::jsonb,
    p_area_terreno_m2 numeric DEFAULT NULL::numeric  -- NUEVO: Fase 1 casas/terrenos
)
 RETURNS TABLE(id integer, status estado_propiedad, es_nueva boolean, cambios_detectados jsonb)
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_id INTEGER;
    v_status_actual estado_propiedad;
    v_es_nueva BOOLEAN := FALSE;
    v_cambio_detectado BOOLEAN := FALSE;
    v_status_nuevo estado_propiedad;
    v_campos_bloqueados JSONB;
    v_discrepancias JSONB := '[]'::JSONB;

    v_precio_actual NUMERIC;
    v_area_actual NUMERIC;
    v_dormitorios_actual INTEGER;
    v_banos_actual NUMERIC;
BEGIN
    -- ========================================================================
    -- PASO 1: Verificar si existe (por url + fuente)
    -- ========================================================================
    SELECT
        pv.id,
        pv.status,
        pv.campos_bloqueados,
        pv.precio_usd,
        pv.area_total_m2,
        pv.dormitorios,
        pv.banos
    INTO
        v_id,
        v_status_actual,
        v_campos_bloqueados,
        v_precio_actual,
        v_area_actual,
        v_dormitorios_actual,
        v_banos_actual
    FROM propiedades_v2 pv
    WHERE pv.url = p_url AND pv.fuente = p_fuente;

    -- ========================================================================
    -- PASO 2: NUEVA PROPIEDAD (INSERT)
    -- ========================================================================
    IF v_id IS NULL THEN
        v_es_nueva := TRUE;

        INSERT INTO propiedades_v2 (
            url, fuente, codigo_propiedad,
            tipo_operacion, tipo_propiedad_original, estado_construccion,
            precio_usd, precio_usd_original, moneda_original,
            area_total_m2, dormitorios, banos, estacionamientos,
            latitud, longitud,
            datos_json_discovery, fecha_discovery, metodo_discovery,
            status, fecha_publicacion, fecha_creacion, fecha_actualizacion,
            es_activa, es_para_matching,
            area_terreno_m2
        )
        VALUES (
            p_url, p_fuente, p_codigo_propiedad,
            p_tipo_operacion::tipo_operacion_enum, p_tipo_propiedad_original,
            p_estado_construccion::estado_construccion_enum,
            p_precio_usd, p_precio_usd_original, p_moneda_original,
            p_area_total_m2, p_dormitorios, p_banos, p_estacionamientos,
            p_latitud, p_longitud,
            p_datos_json_discovery, NOW(), p_metodo_discovery,
            CASE
                WHEN p_tipo_operacion NOT IN ('venta') THEN 'excluido_operacion'::estado_propiedad
                ELSE 'nueva'::estado_propiedad
            END,
            p_fecha_publicacion, NOW(), NOW(),
            TRUE, TRUE,
            p_area_terreno_m2
        )
        RETURNING propiedades_v2.id INTO v_id;

        v_status_nuevo := CASE
            WHEN p_tipo_operacion NOT IN ('venta') THEN 'excluido_operacion'::estado_propiedad
            ELSE 'nueva'::estado_propiedad
        END;

    -- ========================================================================
    -- PASO 3: PROPIEDAD EXISTENTE (UPDATE)
    -- ========================================================================
    ELSE
        IF NOT _is_campo_bloqueado(v_campos_bloqueados, 'precio_usd') THEN
            IF v_precio_actual IS DISTINCT FROM p_precio_usd THEN
                v_cambio_detectado := TRUE;
                v_discrepancias := v_discrepancias || jsonb_build_array(
                    registrar_discrepancia_cambio('precio_usd', v_precio_actual, p_precio_usd)
                );
            END IF;
        END IF;

        IF NOT _is_campo_bloqueado(v_campos_bloqueados, 'area_total_m2') THEN
            IF v_area_actual IS DISTINCT FROM p_area_total_m2 THEN
                v_cambio_detectado := TRUE;
                v_discrepancias := v_discrepancias || jsonb_build_array(
                    registrar_discrepancia_cambio('area_total_m2', v_area_actual, p_area_total_m2)
                );
            END IF;
        END IF;

        IF NOT _is_campo_bloqueado(v_campos_bloqueados, 'dormitorios') THEN
            IF v_dormitorios_actual IS DISTINCT FROM p_dormitorios THEN
                v_cambio_detectado := TRUE;
                v_discrepancias := v_discrepancias || jsonb_build_array(
                    registrar_discrepancia_cambio('dormitorios', v_dormitorios_actual, p_dormitorios)
                );
            END IF;
        END IF;

        v_status_nuevo := determinar_status_post_discovery(
            v_id, v_status_actual, v_cambio_detectado
        );

        UPDATE propiedades_v2
        SET
            codigo_propiedad = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'codigo_propiedad')
                THEN codigo_propiedad
                ELSE COALESCE(p_codigo_propiedad, codigo_propiedad)
            END,
            tipo_operacion = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'tipo_operacion')
                THEN tipo_operacion
                ELSE COALESCE(p_tipo_operacion::tipo_operacion_enum, tipo_operacion)
            END,
            tipo_propiedad_original = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'tipo_propiedad_original')
                THEN tipo_propiedad_original
                ELSE COALESCE(p_tipo_propiedad_original, tipo_propiedad_original)
            END,
            estado_construccion = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'estado_construccion')
                THEN estado_construccion
                ELSE COALESCE(p_estado_construccion::estado_construccion_enum, estado_construccion)
            END,
            precio_usd = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'precio_usd')
                THEN precio_usd
                ELSE COALESCE(p_precio_usd, precio_usd)
            END,
            precio_usd_original = COALESCE(p_precio_usd_original, precio_usd_original),
            moneda_original = COALESCE(p_moneda_original, moneda_original),
            area_total_m2 = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'area_total_m2')
                THEN area_total_m2
                ELSE COALESCE(p_area_total_m2, area_total_m2)
            END,
            dormitorios = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'dormitorios')
                THEN dormitorios
                ELSE COALESCE(p_dormitorios, dormitorios)
            END,
            banos = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'banos')
                THEN banos
                ELSE COALESCE(p_banos, banos)
            END,
            estacionamientos = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'estacionamientos')
                THEN estacionamientos
                ELSE COALESCE(p_estacionamientos, estacionamientos)
            END,
            latitud = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'latitud')
                THEN latitud
                ELSE COALESCE(p_latitud, latitud)
            END,
            longitud = CASE
                WHEN _is_campo_bloqueado(campos_bloqueados, 'longitud')
                THEN longitud
                ELSE COALESCE(p_longitud, longitud)
            END,
            -- Terreno (NUEVO — sin candado, solo casas/terrenos lo usan)
            area_terreno_m2 = COALESCE(p_area_terreno_m2, area_terreno_m2),
            -- Discovery
            datos_json_discovery = p_datos_json_discovery,
            fecha_discovery = NOW(),
            metodo_discovery = p_metodo_discovery,
            status = v_status_nuevo,
            fecha_publicacion = COALESCE(p_fecha_publicacion, fecha_publicacion),
            fecha_actualizacion = NOW(),
            campos_conflicto = CASE
                WHEN jsonb_array_length(v_discrepancias) > 0
                THEN COALESCE(campos_conflicto, '[]'::JSONB) || v_discrepancias
                ELSE campos_conflicto
            END,
            es_activa = TRUE,
            depende_de_tc = CASE
                WHEN p_moneda_original != 'USD' THEN TRUE
                ELSE COALESCE(depende_de_tc, FALSE)
            END,
            primera_ausencia_at = NULL,
            razon_inactiva = NULL
        WHERE propiedades_v2.id = v_id;

    END IF;

    -- ========================================================================
    -- PASO 4: Retornar resultado
    -- ========================================================================
    RETURN QUERY
    SELECT v_id, v_status_nuevo, v_es_nueva, v_discrepancias;

END;
$function$;
