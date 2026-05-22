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

## ✅ DROP aplicado — migración 248 (22 may 2026, verificación post = 0 tablas)

Verificación pre-DROP (22 may, 23 días después de lo programado, sin incidentes en el ínterin):
- **pg_depend:** 0 dependencias en las 9 tablas.
- **pg_stat_user_tables:** último `seq_scan` de todas = 11 abr 2026 (scan masivo automático, ANTERIOR al rename del 22 abr) → ~1 mes sin ningún acceso.
- **grep código vivo** (`simon-mvp/src`, `scripts/`, `n8n/workflows`): cero referencias (solo docs + migraciones que las crearon: 016/059/060/095/225).

SQL en `sql/migrations/248_drop_trash_tables.sql`. **Aplicado 22 may 2026** — verificación post-DROP confirmó 0 tablas `_trash_*` restantes. Cierra 9 warnings `rls_disabled_in_public`.

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

**Rollback:** ya no aplica (tablas dropeadas). Recuperación solo desde backups automáticos de Supabase si fuera necesario.

---

## ⚠️ Hallazgo 22 may 2026 — el plan Tier 2/2b/2c de abajo SUBESTIMA el riesgo

Investigación de acceso real (frontend `simon-mvp/src`) reveló que **el plan original es incorrecto**: asumía que admin/backend usan `service_role`, pero **casi todo el frontend —incluido el admin— usa la anon key** (`lib/supabase.ts` exporta el cliente con `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Habilitar RLS "como dice abajo" rompería el editor de propiedades/proyectos y las landings públicas.

### Mapa de acceso real (26 tablas)

| Grupo | Tablas | Acción segura |
|---|---|---|
| 🟢 **Sin acceso anon** (16) | auditoria_tipo_cambio, codigos_unicos, advisor_property_snapshot, sin_match_exportados, proyectos_pendientes_enriquecimiento, proyectos_pendientes_google, propiedades_excluidas_export, unidades_reales (vacía), unidades_virtuales (vacía), propiedades (legacy), zonas_geograficas, zonas_mapeo, tipo_propiedad_mapeo, mapeo_subtipos_remax, tipo_transaccion_mapeo, zonas_barrido_equipetrol | RLS + policy `claude_readonly` — cero impacto en app |
| 🔴 **Lectura anon** (7) | config_global, market_absorption_snapshots, auditoria_snapshots, tc_binance_historial, precios_historial, workflow_executions, matching_sugerencias | RLS + `FOR SELECT USING (true)`. Se leen en getStaticProps de landings públicas + `/admin/salud` con anon key |
| 🔴🔴 **Escritura anon** (3 + editor) | propiedades_v2, proyectos_master, propiedades_v2_historial (+ todo el editor admin: `usePropertyEditor`, `useProjectEditor`, `admin/alquileres`, `supervisor/matching`) | **NO tocar** sin migrar escrituras a `service_role` primero (trabajo de app, no SQL) |

### Agujero de seguridad de fondo (más serio que el warning del linter)
Hoy, sin RLS, la **anon key pública** (está en el bundle del browser) tiene permiso de **INSERT/UPDATE/DELETE** sobre `propiedades_v2`/`proyectos_master` vía PostgREST. Cerrarlo bien exige migrar el editor admin a API routes con `service_role` **antes** de RLS.

### ✅ Gap n8n CERRADO (22 may 2026)
n8n conecta vía **Postgres directo** (123 nodos `n8n-nodes-base.postgres`, 0 nodos Supabase API) con la credencial "Supabase - Censo Inmobiliario" → user `postgres.chaosoiyoeyjuwtwckix` (= rol `postgres` vía pooler `aws-1-sa-east-1.pooler.supabase.com:6543`; el sufijo es el project-ref del pooler). El rol `postgres` es **owner de todas las tablas** y tiene **`rolbypassrls = true`**. Con RLS en modo `ENABLE` (NO `FORCE`), owner + bypassrls pasan de largo → **n8n es inmune a RLS**. El pipeline nocturno NO se ve afectado.

> 🔑 **CRÍTICO al escribir el SQL:** usar `ENABLE ROW LEVEL SECURITY`, **NUNCA `FORCE`**. Con `ENABLE`, postgres (n8n) y service_role bypassan; solo se filtra `anon`. Con `FORCE`, hasta el owner queda sujeto a las policies → rompería n8n.

> ⚠️ Pendiente menor antes de ejecutar: confirmar que los scripts Node de `scripts/` tampoco accedan a estas tablas con anon key (esta investigación cubrió `simon-mvp/src` + n8n, no `scripts/`).

### Pre-requisito técnico
`api/tc-actual.ts:13` y `api/broker/buscar-proyectos.ts:15` usan `SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY` (fallback a anon). Confirmar que `SUPABASE_SERVICE_ROLE_KEY` está seteada en Vercel, o esos accesos corren como anon silenciosamente.

### Plan revisado por fases (cuando se retome, con calma)
- **Fase A** — 16 🟢: RLS + policy `claude_readonly`. Cero riesgo de app (igual confirmar n8n antes).
- **Fase B** — 7 🔴 lectura: RLS + `FOR SELECT USING (true)`. Testear landings + `/admin/salud`.
- **Fase C** — 🔴🔴 escritura: migrar editor admin a service_role → recién después RLS.

**Estado (22 may): gap n8n CERRADO ✅.** Fase A (16 tablas 🟢) lista para ejecutar — pendientes menores: (1) verificar `scripts/` no use anon en esas tablas, (2) OK del user. RLS es reversible (`ALTER TABLE x DISABLE ROW LEVEL SECURITY`). Fases B y C siguen requiriendo más trabajo (B: testear landings; C: migrar editor admin a service_role).

---

## 🔴 Tier 2 — RLS en tablas operacionales sin PII ~~(~1h, bajo riesgo)~~ ⚠️ ver hallazgo 22 may arriba

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
| 1 | ~~DROP `_trash_*`~~ ✅ (mig 248, 22 may) | 5 min | Nulo | 9 |
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
