-- ============================================================================
-- Migración 145: Bajar umbral de pendientes HITL de 70% a 55%
-- ============================================================================
-- 27 sugerencias con confianza 60-68% no aparecían en ninguna página del admin.
-- Estaban en un limbo: no en matching (filtro >=70) ni en sin-match (tienen sugerencia).
-- Fix: Bajar el filtro a >= 55 para que aparezcan en /admin/supervisor/matching
-- ============================================================================

DROP FUNCTION IF EXISTS obtener_pendientes_para_sheets();

CREATE OR REPLACE FUNCTION obtener_pendientes_para_sheets()
RETURNS TABLE(
    id_sugerencia INTEGER,
    propiedad_id INTEGER,
    url_propiedad TEXT,
    nombre_edificio TEXT,
    proyecto_sugerido TEXT,
    proyecto_id INTEGER,
    metodo TEXT,
    confianza INTEGER,
    distancia_metros INTEGER,
    latitud NUMERIC,
    longitud NUMERIC,
    fuente TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        ms.id,
        ms.propiedad_id::INTEGER,
        p.url::TEXT,
        COALESCE(
            NULLIF(TRIM(p.nombre_edificio), ''),
            TRIM(p.datos_json_enrichment->>'nombre_edificio'),
            'SIN NOMBRE'
        )::TEXT,
        pm.nombre_oficial::TEXT,
        ms.proyecto_master_sugerido,
        ms.metodo_matching::TEXT,
        ms.score_confianza::INTEGER,
        ms.distancia_metros::INTEGER,
        p.latitud,
        p.longitud,
        p.fuente::TEXT
    FROM matching_sugerencias ms
    JOIN propiedades_v2 p ON p.id = ms.propiedad_id
    JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
    WHERE ms.estado = 'pendiente'
      AND ms.score_confianza BETWEEN 55 AND 84
    ORDER BY ms.score_confianza DESC, ms.created_at DESC;
END;
$$;

DO $$
BEGIN
    RAISE NOTICE 'Migración 145: Umbral pendientes HITL 70→55 (27 sugerencias ahora visibles)';
END $$;
