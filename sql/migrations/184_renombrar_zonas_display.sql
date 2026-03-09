-- ============================================================
-- Migración 184: Renombrar zonas a nombres display definitivos
-- Fecha: 2026-03-09
-- ============================================================
-- Contexto:
--   Los polígonos en zonas_geograficas usaban nombres internos (Faremafu,
--   Equipetrol Norte/Norte, etc.) que no coinciden con los nombres display.
--   Desde migración 171, p.zona = microzona (nombre crudo del polígono).
--   Esta migración unifica BD y display en un solo nombre canónico.
--
-- Renombres:
--   Faremafu              → Equipetrol Oeste
--   Equipetrol Norte/Norte → Equipetrol Norte  (se unifican)
--   Equipetrol Norte/Sur   → Equipetrol Norte  (se unifican)
--   Equipetrol             → Equipetrol Centro
--   Equipetrol Franja      → Eq. 3er Anillo
--   Sirari                 → (sin cambio)
--   Villa Brigida          → (sin cambio)
--
-- Orden de ejecución:
--   1. zonas_geograficas.nombre (fuente de verdad para triggers)
--   2. propiedades_v2.zona + microzona (retroactivo)
--   3. proyectos_master.zona (retroactivo)
--   4. buscar_unidades_alquiler() (mapeo slug → nombres nuevos)
--
-- Post-migración: actualizar zonas.ts y propiedad-constants.ts (ver comentarios al final)
-- ============================================================

-- ============================================================
-- PASO 1: Renombrar polígonos en zonas_geograficas
-- (los triggers leen de aquí, así que props nuevas ya usarán nombres nuevos)
-- ============================================================

UPDATE zonas_geograficas SET nombre = 'Equipetrol Centro' WHERE nombre = 'Equipetrol';
UPDATE zonas_geograficas SET nombre = 'Equipetrol Oeste' WHERE nombre = 'Faremafu';
UPDATE zonas_geograficas SET nombre = 'Equipetrol Norte' WHERE nombre = 'Equipetrol Norte/Norte';
UPDATE zonas_geograficas SET nombre = 'Equipetrol Norte' WHERE nombre = 'Equipetrol Norte/Sur';
UPDATE zonas_geograficas SET nombre = 'Eq. 3er Anillo' WHERE nombre = 'Equipetrol Franja';

-- ============================================================
-- PASO 2: Actualizar propiedades_v2.zona y microzona (retroactivo)
-- ============================================================

-- Equipetrol → Equipetrol Centro
UPDATE propiedades_v2 SET zona = 'Equipetrol Centro', microzona = 'Equipetrol Centro'
WHERE zona = 'Equipetrol';
UPDATE propiedades_v2 SET microzona = 'Equipetrol Centro'
WHERE microzona = 'Equipetrol' AND zona != 'Equipetrol Centro';

-- Faremafu → Equipetrol Oeste
UPDATE propiedades_v2 SET zona = 'Equipetrol Oeste', microzona = 'Equipetrol Oeste'
WHERE zona = 'Faremafu';
UPDATE propiedades_v2 SET microzona = 'Equipetrol Oeste'
WHERE microzona = 'Faremafu' AND zona != 'Equipetrol Oeste';

-- Equipetrol Norte/Norte → Equipetrol Norte
UPDATE propiedades_v2 SET zona = 'Equipetrol Norte', microzona = 'Equipetrol Norte'
WHERE zona = 'Equipetrol Norte/Norte';
UPDATE propiedades_v2 SET microzona = 'Equipetrol Norte'
WHERE microzona = 'Equipetrol Norte/Norte';

-- Equipetrol Norte/Sur → Equipetrol Norte
UPDATE propiedades_v2 SET zona = 'Equipetrol Norte', microzona = 'Equipetrol Norte'
WHERE zona = 'Equipetrol Norte/Sur';
UPDATE propiedades_v2 SET microzona = 'Equipetrol Norte'
WHERE microzona = 'Equipetrol Norte/Sur';

-- Equipetrol Franja → Eq. 3er Anillo
UPDATE propiedades_v2 SET zona = 'Eq. 3er Anillo', microzona = 'Eq. 3er Anillo'
WHERE zona = 'Equipetrol Franja';
UPDATE propiedades_v2 SET microzona = 'Eq. 3er Anillo'
WHERE microzona = 'Equipetrol Franja';

-- ============================================================
-- PASO 3: Actualizar proyectos_master.zona (retroactivo)
-- ============================================================

