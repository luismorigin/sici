# FLUJO B – CÉLULA B1: ENRICHMENT INICIAL

> **Sistema:** SICI – Sistema Inteligente de Captura Inmobiliaria  
> **Módulo:** 1 – Discovery & Existencia  
> **Célula:** B1 – Enrichment Inicial (Campos Básicos)  
> **Estado:** 📋 CONTRATO DE DISEÑO (no implementado)  
> **Versión:** 1.0.1  
> **Fecha:** Diciembre 2025

---

## CHANGELOG

**v1.0.1 (Diciembre 2025)**
- Aclaración semántica de `status = 'pendiente'` como input exclusivo de B1
- Explicitación de transiciones de status permitidas y prohibidas
- Eliminación de ambigüedades sobre gestión de estados
- Alineación con estados reales del sistema (nueva, pendiente, actualizado, completado, inactivo_por_confirmar, inactivo)

## 0. Documento de Contrato

Este documento define el **contrato arquitectónico mínimo** para implementar Flujo B - Célula B1.

**Propósito del contrato:**
- Establecer qué SÍ hace y qué NO hace esta célula
- Definir entradas, salidas y fronteras claras
- Servir como especificación para implementación en n8n
- Prevenir scope creep y confusión de responsabilidades

**NO es:**
- Código ejecutable
- Pseudocódigo detallado
- Documentación de implementación técnica

---

## 1. PROPÓSITO DE LA CÉLULA

Flujo B - Célula B1 es el **primer nivel de enrichment** que extrae campos básicos desde la página HTML individual de cada propiedad.

**Responsabilidad única:**  
Enriquecer propiedades descubiertas por Flujo A con **datos estructurados básicos** que NO están disponibles en APIs o grillas de búsqueda.

**Filosofía:**  
> "Enrichment inicial significa capturar lo esencial, no lo exhaustivo."

B1 extrae únicamente campos fundamentales para análisis de mercado básico:
- Precio completo (USD/BOB)
- Características físicas (área, dormitorios, baños, estacionamientos)
- Clasificación (tipo de operación, tipo de propiedad, estado construcción)
- Ubicación textual (dirección, barrio, zona)

---

## 2. INPUTS (¿De dónde toma datos?)

### 2.1 Fuente de datos primaria

**Tabla:** `propiedades_v2`  
**Condición de selección:**

```sql
SELECT id, url, fuente, codigo_propiedad
FROM propiedades_v2
WHERE status = 'pendiente'
  AND es_activa = TRUE
ORDER BY fecha_creacion ASC
LIMIT 50;
```

**Criterios de elegibilidad:**

| Campo | Condición | Razón |
|-------|-----------|-------|
| `status` | `= 'pendiente'` | Único status que B1 procesa. Propiedad completó Discovery y espera Enrichment |
| `es_activa` | `= TRUE` | No procesar inactivas |
| `url` | `IS NOT NULL` | Requerido para scraping |
| `fuente` | `IN ('remax', 'century21')` | Fuentes soportadas |

**Semántica del status 'pendiente':**
- Propiedad fue descubierta por Flujo A mediante `registrar_discovery()`
- Flujo A asignó `status = 'pendiente'` en INSERT inicial
- Propiedad tiene 5 campos mínimos poblados: url, fuente, codigo_propiedad, latitud, longitud
- Propiedad está lista para enrichment pero NO ha sido enriquecida todavía
- B1 es el ÚNICO componente autorizado para transicionar `pendiente` → `actualizado`

**Campos que toma de la BD:**

| Campo | Uso |
|-------|-----|
| `id` | Identificador para UPDATE |
| `url` | Target del scraping |
| `fuente` | Determina extractor a usar |
| `codigo_propiedad` | Referencia para logging |

### 2.2 Fuente de datos secundaria

**Origen:** Página HTML individual de la propiedad  
**Método:** HTTP GET + Extracción por selectores CSS/XPath

**Por portal:**

| Portal | URL Pattern | Método |
|--------|-------------|--------|
| Remax | `https://remax.bo/propiedad/{slug}` | Firecrawl o Puppeteer |
| Century21 | `https://c21.com.bo/propiedad/{id}` | Firecrawl o Puppeteer |

---

## 3. LO QUE SÍ HACE (Responsabilidades)

### 3.1 Extracción de campos básicos

B1 extrae **únicamente estos 13 campos**:

