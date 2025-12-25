# Plan Módulo 2 - Matching de Propiedades v2.0

**Sistema:** SICI - Sistema Inteligente de Captura Inmobiliaria  
**Módulo:** Módulo 2 - Matching de Propiedades  
**Fecha:** 25 Diciembre 2025  
**Estado:** 🚧 EN IMPLEMENTACIÓN (Fase 0 completada)

---

## 📊 DIAGNÓSTICO ACTUAL (24 Dic 2025)

### Estado de la Base de Datos

| Tabla | Registros | Estado |
|-------|-----------|--------|
| `propiedades_v2` | 427 | ✅ Producción (Módulo 1) |
| `proyectos_master` | 165 | ✅ Poblada |
| `matching_sugerencias` | 152 | ⚠️ Apunta a tabla vieja |
| `propiedades` (legacy) | ? | 🔴 Deprecada |

### Estado del Matching

| Métrica | Valor | Observación |
|---------|-------|-------------|
| Propiedades activas | 395 | status IN (completado, actualizado, nueva) |
| Con proyecto asignado | 0 | 0% matcheadas |
| Sin proyecto asignado | 395 | 100% pendientes |
| Proyectos disponibles | 165 | Base de verdad verificada |

### Funciones SQL Existentes

| Función | Existe | Problema |
|---------|--------|----------|
| `matching_completo_automatizado()` | ✅ | Apunta a `propiedades` |
| `generar_matches_por_nombre()` | ✅ | Apunta a `propiedades` |
| `generar_matches_por_url()` | ✅ | Apunta a `propiedades` |
| `generar_matches_fuzzy()` | ✅ | Apunta a `propiedades` |
| `aplicar_matches_aprobados()` | ✅ | Apunta a `propiedades` |

### 🚨 Problemas Identificados (Análisis Sistemático)

**1. Tabla incorrecta:** Las funciones SQL apuntan a `propiedades` (deprecada) en lugar de `propiedades_v2`.

**2. Columnas faltantes:** Las funciones de matching esperan columnas que NO existen en `propiedades_v2`:

| Columna | Usada por | Ubicación actual | Impacto si falta |
|---------|-----------|------------------|------------------|
| `nombre_edificio` | `generar_matches_por_nombre()`, `generar_matches_fuzzy()` | `datos_json.proyecto.nombre_edificio` | ❌ Matching por nombre NO funciona |
| `zona` | `generar_matches_fuzzy()` (filtro: `pp.zona = ppm.zona`) | `datos_json.ubicacion.zona_validada_gps` | ❌ Fuzzy matching sin filtro geográfico |

### Solución Sistemática (No parches)

Para que el sistema sea **sostenible**, los cambios deben hacerse en **3 niveles**:

