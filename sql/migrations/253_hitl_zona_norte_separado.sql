-- =============================================================================
-- MIGRACION: 253_hitl_zona_norte_separado.sql
-- DESCRIPCION: Separar HITL de Zona Norte del HITL Equipetrol via estado distinto
-- VERSION: 1.0.0
-- FECHA: 27 Mayo 2026
-- PROYECTO: docs/proyectos/zona-norte/ (operación HITL)
-- =============================================================================
-- CONTEXTO:
--   Tras activar Zona Norte (dark launch), las sugerencias del matching que
--   involucran props ZN se mezclaban con las de Equipetrol en el HITL admin
--   (`/admin/supervisor/matching` filtra por `estado='pendiente'`).
--
--   Esto contaminaba el flujo de revisión humana de Equipetrol con cientos de
--   sugerencias ZN que aún no se quieren revisar (ADR-003: Zona Norte arranca
--   sin matching con proyectos_master, decisión post-piloto).
--
-- SOLUCIÓN:
--   1. Las sugerencias EXISTENTES de props ZN que están en estado='pendiente'
--      se mueven a estado='pendiente_zn' (one-shot UPDATE).
--   2. Las 39 sugerencias cross-zona (prop.zona ≠ pm.zona) que el blindaje
--      hubiera evitado se marcan como 'obsoleto_cross_zona'.
--   3. Trigger BEFORE INSERT permanente: cualquier sugerencia futura con
--      estado='pendiente' cuyo propiedad_id sea de zona='Zona Norte' se
--      transforma automáticamente a 'pendiente_zn'.
--
-- CONSECUENCIAS:
--   - `/admin/supervisor/matching` ya NO ve sugerencias ZN. Limpio.
--   - Sugerencias ZN no se pierden — quedan en BD con todos los detalles
--     (propiedad_id, proyecto_master_sugerido, score, razón, método, GPS).
--   - Para revisarlas en el futuro:
--     (a) Query ad-hoc filtrando estado='pendiente_zn'.
--     (b) Reactivar masivo: UPDATE estado='pendiente' WHERE estado='pendiente_zn'.
--     (c) Crear UI separada `/admin/supervisor/matching-zona-norte` cuando se quiera.
--
-- ROLLBACK:
--   - DROP TRIGGER trg_separar_hitl_zona_norte ON matching_sugerencias;
--   - DROP FUNCTION separar_hitl_zona_norte();
--   - UPDATE matching_sugerencias SET estado='pendiente' WHERE estado='pendiente_zn';
--   - UPDATE matching_sugerencias SET estado='pendiente' WHERE estado='obsoleto_cross_zona';
-- =============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Marcar las 39 cross-zona pendientes como obsoletas
-- ============================================================================
-- Son las que el blindaje de mig 252 (generar_matches_trigram same-zone) hubiera
-- evitado generar. NO se borran para mantener trazabilidad histórica.

UPDATE matching_sugerencias ms
SET estado = 'obsoleto_cross_zona',
    notas = COALESCE(ms.notas || ' | ', '') || '[auto 27-may-2026: cross-zona post-blindaje]'
FROM propiedades_v2 p, proyectos_master pm
WHERE ms.propiedad_id = p.id
  AND ms.proyecto_master_sugerido = pm.id_proyecto_master
  AND ms.estado = 'pendiente'
  AND p.zona IS NOT NULL
  AND pm.zona IS NOT NULL
  AND p.zona != pm.zona;

-- ============================================================================
-- PASO 2: Mover sugerencias pending de props ZN a pending_zona_norte
-- ============================================================================

UPDATE matching_sugerencias ms
SET estado = 'pendiente_zn',
    notas = COALESCE(ms.notas || ' | ', '') || '[auto 27-may-2026: separado de HITL Equipetrol]'
FROM propiedades_v2 p
WHERE ms.propiedad_id = p.id
  AND ms.estado = 'pendiente'
  AND p.zona = 'Zona Norte';

-- ============================================================================
-- PASO 3: Trigger permanente
-- ============================================================================

CREATE OR REPLACE FUNCTION separar_hitl_zona_norte()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM propiedades_v2 p
    WHERE p.id = NEW.propiedad_id
      AND p.zona = 'Zona Norte'
  ) THEN
    NEW.estado = 'pendiente_zn';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION separar_hitl_zona_norte() IS
'Trigger function: separa sugerencias HITL de Zona Norte. Convierte estado=pendiente a pendiente_zn si la prop es de zona=Zona Norte. Permite que /admin/supervisor/matching no se contamine con ZN durante el dark launch.';

DROP TRIGGER IF EXISTS trg_separar_hitl_zona_norte ON matching_sugerencias;

CREATE TRIGGER trg_separar_hitl_zona_norte
BEFORE INSERT ON matching_sugerencias
FOR EACH ROW
WHEN (NEW.estado = 'pendiente')
EXECUTE FUNCTION separar_hitl_zona_norte();

COMMIT;

-- =============================================================================
-- VALIDACION POST-MIGRACION
-- =============================================================================
-- 1. Estado actual después de la migración:
-- SELECT estado, COUNT(*) FROM matching_sugerencias GROUP BY estado ORDER BY 2 DESC;
--    Esperado: 0 sugerencias 'pendiente' con prop zona='Zona Norte'.
--
-- 2. Test del trigger (DRY RUN, no commitear):
-- BEGIN;
--   INSERT INTO matching_sugerencias (propiedad_id, proyecto_master_sugerido, metodo_matching, score_confianza, estado)
--   SELECT id, 1, 'test', 50, 'pendiente' FROM propiedades_v2 WHERE zona='Zona Norte' LIMIT 1;
--   SELECT estado FROM matching_sugerencias WHERE metodo_matching='test';
--   -- esperado: 'pendiente_zn'
-- ROLLBACK;
