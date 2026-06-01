-- =============================================================================
-- Migración 257 — Columna `zona_general` (macrozona) en vistas de mercado
--                 + helper `macrozona_de(text)`
-- =============================================================================
-- CONTEXTO: SICI nació solo-Equipetrol. Al entrar Zona Norte (14 microzonas),
-- v_mercado_venta/v_mercado_alquiler mezclan EQ+ZN. La macrozona vive solo en
-- zonas_geograficas.zona_general. Este es el CIMIENTO (Fase 0) del plan de
-- parametrización por macrozona: expone zona_general como columna en las vistas
-- (lectores ad-hoc + 4 skills audit + analisis_11q) y un helper para los
-- consumidores que van a propiedades_v2 directo.
-- Plan: docs/proyectos/zona-norte/PLAN_PARAMETRIZACION_MACROZONAS.md
--
-- DISEÑO CLAVE — doble polígono 'Equipetrol Norte':
--   zonas_geograficas tiene 2 filas con nombre='Equipetrol Norte'. Un JOIN naíve
--   por nombre DUPLICA filas. Se usa un subquery agregado GROUP BY nombre que
--   garantiza 1 fila por nombre POR CONSTRUCCIÓN (no depende del dato actual).
--   Verificado 1-jun-2026: ningún nombre mapea a >1 zona_general.
--
-- ADITIVA: ambas vistas se recrean idénticas agregando zona_general AL FINAL del
-- SELECT (CREATE OR REPLACE VIEW solo permite append). No rompe consumidores.
--
-- APLICAR: Supabase UI o psql (NO desde MCP — readonly). Registrar en
-- docs/migrations/MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Helper macrozona_de(text) — para consumidores de propiedades_v2 directo
-- -----------------------------------------------------------------------------
-- MAX(zona_general) sobre GROUP implícito → 1 valor por nombre (consistente con
-- el subquery de las vistas). Devuelve NULL si la zona no está en zonas_geograficas.
CREATE OR REPLACE FUNCTION public.macrozona_de(p_zona text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT MAX(zg.zona_general)::text
  FROM zonas_geograficas zg
  WHERE zg.nombre = p_zona
    AND zg.activo = TRUE;
$$;

COMMENT ON FUNCTION public.macrozona_de(text) IS
  'Devuelve la macrozona (zona_general) de una microzona. Lee zonas_geograficas. '
  'Consumido por dashboards/scripts que van a propiedades_v2 directo. Migración 257.';

GRANT EXECUTE ON FUNCTION public.macrozona_de(text)
  TO anon, authenticated, service_role, claude_readonly;

-- -----------------------------------------------------------------------------
-- 2. v_mercado_venta — + zona_general (LEFT JOIN agregado, 1:1 por construcción)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mercado_venta AS
 SELECT id,
    url,
    fuente,
    codigo_propiedad,
    tipo_operacion,
    tipo_propiedad_original,
    estado_construccion,
    precio_usd,
    precio_usd_original,
    moneda_original,
    tipo_cambio_usado,
    tipo_cambio_detectado,
    requiere_actualizacion_precio,
    es_multiproyecto,
    dormitorios_opciones,
    precio_min_usd,
    precio_max_usd,
    area_min_m2,
    area_max_m2,
    latitud,
    longitud,
    area_total_m2,
    dormitorios,
    banos,
    estacionamientos,
    id_proyecto_master,
    id_proyecto_master_sugerido,
    confianza_sugerencia_extractor,
    metodo_match,
    status,
    es_activa,
    es_para_matching,
    razon_inactiva,
    fecha_inactivacion,
    score_calidad_dato,
    score_fiduciario,
    datos_json_discovery,
    datos_json_enrichment,
    datos_json,
    campos_bloqueados,
    discrepancias_detectadas,
    campos_conflicto,
    scraper_version,
    fecha_creacion,
    fecha_actualizacion,
    fecha_discovery,
    fecha_enrichment,
    fecha_merge,
    fecha_publicacion,
    fecha_scraping,
    metodo_discovery,
    tipo_cambio_paralelo_usado,
    precio_usd_actualizado,
    fecha_ultima_actualizacion_precio,
    depende_de_tc,
    cambios_enrichment,
    cambios_merge,
    primera_ausencia_at,
    flags_semanticos,
    nombre_edificio,
    zona,
    microzona,
    duplicado_de,
    baulera,
    piso,
    plan_pagos_desarrollador,
    acepta_permuta,
    solo_tc_paralelo,
    precio_negociable,
    descuento_contado_pct,
    parqueo_incluido,
    parqueo_precio_adicional,
    baulera_incluido,
    baulera_precio_adicional,
    plan_pagos_cuotas,
    plan_pagos_texto,
    precio_mensual_bob,
    precio_mensual_usd,
    deposito_meses,
    amoblado,
    acepta_mascotas,
    servicios_incluidos,
    contrato_minimo_meses,
    monto_expensas_bob,
    precio_normalizado(precio_usd, tipo_cambio_detectado::text) AS precio_norm,
    precio_normalizado(precio_usd, tipo_cambio_detectado::text) / NULLIF(area_total_m2, 0::numeric) AS precio_m2,
    CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) AS dias_en_mercado,
    zg.zona_general
   FROM propiedades_v2 p
   LEFT JOIN (
     SELECT nombre, MAX(zona_general) AS zona_general
     FROM zonas_geograficas
     WHERE activo = TRUE
     GROUP BY nombre
   ) zg ON zg.nombre = p.zona
  WHERE (status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad])) AND tipo_operacion = 'venta'::tipo_operacion_enum AND duplicado_de IS NULL AND (COALESCE(tipo_propiedad_original, ''::text) <> ALL (ARRAY['baulera'::text, 'parqueo'::text, 'garaje'::text, 'deposito'::text])) AND (es_multiproyecto = false OR es_multiproyecto IS NULL) AND area_total_m2 >= 20::numeric AND zona IS NOT NULL AND precio_usd > 0::numeric AND
        CASE
            WHEN COALESCE(estado_construccion::text, ''::text) = ANY (ARRAY['preventa'::text, 'en_construccion'::text, 'en_pozo'::text]) THEN (CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date)) <= 730
            ELSE (CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date)) <= 300
        END;

