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

## Reglas Críticas

1. **Manual > Automatic** - `campos_bloqueados` SIEMPRE se respetan
2. **Discovery > Enrichment** - Para campos físicos (area, dorms, GPS)
3. **propiedades_v2** - ÚNICA tabla activa. `propiedades` es LEGACY
4. **SQL > Regex** - Potenciar matching en BD, no extractores
5. **Human-in-the-Loop** - Sistema HITL migrado a Admin Dashboard (ya no usa Google Sheets)
6. **Alquiler aislado** - Pipeline alquiler usa funciones PROPIAS (`_alquiler`), NUNCA modificar funciones de venta
7. **pg_get_functiondef() SIEMPRE** - Antes de modificar cualquier función SQL, exportar la versión actual de producción. NUNCA confiar en archivos de migración locales.
8. **Filtros de calidad en estudios de mercado** - SIEMPRE aplicar al consultar propiedades para informes:
   - `duplicado_de IS NULL`, `tipo_propiedad_original NOT IN ('baulera','parqueo','garaje','deposito')`
   - `(es_multiproyecto = false OR es_multiproyecto IS NULL)`, `area_total_m2 >= 20`
   - `<= 300 días` en mercado para venta (730 para preventa), `<= 150 días` para alquiler
   - Ver detalle completo en `docs/reports/FILTROS_CALIDAD_MERCADO.md`

## Zonas Canónicas (5 zonas)

La fuente de verdad geográfica es `microzona` (asignada por PostGIS). La columna `zona` fue normalizada para venta (migración 131) pero NO para alquiler.

| Zona canónica | microzona(s) en BD | zona en venta (pm.zona) | zona en alquiler (p.zona) |
|---|---|---|---|
| Equipetrol Centro | `Equipetrol` | `Equipetrol Centro` | `Equipetrol`, `Equipetrol Centro` |
| Equipetrol Norte | `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur` | `Equipetrol Norte` | `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Norte` |
| Sirari | `Sirari` | `Sirari` | `Sirari` |
| Villa Brígida | `Villa Brigida` | `Villa Brígida` | `Villa Brigida` |
| Equipetrol Oeste | `Faremafu` | `Equipetrol Oeste` | `Faremafu` |

**Ignorar:** `Equipetrol Franja` — zona marginal con pocas propiedades.

**En queries de alquiler:** Usar la expansión de `buscar_unidades_alquiler()` que mapea slugs UI → nombres sucios de BD.
**En queries de venta:** Usar `pm.zona` directamente (ya normalizada a 5 nombres limpios).

## Documentación Principal

| Propósito | Archivo |
|-----------|---------|
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Simón Arquitectura** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Metodología Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| **Brand Guidelines** | `docs/simon/SIMON_BRAND_GUIDELINES.md` |
| **Índice migraciones** | `docs/migrations/MIGRATION_INDEX.md` |
| **Backlog calidad datos** | `docs/backlog/CALIDAD_DATOS_BACKLOG.md` |
| **Deuda técnica** | `docs/backlog/DEUDA_TECNICA.md` |
| Docs archivados | `docs/archive/implementado/`, `docs/archive/obsoleto/` |

## Pipeline Nocturno

