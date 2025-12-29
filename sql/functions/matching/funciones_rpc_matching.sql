-- =====================================================
-- FUNCIONES RPC MATCHING - SICI
-- Sistema de Matching Propiedades → Proyectos
-- =====================================================
-- Fecha: 29 Diciembre 2025
-- Propósito: Funciones PostgreSQL para workflows n8n
-- Uso: Matching Nocturno + Matching Supervisor
-- =====================================================

-- =====================================================
-- FUNCION 1: obtener_pendientes_para_sheets
-- =====================================================
-- Propósito:
--   Obtener sugerencias pendientes con datos enriquecidos
--   para exportar a Google Sheets
--
-- Retorna:
--   Tabla con datos de la sugerencia + propiedad + proyecto
--
-- Filtros:
--   - estado = 'pendiente'
--   - score_confianza BETWEEN 70 AND 84
--
-- Uso desde n8n:
--   POST /rest/v1/rpc/obtener_pendientes_para_sheets
-- =====================================================

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
    distancia_metros NUMERIC,
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
        ms.propiedad_id,
        p.url,
        COALESCE(
            NULLIF(TRIM(p.nombre_edificio), ''),
            TRIM(p.datos_json_enrichment->>'nombre_edificio'),
            'SIN NOMBRE'
        )::TEXT,
        pm.nombre_oficial::TEXT,
        ms.proyecto_master_sugerido,
        ms.metodo_matching::TEXT,
        ms.score_confianza::INTEGER,
        ms.distancia_metros,
        p.latitud,
        p.longitud,
        p.fuente::TEXT
    FROM matching_sugerencias ms
    JOIN propiedades_v2 p ON p.id = ms.propiedad_id
    JOIN proyectos_master pm ON pm.id_proyecto_master = ms.proyecto_master_sugerido
    WHERE ms.estado = 'pendiente'
      AND ms.score_confianza BETWEEN 70 AND 84
    ORDER BY ms.score_confianza DESC, ms.created_at DESC;
END;
$$;

COMMENT ON FUNCTION obtener_pendientes_para_sheets() IS
'Obtiene sugerencias de matching pendientes (70-84% confianza) con datos enriquecidos para Google Sheets.
Usado por workflow Matching Nocturno.';


-- =====================================================
-- FUNCION 2: aplicar_matches_revisados
-- =====================================================
-- Propósito:
--   Aplicar decisiones humanas del Google Sheets
--   - Aprobar sugerencias seleccionadas
--   - Rechazar sugerencias seleccionadas
--   - Ejecutar aplicar_matches_aprobados() para actualizar propiedades
--
-- Parametros:
--   p_ids_aprobados (INTEGER[]): IDs de sugerencias aprobadas por humano
--   p_ids_rechazados (INTEGER[]): IDs de sugerencias rechazadas por humano
--
-- Retorna:
--   TABLE(aprobados_aplicados, rechazados_marcados, propiedades_actualizadas)
--
-- Uso desde n8n:
--   POST /rest/v1/rpc/aplicar_matches_revisados
--   Body: {
--     "p_ids_aprobados": "{1,2,3}",
--     "p_ids_rechazados": "{4,5}"
--   }
-- =====================================================

DROP FUNCTION IF EXISTS aplicar_matches_revisados(INTEGER[], INTEGER[]);

