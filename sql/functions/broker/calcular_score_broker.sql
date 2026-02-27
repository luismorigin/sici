-- Funciones: calcular_score_broker + actualizar_score_broker
-- Última migración: 092
-- Exportado de producción: 27 Feb 2026
-- Dominio: Broker B2B / Score calidad 100pts

-- =============================================
-- calcular_score_broker: Retorna JSONB con desglose
-- Fotos: 30pts, Data: 40pts, Únicas: 20pts, GPS: 10pts
-- =============================================
CREATE OR REPLACE FUNCTION public.calcular_score_broker(p_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
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
    SELECT pb.* INTO v_prop FROM propiedades_broker pb WHERE pb.id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('error', 'Propiedad no encontrada', 'score_total', 0);
    END IF;

    v_cantidad_fotos := COALESCE(v_prop.cantidad_fotos, 0);

    -- FOTOS: 30 pts máximo
    IF v_cantidad_fotos >= 8 THEN v_score_fotos := 30;
    ELSIF v_cantidad_fotos >= 5 THEN v_score_fotos := 20;
    ELSIF v_cantidad_fotos >= 1 THEN v_score_fotos := 10;
    ELSE v_score_fotos := 0;
    END IF;

    -- DATA COMPLETA: 40 pts (10 campos x 4 pts)
    IF v_prop.precio_usd IS NOT NULL AND v_prop.precio_usd > 0 THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'precio_usd'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'precio_usd'); END IF;
    IF v_prop.area_m2 IS NOT NULL AND v_prop.area_m2 > 0 THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'area_m2'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'area_m2'); END IF;
    IF v_prop.dormitorios IS NOT NULL AND v_prop.dormitorios >= 0 THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'dormitorios'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'dormitorios'); END IF;
    IF v_prop.banos IS NOT NULL AND v_prop.banos >= 1 THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'banos'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'banos'); END IF;
    IF v_prop.zona IS NOT NULL AND v_prop.zona != '' THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'zona'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'zona'); END IF;
    IF v_prop.proyecto_nombre IS NOT NULL AND v_prop.proyecto_nombre != '' THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'proyecto_nombre'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'proyecto_nombre'); END IF;

    v_amenidades_count := COALESCE(jsonb_array_length(v_prop.amenidades->'lista'), 0);
    IF v_amenidades_count >= 3 THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'amenidades'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'amenidades (min 3)'); END IF;

    v_tiene_parqueo_definido := (v_prop.parqueo_incluido = TRUE OR COALESCE(v_prop.cantidad_parqueos, 0) > 0);
    IF v_tiene_parqueo_definido THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'parqueo'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'parqueo'); END IF;

    IF v_prop.expensas_usd IS NOT NULL THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'expensas_usd'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'expensas_usd'); END IF;

    v_tiene_estado_definido := (v_prop.estado_construccion IS NOT NULL AND v_prop.estado_construccion::TEXT != 'no_especificado');
    IF v_tiene_estado_definido THEN v_score_data := v_score_data + 4; v_campos_completos := array_append(v_campos_completos, 'estado_construccion'); ELSE v_campos_faltantes := array_append(v_campos_faltantes, 'estado_construccion'); END IF;

    -- FOTOS ÚNICAS: 20 pts
    IF v_prop.fotos_hash IS NOT NULL AND array_length(v_prop.fotos_hash, 1) > 0 THEN
        SELECT EXISTS (
            SELECT 1 FROM propiedades_broker pb2
            WHERE pb2.id != p_id AND pb2.fotos_hash IS NOT NULL AND pb2.fotos_hash && v_prop.fotos_hash
        ) INTO v_fotos_unicas;
        v_fotos_unicas := NOT v_fotos_unicas;
    ELSE
        v_fotos_unicas := (v_cantidad_fotos > 0);
    END IF;

    IF v_fotos_unicas AND v_cantidad_fotos > 0 THEN v_score_unicas := 20; ELSE v_score_unicas := 0; END IF;

    -- GPS: 10 pts
    v_tiene_gps := (v_prop.latitud IS NOT NULL AND v_prop.longitud IS NOT NULL AND v_prop.latitud != 0 AND v_prop.longitud != 0);
    IF v_tiene_gps THEN v_score_gps := 10; ELSE v_score_gps := 0; END IF;

    v_score_total := v_score_fotos + v_score_data + v_score_unicas + v_score_gps;

    RETURN jsonb_build_object(
        'score_total', v_score_total,
        'es_perfecta', (v_score_total >= 100),
        'desglose', jsonb_build_object(
            'fotos', jsonb_build_object('puntos', v_score_fotos, 'max', 30, 'cantidad', v_cantidad_fotos, 'meta', '8+ fotos = 30 pts'),
            'data_completa', jsonb_build_object('puntos', v_score_data, 'max', 40, 'campos_completos', v_campos_completos, 'campos_faltantes', v_campos_faltantes, 'meta', '10 campos × 4 pts'),
            'fotos_unicas', jsonb_build_object('puntos', v_score_unicas, 'max', 20, 'son_unicas', v_fotos_unicas, 'meta', 'Sin duplicados = 20 pts'),
            'gps', jsonb_build_object('puntos', v_score_gps, 'max', 10, 'tiene_gps', v_tiene_gps, 'latitud', v_prop.latitud, 'longitud', v_prop.longitud, 'meta', 'Ubicación GPS = 10 pts')
        ),
        'sugerencias', CASE
            WHEN v_score_total >= 100 THEN ARRAY['¡Calidad perfecta!']
            ELSE (
                SELECT array_agg(sugerencia) FROM (
                    SELECT CASE WHEN v_score_fotos < 30 THEN 'Sube ' || (8 - v_cantidad_fotos) || ' fotos más para +' || (30 - v_score_fotos) || ' pts' ELSE NULL END as sugerencia
                    UNION ALL SELECT CASE WHEN array_length(v_campos_faltantes, 1) > 0 THEN 'Completa: ' || array_to_string(v_campos_faltantes, ', ') || ' (+' || (40 - v_score_data) || ' pts)' ELSE NULL END
                    UNION ALL SELECT CASE WHEN v_score_unicas = 0 AND v_cantidad_fotos > 0 THEN 'Fotos duplicadas detectadas. Sube fotos originales (+20 pts)' WHEN v_score_unicas = 0 AND v_cantidad_fotos = 0 THEN 'Sube fotos para +20 pts adicionales' ELSE NULL END
                    UNION ALL SELECT CASE WHEN v_score_gps = 0 THEN 'Agrega ubicación GPS (+10 pts)' ELSE NULL END
                ) sugerencias WHERE sugerencia IS NOT NULL
            )
        END
    );
END;
$function$;

-- =============================================
-- actualizar_score_broker: Wrapper que actualiza la tabla
-- =============================================
CREATE OR REPLACE FUNCTION public.actualizar_score_broker(p_id integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$;
