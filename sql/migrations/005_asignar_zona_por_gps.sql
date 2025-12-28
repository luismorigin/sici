-- =============================================================================
-- MIGRACION: 005_asignar_zona_por_gps.sql
-- DESCRIPCION: Funcion para asignar zona y microzona por coordenadas GPS
-- VERSION: 1.0.0
-- FECHA: 28 Diciembre 2025
-- =============================================================================
-- PREREQUISITOS:
--   - Ejecutar 004_microzonas_schema.sql primero
--   - Tabla zonas_geograficas poblada
-- =============================================================================

-- ============================================================================
-- FUNCION: asignar_zona_por_gps
-- Asigna zona y microzona a UNA propiedad por sus coordenadas
-- ============================================================================
CREATE OR REPLACE FUNCTION asignar_zona_por_gps(p_propiedad_id INTEGER)
RETURNS TABLE(
    propiedad_id INTEGER,
    zona_asignada VARCHAR,
    microzona_asignada VARCHAR,
    actualizado BOOLEAN
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_lat NUMERIC;
    v_lon NUMERIC;
    v_zona VARCHAR(100);
    v_microzona VARCHAR(100);
    v_punto GEOMETRY;
BEGIN
    -- Obtener coordenadas de la propiedad
    SELECT latitud, longitud INTO v_lat, v_lon
    FROM propiedades_v2
    WHERE id = p_propiedad_id;

    -- Si no tiene coordenadas, retornar sin cambios
    IF v_lat IS NULL OR v_lon IS NULL THEN
        RETURN QUERY SELECT p_propiedad_id, NULL::VARCHAR, NULL::VARCHAR, FALSE;
        RETURN;
    END IF;

    -- Crear punto geometrico
    v_punto := ST_SetSRID(ST_Point(v_lon, v_lat), 4326);

    -- Buscar en que zona cae el punto
    SELECT zg.zona_general, zg.nombre
    INTO v_zona, v_microzona
    FROM zonas_geograficas zg
    WHERE ST_Contains(zg.geom, v_punto)
      AND zg.activo = TRUE
    LIMIT 1;

    -- Si encontramos zona, actualizar propiedad
    IF v_zona IS NOT NULL THEN
        UPDATE propiedades_v2
        SET zona = v_zona,
            microzona = v_microzona
        WHERE id = p_propiedad_id;

        RETURN QUERY SELECT p_propiedad_id, v_zona, v_microzona, TRUE;
    ELSE
        RETURN QUERY SELECT p_propiedad_id, NULL::VARCHAR, NULL::VARCHAR, FALSE;
    END IF;
END;
$function$;

COMMENT ON FUNCTION asignar_zona_por_gps(INTEGER) IS
'Asigna zona y microzona a una propiedad usando ST_Contains con poligonos de zonas_geograficas.
Prioridad: GPS (no se sobreescribe si ya tiene zona del scraper... actualmente GPS es prioridad).
Retorna: propiedad_id, zona_asignada, microzona_asignada, actualizado (bool)';

-- ============================================================================
-- FUNCION: poblar_zonas_batch
-- Asigna zona/microzona a TODAS las propiedades sin zona
-- ============================================================================
CREATE OR REPLACE FUNCTION poblar_zonas_batch()
RETURNS TABLE(
    total_procesadas INTEGER,
    total_actualizadas INTEGER,
    total_sin_coordenadas INTEGER,
    total_fuera_zonas INTEGER
)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_procesadas INT := 0;
    v_actualizadas INT := 0;
    v_sin_coords INT := 0;
    v_fuera_zonas INT := 0;
BEGIN
    -- Contar propiedades sin coordenadas
    SELECT COUNT(*) INTO v_sin_coords
    FROM propiedades_v2
    WHERE zona IS NULL
      AND (latitud IS NULL OR longitud IS NULL);

    -- Actualizar propiedades que tienen coordenadas y estan dentro de alguna zona
    WITH actualizaciones AS (
        UPDATE propiedades_v2 p
        SET zona = zg.zona_general,
            microzona = zg.nombre
        FROM zonas_geograficas zg
        WHERE p.zona IS NULL
          AND p.latitud IS NOT NULL
          AND p.longitud IS NOT NULL
          AND ST_Contains(zg.geom, ST_SetSRID(ST_Point(p.longitud, p.latitud), 4326))
          AND zg.activo = TRUE
        RETURNING p.id
    )
    SELECT COUNT(*) INTO v_actualizadas FROM actualizaciones;

    -- Contar propiedades con coordenadas pero fuera de todas las zonas
    SELECT COUNT(*) INTO v_fuera_zonas
    FROM propiedades_v2 p
    WHERE p.zona IS NULL
      AND p.latitud IS NOT NULL
      AND p.longitud IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM zonas_geograficas zg
          WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(p.longitud, p.latitud), 4326))
            AND zg.activo = TRUE
      );

    v_procesadas := v_actualizadas + v_fuera_zonas;

    RETURN QUERY SELECT v_procesadas, v_actualizadas, v_sin_coords, v_fuera_zonas;
END;
$function$;

COMMENT ON FUNCTION poblar_zonas_batch() IS
'Asigna zona y microzona a TODAS las propiedades que:
- No tienen zona asignada
- Tienen coordenadas GPS validas
- Caen dentro de alguna zona definida en zonas_geograficas
Retorna estadisticas del proceso.';

-- ============================================================================
-- FUNCION: get_zona_by_gps (utilidad)
-- Dado un punto GPS, retorna la zona y microzona
-- ============================================================================
CREATE OR REPLACE FUNCTION get_zona_by_gps(p_lat NUMERIC, p_lon NUMERIC)
RETURNS TABLE(
    zona VARCHAR,
    microzona VARCHAR,
    tipo_desarrollo VARCHAR
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    SELECT
        zg.zona_general::VARCHAR,
        zg.nombre::VARCHAR,
        zg.tipo_desarrollo::VARCHAR
    FROM zonas_geograficas zg
    WHERE ST_Contains(zg.geom, ST_SetSRID(ST_Point(p_lon, p_lat), 4326))
      AND zg.activo = TRUE
    LIMIT 1;
END;
$function$;

COMMENT ON FUNCTION get_zona_by_gps(NUMERIC, NUMERIC) IS
'Utilidad: Dado un punto GPS (lat, lon), retorna zona, microzona y tipo_desarrollo.
Uso: SELECT * FROM get_zona_by_gps(-17.762, -63.195)';

-- ============================================================================
-- EJEMPLOS DE USO
-- ============================================================================

-- Test: Verificar que las zonas tienen geometria valida
-- SELECT id, nombre, ST_IsValid(geom) as valido, ST_Area(geom::geography) as area_m2
-- FROM zonas_geograficas;

-- Test: Encontrar zona de un punto especifico
-- SELECT * FROM get_zona_by_gps(-17.7620, -63.1950);

-- Poblar todas las propiedades sin zona
-- SELECT * FROM poblar_zonas_batch();

-- Ver propiedades por microzona (despues de poblar)
-- SELECT microzona, COUNT(*) FROM propiedades_v2 GROUP BY microzona ORDER BY COUNT(*) DESC;

-- =============================================================================
-- FIN MIGRACION 005
-- =============================================================================
