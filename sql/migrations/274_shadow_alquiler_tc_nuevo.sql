-- =============================================================================
-- Migración 274 (SHADOW) — Híbrido de ALQUILER: TC nuevo + vista de mercado shadow
-- -----------------------------------------------------------------------------
-- Propósito: darle al híbrido de alquiler el MISMO contrato de precio que venta
--   (crudo + etiqueta adentro, normalizado afuera), sobre la tabla shadow YA
--   existente (propiedades_v2_shadow, mig 268), discriminando por tipo_operacion.
--   Reemplaza el `precio_mensual_bob / 6.96` FIJO por conversión con el Binance
--   vivo (unificación oficial≈paralelo → el ÷6.96 inflaba el USD ~44%).
--
-- Contiene (AISLADO de venta — regla 6, NUNCA toca funciones de venta):
--   1. precio_normalizado_alquiler(bob, usd, tag) — normalización propia de alquiler.
--      Espeja precio_normalizado_shadow() de venta (mig 272), keyed en el tag:
--        · 'bob'          → crudo en BOLIVIANOS → USD real = BOB / paralelo (LIVE)
--        · 'oficial_viejo'→ USD anclado al 6.96/7 muerto → descuenta ×6.96/paralelo
--        · resto (paralelo/oficial-nuevo/no_especificado) → USD real directo
--   2. v_mercado_alquiler_shadow — clon EXACTO de v_mercado_alquiler (def vivo de
--      prod, exportado con pg_get_viewdef), pero: (a) FROM propiedades_v2_shadow,
--      (b) precio_mensual = precio_normalizado_alquiler(...) en vez del ÷6.96.
--
-- Decisiones founder (12-jul-2026):
--   · UNA sola tabla shadow (propiedades_v2_shadow por tipo_operacion), no separada.
--   · La etiqueta va en la columna compartida tipo_cambio_detectado (no choca: filas
--     distintas por tipo_operacion). solo_tc_paralelo queda DEPRECADO (estaba en 0).
--   · Crudo en su columna honesta: BOB→precio_mensual_bob, USD→precio_mensual_usd;
--     la función elige por el tag. tasa = config_global (Binance vivo, 100% dinámico).
--
-- Contrato del lector: READER_SPEC_ALQUILER.md. Reconocimiento: memoria
--   project_reconocimiento_alquiler_hibrido. NADA de esto es producción: el feed
--   /alquileres real (n8n) sigue con v_mercado_alquiler + ÷6.96, intacto.
--
-- ⚠️ Aplicar vía Supabase UI o psql (NO desde MCP, readonly). Rollback al final.
--   Registrar en docs/migrations/MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. NORMALIZACIÓN DE ALQUILER (propia, aislada) — keyed en el tag
-- -----------------------------------------------------------------------------
-- Recibe las DOS columnas de precio mensual (el crudo vive en la que corresponde
-- a su moneda) + el tag. El lector garantiza la consistencia:
--   · crudo en Bs  → precio_mensual_bob poblado, tag 'bob' (aunque el aviso mencione
--                    6.96: los Bs se dividen por el paralelo igual → mismo resultado).
--   · crudo en USD → precio_mensual_usd poblado, tag 'no_especificado'/'paralelo'
--                    (USD real, directo) u 'oficial_viejo' (USD al rate muerto → descuenta).
CREATE OR REPLACE FUNCTION public.precio_normalizado_alquiler(
  p_precio_mensual_bob numeric,
  p_precio_mensual_usd numeric,
  p_tipo_cambio_detectado text
) RETURNS numeric LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'bob' THEN
      ROUND(p_precio_mensual_bob / NULLIF((
        SELECT cg.valor::numeric FROM public.config_global cg
        WHERE cg.clave = 'tipo_cambio_paralelo' AND cg.activo LIMIT 1), 0), 2)
    WHEN p_tipo_cambio_detectado = 'oficial_viejo' THEN
      ROUND(p_precio_mensual_usd * 6.96 / NULLIF((
        SELECT cg.valor::numeric FROM public.config_global cg
        WHERE cg.clave = 'tipo_cambio_paralelo' AND cg.activo LIMIT 1), 0), 2)
    ELSE p_precio_mensual_usd
  END;
