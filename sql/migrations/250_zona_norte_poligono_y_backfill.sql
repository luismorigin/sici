-- =============================================================================
-- MIGRACION: 250_zona_norte_poligono_y_backfill.sql
-- DESCRIPCION: Cargar polígono macro Zona Norte + ampliar CHECK + backfill legacy
-- VERSION: 1.0.0
-- FECHA: 26 Mayo 2026
-- PROYECTO: docs/proyectos/zona-norte/ (Fase 2 del PRD)
-- =============================================================================
-- CONTEXTO:
--   1. Ampliar CHECK constraint zona_valida para aceptar 'Zona Norte'.
--   2. Insertar polígono macro Zona Norte en zonas_geograficas.
--      Polígono dibujado por Lucho (geojson.io). Se subdividirá en microzonas
--      después — ADR-008 dice que es seguro: el GPS guardado permite re-asignar
--      con get_zona_by_gps() en cualquier momento.
--   3. Backfill: re-etiquetar props/proyectos legacy que físicamente caen dentro
--      del polígono pero conservan etiquetas viejas pre-migración 184.
--
-- DATOS PRE-MIGRACION (auditoría 26-may-2026):
--   - 0 props con zona='Zona Norte' (esperado: CHECK lo impedía).
--   - 17 proyectos master con zona='Sin zona' caen dentro del polígono.
--   - 16 props con zona='Equipetrol Centro/Norte' caen dentro (legacy).
--   - 7 props con zona='Sin zona' caen dentro.
--   - Cero overlap geométrico problemático con polígonos Equipetrol.
--
-- ROLLBACK (al final del archivo).
-- =============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Ampliar CHECK constraint zona_valida
-- ============================================================================

ALTER TABLE propiedades_v2 DROP CONSTRAINT IF EXISTS zona_valida;

ALTER TABLE propiedades_v2 ADD CONSTRAINT zona_valida
CHECK (
  zona IS NULL OR zona IN (
    'Equipetrol Centro',
    'Equipetrol Norte',
    'Equipetrol Oeste',
    'Sirari',
    'Villa Brigida',
    'Eq. 3er Anillo',
    'Sin zona',
    'Zona Norte'
  )
);

-- ============================================================================
-- PASO 2: Insertar polígono macro Zona Norte
-- ============================================================================
-- Polígono de prueba dibujado por Lucho. Bbox: lat -17.77 a -17.71, lon -63.20 a -63.14.
-- Área aprox 27.7 km².

DELETE FROM zonas_geograficas WHERE nombre = 'Zona Norte';

INSERT INTO zonas_geograficas (nombre, zona_general, descripcion, tipo_desarrollo, geom, activo)
VALUES (
  'Zona Norte',
  'Zona Norte',
  'Polígono macro Zona Norte (Av. Banzer, 3er al 7mo anillo). MVP de expansión geográfica. Se subdividirá en microzonas tras validar el pipeline.',
  'Consolidado - vertical en expansión',
  ST_SetSRID(ST_GeomFromGeoJSON('{
    "type": "Polygon",
    "coordinates": [[
      [-63.1887442, -17.7711402],
      [-63.1911289, -17.7638931],
      [-63.1908541, -17.7577448],
      [-63.1905794, -17.7544743],
      [-63.191953, -17.7523812],
      [-63.1949975, -17.7455447],
      [-63.1919555, -17.7279512],
      [-63.1871634, -17.717083],
      [-63.1868211, -17.711866],
      [-63.19013, -17.7095835],
      [-63.1902441, -17.707627],
      [-63.1530088, -17.7196051],
      [-63.1362621, -17.7282961],
      [-63.1596001, -17.7635772],
      [-63.1682074, -17.7716212],
      [-63.1710839, -17.7702516],
      [-63.1712893, -17.7703494],
      [-63.1887442, -17.7711402]
    ]]
  }'), 4326),
  true
);

-- Smoke test del polígono: punto en Banzer 5to anillo aprox debe dar 'Zona Norte'
DO $$
DECLARE
  v_zona text;
BEGIN
  SELECT zona INTO v_zona FROM get_zona_by_gps(-17.7480, -63.1797);
  IF v_zona != 'Zona Norte' THEN
    RAISE EXCEPTION 'Smoke test falló: esperado Zona Norte, obtuve %', v_zona;
  END IF;
  RAISE NOTICE 'Smoke test OK: GPS de Brickell 4 mapea a %', v_zona;
END $$;

-- ============================================================================
-- PASO 3: Backfill puntual de proyectos_master
-- ============================================================================
-- Los 17 proyectos master con zona='Sin zona' cuyo GPS cae dentro del polígono
-- nuevo deben re-etiquetarse. Acotado: solo si el polígono nuevo los contiene.

UPDATE proyectos_master pm
SET zona = (SELECT zona FROM get_zona_by_gps(pm.latitud, pm.longitud) LIMIT 1),
    updated_at = NOW()
WHERE pm.zona = 'Sin zona'
  AND pm.latitud IS NOT NULL
  AND pm.longitud IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM zonas_geograficas zg
    WHERE zg.nombre = 'Zona Norte'
      AND ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(pm.longitud, pm.latitud), 4326))
  );

