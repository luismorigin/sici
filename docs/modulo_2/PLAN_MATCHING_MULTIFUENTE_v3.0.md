# PLAN MÓDULO 2: Matching Inteligente Multi-Fuente
## Versión 3.2 - Human-in-the-Loop Completado

**Fecha:** 29 Diciembre 2025
**Estado:** ✅ Sistema completo operativo (Matching + Human-in-the-Loop)
**Prerequisito:** Módulo 1 ✅ 100% operativo
**Filosofía:** Mejorar matching SQL, no perseguir regex en extractores

---

## 🎉 ESTADO ACTUAL (28 Dic 2025)

### Resultados en Producción

| Métrica | Valor | Notas |
|---------|-------|-------|
| Total propiedades candidatas | 221 | status completado/actualizado |
| **Propiedades matcheadas** | **82 (37.1%)** | Con id_proyecto_master |
| Propiedades con zona GPS | 370 (86%) | 7 microzonas |
| Matches por nombre | 45 | 95% confianza |
| Matches por URL | 35 | 85-90% confianza |
| Matches por fuzzy | 19 | 75-90% confianza |

### Funciones Migradas a propiedades_v2

| Función | Versión | Estado |
|---------|---------|--------|
| `generar_matches_por_nombre()` | v3.0 | ✅ Producción |
| `generar_matches_por_url()` | v3.0 | ✅ Producción |
| `generar_matches_fuzzy()` | v3.0 | ✅ Producción |
| `aplicar_matches_aprobados()` | v3.0 | ✅ Producción |
| `matching_completo_automatizado()` | v3.0 | ✅ Producción |

### Infraestructura de Microzonas GPS

| Componente | Estado |
|------------|--------|
| Tabla `zonas_geograficas` | ✅ 7 polígonos PostGIS |
| Función `poblar_zonas_batch()` | ✅ Producción |
| Columna `microzona` en propiedades_v2 | ✅ Poblada |

### Análisis del GAP (139 sin match)

| Razón | Propiedades | % |
|-------|-------------|---|
| Sin nombre_edificio | 98 | 70.5% |
| Fuera de polígonos (marketing vs GPS) | 27 | 19.4% |
| Nombre sin match en proyectos_master | 14 | 10.1% |

**Decisión:** Propiedades fuera de polígonos son "aspiracionales" (anunciantes declaran Equipetrol por prestigio). No es bug del scraper.

---

## 📊 DIAGNÓSTICO COMPLETADO (Dic 26)

### Estado Actual de propiedades_v2

| Métrica | Century21 | Remax | Total |
|---------|-----------|-------|-------|
| Total propiedades | 119 | 95 | 214 |
| Con nombre_edificio en columna | ~15% | ~7% | ~12% |
| Con nombre_edificio en JSON | ~70% | ~54% | ~63% |
| Con id_proyecto_master | 0% | 0% | 0% |

### Distribución de Fuentes de Detección

**Century21 (119 propiedades):**
| Fuente | Cantidad | % | Calidad |
|--------|----------|---|---------|
| ubicacion | 43 | 36.1% | ⚠️ Variable |
| url_slug_edificio | 30 | 25.2% | ✅ Confiable |
| no_detectado | 28 | 23.5% | ❌ Sin dato |
| descripcion_keyword | 16 | 13.4% | ⚠️ Variable |
| descripcion_mayusculas | 2 | 1.7% | ⚠️ Riesgoso |

**Remax (95 propiedades):**
| Fuente | Cantidad | % | Calidad |
|--------|----------|---|---------|
| title_validated | 47 | 49.5% | ⚠️ Incluye basura |
| no_detectado | 41 | 43.2% | ❌ Sin dato |
| descripcion_edificio | 7 | 7.4% | ✅ Confiable |

### Problema de Calidad en JSON

| Categoría | Ejemplos | Acción |
|-----------|----------|--------|
| ✅ VÁLIDO | "Mare", "Macororo 12", "Le Blanc" | Usar directo |
| ⚠️ LIMPIAR | "Kenya Zona Udabol", "Torres Delta II Calle" | Regex simple |
| 🗑️ BASURA | "Venta", "Pre Venta", "Nicolas Ortiz", "TOTALMENTE EQUIPADO" | Ignorar |

---

## 🎯 DECISIÓN ARQUITECTÓNICA CLAVE

### ❌ NO hacer: Juego del Gato y Ratón

