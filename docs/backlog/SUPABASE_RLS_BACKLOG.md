# Supabase RLS — Backlog de remediación

Estado de remediación de hallazgos del linter de Supabase (categoría SECURITY).
Iniciado 22 abril 2026 tras correo de Supabase flagueando issues críticos.

## ✅ Cerrado

### Migración 224 — `leads_alquiler` RLS (22 abr 2026)
- Hallazgo: `sensitive_columns_exposed` + `rls_disabled_in_public` (crítico)
- Fix: `ENABLE ROW LEVEL SECURITY` + policy SELECT para `claude_readonly`
- Código: `simon-mvp/src/pages/api/lead-alquiler.ts` migrado de `NEXT_PUBLIC_SUPABASE_ANON_KEY` a `SUPABASE_SERVICE_ROLE_KEY`
- Verificado: lead #214 post-fix OK, `/metrics` sigue funcionando
- Commit: `b29f18d`

### Migración 225 — Rename 9 backups a `_trash_*` (22 abr 2026)
- Hallazgo: `rls_disabled_in_public` en 9 tablas backup huérfanas
- Estrategia: rename reversible a prefijo `_trash_*`, DROP definitivo el **29 abr 2026**
- Evidencia: grep código limpio + `pg_stat_user_tables` sin lecturas 11+ días + `pg_depend` sin deps
- Tablas afectadas:
  - `_trash_backup_multiproyecto_060`
  - `_trash_propiedades_backup_20251020`
  - `_trash_propiedades_v2_backup_20260104`
  - `_trash_propiedades_v2_backup_20260108`
  - `_trash_proyectos_master_backup_20260104`
  - `_trash_proyectos_master_backup_20260108`
  - `_trash_proyectos_master_backup_20260108_dev`
  - `_trash_matching_sugerencias_backup_20260104`
  - `_trash_fix_tc_paralelo_audit_20260114`

---

## 🟡 Pendiente — DROP definitivo el 29 abril 2026

Si entre 22-29 abr **no aparecieron errores** tipo `relation "_trash_..." does not exist` en:
- Logs Vercel (API routes, admin pages)
- Logs n8n (workflows nocturnos)
- Dashboard `/admin/salud`

Entonces ejecutar:

```sql
DROP TABLE public._trash_backup_multiproyecto_060;
DROP TABLE public._trash_propiedades_backup_20251020;
DROP TABLE public._trash_propiedades_v2_backup_20260104;
DROP TABLE public._trash_propiedades_v2_backup_20260108;
DROP TABLE public._trash_proyectos_master_backup_20260104;
DROP TABLE public._trash_proyectos_master_backup_20260108;
DROP TABLE public._trash_proyectos_master_backup_20260108_dev;
DROP TABLE public._trash_matching_sugerencias_backup_20260104;
DROP TABLE public._trash_fix_tc_paralelo_audit_20260114;
```

Cierra 9 warnings `rls_disabled_in_public`.

**Rollback (si algún logs rotos):** renombrar la tabla específica al nombre original.

---

## 🔴 Tier 2 — RLS en tablas operacionales sin PII (~1h, bajo riesgo)

**Patrón**: `ENABLE RLS` + policy `TO claude_readonly USING (true)`. `service_role` bypassea automáticamente. anon sin acceso.

Mismo approach que migración 224.

**Tablas** (13):
- `workflow_executions`
- `auditoria_snapshots`
- `auditoria_tipo_cambio`
- `config_global`
- `codigos_unicos`
- `matching_sugerencias`
- `advisor_property_snapshot`
- `sin_match_exportados`
- `proyectos_pendientes_enriquecimiento`
- `proyectos_pendientes_google`
- `propiedades_v2_historial`
- `propiedades_excluidas_export`
- `market_absorption_snapshots`

**Pre-check**: grep `scripts/`, `n8n/workflows/`, `simon-mvp/src/pages/api/` y confirmar que todo acceso sea vía `SUPABASE_SERVICE_ROLE_KEY` (bypass) o `claude_readonly` (policy).

---

## 🔴 Tier 2b — Tablas "el producto es la data" (~30min, bajo riesgo)

Estas SÍ deben ser leídas por anon (feeds públicos `/ventas`, `/alquileres`, landing).

**Patrón**: `ENABLE RLS` + policy `FOR SELECT USING (true)`. Lectura anon permitida, INSERT/UPDATE/DELETE bloqueado para anon (solo service_role puede escribir).

**Tablas** (5):
- `propiedades_v2`
- `proyectos_master`
- `unidades_reales`
- `unidades_virtuales`
- `propiedades` (legacy, considerar drop — ver regla 3 CLAUDE.md)

