# RESEARCH: Firecrawl HTML Scraping en SICI

**Versión:** 1.0  
**Fecha:** Diciembre 2024  
**Propósito:** Documentar cómo se usa Firecrawl para scraping HTML en SICI  
**Audiencia:** Claude Code para implementación de Flujo B  
**Archivo:** `docs/research/RESEARCH_FIRECRAWL_HTML.md`

---

## 1. QUÉ ES FIRECRAWL Y POR QUÉ SE USA EN SICI

### 1.1 Definición técnica de Firecrawl

Firecrawl es un servicio cloud de web scraping que proporciona infraestructura gestionada para extraer contenido de páginas web modernas. A diferencia del scraping tradicional con HTTP requests simples, Firecrawl incluye:

- **Headless browsers** automatizados (Chrome/Chromium)
- **JavaScript rendering completo** antes de capturar HTML
- **Proxies rotativos** para evitar bloqueos por IP
- **Gestión de anti-bot** y WAF (Web Application Firewalls)
- **HTML limpio** sin scripts, ads ni elementos de navegación

### 1.2 Rol exacto en la arquitectura SICI

**Firecrawl se usa EXCLUSIVAMENTE en el Flujo B (Processing).**

- ❌ **NO usado en Flujo A (Discovery)**: El Flujo A usa HTTP Request directo a portales inmobiliarios para descubrir URLs
- ✅ **SÍ usado en Flujo B (Processing)**: El Flujo B usa Firecrawl para obtener HTML limpio de páginas individuales de propiedades

**Posición en pipeline:**
```
[Flujo A: Discovery]
  URLs descubiertas → BD (status='nueva')
    ↓
[Flujo B: Processing] ← FIRECRAWL AQUÍ
  HTTP Request → Firecrawl API → HTML limpio → Extractores
```

**Rol específico:**
Proveer HTML raw limpio y completo de páginas individuales de propiedades como input para los extractores Century21 v16.3+ y Remax v1.6+.

### 1.3 Problema que resuelve vs scraping manual

Las páginas de propiedades de Century21 y Remax tienen características que hacen inviable el scraping con HTTP Request simple:

**1. JavaScript rendering dinámico**
- Precio, área, dormitorios se cargan vía JavaScript después del HTML inicial
- Galería de imágenes se carga asíncronamente
- Datos de contacto del agente requieren ejecución de scripts

**2. Anti-bot / WAF**
- Century21 y Remax detectan requests automatizados
- Bloquean por User-Agent, falta de cookies, patrones de requests
- Requieren headless browser para simular navegador real

**3. Contenido asíncrono**
- Mapa de ubicación se renderiza post-carga
- Amenities se populan desde API interna vía AJAX
- Descripción completa puede estar en acordeones colapsables

**4. Complejidad de infraestructura**
- Gestionar proxies rotativos manualmente es costoso
- Mantener headless browsers actualizados requiere DevOps
- Rate limiting y retry logic es complejo de implementar

**Firecrawl resuelve todo esto como servicio gestionado.**

### 1.4 Qué NO hace Firecrawl

Es crítico entender los límites de Firecrawl en la arquitectura SICI:

- ❌ **NO hace scoring** de calidad de datos (eso es el Scorer v7.7)
- ❌ **NO hace matching** con proyectos master (eso es el Merge nocturno)
- ❌ **NO usa IA** para inferir datos faltantes (eso sería Módulo 2)
- ❌ **NO hace enrichment** de mercado con fuentes externas
- ❌ **NO interpreta** el contenido del HTML

**Firecrawl solo hace UNA cosa:** Retornar HTML limpio sin interpretación.

---

## 2. MODO DE USO EN SICI

### 2.1 Tipo de request

**Implementación en n8n:**

- **Nodo:** HTTP Request nativo de n8n (v4.3)
- **Tipo:** `n8n-nodes-base.httpRequest`
- **NO es nodo comunitario** `@mendable/n8n-nodes-firecrawl`
- **Method:** POST
- **URL:** `https://api.firecrawl.dev/v2/scrape`
- **Authentication:** `predefinedCredentialType` (firecrawlApi)

