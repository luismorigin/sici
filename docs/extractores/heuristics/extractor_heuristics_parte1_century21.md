# EXTRACTOR HEURISTICS - PARTE 1: CENTURY21 + COMPARTIDAS

**Sistema:** SICI - Flujo B Core++  
**Documento:** Heurísticas de Extracción - Implementación Viva  
**Parte:** 1 de 2 (Century21 v16.3 + Lógica Compartida)  
**Última actualización:** Diciembre 2024  
**Ver también:** `extractor_heuristics_parte2_remax.md`

---

## 🎯 PROPÓSITO Y ALCANCE

### Sobre este documento

Este documento **NO es arquitectura**. Es un registro de **cómo funcionan los extractores reales** en producción.

**Parte 1 cubre:**
- ✅ Heurísticas específicas de **Century21 v16.3**
- ✅ Lógica **compartida** entre ambos extractores
- ✅ Principios generales de extracción

**Parte 2 cubre (documento separado):**
- ✅ Heurísticas específicas de **Remax v1.6**
- ✅ Comparaciones y diferencias críticas
- ✅ Casos borde y troubleshooting

**Audiencia:**
- Ingeniero nuevo que necesita entender Century21
- Claude Code trabajando en mejoras
- Revisor que necesita saber el "por qué"

**Filosofía:**
> "Documented reality beats elegant theory. Si funciona en producción, hay una razón."

---

## 📊 VISIÓN GENERAL: CENTURY21 vs REMAX

### Tabla comparativa rápida

| Aspecto | Century21 v16.3 | Remax v1.6 | Impacto |
|---------|----------------|------------|---------|
| **Líneas de código** | ~2,100 | ~1,900 | Similar complejidad |
| **URL útil para matching** | ✅ Slug semántico | ❌ ID numérico | C21 ventaja crítica |
| **Prioridades extracción nombre** | 4 niveles | 3 niveles | C21 más robusto |
| **Propiedades con nombre** | ~95% | ~60% | C21 40% mejor |
| **Fuente principal** | HTML parsing | JSON embebido | Remax más robusto |
| **Fragilidad ante cambios** | Alta (HTML) | Baja (JSON) | Tradeoff |
| **Metadata rica** | ✅ og:tags | ⚠️ Limitada | C21 mejor |
| **Score promedio** | 0.87 | 0.83 | C21 4pts mejor |

**Conclusión:**
- **Century21:** Superior para matching automático, más frágil técnicamente
- **Remax:** Más robusto técnicamente, requiere más trabajo de matching

**Ver Parte 2 para detalles completos de Remax**

---

## 📐 PRINCIPIOS GENERALES (COMPARTIDOS)

Estos principios aplican a **ambos** extractores.

### 1. Prioridad de Fuentes (Jerarquía de Confianza)

**Orden de confianza para datos core:**

```
1. Grid visible (API/JSON) ← MÁS CONFIABLE
   - Datos estructurados, menos ruido
   - Usado para búsquedas públicas → suele ser correcto
   
2. Ficha HTML - Sección specs ← CONFIABLE
   - Tabla de especificaciones técnicas
   - Menos texto libre, más datos tabulados
   
3. Título de la publicación ← MODERADO
   - Formato predecible "2 dorms, 85m², $120K"
   - Puede tener marketing mezclado
   
4. Descripción HTML ← USAR CON CAUTELA
   - Texto libre del agente
   - Útil para datos secundarios, NO para core
   - Ver sección específica sobre cuándo confiar
   
5. Metadata/Atributos HTML ← ÚLTIMO RECURSO
   - data-* attributes, microdata
   - A veces obsoletos o incorrectos
```

**Regla de oro:**
> Siempre extraer de la fuente más estructurada disponible. Solo hacer fallback si la fuente principal falla explícitamente.

**Diferencias por extractor:**
- **Century21:** Más dependiente de HTML meta tags (prioridad 2-3)
- **Remax:** Más dependiente de JSON embebido (prioridad 1)

---

### 2. Regla de "Una Sola Pasada"

**Principio:** El extractor debe extraer TODO en una sola lectura del HTML, sin múltiples pasadas.

**Por qué:**
- Performance: No reprocesar HTML varias veces
- Consistencia: Snapshot completo del estado
- Debugging: Un solo punto de falla