### Venta (modulo_1)
```
1:00 AM  Discovery C21 + Remax → propiedades_v2
2:00 AM  Enrichment LLM → datos_json_enrichment
3:00 AM  Merge → campos consolidados + TC paralelo
4:00 AM  Matching → id_proyecto_master
6:00 AM  Verificador ausencias (solo Remax, LIMIT 200)
9:00 AM  Auditoría + Snapshots absorción
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
├── sql/functions/       → Funciones SQL canónicas (42 archivos, 13 subdirectorios)
│   ├── discovery/       → registrar_discovery
│   ├── enrichment/      → registrar_enrichment
│   ├── merge/           → merge_discovery_enrichment v2.3.0
│   ├── matching/        → matching v3.1 + matchear_alquiler
│   ├── alquiler/        → discovery/enrichment/merge alquiler
│   ├── query_layer/     → buscar_unidades_reales/alquiler, razón fiduciaria, posición mercado
│   ├── snapshots/       → snapshot_absorcion_mercado
│   ├── tc_dinamico/     → TC Binance P2P
│   ├── hitl/            → procesar_decision_sin_match, acción excluida, validación auto-aprobado
│   ├── admin/           → inferir_datos_proyecto, propagar, sincronizar
│   ├── broker/          → buscar_unidades_broker, score, verificar, contacto
│   ├── helpers/         → precio_normalizado, campo_bloqueado, normalize_nombre, vigente
│   └── triggers/        → proteger_amenities, matchear_alquiler, asignar_zona
├── sql/migrations/      → 171 migraciones (001–169) — ver docs/migrations/MIGRATION_INDEX.md
├── geodata/             → microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/        → Discovery, Enrichment, Merge, Verificador (venta)
│   ├── modulo_2/        → Matching, Auditoría, TC dinámico
│   └── alquiler/        → Pipeline completo alquiler (6 workflows)
├── docs/                → Documentación activa + canonical
└── simon-mvp/           → Frontend Next.js (simonbo.com)
    └── src/_archive/    → 12 legacy pages + componentes huérfanos (excluidos de build)
```

## Admin Pages (simon-mvp)

| Ruta | Propósito |
|------|-----------|
| `/admin/propiedades` | Editor propiedades con candados |
| `/admin/proyectos` | Listado + crear proyectos |
| `/admin/proyectos/[id]` | Editor proyecto individual |
| `/admin/brokers` | Gestión brokers B2B |
| `/admin/supervisor` | Dashboard HITL (contadores) |
| `/admin/supervisor/matching` | Revisar matches pendientes |
| `/admin/supervisor/sin-match` | Asignar proyectos huérfanas |
| `/admin/supervisor/excluidas` | Gestionar excluidas |
| `/admin/supervisor/auto-aprobados` | Revisar auto-aprobaciones matching |
| `/admin/salud` | **Health dashboard sistema** |
| `/admin/market` | **Market Pulse Dashboard (venta)** |
| `/admin/market-alquileres` | **Market Pulse Dashboard (alquiler)** |
| `/admin/alquileres` | **Admin alquileres** — cards + inline edit + WA tracking |

## Landing Pages (simon-mvp)

| Ruta | Propósito |
|------|-----------|
| `/` | **Landing Premium** (re-exporta `landing-v2` desde index.tsx) |
| `/landing-v2` | Landing premium directa (negro/crema/oro, minimalista) |
| `/filtros-v2` | **Filtros premium** (fondo negro, controles elegantes) |
| `/formulario-v2` | **Formulario Nivel 2** (innegociables, deseables, trade-offs) |
| `/resultados-v2` | **Resultados premium** (fondo crema, cards blancos) |
| `/alquileres` | **Feed alquileres** |

Flujo producción: `simonbo.com (/) → /filtros-v2 → /formulario-v2 → /resultados-v2`

> **Legacy archivado (Fase 8):** 12 páginas v1 movidas a `src/_archive/pages/` con 301 redirects en `next.config.js`.
> Componentes huérfanos (landing/, pro/, FilterBar, useForm, formQuestions, etc.) en `src/_archive/`.

