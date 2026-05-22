-- Migración 249: Cerrar escritura de `anon` en 19 tablas (seguridad)
--
-- PROBLEMA: el rol `anon` (la "llave pública", embebida en el bundle del browser)
--   tiene grant DIRECTO INSERT/UPDATE/DELETE/TRUNCATE sobre tablas del schema public
--   (ACL observado: anon=arwdDxtm/postgres). Cualquiera con la anon key puede
--   modificar / borrar / VACIAR (TRUNCATE) estas tablas vía PostgREST. Esta migración
--   revoca la ESCRITURA de anon donde está verificado que nadie escribe con esa llave.
--
-- VERIFICACIÓN (22 may 2026):
--   - Escrituras directas con anon (.insert/.update/.delete en simon-mvp/src): solo
--     propiedades_v2, proyectos_master, propiedades_v2_historial (editor) → EXCLUIDAS.
--   - Funciones RPC SECURITY INVOKER llamadas por el admin con anon escriben en:
--     matching_sugerencias, propiedades_excluidas_export, sin_match_exportados,
--     propiedades_v2, proyectos_master, desarrolladores, leads_mvp → EXCLUIDAS.
--   - n8n conecta como `postgres` (owner + rolbypassrls) → no usa anon, no afectado.
--   - scripts/ usan service_role o claude_readonly → no afectados.
--   - Las 19 de abajo: las escribe SOLO el pipeline (postgres). anon solo necesita
--     SELECT (o ni eso). Se revoca escritura, se PRESERVA SELECT (lecturas intactas).
--
-- PILOTO: `zonas_mapeo` revocada y verificada OK (anon lee=true, inserta/borra=false)
--   antes de este batch.
--
-- NO incluidas (el admin las escribe con anon → requieren arreglo de 2 pasos:
--   blindar esas RPCs a SECURITY DEFINER + migrar el editor admin a service_role):
--   propiedades_v2, proyectos_master, propiedades_v2_historial, matching_sugerencias,
--   propiedades_excluidas_export, sin_match_exportados, codigos_unicos.
--
-- ROLLBACK (por tabla): GRANT INSERT, UPDATE, DELETE ON public.<tabla> TO anon;
--
-- NOTA: se revoca solo de `anon`. `authenticated` (sin uso hoy) podría endurecerse
--   igual a futuro.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zonas_geograficas               FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zonas_mapeo                      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tipo_propiedad_mapeo             FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.mapeo_subtipos_remax             FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tipo_transaccion_mapeo           FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.zonas_barrido_equipetrol         FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.auditoria_tipo_cambio            FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.advisor_property_snapshot        FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.proyectos_pendientes_enriquecimiento FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.proyectos_pendientes_google      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.auditoria_snapshots              FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.workflow_executions              FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.market_absorption_snapshots      FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.config_global                    FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.tc_binance_historial             FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.precios_historial                FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.unidades_reales                  FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.unidades_virtuales               FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.propiedades                      FROM anon;

-- Verificación post-aplicación (debe devolver 0 filas):
-- SELECT t.tabla
-- FROM (VALUES ('zonas_geograficas'),('zonas_mapeo'),('tipo_propiedad_mapeo'),('mapeo_subtipos_remax'),
--   ('tipo_transaccion_mapeo'),('zonas_barrido_equipetrol'),('auditoria_tipo_cambio'),
--   ('advisor_property_snapshot'),('proyectos_pendientes_enriquecimiento'),('proyectos_pendientes_google'),
--   ('auditoria_snapshots'),('workflow_executions'),('market_absorption_snapshots'),('config_global'),
--   ('tc_binance_historial'),('precios_historial'),('unidades_reales'),('unidades_virtuales'),('propiedades')
-- ) t(tabla)
-- WHERE has_table_privilege('anon','public.'||t.tabla,'INSERT')
--    OR has_table_privilege('anon','public.'||t.tabla,'DELETE');
