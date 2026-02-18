-- ============================================================================
-- Migración 144: Fix exportar_propiedades_excluidas() - excluir las que ya tienen proyecto
-- ============================================================================
-- Bug: Propiedades con es_para_matching=FALSE pero que YA tienen id_proyecto_master
--      aparecían en la lista de excluidas del supervisor HITL.
--      34 de 39 "excluidas" ya tenían proyecto asignado.
-- Fix: Agregar filtro AND p.id_proyecto_master IS NULL
-- ============================================================================

DROP FUNCTION IF EXISTS public.exportar_propiedades_excluidas();

CREATE OR REPLACE FUNCTION public.exportar_propiedades_excluidas()
RETURNS TABLE(
    propiedad_id INTEGER,
    url TEXT,
    fuente TEXT,
    precio_usd NUMERIC,
    precio_m2 NUMERIC,
    dormitorios INTEGER,
    area_m2 NUMERIC,
    zona TEXT,
    nombre_edificio TEXT,
    score_calidad INTEGER,
    razon_exclusion TEXT,
    es_multiproyecto BOOLEAN,
    moneda_original TEXT,
    precio_original NUMERIC,
    precio_fue_normalizado BOOLEAN,
    precio_sospechoso BOOLEAN
)
LANGUAGE plpgsql
AS $$
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
        detectar_razon_exclusion(p.id) as razon_exclusion,
        p.es_multiproyecto,
        (p.datos_json->'financiero'->>'moneda_original')::TEXT,
        (p.datos_json->'financiero'->>'precio_usd_original')::NUMERIC,
        (p.datos_json->'financiero'->>'precio_fue_normalizado')::BOOLEAN,
        (p.datos_json->'financiero'->>'precio_sospechoso')::BOOLEAN
    FROM propiedades_v2 p
    WHERE p.es_para_matching = FALSE
      AND p.status = 'completado'
      AND p.tipo_operacion = 'venta'
      AND p.id_proyecto_master IS NULL  -- No mostrar las que ya tienen proyecto
      AND NOT EXISTS (
          SELECT 1 FROM propiedades_excluidas_export e
          WHERE e.propiedad_id = p.id
            AND e.estado IN ('pendiente', 'procesado')
      )
    ORDER BY p.score_calidad_dato DESC, p.id;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migración 144: Fix excluidas - filtrar propiedades que ya tienen proyecto (34 de 39 eran falsos positivos)';
END $$;
