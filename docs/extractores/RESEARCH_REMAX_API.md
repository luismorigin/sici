# RESEARCH_REMAX_API.md

**Fuente canónica – Discovery Remax (SICI)**

**Sistema:** SICI – Sistema Inteligente de Captura Inmobiliaria  
**Módulo relacionado:** Módulo 1 – Discovery & Existencia  
**Estado:** ✅ Validado en producción (Discovery)  
**Última actualización:** Diciembre 2025

---

## 0. Propósito de este documento

Este documento registra y congela el conocimiento crítico sobre cómo funciona realmente Remax Bolivia a nivel técnico, específicamente para el descubrimiento de propiedades.

Su objetivo es:

- Evitar que este conocimiento se pierda
- Evitar que un dev o IA "reinvente" el scraping
- Servir como fuente de verdad para Claude / Claude Code
- Justificar decisiones arquitectónicas ya tomadas

**Este documento NO es código, es inteligencia técnica.**

---

## 1. Hallazgo clave (Resumen Ejecutivo)

🔑 **Remax Bolivia expone una API interna pública (no documentada) que permite obtener listados de propiedades sin scraping HTML.**

👉 Esta API es:

- Estable
- Estructurada
- Mucho más confiable que scraping visual
- Ideal para Discovery (Módulo 1)

**Decisión:**  
👉 **Remax se consume vía API + HTTP, no vía scraping HTML.**

**Esta decisión es definitiva.**

---

## 2. Endpoint principal utilizado

### Endpoint base
```
https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste
```

### Parámetro de paginación
```
?page=N
```

### Ejemplo completo
```
https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste?page=1
```

---

## 3. Descubrimiento de paginación (Metadata)

### Observación clave

La primera página de la API devuelve metadata suficiente para conocer:

- Total de páginas
- Estructura del resultado
- Forma correcta de iterar

### Campos críticos de paginación

```json
{
  "current_page": 1,
  "last_page": 8,
  "per_page": 20,
  "total": 153,
  "from": 1,
  "to": 20,
  "next_page_url": "https://remax.bo/api/...?page=2",
  "prev_page_url": null
}
```

👉 **`last_page`** indica cuántas páginas deben recorrerse.

---

## 4. Estrategia correcta de Discovery (Remax)

### Flujo recomendado

1. Llamar una sola vez a `page=1`
2. Leer `last_page` del response
3. Generar dinámicamente URLs: `base_url?page=1..last_page`
4. Iterar todas las páginas
5. Extraer solo URLs / IDs / ubicación mínima

**Rate limit:** 2 segundos entre requests

---

## 4.1. Implementación de producción (Constructor de URLs)

### Patrón canónico en n8n

**Este es el método DEFINITIVO usado en producción:**

```javascript
const TOTAL_PAGES = 8; // Equipetrol (validado dic 2025)
const urls = [];

for (let page = 1; page <= TOTAL_PAGES; page++) {
  urls.push({
    page_url: `https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/equipetrolnoroeste?page=${page}`,
    fuente: 'remax',
    tipo: 'api'
  });
}

return urls;
```

### Decisión arquitectónica

👉 **El sistema genera URLs por adelantado** sin consultar `last_page` dinámicamente.

**Razones de esta decisión:**
- ✅ Simplicidad: 1 request menos
- ✅ Performance: Sin latencia por lectura de metadata
- ✅ Estabilidad: Validado y funcional en producción

**Esta decisión es definitiva.**

### Riesgo conocido y aceptado

⚠️ Si Remax cambia el número de páginas (`last_page`), el sistema NO lo detectará automáticamente.

**Este riesgo es conocido, documentado y conscientemente aceptado.**

**Mitigación implementada:**
- Validación mensual manual de `TOTAL_PAGES`
- Monitoreo de cambios en `total` (alertar si varía >10%)

### Referencia: Paginación dinámica (NO canónica)

**La siguiente implementación NO está activa en producción:**

```javascript
// ❌ NO CANÓNICO - Solo para referencia futura
const firstPage = await fetch(baseUrl + '?page=1');
const { last_page } = await firstPage.json();

for (let page = 1; page <= last_page; page++) {
  // ... generar URLs dinámicamente
}
```

**Estado:** Documentado únicamente como opción futura.  
**Acción:** NO implementar sin aprobación arquitectónica explícita.

---

## 5. Estructura de datos devuelta (confirmado)

### Response completo

