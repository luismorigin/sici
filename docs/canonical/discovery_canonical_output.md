# DISCOVERY_CANONICAL_OUTPUT.md

**Contrato canónico — Output del Módulo 1 (Discovery)**

**Sistema:** SICI — Sistema Inteligente de Captura Inmobiliaria  
**Módulo:** Módulo 1 — Discovery & Existencia  
**Tipo de documento:** Contrato arquitectónico  
**Estado:** ✅ Definitivo  
**Versión:** 1.0.0  
**Fecha:** Diciembre 2025

---

## 0. Naturaleza de este documento

Este documento define el **contrato de salida** del Módulo 1 (Discovery).

**Es un contrato arquitectónico:**
- Define qué produce Discovery
- Define qué NO produce Discovery
- Define estados permitidos
- Define invariantes que nunca se rompen

**NO es:**
- ❌ Documentación de implementación
- ❌ Especificación de fuentes específicas
- ❌ Lógica de negocio o matching
- ❌ Estructura de base de datos

**Propósito:**
Garantizar que cualquier implementación de Discovery (actual o futura) produzca output consistente, predecible y válido.

---

## 1. Definición: ¿Qué es Discovery?

**Discovery** es la fase que responde una única pregunta:

> **"¿Esta propiedad existe en el mercado público ahora?"**

### Responsabilidad exacta

Discovery captura la **existencia verificable** de una propiedad en portales inmobiliarios públicos.

### Lo que Discovery SÍ hace

✅ Detectar que una propiedad existe  
✅ Capturar identificador único de la fuente  
✅ Capturar URL pública de acceso  
✅ Capturar coordenadas GPS básicas  
✅ Registrar fecha/hora de detección  
✅ Identificar la fuente de origen  

### Lo que Discovery NO hace

❌ Extraer detalles de la propiedad (precio, amenidades, fotos)  
❌ Hacer matching con base de datos maestra  
❌ Validar calidad de datos  
❌ Interpretar o transformar datos de negocio  
❌ Aplicar lógica de reglas  

---

## 2. Concepto: Existencia en SICI

**Existencia** significa que una propiedad:

1. Tiene presencia pública verificable (URL accesible)
2. Tiene identificador único en su fuente de origen
3. Tiene ubicación geográfica (GPS)
4. Fue detectada en un momento específico

**Existencia NO implica:**
- Calidad de datos
- Completitud de información
- Matching exitoso con proyectos
- Validación de negocio

---

## 3. Payload canónico (Discovery Output)

### Estructura mínima

```json
{
  "id_externo": "string",
  "fuente": "string",
  "url_propiedad": "string",
  "latitud": number,
  "longitud": number
}
```

### Especificación de campos

| Campo | Tipo | Obligatorio | Descripción | Ejemplo |
|-------|------|-------------|-------------|---------|
| `id_externo` | String | ✅ Sí | ID único en la fuente de origen | `"12345"` |
| `fuente` | String | ✅ Sí | Identificador de la fuente (enum extensible) | `"century21"` |
| `url_propiedad` | String | ✅ Sí | URL pública completa, construida canónicamente según la fuente | `"https://c21.com.bo/propiedad/12345"` |
| `latitud` | Float | ✅ Sí | Coordenada GPS (formato decimal) | `-17.7650` |
| `longitud` | Float | ✅ Sí | Coordenada GPS (formato decimal) | `-63.1920` |

### Campos sintéticos permitidos

Estos campos pueden agregarse en la capa de captura pero NO son parte del contrato mínimo:

| Campo | Tipo | Uso |
|-------|------|-----|
| `fecha_captura` | ISO 8601 | Timestamp de detección |
| `tipo_captura` | String | Método usado (ej: "grid_api", "pagination") |

---

## 4. Reglas de validación

### Validación de campos obligatorios

**Todos los campos del contrato mínimo son obligatorios.**

```
SI falta algún campo obligatorio
ENTONCES el registro es inválido
ENTONCES NO debe procesarse
```

### Validación de tipos

| Campo | Regla |
|-------|-------|
| `id_externo` | String no vacío, max 255 chars |
| `fuente` | String no vacío, valores actuales: `["century21", "remax"]` (extensible) |
| `url_propiedad` | String válido como URL, debe comenzar con `http://` o `https://`, construido canónicamente según fuente |
| `latitud` | Float entre -90 y 90 |
| `longitud` | Float entre -180 y 180 |

