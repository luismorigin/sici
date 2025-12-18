# FLUJO B "CORE++" - DOCUMENTO CANÓNICO

**Versión:** 2.1.1  
**Fecha:** Diciembre 2024  
**Estado:** DEFINITIVO - CIERRE MÓDULO 1  
**Archivo:** `docs/canonical/flujo_b_corepp_canonical.md`

---

## 0. NOTA CONCEPTUAL: PROCESSING VS ENRICHMENT

**Aclaración semántica crítica:**

- **Flujo B (Processing):** Extracción y normalización de datos explícitos del HTML. Transformaciones determinísticas sin contexto externo. Output: datos estructurados listos para matching técnico.

- **Módulo 2 (Enrichment de Mercado):** Enriquecimiento con fuentes externas (Google Places, IA, comparables). Análisis de contexto, clustering, inferencias. Input: output de Flujo B.

**Flujo B NO hace enrichment de mercado.** Flujo B hace **processing estructurado** de HTML raw.

Esta distinción es crítica para entender límites de responsabilidad.

---

## 1. RESPONSABILIDAD ÚNICA

**Transformar HTML raw de propiedades activas en datos estructurados, normalizados y validados, listos para matching técnico y consumo por módulos posteriores.**

### Pipeline completo

```
HTML raw (Discovery)
  ↓
[COMPONENTE 1: EXTRACTOR]
  Parsea HTML → 80 campos estructurados
  ↓
[COMPONENTE 2: SCORER]
  Calcula completitud de datos
  ↓
[COMPONENTE 3: VERIFICADOR]
  Valida coherencia técnica
  ↓
Datos estructurados en BD (status: actualizado)
```

### Límite de responsabilidad

- **Inicia:** Recibe HTML raw + metadatos desde Discovery (status: nueva)
- **Termina:** Entrega registro estructurado, validado y scorado (status: actualizado)
- **Prepara datos para:** Matching técnico (Merge), Enriquecimiento de mercado (Módulo 2), Análisis (Módulo 3)
- **NO incluye:** Clustering, enriquecimiento externo (Google Places, IA), análisis comparativo de mercado, inferencia de datos faltantes

**Principio arquitectónico:**
> Flujo B extrae lo que está explícito. Módulo 2 enriquece con lo que falta.

---

## 2. VISIÓN GENERAL DEL FLUJO

### 2.1 Tres Componentes Integrados

| Componente | Responsabilidad | Input | Output | Versión Actual |
|------------|----------------|-------|--------|----------------|
| **Extractor** | Parsear HTML → datos | HTML raw | JSON 80 campos | C21: v16.3, Remax: v1.6 |
| **Scorer** | Calcular completitud | JSON extractor | score_calidad_dato | v7.7 |
| **Verificador** | Validar coherencia | JSON + score | score_fiduciario, flags | v1.3 |

**Naturaleza del proceso:** Processing estructurado, NO enrichment de mercado.

### 2.2 Ejecución Secuencial

```javascript
// Workflow n8n "Flujo B"
for (propiedad of propiedades_nuevas) {
  // 1. Extraer (parsing estructurado)
  const datos = extractor.procesar(propiedad.html);
  
  // 2. Scorear (completitud de datos)
  const score = scorer.calcular(datos);
  
  // 3. Verificar (coherencia técnica)
  const validacion = verificador.validar(datos, score);
  
  // 4. Persistir (REEMPLAZO completo del JSONB)
  await registrar_enrichment({
    id_propiedad: propiedad.id,
    datos_json_enrichment: { ...datos, ...score, ...validacion },
    columnas_core: extraer_columnas_core(datos),  // 20 campos explícitos
    scraper_version: 'v16.3'
  });
}
```

**Características clave:**
- ✅ Una sola pasada por propiedad
- ✅ Sin llamadas a APIs externas
- ✅ Sin estado entre propiedades
- ✅ Idempotente y determinístico
- ✅ Output completo de 80+ campos

---

## 3. COMPONENTE 1: EXTRACTOR

### 3.1 Responsabilidad

**Parsear HTML raw y extraer TODOS los datos explícitos disponibles, estructurados en 80+ campos normalizados.**

**Filosofía:**
> "Extract everything visible. Normalize everything extracted. Preserve everything normalized."

### 3.2 Datos Extraídos (Grupos)

#### A. Financieros (8 campos)
- `precio_usd`, `precio_usd_original`
- `precio_fue_normalizado` (boolean)
- `precio_min_usd`, `precio_max_usd`
- `es_rango_falso` (boolean)
- `tipo_cambio_usado`, `tipo_cambio_detectado`

#### B. Físicos (12 campos)
- `area_total_m2`, `area_construida_m2`, `area_terreno_m2`
- `area_min_m2`, `area_max_m2`
- `dormitorios`, `dormitorios_opciones` (array)
- `banos`, `medio_banos`
- `estacionamientos`, `tipo_estacionamiento`
- `piso`, `niveles_edificio`

#### C. Ubicación (6 campos)
- `latitud`, `longitud`
- `zona`, `barrio`, `ciudad`
- `direccion_exacta`

#### D. Clasificación (5 campos)
- `tipo_operacion` (venta/alquiler)
- `tipo_propiedad_original` (string del portal)
- `tipo_propiedad_normalizado` (departamento/casa/oficina/terreno)
- `estado_construccion`
- `año_construccion`

#### E. Proyecto/Edificio (8 campos)
- `nombre_edificio_extraido` (raw)
- `nombre_edificio_limpio` (normalizado)
- `fuente_nombre_edificio`
- `nombre_edificio_nivel_confianza` (0-1)
- `id_proyecto_master_sugerido` (fuzzy pre-match)
- `confianza_sugerencia` (0-1)
- `metodo_match` (fuzzy_extractor/url_slug/etc)
- `proyecto_multitipologias` (boolean)

#### F. Amenities (30+ campos boolean)
```javascript
{
  gimnasio, piscina, salon_eventos, seguridad_24h,
  areas_verdes, parqueo_visitas, salon_ninos,
  cancha_futbol, cancha_tenis, sauna, jacuzzi,
  cowork, bike_parking, pet_friendly, ascensor,
  terraza, balcon, vista_panoramica, amoblado,
  // ... 15+ más
}
```

#### G. Agente (4 campos)
- `agente_nombre`, `agente_telefono`
- `agente_email`, `agente_empresa`

#### H. Trazabilidad (10+ campos)
- `fuente_precio`, `fuente_area`, `fuente_dormitorios`
- `tiene_conflictos` (boolean)
- `detalle_conflictos` (array)
- `extractor_version`, `core_version`
- `timestamp`, `fuente` (century21/remax)

---

### 3.3 Extractores Especializados

**Dos extractores independientes:**

```
Century21 Extractor v16.3
├─ Parseo HTML específico de Century21
├─ 4 niveles de extracción de nombre
├─ Metadata rica (og:tags)
└─ ~2,100 líneas

Remax Extractor v1.6
├─ Parseo JSON embebido de Remax
├─ 3 niveles de extracción de nombre
├─ JSON más robusto que HTML
└─ ~1,900 líneas
```

