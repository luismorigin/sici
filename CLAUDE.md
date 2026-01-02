# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching
- Tabla principal: `propiedades_v2` (433 registros)
- Tabla proyectos: `proyectos_master` (192 activos)
- Tracking: `workflow_executions` (health check)
- Tasa de matching: **96%** (331/345 completadas)

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
| Plan activo | `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| Estado Módulo 1 | `docs/MODULO_1_ESTADO_FINAL.md` |
| Spec Sin Match | `docs/modulo_2/SIN_MATCH_SPEC.md` |
| Spec Matching | `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` |
| Spec Auditoría | `docs/modulo_2/AUDITORIA_DIARIA_SPEC.md` |
| Spec Tracking | `docs/modulo_2/WORKFLOW_TRACKING_SPEC.md` |

## Estructura Clave

```
sici/
├── sql/functions/
│   ├── discovery/     # registrar_discovery.sql
│   ├── enrichment/    # registrar_enrichment.sql
│   ├── merge/         # merge_discovery_enrichment.sql v2.1.0
│   └── matching/      # Funciones v3.1 (propiedades_v2)
├── sql/migrations/    # 001-013 (FK, microzonas, HITL, tracking)
├── geodata/           # microzonas_equipetrol_v4.geojson
├── n8n/workflows/
│   ├── modulo_1/      # Flujos A, B, C, Merge (producción)
│   └── modulo_2/      # Matching, Supervisores, Sin Match, Auditoría
└── docs/
    ├── canonical/     # Documentos definitivos
    └── modulo_2/      # Specs y planes matching
```

## Estado Actual (2 Ene 2026)

### ✅ Completado
- **Módulo 1:** Pipeline nocturno operativo (Discovery, Enrichment, Merge)
- **Módulo 2 FASE 1:** Matching Nocturno v3.1 funcionando
- **Módulo 2 FASE 2:** Human-in-the-Loop completo
  - Matching Supervisor: APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO
  - Supervisor Sin Match: ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO
- **Módulo 2 FASE 5:** Pipeline activado (4 AM matching, 8 PM supervisores)
- **Auditoría v2.3:** Health check via `workflow_executions`

### ❌ Pendiente
- **FASE 3:** Enriquecimiento IA de proyectos (columnas metadata + workflow Claude)
- **FASE 4:** Validación GPS completa (workflow validador Google Places)
- **Funciones:** `heredar_metadata_proyecto()`, `validar_sugerencias_extractor()`

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

## Migraciones SQL (001-013)

| # | Archivo | Propósito |
|---|---------|-----------|
| 001 | migracion_merge_v2.0.0 | Merge Discovery + Enrichment |
| 002 | migracion_columnas_matching | Columnas matching en propiedades_v2 |
| 003 | matching_sugerencias_fk_v2 | FK hacia propiedades_v2 |
| 004 | microzonas_schema | Tabla zonas_geograficas |
| 005 | asignar_zona_por_gps | Funciones GPS |
| 006 | crear_proyecto_desde_sugerencia | RPC básica |
| 007 | crear_proyecto_con_gps_validacion | RPC v2 + validación |
| 008 | auditoria_snapshots | Tabla snapshots (vacía) |
| 009 | sin_match_exportados | Sistema Sin Match |
| 010 | accion_corregir | CORREGIR para Sin Match |
| 011 | corregir_proyecto_matching | CORREGIR para Pendientes |
| 012 | fix_null_strings | Fix "null" string de n8n |
| 013 | workflow_executions | Tabla + función tracking workflows |

## Repo Legacy

`sici-matching/` contiene funciones SQL que apuntan a tabla deprecada.
**NO USAR** - Todo migrado a `sici/sql/functions/matching/`.
