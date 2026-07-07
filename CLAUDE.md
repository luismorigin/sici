# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching (venta + alquiler)
- Tabla principal: `propiedades_v2` — conteos vivos via `v_mercado_venta` / `v_mercado_alquiler`
- Tabla proyectos: `proyectos_master` (99%+ con GPS)
- Tracking: `workflow_executions` (health check)
- Fuentes: Century21, Remax, Bien Inmuebles

**Casas ZN** (`tipo_propiedad_original='casa'`) — pipeline propio, **aislado del feed de deptos** (0 en `v_mercado_venta`, 0 con `id_proyecto_master`). Cargadas vía **flujo híbrido manual** (`scripts/sonda-suelo/`: discovery/dedup/fetch-contacto/merge + agentes-lectores para el MOAT, con contacto del captador) — NO el n8n viejo de Equipetrol. Condominios en `condominios_master` (FK `id_condominio_master`; matcher `matchear_condominio(lat,lon,nombre)` nombre-primario + GPS). Feed `v_mercado_casas` → `/ventas/casas` **en prod (dark launch/noindex)** + cron de captura `/cron-casas` (`scripts/casas-zn/`, $0 bajo Max). Pendiente: validar → og:image → público. Diseño: `docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md`.
**Casas ZN × ALQUILER** (exploratorio, en curso): prototipo read-only `scripts/casas-zn/muestra-alquiler-zn.mjs` + clasificador `clasificar-uso.mjs` (`uso_inmueble`: residencial/mixto/comercial, expuesto como filtro NO exclusión). Falta pipeline+feed+migración. Ver memoria `project_feed_alquiler_casas_zn_uso`.

## MCP Servers

```json
{ "postgres-sici": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://claude_readonly:***@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"] } }
```

Server oficial Anthropic, **readonly por diseño** (solo tool `query` para SELECT; `claude_readonly` tiene SELECT en todas las tablas — defense in depth). **Mutations (UPDATE/INSERT/DELETE)** no son ejecutables desde el MCP: el patrón canónico es Claude genera el SQL, el humano lo aplica desde Supabase UI o psql.

## n8n Environment Variables

Workflows n8n usan env vars para secrets (NO hardcodear): `SLACK_WEBHOOK_SICI=...`. **Nunca commitear webhooks reales** — Slack los revoca.

## Reglas Criticas

