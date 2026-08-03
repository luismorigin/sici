-- ═══════════════════════════════════════════════════════════════════════════
-- 314 — Las vistas de mercado SHADOW contaban avisos ya dados de baja
-- ═══════════════════════════════════════════════════════════════════════════
--
-- EL BUG. `v_mercado_venta_shadow` y `v_mercado_alquiler_shadow` filtran por
-- `status IN ('completado','actualizado')` pero NO por `es_activa`. En SHADOW
-- eso no alcanza: el verificador marca la baja poniendo **`es_activa = false`
-- y deja el status en `completado`**. Medido el 2-ago-2026: 148 props en ese
-- estado, de las cuales entraban a las vistas:
--
--     v_mercado_venta_shadow     842 filas ·  69 de baja  (8,2 %)
--     v_mercado_alquiler_shadow  365 filas ·  57 de baja  (15,6 %)
--     v_mercado_venta (PROD)     801 filas ·   0          ← prod no tiene el bug
--
-- Prod se salva porque su verificador SÍ mueve el status a `inactivo_confirmed`.
-- Las vistas se copiaron de prod sin notar que en shadow la señal de baja es otra.
--
-- QUÉ ROMPÍA. El feed NO se ve afectado: `buscar_unidades_simple_shadow` filtra
-- `p.es_activa = true` por su cuenta. Lo que quedaba sucio es todo lo que se
-- calcula sobre las vistas: medianas y $/m² de /mercado, yields, cortes por
-- zona y tipología, y los snapshots de absorción — con ~8 % de venta y ~16 % de
-- alquiler de avisos que ya no existen en el portal.
--
-- Lo encontró el founder mirando el feed: la prop 1360 (Sky Eclipse) figuraba
-- como comparable "cara" (166 % de su edificio) y estaba dada de baja el 30-jul
-- con `razon_inactiva = 'aviso_terminado'`.
--
-- EL CAMBIO. Se agrega `p.es_activa = true` al WHERE de las dos vistas. El resto
-- de la definición queda idéntico (se transcribe entera porque CREATE OR REPLACE
-- VIEW exige el cuerpo completo).
--
-- Reversible: quitar esa condición y volver a correr.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── VENTA ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_mercado_venta_shadow AS
 SELECT p.id, p.url, p.fuente, p.codigo_propiedad, p.tipo_operacion,
    p.tipo_propiedad_original, p.estado_construccion, p.precio_usd,
    p.precio_usd_original, p.moneda_original, p.tipo_cambio_usado,
    p.tipo_cambio_detectado, p.requiere_actualizacion_precio, p.es_multiproyecto,
    p.dormitorios_opciones, p.precio_min_usd, p.precio_max_usd, p.area_min_m2,
    p.area_max_m2, p.latitud, p.longitud, p.area_total_m2, p.dormitorios, p.banos,
    p.estacionamientos, p.id_proyecto_master, p.id_proyecto_master_sugerido,
    p.confianza_sugerencia_extractor, p.metodo_match, p.status, p.es_activa,
    p.es_para_matching, p.razon_inactiva, p.fecha_inactivacion, p.score_calidad_dato,
    p.score_fiduciario, p.datos_json_discovery, p.datos_json_enrichment, p.datos_json,
    p.campos_bloqueados, p.discrepancias_detectadas, p.campos_conflicto,
    p.scraper_version, p.fecha_creacion, p.fecha_actualizacion, p.fecha_discovery,
    p.fecha_enrichment, p.fecha_merge, p.fecha_publicacion, p.fecha_scraping,
    p.metodo_discovery, p.tipo_cambio_paralelo_usado, p.precio_usd_actualizado,
    p.fecha_ultima_actualizacion_precio, p.depende_de_tc, p.cambios_enrichment,
    p.cambios_merge, p.primera_ausencia_at, p.flags_semanticos, p.nombre_edificio,
    p.zona, p.microzona, p.duplicado_de, p.baulera, p.piso,
    p.plan_pagos_desarrollador, p.acepta_permuta, p.solo_tc_paralelo,
    p.precio_negociable, p.descuento_contado_pct, p.parqueo_incluido,
    p.parqueo_precio_adicional, p.baulera_incluido, p.baulera_precio_adicional,
    p.plan_pagos_cuotas, p.plan_pagos_texto, p.precio_mensual_bob,
    p.precio_mensual_usd, p.deposito_meses, p.amoblado, p.acepta_mascotas,
    p.servicios_incluidos, p.contrato_minimo_meses, p.monto_expensas_bob,
    p.area_terreno_m2, p.frente_m, p.fondo_m, p.id_condominio_master,
    precio_normalizado_shadow(p.precio_usd, p.tipo_cambio_detectado::text) AS precio_norm,
    precio_normalizado_shadow(p.precio_usd, p.tipo_cambio_detectado::text) / NULLIF(p.area_total_m2, 0::numeric) AS precio_m2,
    CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) AS dias_en_mercado,
    zg.zona_general
   FROM propiedades_v2_shadow p
     LEFT JOIN ( SELECT zonas_geograficas.nombre,
            max(zonas_geograficas.zona_general::text) AS zona_general
           FROM zonas_geograficas
          WHERE zonas_geograficas.activo = true
          GROUP BY zonas_geograficas.nombre) zg ON zg.nombre::text = p.zona::text
  WHERE p.es_activa = true                                       -- ← 314: la baja en shadow se marca acá, no en `status`
    AND (p.status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad]))
    AND p.tipo_operacion = 'venta'::tipo_operacion_enum
    AND p.duplicado_de IS NULL
    AND (lower(COALESCE(p.tipo_propiedad_original, ''::text)) <> ALL (ARRAY['baulera'::text, 'parqueo'::text, 'garaje'::text, 'deposito'::text, 'casa'::text, 'terreno'::text, 'oficina'::text]))
    AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
    AND p.area_total_m2 >= 20::numeric
    AND p.zona IS NOT NULL
    AND p.precio_usd > 0::numeric
    AND CASE
            WHEN COALESCE(p.estado_construccion::text, ''::text) = ANY (ARRAY['preventa'::text, 'en_construccion'::text, 'en_pozo'::text])
              THEN (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date)) <= 730
            ELSE (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date)) <= 300
        END;

