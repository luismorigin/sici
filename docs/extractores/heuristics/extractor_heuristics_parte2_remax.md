# EXTRACTOR HEURISTICS - PARTE 2: REMAX + COMPARACIONES

**Sistema:** SICI - Flujo B Core++  
**Documento:** Heurísticas de Extracción - Implementación Viva  
**Parte:** 2 de 2 (Remax v1.9 + Comparaciones + Casos Borde)  
**Última actualización:** Diciembre 2024  
**Ver también:** `extractor_heuristics_parte1_century21.md`

---

## 🎯 PROPÓSITO Y ALCANCE

### Sobre este documento

**Parte 2 cubre:**
- ✅ Heurísticas específicas de **Remax v1.6**
- ✅ Comparaciones detalladas C21 vs Remax
- ✅ Casos borde y troubleshooting
- ✅ Estrategias de mejora

**Prerequisito:** Leer Parte 1 primero para entender:
- Principios generales (compartidos)
- Heurísticas compartidas (fuzzy, TC, multitipologías)
- Century21 específico

---

## 🏢 REMAX v1.9: ARQUITECTURA Y DESAFÍOS

### El problema crítico de Remax

**Remax tiene un desafío arquitectónico que Century21 NO tiene:**

| Aspecto | Century21 | Remax | Impacto |
|---------|-----------|-------|---------|
| **URL** | Slug semántico | ID numérico | 🔴 Crítico |
| **Ejemplo** | `/12345_edificio-hh-once` | `/listings/12345` | - |
| **Utilidad para matching** | ✅ Alta | ❌ Cero | - |
| **Propiedades con nombre** | 95% | 60% | 40% menos |

⚠️ **El slug de C21 es mejor para LEER el nombre, no para identificar el aviso.** C21 **reescribe el
slug cuando el captador edita** (`/propiedad/<codigo>_<slug>`) → el mismo aviso puede tener varias URLs
a lo largo del tiempo. Lo estable es el **código numérico** que va antes del `_`; el ID de Remax no
sirve para matching pero como identidad es igual de sólido.

**Consecuencia:** Remax depende MUCHO más de:
- Fuzzy matching posterior
- Extracción desde descripción (menos confiable)
- Revisión humana

### Ventaja de Remax: JSON embebido

**Remax compensa con datos estructurados:**

```javascript
// Century21: Parsing HTML frágil
const precio = html.querySelector('.price')?.textContent;
// Si cambia clase CSS → break

// Remax: JSON robusto
const precio = jsonData.listing.price;
// Mucho más estable
```

**Resultado:**
- Remax: ~1,900 líneas (más compacto)
- Century21: ~2,100 líneas (más parsing)

---

## 🔍 SISTEMA DE 3 PRIORIDADES (REMAX)

Remax tiene **UNA prioridad menos** que Century21 porque su URL es inútil.

```
extraerNombreEdificio(descripcion, listing, metadata)
    ↓
Prioridad 1: Meta Title (og:title) [confianza 0.80]
    ↓ si falla
Prioridad 2: "Proyecto by X" en descripción [confianza 0.75]
    ↓ si falla
Prioridad 3: Mayúsculas 3+ palabras [confianza 0.60]
    ↓
validarYLimpiarNombre()
    ↓
buscarMatchFuzzy() contra proyectos_master
    ↓
Si score ≥65% → Sugiere id_proyecto_master
    ↓
OUTPUT: {nombre, fuente, id_sugerido, metodo}
```

**Comparación:**
- Century21: **4 niveles** → 95% éxito
- Remax: **3 niveles** → 60% éxito

---

### Prioridad 1: Meta Title (Remax)

**Fuente:** `<meta property="og:title">`

**Desafío:** Remax meta titles son MENOS específicos que Century21.

```javascript
// Century21 meta title:
"Departamento en Edificio HH Once - Century21"
                    └─ nombre útil ─┘

// Remax meta title:
"Hermoso Departamento en Sirari Palm - Remax Bolivia"
                        └─ nombre útil ─┘
```

**Extracción:**