**Lógica compartida entre ambos:**
- Fuzzy matching contra `proyectos_master`
- Normalización de precios (USD/BS)
- Detección de multitipologías
- Scoring de confianza

**Ver documentación detallada:**
- `docs/extractores/heuristics/extractor_heuristics_parte1_century21.md`
- `docs/extractores/heuristics/extractor_heuristics_parte2_remax.md`

---

### 3.4 Fuzzy Pre-Match (Sugerencia, NO Decisión)

**Propósito:** Sugerir matches potenciales entre nombre extraído y `proyectos_master`.

**Proceso:**

```javascript
function extraerNombreEdificio(html) {
  // 1. Extraer nombre con prioridades
  const nombreExtraido = aplicarPrioridades(html);
  
  // 2. Limpiar y normalizar
  const nombreLimpio = normalizarNombre(nombreExtraido);
  
  // 3. Buscar fuzzy match
  const sugerencia = buscarMatchFuzzy(nombreLimpio, proyectos_master);
  
  // 4. Retornar metadata (NO decisión final)
  return {
    nombre_edificio_extraido: nombreExtraido,
    nombre_edificio_limpio: nombreLimpio,
    id_proyecto_master_sugerido: sugerencia?.id || null,
    confianza_sugerencia: sugerencia?.score || null,
    metodo_match: sugerencia?.metodo || null
  };
}
```

**Algoritmo de similitud:**

```javascript
function calcularSimilitudFuzzy(nombre1, nombre2) {
  // Jaccard similarity
  const words1 = tokenizar(nombre1);
  const words2 = tokenizar(nombre2);
  
  const intersection = words1.filter(w => words2.includes(w)).length;
  const union = new Set([...words1, ...words2]).size;
  
  return intersection / union;
}
```

**Threshold:** score ≥ 0.65 para sugerir match

**CRÍTICO:** Esto es una **sugerencia**, NO una decisión final. La columna `id_proyecto_master` permanece NULL. La decisión final es responsabilidad de:
- Humano (revisión manual)
- Merge (automatizado con validaciones)

---

### 3.5 Detección de Multitipologías

**Definición:** Anuncios que ofrecen múltiples opciones de dormitorios/áreas del mismo proyecto.

**Ejemplos:**
```
"Departamentos de 1, 2 y 3 dormitorios desde $80K"
"Monoambientes y 1 dormitorio disponibles"
"Tipologías de 85m², 95m² y 110m²"
```

**Extracción:**

```javascript
function detectarMultitipologias(html, titulo, descripcion) {
  // Buscar patrones
  const patrones = [
    /(\d+)\s*,\s*(\d+)\s*y\s*(\d+)\s*dorm/i,
    /(\d+)\s*y\s*(\d+)\s*dorm/i,
    /tipolog[íi]as?/i,
    /desde\s*\$\d+/i
  ];
  
  if (algunPatronMatch(patrones, [titulo, descripcion])) {
    return {
      proyecto_multitipologias: true,
      dormitorios_opciones: extraerOpciones(titulo, descripcion),
      precio_min_usd: extraerPrecioMinimo(titulo, descripcion),
      precio_max_usd: extraerPrecioMaximo(titulo, descripcion),
      area_min_m2: extraerAreaMinima(titulo, descripcion),
      area_max_m2: extraerAreaMaxima(titulo, descripcion)
    };
  }
  
  return { proyecto_multitipologias: false };
}
```

**Campos resultantes:**
- `proyecto_multitipologias`: true/false
- `dormitorios_opciones`: [1, 2, 3] o null
- `precio_min_usd`, `precio_max_usd`: rangos válidos
- `area_min_m2`, `area_max_m2`: rangos válidos

**Impacto en scoring:**
- Scoring NO penaliza ausencia de valores específicos
- Verificador NO valida rangos individuales

---

### 3.6 Manejo de Monoambientes

**Problema:** Monoambientes tienen 0 dormitorios, pero NO son datos faltantes.

**Solución:**

```javascript
function detectarMonoambiente(titulo, descripcion, tipologia) {
  const patrones = [
    /mono\s*ambiente/i,
    /monoambiente/i,
    /estudio/i,
    /studio/i
  ];
  
  if (algunPatronMatch(patrones, [titulo, descripcion, tipologia])) {
    return {
      dormitorios: 0,
      es_monoambiente: true
    };
  }
  
  return null;
}
```

**Impacto:**
- `dormitorios = 0` es válido (NO null)
- `es_monoambiente = true` previene penalización en scoring
- Verificador salta validaciones de dormitorios

---

### 3.7 Normalización de Precios

**Problema:** Precios pueden estar en:
- USD explícito: "$120,000 USD"
- USD implícito: "$120,000" (asumido)
- Bolivianos: "Bs 835,200"
- Miles: "120K", "120 mil"
- Rangos: "$80K - $150K"

**Pipeline de normalización:**

```javascript
function normalizarPrecio(precioRaw, descripcion, metadata) {
  // 1. Detectar moneda y TC
  const { moneda, tc } = detectarMonedaYTC(descripcion, metadata);
  
  // 2. Parsear número
  let precio = parsearPrecio(precioRaw);
  
  // 3. Normalizar a USD si está en BS
  if (moneda === 'BS') {
    precio = precio / tc;
  }
  
  // 4. Detectar si fue normalizado
  const fueNormalizado = (moneda === 'BS') || tieneMultiplicador(precioRaw);
  
  return {
    precio_usd: Math.round(precio),
    precio_usd_original: precioOriginal,
    precio_fue_normalizado: fueNormalizado,
    tipo_cambio_usado: tc,
    tipo_cambio_detectado: detectarTipoTC(descripcion) // 'oficial' o 'paralelo'
  };
}
```

**Tipos de cambio:**
- Oficial: ~6.96 (BCB)
- Paralelo: ~10.20 (mercado negro)
- Detección: palabras clave en descripción ("TC oficial", "paralelo", etc.)

---

### 3.8 Output del Extractor

**JSON completo de 80+ campos:**

```json
{
  // Financiero
  "precio_usd": 120000,
  "precio_usd_original": 120000,
  "precio_fue_normalizado": false,
  "precio_min_usd": null,
  "precio_max_usd": null,
  "es_rango_falso": false,
  "tipo_cambio_usado": 6.96,
  "tipo_cambio_detectado": "oficial",
  "precio_m2": 1403.51,
  
  // Físico
  "area_total_m2": 85.5,
  "area_construida_m2": 82,
  "dormitorios": 2,
  "banos": 2,
  "estacionamientos": 1,
  "piso": 8,
  
  // Ubicación
  "latitud": -17.765432,
  "longitud": -63.192345,
  "zona": "Equipetrol Norte",
  
  // Edificio
  "nombre_edificio_extraido": "HH Once Equipetrol Norte",
  "nombre_edificio_limpio": "HH Once",
  "fuente_nombre_edificio": "url_slug",
  "nombre_edificio_nivel_confianza": 0.95,
  "id_proyecto_master_sugerido": 42,
  "confianza_sugerencia": 0.85,
  "metodo_match": "fuzzy_extractor",
  "proyecto_multitipologias": false,
  
  // Amenities (30+ campos)
  "amenities": {
    "gimnasio": true,
    "piscina": false,
    "seguridad_24h": true,
    // ... 27+ más
  },
  
  // Agente
  "agente_nombre": "María López",
  "agente_telefono": "+591 70123456",
  
  // Trazabilidad
  "fuente_precio": "grid_visible",
  "fuente_area": "html_specs",
  "tiene_conflictos": false,
  "extractor_version": "v16.3",
  "core_version": "2.1",
  "timestamp": "2024-12-01T10:30:00Z",
  "fuente": "century21"
}
```

