# Auditoría Diaria SICI - Especificación

> **Versión:** 1.0
> **Fecha:** 30 Diciembre 2025
> **Workflow:** `n8n/workflows/modulo_2/auditoria_diaria_sici.json`

---

## Objetivo

Generar un reporte diario consolidado del estado completo del sistema SICI, independiente de los flujos operacionales.

## Ejecución

| Parámetro | Valor |
|-----------|-------|
| Horario | 9:00 AM (Bolivia UTC-4) |
| Frecuencia | Diario (incluyendo fines de semana) |
| Notificación | Slack (mismo webhook que Supervisor) |

## Arquitectura

```
Schedule 9:00 AM
       │
       ▼
┌──────────────────┐
│ PG: Stats Props  │ ─── Total, status, matcheadas, nombre_edificio
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ PG: Stats Match  │ ─── Sugerencias 24h, estados, nocturno 4AM
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ PG: Stats Proy   │ ─── Total, GPS verificado, pendientes Google
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ PG: Health Check │ ─── Último enrichment/merge, horas sin actividad
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Code: Consolidar │ ─── Calcular %, alertas, formatear
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Slack: Reporte   │ ─── Mensaje formateado con Block Kit
└──────────────────┘
```

## Métricas Reportadas

### Propiedades

| Métrica | Descripción |
|---------|-------------|
| Total | Todas las propiedades en propiedades_v2 |
| Completadas | Status = 'completado' |
| Matcheadas | Con id_proyecto_master asignado |
| % Match | matcheadas / completadas * 100 |
| Con nombre | nombre_edificio no vacío |
| % Nombre | con_nombre / completadas * 100 |
| Pendientes enrich | Status = 'nueva' AND tipo_operacion = 'venta' |
| Creadas 24h | fecha_creacion >= NOW() - 24h |
| Enriquecidas 24h | fecha_enrichment >= NOW() - 24h |

### Matching

| Métrica | Descripción |
|---------|-------------|
| Sugerencias 24h | Creadas en últimas 24 horas |
| Aprobadas 24h | Estado = 'aprobado' en 24h |
| Rechazadas 24h | Estado = 'rechazado' en 24h |
| Tasa aprobación | aprobadas / sugerencias * 100 |
| Pendientes revisión | Estado = 'pendiente' (cualquier fecha) |
| Nocturno 4AM | Sugerencias creadas hoy entre 4-5 AM |

### Proyectos

| Métrica | Descripción |
|---------|-------------|
| Total | Todos los proyectos en proyectos_master |
| GPS verificado | gps_verificado_google = true |
| Con Place ID | google_place_id no nulo |
| Pendientes Google | Estado = 'pendiente' en proyectos_pendientes_google |

### Health Check

| Métrica | Descripción | Umbral Alerta |
|---------|-------------|---------------|
| Horas sin enrichment | Tiempo desde último fecha_enrichment | > 26h |
| Horas sin merge | Tiempo desde último fecha_merge | > 26h |
| Matching nocturno | Si hubo sugerencias entre 4-5 AM hoy | = 0 |

## Sistema de Alertas

Las alertas aparecen en la parte superior del mensaje cuando se cumplen estas condiciones:

| Condición | Mensaje |
|-----------|---------|
| `pendientes_revision > 5` | "Revisar bandeja de matching" |
| `horas_sin_enrichment > 26` | "Flujo B no corrió en 24h" |
| `nuevas_venta > 50` | "Backlog de enrichment creciendo" |
| `pct_match_completadas < 50` | "Cobertura de matching baja" |

## Ejemplo de Mensaje Slack

```
📊 SICI Auditoría Diaria — 30 dic 2025

🚨 ALERTAS: Backlog de enrichment creciendo

📦 PROPIEDADES
Total: 430          Completadas: 251
Matcheadas: 143 (56.9%)   Sin match: 108
Con nombre: 181 (72.1%)   Pendientes enrich: 102

Últimas 24h: +2 creadas, +10 enriquecidas
─────────────────────────────────────────
🔗 MATCHING
Sugerencias 24h: 23       Aprobadas: 21 ✅
Rechazadas: 2 ❌          Tasa aprob: 91.3%
Pendientes revisión: 1    Nocturno 4AM: ✅ Corrió
─────────────────────────────────────────
🏢 PROYECTOS
Total: 172                GPS verificado: 168 (97.7%)
Con Place ID: 136         Pendientes Google: 1
─────────────────────────────────────────
⚡ HEALTH CHECK
Flujo B (Enrichment): ✅ hace 2.5h
Merge: ✅ hace 2.5h

📈 Total sugerencias históricas: 198 | Generado automáticamente
```

## Instalación

1. Importar `auditoria_diaria_sici.json` en n8n
2. Configurar credencial Postgres (reemplazar `POSTGRES_CREDENTIAL_ID`)
3. Verificar variable de entorno `SLACK_WEBHOOK_SICI`
4. Activar workflow
5. (Opcional) Ejecutar manualmente para verificar

## Queries SQL

### Stats Propiedades
```sql
SELECT
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'completado') as completadas,
  COUNT(*) FILTER (WHERE status = 'nueva') as nuevas,
  COUNT(*) FILTER (WHERE status = 'nueva' AND tipo_operacion = 'venta') as nuevas_venta,
  COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL) as matcheadas,
  COUNT(*) FILTER (WHERE id_proyecto_master IS NULL AND status = 'completado') as sin_match,
  COUNT(*) FILTER (WHERE nombre_edificio IS NOT NULL AND nombre_edificio != '') as con_nombre,
  COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours') as creadas_24h,
  COUNT(*) FILTER (WHERE fecha_enrichment >= NOW() - INTERVAL '24 hours') as enriquecidas_24h
FROM propiedades_v2
```

### Stats Matching
```sql
SELECT
  COUNT(*) as sugerencias_total,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as sugerencias_24h,
  COUNT(*) FILTER (WHERE estado = 'aprobado' AND created_at >= NOW() - INTERVAL '24 hours') as aprobadas_24h,
  COUNT(*) FILTER (WHERE estado = 'rechazado' AND created_at >= NOW() - INTERVAL '24 hours') as rechazadas_24h,
  COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes_revision,
  COUNT(*) FILTER (
    WHERE created_at >= DATE_TRUNC('day', NOW()) + INTERVAL '4 hours'
    AND created_at < DATE_TRUNC('day', NOW()) + INTERVAL '5 hours'
  ) as matching_nocturno_hoy
FROM matching_sugerencias
```

### Health Check
```sql
SELECT
  MAX(fecha_enrichment) as ultimo_enrichment,
  MAX(fecha_merge) as ultimo_merge,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_enrichment))) / 3600, 1) as horas_sin_enrichment,
  ROUND(EXTRACT(EPOCH FROM (NOW() - MAX(fecha_merge))) / 3600, 1) as horas_sin_merge
FROM propiedades_v2
WHERE fecha_enrichment IS NOT NULL
```

## Futuras Mejoras

- [ ] Guardar snapshots en tabla `auditoria_snapshots` para tendencias
- [ ] Comparación con día/semana anterior
- [ ] Gráficos de tendencia (requiere servicio externo)
- [ ] Alertas por email además de Slack

---

*Documentación generada el 30 de Diciembre 2025*