**Configuración del body (JSON):**
```
{
  url: string,              // URL de la propiedad a scrapear
  formats: [{type: "rawHtml"}],  // Solo HTML raw, sin markdown
  timeout: 75000,           // 75 segundos máximo de scraping
  waitFor: 2000             // 2 segundos espera post-carga para JS
}
```

**Configuración de timeouts:**
- **Firecrawl timeout:** 75000ms (configurado en body)
- **n8n timeout:** 80000ms (configurado en options del nodo)
- **Razón:** n8n timeout debe ser mayor que Firecrawl para capturar respuesta de error

**Error handling:**
- **onError:** `"continueErrorOutput"` en nodo HTTP Request
- **Comportamiento:** Si Firecrawl falla, el workflow continúa y el error se propaga al Normalizador

### 2.2 Qué devuelve Firecrawl (estructura general)

**Respuesta exitosa:**
```json
{
  "success": true,
  "data": {
    "rawHtml": "<html>...</html>",
    "metadata": {
      "statusCode": 200,
      "sourceURL": "https://www.century21.com.bo/propiedad/12345",
      "title": "Departamento en Venta...",
      "description": "...",
      "language": "es"
    }
  }
}
```

**Respuesta con error:**
```json
{
  "success": false,
  "error": "Timeout after 75000ms",
  "data": null
}
```

**Campos en respuesta:**

| Campo | Tipo | Descripción | Obligatorio |
|-------|------|-------------|-------------|
| `success` | boolean | Indica si el scraping fue exitoso | Sí |
| `data.rawHtml` | string | HTML completo de la página | Sí (si success=true) |
| `data.metadata.statusCode` | number | Código HTTP (200, 404, 500) | Sí |
| `data.metadata.sourceURL` | string | URL procesada (puede diferir si hubo redirect) | Sí |
| `data.metadata.title` | string | Título de la página HTML | No |
| `error` | string | Mensaje de error si success=false | No |

### 2.3 Campos relevantes para extractores

Los extractores Century21 v16.3+ y Remax v1.6+ solo necesitan estos campos:

**Campo principal:**
- **`data.rawHtml`** → Input para parsing con regex y extracción de datos estructurados

**Campos secundarios (metadata):**
- **`metadata.statusCode`** → Detección de páginas 404 (propiedad inactiva) o 500 (error del portal)
- **`metadata.sourceURL`** → Trazabilidad y logging, verificación de redirects
- **`success`** → Flag de validación inicial antes de procesar HTML

**Flujo de validación:**
1. Verificar `success === true`
2. Verificar `data.rawHtml` existe y no es vacío
3. Verificar `data.rawHtml.length > 300` (mínimo razonable)
4. Verificar `metadata.statusCode === 200`
5. Si todo OK → pasar al extractor

---

## 3. RELACIÓN CON FLUJO B CORE++

### 3.1 Qué datos alimenta

Firecrawl alimenta el **primer componente del Flujo B**: el Extractor.

**Input del Firecrawl:**
- URL de propiedad individual (ej: `https://www.century21.com.bo/propiedad/12345`)
- Propiedad con `status='pendiente'` o `status='nueva'` en BD

**Output del Firecrawl:**
- HTML raw limpio de la página de propiedad
- Sin scripts, sin ads, sin navegación
- Solo contenido relevante para extracción de datos

**Características del HTML limpio:**
- Estructura DOM completa y válida
- Contenido dinámico ya renderizado (JavaScript ejecutado)
- Imágenes y recursos externos preservados como URLs
- Sin elementos de navegación global del portal
- Sin popups, banners o elementos decorativos

### 3.2 Pipeline completo del Flujo B

