# Auditoria Diaria SICI - Especificacion

> **Version:** 2.5
> **Fecha:** 3 Enero 2026
> **Workflow:** `n8n/workflows/modulo_2/auditoria_diaria_sici.json`

---

## Objetivo

Generar un reporte diario consolidado del estado completo del sistema SICI con 8 secciones.

## Ejecucion

| Parametro | Valor |
|-----------|-------|
| Horario | 9:00 AM (Bolivia UTC-4) |
| Frecuencia | Diario (incluyendo fines de semana) |
| Notificacion | Slack (webhook `$env.SLACK_WEBHOOK_SICI`) |

## Arquitectura v2.4

```
Schedule 9:00 AM
       |
       v
+----------------------+
| PG: Stats Propiedades| --- Estados, calidad, scores, discrepancias merge
+----------+-----------+
           |
           v
+----------------------+
| PG: Stats Matching   | --- Sugerencias, pendientes, health nocturno/supervisor
+----------+-----------+
           |
           v
+----------------------+
| PG: Stats Proyectos  | --- Total, GPS verificado, Place ID, pendientes Google
+----------+-----------+
           |
           v
+----------------------+
| PG: Stats Sin Match  | --- Pendientes, export 7AM, supervisor 8:30PM
+----------+-----------+
           |
           v
+----------------------+
| PG: Stats TC         | --- TC paralelo/oficial, consultas Binance 24h
+----------+-----------+
           |
           v
+------------------------+
| PG: Stats Workflows    | --- Consulta workflow_executions para health check
+----------+-------------+
           |
           v
+----------------------+
| Code: Consolidar     | --- Calcular %, alertas, formatear, preparar snapshot
+----------+-----------+
           |
     ------+------
     |           |
     v           v
+----------+ +------------------+
| Slack    | | PG: Insert       |
| Reporte  | | Snapshot (UPSERT)|
+----------+ +------------------+
           |
           v
+-------------------------+
| PG: Registrar Ejecución | --- Registra en workflow_executions
+-------------------------+
```

---

## Secciones del Reporte

### 1. PROPIEDADES

| Metrica | Query |
|---------|-------|
| Completadas | `status = 'completado'` |
| Nuevas | `status = 'nueva'` |
| Inactivo pending | `status = 'inactivo_pending'` |
| Inactivo confirmed | `status = 'inactivo_confirmed'` |
| Total | COUNT(*) |
| Matcheadas | `id_proyecto_master IS NOT NULL AND status = 'completado'` |
| Sin match | `id_proyecto_master IS NULL AND status = 'completado'` |
| Con nombre | `nombre_edificio IS NOT NULL AND != ''` |
| Pendientes enrich | `status = 'nueva' AND tipo_operacion = 'venta'` |
| Creadas 24h | `fecha_creacion >= NOW() - 24h` |
| Enriquecidas 24h | `fecha_enrichment >= NOW() - 24h` |

### 2. CALIDAD DE DATOS

| Metrica | Query |
|---------|-------|
| Score alto (>=95) | `score_calidad_dato >= 95 AND status = 'completado'` |
| Score medio (85-94) | `score_calidad_dato >= 85 AND < 95` |
| Score bajo (<85) | `score_calidad_dato < 85` |
| Sin zona | `zona IS NULL OR zona = ''` |
| Sin dormitorios | `dormitorios IS NULL` |
| Sin nombre | `nombre_edificio IS NULL OR = ''` |

### 3. MATCHING

| Metrica | Query |
|---------|-------|
| Sugerencias 24h | `created_at >= NOW() - 24h` |
| Aprobadas 24h | `estado = 'aprobado' AND fecha_revision >= 24h` |
| Rechazadas 24h | `estado = 'rechazado' AND fecha_revision >= 24h` |
| Tasa aprobacion | aprobadas / sugerencias * 100 |
| Pendientes revision | `estado = 'pendiente'` |
| Nocturno 4AM | Sugerencias creadas entre 4-5 AM hoy |

