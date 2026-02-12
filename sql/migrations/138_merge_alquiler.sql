-- =====================================================
-- Migración 138: NUEVA función merge_alquiler()
-- Propósito: Fusionar discovery + enrichment LLM para alquileres
-- Fecha: 11 Feb 2026
-- Prerequisito: 135, 136, 137
-- IMPORTANTE: NO modifica merge_discovery_enrichment() existente
-- =====================================================
-- DIFERENCIAS vs merge venta:
--   1. ENRICHMENT-FIRST: LLM gana sobre discovery (invierte prioridad)
--   2. SIN TC PARALELO: Alquileres son fijos en BOB
--   3. SIN SCORE FIDUCIARIO: No aplica a rentas
--   4. SIN PRECIO/M²: Métrica irrelevante para alquiler
--   5. Tabla: propiedades_v2 (misma que venta)
-- =====================================================

CREATE OR REPLACE FUNCTION merge_alquiler(
    p_id INTEGER DEFAULT NULL  -- Si NULL, procesa todas las pendientes de alquiler
)
RETURNS TABLE(
    id INTEGER,
    accion TEXT,
    mensaje TEXT
) AS $$
DECLARE
    v_rec RECORD;
    v_candados JSONB;
    v_enrichment JSONB;
    v_count INTEGER := 0;

    -- Valores finales resueltos
    v_precio_bob NUMERIC;
    v_precio_usd NUMERIC;
    v_area NUMERIC;
    v_dorms INTEGER;
    v_banos NUMERIC;
    v_estac INTEGER;
    v_nombre_edificio TEXT;

    -- Fuentes usadas (auditoría)
    v_fuentes JSONB;