```javascript
const title = getMeta(html, "og:title") || getMeta(html, "title");

// Ejemplo Remax:
// "Hermoso Departamento en Sirari Palm - Remax Bolivia"

// 1. Limpiar branding
let nombre = title.replace(/\s*-\s*remax.*/i, '').trim();
// → "Hermoso Departamento en Sirari Palm"

// 2. Extraer patrón "en NOMBRE"
const matchEn = nombre.match(/en\s+(.+)$/i);
if (matchEn) {
  nombre = matchEn[1].trim();
  // → "Sirari Palm"
}

// 3. Validar y limpiar
nombre = validarYLimpiarNombre(nombre, "meta_title");

// 4. Fuzzy match
const fuzzy = buscarMatchFuzzy(nombre);
if (fuzzy && fuzzy.score >= 65) {
  return {
    nombre_edificio: fuzzy.proyecto.nombre_oficial,
    fuente_nombre_edificio: 'meta_title_fuzzy_matched',
    nombre_edificio_nivel_confianza: fuzzy.score / 100,
    id_proyecto_master_sugerido: fuzzy.proyecto.id,
    metodo_match: 'fuzzy_extractor'
  };
}

return {
  nombre_edificio: nombre,
  fuente_nombre_edificio: 'meta_title',
  nombre_edificio_nivel_confianza: 0.80
};
```

---

### Prioridad 2: "Proyecto by" en Descripción

**Patrón específico Remax:**

```javascript
// Patrón: "Proyecto NOMBRE by CONSTRUCTORA"
const patronProyecto = /proyecto\s+([A-ZÁ-Ú][a-záéíóúñ\s]{2,})\s+by\s+/i;

const match = descripcion.match(patronProyecto);
if (match) {
  let nombre = match[1].trim();
  
  // Limpiar y validar
  nombre = validarYLimpiarNombre(nombre, "descripcion_proyecto_by");
  
  // Fuzzy match
  const fuzzy = buscarMatchFuzzy(nombre);
  if (fuzzy && fuzzy.score >= 65) {
    return {
      nombre_edificio: fuzzy.proyecto.nombre_oficial,
      fuente_nombre_edificio: 'descripcion_proyecto_by_fuzzy_matched',
      nombre_edificio_nivel_confianza: fuzzy.score / 100,
      id_proyecto_master_sugerido: fuzzy.proyecto.id,
      metodo_match: 'fuzzy_extractor'
    };
  }
  
  return {
    nombre_edificio: nombre,
    fuente_nombre_edificio: 'descripcion_proyecto_by',
    nombre_edificio_nivel_confianza: 0.75
  };
}
```

**Ejemplos:**
```javascript
"Proyecto Sirari Palm by Elite Construcciones"
→ "Sirari Palm"

"Proyecto Sky Tower by Grupo Constructor XYZ"
→ "Sky Tower"
```

---

### Prioridad 3: Mayúsculas 3+ Palabras

**Idéntica a Century21** (ver Parte 1):

```javascript
const patron = /\b([A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,}){0,2})\b/;

const match = descripcion.match(patron);
if (match) {
  let nombre = match[1];
  
  // Capitalizar
  nombre = nombre.split(' ')
    .map(w => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
  
  // Limpiar y validar
  nombre = validarYLimpiarNombre(nombre, "descripcion_mayusculas");
  
  // Fuzzy match
  const fuzzy = buscarMatchFuzzy(nombre);
  if (fuzzy && fuzzy.score >= 65) {
    return {
      nombre_edificio: fuzzy.proyecto.nombre_oficial,
      nombre_edificio_nivel_confianza: fuzzy.score / 100,
      id_proyecto_master_sugerido: fuzzy.proyecto.id
    };
  }
  
  return {
    nombre_edificio: nombre,
    fuente_nombre_edificio: 'descripcion_mayusculas',
    nombre_edificio_nivel_confianza: 0.60
  };
}
```

**Confianza baja (0.60)** - último recurso.

---

## 📊 COMPARACIÓN DETALLADA: C21 vs REMAX

### Tabla arquitectónica completa