---

## 4. COMPONENTE 2: SCORER

### 4.1 Responsabilidad

**Calcular score de completitud de datos (0-100) basado en presencia y calidad de campos extraídos.**

**Filosofía:**
> "Measure what was extracted, not what the market wants."

### 4.2 Campos Core (Requeridos para Matching)

**10 campos obligatorios:**

```javascript
const CAMPOS_CORE = [
  'precio_usd',
  'area_total_m2',
  'dormitorios',
  'banos',
  'tipo_operacion',
  'estado_construccion',
  'latitud',
  'longitud',
  'fuente',
  'url'
];
```

**Lógica de validación:**

```javascript
function validarCampoCore(campo, valor, contexto) {
  // Caso especial: monoambiente
  if (campo === 'dormitorios' && valor === 0 && contexto.es_monoambiente) {
    return { valido: true, score: 10 };
  }
  
  // Caso especial: multitipologías
  if (contexto.proyecto_multitipologias && ['dormitorios', 'area_total_m2', 'precio_usd'].includes(campo)) {
    // Validar que existan rangos
    if (contexto[`${campo}_min`] && contexto[`${campo}_max`]) {
      return { valido: true, score: 10 };
    }
  }
  
  // Validación normal
  if (valor !== null && valor !== undefined && valor !== 0) {
    return { valido: true, score: 10 };
  }
  
  return { valido: false, score: 0 };
}
```

---

### 4.3 Campos Opcionales (Bonificación)

**20+ campos opcionales:**

```javascript
const CAMPOS_OPCIONALES = [
  // Físico adicional
  { campo: 'area_construida_m2', peso: 2 },
  { campo: 'estacionamientos', peso: 2 },
  { campo: 'piso', peso: 1 },
  
  // Ubicación detallada
  { campo: 'zona', peso: 3 },
  { campo: 'barrio', peso: 1 },
  
  // Edificio
  { campo: 'nombre_edificio_limpio', peso: 5 },
  { campo: 'id_proyecto_master_sugerido', peso: 5 },
  
  // Construcción
  { campo: 'año_construccion', peso: 2 },
  
  // Agente
  { campo: 'agente_nombre', peso: 1 },
  { campo: 'agente_telefono', peso: 2 },
  
  // Amenities (grupo)
  { grupo: 'amenities', peso: 5 }
];
```

**Lógica de scoring:**

```javascript
function calcularScoreOpcionales(datos) {
  let scoreOpcionales = 0;
  let maxPosible = 0;
  
  for (const item of CAMPOS_OPCIONALES) {
    maxPosible += item.peso;
    
    if (item.grupo === 'amenities') {
      // Contar amenities presentes
      const totalAmenities = Object.keys(datos.amenities || {}).length;
      if (totalAmenities >= 10) {
        scoreOpcionales += item.peso;
      } else if (totalAmenities >= 5) {
        scoreOpcionales += item.peso / 2;
      }
    } else {
      // Validación individual
      if (datos[item.campo] !== null && datos[item.campo] !== undefined) {
        scoreOpcionales += item.peso;
      }
    }
  }
  
  return { scoreOpcionales, maxPosible };
}
```

---

### 4.4 Fórmula Final

**Score de calidad de dato:**

```javascript
function calcularScoreCalidadDato(datos) {
  // 1. Validar campos core (70 puntos máx)
  const scoreCore = validarCamposCore(datos);  // 0-70
  
  // 2. Validar campos opcionales (30 puntos máx)
  const { scoreOpcionales, maxPosible } = calcularScoreOpcionales(datos);
  const scoreOpcionalesNormalizado = (scoreOpcionales / maxPosible) * 30;
  
  // 3. Sumar
  const scoreFinal = scoreCore + scoreOpcionalesNormalizado;
  
  // 4. Flag de matching
  const es_para_matching = (scoreCore === 70);  // Todos los core presentes
  
  return {
    score_calidad_dato: Math.round(scoreFinal),
    score_core: scoreCore,
    score_opcionales: Math.round(scoreOpcionalesNormalizado),
    es_para_matching: es_para_matching,
    detalle_score: generarDetalleScore(datos)
  };
}
```

**Ejemplos:**

| Caso | Core | Opcionales | Total | Para matching |
|------|------|------------|-------|---------------|
| Completo | 70 | 30 | 100 | ✅ |
| Solo core | 70 | 0 | 70 | ✅ |
| Falta GPS | 50 | 20 | 70 | ❌ |
| Multitipología completa | 70 | 25 | 95 | ✅ |

---

### 4.5 Output del Scorer

```json
{
  "score_calidad_dato": 95,
  "score_core": 70,
  "score_opcionales": 25,
  "es_para_matching": true,
  "detalle_score": {
    "campos_core_presentes": 10,
    "campos_core_faltantes": 0,
    "campos_opcionales_presentes": 15,
    "grupos": {
      "core": "100%",
      "ubicacion_detallada": "80%",
      "edificio": "100%",
      "amenities": "70%"
    }
  }
}
```

---

## 5. COMPONENTE 3: VERIFICADOR

### 5.1 Responsabilidad

**Validar coherencia técnica de datos extraídos contra rangos pre-establecidos, NO análisis dinámico de mercado.**

**Filosofía:**
> "Validate physics, not market trends. Flag anomalies, don't block data."

### 5.2 Rangos Técnicos (Pre-establecidos)

**NO son promedios de mercado:**
- Son límites físicos/constructivos
- Basados en normativa y realidad física
- NO se actualizan dinámicamente con mercado

**Ejemplos:**

```javascript
const RANGOS_TECNICOS = {
  precio_m2: {
    min: 500,    // Construcción más básica viable
    max: 5000,   // Construcción más premium conocida
    razon: "Límites físicos de construcción en Santa Cruz"
  },
  
  area_departamento: {
    min: 25,     // Monoambiente mínimo legal
    max: 500,    // Penthouse más grande conocido
    razon: "Rango físico de departamentos en Equipetrol"
  },
  
  dormitorios: {
    min: 0,      // Monoambiente
    max: 6,      // Penthouse más grande
    razon: "Rango de tipologías residenciales"
  },
  
  banos: {
    min: 1,
    max: 8,
    razon: "Rango constructivo típico"
  },
  
  estacionamientos: {
    min: 0,      // Sin parking
    max: 6,      // Penthouse con múltiples parkings
    razon: "Máximo observado en proyectos premium"
  },
  
  precio_departamento: {
    min: 30000,  // Departamento más económico viable
    max: 800000, // Penthouse más caro conocido
    razon: "Rango de mercado Santa Cruz (no dinámico)"
  }
};
```

