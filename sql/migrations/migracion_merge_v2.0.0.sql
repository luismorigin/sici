-- =====================================================================================
-- SICI - Migración para Merge v2.0.0
-- =====================================================================================
-- Archivo: migracion_merge_v2.0.0.sql
-- Propósito: Agregar columnas necesarias para merge v2.0.0
-- Fecha: 2025-12-23
-- =====================================================================================
-- EJECUTAR ANTES de las funciones de merge v2.0.0
-- =====================================================================================

-- =====================================================================================
-- AGREGAR COLUMNAS FALTANTES
-- =====================================================================================

-- flags_semanticos: Array de warnings/errors del scoring
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'propiedades_v2' AND column_name = 'flags_semanticos'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN flags_semanticos JSONB DEFAULT '[]'::JSONB;
        RAISE NOTICE '✅ Columna flags_semanticos agregada';
    ELSE
        RAISE NOTICE '⏭️ Columna flags_semanticos ya existe';
    END IF;
END $$;

-- discrepancias_detectadas: Discrepancias entre discovery y enrichment
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'propiedades_v2' AND column_name = 'discrepancias_detectadas'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN discrepancias_detectadas JSONB;
        RAISE NOTICE '✅ Columna discrepancias_detectadas agregada';
    ELSE
        RAISE NOTICE '⏭️ Columna discrepancias_detectadas ya existe';
    END IF;
END $$;

-- cambios_merge: Log de cambios realizados en merge
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'propiedades_v2' AND column_name = 'cambios_merge'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN cambios_merge JSONB;
        RAISE NOTICE '✅ Columna cambios_merge agregada';
    ELSE
        RAISE NOTICE '⏭️ Columna cambios_merge ya existe';
    END IF;
END $$;

-- fecha_merge: Timestamp del último merge
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'propiedades_v2' AND column_name = 'fecha_merge'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN fecha_merge TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE '✅ Columna fecha_merge agregada';
    ELSE
        RAISE NOTICE '⏭️ Columna fecha_merge ya existe';
    END IF;
END $$;

-- score_calidad_dato: Score de completitud de datos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'propiedades_v2' AND column_name = 'score_calidad_dato'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN score_calidad_dato INTEGER;
        RAISE NOTICE '✅ Columna score_calidad_dato agregada';
    ELSE
        RAISE NOTICE '⏭️ Columna score_calidad_dato ya existe';
    END IF;
END $$;

-- score_fiduciario: Score de coherencia técnica
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'propiedades_v2' AND column_name = 'score_fiduciario'
    ) THEN
        ALTER TABLE propiedades_v2 ADD COLUMN score_fiduciario INTEGER;
        RAISE NOTICE '✅ Columna score_fiduciario agregada';
    ELSE
        RAISE NOTICE '⏭️ Columna score_fiduciario ya existe';
    END IF;
END $$;

-- =====================================================================================
-- VERIFICACIÓN
-- =====================================================================================

DO $$
DECLARE
    v_columnas_requeridas TEXT[] := ARRAY[
        'flags_semanticos', 
        'discrepancias_detectadas', 
        'cambios_merge', 
        'fecha_merge',
        'score_calidad_dato',
        'score_fiduciario'
    ];
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
        RAISE EXCEPTION '❌ Columnas faltantes: %', v_faltantes;
    ELSE
        RAISE NOTICE '════════════════════════════════════════════════';
        RAISE NOTICE '✅ MIGRACIÓN MERGE v2.0.0 COMPLETADA';
        RAISE NOTICE '════════════════════════════════════════════════';
        RAISE NOTICE 'Todas las columnas requeridas están presentes';
        RAISE NOTICE '════════════════════════════════════════════════';
    END IF;
END $$;
