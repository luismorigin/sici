# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching (venta + alquiler)
- Tabla principal: `propiedades_v2` — conteos actuales via `v_mercado_venta` y `v_mercado_alquiler`
- Tabla proyectos: `proyectos_master` (99%+ con GPS)
- Tracking: `workflow_executions` (health check)
- Fuentes: Century21, Remax, Bien Inmuebles

## MCP Servers

```json
{
  "postgres-sici": {
    "command": "npx",
    "args": [
      "-y",
      "@modelcontextprotocol/server-postgres",
      "postgresql://claude_readonly:***@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
    ]
  }
}
```

Server oficial Anthropic, **readonly por diseño** (solo expone tool `query` para SELECT). Usuario `claude_readonly` también tiene permisos SELECT en todas las tablas (defense in depth).

**Mutations (UPDATE/INSERT/DELETE)** no son ejecutables desde el MCP. El patrón canónico es: Claude genera el SQL, el humano lo aplica desde Supabase UI o psql.

Anterior config con `@henkey/postgres-mcp-server` removida 2026-05-11 (causaba conflicto con scope project del oficial — ver `/doctor`).

## n8n Environment Variables

Los workflows de n8n usan variables de entorno para secrets (NO hardcodear en JSON):

```
SLACK_WEBHOOK_SICI=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**IMPORTANTE:** Nunca commitear webhooks reales a GitHub - Slack los revoca automáticamente.

## Reglas Criticas

1. **Manual > Automatic** - `campos_bloqueados` SIEMPRE se respetan
2. **Discovery > Enrichment** - Para campos fisicos (area, dorms, GPS)
3. **propiedades_v2** - UNICA tabla activa. `propiedades` es LEGACY
4. **SQL > Regex** - Potenciar matching en BD, no extractores
5. **Human-in-the-Loop** - Sistema HITL migrado a Admin Dashboard (ya no usa Google Sheets)
6. **Alquiler aislado** - Pipeline alquiler usa funciones PROPIAS (`_alquiler`), NUNCA modificar funciones de venta
7. **pg_get_functiondef() SIEMPRE** - Antes de modificar cualquier funcion SQL, exportar la version actual de produccion. NUNCA confiar en archivos de migracion locales.
8. **Filtros de calidad en estudios de mercado** - SIEMPRE aplicar al consultar propiedades para informes:
   - `duplicado_de IS NULL`, `tipo_propiedad_original NOT IN ('baulera','parqueo','garaje','deposito')`
   - `(es_multiproyecto = false OR es_multiproyecto IS NULL)` (columna directa, NO `llm_output->>'es_multiproyecto'`), `area_total_m2 >= 20`
   - `<= 300 dias` en mercado para venta (730 para preventa), `<= 150 dias` para alquiler
   - Ver detalle completo en `docs/reports/FILTROS_CALIDAD_MERCADO.md`
9. **Auditorías de datos** - Al reportar problemas de calidad, filtrar primero por los mismos criterios que usan las queries de mercado (`duplicado_de IS NULL`, `status = 'completado'`, etc.). Props que no pasan esos filtros NO son anomalías — ya están excluidas del pipeline.
10. **Queries de mercado ad-hoc** — SIEMPRE usar `v_mercado_venta` o `v_mercado_alquiler` (migración 193, fix 203, filtro 150d migración 207). NUNCA escribir filtros canónicos a mano contra `propiedades_v2`. Las vistas pre-aplican todos los filtros y exponen `precio_m2`, `precio_norm`, `dias_en_mercado` (venta) y `precio_mensual` = `ROUND(precio_mensual_bob / 6.96, 2)` (alquiler, derivado de BOB — fuente de verdad). `v_mercado_alquiler` filtra a ≤150 días — para inventario estancado consultar `propiedades_v2` directo. En alquiler usar `precio_mensual_bob` para display en Bs, `precio_mensual` para cálculos en USD. NUNCA `precio_usd`.
12. **Absorción de mercado** — `market_absorption_snapshots` tiene 3 series (`filter_version`): v1 (rota, no usar), v2 (absorbidas backfilled pero inventario con filtro 300d), v3 (limpia, desde 14 Abr 2026). Al presentar datos de absorción: (a) declarar qué `filter_version` se usa, (b) v3 necesita ≥90 días para ser estable — antes de eso presentar como "rotación observada" con caveats, (c) absorbida ≠ vendida (puede ser listing expirado o retirado), (d) NUNCA presentar "meses de inventario" como predicción. Ver `docs/canonical/ABSORCION_LIMITACIONES.md` para detalle completo de cortes de datos y qué es verde/amarillo/rojo.
11. **Días en mercado (venta)** — NUNCA usar `fecha_discovery` para calcular antigüedad. `fecha_discovery` se pisa con `NOW()` cada noche por el pipeline. Usar `dias_en_mercado` de la vista (calcula `CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery)`), o `fecha_publicacion` directo si se consulta `propiedades_v2`. `fecha_creacion` es proxy aceptable solo si `fecha_publicacion` es NULL.
13. **Seguridad Supabase / RLS** — Antes de crear API routes con Supabase, habilitar RLS, dropear tablas, o crear views/funciones RPC: leer `docs/canonical/SEGURIDAD_SUPABASE.md`. Reglas clave: service_role en API server-side (nunca anon, nunca con prefijo `NEXT_PUBLIC_`), rename a `_trash_*` antes de DROP, grep + `pg_stat_user_tables` + `pg_depend` antes de RLS, views sin `SECURITY DEFINER`. **Migraciones nuevas que crean tablas/RPC/views en `public`** deben usar `sql/migrations/_template.sql` (incluye `GRANT` explícitos — obligatorio desde 30-oct-2026 por cambio de default Data API de Supabase). Ver Regla 6 del doc canónico.
14. **Brokers — dos tablas distintas, NUNCA confundir**:
    - `brokers` (legacy, pre-Simon Broker MVP) — sistema de captación B2B donde brokers suben **sus propias propiedades** al pipeline (`estado_verificacion`, `fuente_registro`, `total_propiedades`). **No se usa hoy** pero se mantiene por si se reactiva esa línea. Admin en `/admin/brokers`.
    - `simon_brokers` (MVP Simon Broker, migración 231) — brokers que usan `/broker/[slug]` para **armar shortlists** y compartirlas con sus clientes por WA. Reemplaza el archivo hardcoded `lib/brokers-demo.ts` (eliminado S3). Admin en `/admin/simon-brokers`. Lib server-side `lib/simon-brokers.ts`. Migración 235 agregó `terms_accepted_at` (checkbox obligatorio en onboarding).
    - `broker_shortlists` (228) + `broker_shortlist_items` (228) + `broker_shortlist_hearts` (234) + **`broker_shortlist_views` (235)** — sistema completo de shortlists. Migración 235 sumó protección v1: `max_views/current_views/expires_at/status/first_viewed_at` en `broker_shortlists` (cap 20 vistas / 30 días Plan Inicial), `broker_shortlist_views` para tracking de visitas únicas con fingerprint cookie+IP+UA hash. Lever de monetización Plan Pro futuro. **Migración 239** agregó `is_destacada BOOLEAN` a `broker_shortlist_items` (máx 1 destacada por shortlist, validación frontend + API; render `/b/[hash]` con chip ⭐ + invierte tema en venta o borde negro en alquiler). Comentario por item ya existía desde 228 (`comentario_broker`) pero se renderiza al cliente desde 239 (bloque arena con borde-izq salvia). Lib server-side `lib/broker-shortlists-server.ts`. Ver `docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md`.
    - `broker_prospection` (237+238) — tabla interna del founder para outreach a captadores. Sistema de demo público (`/broker/demo`, `/b/demo`) y panel `/admin/prospection`. Ver `docs/broker/PROSPECCION_Y_DEMO.md`.
    - Ninguna FK entre ellas. Datos completamente separados.
15. **Skills `/audit-feed-ventas-mensual` y `/audit-feed-alquileres-mensual` — costo + confirmación**:
    - **Ventas**: drift Firecrawl + 2 capas SQL sobre feed `/ventas`. Costo ~$1.75 por corrida (Firecrawl). **NUNCA invocarla sin OK explícito del user en el momento.** Source en `scripts/auditoria-feed-ventas/audit-feed-ventas-mensual.command.md`.
    - **Alquileres** (migración 244): drift fetcher curl-only + 2 capas SQL sobre `/alquileres`. **Costo $0** (los 3 portales sirven HTML estático suficiente para alquiler). Source en `scripts/auditoria-feed-alquileres/audit-feed-alquileres-mensual.command.md`. Pre-requisito: correr `npm run backfill` 1 vez para llenar la cruda de las ~138 props enriquecidas pre-9-may-2026.
    - Ambas persisten en `audit_descripciones_runs/items` con `tipo_operacion` (migración 244 agregó la columna). Las skills viven gitignored en `.claude/commands/` (copiar desde el `.command.md` del repo).
    - **`/audit-feed-ventas-semanal`** (v1.3, 2026-05-25): variante liviana sin Firecrawl, capas 2+3+4 sobre props nuevas en ventana temporal configurable (`--dias=N`, `--desde/--hasta`, `--ids`). **Costo $0**, sin persistencia. Source en `scripts/auditoria-feed-ventas/audit-feed-ventas-semanal.command.md`. Complementa la mensual: semanal limpia deuda fresca, mensual valida con drift portal. **v1.3 reescribió el detector de TC** (un solo check 2.1 = doble normalización paralelo, ratio `precio_usd/billete_desc` 1.2–1.6) tras un falso positivo que marcó `no_especificado` correctas como infladas; el gap oficial↔billete NUNCA se flaguea. Ver `docs/arquitectura/TIPO_CAMBIO_SICI.md` + memoria `precio_paralelo_vs_oficial_billete.md`.
    - **`/audit-feed-alquileres-semanal`** (v1.2, 2026-05-13): equivalente alquileres. 7 checks capa 2 (sin TC paralelo, checks específicos amoblado/mascotas/expensas), 4 checks capa 3 (matching tokenizado + bandas GPS), 3 checks capa 4 (incluye drift recurrente histórico). 8 calibraciones aplicadas tras retest sobre 37 props. **Costo $0**. Source en `scripts/auditoria-feed-alquileres/audit-feed-alquileres-semanal.command.md`. Pre-requisito: cobertura cruda ≥70% (paso 0 gate).

## Zonas Canonicas (6 zonas)

Fuente de verdad: tabla `zonas_geograficas` (7 polígonos PostGIS, 6 nombres únicos). Trigger `trg_asignar_zona_venta` (migración 173) auto-asigna `p.zona` y `p.microzona` desde GPS. Función `get_zona_by_gps(lat, lon)` (migración 185) disponible para consultas ad-hoc.

Desde migración 184, los nombres en BD son los nombres display definitivos (ya no hay nombres crudos internos).

| Zona | Valor en BD (`p.zona`, `pm.zona`) | Display corto (`zonas.ts`) |
|---|---|---|
| Equipetrol Centro | `Equipetrol Centro` | Eq. Centro |
| Equipetrol Norte | `Equipetrol Norte` | Eq. Norte |
| Sirari | `Sirari` | Sirari |
| Villa Brigida | `Villa Brigida` | V. Brigida |
| Equipetrol Oeste | `Equipetrol Oeste` | Eq. Oeste |
| Eq. 3er Anillo | `Eq. 3er Anillo` | Eq. 3er Anillo |

Conteos actuales: `SELECT zona, COUNT(*) FROM v_mercado_venta GROUP BY zona`

**Descripción geográfica + perfiles:** ver `docs/canonical/ZONAS_EQUIPETROL.md`

**Nombres legacy (aliases en `zonas.ts` para backwards compatibility):** `Equipetrol`, `Faremafu`, `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Franja`, `Villa Brígida` (con tilde).

**En queries:** Usar nombres de BD directos (columna izquierda). `lib/zonas.ts` mapea BD → display via `displayZona()` y `getZonaLabel()`.

## Sistema de precios — Definiciones

- `precio_usd`: Para props paralelo = USD **billete** (el precio que pide el vendedor en dólares físicos). Para el resto = USD directo del listing.
- `tipo_cambio_detectado`: `'paralelo'`, `'oficial'`, o `'no_especificado'`. Detectado por regex de la descripción; merge v2.5.0 upgrade con LLM (alta confianza, solo upgrade no_especificado→específico).
- `depende_de_tc`: `true` para props donde el precio depende del TC (paralelo u oficial + normalizado). `false` = USD real verificado.
- `precio_usd_actualizado`: Campo interno del módulo TC dinámico. Ningún query de mercado lo consume.
- `precio_usd_original` (en `datos_json_enrichment`): **NO confiable** como referencia — contiene BOB crudo (Remax) o USD×TC (C21). No usar para correcciones automáticas.
- `precio_normalizado()`: Función SQL que calcula precio comparable. Si paralelo: `precio_usd × tc_paralelo / 6.96`. Si no: `precio_usd` directo. **SIEMPRE** usar para queries de mercado.

### Reglas fundamentales de precio

1. **`precio_usd` NUNCA se usa directo** para comparar, mostrar o calcular métricas. Siempre `precio_normalizado()` en SQL o `normalizarPrecio()` en JS.
2. **`precio_normalizado()` es la UNICA normalización** — no normalizar antes de guardar en `precio_usd`. Si el código escribe a `precio_usd`, debe escribir el valor crudo (billete para paralelo, USD directo para el resto).
3. **Dashboard (`usePropertyEditor.ts`)**: `calcularPrecioNormalizado()` retorna billete directo para `usd_paralelo` → se guarda en `precio_usd`. `calcularPrecioDisplay()` muestra el valor normalizado en UI. **NUNCA** mezclar — display es para mostrar, normalizado es para guardar.
4. **`buscar_unidades_reales()` retorna `precio_normalizado() AS precio_usd`** — el frontend recibe valores ya normalizados. No volver a normalizar en JS al mostrar resultados de esta RPC.
5. Para queries ad-hoc usar `v_mercado_venta` (ya expone `precio_norm` y `precio_m2`) — ver regla 10.

### Referencia completa

- Documento autoritativo: `docs/arquitectura/TIPO_CAMBIO_SICI.md` — flujo completo portal→extractor→merge→dashboard→query, bugs históricos, TC Binance.
- Deuda técnica resuelta: `obtenerMicrozonas()` y `buscarSiguienteRango()` ya normalizan (migración 177).

## Documentacion Principal

| Proposito | Archivo |
|-----------|---------|
| **Product Brief Simón** | `docs/simon/SIMON_PRODUCT_BRIEF.md` — superficies, estado producción vs construido, capacidades, limitaciones |
| **Simon Broker** | `docs/broker/` — MVP venta + Fase 2 alquileres + v1 protección shortlists en producción (merges `05bc1eb` + `65ccc4b` + `037584b`). Migraciones 228-235. Admin UI `/admin/simon-brokers` + `/admin/simon-brokers/[slug]` (gestión shortlists con suspender/reactivar). Estado, features entregados y pendientes: ver `docs/broker/README.md` |
| **Demo público + Prospección** | Migraciones 236-238. `/broker/demo` + `/b/demo` (canal de prospección sin demo en vivo) y `/admin/prospection` (panel founder con 177 brokers, 3 mensajes WA + 12 respuestas pre-armadas). Ver `docs/broker/PROSPECCION_Y_DEMO.md`. |
| **✅ Contacto Directo B2C (bot) — EN PRODUCCIÓN** | `docs/broker/CONTACTO_DIRECTO_B2C_PLAN.md` — **IMPLEMENTADO y mergeado a `main` (PRs #2/#3/#4, jun 2026).** Las shortlists del bot `simon-asistente` (`/b/[hash]`) contactan al **captador** (`agente_telefono` venta / `agente_whatsapp` alquiler) en vez del broker dueño, vía flag `simon_brokers.contacto_directo` (migración 256, activo solo en ese broker; no afecta B2B). Incluye además: **formato unificado de atribución al captador** en el feed público `/ventas`+`/alquileres` + B2C (`buildAtribucionWaMessage` en `lib/wa-message.ts`: anuncio del portal + "Este contacto llegó por Simón" + `Ref: SIM-V/SIM-P`); botón **"Más opciones"** del header con línea **`ref:v1 <hash> | fav:<ids>`** que el bot parsea (RPC `buscar_similares`, lado bot); **gates largos** (365d / sin cap) para shortlists nuevas del bot. Rollback B2C = `UPDATE simon_brokers SET contacto_directo=false`. Detalle en la memoria `project_plan_contacto_directo_b2c`. |
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Simon Arquitectura** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Metodologia Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| **Zonas Equipetrol** | `docs/canonical/ZONAS_EQUIPETROL.md` — descripción geográfica, perfiles, nombres BD |
| **Proyecto Zona Norte** | `docs/proyectos/zona-norte/` — prototipo de la arquitectura multi-macrozona Simón Santa Cruz (ADR-009). Workflows ZN son universales multi-macrozona, listos para Urubó/Polanco. Strangler pattern: Equipetrol producción NO se toca. Empezar por `README.md` (estado actual) → `DECISIONES.md` (ADRs) → `BACKLOG.md` (tickets) → `BITACORA.md` (cronología) → `operacion.md` (kill-switch). Tool reusable de verificación GPS: `scripts/verify-pm-gps/` (Overpass+Nominatim+HTML, $0). |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| **Alquileres queries** | `docs/canonical/ALQUILERES_QUERIES.md` |
| **Learnings Baseline Equipetrol** | `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md` — decisiones editoriales, metodológicas y de posicionamiento del reporte público trimestral (público dev/inversor, sesgos declarados, pendientes) |
| **Fichas tecnicas proyectos** | `docs/fichas/` — data de desarrollador (inventario, precios, equipamiento) no disponible en portales |
| **Estudios mercado SaaS** | `docs/backlog/ESTUDIOS_MERCADO_SAAS.md` — roadmap producto recurrente. Framework: `scripts/estudio-mercado/` (8 tools + HTML generator, 1 cliente activo) |
| **Sistema TC y precios** | `docs/arquitectura/TIPO_CAMBIO_SICI.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| **Brand Guidelines** | Repo externo `simon-brand` — ver sección "Simon Brand (repo externo)" abajo |
| **Indice migraciones** | `docs/migrations/MIGRATION_INDEX.md` |
| **Backlog calidad datos** | `docs/backlog/CALIDAD_DATOS_BACKLOG.md` |
| **Backlog RLS Supabase** | `docs/backlog/SUPABASE_RLS_BACKLOG.md` — remediación linter; Tier 1 cerrado (DROP `_trash_*` mig 248 + revoke escritura anon mig 249); pendiente arreglo 2 pasos para tablas que el admin escribe con anon |
| **Backlog Image Optimization** | `docs/backlog/IMAGE_OPTIMIZATION_VERCEL.md` — migrar `/_next/image?url=...` a URLs directas del CDN (cerrar gasto Vercel 5k/mes) |
| **Seguridad Supabase (reglas)** | `docs/canonical/SEGURIDAD_SUPABASE.md` — checklists antes de RLS, DROP, API routes, views, funciones RPC |
| **Deuda tecnica** | `docs/backlog/DEUDA_TECNICA.md` |
| **Retención usuarios** | `docs/backlog/RETENCION_USUARIOS.md` — Google OAuth, favoritos BD, alertas email (6 fases) |
| **Casas y Terrenos PRD** | `docs/backlog/CASAS_TERRENOS_PRD.md` — Fases 1-2 completadas, pipeline independiente, feed público pendiente (Fase 3) |
| **Agente Desarrolladoras PRD** | `docs/backlog/AGENTE_DESARROLLADORAS_PRD.md` — Idea de skill/agente para análisis de mercado a desarrolladoras, cruzando SICI + normativas + costos construcción |
| **Meta Pixel & eventos** | `docs/meta/META_PIXEL_EVENTOS.md` — Pixel ID, eventos Tier 1-2 implementados, Tier 3 backlog, CAPI futuro |
| **Producto informe mercado** | `docs/backlog/PRODUCTO_INFORME_MERCADO.md` |
| **Límites data fiduciaria** | `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` — qué puede aseverar Simón y qué no, matriz verde/amarillo/rojo, guía por perfil (comprador vs inversionista) |
| **TC sospechoso criterios** | `docs/canonical/TC_SOSPECHOSO_CRITERIOS.md` — badge "Confirmar tipo de cambio" en /ventas, criterio 28% debajo mediana grupo (factor 0.72, mig 227), cómo modificar |
| **Refactor ventas (completado)** | `docs/refactor/VENTAS_SIMPLIFICADO.md` — bloques 1-7 completados, 5d pendiente |
| **Auditoría UX alquileres (antigua)** | `docs/refactor/AUDITORIA_UX_ALQUILERES.md` — 5 mejoras + 5 insights + 6 debilidades |
| **Auditoría UX mobile alquileres** | `docs/design/UX_AUDIT_MOBILE_ALQUILERES.md` — 7 hallazgos + 8 commits implementados (1 abril 2026) |
| **Como contribuir** | `CONTRIBUTING.md` |
| **Catalogo funciones SQL** | `sql/functions/FUNCTION_CATALOG.md` |
| Auditoria datos ventas | `docs/analysis/AUDITORIA_DATOS_VENTAS.md` |
| Comparativa ventas vs alquileres | `docs/analysis/COMPARATIVA_VENTAS_VS_ALQUILERES.md` |
| Prueba LLM vs Regex ventas | `docs/analysis/PRUEBA_LLM_VS_REGEX_VENTAS.md` |
| **LLM Enrichment Ventas** | `docs/analysis/RESUMEN_EJECUTIVO_LLM_VENTAS.md` |
| Comparativa LLM alq vs venta | `docs/analysis/COMPARATIVA_ALQUILERES_VS_VENTAS_LLM.md` |
| Prompt LLM ventas (activo) | `scripts/llm-enrichment/prompt-ventas.md` (v4.1 interno) |
| **Prompt LLM alquiler (activo)** | `scripts/llm-enrichment/prompt-alquiler-v2.md` — v2.0 con PROYECTOS CONOCIDOS + confianza |
| **Plan matching alquiler** | `docs/backlog/MATCHING_ALQUILER_PLAN.md` — 3 fases, target 95%+ |
| **GA4 eventos** | `docs/meta/GA4_EVENTOS.md` — 32 eventos por página, verificación |
| **Meta Pixel eventos** | `docs/meta/META_PIXEL_EVENTOS.md` — Lead, Contact, ViewContent, Search |
| **Clarity tracking** | `docs/meta/CLARITY_TRACKING.md` — heatmaps, recordings, config |
| **LLM Enrichment README** | `scripts/llm-enrichment/README.md` |
| **GA4 Metrics Script** | `scripts/check_ga4_metrics.py` — consulta GA4 API. Default: retention/PMF (28d). Modos: retention/campaign/ux/overview. Comando: `/metrics` |
| **Performance Learnings** | `docs/performance/PERFORMANCE_LEARNINGS.md` — LCP, INP, tracking GA4, scroll handlers, React.memo, preload |

