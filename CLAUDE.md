# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching (venta + alquiler)
- Tabla principal: `propiedades_v2` (1,002 registros: ~692 venta, ~310 alquiler)
- Tabla proyectos: `proyectos_master` (227 activos, 99.1% con GPS)
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
   - `(es_multiproyecto = false OR es_multiproyecto IS NULL)`, `area_total_m2 >= 20`
   - `<= 300 dias` en mercado para venta (730 para preventa), `<= 150 dias` para alquiler
   - Ver detalle completo en `docs/reports/FILTROS_CALIDAD_MERCADO.md`

## Zonas Canonicas (6 zonas)

Fuente de verdad: tabla `zonas_geograficas` (7 polígonos PostGIS, 6 nombres únicos). Trigger `trg_asignar_zona_venta` (migración 173) auto-asigna `p.zona` y `p.microzona` desde GPS. Función `get_zona_by_gps(lat, lon)` (migración 185) disponible para consultas ad-hoc.

Desde migración 184, los nombres en BD son los nombres display definitivos (ya no hay nombres crudos internos).

| Zona | Valor en BD (`p.zona`, `pm.zona`) | Display corto (`zonas.ts`) | Props activas |
|---|---|---|---|
| Equipetrol Centro | `Equipetrol Centro` | Eq. Centro | ~120 |
| Equipetrol Norte | `Equipetrol Norte` | Eq. Norte | ~26 |
| Sirari | `Sirari` | Sirari | ~44 |
| Villa Brigida | `Villa Brigida` | V. Brigida | ~40 |
| Equipetrol Oeste | `Equipetrol Oeste` | Eq. Oeste | ~32 |
| Eq. 3er Anillo | `Eq. 3er Anillo` | Eq. 3er Anillo | ~3 |

**Nombres legacy (aliases en `zonas.ts` para backwards compatibility):** `Equipetrol`, `Faremafu`, `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Franja`, `Villa Brígida` (con tilde).

**En queries:** Usar nombres de BD directos (columna izquierda). `lib/zonas.ts` mapea BD → display via `displayZona()` y `getZonaLabel()`.

## Sistema de precios — Definiciones

- `precio_usd`: USD reales del listing. No se modifica por TC.
- `tipo_cambio_detectado`: `'paralelo'`, `'oficial'`, o `'no_especificado'`. Detectado de la descripción.
- `depende_de_tc`: `false` para props con precio verificado en USD real. `true` solo para props donde `precio_usd` fue derivado de BOB.
- `precio_usd_actualizado`: Campo interno del módulo TC dinámico. Ningún query de mercado lo consume.
- `precio_normalizado()`: Función que calcula precio comparable. Si paralelo: `precio_usd × tc_paralelo / 6.96`. Si no: `precio_usd` directo. **SIEMPRE** usar esta función para queries de mercado, nunca `precio_usd` directo.

### Regla fundamental

- `precio_usd` = USD reales del listing. **NUNCA** usar directo para comparar, mostrar o calcular métricas.
- Para queries de mercado, informes o estudios: **SIEMPRE** usar `precio_normalizado()` en SQL o `normalizarPrecio()` en JS.
- Para queries ad-hoc: `SELECT precio_normalizado(precio_usd, tipo_cambio_detectado)` — nunca `precio_usd` directo.
- Deuda técnica resuelta: `obtenerMicrozonas()` y `buscarSiguienteRango()` ya normalizan (migración 177).

## Documentacion Principal

| Proposito | Archivo |
|-----------|---------|
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Simon Arquitectura** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Metodologia Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| **Brand Guidelines** | `docs/simon/SIMON_BRAND_GUIDELINES.md` |
| **Indice migraciones** | `docs/migrations/MIGRATION_INDEX.md` |
| **Backlog calidad datos** | `docs/backlog/CALIDAD_DATOS_BACKLOG.md` |
| **Deuda tecnica** | `docs/backlog/DEUDA_TECNICA.md` |
| **Como contribuir** | `CONTRIBUTING.md` |
| **Catalogo funciones SQL** | `sql/functions/FUNCTION_CATALOG.md` |
| Auditoria datos ventas | `docs/analysis/AUDITORIA_DATOS_VENTAS.md` |
| Comparativa ventas vs alquileres | `docs/analysis/COMPARATIVA_VENTAS_VS_ALQUILERES.md` |
| Prueba LLM vs Regex ventas | `docs/analysis/PRUEBA_LLM_VS_REGEX_VENTAS.md` |
| **LLM Enrichment Ventas** | `docs/analysis/RESUMEN_EJECUTIVO_LLM_VENTAS.md` |
| Comparativa LLM alq vs venta | `docs/analysis/COMPARATIVA_ALQUILERES_VS_VENTAS_LLM.md` |
| Prompt LLM ventas | `scripts/llm-enrichment/prompt-ventas-v1.md` |

## Pipeline Nocturno

