-- ============================================================================
-- 346 · PERMISOS — sacarle la escritura a quien no la necesita
--
-- Cierra los dos agujeros del backlog de seguridad. Ninguno fue explotado; los
-- dos vienen de defaults de Supabase y de código que quedó atrás.
--
-- 🟢 RIESGO PARA PRODUCCIÓN: NINGUNO. Medido antes de escribir esta migración,
--    no asumido. Ver la evidencia bajo cada bloque.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 1 · `authenticated` podía BORRAR propiedades de la tabla viva
-- ─────────────────────────────────────────────────────────────────────────────
-- `authenticated` = cualquiera con sesión iniciada en la app (admin y brokers).
-- Tenía ALL sobre propiedades_v2 y proyectos_master, y las dos tienen RLS
-- DESACTIVADO → un DELETE llegaba a la tabla sin nada que lo frenara.
--
-- 🔑 NO se revoca todo: el admin ESCRIBE como `authenticated` desde el browser
--    (usePropertyEditor.ts usa el cliente con la anon key + el JWT del login).
--    Revocar UPDATE/INSERT rompería el editor. Se revoca SÓLO lo que nadie usa.
--
-- EVIDENCIA de que nadie borra:
--   · 0 llamadas `.delete()` sobre propiedades_v2 o proyectos_master en todo el
--     repo (frontend, scripts y APIs).
--   · El único DELETE del broker (`api/broker/delete-propiedad.ts`) va contra
--     `propiedades_broker`, otra tabla, y usa la llave de SERVICIO.
--   · Los cargadores nocturnos usan service_role, que NO se toca acá.
REVOKE DELETE, TRUNCATE ON public.propiedades_v2   FROM authenticated;
REVOKE DELETE, TRUNCATE ON public.proyectos_master FROM authenticated;

-- 🔴 LA TRAMPA (regla #13 del CLAUDE.md): una RPC `SECURITY INVOKER` lee y
--    escribe con los permisos de QUIEN LA LLAMA, así que el REVOKE de arriba la
--    rompe POR DENTRO, con un 42501, sin que nada en el código falle a la vista.
--    Barrido de pg_proc: hay UNA sola función que borra de propiedades_v2 y es
--    INVOKER → `procesar_accion_excluida`. Es CÓDIGO MUERTO: pertenecía al
--    supervisor HITL que se retiró el 20-ago (6 pantallas, 2.721 líneas), no la
--    llama nadie en el repo, y sus pantallas ya no existen.
--    Se le saca el EXECUTE en vez de dropearla: si apareciera un llamador, falla
--    con "permiso denegado" —un error legible— en lugar de borrar una propiedad.
REVOKE EXECUTE ON FUNCTION public.procesar_accion_excluida(p_propiedad_id integer, p_accion character varying, p_dorms_correcto integer, p_precio_correcto numeric, p_notas text) FROM authenticated, anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- BLOQUE 2 · el rol "de sólo lectura" podía ESCRIBIR
-- ─────────────────────────────────────────────────────────────────────────────
-- `claude_readonly` tiene sólo SELECT sobre las tablas, PERO podía ejecutar las
-- 49 funciones `SECURITY DEFINER` — y esas corren con los permisos del DUEÑO,
-- ignorando quién llama. 21 de las 49 escriben.
--
-- 🔑 Por qué importa de verdad: el MCP sólo expone una herramienta `query` para
--    SELECT, y `SELECT recalcular_precios_batch_nocturno(500);` ES un SELECT.
--    O sea que el canal "de sólo lectura" podía mutar la base sin romper ninguna
--    regla aparente.
--
-- 🟢 Sin efecto en producción: `claude_readonly` NO lo usa la app. Vive sólo en
--    la cadena de conexión del MCP (verificado con grep en todo el repo).
-- 🔑 Se revocan las 21 que ESCRIBEN, no las 49: las de lectura (las 3 RPC del
--    bot, los feeds shadow) se siguen necesitando para auditar.
REVOKE EXECUTE ON FUNCTION
    public._trash_snapshot_absorcion_mercado(),
    public.actualizar_progreso_seccion(p_lead_id integer, p_seccion text, p_respuestas jsonb),
    public.actualizar_tipo_cambio(p_tipo character varying, p_nuevo_valor numeric, p_ejecutado_por character varying, p_notas text),
    public.confirmar_seguimientos_enviados(p_ventana_minutos integer),
    public.confirmar_y_generar_guia(p_lead_id integer, p_perfil_fiduciario jsonb, p_guia_fiduciaria jsonb, p_alertas jsonb, p_mbf_ready jsonb, p_propiedades_mostradas integer[]),
    public.crear_lead_inicial(p_nombre text, p_whatsapp text, p_dispositivo text),
    public.finalizar_formulario(p_lead_id integer, p_formulario jsonb, p_tiempo_segundos integer),
    public.marcar_intento_seguimiento(p_hash text),
    public.marcar_slack_notificado(p_lead_id integer),
    public.merge_discovery_enrichment(p_identificador text),
    public.populate_broker_prospection(),
    public.procesar_validacion_auto_aprobado(p_sugerencia_id integer, p_accion character varying, p_proyecto_alternativo integer, p_validado_por character varying),
    public.propagar_proyecto_a_propiedades(p_id_proyecto integer, p_propagar_estado boolean, p_propagar_fecha boolean, p_propagar_amenidades boolean, p_propagar_equipamiento boolean),
    public.propagar_proyecto_con_apertura_temporal(p_id_proyecto integer, p_propagar_estado boolean, p_propagar_fecha boolean, p_propagar_amenidades boolean, p_propagar_equipamiento boolean, p_modo_candados text),
    public.recalcular_precio_propiedad(p_id integer),
    public.recalcular_precios_batch_nocturno(p_limite integer),
    public.registrar_enrichment(p_data jsonb),
    public.registrar_interes_propiedad(p_lead_id integer, p_propiedad_id integer),
    public.resetear_merge(p_identificador text),
    public.sincronizar_propiedad_desde_proyecto(p_id_propiedad integer, p_id_proyecto integer, p_sincronizar_estado boolean, p_sincronizar_fecha boolean, p_sincronizar_amenidades boolean, p_sincronizar_equipamiento boolean),
    public.vigilar_bot_whatsapp(p_umbral_min integer, p_hora_desde integer, p_hora_hasta integer)
  FROM claude_readonly;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — correr DESPUÉS y esperar exactamente esto
-- ============================================================================
-- 1) authenticated ya no puede borrar, pero SÍ sigue pudiendo editar:
--    SELECT has_table_privilege('authenticated','propiedades_v2','DELETE') AS borra,   -- false
--           has_table_privilege('authenticated','propiedades_v2','UPDATE') AS edita,   -- true
--           has_table_privilege('authenticated','propiedades_v2','INSERT') AS inserta; -- true
--
-- 2) el rol de lectura ya no puede escribir por la puerta de atrás:
--    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
--       AND has_function_privilege('claude_readonly', p.oid, 'EXECUTE')
--       AND p.prosrc ~* '(insert[[:space:]]+into|update[[:space:]]+[a-z_]|delete[[:space:]]+from)';
--    -- esperado: 0   (antes: 21)
--
-- 3) EN LA APP, la prueba que vale: entrar a /admin/propiedades/<id>, cambiar un
--    precio y guardar. Si guarda, el admin quedó intacto.
--
-- ROLLBACK (si algo rompiera): los GRANT inversos.
--   GRANT DELETE, TRUNCATE ON public.propiedades_v2, public.proyectos_master TO authenticated;
-- No se necesita para el bloque 2: nada de producción usa claude_readonly.
-- ============================================================================
