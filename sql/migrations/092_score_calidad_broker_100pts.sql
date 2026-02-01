-- ============================================
-- Migración 092: Sistema de Calidad 100 pts para Broker
-- Fecha: 2026-01-31
-- Propósito: Calcular score_calidad basado en múltiples criterios
-- ============================================

-- Sistema de puntuación:
-- - Fotos: 30 pts (8+ = 30, 5-7 = 20, <5 = 10)
-- - Data Completa: 40 pts (10 campos × 4 pts)
-- - Fotos Únicas: 20 pts (sin duplicados por hash)
-- - GPS: 10 pts (tiene lat/lng)

-- ============================================
-- 1. Función principal de cálculo
-- ============================================

CREATE OR REPLACE FUNCTION calcular_score_broker(p_id INTEGER)
RETURNS JSONB AS $$
DECLARE
    v_prop RECORD;
    v_score_fotos INTEGER := 0;
    v_score_data INTEGER := 0;
    v_score_unicas INTEGER := 0;
    v_score_gps INTEGER := 0;
    v_score_total INTEGER := 0;
    v_campos_completos TEXT[] := ARRAY[]::TEXT[];
    v_campos_faltantes TEXT[] := ARRAY[]::TEXT[];
    v_cantidad_fotos INTEGER := 0;
    v_fotos_unicas BOOLEAN := TRUE;
    v_tiene_gps BOOLEAN := FALSE;
    v_amenidades_count INTEGER := 0;
    v_tiene_parqueo_definido BOOLEAN := FALSE;
    v_tiene_estado_definido BOOLEAN := FALSE;
