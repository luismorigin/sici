# RESEARCH_CENTURY21_GRID.md

**Fuente canónica — Discovery Century21 (SICI)**

**Sistema:** SICI — Sistema Inteligente de Captura Inmobiliaria  
**Módulo relacionado:** Módulo 1 — Discovery & Existencia  
**Estado:** ✅ Validado en producción (Discovery)  
**Última actualización:** Diciembre 2025

---

## 0. Propósito de este documento

Este documento registra y congela el conocimiento técnico real sobre **cómo Century21 Bolivia expone sus listados de propiedades** a nivel técnico.

Su objetivo es:

- Evitar pérdida de conocimiento crítico
- Evitar que un dev o IA invente scraping incorrecto
- Servir como **fuente de verdad para Claude / Claude Code**
- Justificar la arquitectura por cuadrícula (grid)

> **Este documento NO es código. Es inteligencia técnica congelada.**

---

## 1. Hallazgo clave (Resumen ejecutivo)

🔒 **Century21 NO expone una API tradicional de paginación.**

En su lugar, utiliza un **endpoint JSON disparado por el mapa interactivo (layout_mapa)** que devuelve propiedades dentro de un *bounding box* geográfico.

👉 Características:

- Respuesta JSON pura
- Sin paginación clásica (sin page=1, page=2)
- Cobertura lograda por subdivisión espacial (grid geográfico)
- Estable en producción desde validación inicial
- No requiere JavaScript rendering (JSON directo)

**Decisión arquitectónica:**
👉 **Century21 se consume vía API JSON de mapa + cuadrícula geográfica.**

Esta decisión es **definitiva** y está validada en producción.

---

## 2. Endpoint principal utilizado

### Endpoint base
```
https://c21.com.bo/v/resultados/
```

### Path completo (patrón real de producción)
```
/tipo_departamento-o-penthouse/
/operacion_venta/
/layout_mapa/
{path_coordenadas},15?json=true
```

### Ejemplo real de producción
```
https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/coordenadas_-17.760000,-63.190000,-17.770000,-63.200000,15?json=true
```

### Construcción del path_coordenadas

**Formato requerido por Century21:**
```
coordenadas_{north},{east},{south},{west}
```

⚠️ **Orden invertido respecto a estándares GIS** (crítico respetarlo):
- Primero: `north, east` (esquina noreste)
- Segundo: `south, west` (esquina suroeste)

**Ejemplo del código de producción:**
```javascript
const coordString = `coordenadas_${north.toFixed(6)},${east.toFixed(6)},${south.toFixed(6)},${west.toFixed(6)}`;
```

---

## 3. Estrategia de Discovery (Century21)

### Principio clave

❌ **NO existe paginación por página**  
✅ **La cobertura se logra por cuadrícula geográfica**

### Flujo correcto (validado en producción)

1. Definir polígono objetivo (Equipetrol)
2. Subdividir el polígono en una cuadrícula (grid)
3. Generar `path_coordenadas` por cuadrante
4. Ejecutar una request JSON por cuadrante
5. Unir resultados
6. Deduplicar propiedades por `id`

### Arquitectura del pipeline

```
Constructor de Malla (Code) 
    ↓ 
Split in Batches (n8n) 
    ↓ 
HTTP Request → Century21 API
    ↓ 
Rate Limit (2s)
    ↓ 
Loop (hasta completar todos los cuadrantes)
```

---

## 4. Construcción de cuadrícula (Equipetrol)

### Parámetros EXACTOS usados en producción

```javascript
const LAT_SUR = -17.775; 
const LAT_NORTE = -17.750; 
const LON_OESTE = -63.205; 
const LON_ESTE = -63.185; 
const STEP = 0.010;
```

### Código de producción (Constructor de Malla)