```
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 1: SCHEMA (una vez)                                   │
│ ALTER TABLE propiedades_v2 ADD COLUMN nombre_edificio...    │
│ ALTER TABLE propiedades_v2 ADD COLUMN zona...               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 2: MERGE FUNCTION (permanente)                        │
│ Modificar merge_discovery_enrichment() para poblar:         │
│   - nombre_edificio = enrichment->>'nombre_edificio'        │
│   - zona = enrichment->>'zona_validada_gps'                 │
│ Así cada propiedad nueva/actualizada tendrá estos campos    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 3: MIGRACIÓN (una vez)                                │
│ UPDATE propiedades_v2 SET nombre_edificio = ..., zona = ... │
│ Para poblar las 427 propiedades existentes                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ NIVEL 4: FUNCIONES MATCHING                                 │
│ Cambiar FROM propiedades → FROM propiedades_v2              │
│ (las columnas ya existirán)                                 │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 OBJETIVOS DEL MÓDULO 2

### Objetivo Principal
Asociar cada propiedad en `propiedades_v2` con su proyecto correspondiente en `proyectos_master`.

### Objetivos Específicos
1. ✅ Migrar funciones SQL a `propiedades_v2`
2. ✅ Ejecutar matching inicial (395 propiedades pendientes)
3. ✅ Configurar Matching Nocturno automatizado (4AM)
4. ✅ Integrar con pipeline Módulo 1
5. 🟡 Activar Fuzzy Pre-Matching en extractores (opcional)

### Métricas de Éxito
- **Tasa de matching automático:** ≥70% (≥277 propiedades)
- **Precisión (sin falsos positivos):** ≥95%
- **Propiedades pendientes revisión:** ≤20%

---

## 🏗️ ARQUITECTURA

### Flujo de Datos

```
┌─────────────────────────────────────────────────────────────┐
│ MÓDULO 1 (✅ Completado)                                    │
│                                                             │
│ 1:00 AM → Discovery (C21 + Remax)                          │
│ 2:00 AM → Enrichment (Flujo B)                             │
│ 3:00 AM → Merge                                            │
│           ↓                                                 │
│    propiedades_v2 (427 registros)                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ MÓDULO 2 (⏳ Por Implementar)                               │
│                                                             │
│ 4:00 AM → Matching Nocturno                                │
│           ↓                                                 │
│    matching_completo_automatizado()                        │
│           │                                                 │
│           ├─ generar_matches_por_nombre()  → 95% confianza │
│           ├─ generar_matches_por_url()     → 85% confianza │
│           └─ generar_matches_fuzzy()       → 70-90%        │
│           ↓                                                 │
│    matching_sugerencias (cola de revisión)                 │
│           ↓                                                 │
│    aplicar_matches_aprobados()                             │
│           ↓                                                 │
│    propiedades_v2.id_proyecto_master = X                   │
└─────────────────────────────────────────────────────────────┘
```

### Sistema de Confianza

| Score | Clasificación | Acción |
|-------|---------------|--------|
| ≥ 85% | Alta | Auto-aprobar |
| 70-84% | Media | Revisión manual |
| < 70% | Baja | Auto-rechazar |

---

## 📋 PLAN DE IMPLEMENTACIÓN

### Fase 0: Preparación Schema + Merge ✅ COMPLETADA (25 Dic 2025)
**Objetivo:** Agregar columnas faltantes Y modificar merge para poblarlas automáticamente

| # | Tarea | Tipo | Estado |
|---|-------|------|--------|
| 0.1 | Agregar columna `nombre_edificio VARCHAR` | Schema | ✅ Completado |
| 0.2 | Agregar columna `zona VARCHAR` | Schema | ✅ Completado |
| 0.3 | Crear índices para búsquedas | Schema | ✅ Completado |
| 0.4 | Modificar `merge_discovery_enrichment()` v2.1.0 | Código | ✅ Completado |
| 0.5 | Migrar datos existentes (427 propiedades) | Script | ✅ Ejecutado |
| 0.6 | Verificar datos migrados | Query | ✅ Verificado |

**Archivos creados/modificados:**
- `sql/migrations/migracion_columnas_matching_v1.0.0.sql` (nuevo)
- `sql/functions/merge/merge_discovery_enrichment.sql` (v2.0.1 → v2.1.0)

**Script SQL Fase 0.1-0.3 (Schema):**
```sql
-- 0.1 Agregar columna nombre_edificio
ALTER TABLE propiedades_v2 
ADD COLUMN IF NOT EXISTS nombre_edificio VARCHAR;

-- 0.2 Agregar columna zona
ALTER TABLE propiedades_v2 
ADD COLUMN IF NOT EXISTS zona VARCHAR;

-- 0.3 Índices para matching
CREATE INDEX IF NOT EXISTS idx_propiedades_v2_nombre_edificio 
ON propiedades_v2(LOWER(nombre_edificio)) WHERE nombre_edificio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_propiedades_v2_zona 
ON propiedades_v2(zona) WHERE zona IS NOT NULL;
```

**Cambio en merge_discovery_enrichment() (Fase 0.4):**
```sql
-- En FASE 10: UPDATE PROPIEDAD, agregar estas líneas:
UPDATE propiedades_v2 SET
    -- ... columnas existentes ...
    precio_usd = v_precio_final,
    area_total_m2 = v_area_final,
    -- ...
    
    -- 🆕 AGREGAR ESTAS 2 LÍNEAS:
    nombre_edificio = v_enrichment->>'nombre_edificio',
    zona = COALESCE(
        v_enrichment->>'zona_validada_gps',
        'Equipetrol'  -- Default para zona actual
    ),
    
    -- ... resto del UPDATE ...
```

**Script Migración Fase 0.5 (Una vez para existentes):**
```sql
-- Poblar columnas desde datos_json para propiedades existentes
UPDATE propiedades_v2 
SET 
    nombre_edificio = COALESCE(
        datos_json->'proyecto'->>'nombre_edificio',
        datos_json_enrichment->>'nombre_edificio'
    ),
    zona = COALESCE(
        datos_json->'ubicacion'->>'zona_validada_gps',
        datos_json_enrichment->>'zona_validada_gps',
        'Equipetrol'
    )