-- ── ALQUILER ───────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_mercado_alquiler_shadow AS
 SELECT p.id, p.url, p.fuente, p.codigo_propiedad, p.tipo_operacion,
    p.tipo_propiedad_original, p.estado_construccion, p.precio_usd,
    p.precio_usd_original, p.moneda_original, p.tipo_cambio_usado,
    p.tipo_cambio_detectado, p.requiere_actualizacion_precio, p.es_multiproyecto,
    p.dormitorios_opciones, p.precio_min_usd, p.precio_max_usd, p.area_min_m2,
    p.area_max_m2, p.latitud, p.longitud, p.area_total_m2, p.dormitorios, p.banos,
    p.estacionamientos, p.id_proyecto_master, p.id_proyecto_master_sugerido,
    p.confianza_sugerencia_extractor, p.metodo_match, p.status, p.es_activa,
    p.es_para_matching, p.razon_inactiva, p.fecha_inactivacion, p.score_calidad_dato,
    p.score_fiduciario, p.datos_json_discovery, p.datos_json_enrichment, p.datos_json,
    p.campos_bloqueados, p.discrepancias_detectadas, p.campos_conflicto,
    p.scraper_version, p.fecha_creacion, p.fecha_actualizacion, p.fecha_discovery,
    p.fecha_enrichment, p.fecha_merge, p.fecha_publicacion, p.fecha_scraping,
    p.metodo_discovery, p.tipo_cambio_paralelo_usado, p.precio_usd_actualizado,
    p.fecha_ultima_actualizacion_precio, p.depende_de_tc, p.cambios_enrichment,
    p.cambios_merge, p.primera_ausencia_at, p.flags_semanticos, p.nombre_edificio,
    p.zona, p.microzona, p.duplicado_de, p.baulera, p.piso,
    p.plan_pagos_desarrollador, p.acepta_permuta, p.solo_tc_paralelo,
    p.precio_negociable, p.descuento_contado_pct, p.parqueo_incluido,
    p.parqueo_precio_adicional, p.baulera_incluido, p.baulera_precio_adicional,
    p.plan_pagos_cuotas, p.plan_pagos_texto, p.precio_mensual_bob,
    p.precio_mensual_usd, p.deposito_meses, p.amoblado, p.acepta_mascotas,
    p.servicios_incluidos, p.contrato_minimo_meses, p.monto_expensas_bob,
    precio_normalizado_alquiler(p.precio_mensual_bob, p.precio_mensual_usd, p.tipo_cambio_detectado::text)::numeric(10,2) AS precio_mensual,
    CURRENT_DATE - COALESCE(p.fecha_publicacion::timestamp without time zone, p.fecha_creacion)::date AS dias_en_mercado,
    zg.zona_general
   FROM propiedades_v2_shadow p
     LEFT JOIN ( SELECT zonas_geograficas.nombre,
            max(zonas_geograficas.zona_general::text) AS zona_general
           FROM zonas_geograficas
          WHERE zonas_geograficas.activo = true
          GROUP BY zonas_geograficas.nombre) zg ON zg.nombre::text = p.zona::text
  WHERE p.es_activa = true                                       -- ← 314
    AND p.tipo_operacion = 'alquiler'::tipo_operacion_enum
    AND (p.status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad]))
    AND p.duplicado_de IS NULL
    AND (lower(COALESCE(p.tipo_propiedad_original, ''::text)) <> ALL (ARRAY['baulera'::text, 'parqueo'::text, 'garaje'::text, 'deposito'::text, 'casa'::text, 'terreno'::text, 'oficina'::text]))
    AND p.area_total_m2 >= 20::numeric
    AND precio_normalizado_alquiler(p.precio_mensual_bob, p.precio_mensual_usd, p.tipo_cambio_detectado::text) > 0::numeric
    AND (CURRENT_DATE - COALESCE(p.fecha_publicacion::timestamp without time zone, p.fecha_creacion)::date) <= 150;

-- ── Verificación ───────────────────────────────────────────────────────────
-- Esperado: inactivas = 0 en ambas. El total baja ~69 en venta y ~57 en alquiler.
SELECT 'v_mercado_venta_shadow' AS vista, count(*) AS total,
       count(*) FILTER (WHERE p.es_activa IS NOT TRUE) AS inactivas
FROM v_mercado_venta_shadow v JOIN propiedades_v2_shadow p ON p.id = v.id
UNION ALL
SELECT 'v_mercado_alquiler_shadow', count(*),
       count(*) FILTER (WHERE p.es_activa IS NOT TRUE)
FROM v_mercado_alquiler_shadow v JOIN propiedades_v2_shadow p ON p.id = v.id;

COMMIT;
