-- =====================================================
-- MIGRACION 088: Tabla Desarrolladores Master
-- Fecha: 29 Enero 2026
-- Propósito: Normalizar desarrolladores para vinculación
--            consistente desde proyectos_master
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- =====================================================
-- PASO 1: Crear tabla desarrolladores
-- =====================================================

CREATE TABLE IF NOT EXISTS desarrolladores (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL UNIQUE,
    nombre_comercial VARCHAR(255),     -- Alias/nombre corto para display
    contacto_nombre VARCHAR(255),
    contacto_telefono VARCHAR(50),
    contacto_email VARCHAR(255),
    website VARCHAR(255),
    notas TEXT,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para búsqueda
CREATE INDEX IF NOT EXISTS idx_desarrolladores_nombre
ON desarrolladores(nombre);

CREATE INDEX IF NOT EXISTS idx_desarrolladores_nombre_lower
ON desarrolladores(LOWER(nombre));

CREATE INDEX IF NOT EXISTS idx_desarrolladores_activo
ON desarrolladores(activo);

COMMENT ON TABLE desarrolladores IS
'Tabla master de desarrolladores inmobiliarios para vinculación con proyectos';

COMMENT ON COLUMN desarrolladores.nombre IS
'Nombre oficial/legal del desarrollador (único)';

COMMENT ON COLUMN desarrolladores.nombre_comercial IS
'Nombre comercial o alias corto para mostrar en UI';

-- =====================================================
-- PASO 2: Migrar desarrolladores existentes
-- =====================================================

-- Insertar desarrolladores únicos desde proyectos_master
INSERT INTO desarrolladores (nombre)
SELECT DISTINCT TRIM(desarrollador)
FROM proyectos_master
WHERE desarrollador IS NOT NULL
  AND TRIM(desarrollador) != ''
  AND TRIM(desarrollador) != 'null'
ORDER BY TRIM(desarrollador)
ON CONFLICT (nombre) DO NOTHING;

-- Verificar cuántos se insertaron
SELECT 'Desarrolladores migrados: ' || COUNT(*) as resultado
FROM desarrolladores;

-- =====================================================
-- PASO 3: Agregar FK a proyectos_master
-- =====================================================

-- Agregar columna FK si no existe
ALTER TABLE proyectos_master
ADD COLUMN IF NOT EXISTS id_desarrollador INTEGER REFERENCES desarrolladores(id);

-- Índice para la FK
CREATE INDEX IF NOT EXISTS idx_proyectos_id_desarrollador
ON proyectos_master(id_desarrollador);

COMMENT ON COLUMN proyectos_master.id_desarrollador IS
'FK a tabla desarrolladores (nuevo sistema normalizado)';

-- =====================================================
-- PASO 4: Vincular proyectos existentes
-- =====================================================

-- Vincular por nombre exacto (trimmed)
UPDATE proyectos_master pm
SET id_desarrollador = d.id
FROM desarrolladores d
WHERE TRIM(pm.desarrollador) = d.nombre
  AND pm.id_desarrollador IS NULL;

-- Verificar vinculación
SELECT
    'Total proyectos activos: ' || COUNT(*) FILTER (WHERE activo) as stat1,
    'Con desarrollador TEXT: ' || COUNT(*) FILTER (WHERE activo AND desarrollador IS NOT NULL) as stat2,
    'Con desarrollador FK: ' || COUNT(*) FILTER (WHERE activo AND id_desarrollador IS NOT NULL) as stat3,
    'Sin vincular: ' || COUNT(*) FILTER (WHERE activo AND desarrollador IS NOT NULL AND id_desarrollador IS NULL) as stat4
FROM proyectos_master;

-- =====================================================
-- PASO 5: Función para buscar desarrolladores (autocomplete)
-- =====================================================

CREATE OR REPLACE FUNCTION buscar_desarrolladores(
    p_busqueda TEXT DEFAULT NULL,
    p_limite INTEGER DEFAULT 20
)
RETURNS TABLE (
    id INTEGER,
    nombre VARCHAR(255),
    nombre_comercial VARCHAR(255),
    proyectos_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.id,
        d.nombre,
        d.nombre_comercial,
        COUNT(pm.id_proyecto_master) as proyectos_count
    FROM desarrolladores d
    LEFT JOIN proyectos_master pm ON pm.id_desarrollador = d.id AND pm.activo = TRUE
    WHERE d.activo = TRUE
      AND (
          p_busqueda IS NULL
          OR p_busqueda = ''
          OR d.nombre ILIKE '%' || p_busqueda || '%'
          OR d.nombre_comercial ILIKE '%' || p_busqueda || '%'
      )
    GROUP BY d.id, d.nombre, d.nombre_comercial
    ORDER BY
        CASE WHEN p_busqueda IS NOT NULL AND d.nombre ILIKE p_busqueda || '%' THEN 0 ELSE 1 END,
        proyectos_count DESC,
        d.nombre
    LIMIT p_limite;
END;
$$;

COMMENT ON FUNCTION buscar_desarrolladores IS
'Busca desarrolladores por nombre con conteo de proyectos. Para autocomplete.';

-- Test
SELECT * FROM buscar_desarrolladores('grupo') LIMIT 5;

-- =====================================================
-- PASO 6: Función para crear desarrollador
-- =====================================================

CREATE OR REPLACE FUNCTION crear_desarrollador(
    p_nombre VARCHAR(255),
    p_nombre_comercial VARCHAR(255) DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    id INTEGER,
    mensaje TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_id INTEGER;
    v_nombre_limpio VARCHAR(255);
BEGIN
    -- Limpiar nombre
    v_nombre_limpio := TRIM(p_nombre);

    IF v_nombre_limpio = '' OR v_nombre_limpio IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::INTEGER, 'Nombre requerido'::TEXT;
        RETURN;
    END IF;

    -- Verificar si ya existe
    SELECT d.id INTO v_id
    FROM desarrolladores d
    WHERE LOWER(d.nombre) = LOWER(v_nombre_limpio);

    IF v_id IS NOT NULL THEN
        RETURN QUERY SELECT TRUE, v_id, 'Desarrollador ya existe'::TEXT;
        RETURN;
    END IF;

    -- Crear nuevo
    INSERT INTO desarrolladores (nombre, nombre_comercial)
    VALUES (v_nombre_limpio, NULLIF(TRIM(p_nombre_comercial), ''))
    RETURNING desarrolladores.id INTO v_id;

    RETURN QUERY SELECT TRUE, v_id, 'Desarrollador creado'::TEXT;
END;
$$;

COMMENT ON FUNCTION crear_desarrollador IS
'Crea un desarrollador nuevo o retorna el existente si ya existe (case-insensitive).';

-- =====================================================
-- VERIFICACION FINAL
-- =====================================================

SELECT '=== MIGRACIÓN 088 COMPLETADA ===' as status;

SELECT
    (SELECT COUNT(*) FROM desarrolladores) as total_desarrolladores,
    (SELECT COUNT(*) FROM proyectos_master WHERE activo AND id_desarrollador IS NOT NULL) as proyectos_vinculados,
    (SELECT COUNT(*) FROM proyectos_master WHERE activo AND desarrollador IS NOT NULL AND id_desarrollador IS NULL) as pendientes_vincular;

-- Listar desarrolladores con más proyectos
SELECT
    d.nombre,
    COUNT(pm.id_proyecto_master) as proyectos
FROM desarrolladores d
LEFT JOIN proyectos_master pm ON pm.id_desarrollador = d.id AND pm.activo
GROUP BY d.id, d.nombre
ORDER BY proyectos DESC
LIMIT 10;
