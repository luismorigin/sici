-- =====================================================
-- MIGRACIÓN 009: sin_match_exportados
-- =====================================================
-- Fecha: 30 Diciembre 2025
-- Propósito: Tracking de propiedades exportadas para revisión manual
-- =====================================================

CREATE TABLE IF NOT EXISTS sin_match_exportados (
    id SERIAL PRIMARY KEY,
    propiedad_id INTEGER NOT NULL REFERENCES propiedades_v2(id) ON DELETE CASCADE,
    fecha_export TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Estado del procesamiento
    estado VARCHAR(50) DEFAULT 'pendiente',
    -- Valores: pendiente, asignado, creado, sin_proyecto

    -- Resultado del procesamiento
    proyecto_asignado INTEGER REFERENCES proyectos_master(id_proyecto_master),
    fecha_procesado TIMESTAMP,
    procesado_por VARCHAR(50) DEFAULT 'humano_sheets',

    -- Metadata
    notas TEXT,

    -- Evitar duplicados
    UNIQUE(propiedad_id)
);

-- Índices
CREATE INDEX idx_sin_match_estado ON sin_match_exportados(estado);
CREATE INDEX idx_sin_match_fecha ON sin_match_exportados(fecha_export DESC);

-- Comentario
COMMENT ON TABLE sin_match_exportados IS
'Tracking de propiedades sin match exportadas a Google Sheets para revisión manual.
Estados: pendiente (en Sheet), asignado (proyecto existente), creado (proyecto nuevo), sin_proyecto (no aplica).
Poblado por workflow Exportar Sin Match diario 7 AM.';