CREATE OR REPLACE FUNCTION aplicar_matches_revisados(
    p_ids_aprobados INTEGER[],
    p_ids_rechazados INTEGER[]
)
RETURNS TABLE(
    aprobados_aplicados INTEGER,
    rechazados_marcados INTEGER,
    propiedades_actualizadas INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_aprobados INT := 0;
    v_rechazados INT := 0;
    v_aplicados INT := 0;
    v_resultado RECORD;
BEGIN
    -- 1. Aprobar las sugerencias seleccionadas
    IF p_ids_aprobados IS NOT NULL AND array_length(p_ids_aprobados, 1) > 0 THEN
        UPDATE matching_sugerencias
        SET estado = 'aprobado',
            revisado_por = 'humano_sheets',
            fecha_revision = NOW()
        WHERE id = ANY(p_ids_aprobados)
          AND estado = 'pendiente';

        GET DIAGNOSTICS v_aprobados = ROW_COUNT;
    END IF;

    -- 2. Rechazar las sugerencias seleccionadas
    IF p_ids_rechazados IS NOT NULL AND array_length(p_ids_rechazados, 1) > 0 THEN
        UPDATE matching_sugerencias
        SET estado = 'rechazado',
            revisado_por = 'humano_sheets',
            fecha_revision = NOW()
        WHERE id = ANY(p_ids_rechazados)
          AND estado = 'pendiente';

        GET DIAGNOSTICS v_rechazados = ROW_COUNT;
    END IF;

    -- 3. Aplicar los matches recién aprobados a propiedades_v2
    IF v_aprobados > 0 THEN
        SELECT a.actualizados INTO v_aplicados
        FROM aplicar_matches_aprobados() AS a;
    END IF;

    RETURN QUERY SELECT v_aprobados, v_rechazados, v_aplicados;
END;
$$;

COMMENT ON FUNCTION aplicar_matches_revisados(INTEGER[], INTEGER[]) IS
'Aplica decisiones humanas del Google Sheets.
Aprueba/rechaza sugerencias y ejecuta aplicar_matches_aprobados().
Usado por workflow Matching Supervisor.';


-- =====================================================
-- FUNCION 3: limpiar_sugerencias_procesadas
-- =====================================================
-- Propósito:
--   Marcar sugerencias como 'sincronizado' después de procesarlas
--   para que no vuelvan a aparecer en el Google Sheets
--
-- Parametros:
--   p_ids (INTEGER[]): IDs de sugerencias procesadas
--
-- Uso:
--   Llamar después de que el Supervisor aplicó los matches
-- =====================================================

DROP FUNCTION IF EXISTS limpiar_sugerencias_procesadas(INTEGER[]);

CREATE OR REPLACE FUNCTION limpiar_sugerencias_procesadas(p_ids INTEGER[])
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INT;
BEGIN
    UPDATE matching_sugerencias
    SET estado = 'sincronizado_sheets',
        fecha_revision = NOW()
    WHERE id = ANY(p_ids)
      AND estado IN ('aprobado', 'rechazado');

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION limpiar_sugerencias_procesadas(INTEGER[]) IS
'Marca sugerencias como sincronizado_sheets después de procesarlas.
Evita que vuelvan a aparecer en el Google Sheets.';


-- =====================================================
-- FUNCION 4: resumen_matching_diario
-- =====================================================
-- Propósito:
--   Obtener resumen del matching para notificaciones Slack
--
-- Retorna:
--   Estadísticas del día: nuevos, auto-aprobados, pendientes, etc.
-- =====================================================

DROP FUNCTION IF EXISTS resumen_matching_diario();

CREATE OR REPLACE FUNCTION resumen_matching_diario()
RETURNS TABLE(
    total_sugerencias BIGINT,
    auto_aprobados BIGINT,
    pendientes_revision BIGINT,
    auto_rechazados BIGINT,
    por_metodo JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE estado = 'aprobado' AND revisado_por = 'sistema_automatico') as auto_aprob,
            COUNT(*) FILTER (WHERE estado = 'pendiente' AND score_confianza BETWEEN 70 AND 84) as pendientes,
            COUNT(*) FILTER (WHERE estado = 'rechazado') as rechazados
        FROM matching_sugerencias
        WHERE DATE(created_at) = CURRENT_DATE
    ),
    metodos AS (
        SELECT jsonb_object_agg(metodo_matching, cnt) as por_metodo
        FROM (
            SELECT metodo_matching, COUNT(*) as cnt
            FROM matching_sugerencias
            WHERE DATE(created_at) = CURRENT_DATE
            GROUP BY metodo_matching
        ) m
    )
    SELECT
        s.total,
        s.auto_aprob,
        s.pendientes,
        s.rechazados,
        COALESCE(m.por_metodo, '{}'::jsonb)
    FROM stats s, metodos m;