1. **Manual > Automatic** — `campos_bloqueados` SIEMPRE se respetan
2. **Discovery > Enrichment** — para campos físicos (area, dorms, GPS)
3. **propiedades_v2** — ÚNICA tabla activa. `propiedades` es LEGACY
4. **SQL > Regex** — potenciar matching en BD, no extractores
5. **Human-in-the-Loop** — HITL migrado a Admin Dashboard (ya no Google Sheets)
6. **Alquiler aislado** — pipeline alquiler usa funciones PROPIAS (`_alquiler`), NUNCA modificar funciones de venta
7. **pg_get_functiondef() SIEMPRE** — antes de modificar cualquier función SQL, exportar la versión de producción. NUNCA confiar en archivos de migración locales.
8. **Filtros de calidad en estudios** — al consultar props para informes: `duplicado_de IS NULL`, `tipo_propiedad_original NOT IN ('baulera','parqueo','garaje','deposito')`, `(es_multiproyecto = false OR es_multiproyecto IS NULL)` (columna directa, NO `llm_output`), `area_total_m2 >= 20`, `<=300d` venta (730 preventa) / `<=150d` alquiler. Detalle: `docs/reports/FILTROS_CALIDAD_MERCADO.md`
9. **Auditorías de datos** — filtrar primero por los mismos criterios de mercado (`duplicado_de IS NULL`, `status='completado'`). Props que no pasan esos filtros NO son anomalías — ya están excluidas.
10. **Queries de mercado ad-hoc** — SIEMPRE `v_mercado_venta` / `v_mercado_alquiler`. NUNCA filtros canónicos a mano contra `propiedades_v2`. Exponen `precio_m2`, `precio_norm`, `dias_en_mercado` (venta), `precio_mensual` (alquiler). Alquiler: `precio_mensual_bob` (fuente de verdad, display Bs) → `precio_mensual` USD derivado por TC oficial salvo `solo_tc_paralelo=true`; NO es la normalización de venta. Vistas filtran ≤150d (inventario estancado → `propiedades_v2` directo). **NUNCA `precio_usd`.** Detalle TC: `docs/arquitectura/TIPO_CAMBIO_SICI.md`
11. **Días en mercado (venta)** — NUNCA `fecha_discovery` (se pisa con `NOW()` cada noche). Usar `dias_en_mercado` de la vista o `fecha_publicacion` directo (`fecha_creacion` proxy solo si pub NULL).
12. **Absorción de mercado** — `market_absorption_snapshots`, 3 series (`filter_version`): v1 rota, v2 inventario con filtro 300d, v3 limpia (desde 14-abr). Al presentar: declarar versión, v3 necesita ≥90d (antes = "rotación observada" con caveats), absorbida ≠ vendida, NUNCA "meses de inventario" como predicción. Detalle: `docs/canonical/ABSORCION_LIMITACIONES.md`
13. **Seguridad Supabase / RLS** — antes de API routes con Supabase, RLS, DROP, o views/RPC: leer `docs/canonical/SEGURIDAD_SUPABASE.md`. Claves: service_role server-side (nunca anon/`NEXT_PUBLIC_`), rename `_trash_*` antes de DROP, grep+`pg_depend` antes de RLS, views sin `SECURITY DEFINER`. Migraciones que crean tablas/RPC/views en `public` usan `sql/migrations/_template.sql` (GRANT explícitos, obligatorio desde 30-oct por cambio Data API).
14. **Brokers — dos tablas distintas, NUNCA confundir** (ninguna FK entre ellas):
    - `brokers` (legacy B2B captación, no se usa hoy) — admin `/admin/brokers`
    - `simon_brokers` (MVP, mig 231) — `/broker/[slug]` arman shortlists, admin `/admin/simon-brokers`, lib `lib/simon-brokers.ts`
    - `broker_shortlists` + `_items`/`_hearts`/`_views` (228/234/235) + `is_destacada` (239) — lib `lib/broker-shortlists-server.ts`. Detalle: `docs/broker/SHORTLIST_PROTECTION_V1_PLAN.md`
    - `broker_prospection` (237+238) — outreach a captadores, `/admin/prospection`. Ver `docs/broker/PROSPECCION_Y_DEMO.md`
15. **Skills de auditoría feed/cola — costo + confirmación** (changelog en cada `.command.md`; fuente de verdad = `scripts/auditoria-*/` del repo, las skills viven gitignored en `.claude/commands/`):
    - **Mensuales**: `/audit-feed-ventas-mensual` (~$1.75 Firecrawl, **NUNCA sin OK explícito del user en el momento**) + gemela $0 `/audit-feed-ventas-mensual-fetch` (fetcher directo, validada con `/probar-fetcher-ventas`) + `/audit-feed-alquileres-mensual` ($0). Drift portal + capas SQL + detector duplicados (`lib/dup-checks.mjs`). Persisten en `audit_descripciones_*`. Pre-req alquileres: `npm run backfill` 1 vez.
    - **Semanales**: `/audit-feed-ventas-semanal` / `/audit-feed-alquileres-semanal`. $0 sin persistencia, props nuevas en ventana (`--dias`, `--macrozona` default `equipetrol`). Detector TC + candado **formato-objeto** (un string NO protege — merge usa `_is_campo_bloqueado`). Check matching = regex + juez LLM.
    - **`/audit-cola-matching`**: audita la cola (`matching_sugerencias.estado='pendiente_<macrozona>'`) ANTES de aprobar. El `.mjs` filtra/fetchea; **veredicto = subagentes-lectores (juez LLM), NUNCA el script**. SQL read-only (UPDATE + candado `IS NULL`).
    - Memorias TC: `precio_paralelo_vs_oficial_billete`, `feedback_candado_formato_objeto`, `project_bug_tc_flag_paralelo_historico`.

## Zonas Canonicas (6 zonas)

Fuente de verdad: tabla `zonas_geograficas` (7 polígonos PostGIS, 6 nombres únicos). Trigger `trg_asignar_zona_venta` (mig 173) auto-asigna `zona`/`microzona` desde GPS. `get_zona_by_gps(lat,lon)` (mig 185) para ad-hoc. Desde mig 184 los nombres en BD = display definitivos.