```json
{
  "current_page": 1,
  "data": [
    {
      "id": 51591,
      "date_of_listing": "2025-11-11",
      "status_listing_id": 2,
      "MLSID": "120047032-21",
      "key": "bcc41895-5038-4493-b263-845b41e0b3db",
      "slug": "alquiler-departamento-santa-cruz...",
      "quality_score": 91,
      "listing_information": {
        "number_bedrooms": 1,
        "number_bathrooms": 1,
        "construction_area_m": 41,
        "subtype_property": {
          "name": "Departamento"
        }
      },
      "location": {
        "first_address": "CALLE LOS CLAVELES",
        "second_address": "ESQUINA LOS PINOS",
        "latitude": "-17.76474890",
        "longitude": "-63.20207077",
        "zone": {
          "name": "Equipetrol/NorOeste"
        }
      },
      "price": {
        "amount": 3850,
        "currency_id": 1,
        "price_in_dollars": 553.16
      }
    }
  ],
  "first_page_url": "...",
  "last_page": 8,
  "per_page": 20,
  "total": 153
}
```

---

## 6. Campos confiables para Módulo 1 (Discovery)

### ✔️ USAR (Discovery)

| Campo | Tipo | Siempre presente |
|-------|------|------------------|
| `id` | number | ✅ SÍ |
| `latitude` | string | ✅ SÍ |
| `longitude` | string | ✅ SÍ |
| `location.zone.name` | string | ✅ SÍ |
| `MLSID` | string | ✅ SÍ |

**URL construida:**
```
https://remax.bo/propiedad/{id}
```

**Fuente:**
```
fuente = "remax"
```

---

### ❌ NO usar en Módulo 1

Los siguientes campos pertenecen a **Módulo 2 – Enrichment:**

- `price` / `price_in_dollars`
- `listing_information.number_bedrooms`
- `listing_information.construction_area_m`
- `default_imagen.url`
- `agent`
- Textos descriptivos

📌 **Todo lo anterior pertenece a Módulo 2 – Enrichment**

---

## 7. Construcción de URL de propiedad

### Pattern validado

```
https://remax.bo/propiedad/{id}
```

### Ejemplos confirmados

```
✅ https://remax.bo/propiedad/51591  → Funciona
✅ https://remax.bo/propiedad/35243  → Funciona  
✅ https://remax.bo/propiedad/47070  → Funciona
```

👉 **Esta URL es la llave primaria conceptual para el resto del sistema.**

**La API NO devuelve la URL completa**, debe construirse manualmente.

---

## 8. Filtrado geográfico (Equipetrol)

La API devuelve resultados amplios de la zona "Equipetrol/NorOeste".

El filtrado real se hace **post-API**, usando:

- `latitude`
- `longitude`

### Estado actual

En el flujo actual se usa un **placeholder** que acepta todas las propiedades.

### Implementación futura

- Validar pertenencia al polígono Equipetrol
- Usar GeoJSON / Turf.js
- Filtrar propiedades fuera del área objetivo

👉 **Esto es correcto y no invalida la API.**

---

## 9. Ventajas de usar API vs Scraping HTML

| API Remax | Scraping HTML |
|-----------|---------------|
| Estructurada | Frágil |
| Rápida | Lenta |
| Menos bloqueos | Alto riesgo |
| Datos consistentes | Cambios frecuentes |
| Ideal para cron | No recomendable |

👉 **No volver a HTML scraping en Remax.**

---

## 10. Riesgos conocidos

### ⚠️ Riesgos reales

- Rate limiting futuro
- Cambio de endpoint
- Cambio de estructura JSON

### 🛡️ Mitigaciones

- Rate limit de 2s entre requests
- Uso de GET controlado
- Centralizar este conocimiento en este documento

---

## 11. Decisiones arquitectónicas registradas

| Decisión | Estado |
|----------|--------|
| Remax se consume por API | ✅ Definitiva |
| Discovery ≠ Enrichment | ✅ Definitiva |
| URLs como output del Módulo 1 | ✅ Definitiva |
| HTML scraping Remax | ❌ Descartado |

---

## 12. Instrucciones para Claude / Claude Code

Si estás leyendo esto como IA:

❌ **NO intentes scrapear HTML de Remax**  
❌ **NO infieras datos de negocio aquí**  
✅ **Usa este endpoint como fuente única**  
✅ **Limítate a Discovery en Módulo 1**  
✅ **Si la API cambia, documenta antes de modificar código**

---

## 13. Estado del conocimiento

