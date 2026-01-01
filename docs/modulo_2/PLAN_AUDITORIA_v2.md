# Plan: Mejora Auditoría Diaria v2.0

> **Fecha:** 1 Enero 2026
> **Estado:** EN PROGRESO
> **Workflow:** `auditoria_diaria_sici.json`

---

## Objetivo

Reestructurar el reporte Slack de auditoría diaria con 4 secciones claras que respondan preguntas específicas.

---

## Nueva Estructura del Reporte

### 1. ESTADO DEL INVENTARIO (¿Qué tengo?)

| Métrica | Fuente | Cambio 24h |
|---------|--------|------------|
| Propiedades activas | `status IN ('completado', 'actualizado')` | +/- vs ayer |
| Propiedades inactivas | `status = 'inactivo_confirmado'` | +/- vs ayer |
| Proyectos activos | `proyectos_master WHERE activo = true` | +/- vs ayer |
| Proyectos inactivos | `proyectos_master WHERE activo = false` | +/- vs ayer |

**Desafío:** Para calcular cambio 24h necesitamos:
- Opción A: Usar `auditoria_snapshots` (tabla existe pero vacía)
- Opción B: Calcular desde `fecha_creacion` y `updated_at`

**Decisión:** Opción B por ahora (no requiere cambios en otros workflows)

### 2. CALIDAD DE DATOS (¿Qué tan completo está?)

| Métrica | Query |
|---------|-------|
| Con proyecto asignado | `id_proyecto_master IS NOT NULL` / total_activas * 100 |
| Sin proyecto (pendientes) | `id_proyecto_master IS NULL AND es_para_matching = true` |
| Con GPS verificado | De proyectos: `gps_verificado_google = true` |
| Con nombre scrapeado | `nombre_edificio IS NOT NULL AND != ''` |

### 3. ACTIVIDAD 24H (¿Qué pasó hoy?)

| Métrica | Query |
|---------|-------|
| Propiedades nuevas | `fecha_creacion >= NOW() - 24h` |
| Propiedades eliminadas | `status changed to inactivo_confirmado` en 24h |
| Matches aprobados | `matching_sugerencias estado='aprobado' AND updated_at >= 24h` |
| Matches rechazados | `matching_sugerencias estado='rechazado' AND updated_at >= 24h` |
| Proyectos creados | `proyectos_master created_at >= 24h` |
| Proyectos corregidos | Desde `sin_match_exportados` acción CORREGIR |

### 4. SALUD DE WORKFLOWS (¿Todo corrió bien?)

| Workflow | Cómo detectar ejecución |
|----------|-------------------------|
| Flujo A (Discovery) | `fecha_creacion` nuevas en últimas 26h |
| Flujo B (Enrichment) | `fecha_enrichment` en últimas 26h |
| Flujo C (TC Dinámico) | `status = inactivo_confirmado` cambios en 26h |
| Matching Nocturno 4AM | Sugerencias creadas entre 4-5 AM hoy |
| Exportar Sin Match 7AM | `sin_match_exportados` con `fecha_export` hoy |
| Supervisor Matching 8PM | Sugerencias con `estado != pendiente` y `updated_at` entre 8-9 PM ayer |
| Supervisor Sin Match 8:30PM | `sin_match_exportados` con `fecha_procesado` ayer noche |

---

## Cambios Requeridos

### 1. Nuevos Queries SQL