WHERE nombre_edificio IS NULL OR zona IS NULL;
```

**Query Verificación Fase 0.6:**
```sql
SELECT 
    COUNT(*) as total,
    COUNT(nombre_edificio) as con_nombre,
    COUNT(zona) as con_zona,
    COUNT(*) FILTER (WHERE nombre_edificio IS NOT NULL AND zona IS NOT NULL) as completas
FROM propiedades_v2;
```

**Entregable:** Columnas `nombre_edificio` y `zona` pobladas + merge actualizado

---

### Fase 1: Migración Funciones SQL (Día 1 - Segunda mitad)
**Objetivo:** Actualizar funciones para usar `propiedades_v2`

| # | Tarea | Esfuerzo | Prioridad |
|---|-------|----------|-----------|
| 1.1 | Actualizar `generar_matches_por_nombre()` | 30 min | 🔥 |
| 1.2 | Actualizar `generar_matches_por_url()` | 30 min | 🔥 |
| 1.3 | Actualizar `generar_matches_fuzzy()` | 45 min | 🔥 |
| 1.4 | Actualizar `aplicar_matches_aprobados()` | 30 min | 🔥 |
| 1.5 | Actualizar `matching_completo_automatizado()` | 30 min | 🔥 |
| 1.6 | Limpiar `matching_sugerencias` (registros viejos) | 15 min | 🔥 |
| 1.7 | Test unitario de cada función | 1 hora | 🔥 |

**Entregable:** Funciones SQL actualizadas y probadas

### Fase 2: Matching Inicial (Día 1-2)
**Objetivo:** Procesar las 395 propiedades pendientes

| # | Tarea | Esfuerzo | Prioridad |
|---|-------|----------|-----------|
| 2.1 | Ejecutar `matching_completo_automatizado()` | 10 min | 🔥 |
| 2.2 | Analizar resultados (distribución por método) | 30 min | 🔥 |
| 2.3 | Revisar pendientes (70-84% confianza) | 2 horas | 🟡 |
| 2.4 | Ajustar aliases en `proyectos_master` si necesario | 1 hora | 🟡 |
| 2.5 | Re-ejecutar matching post-ajustes | 10 min | 🟡 |

**Entregable:** ≥70% propiedades matcheadas

### Fase 3: Automatización Nocturna (Día 2-3)
**Objetivo:** Matching automático diario a las 4AM

| # | Tarea | Esfuerzo | Prioridad |
|---|-------|----------|-----------|
| 3.1 | Crear workflow n8n "Matching Nocturno" | 2 horas | 🔥 |
| 3.2 | Configurar schedule 4:00 AM | 15 min | 🔥 |
| 3.3 | Agregar notificación Slack resumen | 30 min | 🟡 |
| 3.4 | Test en producción (1 ejecución manual) | 30 min | 🔥 |
| 3.5 | Documentar workflow | 30 min | 🟢 |

**Entregable:** Matching nocturno automatizado

### Fase 4: Integración Pipeline (Día 3)
**Objetivo:** Coordinar con Módulo 1

| # | Tarea | Esfuerzo | Prioridad |
|---|-------|----------|-----------|
| 4.1 | Verificar orden de ejecución (Merge 3AM → Matching 4AM) | 15 min | 🔥 |
| 4.2 | Agregar dependencia en schedule | 30 min | 🟡 |
| 4.3 | Test pipeline completo | 1 hora | 🔥 |

**Entregable:** Pipeline integrado Discovery → Enrichment → Merge → Matching

---

## 🔧 CAMBIOS SQL REQUERIDOS

### 1. Migración de Tabla

```sql
-- Patrón de cambio en TODAS las funciones:
-- ANTES:
FROM propiedades p
WHERE p.id_proyecto_master IS NULL