### 4. REVISION HUMANA

| Metrica | Tabla | Query |
|---------|-------|-------|
| Pendientes matching | `matching_sugerencias` | `estado = 'pendiente'` |
| Pendientes sin_match | `sin_match_exportados` | `estado = 'pendiente'` |
| Discrepancias merge | `propiedades_v2` | Flags en `discrepancias_detectadas` |
| Excluidas matching | `propiedades_v2` | `es_para_matching = false` |

### 5. PROYECTOS

| Metrica | Query |
|---------|-------|
| Total | COUNT(*) |
| GPS verificado | `gps_verificado_google = true` |
| Con Place ID | `google_place_id IS NOT NULL` |
| Pendientes Google | `proyectos_pendientes_google.estado = 'pendiente'` |

### 6. TC DINAMICO

> **v2.4:** Nueva sección que muestra el estado del tipo de cambio y la integración con Binance P2P.

| Metrica | Query |
|---------|-------|
| TC Paralelo | `config_global.valor WHERE clave = 'tipo_cambio_paralelo'` |
| TC Oficial | `config_global.valor WHERE clave = 'tipo_cambio_oficial'` |
| Consultas Binance 24h | `tc_binance_historial WHERE timestamp >= 24h` |
| Workflow TC Binance | `workflow_executions.ran_last_26h` |

### 7. HEALTH CHECK

> **v2.3:** Ahora usa tabla `workflow_executions` como fuente primaria, con fallback a inferencia por timestamps.

| Workflow | Fuente Primaria (v2.3) | Fallback (si tabla vacía) |
|----------|------------------------|---------------------------|
| Discovery | `workflow_executions.ran_last_26h` | `fecha_creacion >= 26h` en propiedades_v2 |
| Enrichment | `workflow_executions.ran_last_26h` | `MAX(fecha_enrichment) < 26h` |
| Merge | `workflow_executions.ran_last_26h` | `MAX(fecha_merge) < 26h` |
| Matching Nocturno | `workflow_executions.ran_last_26h` | Sugerencias entre 4-5 AM hoy |
| TC Binance | `workflow_executions.ran_last_26h` | N/A |
| Export 7AM | `workflow_executions.ran_last_26h` | `fecha_export` entre 7-8 AM hoy |
| Super 8PM | `workflow_executions.ran_last_26h` | Procesados entre 20-21h ayer |
| Super SinM 8:30PM | `workflow_executions.ran_last_26h` | `fecha_procesado` entre 20:30-21:30h |

### 8. FOOTER

- Total sugerencias historicas
- Version del reporte

---

## Sistema de Alertas

| Condicion | Mensaje |
|-----------|---------|
| `total_pendientes > 5` | "X pendientes revision" |
| `discrepancias_merge > 0` | "X discrepancias merge" |
| `horas_enrichment > 26` | "Enrichment no corrio en 26h" |
| `discovery_ok = false` | "Discovery no corrio en 26h" |
| `pct_match < 90` | "Cobertura matching <90%" |
| `pct_bajo > 5` | "X% calidad baja" |

---

## Ejemplo de Mensaje Slack v2.4

