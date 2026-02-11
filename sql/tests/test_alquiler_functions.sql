-- ============================================================================
-- TEST: Funciones de Alquiler (Discovery, Enrichment, Merge)
-- ============================================================================
-- Archivo: sql/tests/test_alquiler_functions.sql
-- Fecha: 11 Feb 2026
--
-- PROPOSITO:
-- Validar las 3 funciones del pipeline de alquileres:
--   1. registrar_discovery_alquiler() - INSERT/UPDATE
--   2. registrar_enrichment_alquiler() - Enriquecimiento LLM
--   3. merge_alquiler() - Fusionar discovery + enrichment
--
-- PREREQUISITOS:
-- - Migraciones 135-138 ejecutadas
-- - Funcion _is_campo_bloqueado() disponible
--
-- COMO EJECUTAR:
-- 1. Copiar todo en Supabase SQL Editor
-- 2. Ejecutar (F5)
-- 3. Revisar RAISE NOTICE en pestana Messages
-- 4. Cleanup automatico al final
-- ============================================================================

DO $$
DECLARE
    v_id_t01 INTEGER;
    v_id_t02 INTEGER;
    v_id_t04 INTEGER;
    v_id_t05 INTEGER;
    v_id_t08_venta INTEGER;
    v_id_t10 INTEGER;
    v_id_t11 INTEGER;
    v_id_t12a INTEGER;
    v_id_t12b INTEGER;
    v_id_t13 INTEGER;

    v_result RECORD;
    v_jsonb_result JSONB;
    v_prop RECORD;
    v_count INTEGER;
    v_passed INTEGER := 0;
    v_failed INTEGER := 0;
    v_total INTEGER := 13;