BEGIN
    -- Obtener datos de la propiedad
    SELECT pb.*
    INTO v_prop
    FROM propiedades_broker pb
    WHERE pb.id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'error', 'Propiedad no encontrada',
            'score_total', 0
        );
    END IF;

    -- Usar cantidad_fotos de la tabla directamente
    v_cantidad_fotos := COALESCE(v_prop.cantidad_fotos, 0);

    -- ========================================
    -- FOTOS: 30 pts máximo
    -- ========================================
    IF v_cantidad_fotos >= 8 THEN
        v_score_fotos := 30;
    ELSIF v_cantidad_fotos >= 5 THEN
        v_score_fotos := 20;
    ELSIF v_cantidad_fotos >= 1 THEN
        v_score_fotos := 10;
    ELSE
        v_score_fotos := 0;
    END IF;

    -- ========================================
    -- DATA COMPLETA: 40 pts (10 campos × 4 pts)
    -- ========================================

    -- 1. precio_usd (siempre tiene, es NOT NULL)
    IF v_prop.precio_usd IS NOT NULL AND v_prop.precio_usd > 0 THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'precio_usd');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'precio_usd');
    END IF;

    -- 2. area_m2 (siempre tiene, es NOT NULL)
    IF v_prop.area_m2 IS NOT NULL AND v_prop.area_m2 > 0 THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'area_m2');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'area_m2');
    END IF;

    -- 3. dormitorios (siempre tiene, es NOT NULL)
    IF v_prop.dormitorios IS NOT NULL AND v_prop.dormitorios >= 0 THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'dormitorios');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'dormitorios');
    END IF;

    -- 4. banos (siempre tiene, es NOT NULL)
    IF v_prop.banos IS NOT NULL AND v_prop.banos >= 1 THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'banos');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'banos');
    END IF;

    -- 5. zona (siempre tiene, es NOT NULL)
    IF v_prop.zona IS NOT NULL AND v_prop.zona != '' THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'zona');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'zona');
    END IF;

    -- 6. proyecto_nombre (siempre tiene, es NOT NULL)
    IF v_prop.proyecto_nombre IS NOT NULL AND v_prop.proyecto_nombre != '' THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'proyecto_nombre');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'proyecto_nombre');
    END IF;

    -- 7. amenidades (mínimo 3)
    v_amenidades_count := COALESCE(
        jsonb_array_length(v_prop.amenidades->'lista'),
        0
    );
    IF v_amenidades_count >= 3 THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'amenidades');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'amenidades (min 3)');
    END IF;

    -- 8. parqueo definido (incluido O cantidad > 0)
    v_tiene_parqueo_definido := (
        v_prop.parqueo_incluido = TRUE OR
        COALESCE(v_prop.cantidad_parqueos, 0) > 0
    );
    IF v_tiene_parqueo_definido THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'parqueo');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'parqueo');
    END IF;

    -- 9. expensas_usd
    IF v_prop.expensas_usd IS NOT NULL THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'expensas_usd');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'expensas_usd');
    END IF;

    -- 10. estado_construccion (distinto de 'no_especificado')
    v_tiene_estado_definido := (
        v_prop.estado_construccion IS NOT NULL AND
        v_prop.estado_construccion::TEXT != 'no_especificado'
    );
    IF v_tiene_estado_definido THEN
        v_score_data := v_score_data + 4;
        v_campos_completos := array_append(v_campos_completos, 'estado_construccion');
    ELSE
        v_campos_faltantes := array_append(v_campos_faltantes, 'estado_construccion');
    END IF;

    -- ========================================
    -- FOTOS ÚNICAS: 20 pts
    -- ========================================
    -- Verificar si hay hashes duplicados con otras propiedades
    IF v_prop.fotos_hash IS NOT NULL AND array_length(v_prop.fotos_hash, 1) > 0 THEN
        -- Buscar si algún hash existe en otra propiedad
        SELECT EXISTS (
            SELECT 1
            FROM propiedades_broker pb2
            WHERE pb2.id != p_id
            AND pb2.fotos_hash IS NOT NULL
            AND pb2.fotos_hash && v_prop.fotos_hash  -- Overlap de arrays
        ) INTO v_fotos_unicas;

        -- Si encontró overlap, NO son únicas
        v_fotos_unicas := NOT v_fotos_unicas;
    ELSE
        -- Sin hash, asumimos únicas si tiene fotos
        v_fotos_unicas := (v_cantidad_fotos > 0);
    END IF;

    IF v_fotos_unicas AND v_cantidad_fotos > 0 THEN
        v_score_unicas := 20;
    ELSE
        v_score_unicas := 0;
    END IF;

    -- ========================================
    -- GPS: 10 pts
    -- ========================================
    v_tiene_gps := (
        v_prop.latitud IS NOT NULL AND
        v_prop.longitud IS NOT NULL AND
        v_prop.latitud != 0 AND
        v_prop.longitud != 0
    );
    IF v_tiene_gps THEN
        v_score_gps := 10;
    ELSE
        v_score_gps := 0;
    END IF;

    -- ========================================
    -- TOTAL
    -- ========================================
    v_score_total := v_score_fotos + v_score_data + v_score_unicas + v_score_gps;

    -- Retornar desglose completo
    RETURN jsonb_build_object(
        'score_total', v_score_total,
        'es_perfecta', (v_score_total >= 100),
        'desglose', jsonb_build_object(
            'fotos', jsonb_build_object(
                'puntos', v_score_fotos,
                'max', 30,
                'cantidad', v_cantidad_fotos,
                'meta', '8+ fotos = 30 pts'
            ),
            'data_completa', jsonb_build_object(
                'puntos', v_score_data,
                'max', 40,
                'campos_completos', v_campos_completos,
                'campos_faltantes', v_campos_faltantes,
                'meta', '10 campos × 4 pts'
            ),
            'fotos_unicas', jsonb_build_object(
                'puntos', v_score_unicas,
                'max', 20,
                'son_unicas', v_fotos_unicas,
                'meta', 'Sin duplicados = 20 pts'
            ),
            'gps', jsonb_build_object(
                'puntos', v_score_gps,
                'max', 10,
                'tiene_gps', v_tiene_gps,
                'latitud', v_prop.latitud,
                'longitud', v_prop.longitud,
                'meta', 'Ubicación GPS = 10 pts'
            )
        ),
        'sugerencias', CASE
            WHEN v_score_total >= 100 THEN ARRAY['¡Calidad perfecta!']
            ELSE (
                SELECT array_agg(sugerencia) FROM (
                    SELECT
                        CASE
                            WHEN v_score_fotos < 30 THEN
                                'Sube ' || (8 - v_cantidad_fotos) || ' fotos más para +' || (30 - v_score_fotos) || ' pts'
                            ELSE NULL
                        END as sugerencia
                    UNION ALL
                    SELECT
                        CASE
                            WHEN array_length(v_campos_faltantes, 1) > 0 THEN
                                'Completa: ' || array_to_string(v_campos_faltantes, ', ') || ' (+' || (40 - v_score_data) || ' pts)'
                            ELSE NULL
                        END
                    UNION ALL
                    SELECT
                        CASE
                            WHEN v_score_unicas = 0 AND v_cantidad_fotos > 0 THEN
                                'Fotos duplicadas detectadas. Sube fotos originales (+20 pts)'
                            WHEN v_score_unicas = 0 AND v_cantidad_fotos = 0 THEN
                                'Sube fotos para +20 pts adicionales'
                            ELSE NULL
                        END
                    UNION ALL
                    SELECT
                        CASE
                            WHEN v_score_gps = 0 THEN
                                'Agrega ubicación GPS (+10 pts)'
                            ELSE NULL
                        END
                ) sugerencias WHERE sugerencia IS NOT NULL
            )
        END
    );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calcular_score_broker(INTEGER) IS
