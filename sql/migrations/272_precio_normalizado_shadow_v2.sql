-- =============================================================================
-- Migración 272 (SHADOW) — precio_normalizado_shadow: RÉGIMEN TC NUEVO + BOB live
-- -----------------------------------------------------------------------------
-- Sobrescribe la función que YA usa el feed shadow (v_mercado_venta_shadow +
-- buscar_unidades_simple_shadow la llaman por nombre → toman el cambio auto).
-- 3 ramas, keyed en el tag (normaliza UNA vez, al consultar — nunca guardar normalizado):
--   · 'bob'          → crudo en BOLIVIANOS → USD real = BOB / tasa_paralelo (LIVE, sin freezing)
--   · 'oficial_viejo'→ USD anclado al 6.96/7 muerto → descuenta ×6.96/tasa_paralelo
--   · resto (paralelo/oficial-nuevo/no_especificado) → USD real directo (se fue el ×1.47)
--
-- Aislada al entorno shadow. NO toca prod ni n8n. tasa = config_global.tipo_cambio_paralelo (Binance, cron diario).
-- (Nota: la mig 271-era `precio_normalizado_shadow_v2` quedó DEPRECADA — se consolidó acá sobre el nombre real.)
--
-- ⚠️ Aplicar vía Supabase UI / psql / MCP con escritura. Rollback = re-aplicar la def de mig 268.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.precio_normalizado_shadow(p_precio_usd numeric, p_tipo_cambio_detectado text)
RETURNS numeric LANGUAGE sql STABLE AS $fn$
  SELECT CASE
    WHEN p_tipo_cambio_detectado = 'bob' THEN
      ROUND(p_precio_usd / (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
    WHEN p_tipo_cambio_detectado = 'oficial_viejo' THEN
      ROUND(p_precio_usd * 6.96 / (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'), 2)
    ELSE p_precio_usd
  END;
$fn$;

-- Rollback: re-aplicar el CREATE OR REPLACE de precio_normalizado_shadow de la migración 268
-- (paralelo × tasa/6.96 ; resto directo).
