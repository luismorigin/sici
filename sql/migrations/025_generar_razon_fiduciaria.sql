-- =====================================================
-- MIGRACIÓN 025: Generar Razón Fiduciaria
-- Fecha: 9 Enero 2026
-- Propósito: EL MOAT - Razones contextuales con DATA real
-- =====================================================
-- EJECUTAR EN SUPABASE SQL EDITOR
-- =====================================================
--
-- OUTPUT EJEMPLOS:
-- "1 de solo 7 deptos 2D bajo $120k en Equipetrol Norte"
-- "Precio 15% bajo el promedio de la zona"
-- "El más económico de 12 unidades en Sky 1"
-- =====================================================

-- =====================================================
-- PASO 1: Función generar_razon_fiduciaria()
-- =====================================================

CREATE OR REPLACE FUNCTION generar_razon_fiduciaria(p_propiedad_id INTEGER)
RETURNS JSONB AS $func$
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
    -- ==========================================
    -- 1. OBTENER DATOS DE LA PROPIEDAD
    -- ==========================================
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

    -- ==========================================
    -- 2. OBTENER MÉTRICAS DE MERCADO
    -- ==========================================
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

    -- ==========================================
    -- 3. RAZÓN: ESCASEZ (stock bajo precio)
    -- ==========================================
    -- Contar cuántas propiedades hay del mismo tipo bajo este precio
    SELECT COUNT(*) INTO v_stock_bajo_precio
    FROM propiedades_v2
    WHERE es_activa = true
      AND tipo_operacion = 'venta'
      AND status = 'completado'
      AND es_multiproyecto = false
      AND dormitorios = v_prop.dormitorios
      AND COALESCE(microzona, zona) = v_prop.zona
      AND precio_usd <= v_prop.precio_usd;

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

    -- ==========================================
    -- 4. RAZÓN: PRECIO vs PROMEDIO ZONA
    -- ==========================================
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

    -- ==========================================
    -- 5. RAZÓN: $/m² vs PROMEDIO
    -- ==========================================
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

    -- ==========================================
    -- 6. RAZÓN: POSICIÓN EN PROYECTO
    -- ==========================================
    IF v_prop.id_proyecto_master IS NOT NULL THEN
        -- Total unidades en el proyecto
        SELECT COUNT(*) INTO v_total_proyecto
        FROM propiedades_v2
        WHERE id_proyecto_master = v_prop.id_proyecto_master
          AND es_activa = true
          AND es_multiproyecto = false;

        -- Posición por precio (1 = más barato)
        SELECT COUNT(*) + 1 INTO v_posicion_precio
        FROM propiedades_v2
        WHERE id_proyecto_master = v_prop.id_proyecto_master
          AND es_activa = true
          AND es_multiproyecto = false
          AND precio_usd < v_prop.precio_usd;

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

    -- ==========================================
    -- 7. RAZÓN: ÚNICO EN SU TIPO
    -- ==========================================
    SELECT COUNT(*) INTO v_stock_mismo_tipo
    FROM propiedades_v2
    WHERE es_activa = true
      AND tipo_operacion = 'venta'
      AND status = 'completado'
      AND es_multiproyecto = false
      AND dormitorios = v_prop.dormitorios
      AND COALESCE(microzona, zona) = v_prop.zona;

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

    -- ==========================================
    -- 8. RAZÓN: DESARROLLADOR RECONOCIDO
    -- ==========================================
    IF v_prop.desarrollador IS NOT NULL AND v_prop.desarrollador != '' THEN
        -- Top desarrolladores por cantidad de proyectos
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

    -- ==========================================
    -- 9. RETORNAR RESULTADO
    -- ==========================================
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
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION generar_razon_fiduciaria IS
'v1.0: EL MOAT - Genera razones fiduciarias con DATA contextual.
Tipos de razones:
- escasez: "1 de solo X bajo $Y"
- precio_bajo: "X% bajo promedio zona"
- precio_m2_bajo: "$/m² X% bajo promedio"
- mejor_precio_proyecto: "El más económico de X unidades"
- unico: "Único XD disponible en zona"
- desarrollador: "Desarrollador reconocido"';

-- =====================================================
-- PASO 2: Función helper para razón simple (texto)
-- =====================================================

CREATE OR REPLACE FUNCTION razon_fiduciaria_texto(p_propiedad_id INTEGER)
RETURNS TEXT AS $func$
DECLARE
    v_result JSONB;
BEGIN
    v_result := generar_razon_fiduciaria(p_propiedad_id);

    IF (v_result->>'success')::boolean THEN
        RETURN v_result->>'razon_principal';
    ELSE
        RETURN NULL;
    END IF;
END;
$func$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION razon_fiduciaria_texto IS
'Wrapper simple que retorna solo el texto de la razón principal';

-- =====================================================
-- TESTS
-- =====================================================

-- Test 1: Función completa con una propiedad
SELECT 'Test 1: Propiedad aleatoria' as test;
SELECT generar_razon_fiduciaria(
    (SELECT id FROM propiedades_v2
     WHERE es_activa = true
     AND es_multiproyecto = false
     AND tipo_operacion = 'venta'
     ORDER BY RANDOM() LIMIT 1)
);

-- Test 2: Texto simple
SELECT 'Test 2: Solo texto' as test;
SELECT
    id,
    nombre_edificio,
    dormitorios,
    precio_usd,
    razon_fiduciaria_texto(id) as razon
FROM propiedades_v2
WHERE es_activa = true
  AND es_multiproyecto = false
  AND tipo_operacion = 'venta'
ORDER BY precio_usd
LIMIT 5;

-- Test 3: Todas las propiedades con sus razones
SELECT 'Test 3: Resumen de razones' as test;
WITH razones AS (
    SELECT
        id,
        generar_razon_fiduciaria(id) as resultado
    FROM propiedades_v2
    WHERE es_activa = true
      AND es_multiproyecto = false
      AND tipo_operacion = 'venta'
    LIMIT 20
)
SELECT
    id,
    resultado->>'razon_principal' as razon_principal,
    (resultado->>'total_razones')::int as total_razones
FROM razones
ORDER BY total_razones DESC;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

SELECT 'Migración 025 - Componentes' as status;

SELECT
    'generar_razon_fiduciaria()' as componente,
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'generar_razon_fiduciaria')
         THEN 'OK' ELSE 'FALTA' END as estado
UNION ALL
SELECT 'razon_fiduciaria_texto()',
    CASE WHEN EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'razon_fiduciaria_texto')
         THEN 'OK' ELSE 'FALTA' END;
