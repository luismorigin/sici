-- =====================================================
-- MIGRACIÓN 017: Mejoras al Sistema de Matching
-- Fecha: 4 Enero 2026
-- Propósito: Prevenir problemas de duplicados y
--            asignaciones incorrectas encontrados en
--            auditoría Sky Properties
-- =====================================================
-- PRERREQUISITO: Ejecutar 016_limpieza_sky_properties.sql
-- =====================================================

-- =====================================================
-- MEJORA 1: FK formal en propiedades_v2
-- =====================================================
-- Propósito: Garantizar integridad referencial entre
--            propiedades y proyectos. Si se elimina un
--            proyecto, las propiedades quedan sin asignar
--            (NULL) en lugar de apuntar a ID inexistente.
--
-- Beneficios:
--   - Evita propiedades huérfanas
--   - DELETE de proyectos falla si hay props (sin SET NULL)
--   - Documentación implícita de la relación
-- =====================================================

-- Primero verificar que no hay propiedades apuntando a proyectos inexistentes
DO $$
DECLARE
    v_huerfanas INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_huerfanas
    FROM propiedades_v2 pv
    WHERE pv.id_proyecto_master IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM proyectos_master pm
          WHERE pm.id_proyecto_master = pv.id_proyecto_master
      );

    IF v_huerfanas > 0 THEN
        RAISE EXCEPTION 'Hay % propiedades apuntando a proyectos inexistentes. Limpiar antes de agregar FK.', v_huerfanas;
    END IF;

    RAISE NOTICE 'Verificación OK: 0 propiedades huérfanas';
END $$;

-- Agregar la FK con ON DELETE SET NULL
ALTER TABLE propiedades_v2
ADD CONSTRAINT fk_propiedades_proyecto_master
FOREIGN KEY (id_proyecto_master)
REFERENCES proyectos_master(id_proyecto_master)
ON DELETE SET NULL;

-- Crear índice para mejorar performance de JOINs (si no existe)
CREATE INDEX IF NOT EXISTS idx_propiedades_proyecto_master
ON propiedades_v2(id_proyecto_master)
WHERE id_proyecto_master IS NOT NULL;

COMMENT ON CONSTRAINT fk_propiedades_proyecto_master ON propiedades_v2 IS
'FK a proyectos_master. ON DELETE SET NULL evita huérfanos. Agregado en migración 017.';


-- =====================================================
-- MEJORA 2: Función verificar_proyecto_duplicado()
-- =====================================================
-- Propósito: Detectar posibles duplicados ANTES de crear
--            un nuevo proyecto, basándose en:
--            - Proximidad GPS (< radio especificado)
--            - Similitud de nombre (fuzzy matching)
--
-- Uso típico:
--   SELECT * FROM verificar_proyecto_duplicado(
--       'Sky Tower Norte', -17.7713, -63.1911, 100
--   );
--
-- Si retorna filas, revisar antes de crear el proyecto.
-- =====================================================

-- Función auxiliar: calcular distancia en metros entre dos puntos GPS
-- (Si ya existe, esta definición la reemplaza)
CREATE OR REPLACE FUNCTION calcular_distancia_metros(
    lat1 NUMERIC,
    lng1 NUMERIC,
    lat2 NUMERIC,
    lng2 NUMERIC
) RETURNS NUMERIC AS $$
DECLARE
    R CONSTANT NUMERIC := 6371000; -- Radio de la Tierra en metros
    phi1 NUMERIC;
    phi2 NUMERIC;
    delta_phi NUMERIC;
    delta_lambda NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    -- Convertir a radianes
    phi1 := RADIANS(lat1);
    phi2 := RADIANS(lat2);
    delta_phi := RADIANS(lat2 - lat1);
    delta_lambda := RADIANS(lng2 - lng1);

    -- Fórmula de Haversine
    a := SIN(delta_phi/2) * SIN(delta_phi/2) +
         COS(phi1) * COS(phi2) *
         SIN(delta_lambda/2) * SIN(delta_lambda/2);
    c := 2 * ATAN2(SQRT(a), SQRT(1-a));

    RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION calcular_distancia_metros IS
'Calcula distancia en metros entre dos puntos GPS usando fórmula de Haversine';