```
SICI Auditoria Diaria - 3 ene 2026

ALERTAS: 2 discrepancias merge

----------------------------------------

PROPIEDADES

Completadas: 350              Nuevas: 36
Inactivo pending: 44          Inactivo confirmed: 2
Total: 432

Matcheadas: 338 (96.6%)       Sin match: 12
Con nombre: 280 (80%)         Pendientes enrich: 5

Ultimas 24h: +2 creadas, +3 enriquecidas

----------------------------------------

CALIDAD DE DATOS

Score alto (>=95): 252 (72%)  Score medio: 88 (25%)
Score bajo (<85): 10 (3%)

Faltantes: zona 54 | dorms 15 | nombre 70

----------------------------------------

MATCHING

Sugerencias 24h: 10           Aprobadas: 8
Rechazadas: 2                 Tasa aprob: 80%
Pendientes revision: 2        Nocturno 4AM: Corrio

----------------------------------------

REVISION HUMANA

Pendientes matching: 2        Pendientes sin_match: 0
Discrepancias merge: 2        Excluidas matching: 20

----------------------------------------

PROYECTOS

Total: 202                    GPS verificado: 168 (83.2%)
Con Place ID: 95              Pendientes Google: 5

----------------------------------------

TC DINAMICO

TC Paralelo: 9.67 BOB/USD     TC Oficial: 6.96 BOB/USD
Consultas Binance 24h: 1      Workflow: Corrio

----------------------------------------

HEALTH CHECK

Discovery: OK                 Enrichment: OK hace 3h
Merge: OK hace 3h             TC Binance: OK
Export 7AM: OK                Nocturno 4AM: OK
Super 8PM: OK                 Super SinM 8:30PM: OK

----------------------------------------

Total sugerencias historicas: 847 | SICI Auditoria v2.4
```

---

## Queries SQL

### Query 1: Propiedades + Calidad + Discrepancias

```sql
SELECT
  -- Estados (todos)
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completado') as completadas,
  COUNT(*) FILTER (WHERE status = 'nueva') as nuevas,
  COUNT(*) FILTER (WHERE status = 'inactivo_pending') as inactivo_pending,
  COUNT(*) FILTER (WHERE status = 'inactivo_confirmed') as inactivo_confirmed,

  -- Matching
  COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL
    AND status = 'completado') as matcheadas,
  COUNT(*) FILTER (WHERE id_proyecto_master IS NULL
    AND status = 'completado') as sin_match,
  COUNT(*) FILTER (WHERE nombre_edificio IS NOT NULL
    AND nombre_edificio != '' AND status = 'completado') as con_nombre,

  -- Pendientes enrich
  COUNT(*) FILTER (WHERE status = 'nueva'
    AND tipo_operacion = 'venta') as pendientes_enrich,

  -- Actividad 24h
  COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours') as creadas_24h,
  COUNT(*) FILTER (WHERE fecha_enrichment >= NOW() - INTERVAL '24 hours') as enriquecidas_24h,

  -- Calidad: Scores
  COUNT(*) FILTER (WHERE score_calidad_dato >= 95
    AND status = 'completado') as score_alto,
  COUNT(*) FILTER (WHERE score_calidad_dato >= 85 AND score_calidad_dato < 95
    AND status = 'completado') as score_medio,
  COUNT(*) FILTER (WHERE score_calidad_dato < 85
    AND status = 'completado') as score_bajo,

  -- Calidad: Campos faltantes
  COUNT(*) FILTER (WHERE (zona IS NULL OR zona = '')
    AND status = 'completado') as sin_zona,
  COUNT(*) FILTER (WHERE dormitorios IS NULL
    AND status = 'completado') as sin_dormitorios,
  COUNT(*) FILTER (WHERE (nombre_edificio IS NULL OR nombre_edificio = '')
    AND status = 'completado') as sin_nombre,

  -- Discrepancias merge (flags activos)
  COUNT(*) FILTER (WHERE (
    (discrepancias_detectadas->'gps'->>'flag' IS NOT NULL
      AND discrepancias_detectadas->'gps'->>'flag' != 'null') OR
    (discrepancias_detectadas->'area'->>'flag' IS NOT NULL
      AND discrepancias_detectadas->'area'->>'flag' != 'null') OR
    (discrepancias_detectadas->'precio'->>'flag' IS NOT NULL
      AND discrepancias_detectadas->'precio'->>'flag' != 'null')
  )) as discrepancias_merge,

  -- Excluidas matching
  COUNT(*) FILTER (WHERE es_para_matching = false
    AND status = 'completado') as excluidas_matching,

  -- Health
  MAX(fecha_enrichment) as ultimo_enrichment,
  MAX(fecha_merge) as ultimo_merge,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_enrichment))) / 3600, 1) as horas_sin_enrichment,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_merge))) / 3600, 1) as horas_sin_merge,
  CASE WHEN COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '26 hours') > 0
    THEN true ELSE false END as discovery_ok,
  CASE WHEN COUNT(*) FILTER (WHERE status = 'inactivo_confirmed'
    AND fecha_inactivacion >= NOW() - INTERVAL '26 hours') > 0
    THEN true ELSE false END as tc_dinamico_ok
FROM propiedades_v2
```

