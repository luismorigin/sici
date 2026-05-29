-- =============================================================================
-- MIGRACION: 254_microzonas_zona_norte.sql
-- DESCRIPCION: Cargar 14 microzonas Zona Norte + refactor trigger HITL
-- VERSION: 1.0.0
-- FECHA: 29-may-2026 (preparado, no aplicado todavia)
-- PROYECTO: docs/proyectos/zona-norte/ (Ticket #8 del BACKLOG)
-- =============================================================================
-- CONTEXTO:
--   Cierre del piloto Zona Norte. Carga las 14 microzonas dibujadas por
--   el director (anillos viales x avenidas longitudinales: La Salle, Banzer,
--   Alemana, Mutualista, Radial 26, G77). El poligono macro "Zona Norte" se
--   desactiva. Las 520 props y 73 pm con zona='Zona Norte' se redistribuyen.
--
-- DECISIONES (ver docs/proyectos/zona-norte/PLAN_IMPLEMENTACION_MICROZONAS.md):
--   - Modelo PLANO: las 14 microzonas son zonas hermanas (zona = nombre).
--   - zonas_geograficas.zona_general='Zona Norte' marca pertenencia a la
--     macrozona pero NO se usa para asignar p.zona (queda latente).
--   - Refactor trigger HITL: separar_hitl_zona_norte() pasa a usar
--     zona_general (mas escalable, evita contaminacion EQ HITL).
--   - Snapshot refactor en migracion separada (255) con paralelizacion.
--
-- VALIDACIONES PRE-MIGRACION (correr antes y guardar resultados):
--   1. SELECT zona, COUNT(*) FROM propiedades_v2 GROUP BY zona;
--   2. SELECT zona, COUNT(*) FROM proyectos_master GROUP BY zona;
--   3. SELECT fecha, dormitorios, venta_activas FROM market_absorption_snapshots
--      WHERE zona='global' AND fecha=CURRENT_DATE ORDER BY dormitorios;
--   4. SELECT estado, COUNT(*) FROM matching_sugerencias GROUP BY estado;
--
-- ROLLBACK: ver sql/migrations/254_microzonas_zona_norte_rollback.sql
-- =============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Ampliar CHECK constraint zona_valida con 14 microzonas ZN nuevas
-- ============================================================================
-- IMPORTANTE: esto debe ir ANTES de los UPDATEs de props/pm porque sino
-- los UPDATE con nombres nuevos fallan con constraint violation.

ALTER TABLE propiedades_v2 DROP CONSTRAINT IF EXISTS zona_valida;

ALTER TABLE propiedades_v2 ADD CONSTRAINT zona_valida CHECK (
  zona IS NULL OR zona IN (
    -- 6 zonas EQ existentes (INTACTAS)
    'Equipetrol Centro', 'Equipetrol Norte', 'Equipetrol Oeste',
    'Sirari', 'Villa Brigida', 'Eq. 3er Anillo',
    -- legacy permitidos (backward compat)
    'Sin zona', 'Zona Norte',
    -- 14 microzonas ZN nuevas
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
  )
);

-- ============================================================================
-- PASO 2: INSERT 14 poligonos ZN con zona_general='Zona Norte'
-- ============================================================================
-- Las coordenadas vienen de:
-- docs/proyectos/zona-norte/microzonas-propuesta/microzonas-zn-final-recortado.geojson
--
-- Los 2 poligonos del 2do-3er y 3er-4to del lado oeste (La Salle-Banzer)
-- estan RECORTADOS via ST_Difference contra EQ activo para evitar overlap.

INSERT INTO zonas_geograficas (nombre, zona_general, geom, activo) VALUES
('2do-3er anillo La Salle-Banzer', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.191008 -17.765681,-63.191082 -17.762212,-63.187253 -17.76083,-63.182815 -17.759935,-63.179036 -17.759563,-63.181929 -17.766685,-63.18245 -17.768471,-63.182554 -17.770258,-63.182606 -17.770283,-63.188461 -17.771792,-63.189858 -17.769539,-63.190468 -17.768379,-63.191008 -17.765681))', 4326),
 TRUE),
