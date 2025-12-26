# 🎯 PLAN MÓDULO 2: Matching Propiedades → Proyectos

> **Fecha:** 26 Diciembre 2025  
> **Estado:** Diseño aprobado - FASE 1 en progreso  
> **Prerequisito:** Módulo 1 ✅ 100% operativo  
> **Versión:** 2.1 (actualizado con enfoque v3.0)

---

## 📊 Estado Actual Confirmado

| Componente | Estado | Notas |
|------------|--------|-------|
| Fuzzy Pre-Matching | ✅ **YA IMPLEMENTADO** | En extractores v16.5 / v1.9 |
| `proyectos_master` | ✅ Existe | 152+ proyectos |
| Pipeline Nocturno | ✅ Operativo | 1-2-3-6 AM |
| `id_proyecto_master_sugerido` | ✅ Campo existe | Output de extractores |
| Funciones SQL Matching | ⚠️ **LEGACY** | Apuntan a tabla `propiedades` |

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

### FASE 1: Matching Nocturno (2.5-3 días) 🔥 CRÍTICO - EN PROGRESO

**Plan detallado:** Ver `PLAN_MATCHING_MULTIFUENTE_v3.0.md` en esta misma carpeta.

**Enfoque clave (actualización v2.1):**
- ❌ NO perseguir mejoras de regex en extractores
- ✅ Potenciar matching SQL con multi-fuente
- ✅ `generar_matches_por_url()` funciona SIN depender del extractor
- ✅ Usar columna + JSON como fallback

| # | Tarea | Esfuerzo | Estado |
|---|-------|----------|--------|
| 1.1 | Migrar funciones SQL a `propiedades_v2` | 4h | ⏳ Pendiente |
| 1.2 | Agregar fallback JSON en `generar_matches_por_nombre()` | 1h | ⏳ Pendiente |
| 1.3 | Agregar búsqueda en `alias_conocidos` | 2h | ⏳ Pendiente |
| 1.4 | Ejecutar matching y medir resultados | 2h | ⏳ Pendiente |
| 1.5 | Optimizar threshold/boost según métricas | 4h | ⏳ Pendiente |
| 1.6 | Activar cron nocturno 4:00 AM | 1h | ⏳ Pendiente |
| 1.7 | Validación y documentación | 2h | ⏳ Pendiente |

**Total Fase 1:** ~16 horas (~2.5-3 días)

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

### FASE 2: Validación de Sugerencias del Extractor (2-3 días)

El extractor ya genera `id_proyecto_master_sugerido`. Esta fase lo aprovecha.

| # | Tarea | Esfuerzo | Entregable |
|---|-------|----------|------------|
| 2.1 | Crear `validar_sugerencias_extractor()` | 3h | Función SQL |
| 2.2 | Integrar en matching_completo | 1h | Actualización |
| 2.3 | Dashboard sugerencias (Google Sheets) | 4h | Interface revisión |
| 2.4 | Testing integrado | 2h | Reporte |

**Total Fase 2:** ~10 horas (~2-3 días)

#### Lógica de validación:
```sql
-- Si extractor sugiere Y matching confirma → 100% confianza
-- Si solo extractor sugiere → 80% confianza (cola revisión)
-- Si solo matching sugiere → según método (85-95%)
```

---

### FASE 3: Enriquecimiento IA de Proyectos (3-4 días) 🟡

> **Objetivo:** Enriquecer `proyectos_master` con metadata que las propiedades heredarán post-match

| # | Tarea | Esfuerzo | Entregable |
|---|-------|----------|------------|
| 3.1 | Agregar columnas metadata a `proyectos_master` | 1h | Migración |
| 3.2 | Crear workflow "Enriquecedor IA" | 6h | n8n + Claude API |
| 3.3 | Prompt engineering para extracción | 4h | Prompts validados |
| 3.4 | Función `heredar_metadata_proyecto()` | 2h | SQL trigger/function |
| 3.5 | Testing con 20 proyectos | 3h | Validación manual |

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

### FASE 4: Validación GPS (Opcional) (1 semana) 🟢

> **Objetivo:** Validar/corregir GPS de proyectos_master usando Google Places

| # | Tarea | Esfuerzo | Entregable |
|---|-------|----------|------------|
| 4.1 | Workflow Google Places API | 6h | n8n workflow |
| 4.2 | Tabla `proyectos_pendientes_google` | 1h | Schema |
| 4.3 | Lógica de validación GPS | 4h | Funciones SQL |
| 4.4 | "Radar" para descubrir proyectos nuevos | 8h | Workflow completo |
| 4.5 | Testing y calibración | 4h | Reporte |

**Total Fase 4:** ~23 horas (~1 semana)

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

### Fase 1 (Matching Nocturno):
- [ ] Funciones SQL migradas a `propiedades_v2`
- [ ] Fallback JSON implementado
- [ ] Búsqueda en alias_conocidos activa
- [ ] Matching ejecutado exitosamente
- [ ] >60% propiedades con proyecto
- [ ] Cron 4:00 AM activo
- [ ] Documentación actualizada

### Fase 2 (Validación Sugerencias):
- [ ] Función validación creada
- [ ] Integrada en orquestador
- [ ] Google Sheets operativo
- [ ] Proceso revisión documentado

### Fase 3 (Enriquecimiento IA):
- [ ] Columnas metadata agregadas
- [ ] Workflow IA funcional
- [ ] 100% proyectos enriquecidos
- [ ] Herencia de metadata funcionando

### Fase 4 (GPS - Opcional):
- [ ] Workflow Google Places activo
- [ ] Radar mensual operativo
- [ ] GPS validados

---

## ⚠️ NOTAS IMPORTANTES

1. **FASE 1 tiene plan detallado separado** - Ver `PLAN_MATCHING_MULTIFUENTE_v3.0.md`
2. **NO mejorar extractores** - Enfoque en SQL, no regex
3. **God function es intencional** - `matching_completo_automatizado()` diseñado para zero human-in-the-loop
4. **Sistema de candados** - `campos_bloqueados` protege datos manuales
5. **Filosofía SICI** - "Manual wins over automatic"

---

**Autor:** Luis + Claude  
**Versión:** 2.1 (con referencia a Plan v3.0)  
**Estado:** FASE 1 en progreso
