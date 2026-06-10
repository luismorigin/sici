-- =====================================================================
-- FIX: matches "lejanos" que NO son agujeros negros (a diferencia de K1)
-- Fecha: 2026-06-09  |  Auditoría matching Zona Norte
-- Estado: NO APLICADO — revisar antes de ejecutar en Supabase
--
-- IMPORTANTE: estos pm son LEGÍTIMOS (a diferencia del pm 272 "EDIFICIO K1").
-- Sus props SÍ les corresponden; el "match >500m" venía del GPS del pm mal
-- cargado, NO de un mal match. Por eso acá se CORRIGE/PRESERVA, no se desactiva.
--
-- Diagnóstico (composición real por nombre merge/llm):
--   Blue Garden (355):            6/6 props son Blue Garden  → GPS pm a 1171m
--   Portobello Isuto (269):       2/2 props correctas         → GPS pm a 3971m
--   Condominio ONE (359):         3/4 correctas + 1 ajena (Condominio Ziri, prop 1996)
--   STONE 4 (268):                3 "STONE 4" + 1 "STONE IV" = todas la misma (IV=4) → sin acción
--
-- NOTA GPS: el centroide propuesto sale del promedio de las props (compactas,
-- spread ~0-18m). Idealmente verificar con scripts/verify-pm-gps antes de fijar.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Blue Garden (pm 355) — corregir GPS al centroide real de sus props
--    Actual: -17.7676863, -63.1785080  (a 1171m del edificio real)
-- ---------------------------------------------------------------------
UPDATE proyectos_master
SET latitud = -17.7575192, longitud = -63.1755775,
    gps_verificado_visual = false  -- forzar re-verificación visual posterior
WHERE id_proyecto_master = 355;

-- ---------------------------------------------------------------------
-- 2. Portobello Isuto (pm 269) — corregir GPS al centroide real
--    Actual: -17.7627912, -63.1902592  (a 3971m del edificio real)
-- ---------------------------------------------------------------------
UPDATE proyectos_master
SET latitud = -17.7480995, longitud = -63.1560966,
    gps_verificado_visual = false
WHERE id_proyecto_master = 269;

-- ---------------------------------------------------------------------
-- 3. Condominio ONE (pm 359) — sacar la prop ajena (Condominio Ziri, id 1996)
--    Re-deriva su nombre real y la reabre a matching. El pm ONE queda intacto.
-- ---------------------------------------------------------------------
UPDATE propiedades_v2 p
SET nombre_edificio = NULLIF(TRIM(COALESCE(
        p.datos_json->'proyecto'->>'nombre_edificio',
        p.datos_json_enrichment->'llm_output'->>'nombre_edificio')), ''),
    id_proyecto_master = NULL,
    es_para_matching = true,
    metodo_match = NULL,
    confianza_sugerencia_extractor = NULL
WHERE p.id = 1996
  AND NOT campo_esta_bloqueado(p.campos_bloqueados, 'nombre_edificio');

-- ---------------------------------------------------------------------
-- 4. STONE 4 (pm 268) — OPCIONAL: registrar alias "STONE IV" para evitar
--    futuros sin-match por la variante romana. Descomentar si se desea.
-- ---------------------------------------------------------------------
-- UPDATE proyectos_master
-- SET alias_conocidos = array_append(COALESCE(alias_conocidos, ARRAY[]::text[]), 'STONE IV')
-- WHERE id_proyecto_master = 268
--   AND NOT ('STONE IV' = ANY(COALESCE(alias_conocidos, ARRAY[]::text[])));

-- ---------------------------------------------------------------------
-- CONTROL POSTERIOR
-- ---------------------------------------------------------------------
SELECT 'blue_garden' AS pm, latitud, longitud FROM proyectos_master WHERE id_proyecto_master = 355
UNION ALL
SELECT 'portobello_isuto', latitud, longitud FROM proyectos_master WHERE id_proyecto_master = 269
UNION ALL
SELECT 'ziri_desmatcheada', id_proyecto_master, NULL FROM propiedades_v2 WHERE id = 1996;

COMMIT;
-- ROLLBACK;  -- si algo se ve mal