```
1. [HTTP Request → Firecrawl API v2]
   Input: URL de propiedad
   Output: JSON con data.rawHtml
   
2. [Normalizador de Respuesta]
   Input: Response de Firecrawl
   Output: Formato estandarizado {id, url, data: {rawHtml}, success}
   
3. [Extractor Century21 v16.3 / Remax v1.6]
   Input: HTML raw normalizado
   Output: JSON con 80+ campos estructurados
   
4. [Scorer v7.7]
   Input: JSON del extractor
   Output: score_calidad_dato (0-100)
   
5. [Verificador v1.3]
   Input: JSON + score
   Output: score_fiduciario (0-100) + flags_semanticos
```

**Posición de Firecrawl:** Primera fase, provee el input de toda la cadena.

### 3.3 Qué espera el extractor después de Firecrawl

El extractor NO recibe directamente la respuesta de Firecrawl. Primero pasa por el **Normalizador de Respuesta**.

**Formato esperado por el extractor:**
```javascript
{
  id: 12345,                    // ID de propiedad en BD
  url: "https://...",           // URL original
  data: {
    rawHtml: "<html>...</html>", // HTML completo
    sourceURL: "https://..."     // URL verificada (post-redirects)
  },
  success: true
}
```

**Validaciones previas del Normalizador:**

1. **Verificar `success === true`** en response de Firecrawl
2. **Verificar `data.rawHtml` existe** y no es `null` o `undefined`
3. **Verificar `data.rawHtml.length > 300`** (HTML mínimo razonable)
4. **Extraer `metadata.sourceURL`** para trazabilidad
5. **Preservar `id` original** de la propiedad en BD

**Si alguna validación falla:**
```javascript
{
  id: 12345,
  url: "https://...",
  error: true,
  mensaje: "HTML insuficiente (length: 150)",
  data: null
}
```

### 3.4 Qué pasa si Firecrawl falla

**Configuración de error handling:**
- Nodo HTTP Request tiene `onError: "continueErrorOutput"`
- El workflow **NO se detiene** si Firecrawl falla
- El error se propaga al Normalizador para manejo graceful

**Flujo de error:**

1. **Firecrawl falla** (timeout, 500, rate limit)
   ```json
   {
     "success": false,
     "error": "Timeout after 75000ms"
   }
   ```

2. **Normalizador detecta error**
   - Valida `success === false` o `data.rawHtml` vacío
   - Genera objeto de error normalizado

3. **Extractor recibe flag de error**
   - NO procesa el HTML (no existe)
   - NO marca la propiedad como inactiva
   - Retorna metadata de error

4. **Propiedad queda en `status='pendiente'`**
   - NO se marca como `'inactivo'` (evita falsos positivos)
   - NO se actualiza `fecha_enrichment`
   - Permite retry manual o automático posterior

**Razones para NO marcar inactiva:**
- Error puede ser temporal (timeout, rate limit)
- Portal puede estar caído momentáneamente
- Firecrawl API puede tener problemas
- Marcar inactiva requiere confirmación (eso es Flujo C)

**Casos de error comunes:**

| Tipo Error | Causa | Action |
|------------|-------|--------|
| Timeout (75s) | Página muy lenta | Queda pendiente, retry posterior |
| 404 | Propiedad eliminada del portal | Extractor detecta, marca `es_inactiva=true` |
| 500 | Error del portal | Queda pendiente, retry posterior |
| Rate limit | Demasiados requests | Queda pendiente, esperar y retry |
| HTML < 300 chars | Página vacía o bloqueada | Queda pendiente, investigar |

---

## 4. BUENAS PRÁCTICAS

### 4.1 Una sola pasada

**Principio:** Un request = una URL = un HTML completo.

- ❌ **NO hacer batch requests** a Firecrawl API
- ❌ **NO intentar scrapear múltiples URLs** en un solo request
- ✅ **SÍ procesar propiedades 1 por 1** en loop de n8n
- ✅ **SÍ usar Split in Batches** para control de flujo