## Simon Brand (repo externo)

Source of truth de branding: `C:/Users/LUCHO/Desktop/Censo inmobiliario/simon-brand/`
Leer por path absoluto, no copiar. Si hay divergencia con sici, **simon-brand gana**. Tokens ya sincronizados en `simon-mvp/src/lib/simon-design-tokens.ts`.

## Pipeline Nocturno

### Venta (modulo_1)
```
1:00 AM  Discovery C21 + Remax → propiedades_v2
2:00 AM  Enrichment regex → datos_json_enrichment
2:15 AM  Enrichment LLM (Haiku 4.5, prompt v4.1) → llm_output en datos_json_enrichment
3:00 AM  Merge v2.6.0 → campos consolidados + TC paralelo + LLM (dormitorios, estado_construccion, nombre_edificio híbrido, solo_tc_paralelo, es_multiproyecto, tipo_cambio_detectado) + guardrail monoambiente (mig 246: dorms→0 si URL/crudo dice "monoambiente")
4:00 AM  Matching → id_proyecto_master + nombre_edificio (migración 170)
6:00 AM  Verificador venta v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 150/noche)
9:00 AM  Auditoria + Snapshots absorcion
```

### Alquiler
```
1:30 AM  Discovery C21 + Remax
2:30 AM  Discovery Bien Inmuebles + Enrichment LLM (Haiku 4.5, prompt v2.0 + PROYECTOS CONOCIDOS)
3:30 AM  Merge alquiler v1.4.0 (enrichment-first, sin TC paralelo) + guardrail monoambiente (mig 214 + 247: señal en descripcion/URL/crudo discovery)
7:00 AM  Verificador alquiler v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 60/noche)
```

