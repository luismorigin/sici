# Auditoría Diaria SICI - Especificación

> **Versión:** 2.0
> **Fecha:** 1 Enero 2026
> **Workflow:** `n8n/workflows/modulo_2/auditoria_diaria_sici.json`

---

## Objetivo

Generar un reporte diario consolidado del estado completo del sistema SICI con 5 secciones que responden preguntas específicas.

## Ejecución

| Parámetro | Valor |
|-----------|-------|
| Horario | 9:00 AM (Bolivia UTC-4) |
| Frecuencia | Diario (incluyendo fines de semana) |
| Notificación | Slack (webhook `$env.SLACK_WEBHOOK_SICI`) |

## Arquitectura v2.0

```
Schedule 9:00 AM
       │
       ▼
┌──────────────────────┐
│ PG: Propiedades +    │ ─── Inventario, calidad, scores, campos faltantes
│     Calidad          │     Health enrichment/merge/discovery
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Proyectos        │ ─── Activos/inactivos, creados 24h, GPS verificado
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ PG: Matching +       │ ─── Actividad matching, pendientes revisión
│     Sin Match        │     Health supervisores 8PM/8:30PM
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Code: Consolidar v2  │ ─── Calcular %, alertas, formatear
└────────┬─────────────┘
         │
         ▼
┌──────────────────────┐
│ Slack: Reporte v2    │ ─── Mensaje 5 secciones con Block Kit
└──────────────────────┘
```

---

## Secciones del Reporte

### 1. INVENTARIO (¿Qué tengo?)

| Métrica | Query | Cambio 24h |
|---------|-------|------------|
| Props activas | `status IN ('completado', 'actualizado')` | `fecha_creacion >= 24h` |
| Props inactivas | `status = 'inactivo_confirmed'` | `updated_at >= 24h` |
| Proy activos | `activo = true` | `created_at >= 24h` |
| Proy inactivos | `activo = false` | - |

### 2. CALIDAD DE DATOS (¿Qué tan completo?)

| Métrica | Query |
|---------|-------|
| Con proyecto | `id_proyecto_master IS NOT NULL` / activas * 100 |
| Score alto (≥95) | `score_calidad_dato >= 95` |
| Score medio (85-94) | `score_calidad_dato >= 85 AND < 95` |
| Score bajo (<85) | `score_calidad_dato < 85` |
| Sin zona | `zona IS NULL OR zona = ''` |
| Sin dormitorios | `dormitorios IS NULL` |
| Sin nombre | `nombre_edificio IS NULL OR = ''` |

### 3. REVISIÓN HUMANA (¿Qué necesita atención?)

| Métrica | Tabla | Query |
|---------|-------|-------|
| Pendientes matching | `matching_sugerencias` | `estado = 'pendiente'` |
| Pendientes sin_match | `sin_match_exportados` | `estado = 'pendiente'` |
| Excluidas matching | `propiedades_v2` | `es_para_matching = false` |

### 4. ACTIVIDAD 24H (¿Qué pasó?)

| Métrica | Fuente |
|---------|--------|
| Propiedades nuevas | `fecha_creacion >= 24h` |
| Propiedades inactivadas | `status = inactivo_confirmed AND updated_at >= 24h` |
| Matches aprobados | `matching_sugerencias.estado = 'aprobado' AND updated_at >= 24h` |
| Matches rechazados | `matching_sugerencias.estado = 'rechazado' AND updated_at >= 24h` |
| Props asignadas | `sin_match_exportados.estado = 'asignado' AND fecha_procesado >= 24h` |
| Proyectos creados | `sin_match_exportados.estado = 'creado' AND fecha_procesado >= 24h` |
| Proyectos corregidos | `sin_match_exportados.estado = 'corregido' AND fecha_procesado >= 24h` |

### 5. SALUD WORKFLOWS (¿Todo corrió bien?)

| Workflow | Cómo se detecta | Umbral |
|----------|-----------------|--------|
| Discovery | `fecha_creacion >= 26h` en propiedades_v2 | Alguna nueva |
| Enrichment | `MAX(fecha_enrichment)` | < 26h |
| Merge | `MAX(fecha_merge)` | < 26h |
| Match 4AM | Sugerencias entre 4-5 AM hoy | > 0 |
| Super 8PM | Procesados entre 20-21h ayer | >= 0 |
| SinM 8:30PM | `fecha_procesado` entre 20:30-21:30h ayer | >= 0 |

---

## Sistema de Alertas

| Condición | Mensaje |
|-----------|---------|
| `total_pendientes > 5` | "X pendientes revisión" |
| `horas_enrichment > 26` | "Enrichment no corrió en 26h" |
| `discovery_ok = false` | "Discovery no corrió en 26h" |
| `pct_bajo > 5` | "X% calidad baja" |
| `pct_con_proyecto < 90` | "Cobertura matching <90%" |

---

## Ejemplo de Mensaje Slack v2.0

```
📊 SICI Auditoría — 1 ene 2026

━━━ 1. INVENTARIO ━━━
Props activas: 350 (+2)    Props inactivas: 81 (+1)
Proy activos: 190 (+1)     Proy inactivos: 12

━━━ 2. CALIDAD DE DATOS ━━━
Con proyecto: 338 (96.6%)
Calidad: 72% alta | 25% media | 3% baja
Faltantes: zona 54 | dorms 15 | nombre 70

━━━ 3. REVISIÓN HUMANA ━━━
Pendientes: ✅ 0 (matching: 0, sin_match: 0)
Excluidas matching: 20

━━━ 4. ACTIVIDAD 24H ━━━
+2 nuevas  -1 inactivadas
✅ 5 aprobados  ❌ 0 rechazados
📌 3 asignados  🆕 1 proyectos creados  🔧 0 corregidos

━━━ 5. SALUD WORKFLOWS ━━━
✅ Discovery  ✅ Enrichment (3h)  ✅ Merge (3h)
✅ Match 4AM  ✅ Super 8PM  ✅ SinM 8:30PM

SICI Auditoría v2.0 | Generado automáticamente
```