'Calcula score de calidad (0-100) para propiedad broker con desglose detallado';

-- ============================================
-- 2. Función para actualizar score en la tabla
-- ============================================

CREATE OR REPLACE FUNCTION actualizar_score_broker(p_id INTEGER)
RETURNS VOID AS $$
DECLARE
    v_resultado JSONB;
BEGIN
    v_resultado := calcular_score_broker(p_id);

    UPDATE propiedades_broker
    SET
        score_calidad = (v_resultado->>'score_total')::INTEGER,
        score_desglose = v_resultado->'desglose',
        es_calidad_perfecta = (v_resultado->>'es_perfecta')::BOOLEAN,
        updated_at = NOW()
    WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. Trigger para auto-calcular en INSERT/UPDATE
-- ============================================

CREATE OR REPLACE FUNCTION trigger_calcular_score_broker()
RETURNS TRIGGER AS $$
BEGIN
    -- Solo recalcular si cambiaron campos relevantes
    IF TG_OP = 'INSERT' OR
       OLD.cantidad_fotos IS DISTINCT FROM NEW.cantidad_fotos OR
       OLD.fotos_hash IS DISTINCT FROM NEW.fotos_hash OR
       OLD.latitud IS DISTINCT FROM NEW.latitud OR
       OLD.longitud IS DISTINCT FROM NEW.longitud OR
       OLD.amenidades IS DISTINCT FROM NEW.amenidades OR
       OLD.parqueo_incluido IS DISTINCT FROM NEW.parqueo_incluido OR
       OLD.cantidad_parqueos IS DISTINCT FROM NEW.cantidad_parqueos OR
       OLD.expensas_usd IS DISTINCT FROM NEW.expensas_usd OR
       OLD.estado_construccion IS DISTINCT FROM NEW.estado_construccion
    THEN
        -- Calcular nuevo score
        DECLARE
            v_resultado JSONB;
        BEGIN
            v_resultado := calcular_score_broker(NEW.id);
            NEW.score_calidad := (v_resultado->>'score_total')::INTEGER;
            NEW.score_desglose := v_resultado->'desglose';
            NEW.es_calidad_perfecta := (v_resultado->>'es_perfecta')::BOOLEAN;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Eliminar trigger si existe
DROP TRIGGER IF EXISTS trg_calcular_score_broker ON propiedades_broker;

-- Crear trigger
CREATE TRIGGER trg_calcular_score_broker
    BEFORE INSERT OR UPDATE ON propiedades_broker
    FOR EACH ROW
    EXECUTE FUNCTION trigger_calcular_score_broker();

-- ============================================
-- 4. Recalcular scores de propiedades existentes
-- ============================================

DO $$
DECLARE
    v_prop RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_prop IN SELECT id FROM propiedades_broker LOOP
        PERFORM actualizar_score_broker(v_prop.id);
        v_count := v_count + 1;
    END LOOP;
    RAISE NOTICE 'Scores recalculados para % propiedades', v_count;
END $$;

-- ============================================
-- 5. Vista para monitoreo de calidad
-- ============================================

CREATE OR REPLACE VIEW v_broker_calidad_stats AS
SELECT
    CASE
        WHEN score_calidad >= 100 THEN 'Perfecta (100)'
        WHEN score_calidad >= 80 THEN 'Alta (80-99)'
        WHEN score_calidad >= 60 THEN 'Media (60-79)'
        WHEN score_calidad >= 40 THEN 'Baja (40-59)'
        ELSE 'Muy Baja (<40)'
    END as rango_calidad,
    COUNT(*) as cantidad,
    ROUND(AVG(score_calidad), 1) as score_promedio,
    ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 1) as porcentaje
FROM propiedades_broker
WHERE estado = 'publicada'
GROUP BY 1
ORDER BY
    CASE
        WHEN score_calidad >= 100 THEN 1
        WHEN score_calidad >= 80 THEN 2
        WHEN score_calidad >= 60 THEN 3
        WHEN score_calidad >= 40 THEN 4
        ELSE 5
    END;

-- ============================================
-- FIN MIGRACIÓN 092
-- ============================================