END;
$$;

COMMENT ON FUNCTION resumen_matching_diario() IS
'Obtiene estadísticas del matching del día para notificaciones Slack.';


-- =====================================================
-- FUNCION 5: crear_proyecto_desde_sugerencia
-- =====================================================
-- Propósito:
--   Crear un proyecto nuevo en proyectos_master cuando el humano
--   rechaza un match pero escribe un nombre alternativo correcto.
--
-- Parametros:
--   p_nombre_proyecto (TEXT): Nombre del proyecto a crear
--   p_propiedad_id (INTEGER): ID de la propiedad original (para copiar zona/GPS)
--   p_sugerencia_id (INTEGER): ID de la sugerencia rechazada (para trazabilidad)
--
-- Retorna:
--   TABLE(proyecto_creado, nueva_sugerencia_id, mensaje)
--
-- Flujo:
--   1. Verificar que el nombre no existe en proyectos_master
--   2. Si existe → retornar proyecto existente
--   3. Si no existe → crear con fuente='humano_propuesto'
--   4. Crear nueva sugerencia de matching con 95% confianza
--   5. Retornar IDs para seguimiento
--
-- Uso desde n8n:
--   POST /rest/v1/rpc/crear_proyecto_desde_sugerencia
--   Body: {
--     "p_nombre_proyecto": "Torres del Sol",
--     "p_propiedad_id": 12345,
--     "p_sugerencia_id": 789
--   }
-- =====================================================