**En la práctica:**
```javascript
function procesarPropiedad(html, metadata) {
  // ✅ CORRECTO: Una pasada, extrae todo
  const datos = {
    precio: extraerPrecio(html, metadata),
    area: extraerArea(html, metadata),
    dormitorios: extraerDormitorios(html, metadata),
    nombre: extraerNombreEdificio(html, metadata),
    // ... todos los campos
  };
  return datos;
}

// ❌ INCORRECTO: Múltiples pasadas
const precio = extraerPrecio(html);
const area = extraerArea(html); // Relee HTML
```

**Nota:** Ambos extractores siguen este principio religiosamente.

---

### 3. Preferencia por Datos Explícitos

**Principio:** Extraer solo lo que está visible o en atributos HTML. NO inferir, NO adivinar.

**Ejemplos:**

✅ **CORRECTO:**
```javascript
// HTML dice "2 dormitorios"
dormitorios: 2

// HTML dice "monoambiente"
dormitorios: 0,
es_monoambiente: true

// HTML NO menciona dormitorios
dormitorios: null
```

❌ **INCORRECTO:**
```javascript
// HTML dice "85m²" pero NO menciona dormitorios
// ❌ NO INFERIR: "85m² debe ser 2 dorms"
dormitorios: 2  // MALO
```

**Excepción permitida:** Detección de monoambiente
```javascript
// Si título/descripción dicen "monoambiente" pero NO dicen dormitorios
// ✅ PERMITIDO inferir dormitorios=0
if (texto.includes('monoambiente') && !dormitoriosExplicito) {
  dormitorios: 0,
  es_monoambiente: true
}
```

**Nota:** Esta es la ÚNICA inferencia permitida en ambos extractores.

---

## 🔧 HEURÍSTICAS COMPARTIDAS (AMBOS EXTRACTORES)

### Fuzzy Matching contra proyectos_master

**Propósito:** Sugerir matches entre nombre extraído y base de datos de proyectos.

**Algoritmo:**

```javascript
function calcularSimilitudFuzzy(nombre1, nombre2) {
  // 1. Tokenizar (palabras 3+ chars)
  const words1 = nombre1.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  const words2 = nombre2.toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  // 2. Intersección (palabras comunes)
  const intersection = words1.filter(w => words2.includes(w)).length;
  
  // 3. Unión (palabras totales únicas)
  const union = new Set([...words1, ...words2]).size;
  
  // 4. Jaccard similarity
  return intersection / union;
}
```

**Ejemplos:**

| Nombre extraído | Proyecto master | Score | Match |
|----------------|-----------------|-------|-------|
| "HH Once" | "HH Once" | 100% | ✅ |
| "Element by Elite" | "Element Elite" | 67% | ✅ |
| "Sky Tower" | "Sky Tower Residence" | 67% | ✅ |
| "HH Once" | "Element Elite" | 0% | ❌ |
| "Once HH" | "HH Once" | 100% | ✅ (orden no importa) |

**Threshold:**

| Score | Acción |
|-------|--------|
| ≥65% | Sugiere id_proyecto_master |
| 60-64% | No sugiere (demasiado bajo) |
| <60% | Sin match |

**Por qué 65%:**
- Testeo con 50+ casos reales
- 65% elimina falsos positivos
- 100% precisión en testing actual
- Permite variaciones como "Element" vs "Element Elite"

---

### Normalización de Precios

**Problema:** Precios pueden venir en múltiples formatos.

**Pipeline de normalización:**

```javascript
function normalizarPrecio(precioRaw, descripcion) {
  // 1. Detectar TC
  const tc = detectarTipoCambio(descripcion); // "oficial"
  
  // 2. Parsear
  const {precio, moneda} = parsePrecioMeta(html, descripcion);
  // {precio: 120000, moneda: "USD"}
  
  // 3. Normalizar
  const {precio_usd, normalizado} = normalizarPrecioUSD(precio, descripcion);
  // {precio_usd: 120000, normalizado: false}
  
  // 4. Multiproyecto
  const multi = detectarMultiproyecto(descripcion); // false
  
  // 5. Bolivianos
  const {precio_bs, tc_usado} = convertirPrecioABolivianos(120000, false, "oficial");
  // {precio_bs: 835200, tc_usado: 6.96}
}
```

