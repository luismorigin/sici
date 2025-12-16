# MÓDULO 1 – DISCOVERY & EXISTENCIA

> **README Canónico para contextualización completa (Claude / Claude Desktop / Claude Code)**
>
> **Sistema:** SICI – Sistema Inteligente de Captura Inmobiliaria  
> **Rol del módulo:** Punto de entrada y control de existencia del universo de propiedades  
> **Estado:** 🟡 En consolidación (Flujo A en WORKING STATE)  
> **Versión:** 2.0.0  
> **Última actualización:** Diciembre 2025

---

## 0. Propósito de este README

Este documento es la **fuente de verdad del Módulo 1**.

Existe para contextualizar completamente a un agente IA (Claude) sobre:

- Qué hace y qué NO hace el Módulo 1
- Cómo funcionan los Flujos A y C
- Qué decisiones arquitectónicas ya fueron tomadas
- En qué estado está cada flujo
- Cómo se conecta con el resto del sistema

---

## 1. Visión General

El **Módulo 1 – Discovery & Existencia** es el **punto de entrada del sistema SICI**.

Su responsabilidad es mantener sincronizada la base de datos con la **realidad del mercado inmobiliario**, respondiendo únicamente dos preguntas:

1. **¿Qué propiedades existen hoy en los portales?**
2. **¿Qué propiedades dejaron de existir?**

**Cambio conceptual v2.0:**
> Discovery NO es un extractor stateless. Es un **proceso de detección de cambios de existencia**: Snapshot + Comparación + Decisión.

---

## 2. Alcance Funcional

### 2.1 Lo que SÍ hace este módulo

| Función | Flujo responsable |
|---------|-------------------|
| Descubrir URLs nuevas en portales | Flujo A |
| Extraer **datos observados** básicos (precio, área, GPS) | Flujo A |
| Detectar URLs que desaparecen de portales | Flujo A |
| Marcar sospecha de inactividad (`inactivo_pending`) | Flujo A |
| Verificar existencia real vía HTTP | Flujo C |
| Confirmar inactividad definitiva (`inactivo_confirmed`) | Flujo C |
| Rescatar falsos positivos | Flujo C |

### 2.2 Lo que explícitamente NO hace

| Función | Módulo correspondiente |
|---------|------------------------|
| Validar/confirmar precio / área / dormitorios | Módulo 2 – Enrichment |
| Normalización (parqueos, amenities) | Módulo 2 – Enrichment |
| Tipo de cambio dinámico | Módulo TC Dinámico |
| Matching propiedad ↔ proyecto | Subsistema Matching |

### 2.3 Nota sobre datos observados

Aunque arquitectónicamente precio, área y dormitorios pertenecen a Enrichment, Discovery los extrae como **datos observados** porque:

- ✅ Sirven para detectar cambios (precio varió → re-scrapear)
- ✅ Apoyan decisiones de existencia
- ❌ NO son "verdad final"
- ❌ NO rompen candados
- ❌ NO reemplazan enrichment

---

## 3. Arquitectura de Flujos

```
┌────────────────────────────────────────────────┐
│ FLUJO A – EL CAZADOR (Discovery)               │
│ • Descubre URLs nuevas                         │
│ • Extrae datos observados básicos              │
│ • Detecta ausencias en portales                │
│ • Marca inactivo_pending                       │
│ • Estado: 🟡 WORKING STATE                     │
└──────────────────────┬─────────────────────────┘
                       │
                       ↓
┌────────────────────────────────────────────────┐
│ FLUJO C – EL VERIFICADOR                       │
│ • HTTP HEAD a URLs sospechosas                 │
│ • Confirma inactivo (404) → inactivo_confirmed │
│ • Rescata falsos positivos (200/3XX)           │
│ • Estado: 🟢 ESTABLE                           │
└────────────────────────────────────────────────┘
```

---

## 4. Flujo A – EL CAZADOR

### 4.1 Estado actual

| Atributo | Valor |
|----------|-------|
| Estado | 🟡 **WORKING STATE** (en desarrollo activo) |
| Schedule objetivo | 1:00 AM diario |
| Rol | Descubrimiento + extracción datos observados + detección de ausencia |

### 4.2 Decisión arquitectónica CLAVE

El Flujo A **NO usa una única técnica de scraping**.

Usa **dos estrategias distintas por portal**:

| Portal | Estrategia | Razón |
|--------|------------|-------|
| **Remax** | API REST paginada | El portal expone API interna |
| **Century21** | Grid geográfico (bounding boxes) | No hay paginación tradicional |

### 4.3 Responsabilidades

