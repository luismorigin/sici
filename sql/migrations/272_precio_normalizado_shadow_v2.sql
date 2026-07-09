-- =============================================================================
-- Migración 272 (SHADOW) — precio_normalizado_shadow_v2 (RÉGIMEN TC NUEVO)
-- -----------------------------------------------------------------------------
-- default directo (se va el ×1.47) + oficial_viejo descontado ×6.96/paralelo.
-- Aislada al entorno shadow. NO toca prod ni el feed real (n8n). Aditiva.
--
-- ⚠️ CREAR esta función NO cambia el feed shadow por sí solo. Para que tenga
--    efecto hay que REPUNTAR v_mercado_venta_shadow + buscar_unidades_simple_shadow
--    a _v2 (hoy usan precio_normalizado_shadow v1). Y el branch `oficial_viejo`
--    recién dispara cuando se REPUEBLE con el tag nuevo (la data actual tiene
--    tags viejos paralelo/oficial/no_especificado → v2 solo saca el ×1.47 de los
--    paralelo). Ver TC_NUEVO_DECISION.md (piezas 1+2+3 van juntas).
--
-- ⚠️ Aplicar vía Supabase UI o psql (NO desde MCP). Rollback al final.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.precio_normalizado_shadow_v2(
  p_precio_usd numeric,
  p_tipo_cambio_detectado text
) RETURNS numeric
LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- oficial VIEJO (texto ancla EXPLÍCITO a 6.96/7): descuenta a USD real.
    -- 6.96 = constante fija (rate muerto). El divisor = Binance dinámico (mismo que alimenta el cron).
    WHEN p_tipo_cambio_detectado = 'oficial_viejo' THEN
      ROUND(p_precio_usd * 6.96 / (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
    -- default (paralelo / oficial-nuevo / no_especificado): USD real DIRECTO (se va el ×1.47)
    ELSE p_precio_usd
  END;
$$;

REVOKE ALL ON FUNCTION public.precio_normalizado_shadow_v2(numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.precio_normalizado_shadow_v2(numeric, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.precio_normalizado_shadow_v2(numeric, text) TO claude_readonly;

-- Rollback: DROP FUNCTION IF EXISTS public.precio_normalizado_shadow_v2(numeric, text);