```sql
-- Query 1: Inventario + Cambios 24h
SELECT
  -- Propiedades activas
  COUNT(*) FILTER (WHERE status IN ('completado', 'actualizado')) as props_activas,
  COUNT(*) FILTER (WHERE status IN ('completado', 'actualizado')
    AND fecha_creacion < NOW() - INTERVAL '24 hours') as props_activas_ayer,

  -- Propiedades inactivas
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmado') as props_inactivas,

  -- Nuevas en 24h
  COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours') as props_nuevas_24h,

  -- Pasaron a inactivo en 24h (aproximación)
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmado'
    AND updated_at >= NOW() - INTERVAL '24 hours') as props_inactivadas_24h
FROM propiedades_v2;

-- Query 2: Proyectos inventario
SELECT
  COUNT(*) FILTER (WHERE activo = true) as proy_activos,
  COUNT(*) FILTER (WHERE activo = false) as proy_inactivos,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as proy_creados_24h,
  COUNT(*) FILTER (WHERE gps_verificado_google = true) as proy_gps_verificado
FROM proyectos_master;

-- Query 3: Calidad de datos
SELECT
  COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL
    AND status IN ('completado', 'actualizado')) as con_proyecto,
  COUNT(*) FILTER (WHERE id_proyecto_master IS NULL
    AND status IN ('completado', 'actualizado')
    AND es_para_matching = true) as sin_proyecto_pendiente,
  COUNT(*) FILTER (WHERE nombre_edificio IS NOT NULL
    AND nombre_edificio != ''
    AND status IN ('completado', 'actualizado')) as con_nombre
FROM propiedades_v2;

-- Query 4: Actividad matching 24h
SELECT
  COUNT(*) FILTER (WHERE estado = 'aprobado'
    AND updated_at >= NOW() - INTERVAL '24 hours') as aprobados_24h,
  COUNT(*) FILTER (WHERE estado = 'rechazado'
    AND updated_at >= NOW() - INTERVAL '24 hours') as rechazados_24h,
  COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes_total
FROM matching_sugerencias;

-- Query 5: Actividad sin_match 24h
SELECT
  COUNT(*) FILTER (WHERE estado = 'asignado'
    AND fecha_procesado >= NOW() - INTERVAL '24 hours') as asignados_24h,
  COUNT(*) FILTER (WHERE estado = 'creado'
    AND fecha_procesado >= NOW() - INTERVAL '24 hours') as creados_24h,
  COUNT(*) FILTER (WHERE estado = 'corregido'
    AND fecha_procesado >= NOW() - INTERVAL '24 hours') as corregidos_24h,
  COUNT(*) FILTER (WHERE estado = 'sin_proyecto'
    AND fecha_procesado >= NOW() - INTERVAL '24 hours') as sin_proyecto_24h
FROM sin_match_exportados;

-- Query 6: Health Check workflows
SELECT
  -- Discovery (Flujo A) - hubo nuevas propiedades?
  EXISTS(SELECT 1 FROM propiedades_v2
    WHERE fecha_creacion >= NOW() - INTERVAL '26 hours') as discovery_ok,

  -- Enrichment (Flujo B)
  MAX(fecha_enrichment) as ultimo_enrichment,
  EXTRACT(EPOCH FROM (NOW() - MAX(fecha_enrichment))) / 3600 as horas_sin_enrichment,

  -- Merge
  MAX(fecha_merge) as ultimo_merge,
  EXTRACT(EPOCH FROM (NOW() - MAX(fecha_merge))) / 3600 as horas_sin_merge
FROM propiedades_v2
WHERE fecha_enrichment IS NOT NULL;

-- Query 7: Health Matching workflows
SELECT
  -- Matching Nocturno 4AM (sugerencias entre 4-5 AM hoy)
  COUNT(*) FILTER (
    WHERE created_at >= DATE_TRUNC('day', NOW()) + INTERVAL '4 hours'
    AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '5 hours'
  ) as matching_nocturno_hoy,

  -- Supervisor 8PM (aprobados/rechazados entre 8-9 PM ayer)
  COUNT(*) FILTER (
    WHERE updated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '4 hours'
    AND updated_at < DATE_TRUNC('day', NOW()) - INTERVAL '3 hours'
    AND estado IN ('aprobado', 'rechazado')
  ) as supervisor_ayer
FROM matching_sugerencias;
```

### 2. Nodos del Workflow

```
Schedule 9:00 AM
       │
       ▼
┌──────────────────────┐
│ PG: Inventario       │ ─── Props activas/inactivas + cambios
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Proyectos        │ ─── Proy activos/inactivos + creados
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Calidad          │ ─── Con proyecto, GPS, nombre
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Actividad Match  │ ─── Aprobados, rechazados, pendientes
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Actividad SinM   │ ─── Asignados, creados, corregidos
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Health Workflows │ ─── Timestamps de cada workflow
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Code: Consolidar v2  │ ─── Calcular deltas, formatear secciones
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Slack: Reporte v2    │ ─── 4 secciones con Block Kit
└──────────────────────┘
```

### 3. Formato Slack Propuesto