-- Función helper para obtener propiedades pendientes de exportar
CREATE OR REPLACE FUNCTION obtener_sin_match_para_exportar(p_limit INTEGER DEFAULT NULL)
RETURNS TABLE (
    id INTEGER,
    url TEXT,
    latitud NUMERIC,
    longitud NUMERIC,
    zona VARCHAR,
    nombre_edificio VARCHAR,
    proyectos_cercanos TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH props_sin_match AS (
        SELECT
            p.id,
            p.url,
            p.latitud,
            p.longitud,
            p.zona,
            p.nombre_edificio
        FROM propiedades_v2 p
        WHERE p.status = 'completado'
            AND p.id_proyecto_master IS NULL
            AND p.es_para_matching = TRUE
            AND NOT EXISTS (
                SELECT 1 FROM sin_match_exportados sme
                WHERE sme.propiedad_id = p.id
            )
    ),
    proyectos_cercanos AS (
        SELECT
            psm.id as propiedad_id,
            STRING_AGG(
                pm.nombre_oficial || ' [ID:' || pm.id_proyecto_master || '] (' ||
                ROUND(calcular_distancia_metros(psm.latitud, psm.longitud, pm.latitud, pm.longitud))::TEXT || 'm)',
                ' | '
                ORDER BY calcular_distancia_metros(psm.latitud, psm.longitud, pm.latitud, pm.longitud)
            ) as proyectos_cerca
        FROM props_sin_match psm
        CROSS JOIN LATERAL (
            SELECT id_proyecto_master, nombre_oficial, latitud, longitud
            FROM proyectos_master pm
            WHERE pm.activo = TRUE
                AND pm.latitud IS NOT NULL
                AND pm.longitud IS NOT NULL
                AND calcular_distancia_metros(psm.latitud, psm.longitud, pm.latitud, pm.longitud) < 200
            ORDER BY calcular_distancia_metros(psm.latitud, psm.longitud, pm.latitud, pm.longitud)
            LIMIT 5
        ) pm
        GROUP BY psm.id
    )
    SELECT
        p.id,
        p.url::TEXT,
        p.latitud,
        p.longitud,
        p.zona,
        p.nombre_edificio,
        COALESCE(pc.proyectos_cerca, 'Ninguno < 200m') as proyectos_cercanos
    FROM props_sin_match p
    LEFT JOIN proyectos_cercanos pc ON p.id = pc.propiedad_id
    ORDER BY p.zona NULLS LAST, p.id
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION obtener_sin_match_para_exportar(INTEGER) IS
'Obtiene propiedades sin match que no han sido exportadas aún.
Incluye lista de proyectos cercanos (<200m) con ID y distancia.
Formato proyectos: "Torre Sol [ID:45] (32m) | Torre Luna [ID:67] (85m)"';

-- Función para registrar exportación
CREATE OR REPLACE FUNCTION registrar_exportacion_sin_match(p_propiedad_ids INTEGER[])
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    INSERT INTO sin_match_exportados (propiedad_id, estado)
    SELECT unnest(p_propiedad_ids), 'pendiente'
    ON CONFLICT (propiedad_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION registrar_exportacion_sin_match(INTEGER[]) IS
'Registra que las propiedades fueron exportadas al Sheet.
Evita duplicados con ON CONFLICT.';

-- Función para procesar decisión del humano
CREATE OR REPLACE FUNCTION procesar_decision_sin_match(
    p_propiedad_id INTEGER,
    p_accion VARCHAR,  -- 'asignar', 'crear', 'sin_proyecto'
    p_proyecto_id INTEGER DEFAULT NULL,
    p_nombre_proyecto VARCHAR DEFAULT NULL,
    p_gps_nuevo VARCHAR DEFAULT NULL,
    p_notas TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    mensaje TEXT,
    proyecto_id INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_proyecto_id INTEGER;
    v_resultado RECORD;
BEGIN
    CASE p_accion
        WHEN 'asignar' THEN
            -- Asignar proyecto existente
            IF p_proyecto_id IS NULL THEN
                RETURN QUERY SELECT FALSE, 'proyecto_id requerido para asignar'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            UPDATE propiedades_v2
            SET id_proyecto_master = p_proyecto_id
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'asignado',
                proyecto_asignado = p_proyecto_id,
                fecha_procesado = NOW(),
                notas = p_notas
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Proyecto asignado correctamente'::TEXT, p_proyecto_id;

        WHEN 'crear' THEN
            -- Crear proyecto nuevo usando función existente
            IF p_nombre_proyecto IS NULL OR p_nombre_proyecto = '' THEN
                RETURN QUERY SELECT FALSE, 'nombre_proyecto requerido para crear'::TEXT, NULL::INTEGER;
                RETURN;
            END IF;

            -- Reutilizar crear_proyecto_desde_sugerencia
            SELECT * INTO v_resultado
            FROM crear_proyecto_desde_sugerencia(
                p_nombre_proyecto,
                p_propiedad_id,
                0,  -- sugerencia_id dummy
                COALESCE(p_gps_nuevo, '')
            );

            v_proyecto_id := v_resultado.proyecto_id;

            UPDATE sin_match_exportados
            SET estado = 'creado',
                proyecto_asignado = v_proyecto_id,
                fecha_procesado = NOW(),
                notas = p_notas
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, v_resultado.mensaje, v_proyecto_id;

        WHEN 'sin_proyecto' THEN
            -- Marcar como sin proyecto
            UPDATE propiedades_v2
            SET es_para_matching = FALSE
            WHERE id = p_propiedad_id;

            UPDATE sin_match_exportados
            SET estado = 'sin_proyecto',
                fecha_procesado = NOW(),
                notas = COALESCE(p_notas, 'Marcado como propiedad sin edificio')
            WHERE propiedad_id = p_propiedad_id;

            RETURN QUERY SELECT TRUE, 'Propiedad marcada como sin proyecto'::TEXT, NULL::INTEGER;

        ELSE
            RETURN QUERY SELECT FALSE, 'Acción no válida: ' || p_accion, NULL::INTEGER;
    END CASE;
END;
$$;

COMMENT ON FUNCTION procesar_decision_sin_match(INTEGER, VARCHAR, INTEGER, VARCHAR, VARCHAR, TEXT) IS
'Procesa decisión humana del Sheet Sin Match.
Acciones: asignar (proyecto existente), crear (proyecto nuevo), sin_proyecto (no aplica matching).
Reutiliza crear_proyecto_desde_sugerencia para mantener consistencia.';