### Casas y Terrenos (pipeline independiente, migracion 221)
```
1:15 AM  Discovery C21 + Remax (tipo_casa + tipo_terreno) → propiedades_v2
2:30 AM  Enrichment casas/terrenos (all-in-one: Firecrawl + Haiku 4.5 + merge ligero)
         - Prompt por tipo: casas v1 (19 campos) / terrenos v1 (11 campos)
         - TC dinamico via obtener_tc_actuales() (Binance)
         - Feature zona_mencionada_en_texto: marca excluida_zona si LLM detecta zona fuera Equipetrol
         - Status → 'completado' (sin matching, sin merge ventas)
```
**Volumen esperado:** ~20 props Equipetrol entre casas+terrenos. NO pasa por flujo_b ni merge ventas.
**Workflows:** `n8n/workflows/casas_terrenos/`

## Estructura Clave

```
sici/
├── sql/functions/       → Funciones SQL canonicas (13 subdirectorios)
│   ├── discovery/       → registrar_discovery
│   ├── enrichment/      → registrar_enrichment
│   ├── merge/           → merge_discovery_enrichment v2.6.0
│   ├── matching/        → matching v3.1 + matchear_alquiler
│   ├── alquiler/        → discovery/enrichment/merge alquiler
│   ├── query_layer/     → buscar_unidades_reales/alquiler/simple, posicion mercado, razon fiduciaria (legacy: funnel premium)
│   ├── snapshots/       → snapshot_absorcion_mercado (global + por zona, con pending)
│   ├── tc_dinamico/     → TC Binance P2P
│   ├── hitl/            → procesar_decision_sin_match, accion excluida, validacion auto-aprobado
│   ├── admin/           → inferir_datos_proyecto, propagar, sincronizar
│   ├── broker/          → buscar_unidades_broker, score, verificar, contacto
│   ├── helpers/         → precio_normalizado, campo_bloqueado, normalize_nombre, vigente
│   └── triggers/        → proteger_amenities, matchear_alquiler, asignar_zona_alquiler
├── sql/migrations/      → migraciones — ver docs/migrations/MIGRATION_INDEX.md
├── scripts/llm-enrichment/  → LLM enrichment: ventas v4.1, alquiler v2.0, casas v1.0, terrenos v1.0
├── geodata/             → microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/        → Discovery, Enrichment, Merge, Verificador (venta)
│   ├── modulo_2/        → Matching, Auditoria, TC dinamico
│   ├── alquiler/        → Pipeline completo alquiler (6 workflows)
│   └── casas_terrenos/  → Pipeline casas/terrenos (discovery C21 + Remax + enrichment all-in-one)
├── docs/                → Documentacion activa + canonical
│   ├── backlog/         → pendientes: calidad datos, deuda tecnica, retencion, matching alquiler
│   ├── canonical/       → docs canonicos: merge, pipeline alquiler, metodologia fiduciaria
│   ├── meta/            → tracking: GA4, Meta Pixel, Clarity
│   ├── refactor/        → planes vivos: VENTAS_SIMPLIFICADO.md (bloques 1-7)
│   ├── analysis/        → auditorias LLM, precios, comparativas
│   ├── fichas/          → data de desarrollador (inventario, precios, equipamiento)
│   ├── clientes/        → documentos por cliente (Condado, Proinco)
│   ├── proyectos/       → proyectos grandes multi-fase (zona-norte/: expansión geográfica)
│   ├── informes/        → correos, cotizaciones, templates
│   └── archive/         → planning, reports, snapshots, specs (archivados en S1)
└── simon-mvp/           → Frontend Next.js (simonbo.com)
    └── src/             → Ver seccion "simon-mvp Arquitectura" abajo
```