**Razón:**
- Firecrawl API v2 `/scrape` endpoint es single-URL
- Batch scraping existe pero es endpoint diferente (`/batch`)
- SICI no usa batch para mantener simplicidad y control granular

### 4.2 No inferir

**Principio:** Si el dato no está en el HTML, no existe.

- ❌ **NO asumir** estructura si response incompleto
- ❌ **NO inventar datos** si HTML está vacío
- ❌ **NO inferir** que propiedad está inactiva por error de scraping
- ✅ **SÍ retornar error explícito** con metadata clara
- ✅ **SÍ preservar** el HTML raw original sin modificaciones

**Casos específicos:**

| Situación | ❌ Incorrecto | ✅ Correcto |
|-----------|--------------|------------|
| HTML vacío | Asumir inactiva | Error flag, queda pendiente |
| Timeout 75s | Marcar como error permanente | Error temporal, permite retry |
| 404 status | Firecrawl falló | Extractor detecta, marca inactiva |
| HTML < 300 | Inventar datos default | Error flag con length exacto |

### 4.3 No llamar APIs externas adicionales

**Principio:** Firecrawl es la única API en esta fase del pipeline.

- ❌ **NO llamar** Google Places API para geocoding
- ❌ **NO llamar** OpenAI para extracción con IA
- ❌ **NO llamar** APIs de tipo de cambio
- ❌ **NO hacer** web scraping adicional de otros portales
- ✅ **SÍ usar solo** Firecrawl para obtener HTML
- ✅ **SÍ dejar** enrichment externo para Módulo 2

**Razón:**
- Flujo B es **processing estructurado**, no enrichment
- Separación de responsabilidades: scraping vs enrichment
- Costos controlados y predecibles
- Debugging más simple con una sola fuente de datos

### 4.4 Manejo de timeouts / HTML incompleto

**Configuración de timeouts:**