```javascript
const cuadrantes = [];
let id = 1;

for (let lat = LAT_SUR; lat < LAT_NORTE; lat += STEP) {
    for (let lon = LON_OESTE; lon < LON_ESTE; lon += STEP) {
        
        const south = lat;
        const west = lon;
        const north = lat + STEP;
        const east = lon + STEP;
        
        // Coordenadas invertidas (Formato Century 21)
        const coordString = `coordenadas_${north.toFixed(6)},${east.toFixed(6)},${south.toFixed(6)},${west.toFixed(6)}`;
        
        cuadrantes.push({
            grid_id: id++,
            zona: "Equipetrol - Grid",
            path_coordenadas: coordString,
            cookie_sesion: miCookie
        });
    }
}

return cuadrantes;
```

### Dimensiones del grid

- **Tamaño del paso (STEP):** 0.010 grados (~1.1km)
- **Número de cuadrantes:** ~6 cuadrantes (2 latitud × 3 longitud)
- **Cobertura:** 100% de Equipetrol

⚠️ **Importante:** El STEP de 0.010 es óptimo para Equipetrol. Valores más pequeños generan overlapping innecesario; valores más grandes pueden dejar propiedades fuera.

---

## 5. Sesión y cookies (hallazgo crítico validado)

Century21 **NO valida sesión real**.

### Técnica funcional (validada en producción)

```javascript
// Generación de cookie auto-emitida
const randomId = 'sici_' + Math.random().toString(36).substring(2, 15);
const miCookie = `PHPSESSID=${randomId}`;
```

**Características:**
- No requiere login previo
- No requiere token de autenticación
- Acepta cualquier PHPSESSID sintácticamente válido
- Century21 crea sesión automáticamente con el ID proporcionado

👉 Esto permite scraping estable sin autenticación.

### Cookie de producción (ejemplo real)

```
PHPSESSID=b12ekjkmcqh2oper4nn1j6fgqp
```

⚠️ **Nota:** La cookie puede incluir otros parámetros de tracking (_ga, _gcl_au, _fbp) pero **solo PHPSESSID es requerido**.

---

## 6. Request Specification (HTTP)

### Método
```
GET
```

### URL de producción (con expresión n8n)
```
https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/{{ $json.path_coordenadas }},15?json=true
```

### Headers COMPLETOS (de producción real)

```http
accept: application/json, text/plain, */*
accept-language: es-US,es-419;q=0.9,es;q=0.8,en;q=0.7
priority: u=1, i
referer: https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/coordenadas_-17.748305042873096,-63.17844874288329,-17.7723712,-63.203575951312246,6
sec-fetch-dest: empty
sec-fetch-mode: cors
sec-fetch-site: same-origin
user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
cookie: _ga=GA1.1.326375711.1746802011;_gcl_au=1.1.1849780084.1758918470;_fbp=fb.2.1758918470159.244741593380977239;PHPSESSID=b12ekjkmcqh2oper4nn1j6fgqp;
```

⚠️ **Headers críticos (NO omitir):**
- `accept: application/json, text/plain, */*` (indica que esperamos JSON)
- `sec-fetch-mode: cors` (evita bloqueo CORS)
- `sec-fetch-site: same-origin` (simula navegación interna)
- `cookie: PHPSESSID=...` (sesión requerida)

### Query Parameters

```
json=true
```

Este parámetro es **obligatorio** para recibir respuesta JSON en lugar de HTML.

---

## 7. Estructura de respuesta (JSON)

La respuesta puede variar en forma dependiendo de la versión del endpoint.

### Casos observados en producción:

```javascript
// Caso 1: Respuesta directa
response → Array de propiedades

// Caso 2: Wrapper "results"
response.results → Array de propiedades

// Caso 3: Wrapper anidado
response.datas.results → Array de propiedades
```

### Estrategia de extracción (defensiva)

```javascript
// Código defensivo para extraer propiedades
let propiedades = [];

if (Array.isArray(response)) {
    propiedades = response;
} else if (response.results) {
    propiedades = response.results;
} else if (response.datas && response.datas.results) {
    propiedades = response.datas.results;
}
```

