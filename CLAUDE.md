# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching (venta + alquiler)
- Tabla principal: `propiedades_v2` (775 registros: ~555 venta, ~220 alquiler)
- Tabla proyectos: `proyectos_master` (187 activos, 98.9% con GPS)
- Tracking: `workflow_executions` (health check)
- Tasa de matching: **100%** (312/312 completadas) ✅

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

**Configurar en n8n:**
1. Settings → Environment Variables
2. Agregar `SLACK_WEBHOOK_SICI` con el webhook de Slack
3. En los nodos HTTP, usar `={{ $env.SLACK_WEBHOOK_SICI }}`

**IMPORTANTE:** Nunca commitear webhooks reales a GitHub - Slack los revoca automáticamente.

## Reglas Críticas

1. **Manual > Automatic** - `campos_bloqueados` SIEMPRE se respetan
2. **Discovery > Enrichment** - Para campos físicos (area, dorms, GPS)
3. **propiedades_v2** - ÚNICA tabla activa. `propiedades` es LEGACY
4. **SQL > Regex** - Potenciar matching en BD, no extractores
5. **Human-in-the-Loop** - Sistema HITL migrado a Admin Dashboard (ya no usa Google Sheets)
6. **Alquiler aislado** - Pipeline alquiler usa funciones PROPIAS (`_alquiler`), NUNCA modificar funciones de venta
7. **Filtros de calidad en estudios de mercado** - SIEMPRE aplicar al consultar propiedades para informes, análisis o comparativos:
   - `duplicado_de IS NULL` (sin duplicados)
   - `tipo_propiedad_original NOT IN ('baulera','parqueo','garaje','deposito')`
   - `(es_multiproyecto = false OR es_multiproyecto IS NULL)`
   - `area_total_m2 >= 20`
   - `<= 300 días` en mercado para venta (730 para preventa)
   - `<= 150 días` en mercado para alquiler (vida mediana: C21 34d, Remax 73d)
   - Ver detalle completo en `docs/reports/FILTROS_CALIDAD_MERCADO.md`
   - Ver sección **Zonas Canónicas** abajo para mapeo completo

## Zonas Canónicas (5 zonas)

La fuente de verdad geográfica es `microzona` (asignada por PostGIS). La columna `zona` fue normalizada para venta (migración 131) pero NO para alquiler.

| Zona canónica | microzona(s) en BD | zona en venta (pm.zona) | zona en alquiler (p.zona) |
|---|---|---|---|
| Equipetrol Centro | `Equipetrol` | `Equipetrol Centro` | `Equipetrol`, `Equipetrol Centro` |
| Equipetrol Norte | `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur` | `Equipetrol Norte` | `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Norte` |
| Sirari | `Sirari` | `Sirari` | `Sirari` |
| Villa Brígida | `Villa Brigida` | `Villa Brígida` | `Villa Brigida` |
| Equipetrol Oeste | `Faremafu` | `Equipetrol Oeste` | `Faremafu` |

**Ignorar:** `Equipetrol Franja` — zona marginal con pocas propiedades, no se incluye en filtros ni reportes.

**En queries de alquiler:** Usar la expansión de `buscar_unidades_alquiler()` que mapea slugs UI → nombres sucios de BD.
**En queries de venta:** Usar `pm.zona` directamente (ya normalizada a 5 nombres limpios).

## Documentación Principal

