# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching
- Tabla principal: `propiedades_v2` (438 registros)
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

## Documentación Principal

| Propósito | Archivo |
|-----------|---------|
| Onboarding completo | `docs/GUIA_ONBOARDING_CLAUDE.md` |
| **Arquitectura SICI** | `docs/arquitectura/SICI_ARQUITECTURA_MAESTRA.md` |
| **MVP Spec 30 días** | `docs/planning/SICI_MVP_SPEC.md` |
| **Simón Arquitectura** | `docs/simon/SIMON_ARQUITECTURA_COGNITIVA.md` |
| **Simón Formularios** | `docs/simon/formularios/BLOQUE_2_FORM_*.md` |
| **Formulario MVP 2 Niveles** | `docs/simon/formularios/FORM_VIVIENDA_MVP.md` |
| **Metodología Fiduciaria** | `docs/canonical/METODOLOGIA_FIDUCIARIA_PARTE_*.md` |
| **Beta Feedback System** | `docs/simon/BETA_FEEDBACK_SYSTEM_PLAN.md` |
| **Sistema Broker B2B** | `docs/simon/SIMON_BROKER_SYSTEM.md` |
| **Broker Handoff Original** | `docs/simon/broker/BROKER_HANDOFF_ORIGINAL.md` |
| **Broker Roadmap Refinado** | `docs/simon/broker/BROKER_ROADMAP_REFINADO.md` |
| Plan activo | `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| Estado Módulo 1 | `docs/MODULO_1_ESTADO_FINAL.md` |
| Spec Sin Match | `docs/modulo_2/SIN_MATCH_SPEC.md` |
| Spec Matching | `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` |
| Spec Auditoría | `docs/modulo_2/AUDITORIA_DIARIA_SPEC.md` |
| Spec Tracking | `docs/modulo_2/WORKFLOW_TRACKING_SPEC.md` |
| Spec TC Dinámico | `docs/modulo_2/TC_DINAMICO_BINANCE_SPEC.md` |
| Knowledge Graph Plan | `docs/planning/KNOWLEDGE_GRAPH_VALIDATED_PLAN.md` |
| Knowledge Graph Design | `docs/planning/SICI_KNOWLEDGE_GRAPH_DESIGN.md` |

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
| `/` | Landing original (colores azul/blanco, emojis) |
| `/landing-v2` | **Alternativa premium** (negro/crema/oro, minimalista) |
| `/filtros-v2` | **Filtros premium** (fondo negro, controles elegantes) |
| `/resultados-v2` | **Resultados premium** (fondo crema, cards blancos) |
| `/landing-premium` | Página de prueba del diseño premium |

### Flujo Premium Completo

```
/landing-v2 → /filtros-v2 → /resultados-v2
```

### Landing Premium (`/landing-v2`)

Diseño luxury alternativo con:
- **Fonts:** Cormorant Garamond (display) + Manrope (body)
- **Colores:** Negro (#0a0a0a), Crema (#f8f6f3), Oro (#c9a959)
- **Componentes:** `/components/landing-premium/`
- **Datos en vivo:** Propiedades, proyectos, TC paralelo, microzonas desde Supabase

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
├── sql/migrations/    # 001-103 (FK, microzonas, HITL, tracking, TC, KG, MVP Simón, Amenities, Broker B2B, Admin, Landing, PDF)
├── geodata/           # microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/      # Flujos A, B, C, Merge (producción)
│   └── modulo_2/      # Matching, Supervisores, Sin Match, Auditoría
└── docs/
    ├── arquitectura/  # SICI_ARQUITECTURA_MAESTRA.md
    ├── canonical/     # Metodología fiduciaria, merge, discovery
    ├── planning/      # MVP spec, Knowledge Graph plans
    ├── simon/         # Arquitectura cognitiva + formularios
    └── modulo_2/      # Specs matching pipeline
```

## Estado Actual (31 Ene 2026)

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