('2do-3er anillo Banzer-Alemana', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.182366 -17.770301,-63.171265 -17.770183,-63.170553 -17.768752,-63.167589 -17.760812,-63.16871 -17.760512,-63.172242 -17.7598,-63.174794 -17.759488,-63.178919 -17.759565,-63.181857 -17.766867,-63.182296 -17.768384,-63.182366 -17.770301))', 4326),
 TRUE),
('2do-3er anillo Alemana-Mutualista', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.171097 -17.770218,-63.168132 -17.771527,-63.168092 -17.77152,-63.164211 -17.768253,-63.162834 -17.766882,-63.160803 -17.764638,-63.161601 -17.76404,-63.163548 -17.762652,-63.165509 -17.761634,-63.167524 -17.760853,-63.170195 -17.768025,-63.171097 -17.770218))', 4326),
 TRUE),
('3er-4to anillo La Salle-Banzer', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.192049 -17.751954,-63.186806 -17.75036,-63.180773 -17.749608,-63.175214 -17.750059,-63.179015 -17.759482,-63.182621 -17.759855,-63.187164 -17.76076,-63.191089 -17.762096,-63.190516 -17.754504,-63.19107 -17.753582,-63.191347 -17.753049,-63.191457 -17.752939,-63.192049 -17.751954))', 4326),
 TRUE),
('3er-4to anillo Banzer-Alemana', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.178913 -17.759491,-63.174756 -17.75942,-63.172079 -17.759794,-63.170213 -17.760103,-63.167481 -17.760798,-63.163941 -17.751723,-63.169198 -17.750775,-63.175215 -17.750106,-63.178913 -17.759491))', 4326),
 TRUE),
('3er-4to anillo Alemana-Mutualista', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.167424 -17.760815,-63.165205 -17.761721,-63.163395 -17.762698,-63.160821 -17.764558,-63.159845 -17.763613,-63.159106 -17.762568,-63.154973 -17.756571,-63.158768 -17.753879,-63.161119 -17.752705,-63.163901 -17.751756,-63.167424 -17.760815))', 4326),
 TRUE),
('4to-6to anillo Radial 26-Banzer', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.192361 -17.751563,-63.192309 -17.751649,-63.192234 -17.751827,-63.186942 -17.7503,-63.180648 -17.749472,-63.175266 -17.74997,-63.168296 -17.73216,-63.190427 -17.724942,-63.191804 -17.728412,-63.19485 -17.74551,-63.192361 -17.751563))', 4326),
 TRUE),
('4to-6to anillo Banzer-Alemana', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.175243 -17.749823,-63.163918 -17.751576,-63.16387 -17.751599,-63.161018 -17.744326,-63.159654 -17.742767,-63.154325 -17.737248,-63.160266 -17.73489,-63.168218 -17.732215,-63.171508 -17.740552,-63.175243 -17.749823))', 4326),
 TRUE),
('4to-6to anillo Alemana-Mutualista', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.163767 -17.75163,-63.161036 -17.75262,-63.158871 -17.753702,-63.157393 -17.754728,-63.155177 -17.756477,-63.145658 -17.742307,-63.154272 -17.737299,-63.160986 -17.744382,-63.163767 -17.75163))', 4326),
 TRUE),
('6to-8vo anillo Radial 26-Banzer', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.19044 -17.724862,-63.168238 -17.732075,-63.168238 -17.732089,-63.168224 -17.732102,-63.162128 -17.7164,-63.190183 -17.707782,-63.189935 -17.709484,-63.186663 -17.712036,-63.187073 -17.717234,-63.19044 -17.724862))', 4326),
 TRUE),
('6to-8vo anillo Banzer-Alemana', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.168145 -17.732184,-63.154239 -17.737142,-63.154239 -17.737142,-63.144822 -17.722907,-63.152744 -17.719802,-63.154675 -17.71894,-63.156764 -17.718327,-63.162026 -17.716411,-63.168145 -17.732184))', 4326),
 TRUE),
('6to-8vo anillo Alemana-Mutualista', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.154106 -17.737243,-63.145534 -17.742276,-63.145508 -17.742314,-63.13621 -17.728208,-63.144775 -17.723047,-63.154106 -17.737243))', 4326),
 TRUE),