### Query 2: Matching

```sql
SELECT
  COUNT(*) as sugerencias_total,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as sugerencias_24h,
  COUNT(*) FILTER (WHERE estado = 'aprobado'
    AND fecha_revision >= NOW() - INTERVAL '24 hours') as aprobadas_24h,
  COUNT(*) FILTER (WHERE estado = 'rechazado'
    AND fecha_revision >= NOW() - INTERVAL '24 hours') as rechazadas_24h,
  COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes_matching,
  COUNT(*) FILTER (
    WHERE created_at >= DATE_TRUNC('day', NOW()) + INTERVAL '4 hours'
    AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '5 hours'
  ) as matching_nocturno_hoy,
  COUNT(*) FILTER (
    WHERE fecha_revision >= DATE_TRUNC('day', NOW()) - INTERVAL '4 hours'
    AND fecha_revision < DATE_TRUNC('day', NOW()) - INTERVAL '3 hours'
    AND estado IN ('aprobado', 'rechazado')
  ) as supervisor_match_ayer
FROM matching_sugerencias
```

### Query 3: Proyectos

```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE activo = true) as activos,
  COUNT(*) FILTER (WHERE gps_verificado_google = true) as gps_verificado,
  COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) as con_place_id,
  COALESCE((SELECT COUNT(*) FROM proyectos_pendientes_google
    WHERE estado = 'pendiente'), 0) as pendientes_google
FROM proyectos_master
```

### Query 4: Sin Match

```sql
SELECT
  COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes_sinmatch,
  COUNT(*) FILTER (
    WHERE fecha_export >= DATE_TRUNC('day', NOW()) + INTERVAL '7 hours'
    AND fecha_export < DATE_TRUNC('day', NOW()) + INTERVAL '8 hours'
  ) as export_7am_hoy,
  COUNT(*) FILTER (
    WHERE fecha_procesado >= DATE_TRUNC('day', NOW()) - INTERVAL '3 hours' - INTERVAL '30 minutes'
    AND fecha_procesado < DATE_TRUNC('day', NOW()) - INTERVAL '2 hours' - INTERVAL '30 minutes'
  ) as supervisor_sinmatch_ayer
FROM sin_match_exportados
```

### Query 5: Stats TC (v2.4)

> Consulta el estado del tipo de cambio y las consultas a Binance P2P.

```sql
SELECT
  (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo') as tc_paralelo,
  (SELECT valor FROM config_global WHERE clave = 'tipo_cambio_oficial') as tc_oficial,
  (SELECT MAX(fecha_cambio) FROM auditoria_tipo_cambio) as ultimo_cambio_tc,
  (SELECT COUNT(*) FROM tc_binance_historial
    WHERE timestamp >= NOW() - INTERVAL '24 hours') as consultas_binance_24h,
  (SELECT MAX(timestamp) FROM tc_binance_historial) as ultima_consulta_binance
```

### Query 6: Stats Workflows (v2.4)

> Consulta la tabla `workflow_executions` para determinar si cada workflow corrió en las últimas 26 horas.

