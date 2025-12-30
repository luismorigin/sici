-- =====================================================
-- MIGRACIÓN 005: crear_proyecto_desde_sugerencia v2
-- =====================================================
-- Fecha: 29 Diciembre 2025
-- Propósito: Función RPC mejorada con validación GPS + fuzzy
-- Validación: GPS < 15m + Nombre 70%+ similar = mismo edificio
-- =====================================================

-- Función auxiliar para calcular similitud de strings
CREATE OR REPLACE FUNCTION calcular_similitud(texto1 TEXT, texto2 TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    t1 TEXT;
    t2 TEXT;
    max_len INT;
    dist INT;
BEGIN
    t1 := UPPER(TRIM(COALESCE(texto1, '')));
    t2 := UPPER(TRIM(COALESCE(texto2, '')));

    IF t1 = '' OR t2 = '' THEN
        RETURN 0;
    END IF;

    max_len := GREATEST(LENGTH(t1), LENGTH(t2));
    dist := levenshtein(t1, t2);

    RETURN ROUND((1.0 - (dist::NUMERIC / max_len)) * 100, 2);
END;
$$;

COMMENT ON FUNCTION calcular_similitud(TEXT, TEXT) IS
'Calcula porcentaje de similitud entre dos strings usando Levenshtein.
Retorna 0-100 donde 100 es idéntico.';


-- Función auxiliar para calcular distancia GPS en metros
CREATE OR REPLACE FUNCTION calcular_distancia_metros(
    lat1 NUMERIC, lng1 NUMERIC,
    lat2 NUMERIC, lng2 NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    R CONSTANT NUMERIC := 6371000; -- Radio de la Tierra en metros
    phi1 NUMERIC;
    phi2 NUMERIC;
    delta_phi NUMERIC;
    delta_lambda NUMERIC;
    a NUMERIC;
    c NUMERIC;
BEGIN
    IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
        RETURN NULL;
    END IF;

    phi1 := radians(lat1);
    phi2 := radians(lat2);
    delta_phi := radians(lat2 - lat1);
    delta_lambda := radians(lng2 - lng1);

    a := sin(delta_phi/2) * sin(delta_phi/2) +
         cos(phi1) * cos(phi2) *
         sin(delta_lambda/2) * sin(delta_lambda/2);
    c := 2 * atan2(sqrt(a), sqrt(1-a));

    RETURN ROUND(R * c, 2);
END;
$$;

COMMENT ON FUNCTION calcular_distancia_metros(NUMERIC, NUMERIC, NUMERIC, NUMERIC) IS
'Calcula distancia en metros entre dos puntos GPS usando fórmula Haversine.';


-- Eliminar función anterior
DROP FUNCTION IF EXISTS crear_proyecto_desde_sugerencia(TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS crear_proyecto_desde_sugerencia(TEXT, INTEGER, INTEGER, TEXT);

-- Nueva función con GPS alternativo y validación
CREATE OR REPLACE FUNCTION crear_proyecto_desde_sugerencia(
    p_nombre_proyecto TEXT,
    p_propiedad_id INTEGER,
    p_sugerencia_id INTEGER,
    p_gps_alternativo TEXT DEFAULT ''
)
RETURNS TABLE(
    proyecto_id INTEGER,
    proyecto_creado BOOLEAN,
    proyecto_existente_usado BOOLEAN,
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
    v_lat_alt NUMERIC;
    v_lng_alt NUMERIC;
    v_nombre_normalizado TEXT;
    v_match_record RECORD;
    v_similitud NUMERIC;
    v_distancia NUMERIC;
BEGIN
    -- Normalizar nombre
    v_nombre_normalizado := TRIM(UPPER(p_nombre_proyecto));

    IF v_nombre_normalizado IS NULL OR v_nombre_normalizado = '' THEN
        RETURN QUERY SELECT
            NULL::INTEGER,
            FALSE,
            FALSE,
            NULL::INTEGER,
            'Nombre de proyecto vacío'::TEXT;
        RETURN;
    END IF;

    -- Parsear GPS alternativo (formato: "-17.756, -63.197")
    IF p_gps_alternativo IS NOT NULL AND p_gps_alternativo != '' THEN
        BEGIN
            v_lat_alt := TRIM(SPLIT_PART(p_gps_alternativo, ',', 1))::NUMERIC;
            v_lng_alt := TRIM(SPLIT_PART(p_gps_alternativo, ',', 2))::NUMERIC;
        EXCEPTION WHEN OTHERS THEN
            v_lat_alt := NULL;
            v_lng_alt := NULL;
        END;
    END IF;

    -- 1. Buscar por nombre exacto
    SELECT id_proyecto_master INTO v_proyecto_existente
    FROM proyectos_master
    WHERE UPPER(nombre_oficial) = v_nombre_normalizado
    LIMIT 1;

    IF v_proyecto_existente IS NOT NULL THEN
        -- Verificar que no existe ya una sugerencia
        IF EXISTS (
            SELECT 1 FROM matching_sugerencias
            WHERE propiedad_id = p_propiedad_id
              AND proyecto_master_sugerido = v_proyecto_existente
              AND estado IN ('pendiente', 'aprobado')
        ) THEN
            RETURN QUERY SELECT
                v_proyecto_existente,
                FALSE,
                TRUE,
                NULL::INTEGER,
                'Ya existe sugerencia para este proyecto (match exacto nombre)'::TEXT;
            RETURN;
        END IF;

        -- Crear sugerencia APROBADA con proyecto existente
        INSERT INTO matching_sugerencias (
            propiedad_id,
            proyecto_master_sugerido,
            metodo_matching,
            score_confianza,
            estado,
            revisado_por,
            fecha_revision,
            razon_match
        )
        VALUES (
            p_propiedad_id,
            v_proyecto_existente,
            'humano_alternativo',
            95,
            'aprobado',
            'humano_sheets',
            NOW(),
            format('Match exacto nombre. Sugerencia original: %s', p_sugerencia_id)
        )
        RETURNING id INTO v_nueva_sugerencia_id;

        -- Aplicar match directamente
        UPDATE propiedades_v2
        SET id_proyecto_master = v_proyecto_existente
        WHERE id = p_propiedad_id;

        RETURN QUERY SELECT
            v_proyecto_existente,
            FALSE,
            TRUE,
            v_nueva_sugerencia_id,
            format('Proyecto existente (nombre exacto). Match aplicado. Sugerencia ID %s', v_nueva_sugerencia_id)::TEXT;
        RETURN;
    END IF;

    -- 2. Si hay GPS alternativo, buscar por proximidad + similitud nombre
    IF v_lat_alt IS NOT NULL AND v_lng_alt IS NOT NULL THEN
        FOR v_match_record IN
            SELECT
                pm.id_proyecto_master,
                pm.nombre_oficial,
                calcular_distancia_metros(v_lat_alt, v_lng_alt, pm.latitud, pm.longitud) as distancia,
                calcular_similitud(v_nombre_normalizado, pm.nombre_oficial) as similitud
            FROM proyectos_master pm
            WHERE pm.latitud IS NOT NULL
              AND pm.longitud IS NOT NULL
              AND pm.activo = TRUE
            ORDER BY distancia ASC NULLS LAST
            LIMIT 10
        LOOP
            -- Criterio: GPS < 15m Y Nombre >= 70% similar
            IF v_match_record.distancia IS NOT NULL
               AND v_match_record.distancia < 15
               AND v_match_record.similitud >= 70 THEN

                v_proyecto_existente := v_match_record.id_proyecto_master;

                -- Verificar que no existe sugerencia
                IF EXISTS (
                    SELECT 1 FROM matching_sugerencias
                    WHERE propiedad_id = p_propiedad_id
                      AND proyecto_master_sugerido = v_proyecto_existente
                      AND estado IN ('pendiente', 'aprobado')
                ) THEN
                    RETURN QUERY SELECT
                        v_proyecto_existente,
                        FALSE,
                        TRUE,
                        NULL::INTEGER,
                        format('Ya existe sugerencia (GPS %.1fm + nombre %.0f%% similar)',
                               v_match_record.distancia, v_match_record.similitud)::TEXT;
                    RETURN;
                END IF;

                -- Crear sugerencia APROBADA con proyecto existente
                INSERT INTO matching_sugerencias (
                    propiedad_id,
                    proyecto_master_sugerido,
                    metodo_matching,
                    score_confianza,
                    estado,
                    revisado_por,
                    fecha_revision,
                    distancia_metros,
                    razon_match
                )
                VALUES (
                    p_propiedad_id,
                    v_proyecto_existente,
                    'humano_alternativo',
                    95,
                    'aprobado',
                    'humano_sheets',
                    NOW(),
                    v_match_record.distancia::INTEGER,
                    format('GPS %.1fm + nombre %.0f%% similar a "%s". Sugerencia original: %s',
                           v_match_record.distancia, v_match_record.similitud,
                           v_match_record.nombre_oficial, p_sugerencia_id)
                )
                RETURNING id INTO v_nueva_sugerencia_id;

                -- Aplicar match directamente
                UPDATE propiedades_v2
                SET id_proyecto_master = v_proyecto_existente
                WHERE id = p_propiedad_id;

                RETURN QUERY SELECT
                    v_proyecto_existente,
                    FALSE,
                    TRUE,
                    v_nueva_sugerencia_id,
                    format('Proyecto existente "%s" (GPS %.1fm, nombre %.0f%%). Match aplicado. Sugerencia ID %s',
                           v_match_record.nombre_oficial, v_match_record.distancia,
                           v_match_record.similitud, v_nueva_sugerencia_id)::TEXT;
                RETURN;
            END IF;
        END LOOP;
    END IF;

    -- 3. No encontró match - crear proyecto nuevo
    -- Usar GPS alternativo si existe, sino heredar de propiedad
    IF v_lat_alt IS NOT NULL AND v_lng_alt IS NOT NULL THEN
        v_lat := v_lat_alt;
        v_lng := v_lng_alt;
    ELSE
        SELECT p.latitud, p.longitud
        INTO v_lat, v_lng
        FROM propiedades_v2 p
        WHERE p.id = p_propiedad_id;
    END IF;

    -- Obtener zona de la propiedad
    SELECT COALESCE(p.zona, 'Sin zona')
    INTO v_zona
    FROM propiedades_v2 p
    WHERE p.id = p_propiedad_id;

    -- Crear proyecto nuevo
    INSERT INTO proyectos_master (
        nombre_oficial,
        zona,
        latitud,
        longitud,
        fuente_verificacion,
        gps_verificado_google,
        activo
    )
    VALUES (
        v_nombre_normalizado,
        v_zona,
        v_lat,
        v_lng,
        'humano_propuesto',
        CASE WHEN v_lat_alt IS NOT NULL THEN TRUE ELSE FALSE END,
        TRUE
    )
    RETURNING id_proyecto_master INTO v_nuevo_proyecto_id;

    -- Crear sugerencia APROBADA de matching
    INSERT INTO matching_sugerencias (
        propiedad_id,
        proyecto_master_sugerido,
        metodo_matching,
        score_confianza,
        estado,
        revisado_por,
        fecha_revision,
        razon_match
    )
    VALUES (
        p_propiedad_id,
        v_nuevo_proyecto_id,
        'humano_alternativo',
        95,
        'aprobado',
        'humano_sheets',
        NOW(),
        format('Proyecto nuevo creado por humano. GPS %s. Sugerencia original: %s',
               CASE WHEN v_lat_alt IS NOT NULL THEN 'verificado' ELSE 'heredado' END,
               p_sugerencia_id)
    )
    RETURNING id INTO v_nueva_sugerencia_id;

    -- Aplicar match directamente
    UPDATE propiedades_v2
    SET id_proyecto_master = v_nuevo_proyecto_id
    WHERE id = p_propiedad_id;

    RETURN QUERY SELECT
        v_nuevo_proyecto_id,
        TRUE,
        FALSE,
        v_nueva_sugerencia_id,
        format('Proyecto "%s" creado (ID %s). GPS %s. Match aplicado. Sugerencia ID %s',
               v_nombre_normalizado, v_nuevo_proyecto_id,
               CASE WHEN v_lat_alt IS NOT NULL THEN 'verificado' ELSE 'heredado' END,
               v_nueva_sugerencia_id)::TEXT;
END;
$$;

COMMENT ON FUNCTION crear_proyecto_desde_sugerencia(TEXT, INTEGER, INTEGER, TEXT) IS
'Crea proyecto desde sugerencia humana con validación GPS + fuzzy.
Criterio de duplicado: GPS < 15m Y nombre >= 70% similar.
Si p_gps_alternativo está vacío, hereda GPS de la propiedad.
Formato GPS: "-17.756, -63.197" (como se copia de Google Maps).
APLICA MATCH DIRECTAMENTE - no requiere segunda aprobación.';


-- Verificar funciones creadas
SELECT proname, pg_get_function_arguments(oid) as args
FROM pg_proc
WHERE proname IN ('calcular_similitud', 'calcular_distancia_metros', 'crear_proyecto_desde_sugerencia')
ORDER BY proname;