```
Mejorar regex extractor → Aparece nuevo patrón → 
Mejorar regex → Nuevo patrón → ∞
```

**Razón:** Los extractores ya tienen fuzzy pre-matching, blacklist, múltiples prioridades. Más regex = retorno decreciente.

### ✅ SÍ hacer: Potenciar el Matching SQL

**Descubrimiento clave:** `generar_matches_por_url_mejorado()` hace búsqueda INVERSA:
- Busca `nombre_oficial` de proyectos_master DENTRO del URL
- NO depende de que el extractor detecte nada
- Para Century21, puede matchear aunque `nombre_edificio` sea NULL

**Estrategia:** El matching SQL tiene acceso a TODO:
- URL completa (siempre disponible)
- `nombre_edificio` columna (cuando existe)
- `datos_json_enrichment->>'nombre_edificio'` (fallback)
- `alias_conocidos` de proyectos_master (expandible)
- GPS para validación cruzada

---

## 🏗️ ARQUITECTURA DEL MATCHING

### Flujo Actual (Funciona)

```
┌─────────────────────────────────────────────┐
│     matching_completo_automatizado()        │
│     (God Function - Diseño intencional)     │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │ 1. GENERAR SUGERENCIAS    │
    │    (3 métodos paralelos)  │
    └─────────────┬─────────────┘
                  │
    ┌─────┬───────┴───────┬─────┐
    ▼     ▼               ▼     ▼
┌──────┐ ┌──────┐    ┌──────┐ ┌──────┐
│NOMBRE│ │ URL  │    │FUZZY │ │ GPS  │
│ 95%  │ │85-90%│    │75-90%│ │ OFF  │
└──┬───┘ └──┬───┘    └──┬───┘ └──────┘
   └────────┴───────────┘
                  │
    ┌─────────────┴─────────────┐
    │ 2. AUTO-APROBAR ≥85%      │
    │ 3. AUTO-RECHAZAR inactivos│
    │ 4. APLICAR a propiedades  │
    └─────────────┬─────────────┘
                  │
                  ▼
         ✅ Matching completo
            (una sola llamada)
```

### Por qué "God Function" es Correcto Aquí

| Diseño Separado | Diseño Actual |
|-----------------|---------------|
| 5 funciones + coordinación | 1 función = todo |
| Requiere workflow n8n | Solo cron SQL |
| Más puntos de falla | Atómico |
| Human-in-the-loop para coordinar | Zero intervención |
| No escala | Escala a 1000+ props |

---

## 📋 FASES DE IMPLEMENTACIÓN

### FASE 1: Migración SQL (Crítico - 1 día) ✅ COMPLETADA

**Objetivo:** Funciones trabajando con `propiedades_v2`
**Estado:** ✅ Completada el 28 Dic 2025

**Ubicación de funciones a migrar:**
```
sici-matching/subsistema-matching-propiedades/Sql/funciones/
├── matching_completo_automatizado.sql
├── generar_matches_por_nombre.sql
├── generar_matches_por_url.sql  (hay 2 versiones)
├── generar_matches_fuzzy.sql
├── generar_matches_gps_limpio.sql (OFF)
└── aplicar_matches_aprobados.sql
```

**Cambios en cada función:**

```sql
-- ANTES
FROM propiedades p

-- DESPUÉS  
FROM propiedades_v2 p
```

**Agregar fallback multi-fuente en `generar_matches_por_nombre()`:**

```sql
-- ANTES: Solo columna
WHERE p.nombre_edificio IS NOT NULL

-- DESPUÉS: Columna O JSON
WHERE COALESCE(
  NULLIF(p.nombre_edificio, ''),
  p.datos_json_enrichment->>'nombre_edificio'
) IS NOT NULL
```

**Agregar búsqueda en alias_conocidos en `generar_matches_fuzzy()`:**

```sql
-- ANTES: Solo nombre_oficial
ON LOWER(p.nombre_edificio) = LOWER(pm.nombre_oficial)

-- DESPUÉS: nombre_oficial O cualquier alias
ON LOWER(nombre_busqueda) = LOWER(pm.nombre_oficial)
   OR LOWER(nombre_busqueda) = ANY(
     SELECT LOWER(unnest(pm.alias_conocidos))
   )
```