## Migraciones SQL (001-103)

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
| 017 | mejoras_matching_system | FK formal, blacklist, detección duplicados | ⏳ |
| 018 | asignar_proyecto_existente | RPC asignar proyecto existente | ⏳ |
| 019 | knowledge_graph_mvp | Query Layer: buscar_unidades_reales(), v_amenities_proyecto | ⏳ |
| 020 | leads_mvp | Sistema leads inicial | ✅ |
| 021 | leads_flow_refactor | Refactor flujo leads | ✅ |
| 022 | fuzzy_matching_infraestructura | pg_trgm, normalize_nombre(), buscar_proyecto_fuzzy() | ✅ |
| 023 | supervisor_excluidas | HITL excluidas: exportar, procesar_accion, detectar_razon | ✅ |
| 024 | matching_trigram_integration | generar_matches_trigram(), matching_completo v3.2 | ⏳ |
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
| 046 | agregar_descripcion | Agregar descripción | ✅ |
| 047 | agregar_posicion_mercado | Agregar posición mercado | ✅ |
| 048 | fix_jsonb_each_null | Fix jsonb_each crash en amenities NULL, excluir Sin zona | ✅ |
| 049 | deduplicar_santorini | Columna duplicado_de, marcar 28 duplicados SANTORINI | ✅ |
| 050 | fix_santorini_gps_fotos | Corregir GPS y fotos rotas SANTORINI VENTURA | ✅ |
| 051 | deduplicar_exactos | Marcar duplicados exactos (Avanti, Spazios, etc.) | ✅ |
| 052 | fix_estado_entrega_solo_preventa | Filtro MOAT 3 opciones: entrega_inmediata, solo_preventa, no_importa | ✅ |
| 053 | fix_posicion_mercado_usar_precio_m2 | Fix posición mercado usar precio/m² | ✅ |
| 054 | buscar_unidades_pasar_precio_m2 | Buscar unidades pasar precio/m² | ✅ |
| 056 | fix_jsonb_each_null | Fix jsonb_each null adicional | ✅ |
| 057 | fix_estado_entrega_moat | Fix estado entrega MOAT | ✅ |
| 059 | fix_tc_paralelo_retroactivo | Fix bug merge TC + 13 props corregidas + vista monitoreo | ✅ |
| 060 | fix_multiproyecto_completo | Fix multiproyecto completo | ✅ |
| 061 | agregar_dias_en_mercado | Agregar días en mercado | ✅ |
| 062 | filtro_dias_en_mercado | Filtro días en mercado | ✅ |
| 063 | buscar_unidades_reales_completa | buscar_unidades_reales completa | ✅ |
| 064 | enriquecer_amenities_equipamiento | Extracción 69 campos (45 equip + 24 amenities) de descripciones a JSONB | ✅ |
| 065 | agregar_gps_estacionamientos | Añadir estacionamientos al retorno de buscar_unidades_reales() | ✅ |
| 066 | enriquecer_estacionamientos | Extraer cantidad de parqueos desde descripciones (11.6% → 18%) | ✅ |
| 067 | enriquecer_baulera | Crear columna baulera + extraer desde descripciones (14 props, 4.3%) | ✅ |
| 068 | agregar_baulera_funcion | Añadir baulera al retorno de buscar_unidades_reales() v2.23 | ✅ |
| 069 | expandir_equipamiento_detectado | Detección tiempo real ~60 amenities (v2.24), promedio 9.4/prop | ✅ |
| 070 | leads_contacto_broker | Sistema contacto lead-broker con código REF (SIM-XXXXX) | ✅ |
| 071 | beta_feedback | Sistema beta feedback | ✅ |
| 072 | broker_system_tables | 7 tablas sistema broker: brokers, propiedades_broker, fotos, leads, CMA | ✅ |
| 073 | buscar_unidades_broker | Función búsqueda propiedades broker compatible con buscar_unidades_reales | ✅ |
| 074 | broker_datos_prueba | Datos test: 1 broker + 3 propiedades (SIM-TEST1/2/3) + 25 fotos | ✅ |
| 075 | brokers_verificacion_preregistro | Sistema verificación brokers + pre-registro scraping | ✅ |
| 076 | propiedades_broker_campos_adicionales | Campos adicionales propiedades broker | ✅ |
| 077 | propiedades_historial_auditoria | Tabla auditoría cambios + vistas + funciones historial | ⏳ |
| 078 | fix_cron_tc_dinamico | Fix cron TC dinámico | ✅ |
| 079 | buscar_unidades_precio_actualizado | Buscar unidades precio actualizado | ✅ |
| 080 | fix_auditoria_tc_batch | Fix auditoría TC batch | ✅ |
| 081 | columnas_piso_forma_pago | Columnas piso + forma de pago (6 campos) en propiedades_v2 | ✅ |
| 082 | buscar_unidades_forma_pago | buscar_unidades_reales() v2.25 + filtros forma de pago | ✅ |
| 083 | parqueo_baulera_precio | Columnas parqueo/baulera incluido + precio adicional | ⏳ |
| 084 | buscar_unidades_parqueo_baulera | buscar_unidades_reales() v2.26 + filtros parqueo/baulera | ⏳ |
| 085 | proyectos_master_campos_admin | Admin Proyectos: estado_construccion, fecha_entrega, amenidades_edificio | ✅ |
| 086 | inferir_datos_proyecto | Función para inferir amenidades, estado, pisos y fotos | ✅ |
| 087 | fotos_proyecto_amenidades_opcionales | Columna fotos_proyecto + inferir amenidades frecuentes/opcionales | ⏳ |
| 088 | desarrolladores_master | Tabla desarrolladores + FK id_desarrollador + autocomplete | ✅ |
| 089 | permisos_anon_landing | Permisos SELECT anon para Market Lens en vivo | ✅ |
| 090 | contar_bajadas_precio | Función RPC para detectar bajadas de precio entre snapshots | ✅ |
| 091 | fix_propagar_amenidades_estructura | Fix propagar amenidades estructura | ✅ |
| 092 | score_calidad_broker_100pts | **Sistema calidad 100pts para propiedades broker + vista stats** | ✅ |
| 093 | storage_buckets_broker | **Buckets Storage: pdfs-broker, broker-profile + políticas RLS** | ✅ |
| 094 | fix_leads_mvp_permissions | Fix permisos leads MVP | ✅ |
| 095 | limpieza_datos_vistas | v_metricas_mercado, v_alternativas_proyecto, v_salud_datos | ✅ |
| 096 | calcular_confianza_datos | Calcular confianza datos | ✅ |
| 097 | metricas_dias_mercado | Métricas días en mercado | ✅ |
| 098 | fix_metricas_zona_dias | Fix métricas zona días | ✅ |
| 099 | excluir_duplicados_buscar_unidades | Excluir duplicados buscar unidades | ✅ |
| 100 | fix_posicion_mercado_precio_m2 | Fix posición mercado precio/m² | ✅ |
| 101 | buscar_unidades_broker_tc_dinamico | buscar_unidades_broker con TC dinámico | ✅ |
| 102 | permisos_anon_salud | Permisos anon para dashboard salud | ✅ |
| 103 | fix_propagar_verificacion_bloqueo | Fix propagar verificación bloqueo | ✅ |

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
