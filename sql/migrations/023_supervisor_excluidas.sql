-- =====================================================
-- MIGRACION 023: Supervisor Propiedades Excluidas (HITL)
-- Fecha: 8 Enero 2026
-- Plan: docs/planning/SUPERVISOR_EXCLUIDAS_PLAN.md
-- Estado: EJECUTADO EN PRODUCCION
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- CONTENIDO:
-- 1. Tabla propiedades_excluidas_export (tracking HITL)
-- 2. Función detectar_razon_exclusion()
-- 3. Función exportar_propiedades_excluidas() - con columnas extra
-- 4. Función procesar_accion_excluida() - CORREGIR/ACTIVAR/EXCLUIR/ELIMINAR
-- 5. Vista v_resumen_excluidas
--
-- WORKFLOWS N8N:
-- - exportar_excluidas.json (pendiente mapeo columnas)
-- - supervisor_excluidas.json (funcional)
-- =====================================================

-- =====================================================
-- PASO 1: Tabla para tracking de excluidas exportadas
-- =====================================================

CREATE TABLE IF NOT EXISTS propiedades_excluidas_export (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_v2(id) ON DELETE CASCADE,
    url TEXT,
    fuente VARCHAR(50),
    precio_usd NUMERIC,
    precio_m2 NUMERIC,
    dormitorios INTEGER,
    area_m2 NUMERIC,
    zona VARCHAR(100),
    nombre_edificio VARCHAR(255),
    score_calidad INTEGER,
    razon_exclusion TEXT,

    -- Campos para revisión humana (desde Sheet)
    accion VARCHAR(20),  -- CORREGIR, ACTIVAR, EXCLUIR, ELIMINAR
    dorms_correcto INTEGER,
    precio_correcto NUMERIC,
    notas TEXT,

    -- Tracking
    estado VARCHAR(20) DEFAULT 'pendiente',  -- pendiente, procesado, error
    fecha_export TIMESTAMP DEFAULT NOW(),
    fecha_procesado TIMESTAMP,
    row_number INTEGER,  -- Para borrar fila del Sheet

    UNIQUE(propiedad_id)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_excluidas_export_estado
ON propiedades_excluidas_export(estado);

CREATE INDEX IF NOT EXISTS idx_excluidas_export_propiedad
ON propiedades_excluidas_export(propiedad_id);

COMMENT ON TABLE propiedades_excluidas_export IS
'Tracking de propiedades excluidas exportadas a Google Sheet para revisión HITL';

-- =====================================================
-- PASO 2: Función para detectar razón de exclusión
-- =====================================================

CREATE OR REPLACE FUNCTION detectar_razon_exclusion(p_id INTEGER)
RETURNS TEXT AS $$
DECLARE
    v_prop RECORD;
    v_razones TEXT[] := '{}';
BEGIN
    SELECT
        precio_usd,
        dormitorios,
        area_total_m2,
        score_calidad_dato,
        zona,
        nombre_edificio,
        CASE WHEN area_total_m2 > 0
             THEN ROUND((precio_usd / area_total_m2)::numeric, 0)
             ELSE NULL END as precio_m2
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    -- Detectar razones
    IF v_prop.precio_usd IS NULL THEN
        v_razones := array_append(v_razones, 'Sin precio');
    END IF;

    IF v_prop.dormitorios IS NULL THEN
        v_razones := array_append(v_razones, 'Sin dormitorios');
    END IF;

    IF v_prop.dormitorios > 10 THEN
        v_razones := array_append(v_razones, 'Dormitorios anómalos: ' || v_prop.dormitorios);
    END IF;

    IF v_prop.precio_m2 IS NOT NULL AND v_prop.precio_m2 < 500 THEN
        v_razones := array_append(v_razones, 'Precio/m² muy bajo: $' || v_prop.precio_m2);
    END IF;

    IF v_prop.precio_m2 IS NOT NULL AND v_prop.precio_m2 > 5000 THEN
        v_razones := array_append(v_razones, 'Precio/m² muy alto: $' || v_prop.precio_m2);
    END IF;

    IF v_prop.score_calidad_dato < 70 THEN
        v_razones := array_append(v_razones, 'Score bajo: ' || v_prop.score_calidad_dato);
    END IF;

    IF v_prop.zona IS NULL OR v_prop.zona = '' THEN
        v_razones := array_append(v_razones, 'Sin zona');
    END IF;

    -- Retornar razones concatenadas
    IF array_length(v_razones, 1) > 0 THEN
        RETURN array_to_string(v_razones, ' | ');
    ELSE
        RETURN 'Razón desconocida';
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION detectar_razon_exclusion IS
'Detecta por qué una propiedad está excluida del matching';

-- Test
SELECT detectar_razon_exclusion(285);  -- Sin precio, sin dormitorios

-- =====================================================
-- PASO 3: Función para exportar excluidas pendientes
-- =====================================================

CREATE OR REPLACE FUNCTION exportar_propiedades_excluidas()
RETURNS TABLE (
    propiedad_id INTEGER,
    url TEXT,
    fuente VARCHAR(50),
    precio_usd NUMERIC,
    precio_m2 NUMERIC,
    dormitorios INTEGER,
    area_m2 NUMERIC,
    zona VARCHAR(100),
    nombre_edificio VARCHAR(255),
    score_calidad INTEGER,
    razon_exclusion TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id as propiedad_id,
        p.url,
        p.fuente,
        p.precio_usd,
        CASE WHEN p.area_total_m2 > 0
             THEN ROUND((p.precio_usd / p.area_total_m2)::numeric, 0)
             ELSE NULL END as precio_m2,
        p.dormitorios,
        p.area_total_m2 as area_m2,
        p.zona,
        p.nombre_edificio,
        p.score_calidad_dato as score_calidad,
        detectar_razon_exclusion(p.id) as razon_exclusion
    FROM propiedades_v2 p
    WHERE p.es_para_matching = FALSE
      AND p.status = 'completado'
      AND p.tipo_operacion = 'venta'  -- Solo ventas, no alquiler/anticretico
      AND NOT EXISTS (
          SELECT 1 FROM propiedades_excluidas_export e
          WHERE e.propiedad_id = p.id
            AND e.estado IN ('pendiente', 'procesado')
      )
    ORDER BY p.score_calidad_dato DESC, p.id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION exportar_propiedades_excluidas IS
'Retorna propiedades excluidas pendientes de exportar a Sheet HITL';

-- Test
SELECT * FROM exportar_propiedades_excluidas() LIMIT 5;

-- =====================================================
-- PASO 4: Función para procesar acción del supervisor
-- =====================================================

CREATE OR REPLACE FUNCTION procesar_accion_excluida(
    p_propiedad_id INTEGER,
    p_accion VARCHAR(20),
    p_dorms_correcto INTEGER DEFAULT NULL,
    p_precio_correcto NUMERIC DEFAULT NULL,
    p_notas TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_codigo VARCHAR(100);
    v_resultado JSONB;
BEGIN
    -- Obtener código de la propiedad
    SELECT codigo_propiedad INTO v_codigo
    FROM propiedades_v2 WHERE id = p_propiedad_id;

    IF v_codigo IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada'
        );
    END IF;

    CASE p_accion
        -- CORREGIR: Actualizar datos + re-merge
        WHEN 'CORREGIR' THEN
            UPDATE propiedades_v2
            SET
                dormitorios = COALESCE(p_dorms_correcto, dormitorios),
                precio_usd = COALESCE(p_precio_correcto, precio_usd),
                fecha_actualizacion = NOW()
            WHERE id = p_propiedad_id;

            -- Re-merge para recalcular score
            PERFORM merge_discovery_enrichment(v_codigo);

            v_resultado := jsonb_build_object(
                'success', true,
                'accion', 'CORREGIR',
                'mensaje', 'Datos corregidos y re-merge ejecutado'
            );

        -- ACTIVAR: Solo forzar es_para_matching = true
        WHEN 'ACTIVAR' THEN
            UPDATE propiedades_v2
            SET
                es_para_matching = TRUE,
                fecha_actualizacion = NOW()
            WHERE id = p_propiedad_id;

            v_resultado := jsonb_build_object(
                'success', true,
                'accion', 'ACTIVAR',
                'mensaje', 'Propiedad activada para matching'
            );

        -- EXCLUIR: Bloquear permanentemente
        WHEN 'EXCLUIR' THEN
            UPDATE propiedades_v2
            SET
                es_para_matching = FALSE,
                campos_bloqueados = COALESCE(campos_bloqueados, '{}'::jsonb)
                    || jsonb_build_object('es_para_matching', 'excluido_revision_humana_' || NOW()::date),
                fecha_actualizacion = NOW()
            WHERE id = p_propiedad_id;

            v_resultado := jsonb_build_object(
                'success', true,
                'accion', 'EXCLUIR',
                'mensaje', 'Propiedad excluida permanentemente'
            );

        -- ELIMINAR: Borrar del sistema
        WHEN 'ELIMINAR' THEN
            DELETE FROM propiedades_v2 WHERE id = p_propiedad_id;

            v_resultado := jsonb_build_object(
                'success', true,
                'accion', 'ELIMINAR',
                'mensaje', 'Propiedad eliminada del sistema'
            );

        ELSE
            v_resultado := jsonb_build_object(
                'success', false,
                'error', 'Acción no reconocida: ' || p_accion
            );
    END CASE;

    -- Actualizar registro de export si existe
    UPDATE propiedades_excluidas_export
    SET
        accion = p_accion,
        dorms_correcto = p_dorms_correcto,
        precio_correcto = p_precio_correcto,
        notas = p_notas,
        estado = 'procesado',
        fecha_procesado = NOW()
    WHERE propiedad_id = p_propiedad_id
      AND estado = 'pendiente';

    RETURN v_resultado;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION procesar_accion_excluida IS
'Procesa acciones HITL: CORREGIR, ACTIVAR, EXCLUIR, ELIMINAR';

-- =====================================================
-- PASO 5: Vista resumen de excluidas
-- =====================================================

CREATE OR REPLACE VIEW v_resumen_excluidas AS
SELECT
    -- Por razón
    COUNT(*) FILTER (WHERE dormitorios IS NULL) as sin_dormitorios,
    COUNT(*) FILTER (WHERE precio_usd IS NULL) as sin_precio,
    COUNT(*) FILTER (WHERE score_calidad_dato < 70) as score_bajo,
    COUNT(*) FILTER (WHERE dormitorios > 10) as dorms_anomalos,

    -- Por estado HITL
    COUNT(*) as total_excluidas,
    COUNT(*) FILTER (WHERE id IN (
        SELECT propiedad_id FROM propiedades_excluidas_export WHERE estado = 'pendiente'
    )) as en_revision,
    COUNT(*) FILTER (WHERE id IN (
        SELECT propiedad_id FROM propiedades_excluidas_export WHERE estado = 'procesado'
    )) as procesadas,
    COUNT(*) FILTER (WHERE id NOT IN (
        SELECT propiedad_id FROM propiedades_excluidas_export
    )) as sin_exportar

FROM propiedades_v2
WHERE es_para_matching = FALSE
  AND status = 'completado'
  AND tipo_operacion = 'venta';

COMMENT ON VIEW v_resumen_excluidas IS
'Resumen de propiedades excluidas por razón y estado HITL';

-- =====================================================
-- VERIFICACION FINAL
-- =====================================================

SELECT 'Migracion 023 - Componentes Instalados' as status;

SELECT
    'Tabla propiedades_excluidas_export' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_tables WHERE tablename = 'propiedades_excluidas_export')
         THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'Función detectar_razon_exclusion()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'detectar_razon_exclusion')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función exportar_propiedades_excluidas()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'exportar_propiedades_excluidas')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Función procesar_accion_excluida()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'procesar_accion_excluida')
         THEN 'OK' ELSE 'FALTA' END
UNION ALL
SELECT 'Vista v_resumen_excluidas',
    CASE WHEN EXISTS(SELECT 1 FROM pg_views WHERE viewname = 'v_resumen_excluidas')
         THEN 'OK' ELSE 'FALTA' END;

-- Test de export
SELECT '--- Propiedades pendientes de exportar ---' as test;
SELECT * FROM exportar_propiedades_excluidas();

-- Resumen
SELECT '--- Resumen excluidas ---' as test;
SELECT * FROM v_resumen_excluidas;