**Funciones a migrar:**
1. `generar_matches_por_nombre()` → +fallback JSON +alias
2. `generar_matches_por_url_mejorado()` → solo cambiar tabla
3. `generar_matches_fuzzy()` → +fallback JSON +alias
4. `aplicar_matches_aprobados()` → cambiar tabla
5. `matching_completo_automatizado()` → cambiar tabla

**Entregable:** 5 funciones SQL actualizadas y testeadas

---

### FASE 2: Ejecutar y Medir (1 día)

**Objetivo:** Conocer el rendimiento REAL del sistema

**Ejecución:**
```sql
SELECT * FROM matching_completo_automatizado();
```

**Métricas a capturar:**

| Métrica | Query |
|---------|-------|
| Matches por nombre | `matches_nombre` del resultado |
| Matches por URL | `matches_url` del resultado |
| Matches por fuzzy | `matches_fuzzy` del resultado |
| Auto-aprobados (≥85%) | `auto_aprobados` del resultado |
| Pendientes (70-84%) | `SELECT COUNT(*) FROM matching_sugerencias WHERE estado='pendiente'` |
| Sin match (GAP) | `SELECT COUNT(*) FROM propiedades_v2 WHERE id_proyecto_master IS NULL AND status='completado'` |

**Análisis del GAP:**
```sql
-- ¿Por qué no matchearon?
SELECT 
  p.id,
  p.url,
  p.nombre_edificio,
  p.datos_json_enrichment->>'nombre_edificio' as json_nombre,
  p.zona
FROM propiedades_v2 p
WHERE p.id_proyecto_master IS NULL
  AND p.status IN ('completado', 'actualizado')
  AND NOT EXISTS (
    SELECT 1 FROM matching_sugerencias ms 
    WHERE ms.propiedad_id = p.id
  )
LIMIT 30;
```

**Entregable:** Reporte con métricas y análisis de GAP

---

### FASE 3: Optimización para Escalabilidad (1-2 días)

**Objetivo:** Reducir % que queda en "pendiente" (human-in-the-loop)

#### 3.1 Enriquecer alias_conocidos

**Problema:** Si proyectos_master solo tiene "Sky Tower", no matchea "SKY TOWER", "sky tower", "Edificio Sky Tower".

**Solución:**
```sql
UPDATE proyectos_master
SET alias_conocidos = ARRAY[
  'Sky Tower',
  'SKY TOWER', 
  'sky tower',
  'Edificio Sky Tower',
  'Torre Sky'
]
WHERE nombre_oficial = 'Sky Tower';
```

**Query para identificar candidatos a alias:**
```sql
-- Nombres extraídos que NO matchearon pero son similares a proyectos
SELECT DISTINCT
  p.nombre_edificio as nombre_extraido,
  pm.nombre_oficial as proyecto_cercano,
  similarity(p.nombre_edificio, pm.nombre_oficial) as similitud
FROM propiedades_v2 p
CROSS JOIN proyectos_master pm
WHERE p.id_proyecto_master IS NULL
  AND p.nombre_edificio IS NOT NULL
  AND similarity(p.nombre_edificio, pm.nombre_oficial) > 0.3
  AND similarity(p.nombre_edificio, pm.nombre_oficial) < 0.7
ORDER BY similitud DESC;
```

#### 3.2 Ajustar Threshold de Auto-Aprobación

**Análisis previo requerido:**
```sql
-- ¿Cuántos hay en cada rango?
SELECT 
  CASE 
    WHEN score_confianza >= 85 THEN '85-100 (auto)'
    WHEN score_confianza >= 80 THEN '80-84 (candidato)'
    WHEN score_confianza >= 70 THEN '70-79 (revisar)'
    ELSE '<70 (rechazar)'
  END as rango,
  COUNT(*) as cantidad
FROM matching_sugerencias
WHERE estado = 'pendiente'
GROUP BY 1
ORDER BY 1 DESC;
```

**Decisión:**
- Si 80-84 tiene pocos falsos positivos → bajar threshold a 80%
- Si tiene muchos → mantener 85%

#### 3.3 Boost de Confianza por Evidencia Múltiple

**Concepto:** Si fuzzy da 78% PERO GPS está a <100m del proyecto → subir a 85%

```sql
-- En generar_matches_fuzzy(), agregar boost
CASE 
  WHEN similitud >= 70 
   AND distancia_gps < 100 
   AND p.zona = pm.zona 
  THEN LEAST(similitud + 10, 90)  -- Boost +10 puntos
  ELSE similitud
END as confianza_ajustada
```