```
📊 SICI Auditoría Diaria — 1 ene 2026

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 ESTADO DEL INVENTARIO
┌────────────────────┬───────┬─────────┐
│ Propiedades activas│  350  │   +2    │
│ Propiedades inact. │   81  │   +1    │
│ Proyectos activos  │  190  │   +0    │
│ Proyectos inact.   │   12  │   +0    │
└────────────────────┴───────┴─────────┘

📈 CALIDAD DE DATOS
• Con proyecto: 338 (96.6%)
• Sin proyecto: 12 (3.4%)
• GPS verificado: 168 (88.4%)
• Con nombre: 280 (80.0%)

⚡ ACTIVIDAD 24H
+2 propiedades nuevas
-1 propiedades inactivadas
✅ 5 matches aprobados
❌ 0 matches rechazados
🆕 1 proyecto creado
🔧 0 proyectos corregidos

🔄 SALUD DE WORKFLOWS
✅ Flujo A (Discovery)      hace 2h
✅ Flujo B (Enrichment)     hace 3h
✅ Flujo C (Verificador)    hace 5h
✅ Matching Nocturno 4AM
✅ Exportar Sin Match 7AM
✅ Supervisor Match 8PM
✅ Supervisor SinM 8:30PM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Orden de Implementación

1. **Consolidar queries en 3 nodos PG** (en vez de 6 para reducir latencia)
2. **Actualizar Code node** con nueva lógica de consolidación
3. **Actualizar Slack Block Kit** con nuevo formato
4. **Probar manualmente** antes de activar schedule
5. **Actualizar AUDITORIA_DIARIA_SPEC.md**

---

## Queries Consolidadas (Final)

Para minimizar llamadas a BD, consolidamos en 3 queries:

### Query A: Propiedades + Calidad
```sql
SELECT
  -- Inventario
  COUNT(*) FILTER (WHERE status IN ('completado', 'actualizado')) as props_activas,
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmado') as props_inactivas,

  -- Calidad
  COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL
    AND status IN ('completado', 'actualizado')) as con_proyecto,
  COUNT(*) FILTER (WHERE id_proyecto_master IS NULL
    AND status IN ('completado', 'actualizado')
    AND COALESCE(es_para_matching, true) = true) as sin_proyecto,
  COUNT(*) FILTER (WHERE nombre_edificio IS NOT NULL AND nombre_edificio != ''
    AND status IN ('completado', 'actualizado')) as con_nombre,

  -- Actividad 24h
  COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours') as nuevas_24h,
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmado'
    AND updated_at >= NOW() - INTERVAL '24 hours') as inactivadas_24h,

  -- Health
  MAX(fecha_enrichment) as ultimo_enrichment,
  MAX(fecha_merge) as ultimo_merge,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_enrichment))) / 3600, 1) as horas_enrichment,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_merge))) / 3600, 1) as horas_merge,
  EXISTS(SELECT 1 FROM propiedades_v2
    WHERE fecha_creacion >= NOW() - INTERVAL '26 hours' LIMIT 1) as discovery_ok
FROM propiedades_v2;
```

### Query B: Proyectos
```sql
SELECT
  COUNT(*) FILTER (WHERE activo = true) as proy_activos,
  COUNT(*) FILTER (WHERE activo = false) as proy_inactivos,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as proy_creados_24h,
  COUNT(*) FILTER (WHERE gps_verificado_google = true AND activo = true) as proy_gps_verificado
FROM proyectos_master;
```

### Query C: Matching + Sin Match
```sql
WITH matching_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'aprobado'
      AND updated_at >= NOW() - INTERVAL '24 hours') as aprobados_24h,
    COUNT(*) FILTER (WHERE estado = 'rechazado'
      AND updated_at >= NOW() - INTERVAL '24 hours') as rechazados_24h,
    COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
    COUNT(*) FILTER (
      WHERE created_at >= DATE_TRUNC('day', NOW()) + INTERVAL '4 hours'
      AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '5 hours'
    ) as matching_nocturno,
    COUNT(*) FILTER (
      WHERE updated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '4 hours'
      AND updated_at < DATE_TRUNC('day', NOW()) - INTERVAL '3 hours'
      AND estado IN ('aprobado', 'rechazado')
    ) as supervisor_ayer
  FROM matching_sugerencias
),
sinmatch_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'asignado'
      AND fecha_procesado >= NOW() - INTERVAL '24 hours') as asignados_24h,
    COUNT(*) FILTER (WHERE estado = 'creado'
      AND fecha_procesado >= NOW() - INTERVAL '24 hours') as creados_24h,
    COUNT(*) FILTER (WHERE estado = 'corregido'
      AND fecha_procesado >= NOW() - INTERVAL '24 hours') as corregidos_24h,
    COUNT(*) FILTER (WHERE fecha_export >= DATE_TRUNC('day', NOW()) + INTERVAL '7 hours'
      AND fecha_export < DATE_TRUNC('day', NOW()) + INTERVAL '8 hours') as export_hoy,
    COUNT(*) FILTER (
      WHERE fecha_procesado >= DATE_TRUNC('day', NOW()) - INTERVAL '3.5 hours'
      AND fecha_procesado < DATE_TRUNC('day', NOW()) - INTERVAL '2.5 hours'
    ) as supervisor_sinm_ayer
  FROM sin_match_exportados
)
SELECT * FROM matching_stats, sinmatch_stats;
```

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Query lenta por JOINs | Usar queries paralelas, no secuenciales |
| Timezone incorrecta | Usar `DATE_TRUNC` con timezone Bolivia |
| Falsos positivos en health | Usar ventana de 26h (no 24h) |

---

**Siguiente paso:** Implementar queries y actualizar workflow JSON