('8vo anillo Paraiso - Radial 26-Banzer', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.190246 -17.707519,-63.162221 -17.716554,-63.162192 -17.716568,-63.161164 -17.714045,-63.160413 -17.71154,-63.160093 -17.709215,-63.159929 -17.70579,-63.15969 -17.696944,-63.159565 -17.693751,-63.169433 -17.688989,-63.175137 -17.684715,-63.180455 -17.683494,-63.188721 -17.693323,-63.18827 -17.696527,-63.192825 -17.697963,-63.192607 -17.703171,-63.190491 -17.702752,-63.189154 -17.702944,-63.188668 -17.703119,-63.188111 -17.703731,-63.188812 -17.704613,-63.18967 -17.706206,-63.190246 -17.707519))', 4326),
 TRUE),
('8vo anillo Viru Viru - Banzer-G77', 'Zona Norte',
 ST_GeomFromText('POLYGON((-63.162025 -17.716415,-63.154571 -17.718953,-63.144794 -17.722856,-63.136294 -17.727994,-63.111311 -17.693177,-63.133612 -17.664008,-63.158541 -17.674444,-63.159402 -17.693775,-63.160181 -17.710697,-63.160501 -17.712057,-63.161047 -17.713857,-63.162025 -17.716415))', 4326),
 TRUE);

-- ============================================================================
-- PASO 3: Desactivar poligono macro 'Zona Norte'
-- ============================================================================
-- Las 14 microzonas lo reemplazan. Se mantiene la fila (no DELETE) por
-- trazabilidad historica y para rollback rapido.

UPDATE zonas_geograficas
SET activo = FALSE
WHERE nombre = 'Zona Norte';

-- ============================================================================
-- PASO 4: Fix get_zona_by_gps() para filtrar por activo
-- ============================================================================
-- Bug latente preexistente: la funcion no filtraba por activo y por eso
-- aun con macro desactivado podria devolverlo. Fix general.

CREATE OR REPLACE FUNCTION get_zona_by_gps(p_lat double precision, p_lon double precision)
RETURNS TABLE(zona text)
LANGUAGE sql
STABLE
AS $function$
  SELECT zg.nombre::TEXT AS zona
  FROM zonas_geograficas zg
  WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
    AND zg.activo = TRUE
  LIMIT 1;
$function$;

-- ============================================================================
-- PASO 5: Redistribuir las 520 props ZN en las 14 microzonas
-- ============================================================================
-- Las props con zona='Zona Norte' se reasignan a la microzona donde caen
-- segun get_zona_by_gps(). Las 393 venta activas + 127 otras (alquiler,
-- inactivas, pending) caen todas dentro de alguna microzona (verificado:
-- 0 props caen en gaps).

-- NOTA (fix 29-may): PostgreSQL no permite que un LATERAL en el FROM
-- referencie la tabla target del UPDATE (p). Se envuelve el LATERAL sobre una
-- instancia separada (p2) en una subconsulta y se une por PK. Semanticamente
-- identico: mismo get_zona_by_gps() con su LIMIT 1 interno y mismos filtros.
UPDATE propiedades_v2 p
SET
  zona = sub.nueva_zona,
  microzona = sub.nueva_zona
FROM (
  SELECT p2.id, z.zona AS nueva_zona
  FROM propiedades_v2 p2
  CROSS JOIN LATERAL (
    SELECT zona FROM get_zona_by_gps(p2.latitud, p2.longitud)
  ) z
  WHERE p2.zona = 'Zona Norte'
    AND p2.latitud IS NOT NULL
    AND p2.longitud IS NOT NULL
    AND z.zona IS NOT NULL
) sub
WHERE p.id = sub.id;

-- NOTA: si alguna prop queda sin actualizar (zona aun = 'Zona Norte'),
-- es porque su GPS no cayo en ninguna microzona ni el macro (que ya esta
-- desactivado). En ese caso queda con zona='Zona Norte' que ahora es
-- legacy. El CHECK constraint lo permite. Investigar caso por caso.

-- ============================================================================
-- PASO 6: Redistribuir los 73 pm ZN en las 14 microzonas
-- ============================================================================

-- NOTA (fix 29-may): mismo patron que PASO 5 (LATERAL sobre instancia separada
-- pm2, union por PK id_proyecto_master).
UPDATE proyectos_master pm
SET zona = sub.nueva_zona
FROM (
  SELECT pm2.id_proyecto_master AS id, z.zona AS nueva_zona
  FROM proyectos_master pm2
  CROSS JOIN LATERAL (
    SELECT zona FROM get_zona_by_gps(pm2.latitud, pm2.longitud)
  ) z
  WHERE pm2.zona = 'Zona Norte'
    AND pm2.latitud IS NOT NULL
    AND pm2.longitud IS NOT NULL
    AND z.zona IS NOT NULL
) sub
WHERE pm.id_proyecto_master = sub.id;