## simon-mvp Arquitectura

Refactorizado en S1-S6. Paginas monoliticas descompuestas en tipos + hooks + componentes.

```
simon-mvp/src/
├── types/                        → Interfaces TypeScript
│   ├── propiedad-editor.ts        → FormData, PropiedadOriginal, ProyectoMaster, HistorialEntry, CuotaPago
│   ├── proyecto-editor.ts         → ProyectoFormData, PropiedadVinculada, ProyectoStats, DatosInferidos
│   ├── db-responses.ts            → RawUnidadRealRow, RawUnidadAlquilerRow, RawPropiedadRow (Supabase RPC)
│   └── landing.ts                 → Tipos landing page
├── config/
│   └── propiedad-constants.ts     → MICROZONAS, TIPO_OPERACION, DORMITORIOS, amenidades, equipamiento
├── hooks/
│   ├── usePropertyEditor.ts       → Logica propiedades/[id]: detectarCambios, validar, save, candados, precios
│   ├── useProjectEditor.ts        → Logica proyectos/[id]: fetch, update, inferir, propagar, stats
│   ├── useAdminAuth.ts            → Auth admin (context provider en _app.tsx)
│   └── useBrokerAuth.ts           → Auth broker
├── components/admin/
│   ├── PropertyGallery.tsx        → Galeria fotos + lightbox (propiedades/[id])
│   ├── LockPanel.tsx              → Panel candados slide-out (propiedades/[id])
│   ├── LockIcon.tsx               → Toggle candado individual (compartido)
│   ├── AmenitiesEditor.tsx        → Toggles amenidades + equipamiento (propiedades/[id])
│   ├── PaymentPlanEditor.tsx      → Forma de pago + CRUD cuotas (propiedades/[id])
│   └── PropiedadesVinculadasTable.tsx → Stats + filtros + tabla propiedades (proyectos/[id])
├── components/venta/
│   └── VentaMap.tsx                 → Mapa Leaflet con pins de precio (feed /ventas)
├── lib/                          → principales abajo (+ broker/demo/phone/property-reports/whatsapp/analytics — ver carpeta)
│   ├── supabase.ts                → Cliente Supabase + RPC mappers tipados (db-responses.ts)
│   ├── zonas.ts                   → Constantes zonas, mapeo slug→display, filtros admin/alquiler
│   ├── precio-utils.ts            → normalizarPrecio, TC paralelo
│   ├── format-utils.ts            → dormLabel, formatPriceBob
│   ├── mercado-data.ts            → Fetch datos mercado ventas (getStaticProps)
│   ├── mercado-alquiler-data.ts   → Fetch datos mercado alquileres + yield (getStaticProps)
│   ├── meta-pixel.ts              → fbqTrack() helper — Meta Pixel events (no-op si pixel no cargado)
│   └── informe/                   → Generacion informes PDF (split de api/informe.ts)
│       ├── types.ts                → Propiedad, DatosUsuario, Analisis, LeadData, TemplateData
│       ├── helpers.ts              → fmt, getCategoria, getNegociacion, calcularPrecioReal, zonaDisplay
│       └── template.ts            → generateInformeHTML(data) — template HTML completo
├── pages/admin/                   → Paginas admin (orquestadores delgados post-refactor)
├── pages/api/                     → API routes
├── components/                    → landing-premium/, alquiler/, broker/, filters-premium/, results-premium/, mercado/
└── styles/                        → globals.css, premium-theme.ts
```

