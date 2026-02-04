-- ============================================================================
-- Migración 121: Fix generar_razon_fiduciaria() - Filtrar propiedades antiguas
-- ============================================================================
-- Problema: Los queries internos para calcular stock y posiciones incluyen
--           propiedades antiguas de 768+ días, generando razones incorrectas
-- Solución: Agregar filtro de días usando es_propiedad_vigente()
-- Dependencia: Migración 119 (crea función es_propiedad_vigente)
-- ============================================================================

CREATE OR REPLACE FUNCTION generar_razon_fiduciaria(p_propiedad_id integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_prop RECORD;
    v_metricas RECORD;
    v_proyecto RECORD;
    v_razones JSONB := '[]'::jsonb;
    v_razon TEXT;
    v_diff_pct NUMERIC;
    v_stock_mismo_tipo INTEGER;
    v_stock_bajo_precio INTEGER;
    v_posicion_precio INTEGER;
    v_total_proyecto INTEGER;
BEGIN
    SELECT
        p.id,
        p.dormitorios,
        p.precio_usd,
        p.area_total_m2,
        ROUND((p.precio_usd / NULLIF(p.area_total_m2, 0))::numeric, 0) as precio_m2,
        COALESCE(p.microzona, p.zona, 'Equipetrol') as zona,
        p.id_proyecto_master,
        pm.nombre_oficial as proyecto_nombre,
        pm.desarrollador
    INTO v_prop
    FROM propiedades_v2 p
    LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
    WHERE p.id = p_propiedad_id;

    IF v_prop.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Propiedad no encontrada'
        );
    END IF;

    SELECT
        stock,
        precio_promedio,
        precio_mediana,
        precio_min,
        precio_max,
        precio_m2 as precio_m2_promedio
    INTO v_metricas
    FROM v_metricas_mercado
    WHERE dormitorios = v_prop.dormitorios
      AND zona = v_prop.zona;

    -- ========================================================================
    -- Query 1: v_stock_bajo_precio - AHORA CON FILTRO DE ANTIGÜEDAD
    -- ========================================================================
    SELECT COUNT(*) INTO v_stock_bajo_precio
    FROM propiedades_v2 p
    WHERE p.es_activa = true
      AND p.tipo_operacion = 'venta'
      AND p.status = 'completado'
      AND p.es_multiproyecto = false
      AND p.dormitorios = v_prop.dormitorios
      AND COALESCE(p.microzona, p.zona) = v_prop.zona
      AND p.precio_usd <= v_prop.precio_usd
      -- NUEVO: Filtro de antigüedad
      AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

    IF v_stock_bajo_precio <= 10 THEN
        v_razon := format(
            '1 de solo %s deptos %sD bajo $%s en %s',
            v_stock_bajo_precio,
            v_prop.dormitorios,
            to_char(v_prop.precio_usd, 'FM999,999'),
            v_prop.zona
        );
        v_razones := v_razones || jsonb_build_object(
            'tipo', 'escasez',
            'texto', v_razon,
            'valor', v_stock_bajo_precio,
            'impacto', CASE
                WHEN v_stock_bajo_precio <= 3 THEN 'alto'
                WHEN v_stock_bajo_precio <= 7 THEN 'medio'
                ELSE 'bajo'
            END
        );
    END IF;

    IF v_metricas.precio_promedio IS NOT NULL AND v_metricas.precio_promedio > 0 THEN
        v_diff_pct := ROUND(
            ((v_prop.precio_usd - v_metricas.precio_promedio) / v_metricas.precio_promedio * 100)::numeric,
            0
        );

        IF v_diff_pct <= -10 THEN
            v_razon := format(
                '%s%% bajo el promedio de %s ($%s vs $%s)',
                ABS(v_diff_pct),
                v_prop.zona,
                to_char(v_prop.precio_usd, 'FM999,999'),
                to_char(v_metricas.precio_promedio, 'FM999,999')
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'precio_bajo',
                'texto', v_razon,
                'valor', v_diff_pct,
                'impacto', CASE
                    WHEN v_diff_pct <= -20 THEN 'alto'
                    WHEN v_diff_pct <= -15 THEN 'medio'
                    ELSE 'bajo'
                END
            );
        ELSIF v_diff_pct >= 10 THEN
            v_razon := format(
                '%s%% sobre el promedio de zona (premium)',
                v_diff_pct
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'precio_premium',
                'texto', v_razon,
                'valor', v_diff_pct,
                'impacto', 'info'
            );
        END IF;
    END IF;

    IF v_metricas.precio_m2_promedio IS NOT NULL
       AND v_metricas.precio_m2_promedio > 0
       AND v_prop.precio_m2 IS NOT NULL THEN

        v_diff_pct := ROUND(
            ((v_prop.precio_m2 - v_metricas.precio_m2_promedio) / v_metricas.precio_m2_promedio * 100)::numeric,
            0
        );

        IF v_diff_pct <= -10 THEN
            v_razon := format(
                '$/m² %s%% bajo promedio ($%s vs $%s/m²)',
                ABS(v_diff_pct),
                v_prop.precio_m2,
                v_metricas.precio_m2_promedio
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'precio_m2_bajo',
                'texto', v_razon,
                'valor', v_diff_pct,
                'impacto', CASE
                    WHEN v_diff_pct <= -15 THEN 'alto'
                    ELSE 'medio'
                END
            );
        END IF;
    END IF;

    IF v_prop.id_proyecto_master IS NOT NULL THEN
        -- ========================================================================
        -- Query 2: v_total_proyecto - AHORA CON FILTRO DE ANTIGÜEDAD
        -- ========================================================================
        SELECT COUNT(*) INTO v_total_proyecto
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master = v_prop.id_proyecto_master
          AND p.es_activa = true
          AND p.es_multiproyecto = false
          -- NUEVO: Filtro de antigüedad
          AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

        -- ========================================================================
        -- Query 3: v_posicion_precio - AHORA CON FILTRO DE ANTIGÜEDAD
        -- ========================================================================
        SELECT COUNT(*) + 1 INTO v_posicion_precio
        FROM propiedades_v2 p
        WHERE p.id_proyecto_master = v_prop.id_proyecto_master
          AND p.es_activa = true
          AND p.es_multiproyecto = false
          AND p.precio_usd < v_prop.precio_usd
          -- NUEVO: Filtro de antigüedad
          AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

        IF v_posicion_precio = 1 AND v_total_proyecto >= 3 THEN
            v_razon := format(
                'El más económico de %s unidades en %s',
                v_total_proyecto,
                v_prop.proyecto_nombre
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'mejor_precio_proyecto',
                'texto', v_razon,
                'valor', v_total_proyecto,
                'impacto', 'alto'
            );
        ELSIF v_posicion_precio <= 3 AND v_total_proyecto >= 5 THEN
            v_razon := format(
                'Top %s en precio de %s unidades en %s',
                v_posicion_precio,
                v_total_proyecto,
                v_prop.proyecto_nombre
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'top_precio_proyecto',
                'texto', v_razon,
                'valor', v_posicion_precio,
                'impacto', 'medio'
            );
        END IF;
    END IF;

    -- ========================================================================
    -- Query 4: v_stock_mismo_tipo - AHORA CON FILTRO DE ANTIGÜEDAD
    -- ========================================================================
    SELECT COUNT(*) INTO v_stock_mismo_tipo
    FROM propiedades_v2 p
    WHERE p.es_activa = true
      AND p.tipo_operacion = 'venta'
      AND p.status = 'completado'
      AND p.es_multiproyecto = false
      AND p.dormitorios = v_prop.dormitorios
      AND COALESCE(p.microzona, p.zona) = v_prop.zona
      -- NUEVO: Filtro de antigüedad
      AND es_propiedad_vigente(p.estado_construccion::text, p.fecha_publicacion, p.fecha_discovery);

    IF v_stock_mismo_tipo = 1 THEN
        v_razon := format(
            'Único %sD disponible en %s',
            v_prop.dormitorios,
            v_prop.zona
        );
        v_razones := v_razones || jsonb_build_object(
            'tipo', 'unico',
            'texto', v_razon,
            'valor', 1,
            'impacto', 'alto'
        );
    ELSIF v_stock_mismo_tipo <= 5 THEN
        v_razon := format(
            'Solo %s opciones %sD en %s',
            v_stock_mismo_tipo,
            v_prop.dormitorios,
            v_prop.zona
        );
        v_razones := v_razones || jsonb_build_object(
            'tipo', 'escasez_tipologia',
            'texto', v_razon,
            'valor', v_stock_mismo_tipo,
            'impacto', 'medio'
        );
    END IF;

    IF v_prop.desarrollador IS NOT NULL AND v_prop.desarrollador != '' THEN
        IF v_prop.desarrollador IN ('Sky Properties', 'Port-Delux S.R.L.', 'Smart Studio', 'Elite Desarrollos') THEN
            v_razon := format(
                'Desarrollador reconocido: %s',
                v_prop.desarrollador
            );
            v_razones := v_razones || jsonb_build_object(
                'tipo', 'desarrollador',
                'texto', v_razon,
                'valor', v_prop.desarrollador,
                'impacto', 'info'
            );
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'propiedad_id', p_propiedad_id,
        'contexto', jsonb_build_object(
            'dormitorios', v_prop.dormitorios,
            'zona', v_prop.zona,
            'precio_usd', v_prop.precio_usd,
            'precio_m2', v_prop.precio_m2,
            'proyecto', v_prop.proyecto_nombre
        ),
        'metricas_zona', CASE WHEN v_metricas.stock IS NOT NULL THEN
            jsonb_build_object(
                'stock', v_metricas.stock,
                'precio_promedio', v_metricas.precio_promedio,
                'precio_m2_promedio', v_metricas.precio_m2_promedio
            )
        ELSE NULL END,
        'razones', v_razones,
        'razon_principal', CASE
            WHEN jsonb_array_length(v_razones) > 0
            THEN v_razones->0->>'texto'
            ELSE 'Opción disponible en ' || v_prop.zona
        END,
        'total_razones', jsonb_array_length(v_razones)
    );
END;
$function$;

-- Verificación
DO $$
BEGIN
    RAISE NOTICE 'Migración 112 completada: generar_razon_fiduciaria() ahora filtra propiedades antiguas';
END $$;
