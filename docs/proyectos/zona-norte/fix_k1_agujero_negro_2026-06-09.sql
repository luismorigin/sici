-- =====================================================================
-- FIX: pm "EDIFICIO K1" (id 272) = agujero negro del matching
-- Fecha: 2026-06-09  |  Autor: auditoría matching Zona Norte
-- Estado: NO APLICADO — revisar antes de ejecutar en Supabase
--
-- CONTEXTO (ver memoria project_bug_loop_matching_k1):
--   pm 272 "EDIFICIO K1" absorbió 48 props completadas (62 total) que en
--   realidad son ~20 edificios distintos. Causa raíz = loop entre
--   aplicar_matches_aprobados v3.1 (pisa nombre_edificio=pm.nombre_oficial)
--   y generar_matches_fuzzy (lee esa columna pisada → 100% similitud).
--   Validado: 0 props son realmente K1 según merge/llm.
--
-- ORDEN DE APLICACIÓN:
--   Esta limpieza es AUTÓNOMA y de bajo riesgo (no toca funciones).
--   Desactivar el pm 272 corta el imán: generar_matches_fuzzy solo sugiere
--   pm activos, así que sin pm K1 activo el loop no puede re-formarse PARA K1.
--   El patch del engine (generar_matches_fuzzy) es aparte y previene FUTUROS
--   agujeros negros (STONE 4, ONE, etc.) — ver análisis de impacto.
--
-- TODO se envuelve en una transacción. Revisar los SELECT de control
-- (pasos 0 y 5) antes y después.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- PASO 0 — CONTROL PREVIO (debe dar: 62 total, 0 realmente_k1)
-- ---------------------------------------------------------------------
SELECT 'ANTES' AS momento,
       COUNT(*) AS total_props_pm272,
       COUNT(*) FILTER (WHERE status='completado') AS completado,
       COUNT(*) FILTER (WHERE normalize_nombre(COALESCE(
           datos_json->'proyecto'->>'nombre_edificio',
           datos_json_enrichment->'llm_output'->>'nombre_edificio')) LIKE '%k1%') AS realmente_k1
FROM propiedades_v2 WHERE id_proyecto_master = 272;

-- ---------------------------------------------------------------------
-- PASO 1 — RE-DERIVAR nombre_edificio desde el nombre REAL (merge > llm)
-- Recupera el nombre que el merge ya había decidido bien y que el matching
-- pisó. Respeta candados. Las props sin nombre recuperable quedan NULL.
-- ---------------------------------------------------------------------
UPDATE propiedades_v2 p
SET nombre_edificio = NULLIF(TRIM(COALESCE(
        p.datos_json->'proyecto'->>'nombre_edificio',
        p.datos_json_enrichment->'llm_output'->>'nombre_edificio'
    )), '')
WHERE p.id_proyecto_master = 272
  AND NOT campo_esta_bloqueado(p.campos_bloqueados, 'nombre_edificio');

-- ---------------------------------------------------------------------
-- PASO 2 — DESMATCHEAR de K1 y reabrir para matching limpio
-- Quita el id_proyecto_master falso. es_para_matching=true para que el
-- pipeline nocturno las re-evalúe (ahora con su nombre real en la columna,
-- pegarán a su pm correcto o quedarán sin match legítimamente).
-- ---------------------------------------------------------------------
UPDATE propiedades_v2
SET id_proyecto_master = NULL,
    es_para_matching = true,
    metodo_match = NULL,
    confianza_sugerencia_extractor = NULL
WHERE id_proyecto_master = 272;

-- ---------------------------------------------------------------------
-- PASO 3 — MARCAR sugerencias K1 como obsoletas (no re-aplicar)
-- ---------------------------------------------------------------------
-- estado es varchar(20): 'obsoleto_k1' = 11 chars (mismo patrón que 'obsoleto_cross_zona')
UPDATE matching_sugerencias
SET estado = 'obsoleto_k1'
WHERE proyecto_master_sugerido = 272
  AND estado IN ('pendiente', 'pendiente_zona_norte', 'aprobado');

-- ---------------------------------------------------------------------
-- PASO 4 — DESACTIVAR el pm 272 (no es un edificio real)
-- NO se borra (preserva trazabilidad). activo=false lo saca del matching.
-- ---------------------------------------------------------------------
UPDATE proyectos_master
SET activo = false
WHERE id_proyecto_master = 272;

-- ---------------------------------------------------------------------
-- PASO 5 — CONTROL POSTERIOR (debe dar: 0 props en pm272, pm inactivo)
-- ---------------------------------------------------------------------
-- props_aun_en_272 debe ser 0; pm272_activo debe ser false.
-- nombre_aun_k1 debe ser 0 (ninguna prop debe seguir diciendo "K1" tras re-derivar).
SELECT 'DESPUES' AS momento,
       (SELECT COUNT(*) FROM propiedades_v2 WHERE id_proyecto_master = 272) AS props_aun_en_272,
       (SELECT activo FROM proyectos_master WHERE id_proyecto_master = 272) AS pm272_activo,
       (SELECT COUNT(*) FROM propiedades_v2
          WHERE es_para_matching = true
            AND normalize_nombre(nombre_edificio) LIKE '%k1%') AS nombre_aun_k1;

-- Revisar los resultados. Si todo OK:
COMMIT;
-- Si algo se ve mal:
-- ROLLBACK;
