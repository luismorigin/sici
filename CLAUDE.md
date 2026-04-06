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
    "args": ["-y", "@henkey/postgres-mcp-server"],
    "env": {
      "POSTGRES_CONNECTION_STRING": "postgresql://claude_readonly:***@aws-1-sa-east-1.pooler.supabase.com:6543/postgres"
    }
  }
}
```

Usuario `claude_readonly` tiene permisos SELECT en todas las tablas.

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
10. **Queries de mercado ad-hoc** — SIEMPRE usar `v_mercado_venta` o `v_mercado_alquiler` (migración 193, fix 203). NUNCA escribir filtros canónicos a mano contra `propiedades_v2`. Las vistas pre-aplican todos los filtros y exponen `precio_m2`, `precio_norm`, `dias_en_mercado` (venta) y `precio_mensual` = `ROUND(precio_mensual_bob / 6.96, 2)` (alquiler, derivado de BOB — fuente de verdad). En alquiler usar `precio_mensual_bob` para display en Bs, `precio_mensual` para cálculos en USD. NUNCA `precio_usd`.
11. **Días en mercado (venta)** — NUNCA usar `fecha_discovery` para calcular antigüedad. `fecha_discovery` se pisa con `NOW()` cada noche por el pipeline. Usar `dias_en_mercado` de la vista (calcula `CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery)`), o `fecha_publicacion` directo si se consulta `propiedades_v2`. `fecha_creacion` es proxy aceptable solo si `fecha_publicacion` es NULL.

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

- Documento autoritativo: `docs/architecture/TIPO_CAMBIO_SICI.md` — flujo completo portal→extractor→merge→dashboard→query, bugs históricos, TC Binance.
- Deuda técnica resuelta: `obtenerMicrozonas()` y `buscarSiguienteRango()` ya normalizan (migración 177).

## Documentacion Principal

| Proposito | Archivo |
|-----------|---------|
| **Product Brief Simón** | `docs/producto/SIMON_PRODUCT_BRIEF.md` — superficies, estado producción vs construido, capacidades, limitaciones |
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Simon Arquitectura** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Metodologia Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| **Zonas Equipetrol** | `docs/canonical/ZONAS_EQUIPETROL.md` — descripción geográfica, perfiles, nombres BD |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| **Alquileres queries** | `docs/canonical/ALQUILERES_QUERIES.md` |
| **Fichas tecnicas proyectos** | `docs/fichas/` — data de desarrollador (inventario, precios, equipamiento) no disponible en portales |
| **Sistema TC y precios** | `docs/architecture/TIPO_CAMBIO_SICI.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| **Brand Guidelines** | Repo externo `simon-brand` — ver sección "Simon Brand (repo externo)" abajo |
| **Indice migraciones** | `docs/migrations/MIGRATION_INDEX.md` |
| **Backlog calidad datos** | `docs/backlog/CALIDAD_DATOS_BACKLOG.md` |
| **Deuda tecnica** | `docs/backlog/DEUDA_TECNICA.md` |
| **Retención usuarios** | `docs/backlog/RETENCION_USUARIOS.md` — Google OAuth, favoritos BD, alertas email (6 fases) |
| **Meta Pixel & eventos** | `docs/meta/META_PIXEL_EVENTOS.md` — Pixel ID, eventos Tier 1-2 implementados, Tier 3 backlog, CAPI futuro |
| **Producto informe mercado** | `docs/backlog/PRODUCTO_INFORME_MERCADO.md` |
| **Límites data fiduciaria** | `docs/canonical/LIMITES_DATA_FIDUCIARIA.md` — qué puede aseverar Simón y qué no, matriz verde/amarillo/rojo, guía por perfil (comprador vs inversionista) |
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
| Prompt LLM ventas (activo) | `scripts/llm-enrichment/prompt-ventas-v2.md` |
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
3:00 AM  Merge v2.6.0 → campos consolidados + TC paralelo + LLM (dormitorios, estado_construccion, nombre_edificio híbrido, solo_tc_paralelo, es_multiproyecto, tipo_cambio_detectado)
4:00 AM  Matching → id_proyecto_master + nombre_edificio (migración 170)
6:00 AM  Verificador venta v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 150/noche)
9:00 AM  Auditoria + Snapshots absorcion
```

### Alquiler
```
1:30 AM  Discovery C21 + Remax
2:30 AM  Discovery Bien Inmuebles + Enrichment LLM (Haiku 4.5, prompt v2.0 + PROYECTOS CONOCIDOS)
3:30 AM  Merge alquiler (enrichment-first, sin TC paralelo)
7:00 AM  Verificador alquiler v2.0 (pending 2d + audit HTTP: C21 404, Remax 302, 60/noche)
```

## Estructura Clave

```
sici/
├── sql/functions/       → Funciones SQL canonicas (43 archivos, 13 subdirectorios)
│   ├── discovery/       → registrar_discovery
│   ├── enrichment/      → registrar_enrichment
│   ├── merge/           → merge_discovery_enrichment v2.6.0
│   ├── matching/        → matching v3.1 + matchear_alquiler
│   ├── alquiler/        → discovery/enrichment/merge alquiler
│   ├── query_layer/     → buscar_unidades_reales/alquiler/simple, razon fiduciaria, posicion mercado
│   ├── snapshots/       → snapshot_absorcion_mercado (global + por zona, con pending)
│   ├── tc_dinamico/     → TC Binance P2P
│   ├── hitl/            → procesar_decision_sin_match, accion excluida, validacion auto-aprobado
│   ├── admin/           → inferir_datos_proyecto, propagar, sincronizar
│   ├── broker/          → buscar_unidades_broker, score, verificar, contacto
│   ├── helpers/         → precio_normalizado, campo_bloqueado, normalize_nombre, vigente
│   └── triggers/        → proteger_amenities, matchear_alquiler, asignar_zona_alquiler
├── sql/migrations/      → migraciones — ver docs/migrations/MIGRATION_INDEX.md
├── scripts/llm-enrichment/  → LLM enrichment ventas: prompt v4.1 + script test/backfill + README
├── geodata/             → microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/        → Discovery, Enrichment, Merge, Verificador (venta)
│   ├── modulo_2/        → Matching, Auditoria, TC dinamico
│   └── alquiler/        → Pipeline completo alquiler (6 workflows)
├── docs/                → Documentacion activa + canonical
│   ├── backlog/         → pendientes: calidad datos, deuda tecnica, retencion, matching alquiler
│   ├── canonical/       → docs canonicos: merge, pipeline alquiler, metodologia fiduciaria
│   ├── meta/            → tracking: GA4, Meta Pixel, Clarity
│   ├── refactor/        → planes vivos: VENTAS_SIMPLIFICADO.md (bloques 1-7)
│   ├── analysis/        → auditorias LLM, precios, comparativas
│   ├── fichas/          → data de desarrollador (inventario, precios, equipamiento)
│   ├── clientes/        → documentos por cliente (Condado, Proinco)
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
├── lib/
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
| `/admin/login` | Login admin |
| `/admin/propiedades` | Listado propiedades (venta/alquiler) con filtros |
| `/admin/propiedades/[id]` | Editor propiedad: candados, amenidades, pagos, galeria |
| `/admin/proyectos` | Listado + crear proyectos |
| `/admin/proyectos/[id]` | Editor proyecto: datos, inferir, propagar, tabla propiedades |
| `/admin/brokers` | Gestion brokers B2B |
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
| `/filtros-v2` | **Filtros premium** (fondo negro, controles elegantes) |
| `/formulario-v2` | **Formulario Nivel 2** (innegociables, deseables, trade-offs) |
| `/resultados-v2` | **Resultados premium** (fondo crema, cards blancos) |
| `/ventas` | **Feed ventas** — cards neutrales, filtros inline, mapa, TikTok mobile (Bloques 1-7) |
| `/alquileres` | **Feed alquileres** |
| `/mercado/equipetrol` | **Mercado hub** — índice ventas + alquileres (Schema.org CollectionPage) |
| `/mercado/equipetrol/ventas` | **Mercado ventas** — precios/m2, zonas, tipologías, tendencias (Article + Dataset + FAQPage) |
| `/mercado/equipetrol/alquileres` | **Mercado alquileres** — rentas Bs, zonas, yield estimado (Article + Dataset + FAQPage) |
| `/condado-vi` | **Landing cliente** Condado VI (estudio de mercado) |

