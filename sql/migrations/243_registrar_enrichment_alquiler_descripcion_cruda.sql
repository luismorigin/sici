-- =====================================================
-- Migracion 243: descripcion cruda en registrar_enrichment_alquiler
-- Fecha: 2026-05-09
-- Autor: Luis - SICI
-- =====================================================
-- CONTEXTO:
-- El pipeline enrichment alquiler (Firecrawl + Haiku 4.5) extrae la
-- descripcion cruda del listing pero NO la persiste — solo guarda el
-- output del LLM (descripcion_limpia, resumen estructurado). El feed
-- /alquileres muestra el resumen LLM porque la cruda nunca toca BD.
--
-- Este patch agrega un parametro opcional p_descripcion_cruda que se
-- guarda en datos_json_enrichment->'descripcion' (root level — misma
-- key que usa el pipeline de venta + el audit-feed-ventas + la RPC
-- buscar_unidades_alquiler como prioridad 1 del COALESCE).
--
-- BACKWARDS COMPATIBLE: el parametro tiene DEFAULT NULL.
-- - Si workflow viejo (5 args) llama a funcion nueva → funciona, descripcion=NULL.
-- - Si workflow nuevo (6 args) llama a funcion vieja → falla. Por eso el
--   orden de aplicacion correcto es: PRIMERO migracion, DESPUES workflow.
--
-- ROLLBACK: ver al final del archivo.
-- =====================================================