---

### 5.3 Tipos de Validaciones

#### A. Validaciones de Coherencia Interna

**Ejemplos:**

```javascript
// 1. Área vs Dormitorios
if (area_total_m2 < 30 && dormitorios > 1) {
  flags.push({
    tipo: 'warning',
    campo: 'area_vs_dormitorios',
    valor: `${area_total_m2}m² con ${dormitorios} dorms`,
    razon: 'Área muy pequeña para múltiples dormitorios'
  });
}

// 2. Precio/m² razonable
const precio_m2 = precio_usd / area_total_m2;
if (precio_m2 < 500 || precio_m2 > 5000) {
  flags.push({
    tipo: precio_m2 < 500 ? 'error' : 'warning',
    campo: 'precio_m2',
    valor: precio_m2,
    razon: precio_m2 < 500 ? 'Posible error en precio o área' : 'Precio/m² muy alto'
  });
}

// 3. Baños vs Dormitorios
if (banos > dormitorios + 2) {
  flags.push({
    tipo: 'warning',
    campo: 'banos_vs_dormitorios',
    valor: `${banos} baños, ${dormitorios} dorms`,
    razon: 'Más baños de lo típico para esta tipología'
  });
}
```

#### B. Validaciones de Rangos Técnicos

```javascript
function validarRango(campo, valor, rango) {
  if (valor < rango.min) {
    return {
      tipo: 'error',
      campo: campo,
      valor: valor,
      razon: `Valor por debajo del mínimo técnico (${rango.min})`,
      contexto: rango.razon
    };
  }
  
  if (valor > rango.max) {
    return {
      tipo: 'warning',
      campo: campo,
      valor: valor,
      razon: `Valor por encima del máximo conocido (${rango.max})`,
      contexto: rango.razon
    };
  }
  
  return null;
}
```

---

### 5.4 Niveles de Flags

| Nivel | Significado | Acción |
|-------|-------------|--------|
| `info` | Dato notable pero válido | NO afecta score |
| `warning` | Valor inusual pero posible | Reduce score 5pts |
| `error` | Valor técnicamente imposible | Reduce score 15pts, bloquea matching |

**Ejemplos:**

```javascript
// INFO: Dato notable
{
  tipo: 'info',
  campo: 'precio_m2',
  valor: 2800,
  razon: 'Precio/m² premium (top 10% del mercado)'
}

// WARNING: Inusual pero posible
{
  tipo: 'warning',
  campo: 'area_total_m2',
  valor: 350,
  razon: 'Área muy grande para departamento (posible penthouse)'
}

// ERROR: Imposible técnicamente
{
  tipo: 'error',
  campo: 'precio_m2',
  valor: 250,
  razon: 'Precio/m² por debajo del costo de construcción mínimo'
}
```

---

### 5.5 Casos Especiales (Skip Validaciones)

**Multitipologías:**
```javascript
if (proyecto_multitipologias) {
  // NO validar valores individuales
  // SÍ validar rangos (min/max)
  skipValidaciones(['dormitorios', 'area_total_m2', 'precio_usd']);
  
  // Validar coherencia de rangos
  if (precio_max_usd < precio_min_usd) {
    flags.push({
      tipo: 'error',
      campo: 'rangos_precio',
      razon: 'Precio máximo menor que mínimo'
    });
  }
}
```

**Monoambientes:**
```javascript
if (es_monoambiente && dormitorios === 0) {
  // NO validar dormitorios
  skipValidaciones(['dormitorios', 'banos_vs_dormitorios']);
}
```

---

### 5.6 Score Fiduciario

**Fórmula:**

```javascript
function calcularScoreFiduciario(score_calidad_dato, flags) {
  let penalizacion = 0;
  
  for (const flag of flags) {
    if (flag.tipo === 'warning') {
      penalizacion += 5;
    } else if (flag.tipo === 'error') {
      penalizacion += 15;
    }
  }
  
  const score_fiduciario = Math.max(0, score_calidad_dato - penalizacion);
  
  return {
    score_fiduciario: score_fiduciario,
    penalizacion_total: penalizacion,
    flags_count: {
      info: flags.filter(f => f.tipo === 'info').length,
      warning: flags.filter(f => f.tipo === 'warning').length,
      error: flags.filter(f => f.tipo === 'error').length
    }
  };
}
```

**Lógica de matching:**

```javascript
// Para habilitar matching automatizado
const es_para_matching_verificado = (
  score_fiduciario >= 80 &&
  flags.filter(f => f.tipo === 'error').length === 0
);
```

---

### 5.7 Output del Verificador

```json
{
  "score_fiduciario": 92,
  "penalizacion_total": 3,
  "es_para_matching_verificado": true,
  "flags_semanticos": [
    {
      "tipo": "info",
      "campo": "precio_m2",
      "valor": 1403.51,
      "razon": "Precio/m² dentro del rango normal"
    },
    {
      "tipo": "warning",
      "campo": "area_total_m2",
      "valor": 85.5,
      "razon": "Área ligeramente por debajo del promedio (90m²)"
    }
  ],
  "flags_count": {
    "info": 1,
    "warning": 1,
    "error": 0
  }
}
```

---

## 6. INTEGRACIÓN: EXTRACTOR + SCORER + VERIFICADOR

### 6.1 Pipeline Completo

```javascript
async function procesarPropiedad(propiedad) {
  // FASE 1: EXTRAER
  const datosExtraidos = await extractor.procesar({
    html: propiedad.html,
    url: propiedad.url,
    fuente: propiedad.fuente
  });
  
  // FASE 2: SCOREAR
  const scoring = scorer.calcular(datosExtraidos);
  
  // FASE 3: VERIFICAR
  const verificacion = verificador.validar(
    datosExtraidos,
    scoring.score_calidad_dato
  );
  
  // FASE 4: INTEGRAR OUTPUT
  const outputFinal = {
    ...datosExtraidos,
    ...scoring,
    ...verificacion,
    
    // Metadata de integración
    core_version: '2.1',
    timestamp_procesamiento: new Date().toISOString()
  };
  
  return outputFinal;
}
```

### 6.2 Ejemplo de Output Final Integrado

```json
{
  // ========== EXTRACTOR OUTPUT ==========
  
  // Financiero
  "precio_usd": 120000,
  "precio_usd_original": 120000,
  "precio_fue_normalizado": false,
  "tipo_cambio_usado": 6.96,
  "precio_m2": 1403.51,
  
  // Físico
  "area_total_m2": 85.5,
  "dormitorios": 2,
  "banos": 2,
  "estacionamientos": 1,
  
  // Ubicación
  "latitud": -17.765432,
  "longitud": -63.192345,
  "zona": "Equipetrol Norte",
  
  // Edificio
  "nombre_edificio_limpio": "HH Once",
  "id_proyecto_master_sugerido": 42,
  "metodo_match": "fuzzy_extractor",
  "confianza_sugerencia": 0.85,
  
  // Amenities (30+ campos)
  "amenities": { ... },
  
  // Trazabilidad
  "extractor_version": "v16.3",
  "fuente": "century21",
  
  // ========== SCORER OUTPUT ==========
  
  "score_calidad_dato": 95,
  "score_core": 70,
  "score_opcionales": 25,
  "es_para_matching": true,
  "detalle_score": { ... },
  
  // ========== VERIFICADOR OUTPUT ==========
  
  "score_fiduciario": 92,
  "penalizacion_total": 3,
  "es_para_matching_verificado": true,
  "flags_semanticos": [
    {
      "tipo": "warning",
      "campo": "area_total_m2",
      "valor": 85.5,
      "razon": "Área ligeramente por debajo del promedio"
    }
  ],
  
  // ========== METADATA DE INTEGRACIÓN ==========
  
  "core_version": "2.1",
  "timestamp_procesamiento": "2024-12-01T10:30:45Z"
}
```

