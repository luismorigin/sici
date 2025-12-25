-- =====================================================================================
-- SICI - Migracion para Columnas de Matching
-- =====================================================================================
-- Archivo: migracion_columnas_matching_v1.0.0.sql
-- Proposito: Agregar columnas nombre_edificio y zona para Modulo 2
-- Fecha: 2025-12-25
-- =====================================================================================
-- EJECUTAR ANTES de actualizar merge_discovery_enrichment v2.1.0
-- =====================================================================================

-- =====================================================================================
-- PASO 1: AGREGAR COLUMNAS
-- =====================================================================================

-- nombre_edificio: Nombre del edificio/proyecto extraido del enrichment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'propiedades_v2' AND column_name = 'nombre_edificio'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN nombre_edificio VARCHAR;
        RAISE NOTICE 'Columna nombre_edificio agregada';
    ELSE
        RAISE NOTICE 'Columna nombre_edificio ya existe';
    END IF;
END $$;

-- zona: Zona geografica validada por GPS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'propiedades_v2' AND column_name = 'zona'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN zona VARCHAR;
        RAISE NOTICE 'Columna zona agregada';
    ELSE
        RAISE NOTICE 'Columna zona ya existe';
    END IF;
END $$;

-- =====================================================================================
-- PASO 2: CREAR INDICES PARA MATCHING
-- =====================================================================================

-- Indice para matching por nombre (case-insensitive, parcial)
CREATE INDEX IF NOT EXISTS idx_propiedades_v2_nombre_edificio
ON propiedades_v2(LOWER(nombre_edificio))
WHERE nombre_edificio IS NOT NULL;

-- Indice para filtro por zona
CREATE INDEX IF NOT EXISTS idx_propiedades_v2_zona
ON propiedades_v2(zona)
WHERE zona IS NOT NULL;

-- =====================================================================================
-- PASO 3: VERIFICACION
-- =====================================================================================

DO $$
DECLARE
    v_columnas_requeridas TEXT[] := ARRAY['nombre_edificio', 'zona'];
    v_col TEXT;
    v_faltantes TEXT[] := ARRAY[]::TEXT[];
BEGIN
    FOREACH v_col IN ARRAY v_columnas_requeridas
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'propiedades_v2' AND column_name = v_col
        ) THEN
            v_faltantes := array_append(v_faltantes, v_col);
        END IF;
    END LOOP;

    IF array_length(v_faltantes, 1) > 0 THEN
        RAISE EXCEPTION 'Columnas faltantes: %', v_faltantes;
    ELSE
        RAISE NOTICE '════════════════════════════════════════════════';
        RAISE NOTICE 'MIGRACION COLUMNAS MATCHING v1.0.0 COMPLETADA';
        RAISE NOTICE '════════════════════════════════════════════════';
        RAISE NOTICE 'Columnas agregadas: nombre_edificio, zona';
        RAISE NOTICE 'Indices creados: idx_propiedades_v2_nombre_edificio, idx_propiedades_v2_zona';
        RAISE NOTICE '════════════════════════════════════════════════';
    END IF;
END $$;