```
┌─────────────────────────────────────┐
│ n8n Timeout: 80000ms                │
│   ┌─────────────────────────────┐   │
│   │ Firecrawl Timeout: 75000ms  │   │
│   │   ┌─────────────────────┐   │   │
│   │   │ waitFor: 2000ms     │   │   │
│   │   │ (JS rendering)      │   │   │
│   │   └─────────────────────┘   │   │
│   └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

**Lógica:**
1. **waitFor 2000ms:** Firecrawl espera 2 segundos después de load event para que JavaScript termine de renderizar
2. **Firecrawl timeout 75000ms:** Si después de 75 segundos no termina, Firecrawl cancela y retorna error
3. **n8n timeout 80000ms:** Si Firecrawl no responde en 80 segundos, n8n cancela el request

**Manejo de HTML incompleto:**

```javascript
// Validación en Normalizador
if (!html || html.length < 300) {
  return {
    error: true,
    mensaje: `HTML insuficiente (length: ${html?.length || 0})`,
    data: null
  };
}
```

**Acción si timeout:**
- Firecrawl retorna `success: false` con mensaje de timeout
- Normalizador propaga el error
- Propiedad queda en `status='pendiente'`
- **NO se marca inactiva** automáticamente

### 4.5 Error handling configurado

**onError: "continueErrorOutput"**

Esta configuración en el nodo HTTP Request permite:

1. **Workflow continúa** aunque Firecrawl falle
2. **Error output** se pasa al siguiente nodo (Normalizador)
3. **No se pierde** el `id` de la propiedad que falló
4. **Logs completos** de qué propiedades fallaron y por qué
5. **No bloquea** el procesamiento de otras propiedades en el batch

**Ventajas:**
- Sistema resiliente a fallos temporales
- No requiere re-ejecutar todo el batch por 1 fallo
- Permite debugging granular por propiedad
- Facilita retry selectivo de propiedades fallidas

---

## 5. LIMITACIONES CONOCIDAS

### 5.1 Páginas dinámicas complejas

**Problema identificado:** Paginación JavaScript infinita (Remax)

Remax implementa scroll infinito donde:
- Propiedades se cargan bajo demanda al hacer scroll
- No hay URLs de páginas numeradas
- JavaScript detecta posición del scroll y carga más items

**Limitación de Firecrawl:**
- `waitFor` espera tiempo fijo, no detecta cuándo terminó la carga
- No puede simular scroll automático para disparar lazy loading
- Captura solo propiedades visibles en viewport inicial

**Impacto en SICI:**
- Flujo A captura menos propiedades de Remax que de Century21
- No es problema del Flujo B (que scrapeá URLs individuales)

**Solución potencial:** Puppeteer con scroll automation (fuera de scope de Firecrawl)

### 5.2 HTML incompleto

**Causa:** Portal cambia estructura HTML

Los portales Century21 y Remax pueden:
- Rediseñar su sitio web sin previo aviso
- Cambiar clases CSS o IDs de elementos
- Mover datos a diferentes secciones del DOM
- Implementar nuevos anti-bot mecanismos

**Comportamiento de Firecrawl:**
- Firecrawl **SÍ captura** el HTML nuevo correctamente
- Firecrawl **NO detecta** que la estructura cambió
- El HTML está completo, pero el **extractor falla** porque busca elementos antiguos

**No es un error de Firecrawl, es un cambio en el portal.**

**Detección:**
- Extractor retorna campos vacíos o `null`
- Score de calidad baja (<70)
- Múltiples propiedades fallan simultáneamente

**Acción:** Actualizar extractores (regex, selectores CSS) a nueva estructura.

### 5.3 Rate limiting

**Dos tipos de rate limiting:**

**1. Rate limiting de Firecrawl API**
- Límites según plan contratado (ej: 1000 requests/hora)
- Si se excede, Firecrawl retorna error 429 (Too Many Requests)
- Solución: respetar límites, implementar wait entre requests

**2. Rate limiting de portales (Century21/Remax)**
- Los portales pueden detectar que todas las requests vienen de IPs de Firecrawl
- Pueden bloquear temporalmente las IPs de Firecrawl
- Firecrawl rotará proxies pero puede seguir bloqueado

**Síntomas:**
- Multiple requests fallan simultáneamente
- Respuestas con statusCode 403 (Forbidden) o 429
- Páginas retornan captchas o "Access Denied"

**Mitigación en SICI:**
- Wait de 2 segundos entre requests en Flujo B (configurado en workflow)
- Procesar propiedades en horarios de baja actividad
- No ejecutar múltiples instancias del Flujo B en paralelo

### 5.4 Costos API

**Estructura de costos:**
- Pricing: ~$1-2 por 1000 requests (varía según plan)
- Cada propiedad = 1 request
- Sin caching implementado actualmente en SICI

**Cálculo ejemplo:**
```
100 propiedades/día × 30 días = 3000 requests/mes
3000 requests × $0.0015 = $4.50/mes
```

**Costo es lineal con número de propiedades procesadas.**

**Sin optimizaciones:**
- No hay cache de HTML (cada re-scrape es un nuevo request)
- No hay detección de "propiedad no cambió" antes de scrapear
- Propiedades inactivas se siguen scrapeando hasta que Flujo C confirma

**Optimización futura (fuera de scope actual):**
- Implementar TTL de cache (ej: 24 horas)
- Verificar cambios antes de re-scrapear
- Priorizar propiedades nuevas vs actualizaciones

### 5.5 Timeout máximo

**Límite práctico:** ~75 segundos por request

**Por qué este límite:**
- Firecrawl API tiene timeout máximo configurable
- n8n workflows tienen timeout global
- Páginas que toman >75s probablemente tienen problemas serios

**Páginas afectadas:**
- Galerías de imágenes muy grandes (50+ fotos 4K)
- Mapas interactivos complejos con muchos marcadores
- Portales con problemas de performance
- Conexión lenta del servidor del portal

**Comportamiento:**
- Firecrawl retorna `success: false` con "Timeout"
- Propiedad queda pendiente para retry
- Manual review puede determinar si es problema permanente

**No es configurable más allá de límites de la API de Firecrawl.**

### 5.6 Casos donde no conviene usarlo

**1. Páginas de listado simples (Flujo A)**
- Flujo A descubre URLs de páginas de búsqueda/listado
- Estas páginas son HTML más simple, sin JS crítico
- HTTP Request directo a portal es suficiente y más barato
- ✅ **SICI ya hace esto correctamente** (Flujo A no usa Firecrawl)

**2. APIs REST disponibles**
- Si Century21 o Remax tuvieran API pública
- Acceso directo a datos estructurados JSON
- Más rápido, más barato, más estable que scraping
- ❌ **No aplica a SICI** (portales no tienen API pública)

**3. Datos estructurados JSON-LD**
- Si los portales incluyeran structured data en HTML
- Parsing directo de JSON-LD es más confiable que regex
- No requiere rendering de JavaScript
- ⚠️ **Parcialmente aplica**: Century21 tiene algo de JSON-LD pero incompleto

**4. Páginas estáticas sin JavaScript**
- Sitios web antiguos o simples
- HTTP Request directo es 10x más rápido y barato
- ❌ **No aplica a SICI** (Century21/Remax son SPAs modernos con JS pesado)

---

## 6. EJEMPLO CONCEPTUAL (NO CÓDIGO PRODUCTIVO)

**⚠️ ADVERTENCIA:** Los siguientes ejemplos son pseudocódigo conceptual para ilustrar el flujo. NO copiar como código productivo.

### 6.1 Diagrama de flujo simplificado

```
┌─────────────────┐
│ Propiedad en BD │
│ status='nueva'  │
│ url='https://...'│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────┐
│ HTTP Request → Firecrawl API │
│ POST /v2/scrape              │
│ Body: {url, formats, timeout}│
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Response de Firecrawl        │
│ {success, data: {rawHtml}}   │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Normalizador                 │
│ - Valida success=true        │
│ - Valida rawHtml existe      │
│ - Valida length > 300        │
│ - Formatea para extractor    │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Extractor Century21/Remax    │
│ - Parsea HTML con regex      │
│ - Extrae 80+ campos          │
│ - Retorna JSON estructurado  │
└────────┬────────────────────┘
         │
         ▼