| Propósito | Archivo |
|-----------|---------|
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **Simón Arquitectura** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Simón Formularios** | `docs/simon/formularios/BLOQUE_2_FORM_*.md` |
| **Formulario MVP 2 Niveles** | `docs/simon/formularios/FORM_VIVIENDA_MVP.md` |
| **Metodología Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Beta Feedback System** | `docs/simon/BETA_FEEDBACK_SYSTEM_PLAN.md` |
| **Sistema Broker B2B** | `docs/simon/SIMON_BROKER_SYSTEM.md` |
| **Broker Handoff Original** | `docs/simon/broker/BROKER_HANDOFF_ORIGINAL.md` |
| **Broker Roadmap Refinado** | `docs/simon/broker/BROKER_ROADMAP_REFINADO.md` |
| **Brand Guidelines** | `docs/simon/SIMON_BRAND_GUIDELINES.md` |
| **Prompt LLM Alquiler** | `docs/alquiler/LLM_ENRICHMENT_PROMPT.md` |
| **Pipeline Alquiler Canonical** | `docs/canonical/pipeline_alquiler_canonical.md` |
| **Learnings Alquiler** | `docs/alquiler/LEARNINGS_PIPELINE_ALQUILER.md` |
| **Monetización Alquileres** | `docs/planning/PLAN_MONETIZACION_ALQUILERES.md` |
| **Lanzamiento Alquileres** | `docs/planning/PLAN_LANZAMIENTO_ALQUILERES.md` |
| **Filtros Calidad Mercado** | `docs/reports/FILTROS_CALIDAD_MERCADO.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| Spec Auditoría | `docs/modulo_2/AUDITORIA_DIARIA_SPEC.md` |
| **Bitácora Snapshots Feb 2026** | `docs/modulo_2/BITACORA_SNAPSHOTS_FEB_2026.md` |
| Backlog TC Paralelo | `docs/backlog/FIX_TC_PARALELO_EXTRACTORES.md` |
| N8N Workflows Alquiler | `docs/alquiler/N8N_WORKFLOWS_ALQUILER.md` |
| Admin Dashboard Alquiler | `docs/alquiler/ADMIN_DASHBOARD_ALQUILER.md` |
| Fuente Bien Inmuebles | `docs/alquiler/FUENTE_BIEN_INMUEBLES.md` |
| Docs archivados (implementados) | `docs/archive/implementado/` |
| Docs archivados (obsoletos) | `docs/archive/obsoleto/` |

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
| `/admin/salud` | **Health dashboard sistema** |
| `/admin/market` | **Market Pulse Dashboard** - inteligencia mercado |

## Landing Pages (simon-mvp)

| Ruta | Propósito |
|------|-----------|
| `/` | **Landing Premium** (re-exporta `landing-v2` desde index.tsx) |
| `/landing-v2` | Landing premium directa (negro/crema/oro, minimalista) |
| `/filtros-v2` | **Filtros premium** (fondo negro, controles elegantes) |
| `/formulario-v2` | **Formulario Nivel 2** (innegociables, deseables, trade-offs) |
| `/resultados-v2` | **Resultados premium** (fondo crema, cards blancos) |

> **Nota:** `simonbo.com` muestra la landing premium. `index.tsx` re-exporta `landing-v2`.

### Flujo Premium Completo (Producción)

```
simonbo.com (/) → /filtros-v2 → /formulario-v2 → /resultados-v2
```

### Landing Premium

Diseño luxury alternativo con:
- **Fonts:** Cormorant Garamond (display) + Manrope (body)
- **Colores:** Negro (#0a0a0a), Crema (#f8f6f3), Oro (#c9a959)
- **Componentes:** `/components/landing-premium/`
- **Datos en vivo:** Propiedades, proyectos, TC paralelo, microzonas desde Supabase

### Analytics

- **Google Analytics:** `G-Q8CRRJD6SL`
- **Configurado en:** `_app.tsx` (todas las páginas)
- **Dashboard:** [analytics.google.com](https://analytics.google.com)
- **Debug mode (no contaminar data):**
  - `simonbo.com?debug=1` → desactiva GA, persiste en localStorage
  - `simonbo.com?debug=0` → reactiva GA
  - Funciona en todas las páginas una vez activado en ese navegador

## Broker Pages (simon-mvp)

| Ruta | Propósito |
|------|-----------|
| `/broker/login` | Login broker (email + código) |
| `/broker/dashboard` | Listado propiedades + botón PDF |
| `/broker/nueva-propiedad` | Crear nueva propiedad |
| `/broker/editar/[id]` | Editar propiedad |
| `/broker/leads` | Listado leads recibidos |
| `/broker/perfil` | **Subir foto/logo + datos contacto** |

## Estructura Clave

```
sici/
├── sql/functions/
│   ├── discovery/     # registrar_discovery.sql
│   ├── enrichment/    # registrar_enrichment.sql
│   ├── merge/         # merge_discovery_enrichment.sql v2.2.0
│   └── matching/      # Funciones v3.1 (propiedades_v2)
│   └── alquiler/      # registrar_discovery/enrichment_alquiler, merge_alquiler
├── sql/migrations/    # 001-140 (FK, microzonas, HITL, tracking, TC, KG, MVP Simón, Amenities, Broker B2B, Admin, Landing, PDF, CMA, Alquiler, Snapshots)
├── geodata/           # microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/      # Flujos A, B, C, Merge (producción - venta)
│   ├── modulo_2/      # Matching, Supervisores, Sin Match, Auditoría
│   └── alquiler/      # Discovery C21/Remax/BienInmuebles, Enrichment, Merge (producción - alquiler)
└── docs/
    ├── arquitectura/  # SICI_ARQUITECTURA_MAESTRA.md
    ├── canonical/     # Metodología fiduciaria, merge, discovery
    ├── planning/      # MVP spec, Knowledge Graph plans
    ├── simon/         # Arquitectura cognitiva + formularios
    └── modulo_2/      # Specs matching pipeline