### Patron arquitectonico (paginas admin)

Las paginas editores siguen el patron: **tipos → constantes → hook → componentes → pagina orquestadora**

| Pagina | Lineas | Hook | Componentes |
|--------|--------|------|-------------|
| `propiedades/[id]` | ~1,035 | `usePropertyEditor` | Gallery, LockPanel, Amenities, PaymentPlan, LockIcon |
| `proyectos/[id]` | ~1,145 | `useProjectEditor` | PropiedadesVinculadasTable |
| `api/informe` | ~150 | — | informe/types + helpers + template |

## Admin Pages (simon-mvp)

| Ruta | Proposito |
|------|-----------|
| `/admin/login` | Login admin — dos modos: **email + password** (default, 24h sesión) y **magic link** (fallback). Password recovery bypass al rate limit con `simon-mvp/scripts/set-admin-password.mjs` (requiere `SUPABASE_SERVICE_ROLE_KEY` en `.env.local`). Return_to preservado en emailRedirectTo del magic link |
| `/admin/propiedades` | Listado propiedades (venta/alquiler) con filtros |
| `/admin/propiedades/[id]` | Editor propiedad: candados, amenidades, pagos, galeria |
| `/admin/proyectos` | Listado + crear proyectos |
| `/admin/proyectos/[id]` | Editor proyecto: datos, inferir, propagar, tabla propiedades |
| `/admin/brokers` | Gestion brokers B2B (tabla `brokers` legacy captación) |
| `/admin/simon-brokers` | **Gestión brokers MVP Simon Broker** (tabla `simon_brokers`, migración 231). Form crear con checkbox obligatorio de términos (migración 235). |
| `/admin/simon-brokers/[slug]` | **Gestión shortlists del broker** (migración 235): tabla con status/vistas/expiración, suspender/reactivar individual, link a `/b/[hash]` público. APIs `/api/admin/shortlists*`. |
| `/admin/prospection` | **Panel prospección brokers captadores** (migraciones 237+238): outreach a 177 brokers de Equipetrol con 3 mensajes WA secuenciales + tracking + tiers + 12 respuestas pre-armadas en drawer. Tabla `broker_prospection`. APIs `/api/admin/prospection*`. |
| `/admin/supervisor` | Dashboard HITL (contadores) |
| `/admin/supervisor/matching` | Revisar matches pendientes |
| `/admin/supervisor/sin-match` | Asignar proyectos huerfanas |
| `/admin/supervisor/excluidas` | Gestionar excluidas |
| `/admin/supervisor/auto-aprobados` | Revisar auto-aprobaciones matching |
| `/admin/salud` | **Health dashboard sistema** |
| `/admin/market` | **Market Pulse Dashboard (venta)** — KPIs + absorción por zona + serie temporal inventario/absorción (usa `market_absorption_snapshots`, filtrar `zona='global'` para globales) |
| `/admin/market-alquileres` | **Market Pulse Dashboard (alquiler)** |
| `/admin/alquileres` | **Admin alquileres** — cards + inline edit + WA tracking |

