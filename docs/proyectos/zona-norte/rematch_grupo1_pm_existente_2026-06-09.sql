-- =====================================================================
-- RE-MATCH Grupo 1: props ZN sin match cuyo pm YA EXISTE
-- Fecha: 2026-06-09  |  Auditoría matching Zona Norte
-- Estado: NO APLICADO — revisar antes de ejecutar en Supabase
--
-- CONTEXTO: tras limpiar K1, quedaron props sin match cuyo nombre real
-- (llm_output) coincide EXACTO con un pm activo de Zona Norte. Se re-matchean
-- de forma determinística y SEGURA: nombre normalizado idéntico + GPS <= 350m
-- (evita falsos por homónimos lejanos). Son matches CORRECTOS (nombre real =
-- pm real), así que no recrean el agujero negro de K1.
--
-- Cobertura: ~48 props (incluye Mangales Blue, HH Home, Essenzia, Moderna,
-- Domus, Ziri, Limco, Santa Fe, etc.).
-- EXCLUIDO a propósito: prop 2076 "Condominio Baruc Norte" -> "Torre Baruc
-- Norte" a 1137m (nombre no idéntico + lejos) → revisar aparte.
-- =====================================================================

BEGIN;

WITH zn AS (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte'),
sinmatch AS (
  SELECT p.id, p.latitud, p.longitud,
         normalize_nombre(NULLIF(TRIM(COALESCE(p.datos_json_enrichment->'llm_output'->>'nombre_edificio', p.nombre_edificio)),'')) AS nn
  FROM propiedades_v2 p JOIN zn ON p.zona=zn.nombre
  WHERE p.status='completado' AND p.duplicado_de IS NULL AND p.id_proyecto_master IS NULL
),
asignaciones AS (
  SELECT DISTINCT ON (s.id) s.id AS prop_id, pm.id_proyecto_master AS pm_id, pm.nombre_oficial
  FROM sinmatch s
  JOIN proyectos_master pm ON normalize_nombre(pm.nombre_oficial) = s.nn
  JOIN zn ON pm.zona = zn.nombre
  WHERE pm.activo = true AND s.nn IS NOT NULL
    AND sqrt(power((s.latitud-pm.latitud)*111000,2)+power((s.longitud-pm.longitud)*106000,2)) <= 350
  ORDER BY s.id,
           sqrt(power((s.latitud-pm.latitud)*111000,2)+power((s.longitud-pm.longitud)*106000,2)) ASC
)
UPDATE propiedades_v2 p
SET id_proyecto_master = a.pm_id,
    nombre_edificio = CASE WHEN NOT campo_esta_bloqueado(p.campos_bloqueados,'nombre_edificio')
                           THEN a.nombre_oficial ELSE p.nombre_edificio END,
    es_para_matching = false,
    metodo_match = 'rematch_k1',
    confianza_sugerencia_extractor = 95
FROM asignaciones a
WHERE p.id = a.prop_id;

-- Limpiar sus sugerencias en la cola HITL ZN (ya resueltas)
UPDATE matching_sugerencias ms
SET estado = 'aplicado_rematch'
WHERE ms.estado = 'pendiente_zona_norte'
  AND ms.propiedad_id IN (SELECT id FROM propiedades_v2 WHERE metodo_match='rematch_k1' AND id_proyecto_master IS NOT NULL);

-- ---------------------------------------------------------------------
-- CONTROL: cuántas se re-matchearon + nuevo match rate venta ZN
-- ---------------------------------------------------------------------
SELECT 'rematcheadas' AS metrica, COUNT(*)::text AS valor
FROM propiedades_v2 WHERE metodo_match='rematch_k1'
UNION ALL
SELECT 'match_rate_venta_zn_%',
  ROUND(100.0*COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL)/NULLIF(COUNT(*),0),1)::text
FROM propiedades_v2 p
WHERE p.zona IN (SELECT nombre FROM zonas_geograficas WHERE zona_general='Zona Norte')
  AND p.tipo_operacion='venta' AND p.status='completado' AND p.duplicado_de IS NULL;

COMMIT;
-- ROLLBACK;  -- si algo se ve mal
