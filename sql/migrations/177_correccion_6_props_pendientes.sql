-- Migración 177: Corregir precio_usd inflado en 6 propiedades pendientes de revisión manual
--
-- Estas 6 props NO fueron incluidas en migración 176 porque requerían verificación manual.
-- Precios reales tomados de datos_json_enrichment.precio_usd_original
-- (el valor que el extractor recibió de C21 ANTES de aplicar CASO 2).
--
-- Root cause: mismo que migración 176 — CASO 2 multiplicaba USD × TC_PARALELO / 6.96.
--
-- Detalle por propiedad:
--   299 (Ed. ITAJU):   $477,326 → $359,000 (desc: "desde 327,000 USDT", meta: $359K)
--   300 (Ed. ITAJU):   $490,622 → $369,000 (desc: "desde 327,000 USDT", meta: $369K)
--   301 (Ed. ITAJU):   $477,330 → $359,003 (desc: "desde 327,000 USDT", meta: $369K)
--   308 (Sky Lux):     $268,046 → $200,000 (175m² a ~$200K, TC paralelo)
--   494 (Luxe Tower):  $216,992 → $163,060 (desc: "tipo de cambio blue", $1,250-1,450/m²)
--   521 (Experience):  $103,983 →  $77,586 (precio/m² muy bajo, TC paralelo)
--
-- Las 6 ya tienen candado puesto por el admin desde el dashboard.
-- depende_de_tc = false porque precio_usd es USD real publicado por la desarrolladora.
-- El precio en dólares no cambia con el TC — lo que cambia es su equivalente en BOB,
-- que precio_normalizado() calcula on-the-fly.
--
-- Dependencias: Migración 176 ejecutada.

-- ============================================================================
-- CORREGIR PRECIOS
-- ============================================================================

WITH precios_reales (id, precio_real_usd) AS (
  VALUES
    (299, 359000),
    (300, 369000),
    (301, 359003),
    (308, 200000),
    (494, 163060),
    (521, 77586)
)
UPDATE propiedades_v2 p
SET
    precio_usd = pr.precio_real_usd,
    precio_usd_actualizado = pr.precio_real_usd,
    depende_de_tc = false,
    requiere_actualizacion_precio = false
FROM precios_reales pr
WHERE p.id = pr.id;
-- Esperado: UPDATE 6

-- ============================================================================
-- VERIFICACIÓN POST-EJECUCIÓN
-- ============================================================================
--
-- SELECT id, precio_usd, depende_de_tc,
--        (campos_bloqueados->'precio_usd'->>'bloqueado')::boolean AS candado
-- FROM propiedades_v2
-- WHERE id IN (299, 300, 301, 308, 494, 521)
-- ORDER BY id;
--
-- Esperado:
--   299: precio_usd=359000, depende_tc=false, candado=true
--   300: precio_usd=369000, depende_tc=false, candado=true
--   301: precio_usd=359003, depende_tc=false, candado=true
--   308: precio_usd=200000, depende_tc=false, candado=true
--   494: precio_usd=163060, depende_tc=false, candado=true
--   521: precio_usd=77586,  depende_tc=false, candado=true
