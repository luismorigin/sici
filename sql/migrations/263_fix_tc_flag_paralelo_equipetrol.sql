-- =============================================================================
-- Migración 263 — FIX TC: flag 'paralelo' mal puesto en deptos C21 Equipetrol
-- =============================================================================
-- DATA FIX (no toca schema). Corrige 69 departamentos de venta Century21 en
-- Equipetrol cuyo `precio_usd` YA es correcto pero tienen
-- `tipo_cambio_detectado='paralelo'` mal puesto → `precio_normalizado()` los
-- infla ×1.43 (tc_paralelo/6.96) en el feed público /ventas (se muestran a ~doble
-- precio). Descubierto 23-jun-2026 al revisar el feed nuevo /zona-norte/ventas.
--
-- CAUSA RAÍZ: el detector `detectarTipoCambio()` del nodo "Extractor Century21
-- v16.5" (workflow "Flujo B v3.0 - Processing") NO tuvo rama 'oficial' hasta
-- ~16-jun-2026; las props viejas quedaron marcadas paralelo y el pipeline no
-- re-procesa props ya 'completado'. El detector actual ya detecta TC7→oficial,
-- así que este fix NO se regenera. Verificado contra el export real de n8n.
--
-- POR QUÉ ES SEGURO (verificado prop por prop, no UPDATE ciego):
--   - En las 69, BOB/precio_usd = 6.96 o 7.00 → el portal convirtió al OFICIAL
--     → `precio_usd` ya es el dólar correcto del anuncio.
--   - La descripción declara TC oficial/TC7 (62) o precio en bolivianos (7).
--   - NINGUNA declara 'paralelo'. Des-inflar es correcto.
--   - Clasificación: regex de firma + 4 agentes-lectores sobre las descripciones
--     (ver memoria project_bug_tc_flag_paralelo_historico).
--
-- ALCANCE: SOLO Equipetrol (6 zonas canónicas). Las 244 de Zona Norte con el
-- mismo patrón van en migración aparte (feed ZN en noindex, menor urgencia).
-- NO incluye: 11 props con precio_usd tambien inflado (corregir monto, aparte),
-- ni ~58 sin TC declarado (decisión de política pendiente del founder).
--
-- Aplicar vía Supabase UI o psql (NO desde MCP — es readonly).
-- Registrar en docs/migrations/MIGRATION_INDEX.md.
-- =============================================================================

BEGIN;

-- (A) 62 deptos con TC OFICIAL/TC7 declarado en el anuncio → 'oficial'.
--     41 detectadas por regex ("TC7"/"T.C. Oficial"/"tipo de cambio 7") +
--     21 destapadas por agentes-lectores (formatos que el regex no agarra:
--     "Bs.7", "Official Exchange Rate 7", "TC 6,96", "t/c oficial").
UPDATE public.propiedades_v2
SET tipo_cambio_detectado = 'oficial',
    depende_de_tc = false
WHERE id IN (
  -- 41 originales (regex)
   179, 347, 348, 383, 384, 385, 432, 484, 525, 576,
  1140,1285,1286,1295,1336,1389,1432,1434,1672,1699,
  1711,1718,1719,1800,1869,1870,1871,1872,1873,1899,
  1900,1924,2393,2396,2582,2583,2598,2654,2658,2697,2714,
  -- 21 nuevas (agentes-lectores)
   505, 818,1057,1058,1059,1061,1063,1064,1068,1069,
  1070,1071,1204,1252,1412,1420,1673,1720,1828,1922,1928
)
AND tipo_cambio_detectado = 'paralelo'   -- guard idempotente
AND fuente = 'century21';

-- (B) 7 deptos con precio cotizado en BOLIVIANOS reales (Bs X) →
--     'no_especificado' (precio en moneda local, se convierte al oficial; no inflar).
UPDATE public.propiedades_v2
SET tipo_cambio_detectado = 'no_especificado',
    depende_de_tc = false
WHERE id IN (1198,1222,1441,1765,1780,1926,2675)
AND tipo_cambio_detectado = 'paralelo'
AND fuente = 'century21';

COMMIT;

-- -----------------------------------------------------------------------------
-- VERIFICACIÓN post-fix (correr aparte; esperado: 0 con $/m² absurdo entre estas)
-- -----------------------------------------------------------------------------
-- SELECT id, tipo_cambio_detectado,
--        ROUND(precio_normalizado(precio_usd, tipo_cambio_detectado)/area_total_m2) AS m2
-- FROM public.propiedades_v2
-- WHERE id IN (179,347,...,2675)
-- ORDER BY m2 DESC;

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- UPDATE public.propiedades_v2
-- SET tipo_cambio_detectado = 'paralelo', depende_de_tc = true
-- WHERE id IN (179,347,348,383,384,385,432,484,525,576,1140,1285,1286,1295,1336,
--   1389,1432,1434,1672,1699,1711,1718,1719,1800,1869,1870,1871,1872,1873,1899,
--   1900,1924,2393,2396,2582,2583,2598,2654,2658,2697,2714,505,818,1057,1058,1059,
--   1061,1063,1064,1068,1069,1070,1071,1204,1252,1412,1420,1673,1720,1828,1922,1928,
--   1198,1222,1441,1765,1780,1926,2675);
