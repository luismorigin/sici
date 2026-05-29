-- =============================================================================
-- ROLLBACK: 254_microzonas_zona_norte_rollback.sql
-- DESCRIPCION: Reversion completa de migracion 254
-- =============================================================================
-- USO: aplicar SOLO si la validacion post-migracion 254 falla.
-- Tiempo estimado: ~10 minutos.
--
-- ORDEN DE EJECUCION (inverso a 254):
--   1. Restaurar trigger HITL original
--   2. Restaurar zona='Zona Norte' en props
--   3. Restaurar zona='Zona Norte' en pm
--   4. Reactivar poligono macro
--   5. Eliminar 14 poligonos nuevos
--   6. Restaurar CHECK constraint original
--   7. Restaurar get_zona_by_gps() sin filtro activo
-- =============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Restaurar trigger HITL original (mig 253)
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

DROP TRIGGER IF EXISTS trg_separar_hitl_por_macrozona ON matching_sugerencias;

CREATE TRIGGER trg_separar_hitl_zona_norte
BEFORE INSERT ON matching_sugerencias
FOR EACH ROW
WHEN (NEW.estado = 'pendiente')
EXECUTE FUNCTION separar_hitl_zona_norte();

-- Restaurar estado historico
UPDATE matching_sugerencias
SET estado = 'pendiente_zn'
WHERE estado = 'pendiente_zona_norte';

-- ============================================================================
-- PASO 2: Restaurar zona='Zona Norte' en propiedades_v2
-- ============================================================================

UPDATE propiedades_v2
SET zona = 'Zona Norte',
    microzona = 'Zona Norte'
WHERE zona IN (
  '2do-3er anillo La Salle-Banzer',
  '2do-3er anillo Banzer-Alemana',
  '2do-3er anillo Alemana-Mutualista',
  '3er-4to anillo La Salle-Banzer',
  '3er-4to anillo Banzer-Alemana',
  '3er-4to anillo Alemana-Mutualista',
  '4to-6to anillo Radial 26-Banzer',
  '4to-6to anillo Banzer-Alemana',
  '4to-6to anillo Alemana-Mutualista',
  '6to-8vo anillo Radial 26-Banzer',
  '6to-8vo anillo Banzer-Alemana',
  '6to-8vo anillo Alemana-Mutualista',
  '8vo anillo Paraiso - Radial 26-Banzer',
  '8vo anillo Viru Viru - Banzer-G77'
);

-- ============================================================================
-- PASO 3: Restaurar zona='Zona Norte' en proyectos_master
-- ============================================================================

UPDATE proyectos_master
SET zona = 'Zona Norte'
WHERE zona IN (
  '2do-3er anillo La Salle-Banzer',
  '2do-3er anillo Banzer-Alemana',
  '2do-3er anillo Alemana-Mutualista',
  '3er-4to anillo La Salle-Banzer',
  '3er-4to anillo Banzer-Alemana',
  '3er-4to anillo Alemana-Mutualista',
  '4to-6to anillo Radial 26-Banzer',
  '4to-6to anillo Banzer-Alemana',
  '4to-6to anillo Alemana-Mutualista',
  '6to-8vo anillo Radial 26-Banzer',
  '6to-8vo anillo Banzer-Alemana',
  '6to-8vo anillo Alemana-Mutualista',
  '8vo anillo Paraiso - Radial 26-Banzer',
  '8vo anillo Viru Viru - Banzer-G77'
);

-- ============================================================================
-- PASO 4: Reactivar poligono macro Zona Norte
-- ============================================================================

UPDATE zonas_geograficas
SET activo = TRUE
WHERE nombre = 'Zona Norte';

-- ============================================================================
-- PASO 5: Eliminar 14 poligonos nuevos
-- ============================================================================

DELETE FROM zonas_geograficas
WHERE zona_general = 'Zona Norte'
  AND nombre IN (
    '2do-3er anillo La Salle-Banzer',
    '2do-3er anillo Banzer-Alemana',
    '2do-3er anillo Alemana-Mutualista',
    '3er-4to anillo La Salle-Banzer',
    '3er-4to anillo Banzer-Alemana',
    '3er-4to anillo Alemana-Mutualista',
    '4to-6to anillo Radial 26-Banzer',
    '4to-6to anillo Banzer-Alemana',
    '4to-6to anillo Alemana-Mutualista',
    '6to-8vo anillo Radial 26-Banzer',
    '6to-8vo anillo Banzer-Alemana',
    '6to-8vo anillo Alemana-Mutualista',
    '8vo anillo Paraiso - Radial 26-Banzer',
    '8vo anillo Viru Viru - Banzer-G77'
  );

-- ============================================================================
-- PASO 6: Restaurar CHECK constraint original
-- ============================================================================

ALTER TABLE propiedades_v2 DROP CONSTRAINT zona_valida;

ALTER TABLE propiedades_v2 ADD CONSTRAINT zona_valida CHECK (
  zona IS NULL OR zona IN (
    'Equipetrol Centro', 'Equipetrol Norte', 'Equipetrol Oeste',
    'Sirari', 'Villa Brigida', 'Eq. 3er Anillo',
    'Sin zona', 'Zona Norte'
  )
);

-- ============================================================================
-- PASO 7: Restaurar get_zona_by_gps() sin filtro activo
-- ============================================================================
-- Nota: este "rollback" mantiene el bug original donde la funcion no
-- filtraba por activo. Si se quiere, mantener el fix de mig 254.

CREATE OR REPLACE FUNCTION get_zona_by_gps(p_lat double precision, p_lon double precision)
RETURNS TABLE(zona text)
LANGUAGE sql
STABLE
AS $function$
  SELECT zg.nombre::TEXT AS zona
  FROM zonas_geograficas zg
  WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
  LIMIT 1;
$function$;

COMMIT;

-- =============================================================================
-- VALIDACION POST-ROLLBACK
-- =============================================================================
-- 1. Confirmar que zona='Zona Norte' tiene props:
--    SELECT COUNT(*) FROM propiedades_v2 WHERE zona='Zona Norte';
--    Esperado: 520 (o cerca, segun cambios mientras estuvo el rollback en BD)
--
-- 2. Confirmar que las 14 microzonas NO existen:
--    SELECT COUNT(*) FROM zonas_geograficas WHERE zona_general='Zona Norte';
--    Esperado: 1 (solo el macro restaurado)
--
-- 3. Confirmar trigger HITL viejo activo:
--    SELECT tgname FROM pg_trigger WHERE tgrelid='matching_sugerencias'::regclass;
--    Esperado: trg_separar_hitl_zona_norte (sin _por_macrozona)