| # | Campo DB | Descripción | Ejemplo |
|---|----------|-------------|---------|
| 1 | `precio_usd` | Precio en USD | `120000` |
| 2 | `precio_usd_original` | Precio original antes de TC | `95000` |
| 3 | `moneda_original` | Moneda publicada | `"BOB"` o `"USD"` |
| 4 | `area_total_m2` | Área total en m² | `85.5` |
| 5 | `dormitorios` | Cantidad de dormitorios | `3` |
| 6 | `banos` | Cantidad de baños (puede ser decimal) | `2.5` |
| 7 | `estacionamientos` | Cantidad de estacionamientos | `1` |
| 8 | `tipo_operacion` | `venta` o `alquiler` | `"venta"` |
| 9 | `tipo_propiedad_original` | Texto exacto del portal | `"Departamento"` |
| 10 | `estado_construccion` | `nuevo`, `en_construccion`, `usado` | `"nuevo"` |
| 11 | `direccion_texto` | Dirección como aparece | `"Av. San Martin 123"` |
| 12 | `barrio` | Barrio/zona dentro de Equipetrol | `"Equipetrol Norte"` |
| 13 | `titulo` | Título del anuncio | `"Depto 3 dorm Equipetrol"` |

### 3.2 Conversión de moneda

**Regla de negocio:**

```
SI moneda_original = "BOB":
  precio_usd_original = precio_publicado_bob
  precio_usd = precio_publicado_bob / tipo_cambio_paralelo
  depende_de_tc = TRUE

SI moneda_original = "USD":
  precio_usd_original = precio_publicado_usd
  precio_usd = precio_publicado_usd
  depende_de_tc = FALSE
```

**Tipo de cambio:**
- B1 NO calcula ni actualiza tipos de cambio
- B1 USA los valores actuales de `config_global` vía `registrar_enrichment()`
- TC dinámico es responsabilidad del módulo TC Dinámico

### 3.3 Actualización en base de datos

**Función SQL:** `registrar_enrichment(p_data JSONB)`

**Contrato de llamada:**

```json
{
  "property_id": "RMX-12345",
  "url": "https://remax.bo/propiedad/depto-equipetrol",
  
  "precio_usd": 120000,
  "precio_usd_original": 840000,
  "moneda_original": "BOB",
  
  "area_total_m2": 85.5,
  "dormitorios": 3,
  "banos": 2,
  "estacionamientos": 1,
  
  "tipo_operacion": "venta",
  "tipo_propiedad_original": "Departamento",
  "estado_construccion": "nuevo",
  
  "direccion_texto": "Av. San Martin 123",
  "barrio": "Equipetrol Norte",
  "titulo": "Hermoso depto 3 dormitorios"
}
```

**Comportamiento de `registrar_enrichment()`:**
- ✅ Respeta `campos_bloqueados` (candados)
- ✅ Solo actualiza campos NO bloqueados
- ✅ Transiciona `status` de `pendiente` → `actualizado` (ÚNICA transición permitida para B1)
- ✅ Actualiza `fecha_enrichment` = NOW()
- ✅ Registra metadata en `datos_json_enrichment`
- ✅ Establece `depende_de_tc` según moneda

### 3.4 Logging y auditoría

Por cada propiedad procesada, B1 registra:

| Métrica | Descripción |
|---------|-------------|
| `property_id` | ID procesado |
| `url` | URL scrapeada |
| `fuente` | Portal de origen |
| `exito` | `true`/`false` |
| `campos_extraidos` | Cantidad de campos poblados |
| `campos_bloqueados_respetados` | Cantidad de campos omitidos por candado |
| `error` | Mensaje de error si falló |
| `timestamp` | Momento de procesamiento |

---

## 4. LO QUE NO HACE (Fronteras claras)

### 4.1 ❌ NO extrae campos complejos

Estos campos son responsabilidad de **células futuras** (B2, B3, etc.):

| Campo | Por qué NO está en B1 | Célula responsable |
|-------|----------------------|-------------------|
| `descripcion` | Texto largo, requiere limpieza | B2 - Enrichment Avanzado |
| `amenidades` | Requiere parsing de listas | B2 - Enrichment Avanzado |
| `caracteristicas` | Array complejo | B2 - Enrichment Avanzado |
| `imagenes` | Scraping pesado de múltiples URLs | B3 - Media |
| `contacto_*` | Datos sensibles, requiere validación | B2 - Enrichment Avanzado |
| `fecha_publicacion` | Puede venir de Discovery | B2 - Enrichment Avanzado |