-- =====================================================
-- BACKUP — version anterior (pg_get_functiondef ejecutado 2026-05-09)
-- =====================================================
-- Para rollback: descomentar este bloque y ejecutarlo. Restaura la firma
-- de 6 parametros y el jsonb_build_object sin la key 'descripcion'.
--
-- CREATE OR REPLACE FUNCTION public.registrar_enrichment_alquiler(
--     p_id integer,
--     p_datos_llm jsonb,
--     p_modelo_usado text DEFAULT 'claude-haiku-4.0'::text,
--     p_tokens_usados integer DEFAULT NULL::integer,
--     p_requiere_revision boolean DEFAULT false,
--     p_errores_validacion text[] DEFAULT NULL::text[]
-- )
-- RETURNS jsonb
-- LANGUAGE plpgsql
-- AS $function$
-- DECLARE
--     v_prop RECORD;
--     v_candados JSONB;
--     v_status_nuevo estado_propiedad;
--     v_rows INTEGER;
-- BEGIN
--     SELECT id, tipo_operacion, status, campos_bloqueados
--     INTO v_prop FROM propiedades_v2 WHERE id = p_id;
--     IF NOT FOUND THEN
--         RETURN jsonb_build_object('success', false, 'error', format('Propiedad ID %s no encontrada', p_id));
--     END IF;
--     IF v_prop.tipo_operacion != 'alquiler' THEN
--         RETURN jsonb_build_object('success', false, 'error', format('Propiedad ID %s no es alquiler (es %s)', p_id, v_prop.tipo_operacion));
--     END IF;
--     IF v_prop.status = 'inactivo_confirmed' THEN
--         RETURN jsonb_build_object('success', false, 'error', format('Propiedad ID %s inactiva confirmada', p_id));
--     END IF;
--     v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::jsonb);
--     IF p_requiere_revision THEN v_status_nuevo := 'actualizado'::estado_propiedad;
--     ELSE v_status_nuevo := 'actualizado'::estado_propiedad;
--     END IF;
--     UPDATE propiedades_v2
--     SET
--         precio_mensual_bob = CASE WHEN _is_campo_bloqueado(v_candados, 'precio_mensual_bob') THEN precio_mensual_bob WHEN (p_datos_llm->>'precio_mensual_bob') IS NOT NULL THEN (p_datos_llm->>'precio_mensual_bob')::NUMERIC ELSE precio_mensual_bob END,
--         precio_mensual_usd = CASE WHEN _is_campo_bloqueado(v_candados, 'precio_mensual_usd') THEN precio_mensual_usd WHEN (p_datos_llm->>'precio_mensual_usd') IS NOT NULL THEN (p_datos_llm->>'precio_mensual_usd')::NUMERIC WHEN (p_datos_llm->>'precio_mensual_bob') IS NOT NULL AND precio_mensual_usd IS NULL THEN ROUND((p_datos_llm->>'precio_mensual_bob')::NUMERIC / 6.96, 2) ELSE precio_mensual_usd END,
--         monto_expensas_bob = CASE WHEN _is_campo_bloqueado(v_candados, 'monto_expensas_bob') THEN monto_expensas_bob WHEN (p_datos_llm->>'expensas_bs') IS NOT NULL THEN (p_datos_llm->>'expensas_bs')::NUMERIC ELSE monto_expensas_bob END,
--         deposito_meses = CASE WHEN _is_campo_bloqueado(v_candados, 'deposito_meses') THEN deposito_meses WHEN (p_datos_llm->>'deposito_meses') IS NOT NULL AND (p_datos_llm->>'deposito_meses')::NUMERIC BETWEEN 0 AND 6 THEN (p_datos_llm->>'deposito_meses')::NUMERIC ELSE deposito_meses END,
--         amoblado = CASE WHEN _is_campo_bloqueado(v_candados, 'amoblado') THEN amoblado WHEN (p_datos_llm->>'amoblado') IS NOT NULL THEN CASE LOWER(p_datos_llm->>'amoblado') WHEN 'si' THEN 'si' WHEN 'sí' THEN 'si' WHEN 'no' THEN 'no' WHEN 'semi' THEN 'semi' WHEN 'parcial' THEN 'semi' WHEN 'parcialmente' THEN 'semi' ELSE NULL END ELSE amoblado END,
--         acepta_mascotas = CASE WHEN _is_campo_bloqueado(v_candados, 'acepta_mascotas') THEN acepta_mascotas WHEN (p_datos_llm->>'acepta_mascotas') IS NOT NULL THEN (p_datos_llm->>'acepta_mascotas')::BOOLEAN ELSE acepta_mascotas END,
--         servicios_incluidos = CASE WHEN _is_campo_bloqueado(v_candados, 'servicios_incluidos') THEN servicios_incluidos WHEN p_datos_llm->'servicios_incluidos' IS NOT NULL AND jsonb_typeof(p_datos_llm->'servicios_incluidos') = 'array' THEN p_datos_llm->'servicios_incluidos' ELSE servicios_incluidos END,
--         contrato_minimo_meses = CASE WHEN _is_campo_bloqueado(v_candados, 'contrato_minimo_meses') THEN contrato_minimo_meses WHEN (p_datos_llm->>'contrato_minimo_meses') IS NOT NULL THEN (p_datos_llm->>'contrato_minimo_meses')::INTEGER ELSE contrato_minimo_meses END,
--         area_total_m2 = CASE WHEN _is_campo_bloqueado(v_candados, 'area_total_m2') THEN area_total_m2 WHEN (p_datos_llm->>'area_total_m2') IS NOT NULL AND (p_datos_llm->>'area_total_m2')::NUMERIC > 0 THEN (p_datos_llm->>'area_total_m2')::NUMERIC ELSE area_total_m2 END,
--         dormitorios = CASE WHEN _is_campo_bloqueado(v_candados, 'dormitorios') THEN dormitorios WHEN (p_datos_llm->>'dormitorios') IS NOT NULL THEN (p_datos_llm->>'dormitorios')::INTEGER ELSE dormitorios END,
--         banos = CASE WHEN _is_campo_bloqueado(v_candados, 'banos') THEN banos WHEN (p_datos_llm->>'banos') IS NOT NULL AND (p_datos_llm->>'banos')::NUMERIC < 100 THEN (p_datos_llm->>'banos')::NUMERIC ELSE banos END,
--         estacionamientos = CASE WHEN _is_campo_bloqueado(v_candados, 'estacionamientos') THEN estacionamientos WHEN (p_datos_llm->>'estacionamientos') IS NOT NULL THEN (p_datos_llm->>'estacionamientos')::INTEGER ELSE estacionamientos END,
--         baulera = CASE WHEN _is_campo_bloqueado(v_candados, 'baulera') THEN baulera WHEN (p_datos_llm->>'baulera') IS NOT NULL THEN (p_datos_llm->>'baulera')::BOOLEAN ELSE baulera END,
--         piso = CASE WHEN _is_campo_bloqueado(v_candados, 'piso') THEN piso WHEN (p_datos_llm->>'piso') IS NOT NULL THEN (p_datos_llm->>'piso')::INTEGER ELSE piso END,
--         nombre_edificio = CASE WHEN _is_campo_bloqueado(v_candados, 'nombre_edificio') THEN nombre_edificio WHEN (p_datos_llm->>'nombre_edificio') IS NOT NULL THEN p_datos_llm->>'nombre_edificio' ELSE nombre_edificio END,
--         datos_json_enrichment = jsonb_build_object(
--             'llm_output', p_datos_llm,
--             'metadata', jsonb_build_object(
--                 'modelo', p_modelo_usado,
--                 'tokens', p_tokens_usados,
--                 'fecha', NOW(),
--                 'requiere_revision', p_requiere_revision,
--                 'errores_validacion', COALESCE(to_jsonb(p_errores_validacion), '[]'::jsonb)
--             )
--         ),
--         status = v_status_nuevo,
--         fecha_enrichment = NOW(),
--         fecha_actualizacion = NOW(),
--         flags_semanticos = CASE WHEN p_requiere_revision THEN COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('tipo', 'requiere_revision_alquiler', 'errores', COALESCE(to_jsonb(p_errores_validacion), '[]'::jsonb), 'fecha', NOW())) ELSE flags_semanticos END
--     WHERE id = p_id;
--     GET DIAGNOSTICS v_rows = ROW_COUNT;
--     IF v_rows = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'Update fallo'); END IF;
--     RETURN jsonb_build_object('success', true, 'property_id', p_id, 'status', v_status_nuevo, 'modelo', p_modelo_usado, 'tokens', p_tokens_usados, 'requiere_revision', p_requiere_revision, 'timestamp', NOW());
-- END;
-- $function$;