| Elemento | Estado |
|----------|--------|
| Endpoint | 🟢 Validado |
| Paginación | 🟢 Comprendida |
| URLs | 🟢 Estables |
| Uso en producción | 🟢 Funcionando |

---

## 14. Request Specification (HTTP)

### Método
```
GET
```

### Headers
**NO se requieren headers custom.**

La API funciona con headers defaults de HTTP client:
- `User-Agent`: Cualquier user agent estándar
- `Accept`: `application/json, text/plain, */*`
- `Accept-Encoding`: `gzip, deflate, br`

### Authentication
```
None
```

No requiere:
- API Keys
- Tokens
- Cookies
- Autenticación de ningún tipo

### Query Parameters

| Parámetro | Tipo | Obligatorio | Descripción |
|-----------|------|-------------|-------------|
| `page` | number | ✅ SÍ | Número de página (1 a last_page) |

**Ejemplo:**
```
?page=1
```

### Rate Limit aplicado (recomendado)
```
2 segundos entre requests
```

---

## 15. Response Examples

### A. Successful Response (page=1)

**Status Code:** `200 OK`

**Response Headers:**
```
server: nginx/1.28.0
content-type: application/json
access-control-allow-origin: *
cache-control: no-cache, private
```

**Body:** Ver sección 5 para estructura completa

---

### B. Empty Page Response (page > last_page)

**Ejemplo:** `?page=999` (cuando `last_page=8`)

**Status Code:** `200 OK`

```json
{
  "current_page": 999,
  "data": [],
  "from": null,
  "to": null,
  "last_page": 8,
  "next_page_url": null,
  "per_page": 20,
  "total": 153
}
```

**Observaciones:**
- NO devuelve error
- `data` es array vacío `[]`
- `next_page_url` es `null`
- Metadata de paginación se mantiene correcta

---

### C. Invalid Page (page=0)

**Comportamiento:** Redirige a `https://remax.bo/`

**Conclusión:** `page` debe ser ≥ 1

---

## 16. Data Types & Field Presence

### Campos SIEMPRE presentes

```javascript
{
  id: number,                    // ✅ Siempre
  latitude: string,              // ✅ Siempre (formato decimal)
  longitude: string,             // ✅ Siempre (formato decimal)
  location.zone.name: string,    // ✅ Siempre
  MLSID: string,                 // ✅ Siempre
  status_listing_id: number      // ✅ Siempre
}
```

### Campos OPCIONALES (pueden ser null)

```javascript
{
  price_type_id: number | null,
  location.first_address: string | null,
  location.second_address: string | null,
  agent.office.image_url: string | null
}
```

### Tipos de datos confirmados

| Campo | Tipo JS | Formato |
|-------|---------|---------|
| `id` | number | Integer |
| `latitude` | string | Decimal con 8 dígitos: "-17.76474890" |
| `longitude` | string | Decimal con 8 dígitos: "-63.20207077" |
| `price.amount` | number | Integer (Bs.) |
| `price.price_in_dollars` | number | Float (USD) |
| `construction_area_m` | number | Float (m²) |

---

## 17. URL Construction & Validation

### Pattern confirmado

```
https://remax.bo/propiedad/{id}
```

### URLs validadas

| ID | URL | Estado |
|----|-----|--------|
| 51591 | https://remax.bo/propiedad/51591 | ✅ Funciona |
| 35243 | https://remax.bo/propiedad/35243 | ✅ Funciona |
| 47070 | https://remax.bo/propiedad/47070 | ✅ Funciona |

### Construcción en código

```javascript
const propertyUrl = `https://remax.bo/propiedad/${property.id}`;
```

### Notas importantes

1. La API **NO** devuelve la URL completa
2. La URL debe construirse manualmente
3. NO hay slug adicional en la URL (solo el ID)
4. El campo `slug` en la API es para SEO interno, no se usa en la URL pública

---

## 18. Error Handling Strategy

### Estrategia recomendada

| Scenario | Action |
|----------|--------|
| `page > last_page` | Detener iteración (data vacío) |
| `page = 0` | No usar (redirige, usar page=1 mínimo) |
| Timeout HTTP | Retry 3x, luego skip página |
| Status 429 (rate limit) | Backoff exponencial |
| Propiedad sin coordenadas | **No observado** (todas tienen coords) |
| Campos null | Validar antes de procesar |

### Detección de fin de páginas

```javascript
// Opción 1: Usar last_page
if (currentPage > lastPage) {
  break;
}