### 4.2 ❌ NO hace matching

**B1 NO toca estos campos:**

| Campo | Por qué | Responsable |
|-------|---------|-------------|
| `id_proyecto_master` | Matching es proceso separado | Subsistema Matching |
| `sugerencias_matching` | Inferencia fuzzy | Subsistema Matching |
| `score_matching` | Cálculo complejo | Subsistema Matching |

### 4.3 ❌ NO modifica campos de Discovery

**B1 NUNCA escribe estos campos** (pertenecen a Flujo A):

| Campo | Owner |
|-------|-------|
| `codigo_propiedad` | Flujo A |
| `latitud` | Flujo A |
| `longitud` | Flujo A |
| `fecha_discovery` | Flujo A |
| `metodo_discovery` | Flujo A |
| `datos_json_discovery` | Flujo A |

**Excepción:** Si `campos_bloqueados` indica que un campo está protegido, `registrar_enrichment()` lo respeta automáticamente.

### 4.4 ❌ NO hace validaciones complejas

**B1 NO valida:**
- GPS fuera de Equipetrol (eso es responsabilidad de módulos de validación)
- Precios fuera de rango razonable
- Áreas sospechosas
- Dormitorios inconsistentes con área

**Filosofía:**  
> "B1 captura lo que el portal publica, sin juicios de valor."

Las validaciones y correcciones son responsabilidad de:
- Módulo de Validación GPS (futuro)
- Módulo de Detección de Anomalías (futuro)
- Revisión manual humana

### 4.5 ❌ NO actualiza tipos de cambio

B1 **USA** los TC de `config_global` pero **NUNCA los modifica**.

Actualización de TC es exclusiva de:
- Proceso manual vía Admin
- Módulo TC Dinámico (Binance API + Banco Central)

### 4.6 ❌ NO cambia status más allá de `actualizado`

**Estados válidos del sistema:**
```
nueva                  → Propiedad insertada por registrar_discovery() antes de Discovery completo
pendiente              → Propiedad descubierta por Flujo A, esperando Enrichment
actualizado            → Propiedad enriquecida por B1, esperando Merge
completado             → Propiedad mergeada por merge_discovery_enrichment()
inactivo_por_confirmar → Propiedad ausente en scrape, esperando verificación por Flujo C
inactivo               → Propiedad confirmada eliminada por Flujo C
```

**Transición permitida para B1:**  
✅ `pendiente` → `actualizado`

**Transiciones estrictamente prohibidas para B1:**
- ❌ `nueva` → cualquier estado (B1 NO procesa propiedades con status 'nueva')
- ❌ `pendiente` → `completado` (solo merge_discovery_enrichment() puede asignar 'completado')
- ❌ `pendiente` → `inactivo_por_confirmar` (solo Flujo A puede detectar ausencias)
- ❌ `pendiente` → `inactivo` (solo Flujo C puede confirmar inactividad)
- ❌ `actualizado` → `completado` (merge lo hace automáticamente, B1 NO interviene)
- ❌ `actualizado` → cualquier otro estado (B1 NO modifica propiedades ya actualizadas)
- ❌ Cualquier transición desde `completado`, `inactivo_por_confirmar` o `inactivo` (B1 ignora estos estados)

### 4.7 ❌ NO procesa propiedades con status incorrecto

**B1 SOLO procesa propiedades con:**
- `status = 'pendiente'` ✅
- `es_activa = TRUE` ✅

**B1 IGNORA completamente propiedades con:**

| Status | Razón para ignorar | Responsable |
|--------|-------------------|-------------|
| `nueva` | Propiedad no completó Discovery, falta información mínima | Flujo A debe procesar primero |
| `actualizado` | Ya fue enriquecida previamente, no requiere re-enrichment | Merge o Célula B2 |
| `completado` | Ya pasó por Merge, está en estado final del pipeline | Fuera de alcance de B1 |
| `inactivo_por_confirmar` | Esperando verificación HTTP por Flujo C | Flujo C |
| `inactivo` | Propiedad confirmada eliminada del mercado | Fuera de alcance |
| `es_activa = FALSE` | Marcada como inactiva por cualquier razón | Fuera de alcance |

**Implicación crítica:**  
Si B1 encuentra una propiedad con status distinto a 'pendiente', DEBE saltarla sin error. No es un fallo del sistema, es el comportamiento esperado.