| Valor en BD (`p.zona`, `pm.zona`) | Display (`zonas.ts`) |
|---|---|
| `Equipetrol Centro` | Eq. Centro |
| `Equipetrol Norte` | Eq. Norte |
| `Sirari` | Sirari |
| `Villa Brigida` | V. Brigida |
| `Equipetrol Oeste` | Eq. Oeste |
| `Eq. 3er Anillo` | Eq. 3er Anillo |

Conteos: `SELECT zona, COUNT(*) FROM v_mercado_venta GROUP BY zona`. Descripción geográfica + perfiles: `docs/canonical/ZONAS_EQUIPETROL.md`. En queries usar nombres de BD directos (`lib/zonas.ts` mapea BD→display via `displayZona()`/`getZonaLabel()`). Aliases legacy en `zonas.ts`: `Equipetrol`, `Faremafu`, `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Franja`, `Villa Brígida`.

## Sistema de precios — Definiciones

- `precio_usd`: paralelo = USD **billete** (lo que pide el vendedor en físico). Resto = USD directo del listing.
- `tipo_cambio_detectado`: `paralelo`/`oficial`/`no_especificado` (regex desc; merge v2.5.0 upgrade LLM solo `no_especificado`→específico).
- `depende_de_tc`: `true` si el precio depende del TC. `false` = USD real verificado.
- `precio_usd_actualizado`: **DEPRECADO 19-jun** (cron `recalcular-precios-diario` desagendado; superado por `precio_normalizado()` en vivo). Ningún query lo consume.
- `precio_usd_original` (en `datos_json_enrichment`): **NO confiable** (BOB crudo Remax / USD×TC C21). No usar para correcciones automáticas.
- `precio_normalizado()`: precio comparable. Paralelo: `precio_usd × tc_paralelo / 6.96`. Resto: `precio_usd` directo. **SIEMPRE** usar para queries de mercado.

### Reglas fundamentales de precio

1. **`precio_usd` NUNCA directo** para comparar/mostrar/calcular. Siempre `precio_normalizado()` (SQL) o `normalizarPrecio()` (JS).
2. **`precio_normalizado()` es la ÚNICA normalización** — no normalizar antes de guardar. Si el código escribe `precio_usd`, escribe el valor crudo (billete para paralelo, USD directo resto).
3. **Dashboard (`usePropertyEditor.ts`)**: `calcularPrecioNormalizado()` → billete directo a `precio_usd`; `calcularPrecioDisplay()` muestra el normalizado en UI. NUNCA mezclar.
4. **`buscar_unidades_reales()` retorna `precio_normalizado() AS precio_usd`** — frontend recibe valores ya normalizados, no re-normalizar en JS.
5. Para ad-hoc usar `v_mercado_venta` (expone `precio_norm`/`precio_m2`) — regla 10.

Referencia completa: `docs/arquitectura/TIPO_CAMBIO_SICI.md` (flujo portal→extractor→merge→dashboard→query, bugs históricos, TC Binance).

## Documentacion Principal