┌─────────────────────────────┐
│ Scorer → Verificador → BD    │
└─────────────────────────────┘
```

### 6.2 Pseudocódigo del request

```javascript
// Configuración del nodo HTTP Request en n8n
const firecrawlRequest = {
  method: "POST",
  url: "https://api.firecrawl.dev/v2/scrape",
  authentication: "firecrawlApi", // Credencial configurada en n8n
  
  body: {
    url: propiedad.url,              // URL de propiedad individual
    formats: [{ type: "rawHtml" }],  // Solo HTML raw
    timeout: 75000,                  // 75 segundos máximo
    waitFor: 2000                    // Espera 2s post-carga
  },
  
  options: {
    timeout: 80000                   // n8n timeout (mayor que Firecrawl)
  },
  
  onError: "continueErrorOutput"     // No detener workflow
};

// Ejecutar request
const response = await executeFirecrawlRequest(firecrawlRequest);
```

### 6.3 Pseudocódigo de validación post-request

```javascript
// Normalizador de Respuesta Firecrawl
function normalizarRespuestaFirecrawl(response, propiedadId, propiedadUrl) {
  
  // Validación 1: Success flag
  if (!response.success) {
    return {
      id: propiedadId,
      url: propiedadUrl,
      error: true,
      mensaje: response.error || "Scraping falló sin mensaje",
      data: null
    };
  }
  
  // Validación 2: Data.rawHtml existe
  const html = response.data?.rawHtml;
  if (!html) {
    return {
      id: propiedadId,
      url: propiedadUrl,
      error: true,
      mensaje: "rawHtml no encontrado en response",
      data: null
    };
  }
  
  // Validación 3: HTML tiene contenido mínimo
  if (html.length < 300) {
    return {
      id: propiedadId,
      url: propiedadUrl,
      error: true,
      mensaje: `HTML insuficiente (length: ${html.length})`,
      data: { rawHtml: html } // Preservar para debug
    };
  }
  
  // Validación 4: Status code es 200
  const statusCode = response.data?.metadata?.statusCode;
  if (statusCode !== 200) {
    // Nota: 404 no es error de Firecrawl, es dato válido (propiedad inactiva)
    // El extractor manejará este caso
  }
  
  // ✅ Todo OK, retornar formato normalizado
  return {
    id: propiedadId,
    url: propiedadUrl,
    data: {
      rawHtml: html,
      sourceURL: response.data?.metadata?.sourceURL || propiedadUrl
    },
    success: true
  };
}
```

### 6.4 Ejemplos de respuesta

**Caso exitoso: HTML completo**

```javascript
// Response de Firecrawl API
{
  success: true,
  data: {
    rawHtml: `
      <!DOCTYPE html>
      <html lang="es">
      <head><title>Departamento en Venta - Equipetrol</title></head>
      <body>
        <div class="property-price">$120,000</div>
        <div class="property-area">85.5 m²</div>
        <div class="property-bedrooms">2 dormitorios</div>
        <!-- ... más HTML ... -->
      </body>
      </html>
    `,
    metadata: {
      statusCode: 200,
      sourceURL: "https://www.century21.com.bo/propiedad/12345",
      title: "Departamento en Venta - Equipetrol",
      language: "es"
    }
  }
}