-- -----------------------------------------------------------------------------
-- 3. v_mercado_alquiler — + zona_general (mismo patrón)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_mercado_alquiler AS
 SELECT id,
    url,
    fuente,
    codigo_propiedad,
    tipo_operacion,
    tipo_propiedad_original,
    estado_construccion,
    precio_usd,
    precio_usd_original,
    moneda_original,
    tipo_cambio_usado,
    tipo_cambio_detectado,
    requiere_actualizacion_precio,
    es_multiproyecto,
    dormitorios_opciones,
    precio_min_usd,
    precio_max_usd,
    area_min_m2,
    area_max_m2,
    latitud,
    longitud,
    area_total_m2,
    dormitorios,
    banos,
    estacionamientos,
    id_proyecto_master,
    id_proyecto_master_sugerido,
    confianza_sugerencia_extractor,
    metodo_match,
    status,
    es_activa,
    es_para_matching,
    razon_inactiva,
    fecha_inactivacion,
    score_calidad_dato,
    score_fiduciario,
    datos_json_discovery,
    datos_json_enrichment,
    datos_json,
    campos_bloqueados,
    discrepancias_detectadas,
    campos_conflicto,
    scraper_version,
    fecha_creacion,
    fecha_actualizacion,
    fecha_discovery,
    fecha_enrichment,
    fecha_merge,
    fecha_publicacion,
    fecha_scraping,
    metodo_discovery,
    tipo_cambio_paralelo_usado,
    precio_usd_actualizado,
    fecha_ultima_actualizacion_precio,
    depende_de_tc,
    cambios_enrichment,
    cambios_merge,
    primera_ausencia_at,
    flags_semanticos,
    nombre_edificio,
    zona,
    microzona,
    duplicado_de,
    baulera,
    piso,
    plan_pagos_desarrollador,
    acepta_permuta,
    solo_tc_paralelo,
    precio_negociable,
    descuento_contado_pct,
    parqueo_incluido,
    parqueo_precio_adicional,
    baulera_incluido,
    baulera_precio_adicional,
    plan_pagos_cuotas,
    plan_pagos_texto,
    precio_mensual_bob,
    precio_mensual_usd,
    deposito_meses,
    amoblado,
    acepta_mascotas,
    servicios_incluidos,
    contrato_minimo_meses,
    monto_expensas_bob,
    round(precio_mensual_bob / 6.96, 2)::numeric(10,2) AS precio_mensual,
    CURRENT_DATE - COALESCE(fecha_publicacion::timestamp without time zone, fecha_creacion)::date AS dias_en_mercado,
    zg.zona_general
   FROM propiedades_v2 p
   LEFT JOIN (
     SELECT nombre, MAX(zona_general) AS zona_general
     FROM zonas_geograficas
     WHERE activo = TRUE
     GROUP BY nombre
   ) zg ON zg.nombre = p.zona
  WHERE tipo_operacion = 'alquiler'::tipo_operacion_enum AND (status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad])) AND duplicado_de IS NULL AND area_total_m2 >= 20::numeric AND precio_mensual_usd > 0::numeric AND (CURRENT_DATE - COALESCE(fecha_publicacion::timestamp without time zone, fecha_creacion)::date) <= 150;

-- -----------------------------------------------------------------------------
-- 4. GRANTs (idempotentes — las vistas ya eran públicas; se re-otorga por Regla 6)
-- -----------------------------------------------------------------------------
GRANT SELECT ON public.v_mercado_venta    TO anon, authenticated, service_role, claude_readonly;
GRANT SELECT ON public.v_mercado_alquiler TO anon, authenticated, service_role, claude_readonly;

COMMIT;

-- =============================================================================
-- ROLLBACK (recrear las vistas SIN la columna zona_general — defs pre-257 en
-- sql/migrations/193_vistas_mercado.sql, o pg_get_viewdef de la corrida actual)
-- y: DROP FUNCTION IF EXISTS public.macrozona_de(text);
-- Nota: CREATE OR REPLACE VIEW no puede QUITAR una columna → el rollback de las
-- vistas requiere DROP VIEW + CREATE (cuidando dependencias) o re-CREATE OR
-- REPLACE con el SELECT viejo SOLO si no hay objetos que ya referencien la
-- columna nueva.
-- =============================================================================