---

## 7. PERSISTENCIA Y ESTRUCTURA DE DATOS

### 7.1 Arquitectura Híbrida: Columnas + JSONB

Flujo B persiste datos en **dos lugares simultáneos**:

```sql
-- COLUMNAS EXPLÍCITAS (20 campos core para queries rápidos)
precio_usd NUMERIC,
area_total_m2 NUMERIC,
dormitorios INTEGER,
banos NUMERIC,
estacionamientos INTEGER,
tipo_operacion VARCHAR(20),
estado_construccion VARCHAR(50),
tipo_cambio_usado NUMERIC,
tipo_cambio_paralelo_usado NUMERIC,
precio_min_usd NUMERIC,
precio_max_usd NUMERIC,
area_min_m2 NUMERIC,
area_max_m2 NUMERIC,
es_multiproyecto BOOLEAN,
dormitorios_opciones VARCHAR(20),
scraper_version VARCHAR(20),
score_calidad_dato INTEGER,
score_fiduciario INTEGER,
fecha_enrichment TIMESTAMP,
status VARCHAR(50),

-- JSONB COMPLETO (80 campos extraídos)
datos_json_enrichment JSONB  -- Output completo del extractor
```

**Razón de esta arquitectura:**
- ✅ **Columnas explícitas** → Queries SQL rápidos, indexables, joins eficientes
- ✅ **datos_json_enrichment** → Metadata completa, historial versionado, flexibilidad

---

### 7.2 Qué va en Columnas Explícitas (20 campos)

**CAMPOS CORE (usados en matching, análisis, UI):**

| Grupo | Campos | Propósito |
|-------|--------|-----------|
| **Financiero** | precio_usd, tipo_cambio_usado, tipo_cambio_paralelo_usado, precio_min_usd, precio_max_usd | Queries de precio, sorting, filtros |
| **Físico** | area_total_m2, dormitorios, banos, estacionamientos, area_min_m2, area_max_m2 | Filtros de búsqueda, comparables |
| **Clasificación** | tipo_operacion, estado_construccion | Segmentación de mercado |
| **Multiproperty** | es_multiproyecto, dormitorios_opciones | Lógica especial de matching |
| **Scores** | score_calidad_dato, score_fiduciario | Filtros de calidad |
| **Control** | scraper_version, fecha_enrichment, status | Versionado y estados |

**¿Por qué estos 20?**
- Son los campos más consultados en queries
- Se usan en filtros, ordenamiento, joins
- Permiten indexación eficiente
- Evitan parsear JSON en queries frecuentes

---

### 7.3 Qué va SOLO en datos_json_enrichment (60+ campos)

**TODO LO DEMÁS permanece solo en JSON:**

```javascript
{
  // Amenities (30+ campos)
  "amenities": {
    "gimnasio": true,
    "piscina": false,
    "salon_eventos": true,
    "seguridad_24h": true,
    "areas_verdes": true,
    "parqueo_visitas": true,
    "salon_ninos": false,
    "cancha_futbol": false,
    "cancha_tenis": false,
    "sauna": true,
    "jacuzzi": false,
    "cowork": true,
    "bike_parking": true,
    "pet_friendly": true,
    // ... 20+ más
  },
  
  // Descripción y textos
  "descripcion": "Hermoso departamento en el corazón de...",
  "titulo": "Departamento 2 dormitorios Equipetrol",
  
  // Detalle construcción
  "año_construccion": 2022,
  "nombre_constructora": "Constructora XYZ",
  "niveles": 12,
  "piso": 8,
  
  // Ubicación detallada
  "zona": "Equipetrol Norte",
  "direccion_exacta": "Av. San Martin #123",
  "barrio": "Equipetrol",
  "ciudad": "Santa Cruz",
  
  // Fuzzy matching metadata
  "nombre_edificio_extraido": "HH Once Equipetrol Norte",
  "nombre_edificio_limpio": "HH Once",
  "id_proyecto_master_sugerido": 42,
  "confianza_sugerencia": 0.85,
  "metodo_match": "fuzzy_extractor",
  
  // Scores y flags
  "score_calidad_dato": 95,
  "score_fiduciario": 92,
  "es_para_matching": true,
  "es_para_matching_verificado": true,
  "flags_semanticos": [
    {
      "tipo": "info",
      "campo": "precio_m2",
      "razon": "Dentro del rango normal"
    }
  ],
  
  // Trazabilidad
  "fuente_precio": "grid_visible",
  "fuente_area": "html_specs",
  "fuente_dormitorios": "html_title",
  "tiene_conflictos": false,
  
  // Agente
  "agente_nombre": "María López",
  "agente_telefono": "+591 7012345",
  "agente_email": "maria@century21.com",
  
  // Metadata técnica
  "core_version": "2.0",
  "extractor_version": "v16.3",
  "timestamp": "2024-12-01T10:30:00Z",
  "fuente": "century21"
}
```

**¿Por qué NO en columnas?**
- ❌ Amenities: 30+ columnas BOOLEAN explotan el schema
- ❌ Textos largos: descripción ~2000 chars, no indexable
- ❌ Metadata técnica: solo para debug/auditoría
- ❌ Flexibilidad: agregar campos sin ALTER TABLE

---

### 7.4 Schema de UPDATE/INSERT

#### Caso 1: Primera vez (INSERT)

```sql
INSERT INTO propiedades_v2 (
    -- Identificación
    url, fuente, codigo_propiedad,
    
    -- Core financiero
    precio_usd, tipo_cambio_usado, tipo_cambio_paralelo_usado,
    precio_min_usd, precio_max_usd,
    
    -- Core físico
    area_total_m2, dormitorios, banos, estacionamientos,
    area_min_m2, area_max_m2,
    
    -- Core clasificación
    tipo_operacion, estado_construccion,
    
    -- Multiproperty
    es_multiproyecto, dormitorios_opciones,
    
    -- Scores
    score_calidad_dato, score_fiduciario,
    
    -- JSONB completo (80 campos)
    datos_json_enrichment,
    
    -- Metadata
    scraper_version, fecha_enrichment,
    
    -- Status
    status
) 
VALUES (
    'https://www.century21.com.bo/propiedad/12345',
    'century21',
    'C21-12345',
    120000,  -- precio_usd
    6.96,    -- tipo_cambio_usado
    10.20,   -- tipo_cambio_paralelo_usado
    NULL,    -- precio_min (no es multiproperty)
    NULL,    -- precio_max
    85.5,    -- area_total_m2
    2,       -- dormitorios
    2,       -- banos
    1,       -- estacionamientos
    NULL,    -- area_min
    NULL,    -- area_max
    'venta',
    'entrega_inmediata',
    FALSE,   -- es_multiproyecto
    NULL,    -- dormitorios_opciones
    95,      -- score_calidad_dato
    92,      -- score_fiduciario
    '{
      "precio_usd": 120000,
      "area_total_m2": 85.5,
      "dormitorios": 2,
      ... (80 campos completos)
    }'::JSONB,
    'v16.3',
    NOW(),
    'actualizado'::estado_propiedad
);
```

