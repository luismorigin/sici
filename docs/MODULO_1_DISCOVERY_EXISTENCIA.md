# MÓDULO 1 – DISCOVERY & EXISTENCIA

> **README Canónico para contextualización completa (Claude / Claude Desktop / Claude Code)**
>
> **Sistema:** SICI – Sistema Inteligente de Captura Inmobiliaria  
> **Rol del módulo:** Punto de entrada y control de existencia del universo de propiedades  
> **Estado:** 🟡 En consolidación (Flujo A en WORKING STATE)  
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

> ⚠️ Este módulo **NO extrae datos detallados**, **NO normaliza información**, **NO detecta cambios de precio** y **NO realiza matching**.

---

## 2. Alcance Funcional

### 2.1 Lo que SÍ hace este módulo

| Función | Flujo responsable |
|---------|-------------------|
| Descubrir URLs nuevas en portales | Flujo A |
| Detectar URLs que desaparecen de portales | Flujo A |
| Marcar sospecha de inactividad | Flujo A |
| Verificar existencia real vía HTTP | Flujo C |
| Confirmar inactividad definitiva | Flujo C |
| Rescatar falsos positivos | Flujo C |

### 2.2 Lo que explícitamente NO hace

| Función | Módulo correspondiente |
|---------|------------------------|
| Extracción de precio / área / dormitorios | Módulo 2 – Enrichment |
| Normalización (parqueos, amenities) | Módulo 2 – Enrichment |
| Tipo de cambio dinámico | Módulo TC Dinámico |
| Matching propiedad ↔ proyecto | Subsistema Matching |
| Detección de cambios en propiedades activas | ❌ Fuera de alcance |

---

## 3. Arquitectura de Flujos

```
┌────────────────────────────────────────────────┐
│ FLUJO A – EL CAZADOR (Discovery)               │
│ • Descubre URLs nuevas                         │
│ • Detecta ausencias en portales                │
│ • Marca inactivo_por_confirmar                 │
│ • Estado: 🟡 WORKING STATE                     │
└──────────────────────┬─────────────────────────┘
                       │
                       ↓
┌────────────────────────────────────────────────┐
│ FLUJO C – EL VERIFICADOR                       │
│ • HTTP HEAD a URLs sospechosas                 │
│ • Confirma inactivo (404)                      │
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
| Rol | Descubrimiento + detección de ausencia |

> ⚠️ El Flujo A **NO está finalizado**. Debe tratarse como trabajo en progreso.

### 4.2 Decisión arquitectónica CLAVE

El Flujo A **NO usa una única técnica de scraping**.

Usa **dos estrategias distintas por portal**:

| Portal | Estrategia | Razón |
|--------|------------|-------|
| **Remax** | API + HTTP (estructurado) | El portal expone API interna |
| **Century21** | Scraping por cuadrícula / paginación HTML | No hay API disponible |

> 👉 Esta decisión **es intencional y definitiva**.

### 4.3 Responsabilidades

- Construir URLs de búsqueda por portal
- Iterar páginas de resultados
- Extraer URLs de propiedades individuales
- Filtrar por zona (Equipetrol), tipo (departamentos), operación (venta)
- Comparar contra base de datos existente
- Ejecutar transiciones de estado:
  - INSERT nuevas → `status = 'pendiente'`
  - Ausentes → `status = 'inactivo_por_confirmar'`

### 4.4 Filosofía

> **Ausencia ≠ Inactividad confirmada**

Una propiedad puede no aparecer en un scrape por:
- Error temporal del portal
- Paginación incompleta
- Rate limiting
- Cambios en estructura HTML

Por eso el Flujo A **NUNCA marca `inactivo` directamente**. Solo marca `inactivo_por_confirmar` para que Flujo C verifique.

---

## 5. Flujo C – EL VERIFICADOR

### 5.1 Estado actual

| Atributo | Valor |
|----------|-------|
| Estado | 🟢 **ESTABLE** (listo para activar) |
| Schedule | 6:00 AM diario |
| Capacidad | Hasta 150 URLs por ejecución |

### 5.2 Rol

Tomar propiedades con `status = 'inactivo_por_confirmar'` y verificar su existencia real mediante HTTP HEAD request.

### 5.3 Lógica de decisión

| HTTP Status | Acción | Nuevo status |
|-------------|--------|--------------|
| 404 | Confirmar eliminación | `inactivo` |
| 200 / 301 / 302 | Rescatar (falso positivo) | `completado` |

### 5.4 Filosofía

> **"Inocente hasta que se pruebe culpable"**

- Ante cualquier duda, el sistema **rescata** la propiedad
- Si el rescate fue incorrecto, Flujo A lo detectará en el siguiente ciclo
- Mejor rescatar una propiedad activa que perder una propiedad real

### 5.5 Métricas esperadas

| Métrica | Valor típico |
|---------|--------------|
| Propiedades verificadas/día | 2-15 |
| Tasa de confirmación (inactivos reales) | 60-70% |
| Tasa de falsos positivos (rescatados) | 30-40% |

---

## 6. Estados de Propiedad (Capa Existencia)

Este módulo gestiona **únicamente** los siguientes estados:

| Estado | Significado | Asignado por |
|--------|-------------|--------------|
| `pendiente` | URL nueva descubierta, esperando ser consumida por módulos downstream | Flujo A (INSERT) |
| `inactivo_por_confirmar` | Ausente en scrape, pendiente verificación HTTP | Flujo A (UPDATE) |
| `inactivo` | Confirmado eliminado del portal (HTTP 404) | Flujo C (UPDATE) |
| `completado` | **Existencia verificada en portal** (HTTP 200/3XX). NO implica que pasó por Enrichment ni por ningún pipeline downstream. | Flujo C (rescate) |

> ⚠️ **SEMÁNTICA CRÍTICA:** El estado `completado` en este módulo significa **exclusivamente** que la URL existe en el portal. No tiene relación con el estado de procesamiento de datos en Módulo 2.

### Diagrama de transiciones

```
[URL Nueva]
     │
     ↓ Flujo A INSERT