- Construir URLs de búsqueda por portal
- Iterar páginas/cuadrantes de resultados
- Extraer URLs de propiedades individuales
- Extraer **datos observados** (precio, área, GPS, etc.)
- Persistir **snapshot RAW completo** en `datos_json_discovery`
- Filtrar por zona (Equipetrol), tipo (departamentos), operación (venta)
- Comparar snapshot actual vs base de datos existente
- Ejecutar transiciones de estado:
  - INSERT nuevas → `status = 'nueva'`
  - Ausentes → `status = 'inactivo_pending'`

### 4.4 Filosofía

> **Ausencia ≠ Inactividad confirmada**

Una propiedad puede no aparecer en un scrape por:
- Error temporal del portal
- Paginación/grid incompleto
- Rate limiting
- Cambios en estructura HTML/JSON

Por eso el Flujo A **NUNCA marca `inactivo_confirmed` directamente**. Solo marca `inactivo_pending` para que Flujo C verifique.

---

## 5. Flujo C – EL VERIFICADOR

### 5.1 Estado actual

| Atributo | Valor |
|----------|-------|
| Estado | 🟢 **ESTABLE** – NO ACTIVADO (scheduler deshabilitado) |
| Schedule | 6:00 AM diario |
| Capacidad | Hasta 150 URLs por ejecución |

### 5.2 Rol

Tomar propiedades con `status = 'inactivo_pending'` y verificar su existencia real mediante HTTP HEAD request.

### 5.3 Lógica de decisión

| HTTP Status | Acción | Nuevo status |
|-------------|--------|--------------|
| 404 | Confirmar eliminación | `inactivo_confirmed` |
| 200 / 301 / 302 | Rescatar (falso positivo) | `completado` |

### 5.4 Relevancia por fuente

| Portal | Efectividad Flujo C |
|--------|---------------------|
| **Remax** | ✅ Alta - HTTP 404 confiable |
| **Century21** | ⚠️ Limitada - HTTP 200 aún con "Aviso terminado" |

Para Century21, Discovery puede usar señales HTML ("Aviso terminado") y fechas de modificación como **datos observados**, pero NO como confirmación final.

### 5.5 Filosofía

> **"Inocente hasta que se pruebe culpable"**

- Ante cualquier duda, el sistema **rescata** la propiedad
- Si el rescate fue incorrecto, Flujo A lo detectará en el siguiente ciclo
- Mejor rescatar una propiedad activa que perder una propiedad real

### 5.6 Métricas esperadas

| Métrica | Valor típico |
|---------|--------------|
| Propiedades verificadas/día | 2-15 |
| Tasa de confirmación (inactivos reales) | 60-70% |
| Tasa de falsos positivos (rescatados) | 30-40% |

> ℹ️ Valores orientativos basados en observaciones iniciales, no SLA.

---

## 6. Estados de Propiedad (Capa Existencia)

Este módulo gestiona los siguientes estados:

| Estado | Significado | Asignado por |
|--------|-------------|--------------|
| `nueva` | URL detectada por primera vez, esperando enrichment | Flujo A (INSERT) |
| `inactivo_pending` | Ausente en snapshot, pendiente verificación HTTP | Flujo A (UPDATE) |
| `inactivo_confirmed` | Confirmado eliminado del portal (HTTP 404) | Flujo C (UPDATE) |
| `completado` | Rescatado por Flujo C (HTTP 200/3XX) o procesado por Merge | Flujo C / Merge |

### Pipeline completo de estados

```
Discovery CREA     → nueva
Enrichment         → nueva → actualizado
Merge              → actualizado → completado
Discovery MARCA    → inactivo_pending (ausencias)
Flujo C CONFIRMA   → inactivo_pending → inactivo_confirmed
Flujo C RESCATA    → inactivo_pending → completado
```

### Diagrama de transiciones

```
[URL Nueva]
     │
     ↓ Flujo A INSERT
┌─────────┐
│  nueva  │
└────┬────┘
     │
     │ ┌───────────────────────────────────────────────────┐
     │ │ MÓDULO 2: Enrichment → actualizado → Merge        │
     │ │ (Sus estados pertenecen a otra capa)              │
     │ └───────────────────────────────────────────────────┘
     │
     ↓
┌─────────────┐
│ completado  │ ←─── Flujo C rescata ←──┐
│             │      (HTTP 200/3XX)     │
└─────┬───────┘                         │
      │                                 │
      │ Flujo A detecta ausencia        │
      ↓                                 │
┌──────────────────┐                    │
│ inactivo_pending │ ───────────────────┘
└────────┬─────────┘
         │
         │ Flujo C confirma (HTTP 404)
         ↓
┌────────────────────┐
│ inactivo_confirmed │
└────────────────────┘
```