Cierra 5 warnings `rls_disabled_in_public` y agrega barrera para writes con anon key.

---

## 🔴 Tier 2c — Lookups/catálogos read-only (~20min, nulo)

Tablas de lookup sin PII, lectura abierta.

**Patrón**: `ENABLE RLS` + `FOR SELECT USING (true)` (o TO claude_readonly si no se usa desde anon).

**Tablas** (7):
- `zonas_geograficas`
- `zonas_mapeo`
- `tipo_propiedad_mapeo`
- `mapeo_subtipos_remax`
- `tipo_transaccion_mapeo`
- `zonas_barrido_equipetrol`
- `tc_binance_historial`
- `precios_historial` ⚠️ **ATENCIÓN**: usada por función `buscar_acm(propiedad_id)` (migración 226) desde modo broker. Si aplicamos RLS sin policy para anon/service_role, la función rompe. Opciones:
  - Policy `SELECT USING (true)` (es data histórica no sensible)
  - O marcar `buscar_acm()` como `SECURITY DEFINER`

---

## 🔴 Tier 3 — Requiere diseño previo (planificar aparte)

### 3a. `brokers` RLS (mini-proyecto, 4-6h)
- Riesgo alto: rompe login broker, admin dashboard, impersonación
- Consumers anon actuales:
  - `hooks/useBrokerAuth.ts:130,157`
  - `pages/broker/login.tsx:61,101,168,189`
  - `pages/broker/dashboard.tsx:141`
  - `pages/admin/brokers.tsx:51,90`
- Requiere:
  - Endpoint server-side para lookup pre-auth por teléfono
  - Policy `auth.email() = email` para self-read post-auth
  - Tabla/claim de admins (Supabase no tiene roles por default)
  - Migrar `/admin/brokers` a API route con service_role
  - Testing exhaustivo del flujo broker end-to-end
- Cierra 1 warning `rls_disabled_in_public` + 1 `policy_exists_rls_disabled`

### 3b. 25 views SECURITY DEFINER (de a una, ~2-3h espaciadas)
- Riesgo medio: algunas dependen de permisos del owner
- Fix: `ALTER VIEW ... SET (security_invoker = on)`
- **Bajo riesgo** (feeds públicos, solo leen `propiedades_v2`):
  - `v_mercado_venta`, `v_mercado_alquiler`, `v_metricas_mercado`, `v_salud_datos`, `v_enriquecimiento_stats`, `v_sospechosos_tipo_operacion`, `propiedades_procesadas_hoy`, `propiedades_requieren_auditoria`, `propiedades_analisis`, `propiedades_matching_ready`, `v_cambios_recientes`, `v_alternativas_proyecto`, `v_propiedades_editadas_admin`, `propiedades_validacion_completa`, `v_alerta_tc_paralelo_sin_detectar`, `analisis_motivos_rechazo`, `v_resumen_excluidas`, `v_proyectos_admin_stats`, `v_broker_calidad_stats`, `v_proyectos_sin_desarrollador`, `v_huerfanas_no_exportadas`
- **Riesgosas** (tocan data sensible, probar primero):
  - `v_brokers_pendientes_verificacion`
  - `v_lookup_ambiguities`
  - `dashboard_robustez_sistema`
- Cierra 25 warnings `security_definer_view`

---

## 🔵 Ignorar — Falsos positivos

- `spatial_ref_sys` — tabla PostGIS del sistema. Falso positivo universal en proyectos que usan PostGIS. No tocar.

---

## Meta — Orden recomendado de ejecución

| Prioridad | Acción | Esfuerzo | Riesgo | Warnings cerrados |
|---|---|---|---|---|
| 1 | DROP `_trash_*` (29 abr) | 5 min | Nulo | 9 |
| 2 | Tier 2c — lookups | 20 min | Nulo | 7-8 |
| 3 | Tier 2b — producto data | 30 min | Bajo | 5 |
| 4 | Tier 2 — operacionales | 1 h | Bajo | 13 |
| 5 | Tier 3b — views (low-risk batch) | 1 h | Medio | 20 |
| 6 | Tier 3b — views riesgosas | 1-2 h | Medio-alto | 3 |
| 7 | Tier 3a — brokers | 4-6 h | Alto | 2 |

Ejecución 1-4 en una tarde cierra ~35 de los ~60 warnings sin fricción.

## Referencias
- Memoria proyecto: `supabase_rls_remediation.md`
- Migraciones aplicadas: `sql/migrations/224_*.sql`, `225_*.sql`
- Linter Supabase: https://supabase.com/docs/guides/database/database-linter
