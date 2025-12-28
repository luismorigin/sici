# SICI - Claude Code Configuration

## Quick Context

**SICI** = Sistema Inteligente de Captura Inmobiliaria (Bolivia)
- Pipeline nocturno: Discovery → Enrichment → Merge → Matching
- Tabla principal: `propiedades_v2` (~214+ registros)
- Tabla proyectos: `proyectos_master` (152+ edificios)

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

## Reglas Criticas

1. **Manual > Automatic** - `campos_bloqueados` SIEMPRE se respetan
2. **Discovery > Enrichment** - Para campos fisicos (area, dorms, GPS)
3. **propiedades_v2** - UNICA tabla activa. `propiedades` es LEGACY
4. **SQL > Regex** - Potenciar matching en BD, no extractores
5. **Zero human-in-the-loop** - Automatizacion completa

## Documentacion Principal

| Proposito | Archivo |
|-----------|---------|
| Onboarding completo | `docs/GUIA_ONBOARDING_CLAUDE.md` |
| Plan activo | `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` |
| Schema BD | `sql/schema/propiedades_v2_schema.md` |
| Merge canonical | `docs/canonical/merge_canonical.md` |
| Estado Modulo 1 | `docs/MODULO_1_ESTADO_FINAL.md` |

## Estructura Clave

```
sici/
├── sql/functions/
│   ├── discovery/     # registrar_discovery.sql
│   ├── enrichment/    # registrar_enrichment.sql
│   ├── merge/         # merge_discovery_enrichment.sql v2.1.0
│   └── matching/      # Funciones Modulo 2 (en migracion)
├── n8n/workflows/
│   └── modulo_1/      # Flujos A, B, C, Merge (produccion)
└── docs/
    ├── canonical/     # Documentos definitivos
    └── modulo_2/      # Plan matching activo
```

## Estado Actual (Dic 2025)

- **Modulo 1:** COMPLETADO - Pipeline nocturno operativo
- **Modulo 2:** EN PROGRESO - Migrando funciones matching a propiedades_v2

## Queries Rapidos

```sql
-- Estado general
SELECT status, fuente, COUNT(*) FROM propiedades_v2 GROUP BY 1,2;

-- Sin proyecto asignado (problema actual)
SELECT COUNT(*) FROM propiedades_v2
WHERE id_proyecto_master IS NULL AND status = 'completado';

-- Proyectos disponibles
SELECT id_proyecto_master, nombre_oficial FROM proyectos_master WHERE activo;
```

## Agents SICI (Globales)

Agents especializados en `~/.claude/agents/` (configuración global):

| Agent | Propósito | Invocar con |
|-------|-----------|-------------|
| `sici-sql-expert` | Funciones SQL matching | `@sici-sql-expert` |
| `sici-code-reviewer` | Revisión de código | `@sici-code-reviewer` |
| `sici-integration-tester` | Testing de pipeline | `@sici-integration-tester` |

## Repo Legacy

`sici-matching/` contiene funciones SQL que apuntan a tabla deprecada.
Migrar a `sici/sql/functions/matching/` apuntando a `propiedades_v2`.