-- DESPUÉS:
FROM propiedades_v2 p
WHERE p.id_proyecto_master IS NULL
```

### 2. Columnas Requeridas por Matching

| Columna | Función que la usa | Estado en propiedades_v2 |
|---------|-------------------|--------------------------|
| `id` | Todas | ✅ Existe |
| `url` | `generar_matches_por_url` | ✅ Existe |
| `fuente` | `generar_matches_por_url` | ✅ Existe |
| `status` | Todas (filtro) | ✅ Existe (ENUM) |
| `id_proyecto_master` | Todas | ✅ Existe |
| `metodo_match` | `aplicar_matches_aprobados` | ✅ Existe |
| `confianza_match` | `aplicar_matches_aprobados` | ✅ Existe |
| `campos_bloqueados` | Todas (candados) | ✅ Existe |
| `latitud` | `generar_matches_fuzzy` | ✅ Existe |
| `longitud` | `generar_matches_fuzzy` | ✅ Existe |
| `nombre_edificio` | `generar_matches_por_nombre`, `fuzzy` | ✅ Agregada (25 Dic) |
| `zona` | `generar_matches_fuzzy` (filtro geográfico) | ✅ Agregada (25 Dic) |

### 3. Limpiar Sugerencias Viejas

```sql
-- Opción A: Truncar todo (si 152 registros son de tabla vieja)
TRUNCATE matching_sugerencias RESTART IDENTITY;

-- Opción B: Solo eliminar huérfanos
DELETE FROM matching_sugerencias ms
WHERE NOT EXISTS (
    SELECT 1 FROM propiedades_v2 p WHERE p.id = ms.propiedad_id
);
```

---

## 📅 TIMELINE ESTIMADO

| Fase | Días | Estado |
|------|------|--------|
| Fase 0: Schema + Merge | 0.5 día | ✅ **25 Dic 2025** |
| Fase 1: Funciones SQL | 0.5 día | ⏳ Pendiente |
| Fase 2: Matching Inicial | 1-2 días | ⏳ Pendiente |
| Fase 3: Automatización | 1 día | ⏳ Pendiente |
| Fase 4: Integración | 0.5 días | ⏳ Pendiente |
| **Total** | **3-4 días** | **20% completado** |

---

## ✅ CHECKLIST DE VALIDACIÓN

### Pre-Implementación
- [ ] Backup de funciones SQL actuales
- [ ] Backup de merge_discovery_enrichment()
- [ ] Confirmar 165 proyectos en proyectos_master

### Post-Fase 0 (Schema + Merge) ✅ COMPLETADA
- [x] Columna `nombre_edificio` creada en propiedades_v2
- [x] Columna `zona` creada en propiedades_v2
- [x] Índices creados para ambas columnas
- [x] `merge_discovery_enrichment()` actualizada a v2.1.0
- [x] Datos migrados para 427 propiedades existentes
- [x] Query de verificación ejecutado

### Post-Fase 1 (Funciones Matching)
- [ ] Todas las funciones apuntan a propiedades_v2
- [ ] Tests unitarios pasan
- [ ] Sin errores de sintaxis SQL

### Post-Fase 2
- [ ] ≥70% propiedades matcheadas (≥277 de 395)
- [ ] ≤20% pendientes revisión manual
- [ ] 0 falsos positivos detectados

### Post-Fase 3
- [ ] Workflow n8n creado y activo
- [ ] Schedule 4AM configurado
- [ ] Notificación Slack funcionando

### Post-Fase 4
- [ ] Pipeline completo probado
- [ ] Documentación actualizada
- [ ] Módulo 2 marcado como COMPLETADO

---

## 🔮 FASES FUTURAS (Post-Módulo 2)

### Módulo 2.5: Enriquecimiento IA (Opcional)
- Extraer amenities de descripción con IA
- Identificar desarrolladora automáticamente
- Validar GPS con Google Places

### Módulo 3: Unidades Reales/Virtuales
- Crear tabla `unidades_proyecto`
- Multiproyecto = TRUE → unidades virtuales
- Multiproyecto = FALSE → unidad real 1:1

### Módulo 4: Matching Clientes
- Tabla `necesidades_clientes` (Formulario Simón)
- Matching necesidades ↔ unidades
- Agente A para sugerencias

---

## 📚 REFERENCIAS

- **Repo principal:** `sici/`
- **Repo matching:** `sici-matching/`
- **Funciones SQL matching:** `sici-matching/subsistema-matching-propiedades/Sql/funciones/`
- **Función merge:** `sici/sql/functions/merge/merge_discovery_enrichment.sql`
- **Docs matching:** `sici-matching/subsistema-matching-propiedades/matching-nocturno.md`
- **Schema propiedades_v2:** `sici/sql/schema/propiedades_v2_schema.md`

---

**Última actualización:** 25 Diciembre 2025  
**Autor:** Luis + Claude + Claude Code  
**Estado:** 🚧 FASE 0 COMPLETADA - Listo para Fase 1