-- =====================================================
-- NUEVA VERSION
-- =====================================================
CREATE OR REPLACE FUNCTION public.registrar_enrichment_alquiler(
    p_id integer,
    p_datos_llm jsonb,
    p_modelo_usado text DEFAULT 'claude-haiku-4.0'::text,
    p_tokens_usados integer DEFAULT NULL::integer,
    p_requiere_revision boolean DEFAULT false,
    p_errores_validacion text[] DEFAULT NULL::text[],
    p_descripcion_cruda text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
AS $function$
DECLARE
    v_prop RECORD;
    v_candados JSONB;
    v_status_nuevo estado_propiedad;
    v_rows INTEGER;
BEGIN
    -- ========================================================================
    -- PASO 1: Validar que existe y es alquiler
    -- ========================================================================
    SELECT
        id, tipo_operacion, status, campos_bloqueados
    INTO v_prop
    FROM propiedades_v2
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Propiedad ID %s no encontrada', p_id)
        );
    END IF;

    IF v_prop.tipo_operacion != 'alquiler' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Propiedad ID %s no es alquiler (es %s)', p_id, v_prop.tipo_operacion)
        );
    END IF;

    -- No enriquecer inactivas confirmadas
    IF v_prop.status = 'inactivo_confirmed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Propiedad ID %s inactiva confirmada', p_id)
        );
    END IF;

    v_candados := COALESCE(v_prop.campos_bloqueados, '{}'::jsonb);

    -- Determinar status post-enrichment
    IF p_requiere_revision THEN
        v_status_nuevo := 'actualizado'::estado_propiedad;
    ELSE
        v_status_nuevo := 'actualizado'::estado_propiedad;
    END IF;

    -- ========================================================================
    -- PASO 2: UPDATE columnas directas + JSON enrichment
    -- ========================================================================
    UPDATE propiedades_v2
    SET
        -- COLUMNAS ESPECIFICAS DE ALQUILER
        precio_mensual_bob = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_mensual_bob')
            THEN precio_mensual_bob
            WHEN (p_datos_llm->>'precio_mensual_bob') IS NOT NULL
            THEN (p_datos_llm->>'precio_mensual_bob')::NUMERIC
            ELSE precio_mensual_bob
        END,

        precio_mensual_usd = CASE
            WHEN _is_campo_bloqueado(v_candados, 'precio_mensual_usd')
            THEN precio_mensual_usd
            WHEN (p_datos_llm->>'precio_mensual_usd') IS NOT NULL
            THEN (p_datos_llm->>'precio_mensual_usd')::NUMERIC
            WHEN (p_datos_llm->>'precio_mensual_bob') IS NOT NULL AND precio_mensual_usd IS NULL
            THEN ROUND((p_datos_llm->>'precio_mensual_bob')::NUMERIC / 6.96, 2)
            ELSE precio_mensual_usd
        END,

        monto_expensas_bob = CASE
            WHEN _is_campo_bloqueado(v_candados, 'monto_expensas_bob')
            THEN monto_expensas_bob
            WHEN (p_datos_llm->>'expensas_bs') IS NOT NULL
            THEN (p_datos_llm->>'expensas_bs')::NUMERIC
            ELSE monto_expensas_bob
        END,

        deposito_meses = CASE
            WHEN _is_campo_bloqueado(v_candados, 'deposito_meses')
            THEN deposito_meses
            WHEN (p_datos_llm->>'deposito_meses') IS NOT NULL
                AND (p_datos_llm->>'deposito_meses')::NUMERIC BETWEEN 0 AND 6
            THEN (p_datos_llm->>'deposito_meses')::NUMERIC
            ELSE deposito_meses
        END,

        amoblado = CASE
            WHEN _is_campo_bloqueado(v_candados, 'amoblado')
            THEN amoblado
            WHEN (p_datos_llm->>'amoblado') IS NOT NULL
            THEN CASE LOWER(p_datos_llm->>'amoblado')
                WHEN 'si' THEN 'si'
                WHEN 'sí' THEN 'si'
                WHEN 'no' THEN 'no'
                WHEN 'semi' THEN 'semi'
                WHEN 'parcial' THEN 'semi'
                WHEN 'parcialmente' THEN 'semi'
                ELSE NULL
            END
            ELSE amoblado
        END,

        acepta_mascotas = CASE
            WHEN _is_campo_bloqueado(v_candados, 'acepta_mascotas')
            THEN acepta_mascotas
            WHEN (p_datos_llm->>'acepta_mascotas') IS NOT NULL
            THEN (p_datos_llm->>'acepta_mascotas')::BOOLEAN
            ELSE acepta_mascotas
        END,

        servicios_incluidos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'servicios_incluidos')
            THEN servicios_incluidos
            WHEN p_datos_llm->'servicios_incluidos' IS NOT NULL
                AND jsonb_typeof(p_datos_llm->'servicios_incluidos') = 'array'
            THEN p_datos_llm->'servicios_incluidos'
            ELSE servicios_incluidos
        END,

        contrato_minimo_meses = CASE
            WHEN _is_campo_bloqueado(v_candados, 'contrato_minimo_meses')
            THEN contrato_minimo_meses
            WHEN (p_datos_llm->>'contrato_minimo_meses') IS NOT NULL
            THEN (p_datos_llm->>'contrato_minimo_meses')::INTEGER
            ELSE contrato_minimo_meses
        END,

        -- COLUMNAS COMPARTIDAS (fisico)
        area_total_m2 = CASE
            WHEN _is_campo_bloqueado(v_candados, 'area_total_m2')
            THEN area_total_m2
            WHEN (p_datos_llm->>'area_total_m2') IS NOT NULL
                AND (p_datos_llm->>'area_total_m2')::NUMERIC > 0
            THEN (p_datos_llm->>'area_total_m2')::NUMERIC
            ELSE area_total_m2
        END,

        dormitorios = CASE
            WHEN _is_campo_bloqueado(v_candados, 'dormitorios')
            THEN dormitorios
            WHEN (p_datos_llm->>'dormitorios') IS NOT NULL
            THEN (p_datos_llm->>'dormitorios')::INTEGER
            ELSE dormitorios
        END,

        banos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'banos')
            THEN banos
            WHEN (p_datos_llm->>'banos') IS NOT NULL
                AND (p_datos_llm->>'banos')::NUMERIC < 100
            THEN (p_datos_llm->>'banos')::NUMERIC
            ELSE banos
        END,

        estacionamientos = CASE
            WHEN _is_campo_bloqueado(v_candados, 'estacionamientos')
            THEN estacionamientos
            WHEN (p_datos_llm->>'estacionamientos') IS NOT NULL
            THEN (p_datos_llm->>'estacionamientos')::INTEGER
            ELSE estacionamientos
        END,

        baulera = CASE
            WHEN _is_campo_bloqueado(v_candados, 'baulera')
            THEN baulera
            WHEN (p_datos_llm->>'baulera') IS NOT NULL
            THEN (p_datos_llm->>'baulera')::BOOLEAN
            ELSE baulera
        END,

        piso = CASE
            WHEN _is_campo_bloqueado(v_candados, 'piso')
            THEN piso
            WHEN (p_datos_llm->>'piso') IS NOT NULL
            THEN (p_datos_llm->>'piso')::INTEGER
            ELSE piso
        END,

        nombre_edificio = CASE
            WHEN _is_campo_bloqueado(v_candados, 'nombre_edificio')
            THEN nombre_edificio
            WHEN (p_datos_llm->>'nombre_edificio') IS NOT NULL
            THEN p_datos_llm->>'nombre_edificio'
            ELSE nombre_edificio
        END,

        -- JSONB ENRICHMENT — agrega 'descripcion' al root (cruda del agente)
        datos_json_enrichment = jsonb_build_object(
            'llm_output', p_datos_llm,
            'metadata', jsonb_build_object(
                'modelo', p_modelo_usado,
                'tokens', p_tokens_usados,
                'fecha', NOW(),
                'requiere_revision', p_requiere_revision,
                'errores_validacion', COALESCE(
                    to_jsonb(p_errores_validacion),
                    '[]'::jsonb
                )
            ),
            'descripcion', p_descripcion_cruda
        ),

        -- STATUS Y FECHAS
        status = v_status_nuevo,
        fecha_enrichment = NOW(),
        fecha_actualizacion = NOW(),

        -- Flag de revision en flags_semanticos si hay errores
        flags_semanticos = CASE
            WHEN p_requiere_revision THEN
                COALESCE(flags_semanticos, '[]'::jsonb) || jsonb_build_array(
                    jsonb_build_object(
                        'tipo', 'requiere_revision_alquiler',
                        'errores', COALESCE(to_jsonb(p_errores_validacion), '[]'::jsonb),
                        'fecha', NOW()
                    )
                )
            ELSE flags_semanticos
        END

    WHERE id = p_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;

    IF v_rows = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Update fallo');
    END IF;

    -- ========================================================================
    -- PASO 3: Retornar resultado
    -- ========================================================================
    RETURN jsonb_build_object(
        'success', true,
        'property_id', p_id,
        'status', v_status_nuevo,
        'modelo', p_modelo_usado,
        'tokens', p_tokens_usados,
        'requiere_revision', p_requiere_revision,
        'descripcion_persistida', p_descripcion_cruda IS NOT NULL,
        'timestamp', NOW()
    );

