-- =====================================================
-- Migración 139: Reactivar 61 alquileres existentes
-- Propósito: Cambiar status de excluido/inactivo → nueva
-- Fecha: 11 Feb 2026
-- Prerequisito: 135, 136, 137, 138
-- =====================================================
-- Los 61 alquileres existentes (todos Remax) fueron excluidos
-- por registrar_discovery() porque tipo_operacion != 'venta'.
-- Ahora que tenemos el pipeline de alquiler, los reactivamos
-- para que entren al ciclo: enrichment LLM → merge → completado.
-- =====================================================

-- Primero, snapshot del estado actual (auditoría)
DO $$
DECLARE
    v_count_excluidas INTEGER;
    v_count_inactivas INTEGER;
    v_count_completadas INTEGER;
    v_total INTEGER;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE status = 'excluido_operacion'),
        COUNT(*) FILTER (WHERE status = 'inactivo_pending'),
        COUNT(*) FILTER (WHERE status = 'completado'),
        COUNT(*)
    INTO v_count_excluidas, v_count_inactivas, v_count_completadas, v_total
    FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler';

    RAISE NOTICE 'ANTES de reactivación: % excluidas, % inactivas, % completadas, % total',
        v_count_excluidas, v_count_inactivas, v_count_completadas, v_total;
END $$;

-- Reactivar: excluido_operacion → nueva
UPDATE propiedades_v2
SET
    status = 'nueva'::estado_propiedad,
    es_activa = TRUE,
    es_para_matching = TRUE,
    fecha_actualizacion = NOW(),
    -- Registrar la reactivación en flags_semanticos
    flags_semanticos = COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
            'tipo', 'reactivado_pipeline_alquiler',
            'status_anterior', status::TEXT,
            'fecha', NOW(),
            'migracion', '139_reactivar_alquileres_existentes'
        )
    )
WHERE tipo_operacion = 'alquiler'
  AND status = 'excluido_operacion';

-- Reactivar: inactivo_pending → nueva (estas probablemente desaparecieron
-- del listing pero queremos re-scrapearlas)
UPDATE propiedades_v2
SET
    status = 'nueva'::estado_propiedad,
    es_activa = TRUE,
    es_para_matching = TRUE,
    fecha_actualizacion = NOW(),
    flags_semanticos = COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(
        jsonb_build_object(
            'tipo', 'reactivado_pipeline_alquiler',
            'status_anterior', status::TEXT,
            'fecha', NOW(),
            'migracion', '139_reactivar_alquileres_existentes'
        )
    )
WHERE tipo_operacion = 'alquiler'
  AND status = 'inactivo_pending';

-- Las 2 completadas se dejan como están (ya pasaron el pipeline)

-- Verificar resultado
DO $$
DECLARE
    v_count_nuevas INTEGER;
    v_count_completadas INTEGER;
    v_total INTEGER;
BEGIN
    SELECT
        COUNT(*) FILTER (WHERE status = 'nueva'),
        COUNT(*) FILTER (WHERE status = 'completado'),
        COUNT(*)
    INTO v_count_nuevas, v_count_completadas, v_total
    FROM propiedades_v2
    WHERE tipo_operacion = 'alquiler';

    RAISE NOTICE 'DESPUÉS de reactivación: % nuevas (listas para enrichment), % completadas, % total',
        v_count_nuevas, v_count_completadas, v_total;
END $$;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
/*
-- Estado post-migración
SELECT status, COUNT(*), ROUND(AVG(precio_usd)::numeric, 0) as avg_usd
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'
GROUP BY status;

-- Confirmar que tienen datos mínimos para enrichment
SELECT id, fuente, url, precio_usd, area_total_m2, dormitorios
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND status = 'nueva'
ORDER BY id
LIMIT 10;
*/
