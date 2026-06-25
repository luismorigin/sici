-- ============================================================================
-- CANONIZACIÓN DE FUENTE — casas C21 del híbrido:  c21  ->  century21
-- ----------------------------------------------------------------------------
-- POR QUÉ: 'century21' es la fuente canónica del portal en TODO el sistema
--   (2003 deptos + casas/terrenos viejos). Las casas Remax del híbrido ya usan
--   la canónica 'remax'; solo las casas C21 quedaron en 'c21' (one-off). Para
--   congruencia y escalabilidad, la fuente debe identificar el PORTAL, no el
--   pipeline (eso lo trackea tipo_propiedad_original + metodo_match).
--
-- ¿ES SEGURO? SÍ. El aislamiento casas↔deptos NO depende del string 'c21' sino
--   del filtro por TIPO en los discovery (verificado 25-jun-2026 sobre los
--   workflows reales):
--     · discovery C21 ZN (deptos): excluye tipo IN ('casa','terreno','lote')
--       en "URLs activas" y en "marcar ausentes".
--     · discovery C21 Equipetrol (deptos): filtra zona IN (6 zonas EQ) -> no ve ZN.
--     · discovery C21 casas/terrenos: DESACTIVADO.
--   Por eso renombrar a 'century21' NO re-expone las casas a degradación.
--
-- CÓMO APLICAR: con service_role (Supabase SQL editor / psql). El MCP es readonly;
--   esto lo aplica el humano. Idempotente-ish: re-correr no hace daño (0 filas).
--
-- PRE-CHECK FK (ya verificado 25-jun = 0,0; re-correr si pasó tiempo):
--   WITH ids(id) AS (VALUES (1511),(2661),(1941),(2659),(2660),(2680),(1515))
--   SELECT (SELECT count(*) FROM propiedades_v2 WHERE duplicado_de IN (SELECT id FROM ids)) ref_dup,
--          (SELECT count(*) FROM matching_sugerencias WHERE propiedad_id IN (SELECT id FROM ids)) ref_match;
-- ============================================================================

BEGIN;

-- 1) Eliminar las 7 casas 'century21' viejas (pipeline de prueba, inactivo_confirmed)
--    que son duplicado EXACTO por URL de las c21 vivas del híbrido. Sin FK refs.
--    Liberan el slot (url, 'century21') para que el rename no viole unique_url_fuente.
DELETE FROM propiedades_v2
WHERE id IN (1511, 2661, 1941, 2659, 2660, 2680, 1515)
  AND fuente = 'century21'
  AND status = 'inactivo_confirmed';
-- esperado: DELETE 7

-- 2) Renombrar las casas del híbrido c21 -> century21 (fuente canónica del portal).
UPDATE propiedades_v2
SET fuente = 'century21'
WHERE fuente = 'c21'
  AND tipo_propiedad_original = 'casa';
-- esperado: UPDATE 193

-- 3) Verificación (correr dentro de la tx antes del COMMIT):
--    debe dar 0 filas en 'c21'.
SELECT fuente, COUNT(*) AS casas
FROM propiedades_v2
WHERE tipo_propiedad_original = 'casa'
GROUP BY fuente
ORDER BY casas DESC;
-- esperado: century21 ~219 · remax 114 · (c21 = 0)

COMMIT;
-- Si algo no cuadra: ROLLBACK; (en vez de COMMIT) y revisar.
