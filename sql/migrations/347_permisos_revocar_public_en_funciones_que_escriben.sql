-- ============================================================================
-- 347 · PERMISOS — la mitad que la 346 no pudo cerrar
--
-- La 346 revocó EXECUTE a `claude_readonly` sobre 21 funciones DEFINER que
-- escriben. Sólo entraron 3. Las otras 18 no tenían un permiso PROPIO del rol:
-- lo tienen por `PUBLIC` (el `=X/postgres` al inicio del ACL), que es el default
-- de Postgres para toda función. Revocarle a un rol lo que en realidad tiene
-- PUBLIC **no falla y no hace nada** — la 346 reportó éxito y dejó 18 abiertas.
--
-- 🔴 Y APARECIÓ OTRO ROL: `bot_kapso_readonly` tiene exactamente el mismo hueco
--    (las mismas 18) y **funciona ENTERAMENTE por PUBLIC: cero grants propios**.
--    Por eso este REVOKE va SÓLO sobre las 18 que ESCRIBEN y no sobre las de
--    lectura: un `REVOKE ... FROM PUBLIC` a lo ancho le cortaba el acceso al bot.
--    Es la misma trampa que costó 19 días de bot caído en agosto, en otra forma.
--
-- 🟢 RIESGO: NINGUNO, y está medido. Las 18 tienen grant EXPLÍCITO para
--    `postgres`, `anon`, `authenticated` y `service_role` — los cuatro conservan
--    el acceso. Sacarle a PUBLIC sólo despoja a quien no tiene grant propio:
--    `claude_readonly` y `bot_kapso_readonly`, que es el objetivo.
--
-- 🔑 El seguimiento de shortlists NO está en riesgo: sus dos funciones
--    (`marcar_intento_seguimiento`, `confirmar_seguimientos_enviados`) y el
--    vigilante del bot fueron justamente las 3 que SÍ cerró la 346 — verificado:
--    su ACL quedó `{postgres=X, service_role=X}`, sin PUBLIC. El cron sigue.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION
    public._trash_snapshot_absorcion_mercado(),
    public.actualizar_progreso_seccion(p_lead_id integer, p_seccion text, p_respuestas jsonb),
    public.actualizar_tipo_cambio(p_tipo character varying, p_nuevo_valor numeric, p_ejecutado_por character varying, p_notas text),
    public.confirmar_y_generar_guia(p_lead_id integer, p_perfil_fiduciario jsonb, p_guia_fiduciaria jsonb, p_alertas jsonb, p_mbf_ready jsonb, p_propiedades_mostradas integer[]),
    public.crear_lead_inicial(p_nombre text, p_whatsapp text, p_dispositivo text),
    public.finalizar_formulario(p_lead_id integer, p_formulario jsonb, p_tiempo_segundos integer),
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
    public.sincronizar_propiedad_desde_proyecto(p_id_propiedad integer, p_id_proyecto integer, p_sincronizar_estado boolean, p_sincronizar_fecha boolean, p_sincronizar_amenidades boolean, p_sincronizar_equipamiento boolean)
  FROM PUBLIC;

COMMIT;

-- ============================================================================
-- VERIFICACIÓN — correr después y esperar exactamente esto
-- ============================================================================
-- SELECT
--  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
--      AND has_function_privilege('claude_readonly', p.oid,'EXECUTE')
--      AND p.prosrc ~* '(insert[[:space:]]+into|update[[:space:]]+[a-z_]|delete[[:space:]]+from)') AS readonly,      -- 0
--  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.prokind='f' AND p.prosecdef
--      AND has_function_privilege('bot_kapso_readonly', p.oid,'EXECUTE')
--      AND p.prosrc ~* '(insert[[:space:]]+into|update[[:space:]]+[a-z_]|delete[[:space:]]+from)') AS bot,           -- 0
--  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.proname IN
--      ('resumen_mercado','buscar_propiedades','buscar_similares')
--      AND has_function_privilege('bot_kapso_readonly', p.oid,'EXECUTE')) AS rpc_del_bot_intactas;                   -- > 0
--
-- 🔴 LA PRUEBA QUE MANDA: escribirle al bot por WhatsApp y que responda.
--    El conteo de arriba no prueba que el bot ande — eso ya se creyó una vez.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <las 18> TO PUBLIC;
-- ============================================================================

-- 📌 NOTA para el próximo barrido: hay 65 funciones que escriben con EXECUTE a
--    PUBLIC; estas 18 son sólo las `SECURITY DEFINER`. Las otras 47 son INVOKER,
--    o sea que corren con los permisos de quien llama: un rol de sólo lectura
--    que las invoque falla igual al tocar la tabla. Riesgo distinto, no el mismo.