| Proposito | Archivo |
|-----------|---------|
| **Product Brief Simón** | `docs/simon/SIMON_PRODUCT_BRIEF.md` |
| **Simon Broker** | `docs/broker/README.md` (MVP venta + Fase 2 alquileres + v1 protección shortlists, mig 228-235) |
| **Demo + Prospección** | `docs/broker/PROSPECCION_Y_DEMO.md` (mig 236-238) |
| **Contacto Directo B2C (bot) ✅ PROD** | `docs/broker/CONTACTO_DIRECTO_B2C_PLAN.md` — shortlists del bot `simon-asistente` contactan al captador vía flag `simon_brokers.contacto_directo` (mig 256). Atribución `buildAtribucionWaMessage` en `lib/wa-message.ts`. Rollback = `contacto_directo=false`. Memoria `project_plan_contacto_directo_b2c` |
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Plataforma Híbrida Genérica (visión)** | `docs/arquitectura/PLATAFORMA_HIBRIDA_GENERICA.md` — reemplazar n8n por plataforma genérica (tipo×operación×zona); casas ZN ya producidas por el híbrido |
| **Simon Arquitectura Cognitiva** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Metodología Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| **Zonas Equipetrol** | `docs/canonical/ZONAS_EQUIPETROL.md` |
| **Proyecto Zona Norte** | `docs/proyectos/zona-norte/` — arquitectura multi-macrozona (ADR-009), strangler pattern (Equipetrol prod NO se toca). Empezar por `README.md`→`DECISIONES.md`→`BACKLOG.md`→`BITACORA.md`→`operacion.md`. Tool GPS: `scripts/verify-pm-gps/` |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| **Alquileres queries** | `docs/canonical/ALQUILERES_QUERIES.md` |
| **Learnings Baseline Equipetrol** | `docs/baseline/LEARNINGS_EQUIPETROL_BASELINE.md` |
| **Fichas técnicas proyectos** | `docs/fichas/` — data de desarrollador no disponible en portales |
| **Estudios mercado SaaS** | `docs/backlog/ESTUDIOS_MERCADO_SAAS.md` — framework `scripts/estudio-mercado/` |
| **Sistema TC y precios** | `docs/arquitectura/TIPO_CAMBIO_SICI.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| **Brand Guidelines** | Repo externo `simon-brand` — ver sección abajo |
| **Índice migraciones** | `docs/migrations/MIGRATION_INDEX.md` |
| **Catálogo funciones SQL** | `sql/functions/FUNCTION_CATALOG.md` |
| **Backlogs** | `docs/backlog/`: CALIDAD_DATOS_BACKLOG, DEUDA_TECNICA, RETENCION_USUARIOS, MATCHING_ALQUILER_PLAN, SUPABASE_RLS_BACKLOG, IMAGE_OPTIMIZATION_VERCEL, CRM_CLIENTES_B2C_PLAN, CASAS_TERRENOS_PRD, AGENTE_DESARROLLADORAS_PRD, PRODUCTO_INFORME_MERCADO |
| **Seguridad Supabase (reglas)** | `docs/canonical/SEGURIDAD_SUPABASE.md` |
| **Límites data fiduciaria** | `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` — qué puede aseverar Simón, matriz verde/amarillo/rojo |
| **TC sospechoso criterios** | `docs/canonical/TC_SOSPECHOSO_CRITERIOS.md` — badge /ventas, factor 0.72 (mig 227) |
| **Refactor ventas / UX alquileres** | `docs/refactor/VENTAS_SIMPLIFICADO.md`, `AUDITORIA_UX_ALQUILERES.md`, `docs/design/UX_AUDIT_MOBILE_ALQUILERES.md` |
| **Análisis (LLM/precios/comparativas)** | `docs/analysis/` — AUDITORIA_DATOS_VENTAS, COMPARATIVA_VENTAS_VS_ALQUILERES, PRUEBA_LLM_VS_REGEX_VENTAS, RESUMEN_EJECUTIVO_LLM_VENTAS, COMPARATIVA_ALQUILERES_VS_VENTAS_LLM |
| **Prompts LLM activos** | `scripts/llm-enrichment/` — `prompt-ventas.md` (v4.1), `prompt-alquiler-v2.md` (v2.0), casas/terrenos v1.0; README en la carpeta |
| **Tracking (GA4/Meta/Clarity)** | `docs/meta/` — GA4_EVENTOS, META_PIXEL_EVENTOS, CLARITY_TRACKING |
| **GA4 Metrics Script** | `scripts/check_ga4_metrics.py` (comando `/metrics`) — modos retention/campaign/ux/overview |
| **Performance Learnings** | `docs/performance/PERFORMANCE_LEARNINGS.md` |
| **Cómo contribuir** | `CONTRIBUTING.md` |

## Simon Brand (repo externo)

Source of truth: `C:/Users/LUCHO/Desktop/Censo inmobiliario/simon-brand/`. Leer por path absoluto, no copiar. Si diverge con sici, **simon-brand gana**. Tokens sincronizados en `simon-mvp/src/lib/simon-design-tokens.ts`.

## Pipeline Nocturno

### Venta (modulo_1)
```
1:00  Discovery C21 + Remax → propiedades_v2
2:00  Enrichment regex → datos_json_enrichment
2:15  Enrichment LLM (Haiku 4.5, v4.1) → llm_output
3:00  Merge v2.6.0 → consolidado + TC paralelo + LLM + guardrail monoambiente (mig 246)
4:00  Matching → id_proyecto_master + nombre_edificio (mig 170)
6:00  Verificador venta v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 150/noche)
9:00  Auditoria + Snapshots absorcion
```

### Alquiler
```
1:30  Discovery C21 + Remax
2:30  Discovery Bien Inmuebles + Enrichment LLM (Haiku 4.5, v2.0 + PROYECTOS CONOCIDOS)
3:30  Merge alquiler v1.4.0 (enrichment-first, sin TC paralelo) + guardrail monoambiente (mig 214+247)
7:00  Verificador alquiler v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 60/noche)
```

### Casas y Terrenos (n8n, mig 221) — **DESACTIVADO**
Pipeline n8n Equipetrol-only (discovery 1:15 + enrichment all-in-one 2:30, Firecrawl + Haiku, TC `obtener_tc_actuales()`). **Reemplazado por el flujo híbrido manual de casas ZN** (ver Quick Context) porque no captura contacto ni matchea condominios. **BLINDAJE (21-jun): deptos y casas comparten `propiedades_v2` → cada pipeline filtra por TIPO.** Discovery deptos ZN excluye `tipo_propiedad_original IN ('casa','terreno','lote')`; Equipetrol NO se tocó. Regla TC casas: "7" = oficial. Diseño: `docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md`.

## Estructura Clave

```
sici/
├── sql/functions/   → Funciones SQL canónicas (discovery, enrichment, merge v2.6.0,
│                      matching v3.1, alquiler, query_layer, snapshots, tc_dinamico,
│                      hitl, admin, broker, helpers, triggers) — ver FUNCTION_CATALOG.md
├── sql/migrations/  → ver docs/migrations/MIGRATION_INDEX.md
├── scripts/
│   ├── llm-enrichment/  → ventas v4.1, alquiler v2.0, casas/terrenos v1.0
│   ├── casas-zn/        → cron /cron-casas (reusa sonda-suelo/lib)
│   ├── sonda-suelo/     → flujo híbrido casas ZN
│   ├── auditoria-*/     → skills audit feed/cola (fuente de verdad)
│   └── estudio-mercado/ → framework estudios SaaS
├── geodata/         → microzonas_equipetrol_v4.geojson
├── n8n/workflows/   → modulo_1 (venta), modulo_2 (matching/audit/TC),
│                      alquiler (6 wf), casas_terrenos (DESACTIVADO)
├── docs/            → backlog, canonical, meta, refactor, analysis, fichas,
│                      clientes, proyectos (zona-norte), informes, archive
└── simon-mvp/       → Frontend Next.js (simonbo.com) — ver abajo
```

## simon-mvp Arquitectura

Refactorizado S1-S6: monolitos admin descompuestos en patrón **tipos → constantes → hook → componentes → página orquestadora**.

```
simon-mvp/src/
├── types/        → propiedad-editor, proyecto-editor, db-responses (RPC Supabase), landing
├── config/       → propiedad-constants (MICROZONAS, TIPO_OPERACION, DORMITORIOS, amenidades)
├── hooks/        → usePropertyEditor, useProjectEditor, useAdminAuth (context en _app), useBrokerAuth
├── components/admin/ → PropertyGallery, LockPanel, LockIcon, AmenitiesEditor, PaymentPlanEditor,
│                       PropiedadesVinculadasTable
├── components/venta/ → VentaMap (Leaflet, pins de precio)
├── lib/          → supabase (cliente + RPC mappers), zonas, precio-utils, format-utils,
│                   mercado-data, mercado-alquiler-data, casas (feed casas ZN), meta-pixel,
│                   wa-message, broker-shortlists-server, informe/ (types+helpers+template),
│                   busqueda-natural (parser lenguaje natural $0 sin IA, feeds mobile+desktop),
│                   superficies-data (datos vivos ISR de las superficies /,/sobre-simon,/whatsapp);
│                   + broker/demo/phone/property-reports/whatsapp/analytics
├── pages/admin/  → orquestadores delgados (ver tabla Admin Pages)
├── pages/api/    → API routes (ver Broker Pages & API)
├── components/   → landing-premium, alquiler, broker, filters-premium, results-premium, mercado
└── styles/       → globals.css, premium-theme.ts
```

Editores grandes: `propiedades/[id]` (~1035L, `usePropertyEditor`), `proyectos/[id]` (~1145L, `useProjectEditor`), `api/informe` (~150L, `informe/`).

## Admin Pages

| Ruta | Proposito |
|------|-----------|
| `/admin/login` | email+password (default 24h) + magic link (fallback). Reset: `simon-mvp/scripts/set-admin-password.mjs` (requiere `SUPABASE_SERVICE_ROLE_KEY`) |
| `/admin/propiedades` + `/[id]` | Listado venta/alquiler + editor (candados, amenidades, pagos, galería) |
| `/admin/proyectos` + `/[id]` | Listado/crear + editor (datos, inferir, propagar, tabla props) |
| `/admin/brokers` | Brokers B2B (tabla `brokers` legacy) |
| `/admin/simon-brokers` + `/[slug]` | Brokers MVP (`simon_brokers`, mig 231) + gestión shortlists (mig 235). APIs `/api/admin/shortlists*` |
| `/admin/prospection` | Prospección captadores (`broker_prospection`, mig 237+238). APIs `/api/admin/prospection*` |
| `/admin/supervisor` + `/matching`/`/sin-match`/`/excluidas`/`/auto-aprobados` | Dashboard HITL |
| `/admin/salud` | Health dashboard sistema |
| `/admin/market` + `/market-alquileres` | Market Pulse (usa `market_absorption_snapshots`, `zona='global'` para globales) |
| `/admin/alquileres` | Cards + inline edit + WA tracking |

## Landing Pages

| Ruta | Proposito |
|------|-----------|
| `/` | **Home principal** (switch 7-jul, `index.tsx` sirve `HomePrincipal` de `pages/home.tsx`) — buscador natural que rutea a los feeds filtrados, banda de mercado viva (TC del día), propiedades reales, demos de valor. `/home`→`/` (301). Datos: `lib/superficies-data.ts` (ISR 6h) |
| `/sobre-simon` | **Sobre Simon** — método, principios, qué no promete, roadmap. Indexable |
| `/whatsapp` | **Landing WhatsApp conversacional** — port de la maqueta v6 (chat-héroe animado, dos puertas), fotos reales de Equipetrol (`public/equipetrol-aerea.jpg`, `wa-card-*.jpg`). Indexable |
| `/landing-v2` | Landing Premium anterior (negro/crema/oro) — ya NO es `/`, queda accesible directo |
| `/filtros-v2`, `/formulario-v2`, `/resultados-v2` | Funnel premium `[legacy / dormido]` (su logo sigue apuntando a `/landing-v2` a propósito) |
| `/ventas` | **Feed ventas** — rediseño mobile (ver abajo), buscador inteligente, card limpia, mapa, TikTok mobile |
| `/alquileres` | **Feed alquileres** — mismo rediseño mobile que ventas (ver flujo abajo) |
| `/zona-norte/ventas` + `/alquileres` | Feeds ZN `[dark launch/noindex]` — copia filtrando 14 microzonas ZN (`getMicrozonasZN()`), sin tocar Equipetrol. `lib/mercado-data-zn.ts` / `mercado-alquiler-data-zn.ts`. Memoria `project_feed_zona_norte_aislamiento` |
| `/ventas/casas` | **Feed casas ZN** `[dark launch/noindex]` — sobre `v_mercado_casas` (SSG + client-side). Aislado de deptos. `pages/ventas/casas.tsx` + `lib/casas.ts`. Captura `/cron-casas` |
| `/mercado/equipetrol` (+ `/ventas`, `/alquileres`) | Mercado hub + páginas SEO (Schema.org Article/Dataset/FAQPage) |
| `/condado-vi` | Landing cliente (estudio de mercado) |
| `/go` | Launcher personal (links rápidos, noindex). Editable en array `SECTIONS` de `pages/go.tsx` |

Flujo prod (desde switch 7-jul): `simonbo.com (/) = Home` → buscador natural o accesos rápidos → `/ventas` / `/alquileres`. El logo de los feeds vuelve a `/`. **Superficies públicas** (`/`, `/sobre-simon`, `/whatsapp`) comparten tokens brand v1.4 + `lib/superficies-data.ts`; el buscador de la home usa `construirDestino()` (infiere venta/alquiler por operación explícita → moneda → magnitud de precio ≥20.000=venta) y pasa deep-links a los feeds (`/ventas` lee `?zonas/?dormitorios/?precio_min/?precio_max/?preventa`; `/alquileres` sus equivalentes en Bs). **Alquileres**: cards → bottom sheet (galería, características, amenidades, Google Maps, mini estudio de mercado, props similares, preguntas al broker max 3, ver anuncio original [gate], sticky WA) → WhatsApp broker. Comparativo Express desde 2+ favoritos (CompareSheet).

**Rediseño mobile feeds (7-jul, EN PROD — `feat/mobile-feed-redesign` mergeado)**: ambos feeds (venta+alquiler) comparten el mismo patrón. Ventas = styled-jsx inline (`mc-*`/`mfh-*`/`mt-*`); alquileres = CSS externo `styles/alquileres.css` (`amc-*`/`mfh-*`/`mt-*`). Piezas: **header sticky** (`mfh-*`: logo+perfil+hamburguesa; 2da fila buscador nativo + botón filtros); **buscador inteligente** (`lib/busqueda-natural`, $0 sin IA) también en sidebar desktop (`dsk-search`); **card limpia** (corazón dentro de la foto, tap abre el sheet, sin acciones/descripción — todo lo transaccional en el sheet); **barra fija inferior** (`mt-bottombar`: Ver mapa de la card activa + comparar 0/1/2+ favoritos + limpiar). Regla layout: los hijos del contenido de la card usan `flex-shrink:0` (sin esto, en viewports bajos tipo iPhone SE el flex aplasta el título y lo recorta). **Menú hamburguesa** (`mfd-*`): Preventa (`/ventas?preventa=1`, lector en ventas aplica filtro) · Ventas · Alquileres · *Simulá y calculá* → Comparador de propiedades (abre CompareSheet con 2+ favs) + **Calculadora de renta `[Próximamente]`** + **Crédito hipotecario `[Próximamente]`** · Mercado · Mis favoritos · Hablar por WhatsApp (`SIMON_WHATSAPP`, número de negocio, NO el del fundador). Perfil (`mfp-*`): sin login, "guardá favoritos en este dispositivo". **Pendiente**: isologo oficial (el header usa placeholder arena+punto verde).

- **Fonts:** Figtree (display) + DM Sans (body) — brand v1.4
- **Colores:** Arena #EDE8DC, Negro #141414, Salvia #3A6A48 — `simon-design-tokens.ts`
- **GA:** `G-Q8CRRJD6SL` (`?debug=1` desactiva). **Meta Pixel:** `934634159284471` (mismo scope, excluye admin/broker/debug). Eventos: Lead, ViewContent, Search, Contact.

## Broker Pages & API Routes

**Broker:** `/broker/login`, `/dashboard`, `/nueva-propiedad`, `/editar/[id]`, `/fotos/[id]`, `/leads`, `/perfil`
**API públicas:** `/api/ventas`, `/alquileres`, `/razon-fiduciaria` `[legacy]`, `/generar-guia`, `/informe`, `/contactar-broker`, `/abrir-whatsapp`, `/lead-alquiler`, `/lead-gate`, `/crear-lead-feedback`, `/notify-slack`
**API broker:** `/api/broker/*` — CRUD props, fotos, PDF, CMA, perfil

## Estado Actual

Ver `/admin/salud` (métricas en tiempo real: matching rates, workflow health, contadores) y `docs/backlog/` (pendientes).

```sql
SELECT status, fuente, COUNT(*) FROM propiedades_v2 GROUP BY 1,2; -- Estado general
SELECT COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as matched,
       COUNT(*) FILTER (WHERE status='completado') as total FROM propiedades_v2; -- Matching
```

## Repo Legacy

- `sici-matching/` — funciones SQL a tabla deprecada. **NO USAR.**
- `simon-mvp/src/_archive/` — eliminado en S1. Redirects 301 en `next.config.js`.