---

## 5. CAMPOS QUE PUEDE ACTUALIZAR

### 5.1 Lista exhaustiva de campos actualizables

**Solo estos 13 campos** (mismo que extrae):

```
✅ precio_usd
✅ precio_usd_original
✅ moneda_original
✅ area_total_m2
✅ dormitorios
✅ banos
✅ estacionamientos
✅ tipo_operacion
✅ tipo_propiedad_original
✅ estado_construccion
✅ direccion_texto
✅ barrio
✅ titulo
```

### 5.2 Campos de metadata que actualiza

**Automáticamente vía `registrar_enrichment()`:**

```
✅ status (pendiente → actualizado) [ÚNICA transición permitida]
✅ fecha_enrichment
✅ datos_json_enrichment
✅ fecha_actualizacion
✅ depende_de_tc (TRUE si moneda_original = BOB)
```

**Campos de metadata que NO toca:**

```
❌ fecha_discovery (pertenece a Flujo A)
❌ fecha_deteccion_ausencia (pertenece a Flujo A)
❌ fecha_ultimo_avistamiento (pertenece a Flujo A)
❌ fecha_verificacion (pertenece a Flujo C)
```

### 5.3 Sistema de candados (campos_bloqueados)

**Regla crítica:**

```
SI campos_bloqueados->>'precio_usd' = 'true':
  → NO actualizar precio_usd
  → Registrar en log: "campo bloqueado por corrección manual"

SI campos_bloqueados IS NULL:
  → Actualizar normalmente
```

`registrar_enrichment()` ya implementa esta lógica, B1 solo debe:
1. Extraer el valor del HTML
2. Pasarlo en el JSON
3. Dejar que la función SQL decida si actualiza o no

---

## 6. FLAGS Y AUDITORÍA

### 6.1 Flags que debe setear

| Flag | Valor | Cuándo |
|------|-------|--------|
| `depende_de_tc` | `TRUE` | Si `moneda_original = 'BOB'` |
| `depende_de_tc` | `FALSE` | Si `moneda_original = 'USD'` |

**Otros flags NO son responsabilidad de B1:**
- `es_activa` (gestión de Flujo A y Flujo C)
- `es_para_matching` (gestión de Subsistema Matching)
- `fue_validada_gps` (gestión de Validación GPS)
- `es_multiproyecto` (gestión de Merge)

### 6.2 Metadata JSON que debe registrar

**Campo:** `datos_json_enrichment`

**Estructura mínima:**

```json
{
  "timestamp": "2025-12-15T14:30:00Z",
  "fuente": "remax",
  "url_scrapeada": "https://remax.bo/propiedad/...",
  "metodo": "firecrawl_v1",
  "campos_extraidos": 13,
  "campos_bloqueados": 0,
  "duracion_ms": 2340,
  "extractor_version": "b1_v1.0"
}
```

---

## 7. FUERA DE ALCANCE (Explícito)

### 7.1 Procesos que NO son parte de B1

| Proceso | Módulo responsable |
|---------|-------------------|
| Detección de URLs nuevas | Flujo A |
| Verificación HTTP de existencia | Flujo C |
| Merge Discovery + Enrichment | Función `merge_discovery_enrichment()` |
| Matching con proyectos | Subsistema Matching |
| Validación GPS | Módulo Validación GPS (futuro) |
| Actualización automática de TC | Módulo TC Dinámico |
| Recálculo de precios | Módulo TC Dinámico |
| Normalización de amenidades | Célula B2 (futuro) |
| Scraping de imágenes | Célula B3 (futuro) |

### 7.2 Decisiones de negocio que NO toma

B1 **NO decide**:
- Si un precio es "razonable" o "sospechoso"
- Si el GPS es correcto o incorrecto
- Si la propiedad pertenece a un proyecto específico
- Si los datos son consistentes entre sí
- Si la propiedad debe ir a revisión manual

**Filosofía:**  
> "B1 es un extractor neutral, no un validador."

---

## 8. RELACIÓN CON OTROS COMPONENTES

### 8.1 Dependencias UPSTREAM (de quién depende)

```
┌─────────────────────┐
│    FLUJO A          │
│   (Discovery)       │
│ Output: pendiente   │
└──────────┬──────────┘
           │
           │ Proporciona URLs con status = 'pendiente'
           ↓
┌─────────────────────┐
│  FLUJO B - CÉLULA B1│  ← ESTE COMPONENTE
│  (Enrichment Básico)│
│ Output: actualizado │
└─────────────────────┘
```