**Entregable:** Funciones optimizadas + proyectos_master enriquecido

---

### FASE 4: Recuperación de Datos Existentes (Opcional - 0.5 días)

**Objetivo:** Poblar columna `nombre_edificio` desde JSON para propiedades ya procesadas

**Solo ejecutar si FASE 2 muestra que mejoraría métricas significativamente.**

```sql
-- UPDATE selectivo (solo VÁLIDOS, no basura)
UPDATE propiedades_v2
SET nombre_edificio = datos_json_enrichment->>'nombre_edificio'
WHERE status IN ('completado', 'actualizado')
  AND (nombre_edificio IS NULL OR nombre_edificio = '')
  AND datos_json_enrichment->>'nombre_edificio' IS NOT NULL
  AND datos_json_enrichment->>'nombre_edificio' != ''
  -- Excluir basura conocida
  AND datos_json_enrichment->>'nombre_edificio' NOT IN (
    'Venta', 'Pre Venta', 'Preventa', 'Alquiler',
    'De Pre', 'De Lujo', 'Estrenar En',
    'TOTALMENTE EQUIPADO', 'Nicolas Ortiz', 'Ovidio Barbery'
  )
  -- Excluir patrones de basura
  AND datos_json_enrichment->>'nombre_edificio' !~ '^(En|De|La|El)\s+\w{2,4}$';
```

**Entregable:** ~100 propiedades con columna poblada

---

### FASE 5: Activar Matching Nocturno (0.5 días)

**Objetivo:** Sistema corriendo automáticamente cada noche

**Opción A: Cron en Supabase (pg_cron)**
```sql
-- Ejecutar a las 4:00 AM
SELECT cron.schedule(
  'matching-nocturno',
  '0 4 * * *',
  'SELECT * FROM matching_completo_automatizado()'
);
```

**Opción B: Workflow n8n**
- Schedule Trigger: 4:00 AM
- Nodo PostgreSQL: `SELECT * FROM matching_completo_automatizado()`
- Nodo Slack: Notificar resultados

**Entregable:** Matching ejecutándose automáticamente

---

## 📈 MÉTRICAS DE ÉXITO

| Fase | Métrica | Target | Mínimo Aceptable |
|------|---------|--------|------------------|
| FASE 2 | Match por nombre | >20% | >10% |
| FASE 2 | Match por URL (C21) | >50% | >30% |
| FASE 2 | Match por fuzzy | >15% | >10% |
| FASE 2 | Total con match | >60% | >40% |
| FASE 3 | Auto-aprobados (≥85%) | >80% de matches | >60% |
| FASE 3 | Pendientes (human review) | <20% | <30% |
| FASE 5 | Ejecución nocturna | 100% uptime | >95% |

---

## 🔮 OPTIMIZACIÓN PARA ESCALABILIDAD

### El Cuello de Botella Real

```
Propiedades totales: 214
     ↓ matching
Con sugerencia: ~150 (70%)
     ↓ auto-aprobar ≥85%
Auto-aprobados: ~100 (67% de sugerencias)
     ↓
PENDIENTES: ~50 (33%) → HUMAN IN THE LOOP
```

**Con 1000 propiedades:** 330 pendientes = no escala

### Estrategia de Reducción de Pendientes

1. **Enriquecer alias_conocidos** → Más matches exactos (95%) → Menos fuzzy (75-84%)
2. **Boost por evidencia múltiple** → Fuzzy 78% + GPS cercano = 88% → Auto-aprueba
3. **Threshold dinámico por método:**
   - nombre_exacto: auto-aprobar ≥90%
   - url_slug: auto-aprobar ≥85%
   - fuzzy + GPS: auto-aprobar ≥80%
   - fuzzy solo: auto-aprobar ≥85%

### Meta Escalabilidad

| Escenario | Propiedades | Pendientes Target | Human Hours/Semana |
|-----------|-------------|-------------------|-------------------|
| Actual | 214 | <50 | <2h |
| 6 meses | 500 | <75 | <3h |
| 1 año | 1000 | <100 | <4h |

---

## 📝 DEUDA TÉCNICA IDENTIFICADA

### Para Documentar (No Ejecutar Ahora)

1. **Dos versiones de URL matching**
   - `generar_matches_por_url()` (legacy)
   - `generar_matches_por_url_mejorado()` (actual)
   - **Acción futura:** Eliminar versión legacy