### Validación de unicidad

**Combinación única por registro:**
```
(id_externo, fuente)
```

Dos registros con el mismo `(id_externo, fuente)` representan la **misma propiedad**.

---

## 5. Estados permitidos en Discovery

Discovery produce registros en **UN SOLO ESTADO CONCEPTUAL**:

```
Estado conceptual: "descubierto"
```

**Aclaración crítica:**
> `"descubierto"` es un **estado implícito**, NO un campo del payload.
> 
> Todo registro que cumple el contrato de Discovery tiene el estado conceptual "descubierto" por definición.
> 
> Este estado NO debe incluirse en el JSON de salida.

**Otros estados NO pertenecen a Discovery:**
- ❌ "actualizado" → Pertenece a Enrichment
- ❌ "completado" → Pertenece a Merge
- ❌ "matched" → Pertenece a Matching
- ❌ "validado" → Pertenece a QA

---

## 6. Invariantes arquitectónicos

### Invariante 1: Separación de responsabilidades

```
Discovery captura existencia
Enrichment captura detalles
Merge unifica datos
```

**Romper esta separación rompe el sistema.**

### Invariante 2: Idempotencia

```
Ejecutar Discovery N veces sobre la misma propiedad
→ Produce el mismo output (excepto fecha_captura)
```

### Invariante 3: Independencia de fuente

```
El contrato de output es idéntico para:
- Century21
- Remax
- Cualquier fuente futura
```

### Invariante 4: No inferencia

```
Discovery NO infiere datos
Discovery NO interpreta datos
Discovery captura lo que existe
```

### Invariante 5: Atomicidad

```
Un registro de Discovery es atómico:
- Se acepta completo
- Se rechaza completo
- No hay estados parciales
```

---

## 7. Ejemplo de payload válido

### Ejemplo mínimo (Century21)

```json
{
  "id_externo": "12345",
  "fuente": "century21",
  "url_propiedad": "https://c21.com.bo/propiedad/12345",
  "latitud": -17.765000,
  "longitud": -63.192000
}
```

### Ejemplo con campos sintéticos opcionales

```json
{
  "id_externo": "67890",
  "fuente": "remax",
  "url_propiedad": "https://remax.com.bo/propiedad/67890",
  "latitud": -17.768500,
  "longitud": -63.195000,
  "fecha_captura": "2025-12-14T10:30:00Z",
  "tipo_captura": "pagination_api"
}
```

---

## 8. Ejemplos de payloads INVÁLIDOS

### ❌ Inválido: Campo faltante

```json
{
  "id_externo": "12345",
  "fuente": "century21",
  "url_propiedad": "https://c21.com.bo/propiedad/12345"
  // FALTA: latitud, longitud
}
```

**Razón:** Campos obligatorios faltantes.

### ❌ Inválido: Incluye datos de Enrichment

```json
{
  "id_externo": "12345",
  "fuente": "century21",
  "url_propiedad": "https://c21.com.bo/propiedad/12345",
  "latitud": -17.765000,
  "longitud": -63.192000,
  "precio": 120000,  // ❌ Pertenece a Enrichment
  "amenidades": ["piscina"]  // ❌ Pertenece a Enrichment
}
```

**Razón:** Discovery NO captura detalles de la propiedad.

### ❌ Inválido: GPS fuera de rango

```json
{
  "id_externo": "12345",
  "fuente": "century21",
  "url_propiedad": "https://c21.com.bo/propiedad/12345",
  "latitud": -95.000000,  // ❌ Fuera de rango [-90, 90]
  "longitud": -63.192000
}
```

**Razón:** Latitud fuera de rango válido.

---

## 9. Interfaz con el sistema

### Input → Discovery

Discovery recibe configuración de fuentes y parámetros de ejecución.

**Discovery NO recibe:**
- Datos de propiedades existentes
- Lógica de negocio
- Reglas de matching

### Discovery → Output

Discovery produce un **stream de registros válidos**.

**Formato de entrega:**
- Array de objetos JSON
- Cada objeto cumple el contrato mínimo
- Sin duplicados por `(id_externo, fuente)`

### Output → Sistema (registrar_discovery)

El output de Discovery es consumido por la función `registrar_discovery()`.