⚠️ **Implementación defensiva es obligatoria** para evitar fallos por cambios en estructura.

---

## 8. Campos confiables para Módulo 1 (Discovery)

### ✅ USAR (Discovery Phase)

| Campo | Tipo | Uso | Ejemplo |
|-------|------|-----|---------|
| `id` | Integer | ID único de propiedad | `12345` |
| `urlCorrectaPropiedad` | String | Path de URL pública | `/propiedad/12345` |
| `lat` | Float | Latitud GPS | `-17.7650` |
| `lon` | Float | Longitud GPS | `-63.1920` |

### Campos adicionales disponibles (NO USAR en Discovery)

Century21 devuelve muchos campos en el JSON del mapa, pero **Módulo 1 NO debe usarlos**:

- ❌ `precio`, `moneda` → Pertenece a Enrichment
- ❌ `titulo`, `descripcion` → Pertenece a Enrichment
- ❌ `agente`, `telefono` → Pertenece a Enrichment
- ❌ `amenidades`, `fotos` → Pertenece a Enrichment

**Razón:** La arquitectura de SICI separa Discovery (existencia) de Enrichment (detalles). Mezclarlos rompe el contrato semántico.

### Campos sintéticos (agregar al registro)

```javascript
{
    fuente: "century21",
    tipo_captura: "grid_api",
    fecha_captura: new Date().toISOString()
}
```

---

## 9. URL pública de propiedad

Century **devuelve la URL correcta** en el campo `urlCorrectaPropiedad`.

### Patrón de construcción
```javascript
const urlPublica = `https://c21.com.bo${urlCorrectaPropiedad}`;
```

### Ejemplos reales
```
https://c21.com.bo/propiedad/12345
https://c21.com.bo/propiedad/67890
```

⚠️ **Importante:** El campo `urlCorrectaPropiedad` ya incluye el `/` inicial, NO duplicar.

---

## 10. Rate limiting y performance

### Observado en producción (validado)

- **Delay seguro:** 2 segundos entre requests
- **Requests paralelos:** ❌ NO implementar (riesgo de bloqueo)
- **Bloqueos observados:** ❌ Ninguno con delay de 2s
- **Timeout recomendado:** 30 segundos por request

### Configuración de n8n (producción)

```json
{
  "amount": 2,
  "unit": "seconds"
}
```

### Recomendación arquitectónica

- Procesar cuadrantes **secuencialmente** (no en paralelo)
- Mantener delay fijo de 2 segundos
- Implementar retry logic con backoff exponencial

### Performance esperado

- **Cuadrantes:** ~6 cuadrantes para Equipetrol
- **Tiempo total:** ~12 segundos (6 cuadrantes × 2s)
- **Propiedades por request:** Variable (5-40 propiedades por cuadrante)

---

## 11. Deduplicación (crítico)

### Problema

Los cuadrantes del grid pueden tener **overlapping**, causando que una propiedad aparezca en múltiples requests.

### Solución

Deduplicar por `id` antes de insertar en base de datos.

```javascript
// Ejemplo de deduplicación
const propiedadesUnicas = Array.from(
    new Map(propiedades.map(p => [p.id, p])).values()
);
```

### Validación en producción

- **Propiedades totales capturadas:** ~180
- **Duplicados detectados:** 5-10%
- **Después de deduplicación:** 100% únicos

### El OTRO duplicado: el slug mutable de C21 (4-ago-2026)

Lo de arriba es el duplicado **dentro de una misma corrida** (solapamiento del grid). Hay un segundo
patrón que se da **entre corridas separadas en el tiempo**, y que la dedup por `id` de una tanda no ve.

C21 arma sus URLs de ficha así:

```
/propiedad/<codigo>_<slug>
           ^^^^^^^^ ^^^^^^
           estable  MUTABLE