**Salida:**
```json
{
  "precio_usd": 120000,
  "precio_usd_original": 120000,
  "precio_fue_normalizado": false,
  "precio_min_usd": null,
  "precio_max_usd": null,
  "es_rango_falso": false,
  "precio_bs": 835200,
  "tipo_cambio_usado": 6.96,
  "tipo_cambio_detectado": "oficial",
  "precio_m2": 1403.51
}
```

---

### Detección de Multitipologías

**Definición:** Anuncios que ofrecen múltiples opciones de dormitorios/áreas del mismo proyecto.

**Patrones detectados:**

```javascript
const PATRONES_MULTIPROYECTO = [
  /(\d+)\s*,\s*(\d+)\s*y\s*(\d+)\s*dorm/i,
  /(\d+)\s*y\s*(\d+)\s*dorm/i,
  /tipolog[íi]as?/i,
  /desde\s*\$\d+/i,
  /hasta\s*\$\d+/i,
  /preventa/i
];
```

**Lógica:**

```javascript
function detectarMultitipologias(titulo, descripcion) {
  let indicadores = 0;
  
  // 1. Patrones de rango dormitorios
  if (texto.match(/(\d+)\s*,\s*(\d+)\s*y\s*(\d+)\s*dorm/i)) {
    indicadores++;
  }
  
  // 2. Palabra "tipologías"
  if (texto.match(/tipolog[íi]as?/i)) {
    indicadores++;
  }
  
  // 3. Rango de precios explícito
  if (texto.match(/desde\s*\$(\d+)/i) && texto.match(/hasta\s*\$(\d+)/i)) {
    indicadores++;
  }
  
  // Decisión: 2+ indicadores
  return {
    es_multiproyecto: indicadores >= 2,
    dormitorios_opciones: extraerOpciones(texto),
    precio_min_usd: extraerPrecioMinimo(texto),
    precio_max_usd: extraerPrecioMaximo(texto)
  };
}
```

**Threshold conservador:** 2+ indicadores para evitar falsos positivos.

---

## 🏢 CENTURY21 v16.3: HEURÍSTICAS ESPECÍFICAS

### Sistema de 4 Prioridades para Nombre de Edificio

Century21 tiene una ventaja arquitectónica crítica: **URL slug semántico**.

**Prioridad 1: URL Slug (confianza 0.95)**

```
https://www.century21bolivia.com/propiedad/12345_edificio-hh-once-equipetrol
                                                   └──────── útil! ────────┘
```

**Extracción:**

```javascript
function extraerNombreDesdeURL(url) {
  // 1. Extraer slug
  const match = url.match(/\/propiedad\/\d+_([\w-]+)/);
  if (!match) return null;
  
  let slug = match[1];
  
  // 2. Limpiar
  slug = slug.replace(/-/g, ' ').replace(/_/g, ' ');
  
  // 3. Capitalizar
  slug = slug.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  
  // 4. Limpiar zonas geográficas
  slug = limpiarZonasGeograficas(slug);
  
  return {
    nombre: slug,
    fuente: 'url_slug',
    confianza: 0.95
  };
}
```

**Ejemplo:**
```javascript
URL: "/propiedad/12345_edificio-hh-once-equipetrol"
→ "Edificio HH Once Equipetrol"
→ limpiarZonas → "HH Once"
```

---

**Prioridad 2: Meta Tags OG (confianza 0.80)**

```javascript
function extraerNombreDesdeMetaTags(html) {
  const title = getMeta(html, "og:title");
  if (!title) return null;
  
  // Century21 formato: "Departamento en Edificio HH Once - Century21"
  const match = title.match(/en\s+(.+?)\s*-\s*Century21/i);
  if (!match) return null;
  
  let nombre = match[1].trim();
  nombre = limpiarZonasGeograficas(nombre);
  
  return {
    nombre: nombre,
    fuente: 'meta_tags',
    confianza: 0.80
  };
}
```

---

**Prioridad 3: Título de Publicación (confianza 0.70)**

```javascript
function extraerNombreDesdeT itulo(titulo) {
  // Detectar patrón "Edificio NOMBRE"
  const matchEdificio = titulo.match(/edificio\s+([A-Z][a-zA-Z\s]{2,})/i);
  if (matchEdificio) {
    return {
      nombre: matchEdificio[1].trim(),
      fuente: 'titulo_publicacion',
      confianza: 0.70
    };
  }
  
  return null;
}
```