**Responsabilidad de registrar_discovery():**
- Validar contrato de entrada
- Persistir registro
- NO transformar datos
- NO aplicar lógica de negocio

---

## 10. Extensibilidad

### Agregar nuevas fuentes

Para agregar una nueva fuente (ej: "infocasas"):

1. ✅ Implementar captura específica de la fuente
2. ✅ Transformar datos al contrato canónico (5 campos obligatorios)
3. ✅ Agregar identificador de fuente: `fuente: "infocasas"`
4. ✅ Construir URL canónicamente según formato de la nueva fuente
5. ❌ NO modificar el contrato de output

**Principio:**
> Nuevas fuentes extienden el enum de valores permitidos sin romper el contrato.
> El payload de salida permanece idéntico independientemente de la fuente.

### Agregar campos opcionales

Campos sintéticos adicionales pueden agregarse **sin romper el contrato**.

**Regla:**
```
Nuevos campos opcionales: Permitido
Modificar campos obligatorios: Prohibido
Eliminar campos obligatorios: Prohibido
```

---

## 11. Instrucciones para Claude Code

Si estás leyendo esto como IA para implementar Discovery:

### ✅ DEBES HACER:

1. Producir exactamente los 5 campos obligatorios
2. Validar tipos de datos
3. Validar rangos (GPS)
4. Construir URL canónicamente según formato de la fuente
5. Deduplicar por `(id_externo, fuente)`
6. Rechazar registros incompletos
7. Respetar la separación: Discovery ≠ Enrichment

### ❌ NO DEBES HACER:

1. NO agregar campos de Enrichment
2. NO inferir o calcular datos
3. NO aplicar lógica de matching
4. NO transformar datos de negocio
5. NO mezclar responsabilidades de módulos
6. NO modificar el contrato de output

### Patrón de implementación

```javascript
function validateDiscoveryOutput(record) {
    // 1. Validar campos obligatorios
    const required = ['id_externo', 'fuente', 'url_propiedad', 'latitud', 'longitud'];
    for (const field of required) {
        if (!record[field]) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    
    // 2. Validar tipos
    if (typeof record.id_externo !== 'string') {
        throw new Error('id_externo must be string');
    }
    
    if (typeof record.latitud !== 'number' || 
        record.latitud < -90 || record.latitud > 90) {
        throw new Error('Invalid latitud');
    }
    
    if (typeof record.longitud !== 'number' || 
        record.longitud < -180 || record.longitud > 180) {
        throw new Error('Invalid longitud');
    }
    
    // 3. Validar URL
    if (!record.url_propiedad.startsWith('http')) {
        throw new Error('url_propiedad must be valid URL');
    }
    
    // 4. Validar fuente (extensible - agregar nuevas fuentes según necesidad)
    const allowedSources = ['century21', 'remax'];
    if (!allowedSources.includes(record.fuente)) {
        throw new Error(`Invalid fuente: ${record.fuente}`);
    }
    
    return true;
}
```

### Test de validación

```javascript
// ✅ Ejemplo válido
const validRecord = {
    id_externo: "12345",
    fuente: "century21",
    url_propiedad: "https://c21.com.bo/propiedad/12345",
    latitud: -17.765000,
    longitud: -63.192000
};

console.assert(validateDiscoveryOutput(validRecord) === true);

// ❌ Ejemplo inválido
const invalidRecord = {
    id_externo: "12345",
    fuente: "century21",
    url_propiedad: "https://c21.com.bo/propiedad/12345"
    // FALTA GPS
};

// Debe lanzar error
```

---

## 12. Versionado del contrato

### Versión actual: 1.0.0

**Cambios que incrementan versión:**

- **MAJOR (X.0.0):** Cambios incompatibles (ej: eliminar campo obligatorio)
- **MINOR (1.X.0):** Agregar campos opcionales
- **PATCH (1.0.X):** Aclaraciones, correcciones de documentación

### Política de cambios

**Cambios PROHIBIDOS:**
- Eliminar campos obligatorios
- Cambiar tipos de campos existentes
- Cambiar semántica de campos existentes

**Cambios PERMITIDOS:**
- Agregar campos opcionales (MINOR)
- Agregar valores permitidos en enums (MINOR)
- Mejorar documentación (PATCH)

---

## 13. Responsabilidades por capa

