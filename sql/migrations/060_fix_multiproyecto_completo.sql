-- =====================================================
-- MIGRACIÓN 060: Fix Completo Multiproyecto
-- Fecha: 18 Enero 2026
-- Propósito: Corregir 66 propiedades mal marcadas como multiproyecto
--            + Agregar protección de candado para es_multiproyecto
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- PROBLEMA IDENTIFICADO:
-- 68 propiedades marcadas es_multiproyecto=true cuando son unidades reales
-- El extractor detecta "desde X dormitorios" en descripción y marca multiproyecto
-- aunque cada registro tenga datos específicos (área, precio, dormitorios únicos)
--
-- SOLUCIÓN:
-- 1. Corregir es_multiproyecto = false para 66 propiedades
-- 2. Corregir dormitorios donde está mal o falta
-- 3. Agregar candado para proteger correcciones
-- 4. Modificar registrar_enrichment para respetar candado
--
-- CASOS:
-- CASO 1: 12 props con dorms pero sin opciones (mal marcadas)
-- CASO 2: 41 props con datos completos + opciones (son unidades reales)
-- CASO 3: 3 props inferibles de opción única [1], [2], [3]
-- CASO 4: 9 props inferibles de URL (monoambiente, 1-dormitorio)
-- CASO 5: 1 prop inferible + 2 que se mantienen (datos insuficientes)
-- =====================================================

BEGIN;

-- =====================================================
-- PARTE 1: BACKUP (verificar antes de continuar)
-- =====================================================

-- Crear tabla de backup por si necesitamos rollback
CREATE TABLE IF NOT EXISTS _backup_multiproyecto_060 AS
SELECT id, es_multiproyecto, dormitorios, dormitorios_opciones, campos_bloqueados
FROM propiedades_v2
WHERE es_multiproyecto = true;

-- Verificar: deberían ser 68 registros
DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM _backup_multiproyecto_060;
    RAISE NOTICE 'Backup creado: % registros', v_count;
    IF v_count != 68 THEN
        RAISE WARNING 'Esperados 68 registros, encontrados %. Verificar antes de continuar.', v_count;
    END IF;
END $$;

-- =====================================================
-- PARTE 2: CASO 1 - 12 props mal marcadas
-- Tienen dormitorios específico pero sin dormitorios_opciones
-- =====================================================

-- 2.1: Corregir ID 247 (dormitorios=0 debería ser 1, descripción dice "un dormitorio")
UPDATE propiedades_v2
SET
    dormitorios = 1,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 247;

-- 2.2: Corregir ID 369 (dormitorios=2 debería ser 1, descripción dice "1 dormitorio modelo 1D-B")
UPDATE propiedades_v2
SET
    dormitorios = 1,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 369;

-- 2.3: Resto del CASO 1 (10 props) - solo corregir es_multiproyecto
UPDATE propiedades_v2
SET
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (298, 299, 300, 301, 339, 378, 220, 368, 377, 379);

-- =====================================================
-- PARTE 3: CASO 2 - 41 props con datos completos
-- Tienen dormitorios + dormitorios_opciones, pero son unidades reales
-- =====================================================

UPDATE propiedades_v2
SET
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (
    -- T-VEINTICINCO (9)
    208, 209, 210, 211, 212, 213, 214, 216, 217,
    -- Sky Level (5)
    182, 183, 184, 185, 186,
    -- Condominio MARE (6)
    64, 93, 94, 95, 106, 107,
    -- TERRAZO (6) - inactivos pero corregir igual
    111, 112, 113, 114, 115, 116,
    -- Edificio Kenya (1)
    215,
    -- HH Chuubi (2)
    250, 253,
    -- Lofty Island (2)
    282, 283,
    -- Condominio Las Dalias (1)
    91,
    -- Sky Plaza Italia (3)
    53, 423, 427,
    -- Domus Infinity (1)
    272,
    -- Domus Insignia (2)
    197, 444,
    -- Spazios Edén (1)
    276,
    -- MIRO TOWER (2) - los que tienen dormitorios
    406, 414
);

-- =====================================================
-- PARTE 4: CASO 3 - 3 props inferibles de opción única
-- dormitorios_opciones tiene un solo valor -> inferir dormitorios
-- =====================================================

-- ID 403: [1] -> dormitorios = 1
UPDATE propiedades_v2
SET
    dormitorios = 1,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 403;