-- Función principal: detectar duplicados
CREATE OR REPLACE FUNCTION verificar_proyecto_duplicado(
    p_nombre TEXT,
    p_lat NUMERIC,
    p_lng NUMERIC,
    p_radio_metros INTEGER DEFAULT 100,
    p_umbral_similitud NUMERIC DEFAULT 0.4
) RETURNS TABLE(
    posible_duplicado_id INTEGER,
    nombre_existente TEXT,
    distancia_metros INTEGER,
    similitud_nombre NUMERIC,
    razon_alerta TEXT
) AS $$
BEGIN
    -- Requiere extensión pg_trgm para similarity()
    -- CREATE EXTENSION IF NOT EXISTS pg_trgm;

    RETURN QUERY
    SELECT
        pm.id_proyecto_master,
        pm.nombre_oficial,
        calcular_distancia_metros(p_lat, p_lng, pm.latitud, pm.longitud)::INTEGER,
        similarity(LOWER(p_nombre), LOWER(pm.nombre_oficial)),
        CASE
            WHEN calcular_distancia_metros(p_lat, p_lng, pm.latitud, pm.longitud) < p_radio_metros
                 AND similarity(LOWER(p_nombre), LOWER(pm.nombre_oficial)) > p_umbral_similitud
            THEN 'ALTA: GPS cercano + nombre similar'
            WHEN calcular_distancia_metros(p_lat, p_lng, pm.latitud, pm.longitud) < p_radio_metros
            THEN 'MEDIA: GPS cercano'
            WHEN similarity(LOWER(p_nombre), LOWER(pm.nombre_oficial)) > p_umbral_similitud
            THEN 'MEDIA: Nombre similar'
            ELSE 'BAJA'
        END
    FROM proyectos_master pm
    WHERE pm.activo = true
      AND pm.latitud IS NOT NULL
      AND pm.longitud IS NOT NULL
      AND (
          -- Cercano por GPS
          calcular_distancia_metros(p_lat, p_lng, pm.latitud, pm.longitud) < p_radio_metros
          OR
          -- Similar por nombre
          similarity(LOWER(p_nombre), LOWER(pm.nombre_oficial)) > p_umbral_similitud
      )
    ORDER BY
        -- Priorizar por nivel de alerta
        CASE
            WHEN calcular_distancia_metros(p_lat, p_lng, pm.latitud, pm.longitud) < p_radio_metros
                 AND similarity(LOWER(p_nombre), LOWER(pm.nombre_oficial)) > p_umbral_similitud
            THEN 1
            ELSE 2
        END,
        calcular_distancia_metros(p_lat, p_lng, pm.latitud, pm.longitud);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION verificar_proyecto_duplicado IS
'Detecta posibles proyectos duplicados por GPS cercano o nombre similar.
Usar ANTES de crear un proyecto nuevo para evitar duplicados.
Ejemplo: SELECT * FROM verificar_proyecto_duplicado(''Sky Tower'', -17.77, -63.19);';


-- =====================================================
-- MEJORA 3: Tabla matching_nombres_genericos (blacklist)
-- =====================================================
-- Propósito: Mantener lista de nombres que NO deben
--            crear proyectos automáticamente porque son
--            demasiado genéricos y causan falsos positivos.
--
-- El matching debe verificar esta tabla antes de crear
-- un proyecto y marcar para revisión manual en su lugar.
-- =====================================================

CREATE TABLE IF NOT EXISTS matching_nombres_genericos (
    id SERIAL PRIMARY KEY,
    patron VARCHAR(100) NOT NULL UNIQUE,
    tipo_patron VARCHAR(20) DEFAULT 'exacto',  -- 'exacto', 'contiene', 'regex'
    razon TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50) DEFAULT 'sistema'
);

COMMENT ON TABLE matching_nombres_genericos IS
'Blacklist de nombres genéricos que no deben crear proyectos automáticamente.
El matching debe verificar esta tabla y marcar para revisión manual.';

COMMENT ON COLUMN matching_nombres_genericos.tipo_patron IS
'exacto: nombre debe coincidir exactamente (case insensitive)
contiene: nombre contiene el patrón
regex: patrón es una expresión regular';

-- Poblar con patrones problemáticos encontrados
INSERT INTO matching_nombres_genericos (patron, tipo_patron, razon) VALUES
    ('Condominio Sky', 'exacto', 'Demasiado genérico - matchea cualquier proyecto Sky'),
    ('Departamento', 'exacto', 'No es nombre de edificio, es tipo de propiedad'),
    ('Edificio', 'exacto', 'No es nombre específico'),
    ('Condominio', 'exacto', 'No es nombre específico'),
    ('Torre', 'exacto', 'Demasiado genérico sin nombre adicional'),
    ('Residencia', 'exacto', 'Demasiado genérico sin nombre adicional'),
    ('De Pre', 'contiene', 'Error de scraping - toma "De Pre-venta" como nombre'),
    ('En Venta', 'contiene', 'Error de scraping - toma descripción como nombre'),
    ('Equipetrol', 'exacto', 'Es zona, no nombre de edificio'),
    ('Santa Cruz', 'exacto', 'Es ciudad, no nombre de edificio')
