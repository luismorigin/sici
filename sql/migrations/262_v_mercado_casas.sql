-- =============================================================================
-- Migración 262 — Vista pública del feed de casas (Zona Norte)
-- =============================================================================
-- Crea `v_mercado_casas`: el equivalente a `v_mercado_venta` pero para casas.
-- `v_mercado_venta` EXCLUYE explícitamente 'casa' en su filtro, por eso las casas
-- necesitan vista propia (aislada, no toca el feed de deptos).
--
-- Filtros canónicos (espejo de v_mercado_venta, decisión 21-jun):
--   - status completado/actualizado · tipo_operacion='venta' · duplicado_de IS NULL
--   - tipo_propiedad_original = 'casa'  (INVERTIDO respecto a deptos)
--   - es_activa = true (excluye casas caídas por el verificador)
--   - area_total_m2 >= 20 · zona IS NOT NULL · precio_usd > 0
--   - antigüedad: 300 días (730 si preventa/en construcción) — igual que deptos
--
-- Expone: físicos de casa (area_terreno/frente/fondo), precio_norm/precio_m2,
--   dias_en_mercado, datos_json_enrichment (fotos/descripcion/contacto/MOAT que
--   el frontend lee vía ->>), y el condominio heredado de condominios_master.
--
-- Consumers: feed público /ventas/casas (pendiente), queries de mercado casas ZN.
-- Aplicar vía Supabase UI o psql (NO desde MCP — readonly). Registrar en MIGRATION_INDEX.
-- Ref: docs/canonical/SEGURIDAD_SUPABASE.md (Regla 4 view + Regla 6 grants).
-- =============================================================================

BEGIN;

CREATE OR REPLACE VIEW public.v_mercado_casas AS
SELECT
    p.id,
    p.url,
    p.fuente,
    p.codigo_propiedad,
    p.tipo_operacion,
    p.tipo_propiedad_original,
    p.estado_construccion,
    -- precio
    p.precio_usd,
    p.precio_usd_original,
    p.moneda_original,
    p.tipo_cambio_detectado,
    p.tipo_cambio_paralelo_usado,
    p.depende_de_tc,
    p.solo_tc_paralelo,
    -- físicos (casa)
    p.latitud,
    p.longitud,
    p.area_total_m2,
    p.area_terreno_m2,
    p.frente_m,
    p.fondo_m,
    p.dormitorios,
    p.banos,
    p.estacionamientos,
    -- vínculos / estado
    p.id_condominio_master,
    p.metodo_match,
    p.status,
    p.es_activa,
    -- json (frontend lee fotos/descripcion/contacto/MOAT de acá)
    p.datos_json_enrichment,
    p.campos_bloqueados,
    -- fechas
    p.fecha_publicacion,
    p.fecha_creacion,
    p.fecha_discovery,
    -- zona
    p.zona,
    p.microzona,
    -- derivados (mismo cálculo que v_mercado_venta)
    precio_normalizado(p.precio_usd, p.tipo_cambio_detectado::text) AS precio_norm,
    precio_normalizado(p.precio_usd, p.tipo_cambio_detectado::text) / NULLIF(p.area_total_m2, 0::numeric) AS precio_m2,
    CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date) AS dias_en_mercado,
    zg.zona_general,
    -- condominio heredado (NULL = casa individual, válido)
    cm.nombre_oficial   AS condominio_nombre,
    cm.slug             AS condominio_slug,
    cm.desarrollador    AS condominio_desarrollador,
    cm.amenidades_comunes AS condominio_amenidades,
    cm.gps_verificado   AS condominio_gps_verificado
FROM propiedades_v2 p
    LEFT JOIN (
        SELECT zonas_geograficas.nombre,
               max(zonas_geograficas.zona_general::text) AS zona_general
        FROM zonas_geograficas
        WHERE zonas_geograficas.activo = true
        GROUP BY zonas_geograficas.nombre
    ) zg ON zg.nombre::text = p.zona::text
    LEFT JOIN condominios_master cm ON cm.id_condominio_master = p.id_condominio_master
WHERE (p.status = ANY (ARRAY['completado'::estado_propiedad, 'actualizado'::estado_propiedad]))
  AND p.tipo_operacion = 'venta'::tipo_operacion_enum
  AND p.duplicado_de IS NULL
  AND lower(COALESCE(p.tipo_propiedad_original, ''::text)) = 'casa'
  AND p.es_activa = true
  AND (p.es_multiproyecto = false OR p.es_multiproyecto IS NULL)
  AND p.area_total_m2 >= 20::numeric
  AND p.zona IS NOT NULL
  AND p.precio_usd > 0::numeric
  AND CASE
        WHEN COALESCE(p.estado_construccion::text, ''::text) = ANY (ARRAY['preventa'::text, 'en_construccion'::text, 'en_pozo'::text])
          THEN (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date)) <= 730
        ELSE (CURRENT_DATE - COALESCE(p.fecha_publicacion, p.fecha_discovery::date)) <= 300
      END;

COMMENT ON VIEW public.v_mercado_casas IS
  'Feed público de casas (vivienda, Zona Norte). Espejo de v_mercado_venta pero para tipo_propiedad_original=casa (que v_mercado_venta excluye). Filtros canónicos + es_activa + antigüedad 300/730d. Expone físicos de casa, precio_norm/precio_m2, datos_json_enrichment (fotos/descripcion/contacto) y condominio heredado de condominios_master. Consumer: /ventas/casas. Migración 262.';

-- 🔑 GRANTS (Preset A — data pública, Regla 6). Las views también los requieren desde oct-2026.
GRANT SELECT ON public.v_mercado_casas TO anon, authenticated, service_role, claude_readonly;

COMMIT;

-- -----------------------------------------------------------------------------
-- ROLLBACK
--   DROP VIEW IF EXISTS public.v_mercado_casas;
-- (vista nueva y aislada; no la consume nada en prod todavía → DROP directo seguro)
-- -----------------------------------------------------------------------------
