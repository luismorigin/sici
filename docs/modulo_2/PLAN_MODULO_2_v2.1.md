# 🎯 PLAN MÓDULO 2: Matching Propiedades → Proyectos

> **Versión:** 2.2
> **Fecha:** 31 Diciembre 2025
> **Estado:** ✅ FASES 1, 2, 5 COMPLETADAS | ⚠️ FASE 4 PARCIAL | ❌ FASE 3 PENDIENTE
> **Prerequisito:** Módulo 1 ✅ 100% operativo

---

## 📊 Estado Actual (31 Dic 2025)

| Métrica | Valor |
|---------|-------|
| Total propiedades | 431 |
| Propiedades completadas | 350 |
| Con proyecto asignado | 338 (**96.6%**) |
| Proyectos activos | 190 |
| Pendientes de match | 1 |

| Componente | Estado | Notas |
|------------|--------|-------|
| Fuzzy Pre-Matching | ✅ Implementado | En extractores v16.5 / v1.9 |
| `proyectos_master` | ✅ Existe | 190 proyectos activos |
| Pipeline Nocturno | ✅ Operativo | 1-2-3-4-6-7 AM, 8-8:30 PM |
| Funciones SQL Matching | ✅ **v3.1** | Migradas a `propiedades_v2` |
| Human-in-the-Loop | ✅ **COMPLETO** | Sheets + Supervisores |

---

## 🏗️ Arquitectura del Matching

```
┌─────────────────────────────────────────────────────────────┐
│                    PIPELINE NOCTURNO                        │
├─────────────────────────────────────────────────────────────┤
│ 1:00 AM │ Flujo A Discovery      │ Captura URLs            │
│ 2:00 AM │ Flujo B Enrichment     │ Extrae 80+ campos       │
│         │                        │ + fuzzy pre-matching    │
│ 3:00 AM │ Flujo Merge            │ Fusiona D + E           │
│ 4:00 AM │ Flujo Matching 🔥      │ Asigna id_proyecto      │
│ 6:00 AM │ Flujo C Verificador    │ Confirma inactivos      │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 FASES DE IMPLEMENTACIÓN

### FASE 1: Matching Nocturno ✅ COMPLETADA (28 Dic 2025)

**Plan detallado:** Ver `PLAN_MATCHING_MULTIFUENTE_v3.0.md` en esta misma carpeta.

| # | Tarea | Estado |
|---|-------|--------|
| 1.1 | Migrar funciones SQL a `propiedades_v2` | ✅ Completado |
| 1.2 | Agregar fallback JSON en `generar_matches_por_nombre()` | ✅ Completado |
| 1.3 | Agregar búsqueda en `alias_conocidos` | ✅ Completado |
| 1.4 | Ejecutar matching y medir resultados | ✅ Completado |
| 1.5 | Optimizar threshold/boost según métricas | ✅ Completado |
| 1.6 | Activar cron nocturno 4:00 AM | ✅ Completado |
| 1.7 | Validación y documentación | ✅ Completado |

**Resultado:** 96.6% de propiedades con proyecto asignado

#### Cambios SQL Críticos:

```sql
-- MIGRACIÓN: Cambiar tabla
FROM propiedades p  →  FROM propiedades_v2 p

-- FALLBACK: Usar JSON si columna vacía
WHERE COALESCE(
  NULLIF(p.nombre_edificio, ''),
  p.datos_json_enrichment->>'nombre_edificio'
) IS NOT NULL

-- ALIAS: Buscar en alias_conocidos
ON LOWER(nombre_busqueda) = LOWER(pm.nombre_oficial)
   OR LOWER(nombre_busqueda) = ANY(
     SELECT LOWER(unnest(pm.alias_conocidos))
   )