### Venta (modulo_1)
```
1:00 AM  Discovery C21 + Remax → propiedades_v2
2:00 AM  Enrichment LLM → datos_json_enrichment
         (LLM enrichment Haiku testeado v3.3, pendiente integración n8n — ver RESUMEN_EJECUTIVO_LLM_VENTAS.md)
3:00 AM  Merge → campos consolidados + TC paralelo
4:00 AM  Matching → id_proyecto_master + nombre_edificio (migración 170)
6:00 AM  Verificador ausencias (solo Remax, LIMIT 200)
9:00 AM  Auditoria + Snapshots absorcion
```

### Alquiler
```
1:30 AM  Discovery C21 + Remax
2:30 AM  Discovery Bien Inmuebles + Enrichment LLM
3:30 AM  Merge alquiler (enrichment-first, sin TC paralelo)
7:00 AM  Verificador alquiler
```

## Estructura Clave

```
sici/
├── sql/functions/       → Funciones SQL canonicas (42 archivos, 13 subdirectorios)
│   ├── discovery/       → registrar_discovery
│   ├── enrichment/      → registrar_enrichment
│   ├── merge/           → merge_discovery_enrichment v2.3.0
│   ├── matching/        → matching v3.1 + matchear_alquiler
│   ├── alquiler/        → discovery/enrichment/merge alquiler
│   ├── query_layer/     → buscar_unidades_reales/alquiler, razon fiduciaria, posicion mercado
│   ├── snapshots/       → snapshot_absorcion_mercado
│   ├── tc_dinamico/     → TC Binance P2P
│   ├── hitl/            → procesar_decision_sin_match, accion excluida, validacion auto-aprobado
│   ├── admin/           → inferir_datos_proyecto, propagar, sincronizar
│   ├── broker/          → buscar_unidades_broker, score, verificar, contacto
│   ├── helpers/         → precio_normalizado, campo_bloqueado, normalize_nombre, vigente
│   └── triggers/        → proteger_amenities, matchear_alquiler, asignar_zona_alquiler, asignar_zona_venta
├── sql/migrations/      → migraciones (001-173) — ver docs/migrations/MIGRATION_INDEX.md
├── scripts/llm-enrichment/  → Script test LLM ventas + prompt v3.3 + output tests
├── geodata/             → microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/        → Discovery, Enrichment, Merge, Verificador (venta)
│   ├── modulo_2/        → Matching, Auditoria, TC dinamico
│   └── alquiler/        → Pipeline completo alquiler (6 workflows)
├── docs/                → Documentacion activa + canonical
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
├── lib/
│   ├── supabase.ts                → Cliente Supabase + RPC mappers tipados (db-responses.ts)
│   ├── zonas.ts                   → Constantes zonas, mapeo slug→display, filtros admin/alquiler
│   ├── precio-utils.ts            → normalizarPrecio, TC paralelo
│   ├── format-utils.ts            → dormLabel, formatPriceBob
│   └── informe/                   → Generacion informes PDF (split de api/informe.ts)
│       ├── types.ts                → Propiedad, DatosUsuario, Analisis, LeadData, TemplateData
│       ├── helpers.ts              → fmt, getCategoria, getNegociacion, calcularPrecioReal, zonaDisplay
│       └── template.ts            → generateInformeHTML(data) — template HTML completo
├── pages/admin/                   → Paginas admin (orquestadores delgados post-refactor)
├── pages/api/                     → API routes
├── components/                    → landing-premium/, alquiler/, broker/, filters-premium/, results-premium/
└── _archive/                      → Legacy v1 (excluido de build via tsconfig.json, redirects 301)
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
| `/admin/market` | **Market Pulse Dashboard (venta)** |
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
| `/alquileres` | **Feed alquileres** |

Flujo produccion: `simonbo.com (/) → /filtros-v2 → /formulario-v2 → /resultados-v2`

- **Fonts:** Cormorant Garamond (display) + Manrope (body)
- **Colores:** Negro (#0a0a0a), Crema (#f8f6f3), Oro (#c9a959)
- **Google Analytics:** `G-Q8CRRJD6SL` — `simonbo.com?debug=1` desactiva GA

## Broker Pages & API Routes (simon-mvp)

**Broker:** `/broker/login`, `/broker/dashboard`, `/broker/nueva-propiedad`, `/broker/editar/[id]`, `/broker/fotos/[id]`, `/broker/leads`, `/broker/perfil`

**API publicas:** `/api/alquileres`, `/api/razon-fiduciaria`, `/api/generar-guia`, `/api/informe` (usa lib/informe/), `/api/contactar-broker`, `/api/abrir-whatsapp`, `/api/lead-alquiler`, `/api/crear-lead-feedback`, `/api/notify-slack`

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
- `simon-mvp/src/_archive/` — 12 paginas v1 + componentes huerfanos. Excluidos de build via `tsconfig.json`. Redirects 301 en `next.config.js`.