**B1 requiere que Flujo A haya completado:**
- INSERT de propiedad con `status = 'pendiente'`
- Campo `url` poblado y válido
- Campo `fuente` válido (`remax` o `century21`)
- Campos mínimos de Discovery: codigo_propiedad, latitud, longitud

**Contrato con Flujo A:**  
Flujo A garantiza que toda propiedad con `status = 'pendiente'` tiene los 5 campos mínimos poblados y es apta para scraping HTML.

### 8.2 Dependencias DOWNSTREAM (quién depende de B1)

```
┌─────────────────────┐
│  FLUJO B - CÉLULA B1│
│ Output: actualizado │
└──────────┬──────────┘
           │
           │ Proporciona datos enriquecidos con status = 'actualizado'
           ↓
┌─────────────────────┐
│  MERGE AUTOMÁTICO   │
│ merge_discovery_    │
│ enrichment()        │
│ Input: actualizado  │
│ Output: completado  │
└──────────┬──────────┘
           │
           ↓
┌─────────────────────┐
│ SUBSISTEMA MATCHING │
└─────────────────────┘
```

**Quiénes usan output de B1:**
- Función `merge_discovery_enrichment()` (consume `status = 'actualizado'`, transiciona a `completado`)
- Módulo TC Dinámico (recalcula precios con `depende_de_tc = TRUE`)
- Subsistema Matching (usa campos físicos para inferencia)

**Contrato con Merge:**  
B1 garantiza que toda propiedad con `status = 'actualizado'` tiene al menos los 13 campos básicos intentados (poblados o NULL si no disponibles en HTML).

---

## 9. CICLO OPERATIVO

### 9.1 Frecuencia de ejecución

**Schedule sugerido:** 3:00 AM diario (2 horas después de Flujo A)

**Razón:**  
Dar tiempo a que Flujo A complete discovery antes de iniciar enrichment.

### 9.2 Capacidad de procesamiento

**Límite por ejecución:** 50 propiedades

**Razón:**
- Rate limiting de portales
- Timeout de n8n (< 5 minutos idealmente)
- Manejo de errores granular

Si hay > 50 propiedades `pendientes`:
- Ejecutar múltiples veces
- Priorizar por `fecha_creacion ASC` (FIFO)

### 9.3 Timing esperado

| Etapa | Tiempo por propiedad |
|-------|---------------------|
| HTTP GET | 2-3 segundos |
| Parsing HTML | 0.5-1 segundo |
| Llamada a `registrar_enrichment()` | 0.1-0.3 segundos |
| **Total** | **~3-5 segundos** |

**Ejecución completa (50 props):** 2.5 - 4 minutos

---

## 10. MANEJO DE ERRORES

### 10.1 Errores recuperables (reintentar)

| Error | Acción | Reintentos |
|-------|--------|-----------|
| HTTP 429 (rate limit) | Esperar 10s, reintentar | 3 |
| HTTP 503 (portal caído) | Esperar 30s, reintentar | 2 |
| Timeout de red | Reintentar | 2 |

### 10.2 Errores no recuperables (skip)

| Error | Acción | Status resultante | Logging |
|-------|--------|-------------------|---------|
| HTTP 404 (propiedad eliminada) | Skip propiedad, NO llamar registrar_enrichment() | Permanece `pendiente` | ⚠️ Warning |
| HTML sin datos | Skip propiedad, NO llamar registrar_enrichment() | Permanece `pendiente` | ⚠️ Warning |
| Formato inesperado | Skip propiedad, NO llamar registrar_enrichment() | Permanece `pendiente` | ⚠️ Warning |
| Status incorrecto (≠ 'pendiente') | Ignorar completamente, no es un error | Status sin cambio | ℹ️ Info |

**Filosofía:**  
> "Un error en una propiedad NO debe detener el procesamiento de las demás."

**Implicación de skip:**  
Cuando B1 skippea una propiedad por error no recuperable:
- `status` permanece en `pendiente`
- Propiedad será reintentada en próxima ejecución de B1
- Si persiste el error después de 3 intentos, considerar escalación manual

### 10.3 Estrategia de rollback

B1 **NO hace rollback** porque:
- `registrar_enrichment()` es idempotente
- Cada llamada es transacción independiente
- Si falla una propiedad, las demás continúan