```

#### Métricas de Éxito Fase 1:

| Métrica | Target | Mínimo |
|---------|--------|--------|
| Total con match | >60% | >40% |
| Auto-aprobados (≥85%) | >80% de matches | >60% |
| Pendientes (human review) | <20% | <30% |

---

### FASE 2: Human-in-the-Loop ✅ COMPLETADA (31 Dic 2025)

Sistema completo de revisión humana implementado.

| # | Tarea | Estado |
|---|-------|--------|
| 2.1 | Google Sheets Bandeja de Aprobación | ✅ Completado |
| 2.2 | Workflow Matching Supervisor | ✅ Completado |
| 2.3 | Workflow Exportar Sin Match | ✅ Completado |
| 2.4 | Workflow Supervisor Sin Match | ✅ Completado |
| 2.5 | Acción CORREGIR para ambos | ✅ Completado |
| 2.6 | Dropdown proyectos sincronizado | ✅ Completado |

**Acciones implementadas:**
- Pendientes Matching: APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO
- Sin Match: ASIGNAR, CREAR, CORREGIR, SIN_PROYECTO

**Migraciones:** 009-012

---

### FASE 3: Enriquecimiento IA de Proyectos ❌ PENDIENTE

> **Objetivo:** Enriquecer `proyectos_master` con metadata que las propiedades heredarán post-match

| # | Tarea | Esfuerzo | Estado |
|---|-------|----------|--------|
| 3.1 | Agregar columnas metadata a `proyectos_master` | 1h | ❌ Pendiente |
| 3.2 | Crear workflow "Enriquecedor IA" | 6h | ❌ Pendiente |
| 3.3 | Prompt engineering para extracción | 4h | ❌ Pendiente |
| 3.4 | Función `heredar_metadata_proyecto()` | 2h | ❌ Pendiente |
| 3.5 | Testing con 20 proyectos | 3h | ❌ Pendiente |

**Total Fase 3:** ~16 horas (~3-4 días)

#### Campos a enriquecer:
```sql
ALTER TABLE proyectos_master ADD COLUMN IF NOT EXISTS
  desarrolladora VARCHAR(100),
  ano_construccion INTEGER,
  total_unidades INTEGER,
  amenities_ia JSONB,
  descripcion_marketing TEXT,
  segmento_mercado VARCHAR(50),  -- 'premium', 'medio', 'economico'
  metadata_ia JSONB,
  fecha_enriquecimiento TIMESTAMPTZ;
```

---

### FASE 4: Validación GPS ⚠️ PARCIAL

> **Objetivo:** Validar/corregir GPS de proyectos_master usando Google Places

| # | Tarea | Esfuerzo | Estado |
|---|-------|----------|--------|
| 4.1 | Workflow Google Places API | 6h | ⚠️ Parcial (Radar) |
| 4.2 | Tabla `proyectos_pendientes_google` | 1h | ✅ Completado |
| 4.3 | Lógica de validación GPS | 4h | ❌ Pendiente |
| 4.4 | "Radar" para descubrir proyectos nuevos | 8h | ✅ Completado |
| 4.5 | Testing y calibración | 4h | ❌ Pendiente |

**Estado:** Radar Mensual existe y funciona. Validador GPS individual pendiente.

---

### FASE 5: Pipeline Nocturno ✅ COMPLETADA (29 Dic 2025)

| # | Tarea | Estado |
|---|-------|--------|
| 5.1 | Cron Matching Nocturno 4 AM | ✅ Completado |
| 5.2 | Cron Matching Supervisor 8 PM | ✅ Completado |
| 5.3 | Cron Exportar Sin Match 7 AM | ✅ Completado |
| 5.4 | Cron Supervisor Sin Match 8:30 PM | ✅ Completado |
| 5.5 | Cron Auditoría Diaria 9 AM | ⚠️ Funciona pero no guarda snapshots |

---

## 📅 TIMELINE ACTUALIZADO

```
Semana 1 (Dic 26-31):
├── Día 1-2: FASE 1.1-1.4 (Migrar + Ejecutar)
├── Día 3: FASE 1.5-1.7 (Optimizar + Activar)
└── Buffer para ajustes

Semana 2 (Ene 1-7):
├── Lun-Mar: FASE 2 completa (Validación sugerencias)
├── Mié-Vie: FASE 3 (Enriquecimiento IA)
└── Sáb: Buffer/ajustes