#### Caso 2: Actualización (UPDATE)

```sql
UPDATE propiedades_v2 SET
    -- Actualizar columnas core
    precio_usd = 125000,
    area_total_m2 = 86,
    dormitorios = 2,
    score_calidad_dato = 96,
    score_fiduciario = 93,
    
    -- REEMPLAZAR JSONB completo
    datos_json_enrichment = '{
      "precio_usd": 125000,
      "area_total_m2": 86,
      ... (80 campos completos, nueva versión)
    }'::JSONB,
    
    -- Actualizar metadata
    scraper_version = 'v16.4',
    fecha_enrichment = NOW(),
    status = 'actualizado'
    
WHERE id = 12345
  AND NOT campos_bloqueados ? 'precio_usd';  -- Respetar candados
```

**IMPORTANTE:** El JSONB se reemplaza COMPLETAMENTE, NO se hace merge.

---

### 7.5 Candados (campos_bloqueados)

**Problema:** ¿Cómo prevenir que correcciones manuales se sobrescriban?

**Solución: Campo JSONB con lista de campos bloqueados**

```sql
-- Columna adicional
campos_bloqueados JSONB

-- Ejemplo:
{
  "id_proyecto_master": true,     -- Bloqueado (corrección manual)
  "precio_usd": false,             -- Libre para actualizar
  "nombre_edificio": true,         -- Bloqueado
  "area_total_m2": false           -- Libre
}
```

**Lógica de aplicación:**

```javascript
function aplicarCandados(nuevosDatos, candados) {
  const datosProtegidos = {};
  
  for (const [campo, bloqueado] of Object.entries(candados)) {
    if (bloqueado) {
      // Excluir de update
      delete nuevosDatos[campo];
    }
  }
  
  return nuevosDatos;
}
```

**SQL con candados:**

```sql
UPDATE propiedades_v2 SET
    precio_usd = CASE 
      WHEN campos_bloqueados->>'precio_usd' = 'true' THEN precio_usd
      ELSE 125000
    END,
    
    id_proyecto_master = CASE
      WHEN campos_bloqueados->>'id_proyecto_master' = 'true' THEN id_proyecto_master
      ELSE 42
    END
    
WHERE id = 12345;
```

**Gestión manual:**

```sql
-- Bloquear un campo (después de corrección manual)
UPDATE propiedades_v2 
SET campos_bloqueados = jsonb_set(
  COALESCE(campos_bloqueados, '{}'::jsonb),
  '{id_proyecto_master}',
  'true'::jsonb
)
WHERE id = 12345;

-- Desbloquear un campo
UPDATE propiedades_v2 
SET campos_bloqueados = jsonb_set(
  campos_bloqueados,
  '{id_proyecto_master}',
  'false'::jsonb
)
WHERE id = 12345;
```

---

### 7.6 Función SQL: registrar_enrichment()

**Firma:**

```sql
CREATE OR REPLACE FUNCTION registrar_enrichment(
    p_id_propiedad INTEGER,
    p_datos_json_enrichment JSONB,
    p_scraper_version VARCHAR
) RETURNS VOID AS $$
BEGIN
    -- Extraer columnas core desde JSONB
    UPDATE propiedades_v2 SET
        -- Financiero
        precio_usd = (p_datos_json_enrichment->>'precio_usd')::NUMERIC,
        tipo_cambio_usado = (p_datos_json_enrichment->>'tipo_cambio_usado')::NUMERIC,
        precio_min_usd = (p_datos_json_enrichment->>'precio_min_usd')::NUMERIC,
        precio_max_usd = (p_datos_json_enrichment->>'precio_max_usd')::NUMERIC,
        
        -- Físico
        area_total_m2 = (p_datos_json_enrichment->>'area_total_m2')::NUMERIC,
        dormitorios = (p_datos_json_enrichment->>'dormitorios')::INTEGER,
        banos = (p_datos_json_enrichment->>'banos')::NUMERIC,
        estacionamientos = (p_datos_json_enrichment->>'estacionamientos')::INTEGER,
        area_min_m2 = (p_datos_json_enrichment->>'area_min_m2')::NUMERIC,
        area_max_m2 = (p_datos_json_enrichment->>'area_max_m2')::NUMERIC,
        
        -- Clasificación
        tipo_operacion = p_datos_json_enrichment->>'tipo_operacion',
        estado_construccion = p_datos_json_enrichment->>'estado_construccion',
        
        -- Multiproperty
        es_multiproyecto = (p_datos_json_enrichment->>'proyecto_multitipologias')::BOOLEAN,
        dormitorios_opciones = p_datos_json_enrichment->>'dormitorios_opciones',
        
        -- Scores
        score_calidad_dato = (p_datos_json_enrichment->>'score_calidad_dato')::INTEGER,
        score_fiduciario = (p_datos_json_enrichment->>'score_fiduciario')::INTEGER,
        
        -- JSONB completo (REEMPLAZO total)
        datos_json_enrichment = p_datos_json_enrichment,
        
        -- Metadata
        scraper_version = p_scraper_version,
        fecha_enrichment = NOW(),
        
        -- Status
        status = 'actualizado'::estado_propiedad
        
    WHERE id = p_id_propiedad;
END;
$$ LANGUAGE plpgsql;
```

**Uso desde n8n:**

```javascript
// Nodo Postgres - Function Call
await db.query(
  'SELECT registrar_enrichment($1, $2, $3)',
  [
    propiedad.id,
    outputFlujoBCompleto,  // JSON de 80 campos
    'v16.3'
  ]
);
```

---

### 7.7 Separación: Sugerencia vs Decisión Final

**Problema:** ¿Cómo distinguir sugerencia de fuzzy match vs decisión final de matching?

**Solución: Sugerencia en JSON, decisión en columna**

```javascript
// 1. Extractor sugiere (va a JSON)
const sugerencia = {
  id_proyecto_master_sugerido: 42,
  metodo_match: "fuzzy_extractor",
  confianza: 0.85
};

await db.update({
  datos_json_enrichment: { ...datos, matching: sugerencia }
});

// 2. Humano o merge aprueba (va a COLUMNA)
await db.update({
  id_proyecto_master: 42,  // ← Decisión final
  metodo_match: 'fuzzy_extractor'
});

// 3. Query para propiedades con match aprobado
SELECT * FROM propiedades_v2
WHERE id_proyecto_master IS NOT NULL;  -- ← Usa columna indexada

// 4. Query para sugerencias pendientes
SELECT * FROM propiedades_v2
WHERE id_proyecto_master IS NULL
  AND datos_json_enrichment->'matching'->>'id_proyecto_master_sugerido' IS NOT NULL;
```