---

## 11. MÉTRICAS DE ÉXITO

### 11.1 Métricas obligatorias por ejecución

| Métrica | Descripción |
|---------|-------------|
| `propiedades_procesadas` | Total intentadas |
| `propiedades_exitosas` | Completadas sin error |
| `propiedades_fallidas` | Con error |
| `campos_totales_extraidos` | Suma de campos poblados |
| `promedio_campos_por_propiedad` | `campos_totales / propiedades_exitosas` |
| `propiedades_con_candados` | Que tenían campos bloqueados |
| `duracion_total_segundos` | Tiempo de ejecución |

### 11.2 Métricas de calidad

| Métrica | Objetivo | Crítico si < |
|---------|----------|--------------|
| Tasa de éxito | > 90% | 70% |
| Promedio de campos extraídos | > 10/13 | 7/13 |
| Propiedades con precio | 100% | 95% |
| Propiedades con área | > 95% | 80% |

### 11.3 Alertas

**Generar alerta si:**
- Tasa de éxito < 70%
- Más de 10 propiedades con HTTP 404 en una ejecución
- Promedio de campos extraídos < 7
- Ejecución toma > 10 minutos

---

## 12. EXTRACTORES POR PORTAL

### 12.1 Remax

**URL Pattern:** `https://remax.bo/propiedad/{slug}`

**Campos críticos a extraer:**

| Campo | Selector aproximado | Validación |
|-------|---------------------|------------|
| `precio_usd` | `.price` o `[data-price]` | Numeric |
| `moneda_original` | Texto junto a precio | `"USD"` o `"BOB"` |
| `area_total_m2` | `.area` o `[data-area]` | Numeric |
| `dormitorios` | `.bedrooms` | Integer |
| `banos` | `.bathrooms` | Numeric (puede ser 2.5) |
| `estacionamientos` | `.parking` | Integer |

**Notas:**
- Selectores reales deben determinarse durante implementación
- Usar Firecrawl o Puppeteer según disponibilidad
- Implementar fallbacks para cambios de HTML

### 12.2 Century21

**URL Pattern:** `https://c21.com.bo/propiedad/{id}`

**Campos críticos a extraer:**

| Campo | Selector aproximado | Validación |
|-------|---------------------|------------|
| `precio_usd` | `.precio` | Numeric |
| `moneda_original` | Detectar símbolo `$` o `Bs` | `"USD"` o `"BOB"` |
| `area_total_m2` | `.superficie` | Numeric |
| `dormitorios` | `.dormitorios` | Integer |
| `banos` | `.banos` | Numeric |
| `estacionamientos` | `.parqueos` o `.garajes` | Integer |

**Notas:**
- Century21 puede tener estructura HTML distinta a Remax
- Requiere análisis de HTML real durante implementación

---

## 13. CASOS DE TEST MÍNIMOS

### 13.1 Test 1: Propiedad nueva (happy path)

**Input:**
- `status = 'pendiente'` (asignado por Flujo A en Discovery)
- `es_activa = TRUE`
- `url` válida y accesible
- Sin `campos_bloqueados`

**Proceso:**
1. B1 selecciona propiedad con `status = 'pendiente'`
2. Scrape exitoso de HTML
3. Extracción de 13/13 campos
4. Llamada a `registrar_enrichment()`

**Output esperado:**
- `status = 'actualizado'` (transición de 'pendiente' → 'actualizado')
- `fecha_enrichment` = NOW()
- 13 campos poblados en BD
- `datos_json_enrichment` con metadata completa
- Propiedad lista para Merge

### 13.2 Test 2: Propiedad con candados

**Input:**
- `status = 'pendiente'`
- `campos_bloqueados = '{"precio_usd": true}'`

**Proceso:**
1. Scrape exitoso
2. Extracción incluye `precio_usd = 100000`
3. Llamada a `registrar_enrichment()`

**Output esperado:**
- `precio_usd` NO cambia (respeta candado)
- Otros 12 campos SÍ actualizan
- Log indica "campo bloqueado respetado"

### 13.3 Test 3: Propiedad en BOB

**Input:**
- Precio publicado: `850000 BOB`
- TC paralelo actual: `10.50`

**Proceso:**
1. Extracción detecta `moneda_original = 'BOB'`
2. B1 calcula `precio_usd = 850000 / 10.50 = 80952.38`
3. Llamada a `registrar_enrichment()`