## Landing Pages (simon-mvp)

| Ruta | Proposito |
|------|-----------|
| `/` | **Landing Premium** (re-exporta `landing-v2` desde index.tsx) |
| `/landing-v2` | Landing premium directa (negro/crema/oro, minimalista) |
| `/filtros-v2` | **Filtros premium** `[legacy]` (funnel premium dormido) |
| `/formulario-v2` | **Formulario Nivel 2** `[legacy]` (innegociables, deseables, trade-offs — funnel premium dormido) |
| `/resultados-v2` | **Resultados premium** `[legacy]` (scoring MOAT + razón fiduciaria — funnel premium dormido) |
| `/ventas` | **Feed ventas** — cards neutrales, filtros inline, mapa, TikTok mobile (Bloques 1-7) |
| `/alquileres` | **Feed alquileres** |
| `/mercado/equipetrol` | **Mercado hub** — índice ventas + alquileres (Schema.org CollectionPage) |
| `/mercado/equipetrol/ventas` | **Mercado ventas** — precios/m2, zonas, tipologías, tendencias (Article + Dataset + FAQPage) |
| `/mercado/equipetrol/alquileres` | **Mercado alquileres** — rentas Bs, zonas, yield estimado (Article + Dataset + FAQPage) |
| `/condado-vi` | **Landing cliente** Condado VI (estudio de mercado) |
| `/go` | **Launcher personal** — dashboard de links rápidos (público + brokers + admin + clientes + herramientas externas). Mobile-first, noindex. Pensado para "Agregar a pantalla de inicio" del celu. Editable desde array `SECTIONS` en `pages/go.tsx` |