Flujo produccion: `simonbo.com (/) → /ventas` (feed simple). Funnel premium legacy: `/filtros-v2 → /formulario-v2 → /resultados-v2` (accesible por URL directa).

- **Fonts:** Figtree (display) + DM Sans (body) — brand v1.4, DM Mono eliminada
- **Colores:** Arena (#EDE8DC), Negro (#141414), Salvia (#3A6A48) — ver `simon-design-tokens.ts`
- **Google Analytics:** `G-Q8CRRJD6SL` — `simonbo.com?debug=1` desactiva GA
- **Meta Pixel:** `934634159284471` — mismo scope que GA (excluye admin/broker/debug). Eventos: Lead, ViewContent, Search, Contact. Ver `docs/meta/META_PIXEL_EVENTOS.md`

## Broker Pages & API Routes (simon-mvp)

**Broker:** `/broker/login`, `/broker/dashboard`, `/broker/nueva-propiedad`, `/broker/editar/[id]`, `/broker/fotos/[id]`, `/broker/leads`, `/broker/perfil`

**API publicas:** `/api/ventas`, `/api/alquileres`, `/api/razon-fiduciaria`, `/api/generar-guia`, `/api/informe` (usa lib/informe/), `/api/contactar-broker`, `/api/abrir-whatsapp`, `/api/lead-alquiler`, `/api/lead-gate` (gate "Ver anuncio original" → `leads_gate`), `/api/crear-lead-feedback`, `/api/notify-slack`

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