$fn$;

COMMENT ON FUNCTION public.precio_normalizado_alquiler(numeric, numeric, text) IS
  'Normalización de ALQUILER (mig 274, aislada de venta): USD comparable del precio '
  'mensual. bob → BOB/paralelo (live); oficial_viejo → USD×6.96/paralelo (descuenta); '
  'resto → USD directo. tasa = config_global.tipo_cambio_paralelo (Binance). '
  'Reemplaza el ÷6.96 fijo de la vista de prod. NUNCA guardar el resultado (normaliza al leer).';

GRANT EXECUTE ON FUNCTION public.precio_normalizado_alquiler(numeric, numeric, text)
  TO service_role, claude_readonly;

-- -----------------------------------------------------------------------------
-- 2. VISTA DE MERCADO SHADOW — clon del def vivo de v_mercado_alquiler
-- -----------------------------------------------------------------------------
-- Idéntica a v_mercado_alquiler (mismas columnas, filtros y JOIN de zonas) salvo:
--   · FROM propiedades_v2_shadow (no la tabla real)
--   · precio_mensual = precio_normalizado_alquiler(bob, usd, tag)  [antes: ÷6.96/CASE]
--   · filtro de precio = precio normalizado > 0  [antes: precio_mensual_usd > 0, que
--     excluiría los avisos en Bs cuyo precio_mensual_usd queda NULL en el modelo nuevo]
CREATE OR REPLACE VIEW public.v_mercado_alquiler_shadow AS
 SELECT p.id,
    p.url,
    p.fuente,
    p.codigo_propiedad,
    p.tipo_operacion,
    p.tipo_propiedad_original,
    p.estado_construccion,
    p.precio_usd,
    p.precio_usd_original,
    p.moneda_original,
    p.tipo_cambio_usado,
    p.tipo_cambio_detectado,
    p.requiere_actualizacion_precio,
    p.es_multiproyecto,
    p.dormitorios_opciones,
    p.precio_min_usd,
    p.precio_max_usd,
    p.area_min_m2,
    p.area_max_m2,
    p.latitud,
    p.longitud,
    p.area_total_m2,
    p.dormitorios,
    p.banos,
    p.estacionamientos,
    p.id_proyecto_master,
    p.id_proyecto_master_sugerido,
    p.confianza_sugerencia_extractor,
    p.metodo_match,
    p.status,
    p.es_activa,
    p.es_para_matching,
    p.razon_inactiva,
    p.fecha_inactivacion,
    p.score_calidad_dato,
    p.score_fiduciario,
    p.datos_json_discovery,
    p.datos_json_enrichment,
    p.datos_json,
    p.campos_bloqueados,
    p.discrepancias_detectadas,
    p.campos_conflicto,
    p.scraper_version,
    p.fecha_creacion,
    p.fecha_actualizacion,
    p.fecha_discovery,
    p.fecha_enrichment,
    p.fecha_merge,
    p.fecha_publicacion,
    p.fecha_scraping,
    p.metodo_discovery,
    p.tipo_cambio_paralelo_usado,
    p.precio_usd_actualizado,
    p.fecha_ultima_actualizacion_precio,
    p.depende_de_tc,
    p.cambios_enrichment,
    p.cambios_merge,
    p.primera_ausencia_at,
    p.flags_semanticos,
    p.nombre_edificio,
    p.zona,
    p.microzona,
    p.duplicado_de,
    p.baulera,
    p.piso,
    p.plan_pagos_desarrollador,
    p.acepta_permuta,
    p.solo_tc_paralelo,
    p.precio_negociable,
    p.descuento_contado_pct,
    p.parqueo_incluido,
    p.parqueo_precio_adicional,
    p.baulera_incluido,
    p.baulera_precio_adicional,
    p.plan_pagos_cuotas,
    p.plan_pagos_texto,
    p.precio_mensual_bob,
    p.precio_mensual_usd,
    p.deposito_meses,
    p.amoblado,
    p.acepta_mascotas,
    p.servicios_incluidos,
    p.contrato_minimo_meses,
    p.monto_expensas_bob,
    public.precio_normalizado_alquiler(p.precio_mensual_bob, p.precio_mensual_usd, p.tipo_cambio_detectado::text)::numeric(10,2) AS precio_mensual,
    CURRENT_DATE - COALESCE(p.fecha_publicacion::timestamp without time zone, p.fecha_creacion)::date AS dias_en_mercado,
    zg.zona_general
   FROM propiedades_v2_shadow p
     LEFT JOIN ( SELECT zonas_geograficas.nombre,
            max(zonas_geograficas.zona_general::text) AS zona_general
           FROM zonas_geograficas
          WHERE zonas_geograficas.activo = true
          GROUP BY zonas_geograficas.nombre) zg ON zg.nombre::text = p.zona::text
  WHERE p.tipo_operacion = 'alquiler'::tipo_operacion_enum
    AND (p.status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad]))
    AND p.duplicado_de IS NULL
    AND (lower(COALESCE(p.tipo_propiedad_original, ''::text)) <> ALL (ARRAY['baulera'::text, 'parqueo'::text, 'garaje'::text, 'deposito'::text, 'casa'::text, 'terreno'::text, 'oficina'::text]))
    AND p.area_total_m2 >= 20::numeric
    AND public.precio_normalizado_alquiler(p.precio_mensual_bob, p.precio_mensual_usd, p.tipo_cambio_detectado::text) > 0::numeric
    AND (CURRENT_DATE - COALESCE(p.fecha_publicacion::timestamp without time zone, p.fecha_creacion)::date) <= 150;