---

**Prioridad 4: Descripción (confianza 0.60)**

```javascript
function extraerNombreDesdeDescripcion(descripcion) {
  // Patrón "Proyecto NOMBRE by CONSTRUCTORA"
  const matchProyecto = descripcion.match(/proyecto\s+([A-Z][a-zA-Z\s]{2,})\s+by\s+/i);
  if (matchProyecto) {
    return {
      nombre: matchProyecto[1].trim(),
      fuente: 'descripcion',
      confianza: 0.60
    };
  }
  
  // Patrón mayúsculas 3+ palabras
  const matchMayusculas = descripcion.match(/([A-Z][A-Z\s]{10,})/);
  if (matchMayusculas) {
    return {
      nombre: matchMayusculas[1].trim(),
      fuente: 'descripcion_mayusculas',
      confianza: 0.60
    };
  }
  
  return null;
}
```

---

### Pipeline Completo Century21

```javascript
function extraerNombreEdificioC21(url, html, metadata) {
  // Prioridad 1: URL
  let resultado = extraerNombreDesdeURL(url);
  if (resultado) {
    const fuzzy = buscarMatchFuzzy(resultado.nombre);
    if (fuzzy && fuzzy.score >= 65) {
      return {
        nombre_edificio: fuzzy.proyecto.nombre_oficial,
        fuente_nombre_edificio: 'url_slug_fuzzy_matched',
        nombre_edificio_nivel_confianza: fuzzy.score / 100,
        id_proyecto_master_sugerido: fuzzy.proyecto.id,
        metodo_match: 'fuzzy_extractor'
      };
    }
    return resultado;
  }
  
  // Prioridad 2: Meta tags
  resultado = extraerNombreDesdeMetaTags(html);
  if (resultado) return resultado;
  
  // Prioridad 3: Título
  resultado = extraerNombreDesdeTitulo(metadata.titulo);
  if (resultado) return resultado;
  
  // Prioridad 4: Descripción
  resultado = extraerNombreDesdeDescripcion(metadata.descripcion);
  if (resultado) return resultado;
  
  // Sin nombre detectado
  return {
    nombre_edificio: null,
    fuente_nombre_edificio: 'no_detectado',
    nombre_edificio_nivel_confianza: 0
  };
}
```

---

### Limpieza de Zonas Geográficas

```javascript
const ZONAS_GEOGRAFICAS = [
  'equipetrol',
  'equipetrol norte',
  'equipetrol sur',
  'santa cruz',
  'bolivia',
  'zona norte',
  'zona sur',
  'centro',
  'radial',
  'barrio'
];

function limpiarZonasGeograficas(nombre) {
  let limpio = nombre;
  
  for (const zona of ZONAS_GEOGRAFICAS) {
    const regex = new RegExp(zona, 'gi');
    limpio = limpio.replace(regex, '').trim();
  }
  
  // Limpiar múltiples espacios
  limpio = limpio.replace(/\s+/g, ' ').trim();
  
  return limpio;
}
```

**Ejemplos:**
```javascript
"HH Once Equipetrol" → "HH Once"
"Element by Elite Zona Norte" → "Element by Elite"
"Sky Tower Santa Cruz Bolivia" → "Sky Tower"
```

---

## 🎯 RESUMEN EJECUTIVO

### Century21 v16.3 - Fortalezas

1. ✅ **URL slug semántico** - 40% más nombres detectados vs Remax
2. ✅ **4 prioridades** de extracción
3. ✅ **Metadata rica** (og:tags, ubicación)
4. ✅ **95% con nombre** detectado

### Century21 v16.3 - Debilidades

1. ⚠️ **Parsing HTML frágil** - Cambios en HTML rompen extractor
2. ⚠️ **~2,100 líneas** - Más complejo que Remax
3. ⚠️ **Dependiente de estructura estable**

### Próximos pasos

Ver **Parte 2** para:
- Heurísticas específicas Remax v1.6
- Comparación detallada C21 vs Remax
- Casos borde y troubleshooting
- Estrategias de mejora por extractor

---

**FIN PARTE 1 - Continúa en `extractor_heuristics_parte2_remax.md`**