**Razón de la separación:**
- Sugerencia es **metadata temporal** (JSON)
- Decisión final es **dato core permanente** (columna indexada)

---

### 7.8 Relación con Discovery y Merge

```sql
-- Arquitectura completa (3 pipelines)
propiedades_v2 {
  // DISCOVERY (Flujo A)
  datos_json_discovery JSONB,       -- Snapshot crudo API/Grid
  fecha_discovery TIMESTAMP,
  metodo_discovery VARCHAR(50),
  
  // ENRICHMENT/PROCESSING (Flujo B) ← ESTE DOCUMENTO
  datos_json_enrichment JSONB,      -- Output extractor 80+ campos
  fecha_enrichment TIMESTAMP,
  scraper_version VARCHAR(20),
  
  // MERGE (Flujo C)
  datos_json JSONB,                 -- Discovery + Enrichment merged
  fecha_merge TIMESTAMP,
  discrepancias_detectadas JSONB,
  campos_conflicto INTEGER
}
```

**Pipeline de datos:**

```
1. DISCOVERY (Flujo A)
   ↓ crea propiedad con status='nueva'
   ↓ guarda datos_json_discovery
   ↓
   
2. PROCESSING (Flujo B) ← ESTE FLUJO
   ↓ extrae 80 campos del HTML
   ↓ guarda datos_json_enrichment
   ↓ actualiza 20 columnas core
   ↓ cambia status='nueva' → 'actualizado'
   ↓
   
3. MERGE (Flujo C)
   ↓ compara discovery vs enrichment
   ↓ resuelve conflictos
   ↓ guarda datos_json (versión final)
   ↓ cambia status='actualizado' → 'completado'
```

**Ejemplo de evolución:**

```sql
-- Estado 1: Después de Discovery
{
  status: 'nueva',
  datos_json_discovery: {...},  -- Snapshot API
  datos_json_enrichment: NULL,
  datos_json: NULL
}

-- Estado 2: Después de Processing (Flujo B)
{
  status: 'actualizado',
  datos_json_discovery: {...},      -- Preservado
  datos_json_enrichment: {...},     -- ← NUEVO (80 campos)
  precio_usd: 120000,                -- ← Columna actualizada
  area_total_m2: 85.5,               -- ← Columna actualizada
  datos_json: NULL
}

-- Estado 3: Después de Merge
{
  status: 'completado',
  datos_json_discovery: {...},      -- Preservado
  datos_json_enrichment: {...},     -- Preservado
  datos_json: {...},                 -- ← NUEVO (merged)
  precio_usd: 120000,                -- Confirmado por merge
  area_total_m2: 85.5,               -- Confirmado por merge
  discrepancias_detectadas: [...]
}
```

---

### 7.9 Invariantes de Persistencia

**REGLAS QUE NUNCA SE ROMPEN:**

1. ✅ **datos_json_enrichment SIEMPRE contiene los 80 campos completos**
   - Si un campo no se pudo extraer, debe estar presente con `null`
   - Nunca se omiten campos del schema

2. ✅ **Columnas explícitas SIEMPRE se derivan del JSON**
   - Son duplicación controlada para performance
   - JSON es la fuente de verdad

3. ✅ **Un UPDATE de Flujo B reemplaza COMPLETAMENTE el JSONB anterior**
   - No hay "merge" de JSONs
   - Cada run genera output completo

4. ✅ **Candados protegen columnas específicas**
   ```sql
   -- campos_bloqueados JSONB
   {
     "id_proyecto_master": true,  -- Bloqueado por humano
     "precio_usd": false           -- Libre para actualizar
   }
   ```

5. ✅ **scraper_version SIEMPRE se guarda**
   - Trazabilidad de qué versión procesó la propiedad
   - Permite reprocesar con nuevas versiones

6. ✅ **Status SIEMPRE es 'actualizado' después de Flujo B**
   - `nueva` → `actualizado` (primera vez)
   - `actualizado` → `actualizado` (re-procesar)
   - Nunca `actualizado` → `completado` (eso es Merge)

7. ✅ **fecha_enrichment se actualiza en cada run**
   - Timestamp de última extracción
   - Independiente de si hubo cambios en los datos

8. ✅ **Scores se recalculan en cada run**
   - No se preservan valores antiguos
   - Scorer y Verificador siempre corren

---

## 8. FLUJO DE INFORMACIÓN

### 8.1 Contratos entre Módulos

```
DISCOVERY → FLUJO B (Processing):
  Input: {
    url: string,
    html: string,
    fuente: string,
    status: 'nueva'
  }

FLUJO B → MERGE:
  Output: {
    datos_json_enrichment: {...80+ campos},
    precio_usd, area_total_m2, ..., (20 columnas),
    score_calidad_dato: 0-100,
    score_fiduciario: 0-100,
    status: 'actualizado'
  }

FLUJO B → MÓDULO 2 (Enrichment de Mercado):
  Output: {
    datos_json_enrichment: {...80+ campos estructurados},
    Listos para enriquecimiento con APIs externas,
    clustering, análisis comparativo
  }
```

### 8.2 Dependencias

**Flujo B depende de:**
- ✅ Discovery haya creado el registro (status: nueva)
- ✅ HTML disponible en BD o en llamada
- ✅ Tabla proyectos_master para fuzzy matching

**NO depende de:**
- ❌ Google Places API
- ❌ APIs externas de IA
- ❌ Otros módulos del sistema
- ❌ Datos de mercado dinámicos

---

## 9. FUERA DE ALCANCE EXPLÍCITO

### 9.1 Funcionalidades Excluidas

**Flujo B NUNCA hará:**
```
❌ Clustering de propiedades similares (Módulo 2)
❌ Consolidación de duplicados (Módulo 2)
❌ Generación de ADN de edificio (Módulo 2)
❌ Llamadas a APIs externas: Google Places, IA (Módulo 2)
❌ Análisis comparativo de mercado (Módulo 3)
❌ Cálculo de ROI o rentabilidad (Módulo 3)
❌ Decisiones finales de matching (Merge)
❌ Validación de precios vs históricos de mercado (Módulo 3)
❌ Clasificación inteligente de amenities con IA (Módulo 2)
❌ Inferencia de datos faltantes con contexto externo (Módulo 2)
❌ Re-scraping de propiedades (Discovery)
❌ Gestión de ciclo de vida de URLs (Discovery)
❌ Detección de ausencias (Discovery)
❌ Enriquecimiento con fuentes externas (Módulo 2)
```

**Separación clara:**
- **Flujo B:** Processing estructurado (lo que está en HTML)
- **Módulo 2:** Enrichment de mercado (lo que NO está en HTML)
- **Módulo 3:** Análisis comparativo (métricas de mercado)

### 9.2 Límites de Responsabilidad