COMMENT ON VIEW public.v_mercado_alquiler_shadow IS
  'Vista de mercado alquiler SHADOW (mig 274). Clon de v_mercado_alquiler sobre '
  'propiedades_v2_shadow; precio_mensual = precio_normalizado_alquiler(bob,usd,tag) '
  '(Binance vivo, no ÷6.96). Aislada del feed público (GRANTs sin anon). No es producción.';

GRANT SELECT ON public.v_mercado_alquiler_shadow TO service_role, claude_readonly;
-- (deliberadamente SIN anon / authenticated → invisible al Data API público)

COMMIT;

-- =============================================================================
-- VERIFICACIÓN (correr tras aplicar; hoy da 0 filas — aún no hay alquiler en shadow):
-- =============================================================================
-- SELECT COUNT(*) AS filas,
--        COUNT(*) FILTER (WHERE precio_mensual > 0) AS con_precio,
--        ROUND(percentile_cont(0.5) WITHIN GROUP (ORDER BY precio_mensual)) AS mediana_usd
-- FROM public.v_mercado_alquiler_shadow;
--
-- Sanity del TC (con paralelo≈10): un aviso Bs 3.900 tag 'bob' debe dar ~$390 (no $560):
-- SELECT public.precio_normalizado_alquiler(3900, NULL, 'bob')          AS bob_3900,   -- ~390
--        public.precio_normalizado_alquiler(NULL, 500, 'no_especificado') AS usd_500,  -- 500
--        public.precio_normalizado_alquiler(NULL, 560, 'oficial_viejo')  AS viejo_560; -- ~390

-- =============================================================================
-- ROLLBACK:
-- =============================================================================
-- BEGIN;
--   DROP VIEW IF EXISTS public.v_mercado_alquiler_shadow;
--   DROP FUNCTION IF EXISTS public.precio_normalizado_alquiler(numeric, numeric, text);
-- COMMIT;
-- =============================================================================