BEGIN

    RAISE NOTICE '============================================================';
    RAISE NOTICE 'INICIANDO TESTS: Funciones de Alquiler SICI';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';

    -- ========================================================================
    -- T1: Discovery INSERT nueva propiedad alquiler
    -- ========================================================================
    RAISE NOTICE '--- T1: Discovery INSERT nueva propiedad ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T01',
        p_fuente := 'century21',
        p_codigo_propiedad := 'TEST-AQ-T01',
        p_precio_mensual_bob := 4500.00,
        p_precio_mensual_usd := NULL,
        p_moneda_original := 'BOB',
        p_area_total_m2 := 85,
        p_dormitorios := 2,
        p_banos := 2,
        p_estacionamientos := 1,
        p_tipo_propiedad_original := 'departamento',
        p_latitud := -17.7633,
        p_longitud := -63.1960,
        p_zona := 'Equipetrol',
        p_datos_json_discovery := '{"titulo": "Depto 2 dorms Equipetrol", "test": true}'::jsonb
    );

    v_id_t01 := v_result.id;

    IF v_result.accion = 'inserted' AND v_id_t01 IS NOT NULL THEN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE id = v_id_t01;

        IF v_prop.tipo_operacion::TEXT = 'alquiler'
           AND v_prop.status::TEXT = 'nueva'
           AND v_prop.precio_mensual_bob = 4500.00
           AND v_prop.precio_usd = ROUND(4500.00 / 6.96, 2)
           AND v_prop.dormitorios = 2
           AND v_prop.es_activa = TRUE
        THEN
            RAISE NOTICE 'T1 PASS: INSERT correcto (id=%, tipo=%, status=%, precio_bob=%, precio_usd=%)',
                v_id_t01, v_prop.tipo_operacion, v_prop.status, v_prop.precio_mensual_bob, v_prop.precio_usd;
            v_passed := v_passed + 1;
        ELSE
            RAISE NOTICE 'T1 FAIL: Columnas incorrectas (tipo=%, status=%, precio_bob=%, precio_usd=%)',
                v_prop.tipo_operacion, v_prop.status, v_prop.precio_mensual_bob, v_prop.precio_usd;
            v_failed := v_failed + 1;
        END IF;
    ELSE
        RAISE NOTICE 'T1 FAIL: accion=% (esperado inserted), id=%', v_result.accion, v_result.id;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T2: Discovery UPDATE misma URL
    -- ========================================================================
    RAISE NOTICE '--- T2: Discovery UPDATE misma URL ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T01',
        p_fuente := 'century21',
        p_precio_mensual_bob := 5000.00,
        p_area_total_m2 := 85,
        p_dormitorios := 2,
        p_banos := 2,
        p_zona := 'Equipetrol'
    );

    v_id_t02 := v_result.id;

    IF v_result.accion = 'updated' AND v_id_t02 = v_id_t01 THEN
        SELECT precio_mensual_bob INTO v_prop FROM propiedades_v2 WHERE id = v_id_t02;

        IF v_prop.precio_mensual_bob = 5000.00 THEN
            RAISE NOTICE 'T2 PASS: UPDATE correcto (id=%, precio actualizado a %)', v_id_t02, v_prop.precio_mensual_bob;
            v_passed := v_passed + 1;
        ELSE
            RAISE NOTICE 'T2 FAIL: precio_mensual_bob=% (esperado 5000)', v_prop.precio_mensual_bob;
            v_failed := v_failed + 1;
        END IF;
    ELSE
        RAISE NOTICE 'T2 FAIL: accion=% (esperado updated), id=% (esperado %)', v_result.accion, v_result.id, v_id_t01;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T3: Discovery parametros faltantes (url=NULL)
    -- ========================================================================
    RAISE NOTICE '--- T3: Discovery parametros faltantes ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := NULL,
        p_fuente := 'century21',
        p_precio_mensual_bob := 3000
    );

    IF v_result.accion = 'error' AND v_result.id IS NULL THEN
        RAISE NOTICE 'T3 PASS: Error correcto (accion=%, mensaje=%)', v_result.accion, v_result.mensaje;
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T3 FAIL: accion=% (esperado error)', v_result.accion;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T4: Discovery con candado activo en precio
    -- ========================================================================
    RAISE NOTICE '--- T4: Discovery con candado activo ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T04',
        p_fuente := 'remax',
        p_precio_mensual_bob := 3500.00,
        p_dormitorios := 1,
        p_zona := 'Equipetrol'
    );
    v_id_t04 := v_result.id;

    UPDATE propiedades_v2
    SET campos_bloqueados = '{"precio_mensual_bob": {"bloqueado": true, "por": "admin", "fecha": "2026-02-11"}}'::jsonb
    WHERE id = v_id_t04;

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T04',
        p_fuente := 'remax',
        p_precio_mensual_bob := 9999.00,
        p_dormitorios := 1,
        p_zona := 'Equipetrol'
    );

    SELECT precio_mensual_bob INTO v_prop FROM propiedades_v2 WHERE id = v_id_t04;

    IF v_prop.precio_mensual_bob = 3500.00 THEN
        RAISE NOTICE 'T4 PASS: Candado respetado (precio=% no fue sobrescrito a 9999)', v_prop.precio_mensual_bob;
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T4 FAIL: Candado NO respetado (precio=%, esperado 3500)', v_prop.precio_mensual_bob;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T5: Enrichment exitoso
    -- ========================================================================
    RAISE NOTICE '--- T5: Enrichment exitoso ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T05',
        p_fuente := 'century21',
        p_precio_mensual_bob := 6000.00,
        p_dormitorios := 3,
        p_banos := 2,
        p_zona := 'Equipetrol'
    );
    v_id_t05 := v_result.id;

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := v_id_t05,
        p_datos_llm := '{
            "precio_mensual_bob": 6200,
            "expensas_bs": 450,
            "deposito_meses": 2,
            "contrato_minimo_meses": 12,
            "amoblado": "semi",
            "acepta_mascotas": true,
            "servicios_incluidos": ["agua", "gas"],
            "area_total_m2": 120,
            "dormitorios": 3,
            "banos": 2,
            "estacionamientos": 1,
            "piso": 5,
            "nombre_edificio": "Test Tower Alquiler"
        }'::jsonb,
        p_modelo_usado := 'claude-haiku-4.0',
        p_tokens_usados := 2500
    );

    IF (v_jsonb_result->>'success')::BOOLEAN = TRUE THEN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE id = v_id_t05;

        IF v_prop.status::TEXT = 'actualizado'
           AND v_prop.precio_mensual_bob = 6200
           AND v_prop.monto_expensas_bob = 450
           AND v_prop.deposito_meses = 2
           AND v_prop.contrato_minimo_meses = 12
           AND v_prop.amoblado = 'semi'
           AND v_prop.acepta_mascotas = TRUE
           AND v_prop.piso = 5
           AND v_prop.nombre_edificio = 'Test Tower Alquiler'
           AND v_prop.datos_json_enrichment IS NOT NULL
        THEN
            RAISE NOTICE 'T5 PASS: Enrichment completo (status=%, precio=%, expensas=%, deposito=%, amoblado=%, mascotas=%, edificio=%)',
                v_prop.status, v_prop.precio_mensual_bob, v_prop.monto_expensas_bob,
                v_prop.deposito_meses, v_prop.amoblado, v_prop.acepta_mascotas, v_prop.nombre_edificio;
            v_passed := v_passed + 1;
        ELSE
            RAISE NOTICE 'T5 FAIL: Columnas parciales (status=%, precio=%, expensas=%, deposito=%, amoblado=%)',
                v_prop.status, v_prop.precio_mensual_bob, v_prop.monto_expensas_bob,
                v_prop.deposito_meses, v_prop.amoblado;
            v_failed := v_failed + 1;
        END IF;
    ELSE
        RAISE NOTICE 'T5 FAIL: success=false, error=%', v_jsonb_result->>'error';
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T6: Enrichment con requiere_revision
    -- ========================================================================
    RAISE NOTICE '--- T6: Enrichment con revision ---';

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := v_id_t01,
        p_datos_llm := '{"dormitorios": 2, "banos": 2}'::jsonb,
        p_requiere_revision := TRUE,
        p_errores_validacion := ARRAY['precio_sospechoso', 'area_no_coincide']
    );

    IF (v_jsonb_result->>'success')::BOOLEAN = TRUE THEN
        SELECT flags_semanticos INTO v_prop FROM propiedades_v2 WHERE id = v_id_t01;

        IF v_prop.flags_semanticos IS NOT NULL
           AND v_prop.flags_semanticos::TEXT LIKE '%requiere_revision_alquiler%'
        THEN
            RAISE NOTICE 'T6 PASS: Flag de revision presente';
            v_passed := v_passed + 1;
        ELSE
            RAISE NOTICE 'T6 FAIL: Flag de revision ausente (flags=%)', v_prop.flags_semanticos;
            v_failed := v_failed + 1;
        END IF;
    ELSE
        RAISE NOTICE 'T6 FAIL: success=false, error=%', v_jsonb_result->>'error';
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T7: Enrichment propiedad inexistente
    -- ========================================================================
    RAISE NOTICE '--- T7: Enrichment propiedad inexistente ---';

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := 999999,
        p_datos_llm := '{"dormitorios": 1}'::jsonb
    );

    IF (v_jsonb_result->>'success')::BOOLEAN = FALSE
       AND v_jsonb_result->>'error' LIKE '%no encontrada%'
    THEN
        RAISE NOTICE 'T7 PASS: Rechazado correctamente (error=%)', v_jsonb_result->>'error';
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T7 FAIL: Debio fallar (success=%, error=%)', v_jsonb_result->>'success', v_jsonb_result->>'error';
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T8: Enrichment a propiedad de VENTA (debe rechazar)
    -- ========================================================================
    RAISE NOTICE '--- T8: Enrichment a propiedad de venta ---';

    INSERT INTO propiedades_v2 (
        url, fuente, tipo_operacion, status, precio_usd,
        dormitorios, zona, fecha_creacion, fecha_actualizacion, es_activa
    ) VALUES (
        'https://test.sici/alquiler/T08_venta', 'test', 'venta'::tipo_operacion_enum,
        'nueva'::estado_propiedad, 150000, 3, 'Equipetrol', NOW(), NOW(), TRUE
    )
    RETURNING id INTO v_id_t08_venta;

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := v_id_t08_venta,
        p_datos_llm := '{"dormitorios": 3}'::jsonb
    );

    IF (v_jsonb_result->>'success')::BOOLEAN = FALSE
       AND v_jsonb_result->>'error' LIKE '%no es alquiler%'
    THEN
        RAISE NOTICE 'T8 PASS: Rechazado correctamente (error=%)', v_jsonb_result->>'error';
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T8 FAIL: Debio rechazar venta (success=%, error=%)', v_jsonb_result->>'success', v_jsonb_result->>'error';
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T9: Enrichment con candado en precio
    -- ========================================================================
    RAISE NOTICE '--- T9: Enrichment con candado en precio ---';

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := v_id_t04,
        p_datos_llm := '{"precio_mensual_bob": 8888, "dormitorios": 1}'::jsonb
    );

    IF (v_jsonb_result->>'success')::BOOLEAN = TRUE THEN
        SELECT precio_mensual_bob, dormitorios INTO v_prop FROM propiedades_v2 WHERE id = v_id_t04;

        IF v_prop.precio_mensual_bob = 3500.00 AND v_prop.dormitorios = 1 THEN
            RAISE NOTICE 'T9 PASS: Candado respetado (precio=% no cambio, dorms=% si cambio)',
                v_prop.precio_mensual_bob, v_prop.dormitorios;
            v_passed := v_passed + 1;
        ELSE
            RAISE NOTICE 'T9 FAIL: Candado no respetado (precio=%, esperado 3500)', v_prop.precio_mensual_bob;
            v_failed := v_failed + 1;
        END IF;
    ELSE
        RAISE NOTICE 'T9 FAIL: success=false, error=%', v_jsonb_result->>'error';
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T10: Merge individual
    -- ========================================================================
    RAISE NOTICE '--- T10: Merge individual ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T10',
        p_fuente := 'remax',
        p_precio_mensual_bob := 7000.00,
        p_area_total_m2 := 110,
        p_dormitorios := 3,
        p_banos := 2,
        p_zona := 'Equipetrol'
    );
    v_id_t10 := v_result.id;

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := v_id_t10,
        p_datos_llm := '{
            "precio_mensual_bob": 7200,
            "area_total_m2": 112,
            "dormitorios": 3,
            "banos": 2,
            "estacionamientos": 1,
            "nombre_edificio": "Merge Test Tower"
        }'::jsonb
    );

    SELECT * INTO v_result FROM merge_alquiler(v_id_t10);

    IF v_result.accion = 'merged' THEN
        SELECT * INTO v_prop FROM propiedades_v2 WHERE id = v_id_t10;

        IF v_prop.status::TEXT = 'completado'
           AND v_prop.es_para_matching = TRUE
           AND v_prop.cambios_merge IS NOT NULL
           AND v_prop.cambios_merge->>'tipo' = 'merge_alquiler'
           AND v_prop.fecha_merge IS NOT NULL
        THEN
            RAISE NOTICE 'T10 PASS: Merge OK (status=%, matching=%, merge_tipo=%, fecha_merge=%)',
                v_prop.status, v_prop.es_para_matching, v_prop.cambios_merge->>'tipo', v_prop.fecha_merge;
            v_passed := v_passed + 1;
        ELSE
            RAISE NOTICE 'T10 FAIL: Merge parcial (status=%, matching=%, cambios_merge=%)',
                v_prop.status, v_prop.es_para_matching, v_prop.cambios_merge;
            v_failed := v_failed + 1;
        END IF;
    ELSE
        RAISE NOTICE 'T10 FAIL: accion=% (esperado merged)', v_result.accion;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T11: Merge sin datos minimos
    -- ========================================================================
    RAISE NOTICE '--- T11: Merge sin datos minimos ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T11',
        p_fuente := 'century21',
        p_dormitorios := 2,
        p_zona := 'Equipetrol'
    );
    v_id_t11 := v_result.id;

    SELECT * INTO v_result FROM merge_alquiler(v_id_t11);

    SELECT es_para_matching, status INTO v_prop FROM propiedades_v2 WHERE id = v_id_t11;

    IF v_prop.es_para_matching = FALSE AND v_prop.status::TEXT = 'completado' THEN
        RAISE NOTICE 'T11 PASS: Sin datos minimos (es_para_matching=false, status=%)', v_prop.status;
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T11 FAIL: es_para_matching=% (esperado false), status=%', v_prop.es_para_matching, v_prop.status;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T12: Merge batch (NULL) solo alquileres pendientes
    -- ========================================================================
    RAISE NOTICE '--- T12: Merge batch (NULL) ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T12a',
        p_fuente := 'remax',
        p_precio_mensual_bob := 3000,
        p_area_total_m2 := 60,
        p_dormitorios := 1,
        p_zona := 'Equipetrol'
    );
    v_id_t12a := v_result.id;

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T12b',
        p_fuente := 'remax',
        p_precio_mensual_bob := 4000,
        p_area_total_m2 := 75,
        p_dormitorios := 2,
        p_zona := 'Equipetrol'
    );
    v_id_t12b := v_result.id;

    PERFORM * FROM merge_alquiler(NULL);

    SELECT COUNT(*) INTO v_count
    FROM propiedades_v2
    WHERE id IN (v_id_t12a, v_id_t12b)
      AND status = 'completado'
      AND tipo_operacion::TEXT = 'alquiler';

    IF v_count = 2 THEN
        RAISE NOTICE 'T12 PASS: Merge batch proceso % alquileres pendientes', v_count;
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T12 FAIL: Solo % de 2 fueron procesados', v_count;
        v_failed := v_failed + 1;
    END IF;

    -- Verificar que NO toco venta
    SELECT status::TEXT INTO v_prop FROM propiedades_v2 WHERE id = v_id_t08_venta;
    IF v_prop.status = 'nueva' THEN
        RAISE NOTICE 'T12 CHECK: Propiedad de venta NO fue tocada OK';
    ELSE
        RAISE NOTICE 'T12 WARNING: Propiedad de venta modificada (status=%)', v_prop.status;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- T13: Merge con candado (formato viejo)
    -- ========================================================================
    RAISE NOTICE '--- T13: Merge con candado ---';

    SELECT * INTO v_result
    FROM registrar_discovery_alquiler(
        p_url := 'https://test.sici/alquiler/T13',
        p_fuente := 'century21',
        p_precio_mensual_bob := 5000.00,
        p_area_total_m2 := 90,
        p_dormitorios := 2,
        p_zona := 'Equipetrol'
    );
    v_id_t13 := v_result.id;

    -- Candado formato viejo
    UPDATE propiedades_v2
    SET campos_bloqueados = '{"precio_mensual_bob": true}'::jsonb
    WHERE id = v_id_t13;

    v_jsonb_result := registrar_enrichment_alquiler(
        p_id := v_id_t13,
        p_datos_llm := '{"precio_mensual_bob": 9999, "dormitorios": 2, "banos": 2}'::jsonb
    );

    SELECT * INTO v_result FROM merge_alquiler(v_id_t13);

    SELECT precio_mensual_bob, status INTO v_prop FROM propiedades_v2 WHERE id = v_id_t13;

    IF v_prop.precio_mensual_bob = 5000.00 AND v_prop.status::TEXT = 'completado' THEN
        RAISE NOTICE 'T13 PASS: Candado respetado en merge (precio=% no cambio, status=%)',
            v_prop.precio_mensual_bob, v_prop.status;
        v_passed := v_passed + 1;
    ELSE
        RAISE NOTICE 'T13 FAIL: Candado no respetado (precio=%, esperado 5000)', v_prop.precio_mensual_bob;
        v_failed := v_failed + 1;
    END IF;

    RAISE NOTICE '';

    -- ========================================================================
    -- RESUMEN
    -- ========================================================================
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'RESUMEN: %/% tests pasaron, % fallaron', v_passed, v_total, v_failed;
    IF v_failed = 0 THEN
        RAISE NOTICE 'RESULTADO: TODOS LOS TESTS PASARON';
    ELSE
        RAISE NOTICE 'RESULTADO: HAY % TESTS FALLIDOS - REVISAR ARRIBA', v_failed;
    END IF;
    RAISE NOTICE '============================================================';

    -- ========================================================================
    -- CLEANUP
    -- ========================================================================
    RAISE NOTICE '';
    RAISE NOTICE 'Limpiando registros de test...';

    DELETE FROM propiedades_v2 WHERE url LIKE 'https://test.sici/alquiler/%';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE 'Cleanup: % registros eliminados', v_count;
    RAISE NOTICE 'DONE.';

END;
$$;