### Landing Premium
- **Fonts:** Cormorant Garamond (display) + Manrope (body)
- **Colores:** Negro (#0a0a0a), Crema (#f8f6f3), Oro (#c9a959)
- **Componentes:** `/components/landing-premium/`

### Analytics
- **Google Analytics:** `G-Q8CRRJD6SL` — configurado en `_app.tsx`
- **Debug mode:** `simonbo.com?debug=1` desactiva GA (persiste en localStorage), `?debug=0` reactiva

## Broker Pages (simon-mvp)

| Ruta | Propósito |
|------|-----------|
| `/broker/login` | Login broker (email + código) |
| `/broker/dashboard` | Listado propiedades + botón PDF |
| `/broker/nueva-propiedad` | Crear nueva propiedad |
| `/broker/editar/[id]` | Editar propiedad |
| `/broker/fotos/[id]` | Gestión fotos propiedad |
| `/broker/leads` | Listado leads recibidos |
| `/broker/perfil` | Subir foto/logo + datos contacto |

## API Routes (simon-mvp)

| Ruta | Propósito |
|------|-----------|
| `/api/alquileres` | Feed alquileres (buscar_unidades_alquiler) |
| `/api/razon-fiduciaria` | Generar razón fiduciaria por propiedad |
| `/api/generar-guia` | Generar guía fiduciaria (Claude API) |
| `/api/informe` | Generar informe PDF |
| `/api/contactar-broker` | Contactar broker desde resultados |
| `/api/abrir-whatsapp` | Tracking apertura WhatsApp |
| `/api/lead-alquiler` | Registrar lead de alquiler |
| `/api/crear-lead-feedback` | Crear lead con feedback |
| `/api/notify-slack` | Enviar notificación a Slack |
| `/api/broker/create-propiedad` | CRUD propiedades broker |
| `/api/broker/update-propiedad` | Actualizar propiedad broker |
| `/api/broker/delete-propiedad` | Eliminar propiedad broker |
| `/api/broker/buscar-proyectos` | Buscar proyectos para matching |
| `/api/broker/generate-pdf` | Generar PDF propiedad |
| `/api/broker/generate-cma` | Generar CMA (análisis mercado) |
| `/api/broker/manage-fotos` | CRUD fotos propiedad |
| `/api/broker/update-profile` | Actualizar perfil broker |

## Estado Actual (28 Feb 2026)

### Completado
- **Pipeline venta:** Discovery → Enrichment → Merge → Matching nocturno (86.2% matching, 350/406 completadas)
- **Pipeline alquiler matching:** 91.2% (166/182 completadas)
- **Pipeline alquiler:** 6 workflows n8n activos, 3 fuentes (C21, Remax, Bien Inmuebles)
- **HITL completo:** Matching supervisor, Sin Match, Excluidas — todo en Admin Dashboard
- **Query Layer:** buscar_unidades_reales/alquiler(), generar_razon_fiduciaria(), calcular_posicion_mercado()
- **Market Snapshots:** Absorción, precios, renta, ROI por tipología (tabla market_absorption_snapshots)
- **Sistema Broker B2B:** Tablas, búsqueda, PDF profesional, score calidad, portal broker
- **Admin Dashboards:** Propiedades, Proyectos, Salud, Market Pulse, Supervisor HITL, Alquileres
- **TC Dinámico:** Binance P2P integrado + precio_normalizado() helper
- **Deduplicación:** Sistema duplicado_de activo
- **Amenities:** 69 campos extraídos + candados

### Pendiente
- **Broker Fase 5-7:** Portal broker avanzado, sistema leads, CMA
- **Enriquecimiento IA proyectos** (15 sin desarrollador asignado)
- **Validación GPS** (workflow validador Google Places)
- Ver backlogs detallados en `docs/backlog/`

## Queries Rápidos

```sql
-- Estado general
SELECT status, fuente, COUNT(*) FROM propiedades_v2 GROUP BY 1,2;

-- Tasa de matching
SELECT
    COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as con_proyecto,
    COUNT(*) FILTER (WHERE status = 'completado') as completadas,
    ROUND(100.0 * COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) /
          NULLIF(COUNT(*) FILTER (WHERE status = 'completado'), 0), 1) as tasa
FROM propiedades_v2;

-- Proyectos activos
SELECT COUNT(*) FROM proyectos_master WHERE activo;
```

## Repo Legacy

- `sici-matching/` — funciones SQL que apuntan a tabla deprecada. **NO USAR.**
- `simon-mvp/src/_archive/` — 12 páginas v1 + 20 componentes/hooks/data huérfanos. Excluidos de build via `tsconfig.json`. Redirects 301 en `next.config.js`.