| Capa | Responsabilidad |
|------|----------------|
| **Discovery** | Detectar existencia, capturar ID + URL + GPS |
| **Enrichment** | Capturar detalles (precio, amenidades, fotos) |
| **Merge** | Unificar Discovery + Enrichment |
| **Matching** | Vincular con base de datos maestra |
| **QA** | Validar calidad y completitud |

**Cada capa tiene su contrato.**  
**Este documento define solo el contrato de Discovery.**

---

## 14. Principios de diseño

### 1. Minimalismo

El contrato incluye **solo lo esencial** para probar existencia.

### 2. Estabilidad

El contrato está diseñado para **no cambiar** en años.

### 3. Independencia

El contrato es **independiente** de fuentes, implementación y base de datos.

### 4. Validabilidad

Todo registro puede ser **validado mecánicamente** contra el contrato.

### 5. Composabilidad

Discovery produce output que **alimenta** Enrichment sin acoplamiento.

---

## 15. Antipatrones

### ❌ Antipatrón 1: Discovery con Enrichment

```javascript
// ❌ MAL
{
    id_externo: "12345",
    fuente: "century21",
    url_propiedad: "https://...",
    latitud: -17.765,
    longitud: -63.192,
    precio: 120000  // ❌ NO pertenece a Discovery
}
```

### ❌ Antipatrón 2: Discovery con lógica de negocio

```javascript
// ❌ MAL
function discovery() {
    const props = fetchFromSource();
    
    // ❌ Discovery NO debe hacer matching
    for (const prop of props) {
        const matched = findInMasterDB(prop);
        if (matched) {
            prop.proyecto_id = matched.id;  // ❌ PROHIBIDO
        }
    }
    
    return props;
}
```

### ❌ Antipatrón 3: Campos opcionales como obligatorios

```javascript
// ❌ MAL: Rechazar registro por campo opcional faltante
if (!record.fecha_captura) {
    throw new Error('Missing fecha_captura');  // ❌ PROHIBIDO
}
```

---

## 16. Checklist de validación

Antes de entregar output de Discovery, verificar:

- [ ] Todos los campos obligatorios presentes
- [ ] Tipos de datos correctos
- [ ] GPS en rangos válidos
- [ ] URL válida y accesible
- [ ] Fuente en lista de valores permitidos
- [ ] Sin duplicados por `(id_externo, fuente)`
- [ ] Sin campos de Enrichment
- [ ] Sin lógica de matching aplicada
- [ ] Sin inferencia de datos

---

## 17. Casos límite

### ¿Qué pasa si no hay GPS?

**Respuesta:** El registro es **inválido**.  
GPS es campo obligatorio en Discovery.

### ¿Qué pasa si la URL no es accesible?

**Respuesta:** Discovery **no valida** accesibilidad ni conectividad.

Discovery captura la URL pública **construida canónicamente** según el formato de la fuente.

**Responsabilidades:**
- ✅ Discovery: Construir URL correcta según patrón de la fuente
- ❌ Discovery: Verificar que la URL responda HTTP 200
- ✅ QA: Validar accesibilidad y conectividad

**Ejemplo:**
Si Century21 proporciona `urlCorrectaPropiedad: "/propiedad/12345"`, Discovery construye: `"https://c21.com.bo/propiedad/12345"`

La verificación de que esa URL funcione pertenece a otra capa.

### ¿Qué pasa si el id_externo cambia?

**Respuesta:** Se trata como **nueva propiedad**.  
Discovery no hace tracking de cambios de ID.

### ¿Qué pasa si hay duplicados?

**Respuesta:** Se **deduplicar** antes de entregar output.  
Deduplicación es responsabilidad de Discovery.

---

## Fin del documento

**SICI — Contrato Canónico Discovery Output**  
**Diciembre 2025**  
**Versión: 1.0.0**  
**Estado: ✅ Definitivo y cerrado**

---

**Firma arquitectónica:**

Este contrato define la interfaz de salida del Módulo 1 (Discovery).

**Modificar este contrato requiere:**
- Análisis de impacto completo
- Actualización de versión semántica
- Aprobación arquitectónica
- Migración de implementaciones existentes

**Implementaciones que violan este contrato están prohibidas.**

---

**Próxima revisión:** Solo por cambios arquitectónicos mayores