> 📌 **Nota semántica:** Una propiedad que **nunca apareció** en Discovery no existe en BD (sin estado). Los estados de inactividad (`inactivo_pending`, `inactivo_confirmed`) solo aplican a propiedades que existieron previamente.

---

## 7. Ciclo Operativo Diario

```
┌─────────────────────────────────────────────────────────────┐
│ 1:00 AM   FLUJO A – Descubrimiento                          │
│           • Snapshot de portales (Remax API + C21 Grid)     │
│           • Comparación contra BD existente                 │
│           • INSERT URLs nuevas → status = 'nueva'           │
│           • URLs ausentes → status = 'inactivo_pending'     │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓ (5 horas después)
┌─────────────────────────────────────────────────────────────┐
│ 6:00 AM   FLUJO C – Verificación                            │
│           • SELECT WHERE status = 'inactivo_pending'        │
│           • HTTP HEAD a cada URL                            │
│           • 404 → status = 'inactivo_confirmed'             │
│           • 200 → status = 'completado' (rescatado)         │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Relación con Otros Módulos

```
┌─────────────────────────────────────────┐
│ MÓDULO 1 – DISCOVERY & EXISTENCIA       │  ← Este módulo
│ (Flujo A + Flujo C)                     │
│ Output: URLs con status de existencia   │
│         + datos observados básicos      │
└────────────────────┬────────────────────┘
                     │
                     │ URLs con status = 'nueva'
                     ↓
┌─────────────────────────────────────────┐
│ MÓDULO 2 – ENRICHMENT                   │
│ (Valida y profundiza datos observados)  │
│ Output: status = 'actualizado'          │
└────────────────────┬────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────┐
│ MERGE                                   │
│ Output: status = 'completado'           │
└────────────────────┬────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────┐
│ SUBSISTEMA MATCHING / TC DINÁMICO       │
└─────────────────────────────────────────┘
```

**Dependencias:**
- Este módulo **NO depende** de otros módulos
- Módulo 2 **depende** de este módulo para recibir URLs a procesar
- Sin Módulo 1 activo, el sistema se desincroniza con la realidad del mercado

---

## 9. Decisiones Arquitectónicas Registradas

| Decisión | Estado | Razón |
|----------|--------|-------|
| Remax usa API REST paginada | ✅ Definitiva | Portal expone API estructurada |
| Century21 usa grid geográfico | ✅ Definitiva | No hay paginación tradicional |
| Discovery extrae datos observados | ✅ Definitiva | Detectar cambios, apoyo a existencia |
| Snapshot RAW obligatorio | ✅ Definitiva | Evidencia histórica, auditoría |
| Flujo A nunca marca `inactivo_confirmed` | ✅ Definitiva | Evitar falsos positivos |
| Flujo C usa HTTP HEAD (no GET) | ✅ Definitiva | Eficiencia, solo necesitamos status |
| Flujo D eliminado | ❌ Descartado | Complejidad sin beneficio MVP |
| Unicidad por `(url, fuente)` | ✅ Definitiva | URL es identificador real |

---

## 10. Instrucciones para Claude

Si estás leyendo esto como IA:

| Regla | Acción |
|-------|--------|
| ❌ NO asumas que Flujo A está finalizado | Tratarlo como WORKING STATE |
| ❌ NO reintroduzcas Flujo D | Está descartado permanentemente |
| ❌ NO mezcles estados de Módulo 1 con Módulo 2 | Son sistemas diferentes |
| ❌ NO trates datos observados como "verdad final" | Son auxiliares, no enrichment |
| ❌ NO uses términos antiguos | `pendiente`→`nueva`, `inactivo_por_confirmar`→`inactivo_pending` |
| ✅ Respeta separación de responsabilidades | Existencia ≠ Enrichment |
| ✅ Usa este README como referencia principal | Es la fuente de verdad |
| ✅ Pregunta si algo es ambiguo | Antes de asumir |

---

## 11. Estado Actual del Módulo (Resumen)

| Componente | Estado | Notas |
|------------|--------|-------|
| Flujo A | 🟡 WORKING STATE | Estrategia definida, implementación en progreso |
| Flujo C | 🟢 ESTABLE | Listo para activar |
| Flujo D | ❌ ELIMINADO | No reintroducir |
| Documentación | 🟢 Canónica v2.0 | Este README es fuente de verdad |

---

**Fin del README Canónico – Módulo 1**

*SICI – Sistema Inteligente de Captura Inmobiliaria*  
*Módulo 1 – Discovery & Existencia*  
*Versión 2.0.0 – Diciembre 2025*