Flujo produccion: `simonbo.com (/) → /ventas` (feed simple). Funnel premium legacy: `/filtros-v2 → /formulario-v2 → /resultados-v2` (accesible por URL directa).

**Flujo alquileres:** `/alquileres` → cards (mobile TikTok / desktop grid) → bottom sheet detalle → WhatsApp broker. El bottom sheet incluye: galería, características, amenidades, descripción, Google Maps, **mini estudio de mercado** (mediana zona+dorms, diff %, rango), **propiedades similares** (scroll horizontal thumbnails, tap para swap), **preguntas seleccionables para el broker** (max 3, se incluyen en mensaje WA), ver anuncio original (gate), sticky footer WA+compartir. Comparativo Express separado accesible desde 2+ favoritos (CompareSheet).

- **Fonts:** Figtree (display) + DM Sans (body) — brand v1.4, DM Mono eliminada
- **Colores:** Arena (#EDE8DC), Negro (#141414), Salvia (#3A6A48) — ver `simon-design-tokens.ts`
- **Google Analytics:** `G-Q8CRRJD6SL` — `simonbo.com?debug=1` desactiva GA
- **Meta Pixel:** `934634159284471` — mismo scope que GA (excluye admin/broker/debug). Eventos: Lead, ViewContent, Search, Contact. Ver `docs/meta/META_PIXEL_EVENTOS.md`

## Broker Pages & API Routes (simon-mvp)

**Broker:** `/broker/login`, `/broker/dashboard`, `/broker/nueva-propiedad`, `/broker/editar/[id]`, `/broker/fotos/[id]`, `/broker/leads`, `/broker/perfil`

**API publicas:** `/api/ventas`, `/api/alquileres`, `/api/razon-fiduciaria` `[legacy: funnel premium]`, `/api/generar-guia`, `/api/informe` (usa lib/informe/), `/api/contactar-broker`, `/api/abrir-whatsapp`, `/api/lead-alquiler`, `/api/lead-gate` (gate "Ver anuncio original" → `leads_gate`), `/api/crear-lead-feedback`, `/api/notify-slack`

**API broker:** `/api/broker/*` — CRUD propiedades, fotos, PDF, CMA, perfil

## Estado Actual

Ver `/admin/salud` para metricas en tiempo real (matching rates, workflow health, contadores).
Ver `docs/backlog/` para pendientes detallados.

## Queries Rapidos

```sql
SELECT status, fuente, COUNT(*) FROM propiedades_v2 GROUP BY 1,2; -- Estado general
SELECT COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as matched,
       COUNT(*) FILTER (WHERE status = 'completado') as total FROM propiedades_v2; -- Matching
```

## Repo Legacy

- `sici-matching/` — funciones SQL que apuntan a tabla deprecada. **NO USAR.**
- `simon-mvp/src/_archive/` — eliminado en refactor S1. Redirects 301 se mantienen en `next.config.js`.