```

- El **código numérico** es el identificador del AVISO. No cambia.
- El **slug** es una versión legible del título/nombre del edificio, y **C21 lo reescribe cuando el
  captador edita el aviso** — baja el precio, corrige la tipología, cambia el nombre del edificio.

**Consecuencia:** un mismo aviso puede aparecer con **varias URLs a lo largo del tiempo**. La URL vieja
queda muerta (404) mientras el aviso sigue vivo bajo la nueva. Si se deduplica por URL, el mismo depto
entra dos veces al feed — con dos precios distintos, porque justamente el precio suele ser lo que se
editó.

**Regla:** deduplicar C21 por el **código numérico**, nunca por la URL completa ni por el slug.

Evidencia (4-ago-2026, PR #64): 8 grupos históricos detectados, **8/8 el mismo aviso**, verificados por
HTTP (URL vieja muerta, URL nueva 200). El discovery ahora lo detecta por código y el cargador marca la
vieja `duplicado_de`.

---

## 12. Integración con registrar_discovery()

### Contrato de entrada

El output del scraping debe cumplir:

```javascript
{
    "id_externo": "12345",
    "fuente": "century21",
    "url_propiedad": "https://c21.com.bo/propiedad/12345",
    "latitud": -17.7650,
    "longitud": -63.1920
}
```

### Llamada a función PostgreSQL

```sql
SELECT registrar_discovery(
    '12345',
    'century21',
    'https://c21.com.bo/...',
    -17.7650,
    -63.1920
);
```

---

## 13. Riesgos conocidos y mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|-----------|
| Cambio de endpoint | Baja | Alto | Monitoreo semanal, alertas |
| Cambio de estructura JSON | Media | Medio | Parsing defensivo |
| Duplicados por grid overlap | Alta | Bajo | Deduplicación por `id` |
| Bloqueo por rate limit | Baja | Alto | Delay de 2s + retry |
| Coordenadas fuera de Equipetrol | Baja | Bajo | Validación de bbox |

---

## 14. Decisiones arquitectónicas registradas

| Decisión | Estado | Justificación |
|---------|--------|---------------|
| Century usa API de mapa | ✅ Definitiva | Validado en producción |
| Discovery por cuadrícula | ✅ Definitiva | Única forma de cobertura completa |
| No usar HTML scraping | ❌ Descartado | JSON es más estable y rápido |
| Cookie auto-emitida | ✅ Validada | Century21 no valida sesiones reales |
| Delay de 2 segundos | ✅ Definitiva | Balance performance vs. estabilidad |
| Deduplicación post-captura | ✅ Definitiva | Overlapping inevitable en grid |

---

## 15. Comparación: Century21 vs Remax

| Aspecto | Century21 | Remax |
|---------|-----------|-------|
| **Tipo de API** | JSON Grid (Mapa) | JSON Paginada |
| **Autenticación** | Cookie auto-emitida | No requerida |
| **Cobertura** | Grid geográfico | Paginación secuencial |
| **Estabilidad** | ✅ Alta | ⚠️ Media (pagination issues) |
| **Complexity** | Media (grid logic) | Baja (simple pagination) |
| **Performance** | ~12s (6 cuadrantes) | ~4s (1 request) |
| **Duplicados** | 5-10% (grid overlap) | 0% (paginación única) |

---

## 16. Instrucciones para Claude / Claude Code

Si estás leyendo esto como IA:

### ❌ NO HAGAS:

- ❌ NO intentes paginar por página (no existe)
- ❌ NO scrapear HTML (usar JSON API)
- ❌ NO inferir datos de negocio del JSON del mapa
- ❌ NO omitir headers HTTP críticos
- ❌ NO hacer requests paralelos
- ❌ NO usar campos de Enrichment en Discovery

### ✅ SÍ HAGAS:

- ✅ Usar cuadrícula geográfica con STEP=0.010
- ✅ Usar este endpoint como fuente única
- ✅ Deduplicar por `id` post-captura
- ✅ Limitarte a Discovery (Módulo 1)
- ✅ Implementar parsing defensivo
- ✅ Respetar delay de 2 segundos
- ✅ Generar cookie auto-emitida con formato: `sici_` + random

### Código starter (para implementación)

```javascript
// 1. Generar cookie
const cookieId = 'sici_' + Math.random().toString(36).substring(2, 15);

