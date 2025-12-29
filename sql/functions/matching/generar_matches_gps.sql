-- =============================================================================
-- FUNCION: generar_matches_gps()
-- DESCRIPCION: Matching por proximidad GPS con proyectos verificados
-- VERSION: 3.0
-- AUTOR: Luis - SICI
-- FECHA: 29 Diciembre 2025
-- =============================================================================
-- CAMBIOS v3.0:
--   - Migrado a propiedades_v2
--   - Solo usa proyectos con gps_verificado_google = TRUE
--   - Filtro de GPS "confiables" (no genéricos/repetidos)
--   - Requiere match de zona para evitar falsos positivos
--   - Confianza: 60-80% según distancia
-- =============================================================================
-- PREREQUISITOS:
--   - proyectos_master con gps_verificado_google poblado (FASE 1 GPS)
--   - propiedades_v2 con zona asignada (poblar_zonas_batch)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.generar_matches_gps()
RETURNS TABLE(
    propiedad_id INTEGER,
    proyecto_sugerido INTEGER,
    confianza INTEGER,
    distancia_metros NUMERIC,
    metodo TEXT
)
LANGUAGE plpgsql
AS $function$
BEGIN
    RETURN QUERY
    WITH
    -- Filtrar GPS "confiables": no repetidos más de 2 veces (evita GPS genéricos)
    gps_confiables AS (
        SELECT latitud, longitud
        FROM propiedades_v2
        WHERE latitud IS NOT NULL
          AND longitud IS NOT NULL
          AND latitud::text NOT LIKE '0.0%'
          AND longitud::text NOT LIKE '0.0%'
        GROUP BY latitud, longitud
        HAVING COUNT(*) <= 3  -- Máximo 3 propiedades en mismo punto
    ),
    -- Calcular distancias usando Haversine
    distancias AS (
        SELECT
            p.id as prop_id,
            pm.id_proyecto_master as proy_id,
            pm.nombre_oficial as nombre_proyecto,
            -- Formula Haversine para distancia en metros
            (6371000 * acos(
                LEAST(1.0, GREATEST(-1.0,
                    cos(radians(p.latitud::numeric)) *
                    cos(radians(pm.latitud::numeric)) *
                    cos(radians(pm.longitud::numeric) - radians(p.longitud::numeric)) +
                    sin(radians(p.latitud::numeric)) *
                    sin(radians(pm.latitud::numeric))
                ))
            ))::numeric as distancia
        FROM propiedades_v2 p
        -- Solo GPS confiables (no genéricos)
        JOIN gps_confiables gc
            ON p.latitud = gc.latitud
            AND p.longitud = gc.longitud
        -- Solo proyectos verificados con Google
        JOIN proyectos_master pm
            ON pm.activo = TRUE
            AND pm.gps_verificado_google = TRUE
            -- Match de zona obligatorio para evitar falsos positivos
            AND p.zona = pm.zona
        WHERE p.id_proyecto_master IS NULL
          AND p.status IN ('completado', 'actualizado')
          AND p.es_para_matching = TRUE
          AND p.zona IS NOT NULL
    ),
    -- Seleccionar el proyecto más cercano por propiedad
    matches_cercanos AS (
        SELECT DISTINCT ON (prop_id)
            prop_id,
            proy_id,
            nombre_proyecto,
            distancia,
            CASE
                WHEN distancia < 50 THEN 85   -- Muy cerca: alta confianza
                WHEN distancia < 100 THEN 80  -- Cerca
                WHEN distancia < 150 THEN 75  -- Moderado
                WHEN distancia < 200 THEN 70  -- Aceptable
                WHEN distancia < 250 THEN 65  -- Límite
                ELSE 60
            END as score
        FROM distancias
        WHERE distancia < 250  -- Máximo 250 metros
        ORDER BY prop_id, distancia ASC
    )
    SELECT
        mc.prop_id,
        mc.proy_id,
        mc.score,
        ROUND(mc.distancia, 1),
        'gps_verificado'::TEXT
    FROM matches_cercanos mc
    -- Excluir propiedades que ya tienen sugerencia por otro método
    WHERE NOT EXISTS (
        SELECT 1 FROM matching_sugerencias ms
        WHERE ms.propiedad_id = mc.prop_id
          AND ms.proyecto_master_sugerido = mc.proy_id
    );
END;
$function$;

-- =============================================================================
-- COMENTARIOS
-- =============================================================================
COMMENT ON FUNCTION generar_matches_gps() IS
'v3.0: Matching por proximidad GPS usando proyectos con coordenadas verificadas por Google.
- Tabla: propiedades_v2
- Requiere: gps_verificado_google = TRUE en proyectos_master
- Requiere: zona match (p.zona = pm.zona)
- Filtra GPS genéricos (repetidos >3 veces)
- Distancias: <50m=85%, <100m=80%, <150m=75%, <200m=70%, <250m=65%
- No duplica sugerencias existentes';

-- =============================================================================
-- EJEMPLO DE USO
-- =============================================================================
-- SELECT * FROM generar_matches_gps();
--
-- Resultado esperado:
--  propiedad_id | proyecto_sugerido | confianza | distancia_metros | metodo
-- --------------+-------------------+-----------+------------------+----------------
--           123 |                45 |        80 |             87.3 | gps_verificado
--           456 |                12 |        75 |            142.1 | gps_verificado
-- =============================================================================