┌───────────┐
│ pendiente │
└─────┬─────┘
      │
      │ ┌─────────────────────────────────────────────────────┐
      │ │ FUERA DE MÓDULO 1: Aquí intervienen otros módulos   │
      │ │ (Enrichment, Matching, etc.) pero sus estados       │
      │ │ pertenecen a otra capa. Este módulo NO los gestiona.│
      │ └─────────────────────────────────────────────────────┘
      │
      ↓
┌─────────────┐
│ completado  │ ←─── Flujo C rescata ←──┐
│ (existe)    │                         │
└─────┬───────┘                         │
      │                                 │
      │ Flujo A detecta ausencia        │
      ↓                                 │
┌─────────────────────────┐             │
│ inactivo_por_confirmar  │ ────────────┘
└───────────┬─────────────┘    (HTTP 200/301/302)
            │
            │ Flujo C confirma (HTTP 404)
            ↓
┌───────────┐
│ inactivo  │
└───────────┘
```

> 📌 **Nota:** La transición de `pendiente` a `completado` puede ocurrir por dos vías: (1) procesamiento exitoso en módulos downstream que eventualmente marcan existencia confirmada, o (2) rescate directo por Flujo C. En ambos casos, `completado` solo certifica **existencia en portal**, nada más.

---

## 7. Ciclo Operativo Diario

```
┌─────────────────────────────────────────────────────────────┐
│ 1:00 AM   FLUJO A – Descubrimiento                          │
│           • Scrape páginas de búsqueda (Remax API + C21 HTML)│
│           • INSERT URLs nuevas → status = 'pendiente'       │
│           • URLs ausentes → status = 'inactivo_por_confirmar'│
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ↓ (5 horas después)
┌─────────────────────────────────────────────────────────────┐
│ 6:00 AM   FLUJO C – Verificación                            │
│           • SELECT WHERE status = 'inactivo_por_confirmar'  │
│           • HTTP HEAD a cada URL                            │
│           • 404 → status = 'inactivo' (confirmado)          │
│           • 200 → status = 'completado' (existencia verificada)│
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Relación con Otros Módulos

```
┌─────────────────────────────────────────┐
│ MÓDULO 1 – DISCOVERY & EXISTENCIA       │  ← Este módulo
│ (Flujo A + Flujo C)                     │
│ Output: URLs con status de existencia   │
└────────────────────┬────────────────────┘
                     │
                     │ URLs con status = 'pendiente'
                     ↓
┌─────────────────────────────────────────┐
│ MÓDULO 2 – ENRICHMENT                   │
│ (Sistema de estados DIFERENTE)          │
│ ⚠️ Sus estados NO son gestionados aquí  │
└────────────────────┬────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────┐
│ SUBSISTEMA MATCHING                     │
└────────────────────┬────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────┐
│ MÓDULOS ANALÍTICOS / TC DINÁMICO        │
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
| Remax usa API + HTTP | ✅ Definitiva | Portal expone API estructurada |
| Century21 usa scraping cuadrícula | ✅ Definitiva | No hay API disponible |
| Flujo A nunca marca `inactivo` directo | ✅ Definitiva | Evitar falsos positivos |
| Flujo C usa HTTP HEAD (no GET) | ✅ Definitiva | Eficiencia, solo necesitamos status |
| Flujo D eliminado | ❌ Descartado | Complejidad sin beneficio MVP |
| `completado` = existencia verificada | ✅ Definitiva | Semántica limpia, sin cruce de capas |

---

## 10. Instrucciones para Claude

Si estás leyendo esto como IA:

| Regla | Acción |
|-------|--------|
| ❌ NO asumas que Flujo A está finalizado | Tratarlo como WORKING STATE |
| ❌ NO reintroduzcas Flujo D | Está descartado permanentemente |
| ❌ NO mezcles estados de Módulo 1 con Módulo 2 | Son sistemas diferentes |
| ❌ NO interpretes `completado` como "procesado" | Significa solo "existe en portal" |
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
| Documentación | 🟢 Canónica | Este README es fuente de verdad |

---

**Fin del README Canónico – Módulo 1**

*SICI – Sistema Inteligente de Captura Inmobiliaria*  
*Módulo 1 – Discovery & Existencia*  
*Diciembre 2025*