**Output esperado:**
- `precio_usd = 80952.38`
- `precio_usd_original = 850000`
- `moneda_original = 'BOB'`
- `depende_de_tc = TRUE`

### 13.4 Test 4: HTML sin datos

**Input:**
- `status = 'pendiente'`
- URL válida pero HTML no contiene precio

**Proceso:**
1. Scrape exitoso (HTTP 200)
2. Parser no encuentra selectores críticos
3. Campos extraídos: 3/13 (insuficiente para enrichment)

**Output esperado:**
- Skip propiedad, NO llamar a `registrar_enrichment()`
- Registrar warning en log: "HTML sin datos suficientes"
- `status` permanece `'pendiente'` (sin cambio)
- Propiedad será reintentada en próxima ejecución de B1
- Considerar revisión manual si falla 3+ veces consecutivas

### 13.5 Test 5: Propiedad eliminada (HTTP 404)

**Input:**
- `status = 'pendiente'`
- URL devuelve HTTP 404 (propiedad eliminada del portal)

**Proceso:**
1. HTTP GET falla con 404
2. B1 detecta eliminación

**Output esperado:**
- NO llamar a `registrar_enrichment()`
- Registrar warning: "Propiedad eliminada (HTTP 404)"
- `status` permanece `'pendiente'` (sin cambio en BD)
- Flujo A detectará la ausencia en próximo scrape y marcará `inactivo_por_confirmar`
- Flujo C confirmará el 404 y marcará `inactivo`
- Continuar con siguiente propiedad del batch

---

## 14. CHECKLIST DE IMPLEMENTACIÓN

### Pre-requisitos

- [ ] Función `registrar_enrichment()` desplegada y probada
- [ ] Tabla `config_global` tiene TC actuales
- [ ] Acceso HTTP a portales Remax y Century21
- [ ] n8n con módulo HTTP Request o Firecrawl instalado

### Diseño

- [ ] Definir extractores por portal (selectores CSS)
- [ ] Diseñar estructura de workflow en n8n
- [ ] Definir estrategia de rate limiting (2s entre requests)
- [ ] Diseñar manejo de errores por tipo

### Desarrollo

- [ ] Nodo SQL: SELECT propiedades `WHERE status = 'pendiente' AND es_activa = TRUE`
- [ ] Validar que solo procesa status = 'pendiente', ignorar otros estados
- [ ] Nodo Loop: iterar máximo 50 propiedades
- [ ] Nodo HTTP: scrape página individual
- [ ] Nodo Code: parsear HTML y extraer 13 campos
- [ ] Nodo Code: calcular conversión BOB → USD
- [ ] Nodo Code: validar que se extrajeron campos mínimos antes de llamar enrichment
- [ ] Nodo SQL: llamar `registrar_enrichment()` solo si extracción exitosa
- [ ] Validar transición status: 'pendiente' → 'actualizado' post-enrichment
- [ ] Nodo Code: generar reporte de ejecución
- [ ] Nodo Error Handler: capturar y loggear errores sin detener batch

### Testing

- [ ] Test unitario: extractor Remax
- [ ] Test unitario: extractor Century21
- [ ] Test integración: propiedad con status = 'pendiente' sin candados → status = 'actualizado'
- [ ] Test integración: propiedad con candados respeta campos bloqueados
- [ ] Test integración: propiedad en BOB → conversión USD correcta
- [ ] Test integración: HTML sin datos → status permanece 'pendiente', no llama enrichment
- [ ] Test integración: HTTP 404 → status permanece 'pendiente', registra warning
- [ ] Test integración: status ≠ 'pendiente' → ignora propiedad sin error
- [ ] Test performance: 50 propiedades en < 5 minutos
- [ ] Test transición status: verificar que SOLO 'pendiente' → 'actualizado' ocurre

### Deployment

- [ ] Workflow guardado en `n8n/workflows/modulo_1/flujo_b/`
- [ ] Schedule configurado: 3:00 AM
- [ ] Alertas configuradas (Slack/email)
- [ ] Documentación de implementación creada

---

## 15. INSTRUCCIONES PARA IMPLEMENTADOR

Si estás implementando Flujo B - Célula B1:

### ✅ Reglas que DEBES seguir