END;
$function$;


-- =====================================================
-- SMOKE TESTS — correr DENTRO de transaccion antes de COMMIT real
-- =====================================================
-- IMPORTANTE: cada test pisa el datos_json_enrichment de la prop. Por eso
-- todos van envueltos en BEGIN/ROLLBACK para no afectar el feed productivo.
-- Usar un id de prop que tenga status='completado' o 'actualizado'.
--
-- BEGIN;
--
-- -- Test 1: llamada SIN p_descripcion_cruda (retro-compat)
-- -- Esperado: success=true, descripcion=NULL en JSONB
-- SELECT registrar_enrichment_alquiler(
--   p_id := 1391,
--   p_datos_llm := '{"amoblado":"no","dormitorios":2}'::jsonb,
--   p_modelo_usado := 'test-rollback'
-- );
-- SELECT
--   datos_json_enrichment ? 'descripcion' AS tiene_key,
--   datos_json_enrichment->>'descripcion' AS valor,
--   datos_json_enrichment->'metadata'->>'modelo' AS modelo
-- FROM propiedades_v2 WHERE id = 1391;
-- -- Esperado: tiene_key=true, valor=NULL, modelo='test-rollback'
--
-- -- Test 2: llamada CON p_descripcion_cruda
-- SELECT registrar_enrichment_alquiler(
--   p_id := 1391,
--   p_datos_llm := '{"amoblado":"no","dormitorios":2}'::jsonb,
--   p_modelo_usado := 'test-with-desc',
--   p_descripcion_cruda := 'Texto literal del agente sobre el aviso'
-- );
-- SELECT datos_json_enrichment->>'descripcion' AS valor
-- FROM propiedades_v2 WHERE id = 1391;
-- -- Esperado: valor='Texto literal del agente sobre el aviso'
--
-- -- Test 3: el RPC ahora retorna la cruda en lugar del descripcion_limpia
-- SELECT id, LEFT(descripcion, 100) AS descripcion
-- FROM buscar_unidades_alquiler('{"ids":[1391]}'::jsonb);
-- -- Esperado: descripcion='Texto literal del agente...'
--
-- ROLLBACK;
-- =====================================================


-- =====================================================
-- ROLLBACK (si hay que revertir post-deploy)
-- =====================================================
-- 1) Re-ejecutar el bloque BACKUP de arriba (descomentando) — restaura la
--    firma de 6 parametros y elimina la key 'descripcion' del jsonb_build_object.
--
-- 2) Limpiar las descripciones que se hayan guardado durante el periodo
--    post-deploy (opcional — no rompe nada, pero deja BD consistente):
--
-- UPDATE propiedades_v2
-- SET datos_json_enrichment = datos_json_enrichment - 'descripcion'
-- WHERE tipo_operacion = 'alquiler'
--   AND datos_json_enrichment ? 'descripcion';
--
-- 3) NO hace falta tocar buscar_unidades_alquiler — su COALESCE simplemente
--    cae al fallback descripcion_limpia cuando 'descripcion' no existe.
-- =====================================================