// 2. Definir grid Equipetrol
const grid = {
    LAT_SUR: -17.775,
    LAT_NORTE: -17.750,
    LON_OESTE: -63.205,
    LON_ESTE: -63.185,
    STEP: 0.010
};

// 3. Generar cuadrantes
const cuadrantes = [];
for (let lat = grid.LAT_SUR; lat < grid.LAT_NORTE; lat += grid.STEP) {
    for (let lon = grid.LON_OESTE; lon < grid.LON_ESTE; lon += grid.STEP) {
        const north = lat + grid.STEP;
        const east = lon + grid.STEP;
        const south = lat;
        const west = lon;
        
        cuadrantes.push({
            path: `coordenadas_${north.toFixed(6)},${east.toFixed(6)},${south.toFixed(6)},${west.toFixed(6)}`
        });
    }
}

// 4. Iterar cuadrantes con delay
for (const cuadrante of cuadrantes) {
    const url = `https://c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_venta/layout_mapa/${cuadrante.path},15?json=true`;
    
    // Hacer request con headers completos
    // Esperar 2 segundos
    // Parsear respuesta defensivamente
    // Deduplicar por id
}
```

---

## 17. Testing y validación

### Test cases mínimos

1. ✅ Generar grid completo de Equipetrol → Debe producir ~6 cuadrantes
2. ✅ Request a un cuadrante → Debe retornar JSON válido
3. ✅ Extracción defensiva → Debe manejar 3 estructuras de response
4. ✅ Deduplicación → Debe eliminar duplicados por `id`
5. ✅ Construcción de URL → Debe formar URLs válidas

### Validación de cobertura

```sql
-- Verificar que todas las propiedades tengan GPS dentro de Equipetrol
SELECT COUNT(*) 
FROM propiedades 
WHERE fuente = 'century21'
  AND latitud BETWEEN -17.775 AND -17.750
  AND longitud BETWEEN -63.205 AND -63.185;
```

---

## 18. Estado del conocimiento

| Elemento | Estado | Fuente |
|---------|--------|--------|
| Endpoint | 🟢 Validado | Producción |
| Grid logic | 🟢 Validado | Código n8n |
| Cookies | 🟢 Comprendido | DevTools + Testing |
| Headers HTTP | 🟢 Validado | Flujo n8n |
| Estructura JSON | 🟢 Documentado | Response analysis |
| Performance | 🟢 Validado | Métricas producción |
| Deduplicación | 🟢 Necesaria | Análisis de overlapping |

---

## 19. Changelog

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | Dic 2025 | Documento inicial |
| 2.0 | Dic 2025 | Integración con flujo n8n real, código de producción, headers completos |

---

## 20. Referencias

- **Flujo n8n:** `century21_discovery_grid.json`
- **Endpoint:** https://c21.com.bo/v/resultados/
- **Función SQL:** `registrar_discovery()` v2.0.0
- **Documentación Remax:** `RESEARCH_REMAX_API.md`

---

## Fin del documento

**SICI — Research Técnico Century21**  
**Diciembre 2025**  
**Estado: ✅ Validado, cerrado y sincronizado con producción**

---

**Firma digital:**  
Este documento representa el conocimiento técnico canónico de Century21 Discovery.  
Cualquier implementación debe seguir estas especificaciones sin desviación.

**Última validación:** Código n8n de producción + Testing real  
**Próxima revisión:** Solo si Century21 cambia su API