// Opción 2: Detectar data vacío
if (response.data.length === 0) {
  break;
}
```

---

## 19. Production Observations

### Datos de producción (Equipetrol)

- **Total de propiedades:** 153
- **Total de páginas:** 8
- **Propiedades por página:** 20
- **Última página:** 13 propiedades (153 % 20)

### Cobertura de coordenadas

**100% de las propiedades tienen coordenadas** (muestra: 153 propiedades)

Campos `latitude` y `longitude` siempre presentes y válidos.

### Tasa de éxito actual

- **95% de matching automático** con master database
- **0 errores de paginación** en producción
- **0 bloqueos por rate limit** con delay de 2s

---

## 20. Performance & Scalability

### Tiempos observados

- **Tiempo por request:** ~500-800ms
- **Delay entre requests:** 2s (configurado)
- **Tiempo total para 8 páginas:** ~16-20s

### Límites conocidos

- **Per_page:** Fijo en 20 (no configurable)
- **Rate limit:** No documentado, 2s funciona sin problemas
- **Max pages observado:** 8 (para Equipetrol)

### Recomendaciones de escalabilidad

1. Mantener delay de 2s para evitar bloqueos
2. Procesar páginas secuencialmente (no paralelo)
3. Implementar retry logic con backoff
4. Monitorear cambios en `total` entre ejecuciones

---

## 21. Maintenance & Monitoring

### Health Check recomendado

Verificar diariamente:

1. ✅ Endpoint responde (status 200)
2. ✅ `last_page` no cambió drásticamente
3. ✅ Estructura JSON mantiene campos críticos
4. ✅ Coordenadas siguen formato válido

### Alertas sugeridas

- `total` cambia en >20% (posible cambio de zona)
- `last_page` = 0 (API caída)
- Rate limit detectado (status 429)
- Campos críticos ausentes (`id`, `latitude`, `longitude`)

---

## 23. Verificación de props vivas — NO usar HTTP 200 (caveat)

> **Lección (21 May 2026):** validar si una propiedad de Remax sigue activa **NO** se hace con el código HTTP de su página. Remax es una **SPA**: el shell responde **200 siempre**, incluso para props eliminadas (el JS recién después muestra "no encontrado"). Un check HTTP 200 da **falsos positivos**.

**Método correcto** — confirmar el **slug exacto** en la API de búsqueda activa:

1. El `codigo_propiedad` de SICI tiene formato `{MLSID}-{sufijo}` (ej. `1250016143-30`). El **MLSID base se comparte** entre unidades de un mismo proyecto y entre operaciones (venta/alquiler).
2. Traer la API de la zona (`/api/search/.../{slug}?page=N`) y buscar el **slug completo** de la prop, no solo el MLSID base.
3. Distinguir **tipo de operación**: un mismo MLSID base puede tener una venta muerta y un alquiler vivo (o viceversa).

**Por qué importa** (caso real): auditando 6 props Remax marcadas `inactivo_confirmed`, el HTTP 200 sugería 4 falsos positivos. Pero al verificar el slug exacto + operación, **solo 1 era falso positivo real** (`125001310-352` venta, viva en API). Las otras 3 daban 200 (shell SPA) pero su slug exacto no estaba: eran otras unidades (`-20`) u otra operación (`120034044-241` = alquiler vivo, pero la venta `-225` muerta) del mismo MLSID base.

```bash
# MAL — da 200 aunque la prop no exista (shell SPA)
curl -s -o /dev/null -w "%{http_code}" "https://remax.bo/propiedad/<slug>"

# BIEN — slug exacto + operación en la API de búsqueda activa
curl -s "https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra/<zona-slug>?page=N" \
  | grep -o '"slug":"venta-...-<MLSID>-<sufijo>"'
```

Relevante para el verificador de ausencias (Flujo C) — ver `docs/canonical/flujo_c_verificador_canonical.md`.

---

## 22. Change Log

| Fecha | Cambio | Responsable |
|-------|--------|-------------|
| Dic 2025 | Documento inicial creado | Luis |
| Dic 2025 | Validación completa con n8n | Luis |
| Dic 2025 | Secciones 14-22 agregadas | Luis + Claude |
| 21 May 2026 | Sección 23: caveat HTTP 200 / verificación por slug exacto (tras auditoría de falsos positivos) | Luis + Claude |

---

## Fin del documento

**SICI – Research Técnico Remax**  
**Diciembre 2025**  
**Estado: ✅ Validado y cerrado**