2. **GPS matching desactivado**
   - `generar_matches_gps_limpio()` existe pero OFF
   - Razón: Falsos positivos en zona densa
   - **Acción futura:** Reactivar solo como validación, no como generador

3. **Duplicación en orquestador**
   - `matching_completo_automatizado()` tiene código duplicado de funciones individuales
   - **Acción futura:** Refactorizar para llamar funciones en vez de duplicar

4. **Schema de matching_sugerencias**
   - Apunta a `propiedades(id)` no `propiedades_v2(id)`
   - **Acción:** Actualizar FK en migración

---

## ⚠️ NOTAS IMPORTANTES

1. **NO perseguir mejoras de extractores** - El matching SQL es más poderoso
2. **`generar_matches_por_url_mejorado()` es el MVP** - Funciona sin depender del extractor
3. **Enriquecer proyectos_master > Mejorar regex** - ROI mucho mayor
4. **Threshold 85% es conservador** - Evaluar bajarlo a 80% post-FASE 2
5. **God function es diseño intencional** - Optimizado para zero human-in-the-loop
6. **Sistema de candados debe respetarse** - `campos_bloqueados` protege correcciones manuales

---

## 🚀 ORDEN DE EJECUCIÓN

```
DÍA 1 (AM): FASE 1 - Migrar funciones SQL
DÍA 1 (PM): FASE 2 - Ejecutar y medir
DÍA 2 (AM): FASE 3 - Optimizar según resultados
DÍA 2 (PM): FASE 4 - Recuperar datos (si necesario)
DÍA 3 (AM): FASE 5 - Activar nocturno
DÍA 3 (PM): Validación y documentación
```

**Total estimado: 2.5-3 días**

---

## ✅ SISTEMA HUMAN-IN-THE-LOOP (29 Dic 2025)

### Componentes Implementados

| Componente | Archivo | Estado |
|------------|---------|--------|
| Workflow Matching Nocturno (4 AM) | `n8n/workflows/modulo_2/matching_nocturno.json` | ✅ Activo |
| Workflow Matching Supervisor (8 PM) | `n8n/workflows/modulo_2/matching_supervisor.json` | ✅ Activo |
| Funciones RPC | `sql/functions/matching/funciones_rpc_matching.sql` | ✅ Producción |
| Google Sheets Bandeja | `SICI - Matching Bandeja de Aprobación` | ✅ Operativo |
| Especificación | `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` | ✅ Documentado |

### Flujo Operativo Diario

```
4:00 AM  → Matching Nocturno ejecuta
         → Auto-aprueba ≥85% confianza
         → Pendientes (70-84%) → Google Sheets
         → Slack: Resumen + link al Sheet

Durante el día → Humano revisa Sheet (⏳ → ✅/❌)

8:00 PM  → Matching Supervisor ejecuta
         → Lee decisiones del Sheet
         → Aplica matches aprobados
         → Rechaza los rechazados
         → Slack: Resumen de aplicación
```

---

## 📋 BACKLOG - MEJORAS FUTURAS

| Prioridad | Mejora | Descripción | Esfuerzo |
|-----------|--------|-------------|----------|
| Media | Proyecto alternativo en Sheet | Columna para que humano sugiera proyecto diferente al rechazar | 2-3h |
| Baja | GPS matching activado | Reactivar `generar_matches_gps()` cuando haya más proyectos verificados | 1h |
| Baja | Dashboard de métricas | Vista de métricas de matching en Supabase/Metabase | 4h |
| Baja | Limpieza automática Sheet | Habilitar nodo para borrar filas procesadas del Sheet | 30min |

---

## 📚 DOCUMENTOS RELACIONADOS

| Documento | Ruta |
|-----------|------|
| Plan Módulo 2 (completo) | `docs/modulo_2/PLAN_MODULO_2_v2.1.md` |
| Matching Nocturno Spec | `docs/modulo_2/MATCHING_NOCTURNO_SPEC.md` |
| Funciones RPC Matching | `sql/functions/matching/funciones_rpc_matching.sql` |
| Onboarding Claude | `docs/GUIA_ONBOARDING_CLAUDE.md` |
| Config Local (gitignored) | `config.local.json` |

---

**Autor:** Luis + Claude
**Versión:** 3.2 (Human-in-the-Loop completado)
**Última actualización:** 29 Diciembre 2025
**Estado:** Sistema de matching automatizado operativo con revisión humana
