-- =====================================================
-- MIGRACION 022: Infraestructura Fuzzy Matching
-- Fecha: 8 Enero 2026
-- Dependencias: pg_trgm extension
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================

-- =====================================================
-- PASO 1: Habilitar extension pg_trgm (fuzzy matching)
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verificar instalacion
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';

-- =====================================================
-- PASO 2: Funcion normalize_nombre()
-- =====================================================

CREATE OR REPLACE FUNCTION normalize_nombre(texto TEXT)
RETURNS TEXT AS $$
DECLARE
    v_texto TEXT;
BEGIN
    IF texto IS NULL THEN
        RETURN NULL;
    END IF;

    -- 1. Lowercase PRIMERO (evita que regex elimine mayusculas)
    v_texto := lower(texto);

    -- 2. Remover prefijos comunes
    v_texto := regexp_replace(v_texto, 'condominio|edificio|torre|residencia|residencial|departamento|depto|dto', '', 'g');

    -- 3. Remover numeros romanos al final
    v_texto := regexp_replace(v_texto, '\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)$', '', 'g');

    -- 4. Remover caracteres no alfanumericos
    v_texto := regexp_replace(v_texto, '[^a-z0-9áéíóúñü]', '', 'g');

    RETURN v_texto;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION normalize_nombre IS
'Normaliza nombres de edificios para matching: lowercase, sin prefijos, sin especiales';

-- Test
SELECT
    'Condominio Sky Level III' as original,
    normalize_nombre('Condominio Sky Level III') as normalizado;

-- =====================================================
-- PASO 3: Indice GIN para similarity (trigram)
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_proyectos_nombre_trgm
ON proyectos_master
USING GIN (nombre_oficial gin_trgm_ops);

-- =====================================================
-- PASO 4: Funcion buscar_proyecto_fuzzy()
-- =====================================================

CREATE OR REPLACE FUNCTION buscar_proyecto_fuzzy(
    p_nombre TEXT,
    p_umbral_minimo NUMERIC DEFAULT 0.3,
    p_limite INTEGER DEFAULT 5
)
RETURNS TABLE (
    id_proyecto INTEGER,
    nombre TEXT,
    desarrollador TEXT,
    zona TEXT,
    score NUMERIC,
    match_tipo TEXT
) AS $$
DECLARE
    v_nombre_normalizado TEXT;
BEGIN
    v_nombre_normalizado := normalize_nombre(p_nombre);

    RETURN QUERY
    WITH candidatos AS (
        -- Primero: Match exacto en alias (score = 1.0)
        SELECT DISTINCT
            pm.id_proyecto_master,
            pm.nombre_oficial,
            pm.desarrollador,
            pm.zona,
            1.0::NUMERIC as score,
            'alias_exacto'::TEXT as match_tipo
        FROM proyectos_master pm
        WHERE pm.activo = true
          AND pm.alias_conocidos IS NOT NULL
          AND (
              p_nombre = ANY(pm.alias_conocidos)
              OR lower(p_nombre) = ANY(
                  SELECT lower(unnest(pm.alias_conocidos))
              )
          )

        UNION ALL

        -- Segundo: Match por nombre normalizado exacto
        SELECT DISTINCT
            pm.id_proyecto_master,
            pm.nombre_oficial,
            pm.desarrollador,
            pm.zona,
            0.95::NUMERIC as score,
            'nombre_normalizado'::TEXT as match_tipo
        FROM proyectos_master pm
        WHERE pm.activo = true
          AND normalize_nombre(pm.nombre_oficial) = v_nombre_normalizado
          AND v_nombre_normalizado IS NOT NULL
          AND v_nombre_normalizado != ''

        UNION ALL

        -- Tercero: Fuzzy match con trigram similarity
        SELECT
            pm.id_proyecto_master,
            pm.nombre_oficial,
            pm.desarrollador,
            pm.zona,
            ROUND(similarity(
                normalize_nombre(pm.nombre_oficial),
                v_nombre_normalizado
            )::NUMERIC, 3) as score,
            'fuzzy_trigram'::TEXT as match_tipo
        FROM proyectos_master pm
        WHERE pm.activo = true
          AND v_nombre_normalizado IS NOT NULL
          AND v_nombre_normalizado != ''
          AND similarity(
              normalize_nombre(pm.nombre_oficial),
              v_nombre_normalizado
          ) >= p_umbral_minimo
    )
    SELECT DISTINCT ON (c.id_proyecto_master)
        c.id_proyecto_master,
        c.nombre_oficial,
        c.desarrollador,
        c.zona,
        c.score,
        c.match_tipo
    FROM candidatos c
    ORDER BY c.id_proyecto_master, c.score DESC, c.match_tipo
    LIMIT p_limite;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION buscar_proyecto_fuzzy IS
'Busca proyectos por nombre usando alias exactos + fuzzy matching con trigrams';

-- Test
SELECT * FROM buscar_proyecto_fuzzy('Sky Level');
SELECT * FROM buscar_proyecto_fuzzy('Domus Insignia Equipetrol');
SELECT * FROM buscar_proyecto_fuzzy('Condiminio Macororo');  -- typo intencional