ON CONFLICT (patron) DO NOTHING;

-- Función para verificar si un nombre es genérico
CREATE OR REPLACE FUNCTION es_nombre_generico(p_nombre TEXT)
RETURNS TABLE(
    es_generico BOOLEAN,
    patron_matcheado VARCHAR(100),
    razon TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        true,
        mng.patron,
        mng.razon
    FROM matching_nombres_genericos mng
    WHERE
        (mng.tipo_patron = 'exacto' AND LOWER(TRIM(p_nombre)) = LOWER(mng.patron))
        OR (mng.tipo_patron = 'contiene' AND LOWER(p_nombre) LIKE '%' || LOWER(mng.patron) || '%')
        OR (mng.tipo_patron = 'regex' AND p_nombre ~* mng.patron)
    LIMIT 1;

    -- Si no matchea ningún patrón, retornar false
    IF NOT FOUND THEN
        RETURN QUERY SELECT false::BOOLEAN, NULL::VARCHAR(100), NULL::TEXT;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION es_nombre_generico IS
'Verifica si un nombre de edificio es demasiado genérico para crear proyecto.
Retorna true y el patrón si matchea la blacklist.
Ejemplo: SELECT * FROM es_nombre_generico(''Condominio Sky'');';


-- =====================================================
-- MEJORA 4: Vista v_proyectos_sin_desarrollador
-- =====================================================
-- Propósito: Auditoría rápida de proyectos que podrían
--            pertenecer a un desarrollador conocido pero
--            no tienen el campo asignado.
--
-- Infiere desarrollador por patrones de nombre conocidos.
-- =====================================================

CREATE OR REPLACE VIEW v_proyectos_sin_desarrollador AS
SELECT
    pm.id_proyecto_master,
    pm.nombre_oficial,
    pm.zona,
    pm.latitud,
    pm.longitud,
    pm.activo,
    pm.created_at,
    -- Contar propiedades asignadas
    (SELECT COUNT(*)
     FROM propiedades_v2 pv
     WHERE pv.id_proyecto_master = pm.id_proyecto_master) as propiedades_count,
    -- Inferir desarrollador por nombre
    CASE
        WHEN pm.nombre_oficial ILIKE '%sky%'
             AND pm.nombre_oficial NOT ILIKE '%eurodesign%'
        THEN 'Sky Properties'
        WHEN pm.nombre_oficial ILIKE '%eurodesign%' THEN 'Eurodesign'
        WHEN pm.nombre_oficial ILIKE '%sommet%' THEN 'Sommet'
        WHEN pm.nombre_oficial ILIKE '%terrazas%' THEN 'Terrazas'
        WHEN pm.nombre_oficial ILIKE '%condado%' THEN 'Condado'
        WHEN pm.nombre_oficial ILIKE '%elite%'
             AND pm.nombre_oficial NOT ILIKE '%sky%'
        THEN 'Elite'
        ELSE 'DESCONOCIDO'
    END as desarrollador_inferido,
    -- Nivel de confianza de la inferencia
    CASE
        WHEN pm.nombre_oficial ILIKE '%sky%'
             AND pm.nombre_oficial NOT ILIKE '%eurodesign%'
        THEN 'ALTA'
        WHEN pm.nombre_oficial ILIKE '%eurodesign%' THEN 'ALTA'
        WHEN pm.nombre_oficial ILIKE '%sommet%' THEN 'ALTA'
        ELSE 'BAJA'
    END as confianza_inferencia
FROM proyectos_master pm
WHERE pm.desarrollador IS NULL
  AND pm.activo = true
ORDER BY
    desarrollador_inferido,
    propiedades_count DESC;

COMMENT ON VIEW v_proyectos_sin_desarrollador IS
'Proyectos activos sin desarrollador asignado con inferencia automática.
Usar para auditorías periódicas y asignación masiva de desarrolladores.';

-- Vista complementaria: resumen por desarrollador inferido
CREATE OR REPLACE VIEW v_resumen_desarrolladores_pendientes AS
SELECT
    desarrollador_inferido,
    confianza_inferencia,
    COUNT(*) as proyectos_sin_asignar,
    SUM(propiedades_count) as propiedades_afectadas
FROM v_proyectos_sin_desarrollador
GROUP BY desarrollador_inferido, confianza_inferencia
ORDER BY propiedades_afectadas DESC;

COMMENT ON VIEW v_resumen_desarrolladores_pendientes IS
'Resumen de proyectos pendientes de asignación de desarrollador, agrupados por inferencia.';


-- =====================================================
-- VERIFICACIÓN FINAL
-- =====================================================

DO $$
DECLARE
    v_fk_exists BOOLEAN;
    v_func_exists BOOLEAN;
    v_table_exists BOOLEAN;
    v_view_exists BOOLEAN;
BEGIN
    -- Verificar FK
    SELECT EXISTS(
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_propiedades_proyecto_master'
    ) INTO v_fk_exists;

    -- Verificar función
    SELECT EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'verificar_proyecto_duplicado'
    ) INTO v_func_exists;

    -- Verificar tabla
    SELECT EXISTS(
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'matching_nombres_genericos'
    ) INTO v_table_exists;

    -- Verificar vista
    SELECT EXISTS(
        SELECT 1 FROM information_schema.views
        WHERE table_name = 'v_proyectos_sin_desarrollador'
    ) INTO v_view_exists;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICACIÓN MIGRACIÓN 017';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'FK propiedades_v2 → proyectos_master: %',
        CASE WHEN v_fk_exists THEN 'OK' ELSE 'FALTA' END;
    RAISE NOTICE 'Función verificar_proyecto_duplicado(): %',
        CASE WHEN v_func_exists THEN 'OK' ELSE 'FALTA' END;
    RAISE NOTICE 'Tabla matching_nombres_genericos: %',
        CASE WHEN v_table_exists THEN 'OK' ELSE 'FALTA' END;
    RAISE NOTICE 'Vista v_proyectos_sin_desarrollador: %',
        CASE WHEN v_view_exists THEN 'OK' ELSE 'FALTA' END;
    RAISE NOTICE '========================================';

    IF NOT (v_fk_exists AND v_func_exists AND v_table_exists AND v_view_exists) THEN
        RAISE WARNING 'Algunos componentes no se instalaron correctamente';
    ELSE
        RAISE NOTICE 'Migración 017 completada exitosamente';
    END IF;