| Característica | Century21 v16.3 | Remax v1.6 | Ganador |
|----------------|----------------|------------|---------|
| **URL útil** | ✅ Slug semántico | ❌ ID numérico | C21 |
| **URL como identidad** | ⚠️ Slug mutable (C21 lo reescribe al editar) — lo estable es el código antes del `_` | ✅ ID estable | Remax |
| **Prioridades nombre** | 4 niveles | 3 niveles | C21 |
| **Propiedades con nombre** | 95% | 60% | C21 (+40%) |
| **Fuente principal datos** | HTML parsing | JSON embebido | Remax |
| **Robustez técnica** | Media (HTML frágil) | Alta (JSON estable) | Remax |
| **Líneas de código** | ~2,100 | ~1,900 | Remax (-10%) |
| **Metadata rica** | ✅ Múltiples og:tags | ⚠️ Limitada | C21 |
| **Descripción promedio** | 800 chars | 600 chars | C21 |
| **Amenities detectables** | ~30 | ~25 | C21 |
| **Score calidad promedio** | 0.87 | 0.83 | C21 (+4pts) |
| **Tasa inactivas detectadas** | 12% | 15% | Remax (+3%) |
| **Requiere revisión humana** | 14% | 14% | Empate |

### Ventajas específicas por extractor

**Century21 gana en:**
1. 🥇 **Matching automático** - 95% con nombre vs 60%
2. 🥇 **Precisión fuzzy** - 100% sin falsos positivos
3. 🥇 **Metadata** - og:tags más ricos
4. 🥇 **Amenities** - Más detalle en HTML

**Remax gana en:**
1. 🥇 **Estabilidad técnica** - JSON vs HTML parsing
2. 🥇 **Mantenimiento** - Menos código
3. 🥇 **Detección inactivas** - Mejor señales en JSON
4. 🥇 **Datos estructurados** - Precio, área más confiables

---

## 🎨 HEURÍSTICAS ESPECÍFICAS REMAX v1.9

### Extracción de área (Remax)

**Ventaja de JSON:**

```javascript
// Remax tiene campo directo
const area = listing.construction_area || listing.total_area;
// → 85.5 (número limpio)

// vs Century21 (HTML parsing)
const area = html.querySelector('.area')?.textContent;
// → "85.5 m²" (requiere parseo)
```

**Fallback chain Remax:**

```javascript
// 1. JSON construction_area
if (listing.construction_area) {
  area = listing.construction_area;
  fuente = 'json_construction_area';
}

// 2. JSON total_area
else if (listing.total_area) {
  area = listing.total_area;
  fuente = 'json_total_area';
}

// 3. Descripción (último recurso)
else if (descripcion.match(/(\d+(?:\.\d+)?)\s*m[2²]/i)) {
  area = parseFloat(RegExp.$1);
  fuente = 'html_description';
}

else {
  area = null;
}
```

**Tasa de éxito:**
- JSON: 95% de casos
- Descripción: 3% de casos
- Falta: 2% de casos

---

### Extracción de precio (Remax)

**JSON prácticamente siempre disponible:**

```javascript
// Remax JSON (casi 100% de casos)
const precio = listing.price || listing.sale_price;
// → 120000 (número limpio)

// Century21 (HTML parsing con múltiples formatos)
const precio = parsePrecioMeta(html.querySelector('.price')?.textContent);
// → Requiere regex complejo
```

**Por qué Remax es más simple:**
- JSON ya normalizado por Remax backend
- No necesita detectar formatos europeos ("120.000")
- No necesita parsear "K" (miles)
- Moneda ya convertida a USD en mayoría de casos

---

### GPS desde JSON (Remax)

```javascript
// Extracción directa
const lat = listing.latitude;
const lng = listing.longitude;

// Validación
if (lat && lng && lat !== 0 && lng !== 0) {
  // Validar zona por polígonos (compartido)
  if (validarZonaGpsRemax(lat, lng)) {
    return {
      latitud: lat,
      longitud: lng,
      fuente_gps: 'json_listing',
      zona_validada_gps: inferirZona(lat, lng)
    };
  }
}
```

**Más confiable que Century21** porque:
- JSON siempre tiene formato consistente
- Century21 parsea de múltiples lugares en HTML
- Menos probabilidad de corrupción

---

## 🔧 BLACKLIST ESPECÍFICA REMAX

**Base compartida + adiciones:**

```javascript
const BLACKLIST_REMAX = [
  ...BLACKLIST_CRITICA,  // Base común (ver Parte 1)
  
  // Específicos Remax
  'remax bolivia',
  'remax santa cruz',
  're/max',
  'codigo',
  'ref',
  'referencia',
  'inmobiliaria',
  
  // Patrones Remax
  'hermoso departamento',
  'oportunidad',
  'invierte',
  'consultar'
];
```