-- =====================================================
-- PASO 5: Trigger para auto-registrar alias desde HITL
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_alias_desde_correccion()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo para acciones CORREGIR o PROYECTO_ALTERNATIVO
    IF NEW.accion IN ('CORREGIR', 'PROYECTO_ALTERNATIVO')
       AND NEW.estado = 'aprobado'
       AND NEW.nombre_detectado IS NOT NULL
       AND NEW.nombre_detectado != ''
       AND NEW.id_proyecto_corregido IS NOT NULL THEN

        -- Agregar el nombre detectado como alias si no existe
        UPDATE proyectos_master
        SET alias_conocidos = array_append(
            COALESCE(alias_conocidos, '{}'),
            NEW.nombre_detectado
        ),
        updated_at = NOW()
        WHERE id_proyecto_master = NEW.id_proyecto_corregido
          AND NOT (
              NEW.nombre_detectado = ANY(COALESCE(alias_conocidos, '{}'))
              OR lower(NEW.nombre_detectado) = lower(nombre_oficial)
          );

        -- Log para debugging
        IF FOUND THEN
            RAISE NOTICE 'Alias "%" agregado al proyecto %',
                NEW.nombre_detectado, NEW.id_proyecto_corregido;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear trigger en matching_sugerencias
DROP TRIGGER IF EXISTS trg_registrar_alias_matching ON matching_sugerencias;
CREATE TRIGGER trg_registrar_alias_matching
    AFTER UPDATE OF estado ON matching_sugerencias
    FOR EACH ROW
    WHEN (NEW.estado = 'aprobado' AND OLD.estado != 'aprobado')
    EXECUTE FUNCTION registrar_alias_desde_correccion();

COMMENT ON FUNCTION registrar_alias_desde_correccion IS
'Auto-registra nombres detectados como alias cuando HITL corrige un match';

-- =====================================================
-- PASO 6: Funcion mejorada para matching nocturno
-- =====================================================

CREATE OR REPLACE FUNCTION intentar_match_con_fuzzy(
    p_id_propiedad INTEGER
)
RETURNS TABLE (
    id_proyecto_sugerido INTEGER,
    nombre_proyecto TEXT,
    score NUMERIC,
    match_tipo TEXT,
    accion_sugerida TEXT
) AS $$
DECLARE
    v_nombre_edificio TEXT;
    v_latitud NUMERIC;
    v_longitud NUMERIC;
BEGIN
    -- Obtener datos de la propiedad
    SELECT
        datos_json->'proyecto'->>'nombre_edificio',
        (datos_json->'ubicacion'->>'latitud')::NUMERIC,
        (datos_json->'ubicacion'->>'longitud')::NUMERIC
    INTO v_nombre_edificio, v_latitud, v_longitud
    FROM propiedades_v2
    WHERE id = p_id_propiedad;

    -- Si no hay nombre de edificio, no podemos hacer fuzzy matching
    IF v_nombre_edificio IS NULL OR v_nombre_edificio = '' THEN
        RETURN;
    END IF;

    -- Buscar con fuzzy matching
    RETURN QUERY
    SELECT
        f.id_proyecto,
        f.nombre,
        f.score,
        f.match_tipo,
        CASE
            WHEN f.score >= 0.9 THEN 'AUTO_ASIGNAR'
            WHEN f.score >= 0.6 THEN 'SUGERIR_HITL'
            ELSE 'REVISAR_MANUAL'
        END as accion_sugerida
    FROM buscar_proyecto_fuzzy(v_nombre_edificio, 0.4, 3) f
    ORDER BY f.score DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION intentar_match_con_fuzzy IS
'Intenta match fuzzy para una propiedad, retorna sugerencias con score y accion';

-- =====================================================
-- VERIFICACION FINAL
-- =====================================================

SELECT 'Migracion 022 - Componentes Instalados' as status;

SELECT
    'pg_trgm extension' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm')
         THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'normalize_nombre()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'normalize_nombre')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'buscar_proyecto_fuzzy()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'buscar_proyecto_fuzzy')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'intentar_match_con_fuzzy()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'intentar_match_con_fuzzy')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'trg_registrar_alias_matching',
    CASE WHEN EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trg_registrar_alias_matching')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'idx_proyectos_nombre_trgm',
    CASE WHEN EXISTS(SELECT 1 FROM pg_indexes WHERE indexname = 'idx_proyectos_nombre_trgm')
         THEN 'OK' ELSE 'FALTA' END;

-- Test completo
SELECT '--- TEST: normalize_nombre ---' as test;
SELECT normalize_nombre('Condominio Sky Level III') as resultado;

SELECT '--- TEST: buscar_proyecto_fuzzy ---' as test;
SELECT * FROM buscar_proyecto_fuzzy('Sky Level', 0.3, 3);

SELECT '--- TEST: intentar_match_con_fuzzy (propiedad huerfana) ---' as test;
SELECT * FROM intentar_match_con_fuzzy(454);  -- Macororo