DROP FUNCTION IF EXISTS crear_proyecto_desde_sugerencia(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION crear_proyecto_desde_sugerencia(
    p_nombre_proyecto TEXT,
    p_propiedad_id INTEGER,
    p_sugerencia_id INTEGER
)
RETURNS TABLE(
    proyecto_id INTEGER,
    proyecto_creado BOOLEAN,
    nueva_sugerencia_id INTEGER,
    mensaje TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_proyecto_existente INTEGER;
    v_nuevo_proyecto_id INTEGER;
    v_nueva_sugerencia_id INTEGER;
    v_zona TEXT;
    v_lat NUMERIC;
    v_lng NUMERIC;
BEGIN
    -- Normalizar nombre
    p_nombre_proyecto := TRIM(UPPER(p_nombre_proyecto));

    IF p_nombre_proyecto IS NULL OR p_nombre_proyecto = '' THEN
        RETURN QUERY SELECT
            NULL::INTEGER,
            FALSE,
            NULL::INTEGER,
            'Nombre de proyecto vacío'::TEXT;
        RETURN;
    END IF;

    -- 1. Verificar si ya existe el proyecto
    SELECT id_proyecto_master INTO v_proyecto_existente
    FROM proyectos_master
    WHERE UPPER(nombre_oficial) = p_nombre_proyecto
    LIMIT 1;

    -- 2. Si existe, crear sugerencia apuntando al existente
    IF v_proyecto_existente IS NOT NULL THEN
        -- Verificar que no existe ya una sugerencia para esta combinación
        IF EXISTS (
            SELECT 1 FROM matching_sugerencias
            WHERE propiedad_id = p_propiedad_id
              AND proyecto_master_sugerido = v_proyecto_existente
              AND estado IN ('pendiente', 'aprobado')
        ) THEN
            RETURN QUERY SELECT
                v_proyecto_existente,
                FALSE,
                NULL::INTEGER,
                'Ya existe sugerencia para este proyecto'::TEXT;
            RETURN;
        END IF;

        -- Crear nueva sugerencia con proyecto existente
        INSERT INTO matching_sugerencias (
            propiedad_id,
            proyecto_master_sugerido,
            metodo_matching,
            score_confianza,
            estado,
            revisado_por,
            notas
        )
        VALUES (
            p_propiedad_id,
            v_proyecto_existente,
            'humano_alternativo',
            95,
            'pendiente',
            NULL,
            format('Proyecto alternativo sugerido por humano. Sugerencia original ID: %s', p_sugerencia_id)
        )
        RETURNING id INTO v_nueva_sugerencia_id;

        RETURN QUERY SELECT
            v_proyecto_existente,
            FALSE,
            v_nueva_sugerencia_id,
            format('Proyecto existente. Nueva sugerencia ID %s creada', v_nueva_sugerencia_id)::TEXT;
        RETURN;
    END IF;

    -- 3. Proyecto no existe, obtener datos de la propiedad para heredar zona/GPS
    SELECT
        COALESCE(p.zona, 'Sin zona'),
        p.latitud,
        p.longitud
    INTO v_zona, v_lat, v_lng
    FROM propiedades_v2 p
    WHERE p.id = p_propiedad_id;

    -- 4. Crear proyecto nuevo
    INSERT INTO proyectos_master (
        nombre_oficial,
        zona,
        latitud,
        longitud,
        fuente_verificacion,
        notas,
        activo
    )
    VALUES (
        p_nombre_proyecto,
        v_zona,
        v_lat,
        v_lng,
        'humano_propuesto',
        format('Creado desde sugerencia humana. Propiedad origen ID: %s. Requiere verificación GPS.', p_propiedad_id),
        TRUE
    )
    RETURNING id_proyecto_master INTO v_nuevo_proyecto_id;

    -- 5. Crear sugerencia de matching con alta confianza
    INSERT INTO matching_sugerencias (
        propiedad_id,
        proyecto_master_sugerido,
        metodo_matching,
        score_confianza,
        estado,
        revisado_por,
        notas
    )
    VALUES (
        p_propiedad_id,
        v_nuevo_proyecto_id,
        'humano_alternativo',
        95,
        'pendiente',
        NULL,
        format('Proyecto nuevo creado por humano. Sugerencia original rechazada ID: %s', p_sugerencia_id)
    )
    RETURNING id INTO v_nueva_sugerencia_id;

    RETURN QUERY SELECT
        v_nuevo_proyecto_id,
        TRUE,
        v_nueva_sugerencia_id,
        format('Proyecto "%s" creado (ID %s). Nueva sugerencia ID %s', p_nombre_proyecto, v_nuevo_proyecto_id, v_nueva_sugerencia_id)::TEXT;
END;
$$;

COMMENT ON FUNCTION crear_proyecto_desde_sugerencia(TEXT, INTEGER, INTEGER) IS
'Crea un proyecto nuevo en proyectos_master desde una sugerencia humana.
Si el proyecto ya existe, crea sugerencia apuntando al existente.
Siempre crea nueva sugerencia con 95% confianza para revisión.
Usado por workflow Matching Supervisor cuando humano escribe PROYECTO_ALTERNATIVO.';


-- =====================================================
-- VERIFICACION DE FUNCIONES
-- =====================================================

SELECT
    p.proname AS nombre_funcion,
    pg_get_function_arguments(p.oid) AS argumentos,
    pg_get_function_result(p.oid) AS retorno
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'obtener_pendientes_para_sheets',
    'aplicar_matches_revisados',
    'limpiar_sugerencias_procesadas',
    'resumen_matching_diario',
    'crear_proyecto_desde_sugerencia'
  )
ORDER BY p.proname;


-- =====================================================
-- EJEMPLOS DE USO
-- =====================================================

-- Ver pendientes para el Sheet
-- SELECT * FROM obtener_pendientes_para_sheets();

-- Aplicar decisiones (desde n8n)
-- SELECT * FROM aplicar_matches_revisados(
--     ARRAY[701, 702, 703],  -- aprobados
--     ARRAY[704, 705]        -- rechazados
-- );

-- Obtener resumen del día
-- SELECT * FROM resumen_matching_diario();

-- Crear proyecto desde sugerencia humana
-- SELECT * FROM crear_proyecto_desde_sugerencia(
--     'Torres del Sol',  -- nombre del proyecto
--     12345,             -- propiedad_id
--     789                -- sugerencia_id rechazada
-- );


-- =====================================================
-- FIN DEL ARCHIVO
-- =====================================================
