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
5. **Human-in-the-Loop** - Sistema HITL completo operativo (Sheets + Supervisores)

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

## Estructura Clave

```
sici/
├── sql/functions/
│   ├── discovery/     # registrar_discovery.sql
│   ├── enrichment/    # registrar_enrichment.sql
│   ├── merge/         # merge_discovery_enrichment.sql v2.2.0
│   └── matching/      # Funciones v3.1 (propiedades_v2)
├── sql/migrations/    # 001-068 (FK, microzonas, HITL, tracking, TC, KG, MVP Simón, Amenities, Baulera)
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

## Estado Actual (20 Ene 2026)

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

### ⏳ En Progreso
- **Supervisor Excluidas:** Workflow n8n Export pendiente mapeo columnas (14 props en Sheet)

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

## Migraciones SQL (001-064)

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
| 020 | limpieza_datos_vistas | v_metricas_mercado, v_alternativas_proyecto, v_salud_datos | ✅ |
| 022 | fuzzy_matching_infraestructura | pg_trgm, normalize_nombre(), buscar_proyecto_fuzzy() | ✅ |
| 023 | supervisor_excluidas | HITL excluidas: exportar, procesar_accion, detectar_razon | ✅ |
| 024 | matching_trigram_integration | generar_matches_trigram(), matching_completo v3.2 | ⏳ |
| 025 | generar_razon_fiduciaria | EL MOAT: razones contextuales con DATA real | ✅ |
| 026 | buscar_unidades_reales_v2 | v2.1: fotos, precio_m2, score, desarrollador, filtro área>=20m² | ✅ |
| 027 | fix_tipo_propiedad_santorini | Reclasificar 22 parqueos/bauleras SANTORINI VENTURA | ✅ |
| 028 | calcular_posicion_mercado | Comparar precio vs promedio zona (oportunidad/premium) | ✅ |
| 033 | fix_solo_con_fotos | Fix jsonb_array_length() en fotos NULL | ✅ |
| 048 | fix_jsonb_each_null | Fix jsonb_each crash en amenities NULL, excluir Sin zona | ✅ |
| 049 | deduplicar_santorini | Columna duplicado_de, marcar 28 duplicados SANTORINI | ✅ |
| 050 | fix_santorini_gps_fotos | Corregir GPS y fotos rotas SANTORINI VENTURA | ✅ |
| 051 | deduplicar_exactos | Marcar duplicados exactos (Avanti, Spazios, etc.) | ✅ |
| 052 | fix_estado_entrega_solo_preventa | Filtro MOAT 3 opciones: entrega_inmediata, solo_preventa, no_importa | ✅ |
| 059 | fix_tc_paralelo_retroactivo | Fix bug merge TC + 13 props corregidas + vista monitoreo | ✅ |
| 064 | enriquecer_amenities_equipamiento | Extracción 69 campos (45 equip + 24 amenities) de descripciones a JSONB | ✅ |
| 065 | agregar_gps_estacionamientos | Añadir estacionamientos al retorno de buscar_unidades_reales() | ✅ |
| 066 | enriquecer_estacionamientos | Extraer cantidad de parqueos desde descripciones (11.6% → 18%) | ✅ |
| 067 | enriquecer_baulera | Crear columna baulera + extraer desde descripciones (14 props, 4.3%) | ✅ |
| 068 | agregar_baulera_funcion | Añadir baulera al retorno de buscar_unidades_reales() v2.23 | ✅ |

## Repo Legacy

`sici-matching/` contiene funciones SQL que apuntan a tabla deprecada.
**NO USAR** - Todo migrado a `sici/sql/functions/matching/`.

## Backlog Calidad de Datos (7 Ene 2026)

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