BEGIN
    -- Iterar propiedades alquiler pendientes de merge
    FOR v_rec IN
        SELECT
            pv.id,
            pv.status,
            pv.campos_bloqueados,
            pv.datos_json_discovery,
            pv.datos_json_enrichment,
            -- Valores actuales en columnas
            pv.precio_mensual_bob AS col_precio_bob,
            pv.precio_mensual_usd AS col_precio_usd,
            pv.precio_usd AS col_precio_usd_legacy,
            pv.area_total_m2 AS col_area,
            pv.dormitorios AS col_dorms,
            pv.banos AS col_banos,
            pv.estacionamientos AS col_estac,
            pv.nombre_edificio AS col_nombre_edificio,
            pv.monto_expensas_bob AS col_expensas,
            pv.deposito_meses AS col_deposito,
            pv.amoblado AS col_amoblado,
            pv.acepta_mascotas AS col_mascotas,
            pv.contrato_minimo_meses AS col_contrato,
            pv.piso AS col_piso,
            pv.baulera AS col_baulera
        FROM propiedades_v2 pv
        WHERE
            pv.tipo_operacion = 'alquiler'
            AND (p_id IS NULL OR pv.id = p_id)
            AND pv.status IN ('nueva', 'actualizado')
        ORDER BY pv.fecha_discovery ASC
    LOOP
        v_count := v_count + 1;
        v_candados := COALESCE(v_rec.campos_bloqueados, '{}'::jsonb);
        v_enrichment := COALESCE(v_rec.datos_json_enrichment, '{}'::jsonb);
        v_fuentes := '{}'::jsonb;

        -- ===========================
        -- PRECIO MENSUAL BOB (enrichment-first)
        -- ===========================
        IF _is_campo_bloqueado(v_candados, 'precio_mensual_bob') THEN
            v_precio_bob := v_rec.col_precio_bob;
            v_fuentes := v_fuentes || '{"precio": "candado"}'::jsonb;
        ELSIF v_rec.col_precio_bob IS NOT NULL THEN
            -- Columna ya tiene valor (del enrichment o discovery)
            v_precio_bob := v_rec.col_precio_bob;
            v_fuentes := v_fuentes || '{"precio": "columna"}'::jsonb;
        ELSIF (v_enrichment->'llm_output'->>'precio_mensual_bob') IS NOT NULL THEN
            v_precio_bob := (v_enrichment->'llm_output'->>'precio_mensual_bob')::NUMERIC;
            v_fuentes := v_fuentes || '{"precio": "enrichment_json"}'::jsonb;
        ELSE
            v_precio_bob := NULL;
            v_fuentes := v_fuentes || '{"precio": "none"}'::jsonb;
        END IF;

        -- Calcular USD si tenemos BOB
        IF _is_campo_bloqueado(v_candados, 'precio_mensual_usd') THEN
            v_precio_usd := v_rec.col_precio_usd;
        ELSIF v_rec.col_precio_usd IS NOT NULL THEN
            v_precio_usd := v_rec.col_precio_usd;
        ELSIF v_precio_bob IS NOT NULL THEN
            v_precio_usd := ROUND(v_precio_bob / 6.96, 2);
        ELSE
            v_precio_usd := NULL;
        END IF;

        -- ===========================
        -- ÁREA (enrichment-first)
        -- ===========================
        IF _is_campo_bloqueado(v_candados, 'area_total_m2') THEN
            v_area := v_rec.col_area;
            v_fuentes := v_fuentes || '{"area": "candado"}'::jsonb;
        ELSIF v_rec.col_area IS NOT NULL AND v_rec.col_area > 0 THEN
            v_area := v_rec.col_area;
            v_fuentes := v_fuentes || '{"area": "columna"}'::jsonb;
        ELSE
            v_area := NULL;
            v_fuentes := v_fuentes || '{"area": "none"}'::jsonb;
        END IF;

        -- ===========================
        -- DORMITORIOS (enrichment-first)
        -- ===========================
        IF _is_campo_bloqueado(v_candados, 'dormitorios') THEN
            v_dorms := v_rec.col_dorms;
            v_fuentes := v_fuentes || '{"dormitorios": "candado"}'::jsonb;
        ELSIF v_rec.col_dorms IS NOT NULL THEN
            v_dorms := v_rec.col_dorms;
            v_fuentes := v_fuentes || '{"dormitorios": "columna"}'::jsonb;
        ELSE
            v_dorms := NULL;
            v_fuentes := v_fuentes || '{"dormitorios": "none"}'::jsonb;
        END IF;

        -- ===========================
        -- BAÑOS (enrichment-first)
        -- ===========================
        IF _is_campo_bloqueado(v_candados, 'banos') THEN
            v_banos := v_rec.col_banos;
        ELSIF v_rec.col_banos IS NOT NULL AND v_rec.col_banos < 100 THEN
            v_banos := v_rec.col_banos;
        ELSE
            v_banos := NULL;
        END IF;

        -- ===========================
        -- ESTACIONAMIENTOS
        -- ===========================
        IF _is_campo_bloqueado(v_candados, 'estacionamientos') THEN
            v_estac := v_rec.col_estac;
        ELSIF v_rec.col_estac IS NOT NULL THEN
            v_estac := v_rec.col_estac;
        ELSE
            v_estac := NULL;
        END IF;

        -- ===========================
        -- NOMBRE EDIFICIO (enrichment-first)
        -- ===========================
        IF _is_campo_bloqueado(v_candados, 'nombre_edificio') THEN
            v_nombre_edificio := v_rec.col_nombre_edificio;
        ELSIF v_rec.col_nombre_edificio IS NOT NULL THEN
            v_nombre_edificio := v_rec.col_nombre_edificio;
        ELSE
            v_nombre_edificio := NULL;
        END IF;

        -- ===========================
        -- UPDATE FINAL
        -- ===========================
        UPDATE propiedades_v2
        SET
            -- Campos resueltos (columnas directas)
            precio_mensual_bob = v_precio_bob,
            precio_mensual_usd = v_precio_usd,
            precio_usd = v_precio_usd,  -- compatibilidad con columna legacy
            area_total_m2 = v_area,
            dormitorios = v_dorms,
            banos = v_banos,
            estacionamientos = v_estac,
            nombre_edificio = v_nombre_edificio,

            -- Columnas directas desde enrichment LLM (si no bloqueadas)
            amoblado = CASE
                WHEN _is_campo_bloqueado(v_candados, 'amoblado') THEN v_rec.col_amoblado
                WHEN (v_enrichment->'llm_output'->>'amoblado') IS NOT NULL THEN v_enrichment->'llm_output'->>'amoblado'
                ELSE v_rec.col_amoblado
            END,
            acepta_mascotas = CASE
                WHEN _is_campo_bloqueado(v_candados, 'acepta_mascotas') THEN v_rec.col_mascotas
                WHEN (v_enrichment->'llm_output'->'acepta_mascotas') IS NOT NULL
                    AND (v_enrichment->'llm_output'->>'acepta_mascotas') != 'null'
                    THEN (v_enrichment->'llm_output'->>'acepta_mascotas')::BOOLEAN
                ELSE v_rec.col_mascotas
            END,
            deposito_meses = CASE
                WHEN _is_campo_bloqueado(v_candados, 'deposito_meses') THEN v_rec.col_deposito
                WHEN (v_enrichment->'llm_output'->>'deposito_meses') IS NOT NULL
                    AND (v_enrichment->'llm_output'->>'deposito_meses') != 'null'
                    THEN ROUND((v_enrichment->'llm_output'->>'deposito_meses')::NUMERIC)::INTEGER
                ELSE v_rec.col_deposito
            END,
            contrato_minimo_meses = CASE
                WHEN _is_campo_bloqueado(v_candados, 'contrato_minimo_meses') THEN v_rec.col_contrato
                WHEN (v_enrichment->'llm_output'->>'contrato_minimo_meses') IS NOT NULL
                    AND (v_enrichment->'llm_output'->>'contrato_minimo_meses') != 'null'
                    THEN ROUND((v_enrichment->'llm_output'->>'contrato_minimo_meses')::NUMERIC)::INTEGER
                ELSE v_rec.col_contrato
            END,
            monto_expensas_bob = CASE
                WHEN _is_campo_bloqueado(v_candados, 'monto_expensas_bob') THEN v_rec.col_expensas
                WHEN (v_enrichment->'llm_output'->>'expensas_bs') IS NOT NULL
                    AND (v_enrichment->'llm_output'->>'expensas_bs') != 'null'
                    THEN (v_enrichment->'llm_output'->>'expensas_bs')::NUMERIC
                ELSE v_rec.col_expensas
            END,
            piso = CASE
                WHEN _is_campo_bloqueado(v_candados, 'piso') THEN v_rec.col_piso
                WHEN (v_enrichment->'llm_output'->>'piso') IS NOT NULL
                    AND (v_enrichment->'llm_output'->>'piso') != 'null'
                    THEN ROUND((v_enrichment->'llm_output'->>'piso')::NUMERIC)::INTEGER
                ELSE v_rec.col_piso
            END,
            baulera = CASE
                WHEN _is_campo_bloqueado(v_candados, 'baulera') THEN v_rec.col_baulera
                WHEN (v_enrichment->'llm_output'->>'baulera') IS NOT NULL
                    AND (v_enrichment->'llm_output'->>'baulera') != 'null'
                    THEN (v_enrichment->'llm_output'->>'baulera')::BOOLEAN
                ELSE v_rec.col_baulera
            END,

            -- Campos LLM a datos_json (descripcion, amenities, equipamiento, servicios)
            datos_json = COALESCE(datos_json, '{}'::jsonb)
                || CASE WHEN (v_enrichment->'llm_output'->>'descripcion_limpia') IS NOT NULL
                    THEN jsonb_build_object('descripcion_limpia', v_enrichment->'llm_output'->>'descripcion_limpia')
                    ELSE '{}'::jsonb END
                || CASE WHEN (v_enrichment->'llm_output'->'amenities_confirmados') IS NOT NULL
                    THEN jsonb_build_object('amenities_confirmados', v_enrichment->'llm_output'->'amenities_confirmados')
                    ELSE '{}'::jsonb END
                || CASE WHEN (v_enrichment->'llm_output'->'equipamiento_detectado') IS NOT NULL
                    THEN jsonb_build_object('equipamiento_detectado', v_enrichment->'llm_output'->'equipamiento_detectado')
                    ELSE '{}'::jsonb END
                || CASE WHEN (v_enrichment->'llm_output'->'servicios_incluidos') IS NOT NULL
                    THEN jsonb_build_object('servicios_incluidos', v_enrichment->'llm_output'->'servicios_incluidos')
                    ELSE '{}'::jsonb END
                || jsonb_build_object(
                    'merge_alquiler', jsonb_build_object(
                        'fuentes', v_fuentes,
                        'timestamp', NOW(),
                        'version', '1.1.0'
                    )
                ),

            -- Merge audit trail
            cambios_merge = jsonb_build_object(
                'tipo', 'merge_alquiler',
                'fuentes', v_fuentes,
                'fecha', NOW()
            ),

            -- Status final: completado
            status = 'completado'::estado_propiedad,
            fecha_merge = NOW(),
            fecha_actualizacion = NOW(),

            -- Matching: solo si tiene datos mínimos
            es_para_matching = (
                v_precio_bob IS NOT NULL
                AND v_area IS NOT NULL
                AND v_dorms IS NOT NULL
            )

        WHERE propiedades_v2.id = v_rec.id;

        -- Retornar resultado para esta propiedad
        RETURN QUERY SELECT
            v_rec.id,
            'merged'::TEXT,
            format(
                'Merge alquiler OK: precio=%s BOB, area=%s m², dorms=%s',
                COALESCE(v_precio_bob::TEXT, 'NULL'),
                COALESCE(v_area::TEXT, 'NULL'),
                COALESCE(v_dorms::TEXT, 'NULL')
            )::TEXT;

    END LOOP;

    -- Si no hubo registros
    IF v_count = 0 THEN
        RETURN QUERY SELECT
            NULL::INTEGER,
            'no_pending'::TEXT,
            'No hay alquileres pendientes de merge'::TEXT;
    END IF;

END;
$$ LANGUAGE plpgsql;

-- Permisos
GRANT EXECUTE ON FUNCTION merge_alquiler TO authenticated;
GRANT EXECUTE ON FUNCTION merge_alquiler TO service_role;

COMMENT ON FUNCTION merge_alquiler IS 'Merge alquiler: enrichment-first, sin TC paralelo, sin score fiduciario. Independiente de merge_discovery_enrichment() de venta.';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
/*
-- Merge todas las pendientes
SELECT * FROM merge_alquiler();

-- Merge una específica
SELECT * FROM merge_alquiler(42);

-- Verificar estado post-merge
SELECT id, status, precio_mensual_bob, precio_mensual_usd,
       area_total_m2, dormitorios, banos, nombre_edificio,
       es_para_matching, fecha_merge
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND status = 'completado';
*/