```sql
SELECT
  CASE
    WHEN workflow_name IN ('discovery_century21', 'discovery_remax') THEN 'discovery'
    ELSE workflow_name
  END as workflow_name,
  MAX(finished_at) as last_run,
  BOOL_OR(finished_at >= NOW() - INTERVAL '26 hours') as ran_last_26h,
  BOOL_OR(
    workflow_name = 'matching_nocturno' AND
    finished_at >= DATE_TRUNC('day', NOW()) + INTERVAL '4 hours' AND
    finished_at < DATE_TRUNC('day', NOW()) + INTERVAL '5 hours'
  ) as ran_at_scheduled_time
FROM workflow_executions
WHERE workflow_name IN (
  'discovery_century21', 'discovery_remax', 'discovery',
  'enrichment', 'merge', 'matching_nocturno',
  'matching_supervisor', 'exportar_sin_match',
  'supervisor_sin_match', 'radar_mensual', 'auditoria_diaria',
  'tc_dinamico_binance'
)
GROUP BY CASE
    WHEN workflow_name IN ('discovery_century21', 'discovery_remax') THEN 'discovery'
    ELSE workflow_name
  END;
```

> **Nota:** Usa `BOOL_OR()` en lugar de `MAX(boolean)` porque PostgreSQL no soporta MAX para booleanos.

---

## Instalacion

1. Importar `auditoria_diaria_sici.json` en n8n
2. Verificar credencial Postgres (`zd5IroT7BxnpW5U6`)
3. Verificar variable de entorno `SLACK_WEBHOOK_SICI`
4. Ejecutar manualmente para verificar
5. Activar workflow

---

## Changelog

### v2.5 (3 Ene 2026)
- **Nuevo status `excluido_operacion` para propiedades de alquiler/anticrético**
- Nueva métrica "Excluidas op" en sección PROPIEDADES
- Migración: 32 propiedades existentes marcadas con nuevo status
- Función `registrar_discovery()` actualizada para asignar status automáticamente
- ENUM `estado_propiedad` extendido con nuevo valor

### v2.4 (3 Ene 2026)
- **Integración TC Dinámico Binance en auditoría**
- Nueva sección "TC DINAMICO" en el mensaje Slack con TC paralelo/oficial y consultas Binance
- Nuevo nodo `PG: Stats TC` para obtener datos de tipo de cambio
- Workflow `tc_dinamico_binance` agregado al health check
- Renombrado "TC Dinámico" → "TC Binance" en Health Check para claridad
- Fix: `horasSinEnrichment` y `horasSinMerge` ahora se calculan desde `workflow_executions.last_run` (preferido) en lugar de propiedades_v2 (fallback)
- Total secciones: 8 (antes 7)

### v2.3 (2 Ene 2026)
- **Sistema de tracking de ejecuciones de workflows**
- Nueva tabla `workflow_executions` para registrar cuando corren los workflows
- Nuevo nodo `PG: Stats Workflows` con query usando `BOOL_OR()`
- Health check ahora usa fuente primaria (workflow_executions) + fallback (timestamps)
- Nodo `PG: Registrar Ejecución` al final del workflow
- Fix: `MAX(boolean)` → `BOOL_OR()` (PostgreSQL no soporta MAX para booleanos)
- Soporte para discovery_century21 y discovery_remax agrupados como 'discovery'

### v2.2 (1 Ene 2026)
- **Guardado de snapshots en `auditoria_snapshots`**
- Nuevo nodo PG: Insert Snapshot con UPSERT
- 21 columnas nuevas en tabla (scores, health checks, etc.)
- Ejecucion paralela: Slack + Insert Snapshot
- Bug de tabla vacia RESUELTO

### v2.1 (1 Ene 2026)
- Restaurado formato original (dos columnas, dividers suaves)
- Agregado todos los estados de propiedades
- Agregado seccion Calidad de Datos (scores + faltantes)
- Agregado seccion Revision Humana (pendientes + discrepancias merge)
- Ampliado Health Check a 8 workflows
- Mantenido Total sugerencias historicas

### v2.0 (1 Ene 2026)
- Reestructurado a 5 secciones (formato roto)

### v1.0 (30 Dic 2025)
- Version inicial con estadisticas basicas

---

*Documentacion actualizada 3 Enero 2026*