Semana 3 (Ene 8-14): OPCIONAL
└── FASE 4 (Validación GPS)
```

---

## 🎯 MÉTRICAS DE ÉXITO GLOBALES

| Métrica | Objetivo | Medición |
|---------|----------|----------|
| Propiedades con proyecto asignado | >80% | Query diagnóstico |
| Matches auto-aprobados | >70% | Logs matching |
| Tiempo revisión manual | <5 min/día | Google Sheets |
| Falsos positivos | <2% | Auditoría manual |

---

## 📊 QUERIES DE MONITOREO

### Pre-implementación:
```sql
-- ¿Cuántas propiedades sin proyecto?
SELECT 
  COUNT(*) FILTER (WHERE id_proyecto_master IS NULL) as sin_proyecto,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE id_proyecto_master IS NULL) / COUNT(*), 1) as pct
FROM propiedades_v2
WHERE status IN ('completado', 'actualizado');
```

### Post-implementación:
```sql
-- Dashboard matching diario
SELECT 
  DATE(created_at) as fecha,
  metodo_matching,
  estado,
  COUNT(*) as cantidad,
  ROUND(AVG(score_confianza), 2) as score_promedio
FROM matching_sugerencias
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;
```

---

## 📚 DOCUMENTOS RELACIONADOS

| Documento | Ruta | Propósito |
|-----------|------|-----------|
| Plan Matching v3.0 | `docs/modulo_2/PLAN_MATCHING_MULTIFUENTE_v3.0.md` | **Implementación detallada FASE 1** |
| Onboarding Claude | `docs/GUIA_ONBOARDING_CLAUDE.md` | Contexto general actualizado |
| Funciones SQL (código) | `sici-matching/.../Sql/funciones/` | Código a migrar |
| Matching Nocturno | `sici-matching/.../matching-nocturno.md` | Diseño original del pipeline |

---

## ✅ CHECKLIST DE COMPLETITUD

### Fase 1 (Matching Nocturno): ✅ COMPLETADA
- [x] Funciones SQL migradas a `propiedades_v2`
- [x] Fallback JSON implementado
- [x] Búsqueda en alias_conocidos activa
- [x] Matching ejecutado exitosamente
- [x] >60% propiedades con proyecto (96.6% alcanzado)
- [x] Cron 4:00 AM activo
- [x] Documentación actualizada

### Fase 2 (Human-in-the-Loop): ✅ COMPLETADA
- [x] Google Sheets Bandeja de Aprobación operativa
- [x] Workflow Matching Supervisor (8 PM)
- [x] Workflow Sin Match Exportar/Supervisor
- [x] Acciones APROBAR, RECHAZAR, CORREGIR, PROYECTO_ALTERNATIVO
- [x] Acciones ASIGNAR, CREAR, SIN_PROYECTO
- [x] Dropdown proyectos sincronizado
- [x] Proceso revisión documentado

### Fase 3 (Enriquecimiento IA): ❌ PENDIENTE
- [ ] Columnas metadata agregadas a proyectos_master
- [ ] Workflow IA funcional
- [ ] 100% proyectos enriquecidos
- [ ] Función heredar_metadata_proyecto()

### Fase 4 (GPS): ⚠️ PARCIAL
- [x] Workflow Radar Mensual operativo
- [ ] Workflow Validador GPS individual
- [ ] GPS de proyectos verificados

### Fase 5 (Pipeline Nocturno): ✅ COMPLETADA
- [x] Cron Matching Nocturno 4 AM
- [x] Cron Matching Supervisor 8 PM
- [x] Cron Exportar Sin Match 7 AM
- [x] Cron Supervisor Sin Match 8:30 PM
- [x] Cron Auditoría Diaria 9 AM (⚠️ no guarda snapshots)

---

## ⚠️ NOTAS IMPORTANTES

1. **FASE 1 tiene plan detallado separado** - Ver `PLAN_MATCHING_MULTIFUENTE_v3.0.md`
2. **NO mejorar extractores** - Enfoque en SQL, no regex
3. **Human-in-the-Loop activo** - Sugerencias 70-84% van a revisión humana en Google Sheets
4. **Sistema de candados** - `campos_bloqueados` protege datos manuales
5. **Filosofía SICI** - "Manual wins over automatic"
6. **Auditoría snapshots** - Workflow funciona pero no guarda snapshots (bug pendiente)

---

**Autor:** Luis + Claude
**Versión:** 2.2 (actualizado 31 Dic 2025)
**Estado:** FASES 1, 2, 5 COMPLETADAS - FASE 3 PENDIENTE