-- ============================================================================
-- PASO 4: Backfill puntual de propiedades_v2
-- ============================================================================
-- Re-etiquetar props legacy cuya zona actual NO coincide con la real geográfica.
-- Acotado: solo props cuyo GPS cae dentro del polígono Zona Norte nuevo.
-- Esto incluye: 7 "Sin zona", 13 "Equipetrol Centro", 3 "Equipetrol Norte" (legacy
-- pre-migración 184), más cualquier NULL que pueda haber.

UPDATE propiedades_v2 p
SET zona = 'Zona Norte'
WHERE p.latitud IS NOT NULL
  AND p.longitud IS NOT NULL
  AND p.zona IS DISTINCT FROM 'Zona Norte'
  AND EXISTS (
    SELECT 1 FROM zonas_geograficas zg
    WHERE zg.nombre = 'Zona Norte'
      AND ST_Contains(zg.geom, ST_SetSRID(ST_MakePoint(p.longitud, p.latitud), 4326))
  );

-- ============================================================================
-- VERIFICACION POST-MIGRACION
-- ============================================================================
-- Correr manualmente después del COMMIT:
--
-- -- 1. Polígono activo y nombrado correcto
-- SELECT nombre, activo, ST_Area(geom::geography)/1000000 AS km2
-- FROM zonas_geograficas WHERE nombre = 'Zona Norte';
--
-- -- 2. Conteo de props re-etiquetadas
-- SELECT zona, COUNT(*) FROM propiedades_v2 WHERE zona = 'Zona Norte' GROUP BY zona;
-- -- Esperado: ~16+7+otros = 23-30 props
--
-- -- 3. Conteo de proyectos master re-etiquetados
-- SELECT zona, COUNT(*) FROM proyectos_master WHERE zona = 'Zona Norte' GROUP BY zona;
-- -- Esperado: 17 proyectos
--
-- -- 4. Sanity: proyectos "Sin zona" restantes (los 22 satélite verdadero)
-- SELECT COUNT(*) FROM proyectos_master WHERE zona = 'Sin zona';
-- -- Esperado: 22 (39 - 17 reasignados)

COMMIT;

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- BEGIN;
-- UPDATE propiedades_v2 SET zona = NULL WHERE zona = 'Zona Norte';
--    -- (atención: pierde la zona específica anterior; sólo aplicar si no se enriqueció)
-- UPDATE proyectos_master SET zona = 'Sin zona' WHERE zona = 'Zona Norte';
-- DELETE FROM zonas_geograficas WHERE nombre = 'Zona Norte';
-- ALTER TABLE propiedades_v2 DROP CONSTRAINT zona_valida;
-- ALTER TABLE propiedades_v2 ADD CONSTRAINT zona_valida CHECK (
--   zona IS NULL OR zona IN ('Equipetrol Centro','Equipetrol Norte','Equipetrol Oeste',
--                            'Sirari','Villa Brigida','Eq. 3er Anillo','Sin zona')
-- );
-- COMMIT;