-- ID 404: [2] -> dormitorios = 2
UPDATE propiedades_v2
SET
    dormitorios = 2,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 404;

-- ID 405: [3] -> dormitorios = 3
UPDATE propiedades_v2
SET
    dormitorios = 3,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 405;

-- =====================================================
-- PARTE 5: CASO 4 - 9 props inferibles de URL/área
-- =====================================================

-- SKY EQUINOX: ID 152 "monoambiente" -> dormitorios = 0
UPDATE propiedades_v2
SET
    dormitorios = 0,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 152;

-- SKY EQUINOX: IDs 151, 153, 154, 155 "1-dormitorio" -> dormitorios = 1
UPDATE propiedades_v2
SET
    dormitorios = 1,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id IN (151, 153, 154, 155);

-- Domus Insignia: ID 196 "monoambiente" -> dormitorios = 0
UPDATE propiedades_v2
SET
    dormitorios = 0,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 196;

-- Domus Infinity: ID 271 "1-dormitorio" -> dormitorios = 1
UPDATE propiedades_v2
SET
    dormitorios = 1,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 271;

-- Sin proyecto: ID 177 (32m², Domus Insignia) -> dormitorios = 0
UPDATE propiedades_v2
SET
    dormitorios = 0,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 177;

-- Sin proyecto: ID 248 (38m², Domus Tower) -> dormitorios = 0
UPDATE propiedades_v2
SET
    dormitorios = 0,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 248;

-- =====================================================
-- PARTE 6: CASO 5 - 1 prop inferible, 2 se mantienen
-- =====================================================

-- ID 381 "monoambiente" en URL -> dormitorios = 0
UPDATE propiedades_v2
SET
    dormitorios = 0,
    es_multiproyecto = false,
    campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb) ||
        '{"es_multiproyecto": true, "dormitorios": true}'::jsonb,
    fecha_actualizacion = NOW()
WHERE id = 381;

-- IDs 382, 386: MANTENER como multiproyecto (datos insuficientes, inactivas)
-- No hacer nada con estos

-- =====================================================
-- PARTE 7: FIX registrar_enrichment - Respetar candado
-- =====================================================