---

## Queries SQL

### Query 1: Propiedades + Calidad

```sql
SELECT
  -- Inventario
  COUNT(*) FILTER (WHERE status IN ('completado', 'actualizado')) as props_activas,
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmed') as props_inactivas,

  -- Actividad 24h
  COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours') as nuevas_24h,
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmed'
    AND updated_at >= NOW() - INTERVAL '24 hours') as inactivadas_24h,

  -- Calidad: Con proyecto
  COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL
    AND status IN ('completado', 'actualizado')) as con_proyecto,

  -- Calidad: Scores
  COUNT(*) FILTER (WHERE score_calidad_dato >= 95
    AND status IN ('completado', 'actualizado')) as score_alto,
  COUNT(*) FILTER (WHERE score_calidad_dato >= 85 AND score_calidad_dato < 95
    AND status IN ('completado', 'actualizado')) as score_medio,
  COUNT(*) FILTER (WHERE score_calidad_dato < 85
    AND status IN ('completado', 'actualizado')) as score_bajo,

  -- Calidad: Campos faltantes
  COUNT(*) FILTER (WHERE (zona IS NULL OR zona = '')
    AND status IN ('completado', 'actualizado')) as sin_zona,
  COUNT(*) FILTER (WHERE dormitorios IS NULL
    AND status IN ('completado', 'actualizado')) as sin_dormitorios,
  COUNT(*) FILTER (WHERE (nombre_edificio IS NULL OR nombre_edificio = '')
    AND status IN ('completado', 'actualizado')) as sin_nombre,

  -- Revisión humana
  COUNT(*) FILTER (WHERE es_para_matching = false
    AND status IN ('completado', 'actualizado')) as excluidas_matching,

  -- Health
  MAX(fecha_enrichment) as ultimo_enrichment,
  MAX(fecha_merge) as ultimo_merge,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_enrichment))) / 3600, 1) as horas_enrichment,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_merge))) / 3600, 1) as horas_merge,
  CASE WHEN COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '26 hours') > 0
    THEN true ELSE false END as discovery_ok
FROM propiedades_v2
```

### Query 2: Proyectos

```sql
SELECT
  COUNT(*) FILTER (WHERE activo = true) as proy_activos,
  COUNT(*) FILTER (WHERE activo = false) as proy_inactivos,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as proy_creados_24h,
  COUNT(*) FILTER (WHERE gps_verificado_google = true AND activo = true) as proy_gps_verificado
FROM proyectos_master
```

### Query 3: Matching + Sin Match

```sql
WITH matching_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'aprobado'
      AND updated_at >= NOW() - INTERVAL '24 hours') as aprobados_24h,
    COUNT(*) FILTER (WHERE estado = 'rechazado'
      AND updated_at >= NOW() - INTERVAL '24 hours') as rechazados_24h,
    COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes_matching,
    COUNT(*) FILTER (
      WHERE created_at >= DATE_TRUNC('day', NOW()) + INTERVAL '4 hours'
      AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '5 hours'
    ) as matching_nocturno_hoy,
    COUNT(*) FILTER (
      WHERE updated_at >= DATE_TRUNC('day', NOW()) - INTERVAL '4 hours'
      AND updated_at < DATE_TRUNC('day', NOW()) - INTERVAL '3 hours'
      AND estado IN ('aprobado', 'rechazado')
    ) as supervisor_match_ayer
  FROM matching_sugerencias
),
sinmatch_stats AS (
  SELECT
    COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes_sinmatch,
    COUNT(*) FILTER (WHERE estado = 'asignado'
      AND fecha_procesado >= NOW() - INTERVAL '24 hours') as asignados_24h,
    COUNT(*) FILTER (WHERE estado = 'creado'
      AND fecha_procesado >= NOW() - INTERVAL '24 hours') as creados_24h,
    COUNT(*) FILTER (WHERE estado = 'corregido'
      AND fecha_procesado >= NOW() - INTERVAL '24 hours') as corregidos_24h,
    COUNT(*) FILTER (
      WHERE fecha_procesado >= DATE_TRUNC('day', NOW()) - INTERVAL '3 hours' - INTERVAL '30 minutes'
      AND fecha_procesado < DATE_TRUNC('day', NOW()) - INTERVAL '2 hours' - INTERVAL '30 minutes'
    ) as supervisor_sinmatch_ayer
  FROM sin_match_exportados
)
SELECT * FROM matching_stats, sinmatch_stats
```

---

## Instalación

1. Importar `auditoria_diaria_sici.json` en n8n
2. Verificar credencial Postgres (`zd5IroT7BxnpW5U6`)
3. Verificar variable de entorno `SLACK_WEBHOOK_SICI`
4. Ejecutar manualmente para verificar
5. Activar workflow

---

## Changelog

### v2.0 (1 Ene 2026)
- Reestructurado a 5 secciones claras
- Agregado scores de calidad (alto/medio/bajo)
- Agregado campos faltantes (zona/dorms/nombre)
- Agregado sección Revisión Humana
- Mejorado health check de workflows
- Optimizado a 3 queries (antes 4)

### v1.0 (30 Dic 2025)
- Versión inicial con estadísticas básicas

---

## Futuras Mejoras

- [ ] INSERT a `auditoria_snapshots` para histórico
- [ ] Comparación con día/semana anterior
- [ ] Cobertura por fuente (Century21 vs Remax)
- [ ] Métricas de funnel Discovery→Enrich→Match

---

*Documentación actualizada 1 Enero 2026*