END $$;


-- =====================================================
-- EJEMPLOS DE USO
-- =====================================================
/*
-- 1. Verificar duplicados antes de crear proyecto
SELECT * FROM verificar_proyecto_duplicado(
    'Sky Tower Norte',  -- nombre propuesto
    -17.7713,           -- latitud
    -63.1911,           -- longitud
    100                 -- radio en metros
);

-- 2. Verificar si nombre es genérico
SELECT * FROM es_nombre_generico('Condominio Sky');
-- Retorna: true, 'Condominio Sky', 'Demasiado genérico...'

SELECT * FROM es_nombre_generico('Sky Tower');
-- Retorna: false, NULL, NULL

-- 3. Auditar proyectos sin desarrollador
SELECT * FROM v_proyectos_sin_desarrollador
WHERE desarrollador_inferido = 'Sky Properties';

-- 4. Ver resumen de pendientes
SELECT * FROM v_resumen_desarrolladores_pendientes;

-- 5. Asignar desarrolladores en lote (basado en la vista)
UPDATE proyectos_master pm
SET desarrollador = v.desarrollador_inferido
FROM v_proyectos_sin_desarrollador v
WHERE pm.id_proyecto_master = v.id_proyecto_master
  AND v.confianza_inferencia = 'ALTA'
  AND v.desarrollador_inferido != 'DESCONOCIDO';
*/


-- =====================================================
-- ROLLBACK (si es necesario)
-- =====================================================
/*
-- Quitar FK
ALTER TABLE propiedades_v2
DROP CONSTRAINT IF EXISTS fk_propiedades_proyecto_master;

-- Quitar funciones
DROP FUNCTION IF EXISTS verificar_proyecto_duplicado;
DROP FUNCTION IF EXISTS es_nombre_generico;
DROP FUNCTION IF EXISTS calcular_distancia_metros;

-- Quitar tabla
DROP TABLE IF EXISTS matching_nombres_genericos;

-- Quitar vistas
DROP VIEW IF EXISTS v_resumen_desarrolladores_pendientes;
DROP VIEW IF EXISTS v_proyectos_sin_desarrollador;
*/