UPDATE proyectos_master SET zona = 'Equipetrol Centro' WHERE zona = 'Equipetrol';
UPDATE proyectos_master SET zona = 'Equipetrol Oeste' WHERE zona = 'Faremafu';
UPDATE proyectos_master SET zona = 'Equipetrol Norte' WHERE zona IN ('Equipetrol Norte/Norte', 'Equipetrol Norte/Sur', 'Equipetrol Norte');
UPDATE proyectos_master SET zona = 'Eq. 3er Anillo' WHERE zona = 'Equipetrol Franja';

-- ============================================================
-- PASO 4: Recrear buscar_unidades_alquiler() con nombres nuevos
-- ============================================================

CREATE OR REPLACE FUNCTION public.buscar_unidades_alquiler(p_filtros jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(id integer, nombre_edificio text, nombre_proyecto text, desarrollador text, zona text, dormitorios integer, banos numeric, area_m2 numeric, precio_mensual_bob numeric, precio_mensual_usd numeric, amoblado text, acepta_mascotas boolean, deposito_meses numeric, servicios_incluidos jsonb, contrato_minimo_meses integer, monto_expensas_bob numeric, piso integer, estacionamientos integer, baulera boolean, latitud numeric, longitud numeric, fotos_urls text[], fotos_count integer, url text, fuente text, agente_nombre text, agente_telefono text, agente_whatsapp text, dias_en_mercado integer, estado_construccion text, id_proyecto_master integer, amenities_lista text[], equipamiento_lista text[], descripcion text)
 LANGUAGE plpgsql
 STABLE
AS $function$
  DECLARE
      v_zonas_expandidas TEXT[];
      v_incluir_sin_zona BOOLEAN := false;
      v_dorm_lista INT[];
      v_dorm_exactos INT[];
      v_dorm_tiene_3plus BOOLEAN := false;
  BEGIN
      IF p_filtros->'zonas_permitidas' IS NOT NULL
         AND jsonb_array_length(p_filtros->'zonas_permitidas') > 0 THEN
          SELECT ARRAY_AGG(DISTINCT zona_bd) INTO v_zonas_expandidas
          FROM (
              SELECT jsonb_array_elements_text(p_filtros->'zonas_permitidas') AS zona_ui
          ) ui
          CROSS JOIN LATERAL (
              SELECT unnest(
                  CASE zona_ui
                      -- Migración 184: nombres display definitivos + aliases legacy
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
              p.datos_json_discovery->>'amigo_clie'
          )::TEXT,

          COALESCE(
              p.datos_json_enrichment->'llm_output'->>'agente_telefono',
              p.datos_json->'agente'->>'telefono'
          )::TEXT,

          COALESCE(
              p.datos_json->'agente'->>'whatsapp',
              p.datos_json_discovery->>'whatsapp',
              p.datos_json_enrichment->'llm_output'->>'agente_telefono',
              p.datos_json->'agente'->>'telefono'
          )::TEXT,

          (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date))::INTEGER,

          COALESCE(p.estado_construccion::TEXT, 'no_especificado'),
          p.id_proyecto_master,

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

          CASE
              WHEN jsonb_typeof(p.datos_json->'amenities'->'equipamiento') = 'array'
                  AND jsonb_array_length(p.datos_json->'amenities'->'equipamiento') > 0
              THEN (SELECT ARRAY_AGG(elem ORDER BY elem)
                    FROM jsonb_array_elements_text(p.datos_json->'amenities'->'equipamiento') AS elem)
              ELSE NULL
          END::TEXT[],

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
        AND (
            p_filtros->>'precio_mensual_max' IS NULL
            OR p.precio_mensual_bob <= (p_filtros->>'precio_mensual_max')::numeric
        )
        AND (
            p_filtros->>'precio_mensual_min' IS NULL
            OR p.precio_mensual_bob >= (p_filtros->>'precio_mensual_min')::numeric
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
            OR p.acepta_mascotas = true
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
        -- v163: reducido de 180 a 150 días (vida mediana C21=34d, Remax=73d)
        AND CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) <= 150
        AND p.precio_mensual_bob IS NOT NULL

      ORDER BY
          CASE WHEN p_filtros->>'orden' = 'precio_desc' THEN p.precio_mensual_bob END DESC NULLS LAST,
          CASE WHEN p_filtros->>'orden' = 'precio_asc' THEN p.precio_mensual_bob END ASC NULLS LAST,
          CASE WHEN p_filtros->>'orden' IS NULL OR p_filtros->>'orden' = 'recientes'
               THEN COALESCE(p.fecha_publicacion, p.fecha_discovery::date) END DESC NULLS LAST,
          p.id DESC
      LIMIT COALESCE((p_filtros->>'limite')::int, 50)
      OFFSET COALESCE((p_filtros->>'offset')::int, 0);
  END;
$function$;

-- ============================================================
-- Verificaciones:
-- ============================================================

-- 1. zonas_geograficas — nombres nuevos
-- SELECT id, nombre, zona_general FROM zonas_geograficas WHERE activo = true ORDER BY id;
-- Esperado: Equipetrol Centro, Equipetrol Norte (×2), Sirari, Villa Brigida, Equipetrol Oeste, Eq. 3er Anillo

-- 2. No quedan nombres viejos en props activas
-- SELECT zona, COUNT(*) FROM propiedades_v2
-- WHERE zona IN ('Faremafu', 'Equipetrol Norte/Norte', 'Equipetrol Norte/Sur', 'Equipetrol Franja')
--   AND status IN ('completado', 'actualizado')
-- GROUP BY zona;
-- Esperado: 0 filas

-- 3. No queda 'Equipetrol' solo (sin Centro) en props activas
-- SELECT COUNT(*) FROM propiedades_v2
-- WHERE zona = 'Equipetrol' AND status IN ('completado', 'actualizado');
-- Esperado: 0

-- 4. No quedan nombres viejos en proyectos_master
-- SELECT zona, COUNT(*) FROM proyectos_master
-- WHERE zona IN ('Faremafu', 'Equipetrol Norte/Norte', 'Equipetrol Norte/Sur', 'Equipetrol Franja', 'Equipetrol')
--   AND activo = true
-- GROUP BY zona;
-- Esperado: 0 filas

-- 5. Distribución nueva
-- SELECT zona, COUNT(*) FROM propiedades_v2
-- WHERE status IN ('completado', 'actualizado') AND duplicado_de IS NULL
-- GROUP BY zona ORDER BY COUNT(*) DESC;

-- ============================================================
-- CAMBIOS FRONTEND NECESARIOS (no incluidos en esta migración SQL):
-- ============================================================
--
-- === simon-mvp/src/lib/zonas.ts ===
--
-- ZONAS_CANONICAS: cambiar el campo `db` de cada zona:
--   { slug: 'equipetrol_centro', db: 'Equipetrol Centro', dbAlquiler: ['Equipetrol Centro'], ... }
--   { slug: 'equipetrol_norte',  db: 'Equipetrol Norte',  dbAlquiler: ['Equipetrol Norte'], ... }
--   { slug: 'sirari',            db: 'Sirari',             dbAlquiler: ['Sirari'], ... }
--   { slug: 'villa_brigida',     db: 'Villa Brigida',      dbAlquiler: ['Villa Brigida'], ... }
--   { slug: 'equipetrol_oeste',  db: 'Equipetrol Oeste',   dbAlquiler: ['Equipetrol Oeste'], ... }
--
-- displayZona(): simplificar — ahora db name ≈ display name
--   'Equipetrol Centro' → 'Eq. Centro'
--   'Equipetrol Norte'  → 'Eq. Norte'
--   'Equipetrol Oeste'  → 'Eq. Oeste'
--   'Villa Brigida'     → 'V. Brígida'
--   'Sirari'            → 'Sirari'
--   'Eq. 3er Anillo'    → 'Eq. 3er Anillo'
--
-- === simon-mvp/src/config/propiedad-constants.ts ===
--
-- MICROZONA_ID_TO_DB: actualizar valores
--   'equipetrol_centro': 'Equipetrol Centro'   (antes: 'Equipetrol')
--   'equipetrol_norte':  'Equipetrol Norte'     (antes: 'Equipetrol Norte/Norte')
--   'equipetrol_oeste':  'Equipetrol Oeste'     (antes: 'Faremafu')
--   'sirari':            'Sirari'               (sin cambio)
--   'villa_brigida':     'Villa Brigida'         (sin cambio)
--
-- === n8n extractores ===
--
-- extractor_century21.json y extractor_remax.json:
--   Buscar 'Faremafu' → reemplazar por 'Equipetrol Oeste'
--   Buscar 'Equipetrol Norte/Norte' → 'Equipetrol Norte'
--   Buscar 'Equipetrol Norte/Sur' → 'Equipetrol Norte'
--   Buscar donde se asigna zona = 'Equipetrol' → 'Equipetrol Centro'
--
-- === CLAUDE.md ===
--
-- Actualizar tabla "Zonas Canonicas" con nombres nuevos
-- ============================================================