-- ============================================================================
-- PASO 7: Refactor trigger HITL para usar zona_general
-- ============================================================================
-- ANTES: separar_hitl_zona_norte() hardcodeaba zona='Zona Norte' literal.
-- DESPUES: usa zona_general para soportar cualquier macrozona en piloto.
--
-- Beneficios:
--   1. Funciona con las 14 microzonas ZN (no rompe HITL post-migracion).
--   2. Escalable: cuando llegue Urubo, basta agregar 'Urubo' a la lista IN
--      o eliminar el filtro para separar HITL de toda macrozona no-EQ.
--   3. Estado generado dinamico: 'pendiente_zona_norte' en vez de
--      'pendiente_zn' (mas legible, escalable a 'pendiente_urubo').

CREATE OR REPLACE FUNCTION separar_hitl_por_macrozona()
RETURNS TRIGGER AS $$
DECLARE
  v_macrozona TEXT;
BEGIN
  -- Buscar la macrozona de la propiedad via zona_general
  SELECT zg.zona_general INTO v_macrozona
  FROM propiedades_v2 p
  JOIN zonas_geograficas zg ON zg.nombre = p.zona
  WHERE p.id = NEW.propiedad_id;

  -- Si la macrozona esta en piloto (NO Equipetrol), separar el HITL
  -- TODO(ticket #11): cuando se refactorice a sistema dinamico, leer
  -- desde tabla config las macrozonas en piloto en vez de hardcode.
  IF v_macrozona IS NOT NULL
     AND v_macrozona NOT IN ('Equipetrol')
  THEN
    NEW.estado = 'pendiente_' || LOWER(REPLACE(v_macrozona, ' ', '_'));
    -- Genera: 'pendiente_zona_norte', 'pendiente_urubo', etc.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reemplazar trigger antiguo por el nuevo
DROP TRIGGER IF EXISTS trg_separar_hitl_zona_norte ON matching_sugerencias;

CREATE TRIGGER trg_separar_hitl_por_macrozona
BEFORE INSERT ON matching_sugerencias
FOR EACH ROW
WHEN (NEW.estado = 'pendiente')
EXECUTE FUNCTION separar_hitl_por_macrozona();

COMMENT ON FUNCTION separar_hitl_por_macrozona() IS
'v2 (mig 254): Separa sugerencias HITL de macrozonas en piloto via
zona_general. Convierte estado=pendiente a pendiente_<macrozona> si la prop
es de macrozona != Equipetrol. Soporta multiples macrozonas en piloto
simultaneamente. Reemplaza a separar_hitl_zona_norte() (mig 253) que
hardcodeaba zona literal.';

-- ============================================================================
-- MIGRACION DEL ESTADO HISTORICO HITL
-- ============================================================================
-- Las sugerencias que hoy tienen estado='pendiente_zn' (del trigger viejo)
-- se renombran a 'pendiente_zona_norte' (formato nuevo del trigger).
-- Esto es opcional pero da consistencia entre sugerencias viejas y nuevas.

UPDATE matching_sugerencias
SET estado = 'pendiente_zona_norte'
WHERE estado = 'pendiente_zn';

COMMIT;

-- =============================================================================
-- VALIDACION POST-MIGRACION
-- =============================================================================
-- Correr cada CHECK y comparar contra baseline. Ver
-- docs/proyectos/zona-norte/PLAN_IMPLEMENTACION_MICROZONAS.md seccion
-- "Validacion POST FASE 1" para los 8 CHECKs.
--
-- Resumen:
--   1. 14 poligonos ZN activos
--   2. Macro Zona Norte desactivado
--   3. Props ZN distribuidas (0 quedan en 'Zona Norte')
--   4. Pm ZN distribuidos
--   5. EQ produccion intacto (vs baseline 1)
--   6. Matching ZN funciona
--   7. Trigger HITL nuevo funciona (DRY RUN)
--   8. get_zona_by_gps() filtra por activo

-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- Ver: sql/migrations/254_microzonas_zona_norte_rollback.sql