CREATE OR REPLACE FUNCTION registrar_enrichment(p_data JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id INTEGER;
    v_property_id TEXT;
    v_url TEXT;
    v_existing RECORD;
    v_candados JSONB;
    v_campos_updated TEXT[] := ARRAY[]::TEXT[];
    v_campos_blocked TEXT[] := ARRAY[]::TEXT[];
    v_campos_skipped TEXT[] := ARRAY[]::TEXT[];
    v_cambios_enrichment JSONB;
    v_status_anterior TEXT;
    v_result JSONB;
BEGIN
    -- =========================================================================
    -- FASE 1: BUSCAR PROPIEDAD (prioridad: _internal_id > property_id > url)
    -- =========================================================================
    BEGIN
        v_id := (p_data->>'_internal_id')::INTEGER;
        IF v_id IS NOT NULL THEN
            SELECT * INTO v_existing FROM propiedades_v2 WHERE id = v_id;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_id := NULL;
    END;

    IF NOT FOUND OR v_id IS NULL THEN
        v_property_id := p_data->>'property_id';
        IF v_property_id IS NOT NULL THEN
            SELECT * INTO v_existing FROM propiedades_v2 WHERE codigo_propiedad = v_property_id;
        END IF;
    END IF;

    IF NOT FOUND THEN
        v_url := p_data->>'url';
        IF v_url IS NOT NULL THEN
            SELECT * INTO v_existing FROM propiedades_v2 WHERE url = v_url;
        END IF;
    END IF;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada',
            'timestamp', NOW()
        );
    END IF;

    v_candados := COALESCE(v_existing.campos_bloqueados, '{}'::JSONB);
    v_status_anterior := v_existing.status::TEXT;

    -- =========================================================================
    -- FASE 2: CALCULAR CAMBIOS (simplificado)
    -- =========================================================================
    IF p_data->>'precio_usd' IS NOT NULL AND NOT COALESCE((v_candados->>'precio_usd')::boolean, false) THEN
        IF (p_data->>'precio_usd')::NUMERIC(12,2) IS DISTINCT FROM v_existing.precio_usd THEN
            v_campos_updated := array_append(v_campos_updated, 'precio_usd');
        END IF;
    END IF;

    v_cambios_enrichment := jsonb_build_object(
        'updated', v_campos_updated,
        'blocked', v_campos_blocked,
        'skipped', v_campos_skipped,
        'timestamp', NOW()
    );

    -- =========================================================================
    -- FASE 3: UPDATE PROPIEDAD
    -- =========================================================================
    UPDATE propiedades_v2 SET
        -- Precio (respeta candado via merge, aquí solo guardamos en JSON)
        precio_usd = CASE
            WHEN COALESCE((v_candados->>'precio_usd')::boolean, false) THEN propiedades_v2.precio_usd
            WHEN p_data->>'precio_usd' IS NOT NULL THEN (p_data->>'precio_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_usd
        END,

        -- Área
        area_total_m2 = CASE
            WHEN COALESCE((v_candados->>'area_total_m2')::boolean, false) THEN propiedades_v2.area_total_m2
            WHEN p_data->>'area_total_m2' IS NOT NULL THEN (p_data->>'area_total_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_total_m2
        END,

        -- Dormitorios
        dormitorios = CASE
            WHEN COALESCE((v_candados->>'dormitorios')::boolean, false) THEN propiedades_v2.dormitorios
            WHEN p_data->>'dormitorios' IS NOT NULL THEN (p_data->>'dormitorios')::INTEGER
            ELSE propiedades_v2.dormitorios
        END,

        -- Baños
        banos = CASE
            WHEN COALESCE((v_candados->>'banos')::boolean, false) THEN propiedades_v2.banos
            WHEN p_data->>'banos' IS NOT NULL THEN (p_data->>'banos')::NUMERIC(3,1)
            ELSE propiedades_v2.banos
        END,

        -- Estacionamientos
        estacionamientos = CASE
            WHEN COALESCE((v_candados->>'estacionamientos')::boolean, false) THEN propiedades_v2.estacionamientos
            WHEN p_data->>'estacionamientos' IS NOT NULL THEN (p_data->>'estacionamientos')::INTEGER
            ELSE propiedades_v2.estacionamientos
        END,

        -- GPS
        latitud = CASE
            WHEN COALESCE((v_candados->>'latitud')::boolean, false) THEN propiedades_v2.latitud
            WHEN p_data->>'latitud' IS NOT NULL THEN (p_data->>'latitud')::NUMERIC(10,8)
            ELSE propiedades_v2.latitud
        END,

        longitud = CASE
            WHEN COALESCE((v_candados->>'longitud')::boolean, false) THEN propiedades_v2.longitud
            WHEN p_data->>'longitud' IS NOT NULL THEN (p_data->>'longitud')::NUMERIC(11,8)
            ELSE propiedades_v2.longitud
        END,

        -- Multiproyecto (campos rangos)
        precio_min_usd = CASE
            WHEN p_data->>'precio_min_usd' IS NOT NULL THEN (p_data->>'precio_min_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_min_usd
        END,

        precio_max_usd = CASE
            WHEN p_data->>'precio_max_usd' IS NOT NULL THEN (p_data->>'precio_max_usd')::NUMERIC(12,2)
            ELSE propiedades_v2.precio_max_usd
        END,

        area_min_m2 = CASE
            WHEN p_data->>'area_min_m2' IS NOT NULL THEN (p_data->>'area_min_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_min_m2
        END,

        area_max_m2 = CASE
            WHEN p_data->>'area_max_m2' IS NOT NULL THEN (p_data->>'area_max_m2')::NUMERIC(10,2)
            ELSE propiedades_v2.area_max_m2
        END,

        dormitorios_opciones = CASE
            WHEN p_data->>'dormitorios_opciones' IS NOT NULL THEN p_data->>'dormitorios_opciones'
            ELSE propiedades_v2.dormitorios_opciones
        END,

        -- Tipo operación
        tipo_operacion = CASE
            WHEN p_data->>'tipo_operacion' IS NOT NULL THEN (p_data->>'tipo_operacion')::tipo_operacion_enum
            ELSE propiedades_v2.tipo_operacion
        END,

        tipo_propiedad_original = CASE
            WHEN p_data->>'tipo_propiedad_original' IS NOT NULL THEN p_data->>'tipo_propiedad_original'
            ELSE propiedades_v2.tipo_propiedad_original
        END,

        -- =====================================================
        -- FIX: es_multiproyecto ahora respeta candado
        -- =====================================================
        es_multiproyecto = CASE
            WHEN COALESCE((v_candados->>'es_multiproyecto')::BOOLEAN, false) THEN
                propiedades_v2.es_multiproyecto  -- Candado activo: mantener valor
            WHEN p_data->>'es_multiproyecto' IS NOT NULL THEN
                (p_data->>'es_multiproyecto')::BOOLEAN
            ELSE
                propiedades_v2.es_multiproyecto
        END,

        datos_json_enrichment = p_data,
        fecha_enrichment = NOW(),
        status = 'actualizado'::estado_propiedad,
        cambios_enrichment = v_cambios_enrichment,
        fecha_actualizacion = NOW(),
        scraper_version = COALESCE(p_data->>'scraper_version', propiedades_v2.scraper_version)

    WHERE id = v_existing.id;

    -- =========================================================================
    -- FASE 4: RESPUESTA
    -- =========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'operation', 'enrichment',
        'version', '1.5.0',  -- Bump version
        'property_id', v_existing.codigo_propiedad,
        'internal_id', v_existing.id,
        'status_nuevo', 'actualizado',
        'timestamp', NOW()
    );

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM,
        'detail', SQLSTATE,
        'timestamp', NOW()
    );
END;
$$;

COMMENT ON FUNCTION registrar_enrichment(JSONB) IS
'SICI Enrichment v1.5.0: Registra datos del extractor HTML.
FIX v1.5.0 (18 Ene 2026): es_multiproyecto ahora respeta campos_bloqueados
- Candados respetados: precio_usd, area_total_m2, dormitorios, banos,
  estacionamientos, latitud, longitud, es_multiproyecto
Uso: SELECT registrar_enrichment(''{"url": "...", "precio_usd": 100000}''::jsonb)';

-- =====================================================
-- PARTE 8: VERIFICACIÓN
-- =====================================================

-- Contar propiedades corregidas
DO $$
DECLARE
    v_multiproyecto_antes INTEGER;
    v_multiproyecto_despues INTEGER;
    v_con_candado INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_multiproyecto_antes FROM _backup_multiproyecto_060;
    SELECT COUNT(*) INTO v_multiproyecto_despues FROM propiedades_v2 WHERE es_multiproyecto = true;
    SELECT COUNT(*) INTO v_con_candado FROM propiedades_v2
    WHERE (campos_bloqueados->>'es_multiproyecto')::boolean = true;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'RESULTADO MIGRACIÓN 060';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Multiproyecto ANTES:  %', v_multiproyecto_antes;
    RAISE NOTICE 'Multiproyecto DESPUÉS: %', v_multiproyecto_despues;
    RAISE NOTICE 'Corregidas: %', v_multiproyecto_antes - v_multiproyecto_despues;
    RAISE NOTICE 'Con candado protector: %', v_con_candado;
    RAISE NOTICE '========================================';

    -- Validar resultado esperado
    IF v_multiproyecto_despues != 2 THEN
        RAISE WARNING 'Esperados 2 multiproyecto restantes (382, 386), encontrados %', v_multiproyecto_despues;
    END IF;

    IF v_con_candado < 60 THEN
        RAISE WARNING 'Esperados ~66 candados, encontrados %', v_con_candado;
    END IF;
END $$;

-- Mostrar resumen por proyecto
SELECT
    'DESPUÉS' as momento,
    pm.nombre_oficial,
    COUNT(*) FILTER (WHERE p.es_multiproyecto = false) as reales,
    COUNT(*) FILTER (WHERE p.es_multiproyecto = true) as multiproyecto,
    COUNT(*) as total
FROM propiedades_v2 p
JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE pm.nombre_oficial IN (
    'T-VEINTICINCO', 'Sky Level', 'Condominio MARE',
    'Condominio SKY EQUINOX', 'CONDOMINIO BARCELONA 04.05 "MIRO TOWER"'
)
GROUP BY pm.nombre_oficial
ORDER BY reales DESC;

COMMIT;

-- =====================================================
-- ROLLBACK (solo si algo salió mal)
-- =====================================================
--
-- BEGIN;
-- UPDATE propiedades_v2 p
-- SET
--     es_multiproyecto = b.es_multiproyecto,
--     dormitorios = b.dormitorios,
--     campos_bloqueados = b.campos_bloqueados
-- FROM _backup_multiproyecto_060 b
-- WHERE p.id = b.id;
-- COMMIT;
--
-- =====================================================

-- =====================================================
-- LIMPIEZA (ejecutar después de verificar que todo está bien)
-- =====================================================
-- DROP TABLE IF EXISTS _backup_multiproyecto_060;