**Por qué más términos en Remax:**
- Descripciones más cortas → más ruido proporcional
- Sin URL slug → más dependencia de descripción
- Meta titles menos específicos

---

## 🐛 CASOS BORDE Y TROUBLESHOOTING

### Problema 1: Nombre genérico en Remax

**Síntoma:**
```javascript
nombre_edificio: "Hermoso Departamento"
fuente_nombre_edificio: "meta_title"
```

**Causa:** Meta title demasiado genérico, sin patrón "en NOMBRE".

**Solución actual:**
- Blacklist rechaza "hermoso departamento"
- Resultado: `nombre_edificio: null`
- Fuzzy NO sugiere (requiere nombre base)

**Workaround humano:**
1. Revisar fotos para logo/letrero edificio
2. Buscar en Google Maps por GPS
3. Agregar manualmente a `proyectos_master`

---

### Problema 2: JSON faltante en Remax

**Síntoma:**
```javascript
precio_usd: null
area_total_m2: null
```

**Causa:** Página no cargó JSON embebido correctamente.

**Diagnóstico:**
```javascript
// Verificar si data-page existe
const hasDataPage = html.includes('data-page=');
// false → problema de carga

// Verificar error en parseo
try {
  const json = JSON.parse(dataPageContent);
} catch (e) {
  // Error de parsing
}
```

**Solución:**
- Re-scrape con timeout más largo
- Marcar para revisión manual

---

### Problema 3: Fuzzy match ambiguo

**Síntoma:**
```javascript
// Nombre extraído: "Palm Residence"
// Proyectos master:
// - "Sirari Palm" (score 50%)
// - "Palm Gardens" (score 50%)
```

**Solución actual:**
- Threshold 65% → NO sugiere ninguno
- Requiere revisión humana

**Mejora futura:**
- Considerar GPS proximity como desempate
- Si ambos proyectos en misma zona → revisar manualmente

---

## 💡 ESTRATEGIAS DE MEJORA

### Mejora 1: Enriquecer Remax con Google Maps

**Problema:** Sin nombre desde descripción, GPS disponible.

**Solución propuesta:**
```javascript
if (!nombre_edificio && latitud && longitud) {
  // Llamar Google Places API
  const nearby = await googlePlaces.nearbySearch({
    location: { lat, lng },
    radius: 100,
    type: 'real_estate_agency'
  });
  
  // Fuzzy match con resultados
  for (const place of nearby.results) {
    const fuzzy = buscarMatchFuzzy(place.name);
    if (fuzzy && fuzzy.score >= 65) {
      return {
        nombre_edificio: fuzzy.proyecto.nombre_oficial,
        fuente_nombre_edificio: 'google_places_fuzzy',
        id_proyecto_master_sugerido: fuzzy.proyecto.id
      };
    }
  }
}
```

**Costo:** ~$0.02 por propiedad sin nombre (~40% de Remax).

---

### Mejora 2: Análisis de imágenes (OCR)

**Problema:** Nombre en letrero/logo de foto pero no en texto.

**Solución propuesta:**
```javascript
if (!nombre_edificio && fotos_urls.length > 0) {
  // Analizar primera foto con Vision API
  const text = await googleVision.detectText(fotos_urls[0]);
  
  // Buscar palabras en mayúsculas
  const mayusculas = text.match(/[A-Z]{3,}/g);
  
  // Fuzzy match
  for (const palabra of mayusculas) {
    const fuzzy = buscarMatchFuzzy(palabra);
    if (fuzzy && fuzzy.score >= 70) {  // Threshold más alto por OCR
      return {
        nombre_edificio: fuzzy.proyecto.nombre_oficial,
        fuente_nombre_edificio: 'ocr_imagen_fuzzy',
        id_proyecto_master_sugerido: fuzzy.proyecto.id
      };
    }
  }
}
```

**Costo:** ~$1.50 por 1000 imágenes.

---

### Mejora 3: Patrón "Edificio X" en descripción

**Actualmente NO detectado en Remax.**