1. **Solo extrae los 13 campos listados** - No agregues campos adicionales
2. **Respeta candados** - `registrar_enrichment()` ya lo hace, solo pasa los datos
3. **No modifiques campos de Discovery** - Son propiedad exclusiva de Flujo A
4. **Procesa solo `status = 'pendiente'`** - Ignora otros estados
5. **Usa TC de `config_global`** - No calcules ni actualices TC tú mismo
6. **Maneja errores individualmente** - Un error NO debe detener el batch
7. **Loggea todo** - Éxitos, fallos, warnings, métricas

### ❌ Reglas que NO DEBES violar

1. **NO hagas matching** - No toques `id_proyecto_master` ni campos relacionados
2. **NO hagas validaciones complejas** - No juzgues si datos son "correctos"
3. **NO actualices múltiples veces la misma propiedad** - Idempotencia: 1 llamada = 1 UPDATE
4. **NO cambies status más allá de `actualizado`** - Esa transición es de Merge
5. **NO modifices la arquitectura** - Si necesitas cambios, actualiza este contrato primero

### 🔍 Cómo debuggear

**Si una propiedad no se actualiza:**
1. Verificar que `status = 'pendiente'`
2. Verificar que `es_activa = TRUE`
3. Verificar que URL es accesible (HTTP 200)
4. Verificar logs de `registrar_enrichment()`
5. Verificar si hay candados en `campos_bloqueados`

**Si el scraping falla:**
1. Verificar estructura HTML del portal (puede haber cambiado)
2. Verificar rate limiting (2s entre requests)
3. Verificar timeout (incrementar si necesario)
4. Probar URL manualmente en navegador

---

## 16. VERSIONAMIENTO Y EVOLUCIÓN

### 16.1 Versión actual

**Versión contrato:** 1.0.1  
**Fecha:** Diciembre 2025  
**Estado:** DISEÑO (no implementado)

**Cambios en v1.0.1:**
- Aclaración semántica de `status = 'pendiente'` como único input válido
- Explicitación de transiciones de status permitidas y prohibidas
- Eliminación de ambigüedades sobre gestión de estados
- Alineación con estados reales del sistema

### 16.2 Cambios futuros previstos

**Versión 1.1:** Agregar soporte para portal adicional (TuCasa, InfoCasas)  
**Versión 2.0:** División en células B1a (financiero) y B1b (físico)  
**Versión 3.0:** Enrichment incremental (solo campos faltantes)

### 16.3 Política de cambios

**Cambios que requieren nueva versión mayor:**
- Agregar/quitar campos del contrato de 13 campos
- Cambiar lógica de conversión de moneda
- Modificar estados que setea o procesa
- Cambiar transiciones de status permitidas

**Cambios que requieren versión menor:**
- Agregar soporte para nuevo portal
- Mejorar extractores existentes
- Optimizar performance
- Aclarar semántica sin cambiar comportamiento

**Cambios que NO requieren nueva versión:**
- Corregir bugs en extractores
- Mejorar logging
- Ajustar selectores CSS por cambios en portales

---

## 17. RELACIÓN CON DOCUMENTACIÓN EXISTENTE

Este contrato complementa:

| Documento | Relación |
|-----------|----------|
| `MODULO_1_DISCOVERY_EXISTENCIA.md` | B1 opera dentro de Módulo 1 |
| `MODULO_1_FLUJO_A_IMPLEMENTACION.md` | B1 depende de output de Flujo A |
| `MODULO_1_ARQUITECTURA_DUAL.md` | B1 es parte del pipeline Discovery → Enrichment → Merge |
| `sql/functions/enrichment/registrar_enrichment.sql` | B1 usa esta función como interface con BD |

---

## 18. GLOSARIO

| Término | Definición |
|---------|------------|
| **Enrichment** | Proceso de agregar datos detallados a propiedades ya descubiertas |
| **Célula** | Subdivisión funcional dentro de un Flujo |
| **Candado** | Campo marcado en `campos_bloqueados` que NO puede ser sobrescrito automáticamente |
| **Discovery** | Proceso de detectar URLs nuevas (Flujo A) |
| **Merge** | Proceso que fusiona datos de Discovery + Enrichment |
| **TC** | Tipo de Cambio (BOB → USD) |
| **TC Paralelo** | Tipo de cambio del mercado paralelo (blue dollar) |

---

**FIN DEL CONTRATO - FLUJO B CÉLULA B1**

*SICI – Sistema Inteligente de Captura Inmobiliaria*  
*Módulo 1 – Discovery & Existencia*  
*Diciembre 2025*
