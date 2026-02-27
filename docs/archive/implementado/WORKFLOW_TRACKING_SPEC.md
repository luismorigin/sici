# Sistema de Tracking de Ejecuciones de Workflows

> **Version:** 1.0
> **Fecha:** 2 Enero 2026
> **Migracion:** `sql/migrations/013_workflow_executions.sql`

---

## Objetivo

Registrar cuando cada workflow de n8n se ejecuta, independientemente de si procesa datos o no. Esto permite:

1. **Health check preciso** en Auditoria Diaria
2. **Detectar workflows que corren sin procesar datos** (ej: no hay propiedades nuevas)
3. **Historial de ejecuciones** para debugging

---

## Problema Resuelto

**Antes (v2.2):** La Auditoria inferia si un workflow corrio basandose en timestamps de datos:
- Si `fecha_enrichment` era reciente → Enrichment corrio
- Si habia propiedades con `fecha_creacion` reciente → Discovery corrio

**Problema:** Si un workflow corria pero no habia datos para procesar, la auditoria reportaba incorrectamente "No corrio".

**Ahora (v2.3):** Cada workflow registra su ejecucion en `workflow_executions` al finalizar, sin importar si proceso datos.

---

## Arquitectura

### Tabla: workflow_executions

```sql
CREATE TABLE workflow_executions (
    id SERIAL PRIMARY KEY,
    workflow_name VARCHAR(100) NOT NULL,
    workflow_version VARCHAR(20),
    status VARCHAR(20) DEFAULT 'success',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ DEFAULT NOW(),
    duration_seconds INTEGER,
    records_processed INTEGER DEFAULT 0,
    records_created INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_errors INTEGER DEFAULT 0,
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Funcion Helper

```sql
CREATE OR REPLACE FUNCTION registrar_ejecucion_workflow(
    p_workflow_name VARCHAR(100),
    p_status VARCHAR(20) DEFAULT 'success',
    p_records_processed INTEGER DEFAULT 0,
    p_records_created INTEGER DEFAULT 0,
    p_records_updated INTEGER DEFAULT 0,
    p_error_message TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL
) RETURNS INTEGER
```

---

## Workflows Registrados

| Workflow | workflow_name | Horario |
|----------|---------------|---------|
| Discovery Century21 | `discovery_century21` | 1:00 AM |
| Discovery Remax | `discovery_remax` | 1:00 AM |
| Enrichment | `enrichment` | 2:00 AM |
| Merge Nocturno | `merge` | 3:00 AM |
| Matching Nocturno | `matching_nocturno` | 4:00 AM |
| Verificador | `verificador` | 6:00 AM |
| Exportar Sin Match | `exportar_sin_match` | 7:00 AM |
| Matching Supervisor | `matching_supervisor` | 8:00 PM |
| Supervisor Sin Match | `supervisor_sin_match` | 8:30 PM |
| Auditoria Diaria | `auditoria_diaria` | 9:00 AM |
| Radar Mensual | `radar_mensual` | Dia 1, 10:00 AM |

---

## Implementacion en n8n

### Nodo PostgreSQL

Agregar al final de cada workflow:

| Campo | Valor |
|-------|-------|
| **Nombre** | `PG: Registrar Ejecucion` |
| **Operation** | Execute Query |
| **Execute Once** | ON (importante!) |

### Query Simplificada

```sql
SELECT registrar_ejecucion_workflow(
  'NOMBRE_WORKFLOW',
  'success',
  0, 0, 0, NULL,
  '{}'::jsonb
);
```

### Conexiones

El nodo debe conectarse desde **TODOS** los puntos finales del workflow:

```
Workflow con bifurcacion:
    ├─ Rama A (hay datos) → ... → PG: Registrar Ejecucion
    └─ Rama B (sin datos) → ... → PG: Registrar Ejecucion
```

**Importante:** Si un workflow tiene rama "sin datos" que no conecta al nodo de registro, el tracking no funcionara cuando no haya datos.

---

## Query de Consulta (Auditoria)

```sql
SELECT
  CASE
    WHEN workflow_name IN ('discovery_century21', 'discovery_remax') THEN 'discovery'
    ELSE workflow_name
  END as workflow_name,
  MAX(finished_at) as last_run,
  BOOL_OR(finished_at >= NOW() - INTERVAL '26 hours') as ran_last_26h
FROM workflow_executions
WHERE workflow_name IN (
  'discovery_century21', 'discovery_remax', 'discovery',
  'enrichment', 'merge', 'matching_nocturno',
  'matching_supervisor', 'exportar_sin_match',
  'supervisor_sin_match', 'radar_mensual', 'auditoria_diaria'
)
GROUP BY CASE
    WHEN workflow_name IN ('discovery_century21', 'discovery_remax') THEN 'discovery'
    ELSE workflow_name
  END;
```

> **Nota:** Usa `BOOL_OR()` en lugar de `MAX(boolean)` porque PostgreSQL no soporta MAX para booleanos.

---

## Verificacion

### Ver ultimas ejecuciones

```sql
SELECT workflow_name, status, finished_at
FROM workflow_executions
ORDER BY finished_at DESC
LIMIT 20;
```

### Ver si un workflow corrio hoy

```sql
SELECT *
FROM workflow_executions
WHERE workflow_name = 'matching_nocturno'
  AND finished_at >= CURRENT_DATE
ORDER BY finished_at DESC;
```

### Limpiar registros antiguos (opcional)

```sql
DELETE FROM workflow_executions
WHERE finished_at < NOW() - INTERVAL '30 days';
```

---

## Troubleshooting

### "Workflow no corrio" pero si corrio

1. Verificar que el nodo `PG: Registrar Ejecucion` existe en el workflow
2. Verificar que `Execute Once` esta activado
3. Verificar que el nodo esta conectado desde TODAS las ramas finales
4. Verificar el `workflow_name` usado (debe coincidir con la query de auditoria)

### Multiples registros por ejecucion

Causa: `Execute Once` no esta activado.

Solucion:
1. Abrir el nodo en n8n
2. Ir a Settings
3. Activar "Execute Once"

### Query de auditoria no encuentra registros

Verificar que el `workflow_name` en el INSERT coincide con los nombres en la clausula WHERE de la query de auditoria.

---

## Changelog

### v1.0 (2 Ene 2026)
- Tabla `workflow_executions` creada
- Funcion `registrar_ejecucion_workflow()` implementada
- 11 workflows configurados con tracking
- Auditoria Diaria v2.3 integrada con `BOOL_OR()`
- Fix: Discovery agrupado (century21 + remax → discovery)

---

*Documentacion creada 2 Enero 2026*