**Flujo B NO es responsable de:**
```
❌ Exactitud de datos (si HTML miente, extrae la mentira)
❌ Completitud de amenities (extrae lo que está)
❌ Decisión final de matching (solo sugiere)
❌ Calidad de construcción del edificio (dato físico, no en HTML)
❌ Veracidad de información de agente (extrae lo publicado)
❌ Validación GPS contra realidad física (Módulo 2)
❌ Deduplicación de propiedades (Módulo 2)
❌ Cálculo de indicadores de mercado (Módulo 3)
```

---

## 10. VALIDACIÓN DE IMPLEMENTACIÓN

### 10.1 Checklist de Cumplimiento

Una implementación válida de Flujo B "Core++" debe:

```
EXTRACTOR:
✅ Extrae TODOS los datos explícitos del HTML
✅ Aplica solo normalizaciones determinísticas
✅ Genera fuzzy pre-match como SUGERENCIA
✅ Detecta multitipologías correctamente
✅ Maneja monoambientes (dormitorios=0)
✅ Detecta conflictos entre fuentes
✅ Preserva datos originales
✅ Incluye trazabilidad (fuente_*)
✅ NO llama APIs externas
✅ NO hace clustering
✅ NO hace enrichment de mercado
✅ Entrega 80 campos según schema

SCORER:
✅ Calcula score_calidad_dato (0-100)
✅ Métrica de completitud, NO calidad de mercado
✅ Ajusta penalizaciones para multitipologías
✅ Genera detalle_score legible
✅ Determina es_para_matching

VERIFICADOR:
✅ Valida coherencia técnica con rangos pre-establecidos
✅ NO hace análisis dinámico de mercado
✅ Genera flags_semanticos con niveles
✅ Calcula score_fiduciario
✅ Determina es_para_matching_verificado
✅ Skip validaciones no aplicables (ej: precio/m² en multitipologías)

INTEGRACIÓN:
✅ Documenta core_version
✅ Es idempotente (misma URL → mismo output)
✅ Es determinístico (sin APIs externas)
✅ 3 componentes corren secuencialmente
✅ Output completo guardado en BD

PERSISTENCIA:
✅ Usa arquitectura dual (columnas + JSONB)
✅ 20 campos core en columnas explícitas
✅ 80 campos completos en datos_json_enrichment
✅ Respeta candados (campos_bloqueados)
✅ Status SIEMPRE es 'actualizado' al finalizar
✅ Reemplaza JSONB completamente en cada run
✅ Guarda scraper_version y fecha_enrichment
```

### 10.2 Testing Básico

```javascript
// Test 1: Propiedad individual completa
input: { precio: 120000, area: 85, dorms: 2 }
expected: {
  score_calidad_dato: 95,
  score_fiduciario: 92,
  es_para_matching_verificado: true,
  status: 'actualizado'
}

// Test 2: Multitipología
input: "departamentos de 1, 2 y 3 dormitorios"
expected: {
  proyecto_multitipologias: true,
  dormitorios_opciones: [1,2,3],
  es_rango_falso: false,
  precio_min_usd: 80000,
  precio_max_usd: 150000
}

// Test 3: Monoambiente
input: "monoambiente estudio"
expected: {
  dormitorios: 0,
  es_monoambiente: true,
  score_calidad_dato: 95  // No penaliza dormitorios=0
}

// Test 4: Fuzzy pre-match (sugerencia, no decisión)
input: nombre = "HH Once Equipetrol"
expected: {
  nombre_edificio_limpio: "HH Once",
  id_proyecto_master_sugerido: 42,
  metodo_match: "fuzzy_extractor",
  id_proyecto_master: NULL  // Sugerencia, no decisión
}

// Test 5: Persistencia dual
output: {
  // Columnas
  precio_usd: 120000,
  area_total_m2: 85.5,
  dormitorios: 2,
  score_fiduciario: 92,
  status: 'actualizado',
  
  // JSONB
  datos_json_enrichment: {
    precio_usd: 120000,
    area_total_m2: 85.5,
    dormitorios: 2,
    ... (otros 77+ campos)  // Total: 80+ campos según schema
  }
}

// Test 6: No hace enrichment de mercado
input: propiedad_sin_gps
expected: {
  latitud: NULL,
  longitud: NULL,
  // NO llama Google Places API
  // NO infiere GPS con IA
}
```

---

## ANEXO A: GLOSARIO

**Determinístico:** Transformación con mismo input → mismo output, sin estado externo ni llamadas a APIs.

**Normalización:** Transformación reversible que estandariza formato sin perder información original.

**Processing:** Extracción y estructuración de datos explícitos del HTML mediante transformaciones determinísticas. Prepara datos para enrichment.

**Enrichment de Mercado:** Enriquecimiento con fuentes externas (APIs, IA, clustering) que agregan contexto no presente en HTML. Responsabilidad de Módulo 2.

**Fuzzy Pre-Match:** Sugerencia de similitud entre nombre extraído y proyectos_master, sin autoridad de decisión. Se guarda en JSON como metadata, no en columna.

**Datos Core:** 20 campos mínimos obligatorios para habilitar matching. Van en columnas explícitas.

**Datos Core++:** Core + 60 campos opcionales extraíbles del HTML. El total (80+ campos) va en JSON.

**Proyecto Multitipologías:** Anuncio que ofrece múltiples opciones de dormitorios/áreas del mismo proyecto.

**es_rango_falso:** Detectó rango numérico pero es precio de parqueo, no tipologías.

**Score Calidad Dato:** Métrica de completitud de datos (0-100), NO calidad de mercado.

**Score Fiduciario:** Score final (0-100) que combina completitud + validación técnica contra rangos pre-establecidos.

**Flag Semántico:** Señal de advertencia sobre inconsistencia técnica o dato fuera de rangos conocidos.

**Una sola pasada:** Principio de extraer todo en el primer procesamiento del HTML.

**Arquitectura Dual:** Estrategia de persistencia que duplica 20 campos core en columnas (queries rápidos) y guarda los 80 campos completos en JSONB (flexibilidad).

**Candados (campos_bloqueados):** Sistema de protección que marca campos específicos como inmutables, evitando sobrescritura automática de correcciones manuales.

**Rangos Técnicos:** Valores pre-establecidos basados en construcción física y normativa (ej: 500-5000 USD/m²), NO promedios dinámicos de mercado.

---

## CONTROL DE VERSIONES

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | Dic 2024 | Definición inicial (solo extractor) |
| 2.0 | Dic 2024 | Documento integrado: Extractor + Scorer + Verificador |
| 2.1 | Dic 2024 | Agregada Sección 7: Persistencia y Estructura de Datos |
| 2.1.1 | Dic 2024 | **Ajustes CTO:** Aclaración conceptual Processing vs Enrichment de Mercado. Eliminadas referencias ambiguas a "análisis de mercado". Aclarado que validaciones usan rangos técnicos pre-establecidos, NO análisis dinámico. Agregada Sección 0 con nota conceptual crítica. **Correcciones de precisión:** Ajustado conteo de campos de "80" a "80+" para reflejar naturaleza variable del schema. Agregado comentario aclaratorio en pseudocódigo. |

---

**FIN DEL DOCUMENTO CANÓNICO**