**Implementar:**
```javascript
// Agregar a Prioridad 1.5 (entre meta title y "proyecto by")
const patronEdificio = /edificio\s+([A-ZÁ-Ú][a-záéíóúñ\s]{2,})/i;

const match = descripcion.match(patronEdificio);
if (match) {
  let nombre = match[1].trim();
  nombre = validarYLimpiarNombre(nombre, "descripcion_edificio");
  
  const fuzzy = buscarMatchFuzzy(nombre);
  if (fuzzy && fuzzy.score >= 65) {
    return {
      nombre_edificio: fuzzy.proyecto.nombre_oficial,
      fuente_nombre_edificio: 'descripcion_edificio_fuzzy',
      nombre_edificio_nivel_confianza: fuzzy.score / 100,
      id_proyecto_master_sugerido: fuzzy.proyecto.id
    };
  }
  
  return {
    nombre_edificio: nombre,
    fuente_nombre_edificio: 'descripcion_edificio',
    nombre_edificio_nivel_confianza: 0.75
  };
}
```

**Ganancia estimada:** +10% propiedades con nombre (de 60% a 70%).

---

## 🎯 DECISIÓN ARQUITECTÓNICA

**NO hay "mejor" absoluto** - cada uno destaca en su contexto:

**Usar Century21 cuando:**
- ✅ Prioritas matching automático
- ✅ Necesitas metadata rica
- ✅ Puedes tolerar fragilidad HTML

**Usar Remax cuando:**
- ✅ Prioritas estabilidad técnica
- ✅ Necesitas datos estructurados confiables
- ✅ Puedes tolerar más revisión manual

### Decisión arquitectónica

**Mantener ambos extractores especializados:**

1. ✅ Cada portal tiene estructuras MUY diferentes
2. ✅ Optimización específica maximiza calidad
3. ✅ Compartir lógica fuzzy/multitipo/TC entre ambos
4. ✅ Testing paralelo asegura paridad

**NO intentar unificar** porque:
- ❌ Century21 depende de HTML parsing específico
- ❌ Remax depende de JSON específico
- ❌ URLs completamente diferentes
- ❌ Unificar sacrificaría calidad en ambos

---

## 📚 RECURSOS ADICIONALES

### Documentos relacionados

- `extractor_heuristics_parte1_century21.md` - Heurísticas C21 + compartidas
- `docs/canonical/flujo_b_corepp_canonical.md` - Contrato arquitectónico
- `docs/extractores/EXTRACTOR_CENTURY21_v16.3_PARTE1.md` - Implementación C21
- `docs/extractores/EXTRACTOR_REMAX_v1.6_PARTE1.md` - Implementación Remax

### SQL útil

```sql
-- Comparar tasas de éxito
SELECT 
  fuente,
  COUNT(*) as total,
  COUNT(nombre_edificio) as con_nombre,
  ROUND(COUNT(nombre_edificio)::numeric / COUNT(*) * 100, 1) as tasa_nombre,
  AVG(nivel_confianza_general) as score_promedio
FROM propiedades
WHERE scraper_version IN ('v16.3', 'v1.6')
GROUP BY fuente;

-- Propiedades que necesitan fuzzy
SELECT fuente, COUNT(*)
FROM propiedades
WHERE id_proyecto_master IS NULL
  AND nombre_edificio IS NOT NULL
GROUP BY fuente;
```

---

## 🔄 MANTENIMIENTO Y EVOLUCIÓN

### Cuándo actualizar

```javascript
// ✅ ACTUALIZAR REMAX si:
- Nombres sin detectar > 45% (vs target 40%)
- JSON schema cambia en Remax backend
- Nuevos patrones en descripciones

// ✅ ACTUALIZAR CENTURY21 si:
- HTML estructura cambia (monitoreo semanal)
- Nombres sin detectar > 8% (vs target 5%)
- Nuevas clases CSS aparecen

// ✅ ACTUALIZAR COMPARTIDOS si:
- Fuzzy tiene falsos positivos (target 0%)
- Nueva zona geográfica detectada
- Cambio en TC oficial/paralelo
```

### Proceso de sincronización

**Cuando mejoras afectan lógica compartida:**

1. Actualizar función compartida
2. Testing en C21 con 10 propiedades
3. Testing en Remax con 10 propiedades
4. Versionar ambos extractores
5. Deploy simultáneo

**Ejemplo: Mejora fuzzy normalización Unicode**
- Actualizar `calcularSimilitudFuzzy()`
- C21 v16.4 → v16.5
- Remax v1.8 → v1.9
- Deploy ambos mismo día

---

**FIN PARTE 2 - Documentación completa**

**Filosofía final:**
> "Two specialized extractors beat one generalized extractor. Document their differences, share their strengths."