```

## Estado Actual (11 Feb 2026)

### ✅ Completado
- **Módulo 1:** Pipeline nocturno operativo (Discovery, Enrichment, Merge)
- **Módulo 2 FASE 1:** Matching Nocturno v3.1 funcionando
- **Módulo 2 FASE 2:** Human-in-the-Loop completo
  - Matching Supervisor: APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO
  - Supervisor Sin Match: ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO
  - **Supervisor Excluidas:** CORREGIR, ACTIVAR, EXCLUIR, ELIMINAR (migración 023)
- **Módulo 2 FASE 5:** Pipeline activado (4 AM matching, 8 PM supervisores)
- **Auditoría v2.8:** Health check + alertas (huérfanas >5%, sin desarrollador >10%)
- **TC Dinámico:** Binance P2P integrado (00:00 AM, historial de precios)
- **Status Pipeline:** Nuevo status `excluido_operacion` para alquiler/anticrético
- **Limpieza Datos:** Auditoría Sky Properties + corrección GPS (100% matching)
- **Fuzzy Matching:** pg_trgm + normalize_nombre() + buscar_proyecto_fuzzy() (migración 022)
- **MVP Simón Backend:** buscar_unidades_reales() v2.18, generar_razon_fiduciaria(), calcular_posicion_mercado() (migraciones 025-052)
- **Fix Data SANTORINI:** 22 parqueos/bauleras reclasificados + GPS corregido + duplicados marcados (migraciones 027, 049-051)
- **Formulario MVP:** Arquitectura 2 niveles (8 campos quick search + 10 campos fiduciario)
- **Filtro estado_entrega MOAT:** 3 opciones claras (entrega_inmediata, solo_preventa, no_importa) - migración 052
- **Deduplicación:** Sistema duplicado_de activo, 36 registros marcados como duplicados
- **Fix TC Paralelo:** Bug merge v2.2.0 + retroactivo 13 props + vista monitoreo (migración 059)
- **Enriquecimiento Amenities:** 69 campos extraídos de descripciones (45 equipamiento + 24 amenities), con candados (migración 064)
- **Auditoría Baños:** 14 propiedades corregidas con `campos_bloqueados`, 17 pendientes de revisión manual
- **Sistema Broker B2B (Fases 1-4):** Tablas broker, propiedades_broker, buscar_unidades_broker(), UI integrada (migraciones 070-074)
- **Piso + Forma de Pago:** 6 columnas directas + buscar_unidades_reales() v2.25 + editor admin (migraciones 081-082)
- **Parqueo/Baulera Precio:** 4 columnas (incluido + precio_adicional) + buscar_unidades_reales() v2.26 (migraciones 083-084)
- **Admin Dashboard Propiedades:** Editor visual completo con validaciones de seguridad, indicadores precio sospechoso, sistema candados (migración 077)
- **Iconos Resultados:** Símbolos mejorados en resultsV2 (🛏️🚿📐🏢🚗📦) + leyenda colapsable + badges forma pago
- **Admin Proyectos Master:** Listado + editor con estado construcción, fecha entrega, amenidades edificio, propagación a propiedades (migraciones 085-086)
- **Inferir Datos Proyecto:** Función inferir_datos_proyecto() con amenidades frecuentes (≥50%) y opcionales (<50%), adoptar fotos (migración 086-087)
- **Landing Market Lens en Vivo:** Permisos anon para datos reales (TC, snapshots, métricas) + detección bajadas precio desde precios_historial (migraciones 089-090)
- **Fix Discovery Candados Admin:** registrar_discovery() ahora soporta formato nuevo de candados `{"campo": {"bloqueado": true, ...}}`
- **Supervisor HITL Admin:** Migración completa de Google Sheets a admin dashboard
  - `/admin/supervisor/matching` - Aprobar, rechazar, corregir matches
  - `/admin/supervisor/sin-match` - Asignar proyectos a huérfanas
  - `/admin/supervisor/excluidas` - Gestionar propiedades excluidas
- **Desarrolladores Master:** Tabla normalizada `desarrolladores` + FK desde proyectos_master + autocomplete en UI (migración 088)
- **GPS → Zona Auto-detección:** Al crear/editar proyectos, detecta zona automáticamente desde coordenadas GPS
- **Dashboard Salud Sistema:** `/admin/salud` con métricas en tiempo real:
  - Inventario, calidad datos, matching, colas HITL
  - TC Dinámico (paralelo/oficial)
  - Health check workflows con horarios programados
- **Market Pulse Dashboard:** `/admin/market` - inteligencia de mercado inmobiliario
  - KPIs: unidades, proyectos, precio/m², ticket, área, TC
  - Gráficos: distribución dormitorios, preventa vs entrega, zonas
  - Históricos: evolución inventario 28d, TC paralelo
  - Top 10 proyectos, oportunidades $/m²
  - Stack: Recharts ^3.7.0
- **PDF Profesional Broker:** Sistema auto-generación PDFs 2 páginas (FASE 3A)
  - Template @react-pdf/renderer con foto broker, logo inmobiliaria, galería, QR
  - API `/api/broker/generate-pdf` + storage `pdfs-broker`
  - Página perfil `/broker/perfil` para subir foto/logo
  - Botón "📄 PDF" en dashboard con modal compartir (WhatsApp, copiar link)
  - Score calidad 100pts para propiedades broker (migración 092)

- **Pipeline Alquiler BD (Fase 1):** Infraestructura SQL completa (migraciones 135-139)
  - 8 columnas nuevas en propiedades_v2 (precio_mensual_bob/usd, deposito, amoblado, mascotas, servicios, contrato, expensas)
  - `registrar_discovery_alquiler()` — UPSERT independiente (NO toca registrar_discovery)
  - `registrar_enrichment_alquiler()` — recibe JSON del LLM con candados
  - `merge_alquiler()` — enrichment-first, sin TC paralelo, sin score fiduciario
  - 13 tests unitarios en `sql/tests/test_alquiler_functions.sql`
  - **Principio: CERO cambios a funciones del sistema vivo de venta**

- **Pipeline Alquiler Completo (Fases 1-4):** Publicado 12 Feb 2026
  - Migraciones 135-139 desplegadas en Supabase
  - 5 workflows n8n activos: Discovery C21 (2:00 AM), Discovery Remax (2:15 AM), Discovery Bien Inmuebles (2:30 AM), Enrichment LLM (3:00 AM), Merge (4:00 AM)
  - Flujo C Verificador: universal (venta + alquiler), LIMIT 200, sin filtro tipo_operacion
  - `registrar_discovery_alquiler()`, `registrar_enrichment_alquiler()`, `merge_alquiler()`
  - Primera corrida test: 168 completadas, 46 inactivo_confirmed, 6 actualizado
  - **Nota:** absorción alquiler contaminada por backlog hasta ~14 Mar 2026 (ver bitácora)

- **Market Investment Snapshots (migración 140):** Publicado 12 Feb 2026
  - Tabla `market_absorption_snapshots` + función `snapshot_absorcion_mercado()`
  - Cron: 9 AM diario via auditoría n8n
  - Métricas: absorción, precios, renta, ROI por tipología (0-3 dorms)
  - **Absorción venta:** limpia ~17 Feb 2026
  - **Absorción alquiler:** limpia ~14 Mar 2026
  - **Precios + ROI:** confiables desde día 1

### ⏳ En Progreso
- **Sistema Broker Fase 5-7:** Portal broker, sistema leads, CMA (pendiente)

### ❌ Pendiente
- **FASE 3:** Enriquecimiento IA de proyectos (15 sin desarrollador asignado)
- **FASE 4:** Validación GPS completa (workflow validador Google Places)
- **Migración 017:** Mejoras sistema matching (FK, blacklist, detección duplicados)
- **Beta Feedback System:** Formulario + Slack + PDF automático (prerequisito: pulir informe) → `docs/simon/BETA_FEEDBACK_SYSTEM_PLAN.md`

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

## Migraciones SQL (001-129)

> **Nota de Auditoría (27 Feb 2026):** Duplicados renombrados con sufijo "b" (115b, 116b, 140b, 147b, 148b). Saltos intencionales en 045, 055, 058.

| # | Archivo | Propósito | Estado |
|---|---------|-----------|--------|
| 001 | migracion_merge_v2.0.0 | Merge Discovery + Enrichment | ✅ |
| 002 | migracion_columnas_matching | Columnas matching en propiedades_v2 | ✅ |
| 003 | matching_sugerencias_fk_v2 | FK hacia propiedades_v2 | ✅ |
| 004 | microzonas_schema | Tabla zonas_geograficas | ✅ |
| 005 | asignar_zona_por_gps | Funciones GPS | ✅ |
| 006 | crear_proyecto_desde_sugerencia | RPC básica | ✅ |
| 007 | crear_proyecto_con_gps_validacion | RPC v2 + validación | ✅ |
| 008 | auditoria_snapshots | Tabla snapshots (vacía) | ✅ |
| 009 | sin_match_exportados | Sistema Sin Match | ✅ |
| 010 | accion_corregir | CORREGIR para Sin Match | ✅ |
| 011 | corregir_proyecto_matching | CORREGIR para Pendientes | ✅ |
| 012 | fix_null_strings | Fix "null" string de n8n | ✅ |
| 013 | workflow_executions | Tabla + función tracking workflows | ✅ |
| 014 | tc_binance_historial | TC Binance + historial precios | ✅ |
| 015 | excluido_operacion | Status para alquiler/anticrético | ✅ |
| 016 | limpieza_sky_properties | Auditoría Sky + corrección GPS/duplicados | ✅ |
| 017 | mejoras_matching_system | FK formal, detección duplicados (blacklist no implementada) | ✅ |
| 018 | asignar_proyecto_existente | RPC asignar proyecto existente | ✅ |
| 019 | knowledge_graph_mvp | Query Layer: buscar_unidades_reales() | ✅ |
| 020 | leads_mvp | Sistema leads inicial | ✅ |
| 021 | leads_flow_refactor | Refactor flujo leads | ✅ |
| 022 | fuzzy_matching_infraestructura | pg_trgm, normalize_nombre(), buscar_proyecto_fuzzy() | ✅ |
| 023 | supervisor_excluidas | HITL excluidas: exportar, procesar_accion, detectar_razon | ✅ |
| 024 | matching_trigram_integration | generar_matches_trigram(), matching_completo_automatizado | ✅ |
| 025 | generar_razon_fiduciaria | EL MOAT: razones contextuales con DATA real | ✅ |
| 026 | buscar_unidades_reales_v2 | v2.1: fotos, precio_m2, score, desarrollador, filtro área>=20m² | ✅ |
| 027 | fix_tipo_propiedad_santorini | Reclasificar 22 parqueos/bauleras SANTORINI VENTURA | ✅ |
| 028 | calcular_posicion_mercado | Comparar precio vs promedio zona (oportunidad/premium) | ✅ |
| 029 | fix_dato_corrupto_380 | Fix dato corrupto ID 380 | ✅ |
| 030 | analisis_mercado_fiduciario | Análisis de mercado fiduciario | ✅ |
| 031 | ficha_coherencia_fiduciaria | Ficha coherencia fiduciaria | ✅ |
| 032 | filtro_estado_construccion | Filtro estado construcción | ✅ |
| 033 | fix_solo_con_fotos | Fix jsonb_array_length() en fotos NULL | ✅ |
| 034 | fix_fotos_remax | Fix fotos Remax | ✅ |
| 035 | fix_zona_proyecto_265 | Fix zona proyecto 265 | ✅ |
| 036 | recalcular_zonas_por_gps | Recalcular zonas por GPS | ✅ |
| 037 | filtro_precio_outlier | Filtro precio outlier | ✅ |
| 038 | curar_datos_usuario | Curar datos usuario | ✅ |
| 039 | dias_en_mercado | Días en mercado | ✅ |
| 040 | comparacion_edificio | Comparación edificio | ✅ |
| 041 | comparacion_tipologia | Comparación tipología | ✅ |
| 042 | amenities_fiduciarias | Amenities fiduciarias | ✅ |
| 043 | equipamiento_deteccion | Equipamiento detección | ✅ |
| 044 | agregar_banos | Agregar baños | ✅ |
| 045 | - | *(salto en numeración)* | - |
| 046 | agregar_descripcion | Agregar descripción | ✅ |
| 047 | agregar_posicion_mercado | Agregar posición mercado | ✅ |
| 048 | fix_jsonb_each_null | Fix jsonb_each crash en amenities NULL, excluir Sin zona | ✅ |
| 049 | deduplicar_santorini | Columna duplicado_de, marcar 28 duplicados SANTORINI | ✅ |
| 050 | fix_santorini_gps_fotos | Corregir GPS y fotos rotas SANTORINI VENTURA | ✅ |
| 051 | deduplicar_exactos | Marcar duplicados exactos (Avanti, Spazios, etc.) | ✅ |
| 052 | fix_estado_entrega_solo_preventa | Filtro MOAT 3 opciones | ✅ |
| 053 | fix_posicion_mercado_usar_precio_m2 | Fix posición mercado usar precio/m² | ✅ |
| 054 | buscar_unidades_pasar_precio_m2 | Buscar unidades pasar precio/m² | ✅ |
| 055 | - | *(salto en numeración)* | - |
| 056 | fix_jsonb_each_null | Fix jsonb_each null adicional | ✅ |
| 057 | fix_estado_entrega_moat | Fix estado entrega MOAT | ✅ |
| 058 | - | *(salto en numeración)* | - |
| 059 | fix_tc_paralelo_retroactivo | Fix bug merge TC + 13 props + vista monitoreo | ✅ |
| 060 | fix_multiproyecto_completo | Fix multiproyecto completo | ✅ |
| 061 | agregar_dias_en_mercado | Agregar días en mercado | ✅ |
| 062 | filtro_dias_en_mercado | Filtro días en mercado | ✅ |
| 063 | buscar_unidades_reales_completa | buscar_unidades_reales completa | ✅ |
| 064 | enriquecer_amenities_equipamiento | Extracción 69 campos de descripciones a JSONB | ✅ |
| 065 | agregar_gps_estacionamientos | Añadir estacionamientos al retorno | ✅ |
| 066 | enriquecer_estacionamientos | Extraer parqueos desde descripciones | ✅ |
| 067 | enriquecer_baulera | Columna baulera + extracción | ✅ |
| 068 | agregar_baulera_funcion | Añadir baulera a buscar_unidades v2.23 | ✅ |
| 069 | expandir_equipamiento_detectado | Detección tiempo real ~60 amenities v2.24 | ✅ |
| 070 | leads_contacto_broker | Sistema contacto lead-broker (SIM-XXXXX) | ✅ |
| 071 | beta_feedback | Sistema beta feedback | ✅ |
| 072 | broker_system_tables | 7 tablas sistema broker | ✅ |
| 073 | buscar_unidades_broker | Función búsqueda propiedades broker | ✅ |
| 074 | broker_datos_prueba | Datos test broker | ✅ |
| 075 | brokers_verificacion_preregistro | Verificación brokers + pre-registro | ✅ |
| 076 | propiedades_broker_campos_adicionales | Campos adicionales propiedades broker | ✅ |
| 077 | propiedades_historial_auditoria | Tabla auditoría cambios (2,938 registros) | ✅ |
| 078 | fix_cron_tc_dinamico | Fix cron TC dinámico | ✅ |
| 079 | buscar_unidades_precio_actualizado | Precio actualizado | ✅ |
| 080 | fix_auditoria_tc_batch | Fix auditoría TC batch | ✅ |
| 081 | columnas_piso_forma_pago | Columnas piso + forma de pago | ✅ |
| 082 | buscar_unidades_forma_pago | buscar_unidades v2.25 + forma pago | ✅ |
| 083 | parqueo_baulera_precio | Columnas parqueo/baulera precio | ✅ |
| 084 | buscar_unidades_parqueo_baulera | buscar_unidades v2.26 + parqueo/baulera | ✅ |
| 085 | proyectos_master_campos_admin | Admin Proyectos campos | ✅ |
| 086 | inferir_datos_proyecto | Función inferir amenidades/estado/pisos | ✅ |
| 087 | fotos_proyecto_amenidades_opcionales | Fotos proyecto + amenidades opcionales | ✅ |
| 088 | desarrolladores_master | Tabla desarrolladores + FK | ✅ |
| 089 | permisos_anon_landing | Permisos SELECT anon Market Lens | ✅ |
| 090 | contar_bajadas_precio | RPC bajadas de precio snapshots | ✅ |
| 091 | fix_propagar_amenidades_estructura | Fix propagar amenidades | ✅ |
| 092 | score_calidad_broker_100pts | Sistema calidad 100pts broker | ✅ |
| 093 | storage_buckets_broker | Buckets Storage: pdfs-broker | ✅ |
| 094 | fix_leads_mvp_permissions | Fix permisos leads MVP | ✅ |
| 095 | limpieza_datos_vistas | Vistas métricas mercado | ✅ |
| 096 | calcular_confianza_datos | Calcular confianza datos | ✅ |
| 097 | metricas_dias_mercado | Métricas días en mercado | ✅ |
| 098 | fix_metricas_zona_dias | Fix métricas zona días | ✅ |
| 099 | excluir_duplicados_buscar_unidades | Excluir duplicados | ✅ |
| 100 | broker_forma_pago_campos | Campos forma de pago broker | ✅ |
| 101 | buscar_unidades_broker_tc_dinamico | broker con TC dinámico | ✅ |
| 102 | permisos_anon_salud | Permisos anon dashboard salud | ✅ |
| 103 | fix_propagar_verificacion_bloqueo | Fix propagar verificación bloqueo | ✅ |
| 104 | equipamiento_base_proyecto | Equipamiento base proyecto | ✅ |
| 105 | inferir_equipamiento_proyecto | Inferir equipamiento proyecto | ✅ |
| 106 | fix_equipamiento_reemplazar | Fix equipamiento reemplazar | ✅ |
| 107 | fix_amenidades_reemplazar | Fix amenidades reemplazar | ✅ |
| 108 | sincronizar_propiedad_individual | Sincronizar propiedad individual | ✅ |
| 109 | equipamiento_leer_guardados | Leer equipamiento guardado | ✅ |
| 110 | fix_posicion_mercado_precio_m2 | Fix posición mercado precio/m² | ✅ |
| 111 | plan_pagos_cuotas_v2 | Plan de pagos y cuotas v2 | ✅ |
| 112 | trigger_creditos_cma | Trigger créditos CMA | ✅ |
| 113 | validacion_humana_auto_aprobados | Validación humana auto-aprobados | ✅ |
| 114 | unificar_dias_mercado_300 | Unificar días en mercado (300 máx) | ✅ |
| 115 | candados_ediciones_manuales | Candados para ediciones manuales | ✅ |
| 115b | fix_amenities_confirmados_usar_lista | Fix amenities usar lista | ✅ |
| 116 | trigger_proteger_amenities | Trigger proteger amenities | ✅ |
| 116b | fix_equipamiento_usar_lista | Fix equipamiento usar lista | ✅ |
| 117 | fix_tc_paralelo_columna | Fix TC paralelo columna | ✅ |
| 118 | candados_nombres_proyecto | Candados nombres proyecto | ✅ |
| 119 | fix_ctes_filtro_antiguedad | Fix CTEs filtro antigüedad | ✅ |
| 120 | fix_metricas_mercado_antiguedad | Fix métricas mercado antigüedad | ✅ |
| 121 | fix_razon_fiduciaria_antiguedad | Fix razón fiduciaria antigüedad | ✅ |
| 122 | fix_tipos_buscar_unidades | Fix tipos buscar unidades | ✅ |
| 123 | fix_300_dias_todos | Fix 300 días todos | ✅ |
| 124 | fix_where_300_dias | Fix WHERE 300 días | ✅ |
| 125 | agregar_fecha_entrega | Agregar fecha_entrega a buscar_unidades | ✅ |
| 126 | propagar_con_candados | Propagar datos respetando candados | ✅ |
| 127 | fix_campos_bloqueados_corruptos | Fix campos_bloqueados corruptos | ✅ |
| 128 | fix_propagacion_update_consolidado | Fix propagación UPDATE consolidado | ✅ |
| 129 | propagar_con_apertura_temporal | Propagar con apertura temporal candados | ✅ |
| 130 | admin_users | Tabla admin_users + auth | ✅ |
| 131 | alinear_zona | Alinear zona/microzona | ✅ |
| 132 | fix_zona_sky_eclipse | Fix zona Sky Eclipse | ✅ |
| 133 | filtrar_300_dias_market | Filtrar >300 días market | ✅ |
| 134 | asignar_microzona_98_props | Asignar microzona 98 props | ✅ |
| 135 | rental_columns | 8 columnas alquiler + 5 CHECK + 3 índices | ✅ |
| 136 | registrar_discovery_alquiler | Función discovery alquiler (UPSERT independiente) | ✅ |
| 137 | registrar_enrichment_alquiler | Función enrichment LLM alquiler con candados | ✅ |
| 138 | merge_alquiler | Merge enrichment-first, sin TC paralelo | ✅ |
| 139 | reactivar_alquileres_existentes | Reactivar 61 alquileres existentes → completado | ✅ |
| 140 | market_absorption_snapshots | Tabla + función snapshot inversión mercado (absorción, precios, renta, ROI) | ✅ |
| 140b | rescatar_precios_alquiler | Rescatar precios alquiler de discovery a columnas | ✅ |
| 141 | matching_alquileres_lookup | Lookup matching alquileres por nombre/GPS | ✅ |
| 142 | matching_alquileres_ejecutar_batch | Batch matching alquileres | ✅ |
| 143 | fix_aplicar_matches_campos_bloqueados | Fix aplicar matches respetando campos_bloqueados | ✅ |
| 144 | fix_excluidas_con_proyecto | Fix excluidas con proyecto asignado | ✅ |
| 145 | bajar_umbral_pendientes_55 | Bajar umbral pendientes a 55% | ✅ |
| 146 | matching_alquileres_trigram_v2 | Matching alquileres con trigram v2 | ✅ |
| 147 | buscar_unidades_alquiler | RPC feed alquileres con mapeo microzonas | ✅ |
| 147b | trigger_asignar_zona_gps | Trigger auto-asignar zona desde GPS | ✅ |
| 148 | fix_agente_alquiler | Fix datos agente en alquiler | ✅ |
| 148b | fix_filtros_alquiler | Fix filtros búsqueda alquiler | ✅ |
| 149 | orden_fecha_publicacion_alquiler | Orden por fecha publicación en alquiler | ✅ |
| 150 | filtro_dormitorios_min_alquiler | Filtro dormitorios mínimo alquiler | ✅ |
| 151 | amenidades_fallback_proyecto_alquiler | Fallback amenidades proyecto en alquiler | ✅ |
| 152 | fix_status_alquiler_incluir_actualizado | Incluir status actualizado en búsqueda alquiler | ✅ |
| 153 | dormitorios_multiselect_alquiler | Multiselect dormitorios en alquiler | ✅ |
| 154 | leads_alquiler | Tabla leads_alquiler + RPC | ✅ |
| 155 | permisos_anon_alquileres | Permisos anon para feed alquileres | ✅ |
| 156 | filtro_parqueo_alquiler | Filtro parqueo en alquiler | ✅ |
| 157 | fix_whatsapp_remax_alquiler | Fix WhatsApp Remax en alquiler | ✅ |
| 158 | bien_inmuebles_fotos_alquiler | Branch fotos + agente Bien Inmuebles en buscar_unidades_alquiler() | ✅ |
| 159 | fotos_remax_merge_alquiler | Fotos Remax en merge alquiler | ✅ |
| 160 | alquiler_offset | OFFSET en buscar_unidades_alquiler() para paginación server-side | ✅ |
| 161 | agente_nombre_c21_alquiler | Nombre agente C21 en alquiler | ✅ |
| 162 | leads_alquiler_es_test | Campo es_test en leads_alquiler | ✅ |
| 163 | alquiler_filtro_150_dias | Reducir filtro antigüedad alquiler de 180→150 días | ✅ |
| 164 | status_expirado_stale | Status `expirado_stale` (no cuenta absorción) + limpiar 4 props >150d | ✅ |
| 165 | fix_discovery_alquiler_fecha | Fix fecha_discovery BI (preservar si sin fecha_publicacion) + retroactivo | ✅ |
| 166 | fix_trigger_matchear_alquiler_numeric | Fix casteo ::integer→::numeric en confidence/tier del trigger matching alquiler | ✅ |
| 167 | precio_normalizado_helper | Helper `precio_normalizado(precio_usd, tipo_cambio_detectado)` para normalizar TC paralelo | ✅ |
| 168 | normalizar_precios_tc_paralelo | Reescribir buscar_unidades_reales, vistas, snapshot, razón fiduciaria usando precio_normalizado() | ✅ |
| 169 | drop_overload_discovery_alquiler | Dropear overload huérfano TEXT de registrar_discovery_alquiler() | ✅ |

## Repo Legacy

`sici-matching/` contiene funciones SQL que apuntan a tabla deprecada.
**NO USAR** - Todo migrado a `sici/sql/functions/matching/`.

## Backlog Calidad de Datos (21 Ene 2026)

### ✅ Baños Corregidos (14 props) - 21 Ene 2026
Auditoría manual con IA completada. 14 propiedades corregidas con `campos_bloqueados`:
- IDs: 456, 230, 255, 166, 188, 224, 231, 243, 355, 357, 415, 62, 241

### 🔍 Baños Pendientes de Revisión Manual (17 props)

**🔴 3 dorms + 1 baño (muy sospechoso):**
| ID | Proyecto | Área | URL |
|----|----------|------|-----|
| 405 | MIRO TOWER | 94m² | https://c21.com.bo/propiedad/91243_departamento-en-venta-de-3-dormitorios |

**🟡 2 dorms + 1 baño (revisar):**
| ID | Proyecto | Área | URL |
|----|----------|------|-----|
| 156 | SKY EQUINOX | 208m² | https://c21.com.bo/propiedad/94808_departamento-2-dormitorio-sky-equinox |
| 309 | Domus Infinity | 58m² | https://c21.com.bo/propiedad/89096_en-venta-departamento-de-1-dormitorio-escritorio-zona-equipetrol |
| 339 | Edificio Spazios | 83m² | https://c21.com.bo/propiedad/86032_departamentos-de-lujo-en-venta-en-equipetrol-condominio-spazios-1 |
| 342 | Spazios Edén | 105m² | https://c21.com.bo/propiedad/92558_departamento-en-preventa-en-spazios-eden-equipetrol |
| 344 | Spazios Edén | 105m² | https://c21.com.bo/propiedad/92783_departamento-en-preventa-en-spazios-eden-equipetrol |
| 359 | Stone 3 | 63m² | https://c21.com.bo/propiedad/89355_stone-3-departamento-2-dormitorios-en-pre-venta-zona-equipetrol |
| 364 | PORTOBELLO ISUTO | 62m² | https://c21.com.bo/propiedad/89963_departamento-dos-dormitorios-en-venta-portobello-isuto |
| 385 | Concret Equipetrol | 98m² | https://c21.com.bo/propiedad/84208_equipetrol-preventa-departamento-de-2-habitaciones-edificio-concret-equipetrol |
| 404 | MIRO TOWER | 79m² | https://c21.com.bo/propiedad/91230_departamento-en-venta-de-2-dormitorios |
| 412 | PORTOBELLO 5 | 55m² | https://c21.com.bo/propiedad/90003_departamento-2-dormitorios-en-pre-venta-zona-equipetrol-canal-isuto |
| 488 | Spazios Edén | 105m² | https://c21.com.bo/propiedad/92784_departamento-en-preventa-en-spazios-eden-equipetrol |

**🟠 1 dorm + 2 baños (verificar si correcto):**
| ID | Proyecto | Área | URL |
|----|----------|------|-----|
| 158 | MARE | 70m² | https://c21.com.bo/propiedad/94505_departamento-en-venta-en-condominio-mare |
| 283 | Lofty Island | 68m² | https://c21.com.bo/propiedad/71299_lofty-island-equipetrol-departamento-de-1-dormitorio-en-fachada-y-con-balcon |
| 387 | Stone 3 | 54m² | https://c21.com.bo/propiedad/80766_departamento-en-venta-en-cond-stone-ii-equipetrol |
| 392 | Swissôtel | 76m² | https://c21.com.bo/propiedad/87696_departamento-en-venta-hotel-swissotel-zona-canal-isuto |
| 452 | Uptown NUU | 68m² | https://c21.com.bo/propiedad/96445_tu-hogar-o-tu-santuario-personal |

### Datos Corruptos Detectados
| ID | Problema | Acción |
|----|----------|--------|
| 380 | Spazios Edén $57,153 por 105m² ($544/m²) - precio irrealmente bajo vs $146k de unidades idénticas | Revisar fuente, marcar inactivo o corregir precio |

### Backlog Extractores n8n
- [ ] **REIMPORTAR flujo_b_processing_v3.0.json en n8n** - Contiene Fix 1 TC paralelo (patrones regex)
- [ ] **Fix 2 TC Paralelo** - Lógica normalización USD paralelo - Ver `docs/backlog/FIX_TC_PARALELO_EXTRACTORES.md`

### Validaciones Pendientes en Pipeline
- [ ] Agregar validación precio/m² en merge: si < $800 para Equipetrol, flaggear como `requiere_revision`
- [x] Filtro `tipo_operacion = 'venta'` en función `buscar_unidades_reales()` ✅ (migración 026)
- [x] Filtro `area >= 20m²` para excluir parqueos/bauleras mal clasificados ✅ (migración 026)
- [ ] Detectar duplicados por proyecto + área + dormitorios con precios muy diferentes

### UX Completado
- [x] **Leyenda de símbolos en resultados** - Banner colapsable en resultsV2.tsx explicando: ✓=incluido, ?=sin confirmar, 🚗=parqueos, 📦=baulera, 🏢=piso, 📅=plan pagos, 💱=TC paralelo, 📉=descuento, 🤝=negociable

## Deuda Técnica (20 Ene 2026)

### ⚠️ Merge NO preserva enriquecimientos manuales a `datos_json->amenities`

**Problema:** La función `merge_discovery_enrichment.sql` reconstruye `datos_json->amenities`
completamente desde `datos_json_enrichment` en cada ejecución. Esto significa que:

1. Las migraciones 064 (amenities/equipamiento) y 066 (estacionamientos) enriquecen `datos_json->amenities`
2. Pero el merge nocturno las sobrescribe con los datos originales de enrichment
3. Solo la columna `estacionamientos` está protegida porque enrichment tiene "sin_confirmar" (texto) que merge ignora

**Campos afectados:**
- `datos_json->amenities->amenities_confirmados` - Migración 064
- `datos_json->amenities->amenities_por_verificar` - Migración 064
- `datos_json->amenities->equipamiento_detectado` - Migración 064

**Campos NO afectados (seguros):**
- `estacionamientos` (columna) - Migración 066 ✅ (merge preserva porque enrichment no tiene número)
- Campos con `campos_bloqueados` activos ✅

**Solución futura:**
- Modificar merge para verificar `campos_bloqueados->>'amenities'` antes de sobrescribir
- O crear estructura separada `amenities_enriquecidos` que merge no toque

**Impacto actual:** Las migraciones 064 deben re-ejecutarse después de cada merge nocturno
hasta implementar la solución. La migración 066 (estacionamientos) es segura.