// Después del Normalizador
{
  id: 12345,
  url: "https://www.century21.com.bo/propiedad/12345",
  data: {
    rawHtml: "<!DOCTYPE html>...",
    sourceURL: "https://www.century21.com.bo/propiedad/12345"
  },
  success: true
}
```

**Caso error: Timeout**

```javascript
// Response de Firecrawl API
{
  success: false,
  error: "Request timeout after 75000ms",
  data: null
}

// Después del Normalizador
{
  id: 12345,
  url: "https://www.century21.com.bo/propiedad/12345",
  error: true,
  mensaje: "Request timeout after 75000ms",
  data: null
}

// En BD: status permanece 'pendiente', permite retry
```

**Caso error: 404 (Propiedad eliminada)**

```javascript
// Response de Firecrawl API
{
  success: true,  // Firecrawl SÍ scrapeó correctamente
  data: {
    rawHtml: `
      <html>
      <body>
        <h1>Propiedad no encontrada</h1>
        <p>Esta propiedad ya no está disponible.</p>
      </body>
      </html>
    `,
    metadata: {
      statusCode: 404,  // ← Dato importante
      sourceURL: "https://www.century21.com.bo/propiedad/12345"
    }
  }
}

// Después del Normalizador (pasa como válido)
{
  id: 12345,
  url: "https://www.century21.com.bo/propiedad/12345",
  data: {
    rawHtml: "<html>...",  // HTML de página 404
    sourceURL: "https://www.century21.com.bo/propiedad/12345"
  },
  success: true  // Firecrawl funcionó, la página dio 404
}

// Extractor detecta página 404 y marca:
// es_inactiva: true
```

---

## CONCLUSIÓN

Firecrawl en SICI es una herramienta específica con un rol bien definido:

✅ **Proporciona HTML limpio** de páginas individuales de propiedades  
✅ **Resuelve JavaScript rendering** que HTTP directo no puede  
✅ **Usado solo en Flujo B** (Processing), no en Flujo A (Discovery)  
✅ **Input del pipeline** de extracción, no del matching  
✅ **No interpreta datos**, solo scrapeá HTML  

❌ **No hace scoring, matching, ni enrichment**  
❌ **No infiere datos faltantes**  
❌ **No reemplaza validación humana**  

**Para Claude Code:** Este documento provee el contexto necesario para implementar el workflow de Flujo B sin asumir comportamientos de Firecrawl que no están documentados.
