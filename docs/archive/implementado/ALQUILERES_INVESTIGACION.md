# Investigacion: Soporte de Alquileres en SICI

> **Fecha:** 11 Feb 2026
> **Estado:** Investigacion completada - pendiente plan de implementacion
> **Scope:** Solo backend + recopilacion de datos (frontend/matching/fiduciaria es posterior)

---

## 1. Estado Actual: Como se Excluyen los Alquileres

Los alquileres se bloquean en **6 capas independientes**:

| Capa | Mecanismo | Archivo |
|------|-----------|---------|
| 1. URL scraping | C21 hardcodea `operacion_venta` en URL grid | `flujo_a_discovery_century21_v1.0.3_FINAL.json` |
| 2. Discovery SQL | `tipo_operacion NOT IN ('venta')` -> `excluido_operacion` | `sql/functions/discovery/registrar_discovery.sql` L161-176 |
| 3. Enrichment n8n | WHERE `tipo_operacion = 'venta'` | `flujo_b_processing_v3.0.json` L431 |
| 4. Merge SQL | Rechaza status `excluido_operacion` | `sql/functions/merge/merge_discovery_enrichment.sql` L185 |
| 5. Matching | Solo procesa `status = 'completado'` | `matching_completo_automatizado.sql` |
| 6. Frontend | Default filter `tipo_operacion = 'venta'` | `buscar_unidades_reales()` L93 |

**Resultado:** ~32 alquileres detectados, todos congelados en `excluido_operacion`. Nunca se enriquecen ni se mergean.

**Volumen estimado:** ~150 alquileres por portal (C21 + Remax) en Equipetrol.

---

## 2. Analisis de Extractores: Sesgo hacia Venta

### 2.1 Si un alquiler pasa por el extractor actual, produce basura

Ejemplo real: "Bs 3,750/mes, 85m2, Equipetrol"

| Paso | Funcion | Resultado | Correcto? |
|------|---------|-----------|-----------|
| 1 | `extraerPrecio()` | `precio_usd: 3750` | NO - interpreta Bs como USD |
| 2 | `normalizarPrecioUSD()` | `$3,750 USD` | NO - es Bs 3,750/mes |
| 3 | `convertirPrecioABolivianos()` | `Bs 26,100` | NO - real es Bs 3,750 |
| 4 | `estimarPrecioPorM2()` | `$44/m2` vs promedio $2,461 | NO - flaggea "muy_por_debajo" |
| 5 | `calcularNivelConfianza()` | Score 0.35 | NO - dato es perfecto |
| 6 | Merge `precio_m2 < 500` | -15 pts score fiduciario | NO - umbral de venta |
| 7 | Merge TC paralelo | `depende_de_tc = true` | NO - alquiler es fijo en Bs |

### 2.2 Clasificacion de funciones del extractor C21 v16.5

**Reusable sin cambios (50%):**
- `extraerArea()`, `extraerEstructura()`, `extraerBanos()`
- `extraerGPS()`, `extraerFotos()`
- `extraerNombreEdificio()` + fuzzy matching
- `extraerAmenities()`, `extraerEquipamiento()`
- `extraerEstacionamiento()`

**SALE-ONLY - produce datos incorrectos (30%):**
- `extraerPrecio()` - no detecta "/mes"
- `normalizarPrecioUSD()` - confunde Bs con USD
- `convertirPrecioABolivianos()` - invierte la conversion
- `estimarPrecioPorM2()` - umbrales de venta ($500-$5000)
- `detectarTipoCambio()` - irrelevante para alquiler
- `calcularNivelConfianza()` - penaliza datos correctos

**No existe - necesario para alquiler (20%):**
- `extraerPrecioMensual()` - "Bs 3,750/mes"
- `extraerDeposito()` - "2 meses de garantia"
- `detectarAmoblado()` - "amoblado/semi/sin"
- `extraerExpensas()` - "Bs 400/mes expensas"
- `extraerContratoMinimo()` - "contrato minimo 1 ano"

### 2.3 Remax v1.9: mismos problemas

Remax tiene el JSON `data-page` que da datos limpios (precio, area, GPS, dorms), pero:
- Misma logica de precio asume total, no mensual
- Mismos umbrales de validacion de venta
- Mismo scoring inadecuado
- Nombre edificio: solo 52% vs 87% C21 (URL slug de Remax es numerico, no tiene nombre)

---

## 3. Fuentes de Datos en Cada Portal

### 3.1 Century21: 7 fuentes en una pagina

```
INVISIBLE (codigo las lee directo):
  1. META TAGS: precio, MC (area), recamaras, banio, tipoOperacion, tipoInmueble
     → Datos numericos limpios, maxima confianza
     → Ejemplo: <meta name="MC" content="84">

  2. JSON-LD: GPS (latitud/longitud), amenityFeature[], fotos, datePublished
     → Datos estructurados para Google, solo ~30% de propiedades lo tienen
     → Ejemplo: {"@type": "Apartment", "amenityFeature": [{"name": "Piscina"}]}

  3. URL SLUG: nombre edificio
     → /propiedad/87681_dpto-edificio-sky-moon-equipetrol
     → 95% de C21 tiene nombre en URL (vs 0% en Remax)

VISIBLE (lo que el usuario ve en la pagina):
  4. TITULO: "Departamento en Venta de 2 Dormitorios"
     → Tipo + operacion + dormitorios (redundante con meta tags)

  5. FICHA SUPERIOR: tabla con datos basicos
     → Construccion: 84 m² | Dormitorios: 2 | Banos: 1 | Estac: 1
     → Validacion cruzada con meta tags

  6. DESCRIPCION: texto libre rico
     → Nombre edificio, amenidades, TC paralelo, estado construccion
     → Multi-tipologia ("1D desde $50K, 2D desde $75K")
     → "2 dormitorios en suite + 1 bano visitas" = 3 banos
     → 97% de propiedades tienen descripcion (356/367)

  7. FICHA TECNICA INFERIOR: *** HOY SE IGNORA COMPLETAMENTE ***
     → Antiguedad: 2 anos
     → Orientacion: Norte
     → Piso: 8 de 15
     → Expensas: Bs 400/mes
     → Estado: A estrenar
     → Luminosidad: Alta
     → Disposicion: Frente

  + SIDEBAR AGENTE: nombre, telefono, oficina
```

**Hallazgo critico:** La ficha tecnica inferior de C21 tiene datos valiosos que el extractor actual **ignora completamente**. Esto explica por que piso, expensas y antiguedad estan casi siempre NULL.

**Nota sobre scraping:** Firecrawl devuelve el HTML **COMPLETO** de la pagina (`formats: ["rawHtml"]`, timeout 75s, waitFor 2s). La ficha inferior **SI esta en el HTML** — simplemente nadie escribio regex para leerla.

### 3.2 Remax: 3 fuentes principales

```
INVISIBLE:
  1. data-page JSON (embebido como atributo HTML):
     → precio, area, GPS, dorms, banos, agente, fotos,
       transaction_type, dates
     → 95% de toda la data viene de aca
     → Datos limpios en formato maquina
     → Ejemplo: listing.prices.amount = 120000

VISIBLE:
  2. HTML <p class="text-gray-700">: lista de amenidades
     → Piscina, Gimnasio, Seguridad 24/7
     → Solo amenidades, no datos tecnicos

  3. DESCRIPCION: texto libre
     → Estado construccion, parking, TC, nombre edificio (fallback)
     → Misma riqueza que C21 pero es la UNICA fuente para datos semanticos

  NO tiene ficha tecnica inferior como C21.
  NO tiene URL con nombre de edificio (URLs son IDs numericos).
```

### 3.3 Tasas de campos NULL en la BD (datos reales, 367 propiedades completadas)

| Campo | C21 (268 props) | Remax (99 props) | Causa |
|-------|-----------------|-------------------|-------|
| Nombre edificio | 87% tiene | 52% tiene | Remax no tiene nombre en URL |
| Estacionamientos | 26% tiene | 3% tiene | Dato no esta en API Remax |
| Piso | 19% tiene | 6% tiene | Solo en ficha inferior C21 (ignorada) y descripcion |
| Estado construccion | 58% tiene | 84% tiene | Remax extrae mejor del JSON |
| Expensas | **0%** | **0%** | Nadie extrae este dato |
| Antiguedad | **0%** | **0%** | Nadie extrae este dato |

### 3.4 Jerarquia de prioridad actual del extractor

Cuando multiples fuentes tienen el mismo dato, el extractor decide asi:

**Precio:** Meta tag > HTML visible > Descripcion (excepto si hay TC paralelo en descripcion)
**Area:** Meta tag "MC" > Meta tag "area" > HTML tabla > Descripcion
**Dormitorios:** Meta tag "recamaras" > HTML tabla > Descripcion
**Banos:** El numero MAS ALTO gana (meta, HTML o descripcion contexto)
**Nombre edificio:** URL slug > Meta "direccion" > Descripcion > Fuzzy matching
**Amenidades:** JSON-LD > Descripcion > Inferencia

---

## 4. Pipeline Completo: Discovery -> Enrichment -> Merge

### 4.1 Flujo actual

```
1:00 AM  DISCOVERY (API de portales)
         ├── C21: GET .../operacion_venta/... → JSON con ~20 props
         │   Extrae: precio, area, dorms, banos, GPS, tipo_operacion, fotos_thumb
         │   tipo_operacion viene del API (⚠️ BUG: a veces miente, ver seccion 9)
         │
         └── Remax: GET api/search/... → JSON con ~160 props
             Extrae: lo mismo pero de transaction_type.name
             tipo_operacion es confiable en Remax

         → registrar_discovery() guarda en propiedades_v2
           Si tipo_operacion != 'venta' → status = 'excluido_operacion'

2:00 AM  ENRICHMENT (scraping pagina individual)
         WHERE status = 'nueva' AND tipo_operacion = 'venta'
         → Firecrawl scrape HTML completo
         → Extractor C21 v16.5 / Remax v1.9 (1,400+ lineas regex)
         → registrar_enrichment() actualiza propiedades_v2
           NO toca tipo_operacion (solo Discovery lo setea)

3:00 AM  MERGE (resolucion de conflictos)
         WHERE status IN ('nueva', 'actualizado')
         → Compara Discovery vs Enrichment campo por campo
         → Decide ganador segun reglas (ver 4.2)
         → Calcula score fiduciario, precio_m2, flags
         → status = 'completado'
```

### 4.2 Como decide Merge quien gana (campo por campo)

La regla general es **Discovery gana si tiene dato**, con excepciones:

**precio_usd — logica condicional:**
```
SI campos_bloqueados → CANDADO gana (siempre)
SI enrichment hizo conversion BOB→USD → ENRICHMENT gana
SI discovery tiene USD:
   SI diferencia con enrichment > 10% → ENRICHMENT gana (fallback)
   SI diferencia <= 10% → DISCOVERY gana
SI nada anterior → ENRICHMENT gana
```
Discrepancia guardada en `datos_json->discrepancias->precio` con diff_pct y flag warning/error.

**area_total_m2 — Discovery > Enrichment:**
```
SI campos_bloqueados → CANDADO
SI discovery area > 0 → DISCOVERY
SI enrichment area > 0 → ENRICHMENT
SINO → valor existente
```

**dormitorios — Discovery > Enrichment:**
```
SI campos_bloqueados → CANDADO
SI discovery != NULL → DISCOVERY
SI enrichment != NULL → ENRICHMENT
```

**banos — Discovery > Enrichment:**
```
SI campos_bloqueados → CANDADO
SI discovery != NULL → DISCOVERY  ← PROBLEMA: pierde detalle de enrichment
SI enrichment != NULL AND < 100 → ENRICHMENT
```
Ejemplo del problema: meta tag dice 1 bano, enrichment detecta "2 en suite + 1 visitas" = 3. Discovery gana con 1. **Se pierde informacion.**

**GPS — Discovery > Enrichment:**
Discrepancia calculada con Haversine (>100m = warning).

**nombre_edificio — Discovery > Enrichment:**
Discovery rara vez tiene este dato (solo si viene del API). En la practica, casi siempre gana Enrichment.

**tipo_cambio, amenidades, descripcion, fotos:**
Siempre Enrichment (Discovery no tiene estos datos).

**tipo_operacion:**
Merge NUNCA lo cambia. Solo Discovery y Enrichment lo setean.

### 4.3 Sistema de candados (campos_bloqueados)

`campos_bloqueados` es un JSONB en propiedades_v2 que SIEMPRE gana sobre cualquier fuente:

```json
// Formato viejo (workflows):
{"precio_usd": true, "area_total_m2": true}

// Formato nuevo (admin panel, migracion 115):
{
  "precio_usd": {
    "bloqueado": true,
    "razon": "Precio verificado con desarrollador",
    "fecha": "2026-01-20",
    "usuario": "admin@sici.com"
  }
}
```

Merge chequea `_is_campo_bloqueado()` antes de modificar cualquier campo. Soporta ambos formatos.

### 4.4 Tracking de discrepancias en datos_json

Merge guarda un registro de todas las diferencias detectadas:

```json
"discrepancias": {
  "precio": {
    "discovery": 150000,
    "enrichment": 152000,
    "diff_pct": 0.0133,
    "flag": "warning",
    "fuente_usada": "discovery"
  },
  "area": {
    "discovery": 84,
    "enrichment": 85,
    "diff_pct": 0.012,
    "flag": null
  },
  "dormitorios": {
    "discovery": 2,
    "enrichment": 2,
    "match": true
  },
  "gps": {
    "distancia_metros": 45,
    "flag": null
  }
}
```

Umbrales: <2% = OK, 2-10% = warning, >10% = error (fallback a enrichment para precio).

### 4.5 Score fiduciario y validaciones en Merge

Merge calcula un score de 0-100 puntos:
- 70 pts base (7 campos core × 10 pts)
- 30 pts opcionales (6 campos × 5 pts)
- Penalidades:
  - `precio_m2 < $500` → **-15 pts** (umbral de VENTA, destruye alquileres)
  - `precio_m2 > $5000` → -10 pts
  - Datos criticos faltantes → -10 pts c/u

Si score >= 80 Y sin datos criticos faltantes → `es_para_matching = true`

### 4.6 Problema actual: Discovery gana incluso cuando Enrichment sabe mas

Datos reales de la BD confirman que el sistema actual pierde informacion:

**Fuente ganadora para banos:**
| Fuente | Cantidad | % |
|--------|----------|---|
| meta (discovery) | 190 | 53% |
| json_system | 97 | 27% |
| descripcion_contexto | 27 | 7% |
| inferido_monoambiente | 16 | 4% |
| por_defecto (adivino) | 16 | 4% |
| descripcion | 13 | 4% |

**Fuente ganadora para area:**
| Fuente | Cantidad | % |
|--------|----------|---|
| meta_MC | 263 | 73% |
| **no_detectado** | **61** | **17%** |
| descripcion_patron | 36 | 10% |

**17% de propiedades no tienen area** — probablemente esta en la ficha inferior que se ignora.

---

## 5. Propuesta: IA para Interpretacion de Texto

### 5.1 Problema con regex

El extractor actual usa **1,400+ lineas de regex** para interpretar texto humano. Es fragil, se rompe con variaciones, y no cubre alquileres.

### 5.2 Arquitectura propuesta

```
SCRAPING (Firecrawl) → HTML crudo (completo, ya funciona asi)
       |
       v
PARSER SIMPLE (codigo, ~100 lineas por portal):
  Extrae datos de maquina (no cambia vs hoy):
  - Meta tags / JSON-LD / data-page → datos estructurados
  - Fotos URLs, agente contacto     → datos directos

  Concatena TODO el texto visible de la pagina:
  - titulo + ficha superior + descripcion + ficha inferior (C21)
  - titulo + descripcion + amenidades HTML (Remax)
       |
       v
LLM (Haiku, ~$0.01/propiedad):
  Input: texto concatenado + datos estructurados ya extraidos
  Output: JSON con schema estricto
       |
       v
VALIDACION (codigo, ~50 lineas):
  - nombre_edificio → fuzzy match contra proyectos_master
  - precio → sanity check por tipo_operacion
  - amenidades → normalizar a vocabulario controlado
       |
       v
registrar_enrichment() o registrar_enrichment_alquiler()
```

### 5.3 Que reemplaza IA vs que sigue siendo codigo

| Tarea | Hoy | Con IA |
|-------|-----|--------|
| Leer meta tags, JSON-LD, data-page | Codigo | Codigo (IGUAL) |
| Extraer fotos, GPS, agente | Codigo | Codigo (IGUAL) |
| Interpretar titulo | 50 lineas regex | LLM |
| Interpretar ficha superior | 100 lineas regex | LLM |
| Interpretar descripcion | 1,200 lineas regex | LLM |
| Interpretar ficha inferior C21 | **SE IGNORA** | **LLM la lee** |
| Nombre edificio | 200 lineas fuzzy + blacklist | LLM + validacion |
| Amenidades | 69 regex individuales | LLM lista libre |
| TC paralelo | 10 regex patterns | LLM |
| **Alquileres** | **NO EXISTE** | **Mismo prompt, campos extra** |

### 5.4 Como maneja la IA datos conflictivos entre fuentes

El LLM recibe TANTO los datos estructurados (meta tags/JSON) como el texto visible. Se le instruye a reportar conflictos:

```
DATOS ESTRUCTURADOS YA EXTRAIDOS (alta confianza):
  precio_meta: 271552
  area_meta: 84
  dormitorios_meta: 2
  banos_meta: 1

TEXTO VISIBLE DE LA PAGINA:
  [TITULO] Departamento en Venta 2 Dormitorios
  [FICHA SUPERIOR] Construccion: 84m2 | Dormitorios: 2 | Banos: 1
  [DESCRIPCION] 2 dorms en suite, 1 bano visitas, cocina equipada...
  [FICHA INFERIOR] Antiguedad: 2 anos | Piso: 8 | Expensas: Bs 400

INSTRUCCIONES:
  - Si encontras datos que CONTRADICEN los estructurados,
    reportalos en el campo "conflictos"
  - Para banos: conta suites + visitas + toilettes del texto
  - Los datos estructurados son referencia, el texto puede
    tener mas detalle
```

**Respuesta del LLM:**

```json
{
  "nombre_edificio": "Sky Moon",
  "banos_total": 3,
  "banos_detalle": "2 en suite + 1 visitas",
  "piso": 8,
  "pisos_edificio": 15,
  "expensas_bob": 400,
  "antiguedad_anos": 2,
  "amenidades": ["piscina", "gimnasio", "seguridad_24h"],
  "equipamiento": ["cocina_equipada"],
  "estado_construccion": "en_construccion",
  "fecha_entrega": "2026-06",
  "tc_mencionado": "paralelo",
  "amoblado": "no",
  "conflictos": [
    {
      "campo": "banos",
      "valor_estructurado": 1,
      "valor_texto": 3,
      "razon": "Meta dice 1, pero descripcion menciona 2 en suite + 1 visitas"
    }
  ]
}
```

### 5.5 Como cambia el flujo Discovery -> Enrichment -> Merge con IA

```
ANTES (hoy):
  Discovery API     →  {precio, area, dorms, banos, GPS}
  Enrichment regex  →  {precio, area, dorms, banos, edificio, amenidades, TC}
                        (1,400 lineas regex, resolucion interna ad-hoc)
  Merge             →  compara 2 valores, Discovery casi siempre gana

CON IA:
  Discovery API     →  {precio, area, dorms, banos, GPS}
  Enrichment:
    Parser codigo   →  {meta tags, JSON-LD, fotos, agente}  (datos duros)
    LLM             →  {edificio, amenidades, banos_detalle, piso, expensas,
                         TC, estado, deposito, amoblado, conflictos}
                        (datos semanticos del texto)
    Validacion      →  cruza datos duros vs LLM, resuelve conflictos internos
                     →  pasa UN valor por campo a registrar_enrichment()
  Merge             →  compara Discovery vs Enrichment (igual que hoy)
                        PERO enrichment ahora tiene nivel de confianza
```

**La arquitectura no cambia** — sigue siendo Discovery -> Enrichment -> Merge. Lo que cambia es:
1. Enrichment usa LLM en vez de regex para interpretar texto
2. Enrichment captura mas datos (ficha inferior, expensas, piso)
3. Enrichment reporta conflictos internos con explicacion
4. Enrichment pasa un score de confianza a Merge

### 5.6 Mejora propuesta para Merge con niveles de confianza

Hoy merge tiene una regla simple: Discovery gana si tiene dato. Con enrichment mas confiable, merge puede ser mas inteligente:

```sql
-- HOY (merge v2.3.0):
IF discovery_banos IS NOT NULL THEN
    usar discovery  -- siempre

-- PROPUESTA (merge v2.4.0):
IF campos_bloqueados THEN
    usar candado  -- siempre gana

ELSIF enrichment_confianza = 'alta'
  AND enrichment_banos > discovery_banos
  AND enrichment_fuentes_coinciden >= 2 THEN
    usar enrichment  -- 2+ sub-fuentes internas coinciden
    guardar discrepancia

ELSIF discovery_banos IS NOT NULL THEN
    usar discovery  -- default como hoy

ELSE
    usar enrichment
```

Ejemplo: meta dice banos=1, LLM dice 3 (de descripcion), ficha inferior dice 3.
Enrichment tiene 2 fuentes que coinciden (LLM + ficha) vs 1 que no (meta).
→ Merge usa 3 con confianza alta, guarda discrepancia con meta.

### 5.7 Beneficios clave

1. **Un solo prompt sirve para venta Y alquiler** - no hay que crear extractor nuevo
2. **Captura la ficha inferior de C21** que hoy se ignora
3. **Mejora nombre_edificio en Remax** (de 52% a ~80% estimado)
4. **Agregar campo nuevo** = agregar 1 linea al schema (vs escribir regex)
5. **Nuevo portal** = cambiar solo el parser HTML, mismo prompt
6. **Costo**: ~$0.01-0.03 por propiedad (Haiku), ~$10/mes para 500 props
7. **Conflictos explicados**: LLM dice POR QUE hay discrepancia, no solo que la hay

### 5.8 Trade-offs

| Riesgo | Impacto | Mitigacion |
|--------|---------|------------|
| Costo API LLM | ~$10/mes | Batch nocturno, Haiku es barato |
| Latencia | 1-3 seg/prop | Pipeline nocturno, no importa |
| Alucinaciones | Inventa datos | Schema estricto + validacion post-LLM |
| Consistencia | Variabilidad | Temperature 0 + schema rigido |
| Dependencia externa | Si API cae | Fallback a regex basico o marcar para revision |

---

## 6. Decision Arquitectonica: Flujos Separados

### 6.1 Conclusion: flujos separados para venta y alquiler

Razones:
- Venta funciona al 100% hoy - no contaminar
- Testing de alquiler aislado de produccion
- Requerimientos de datos son distintos (precio mensual vs total, deposito, amoblado)
- Mezclar en mismo extractor agrega complejidad y puntos de falla
- Si alquiler falla, venta sigue funcionando
- Mas mantenimiento pero mas seguro

### 6.2 Estructura propuesta

```
VENTA (existente, no se toca):
  flujo_a_discovery_c21_venta.json       ← existente
  flujo_a_discovery_remax_venta.json     ← existente
  flujo_b_enrichment_venta.json          ← existente (regex 1,400 lineas)
  registrar_discovery()                  ← existente
  registrar_enrichment()                 ← existente
  merge_discovery_enrichment()           ← existente

ALQUILER (nuevo, aislado):
  flujo_a_discovery_c21_alquiler.json    ← NUEVO (URL operacion_alquiler)
  flujo_a_discovery_remax_alquiler.json  ← NUEVO (filtrar transaction_type = alquiler)
  flujo_b_enrichment_alquiler.json       ← NUEVO (parser simple + LLM)
  registrar_discovery_alquiler()         ← NUEVA funcion SQL
  registrar_enrichment_alquiler()        ← NUEVA funcion SQL
  merge_alquiler()                       ← NUEVA funcion SQL (mas simple, sin TC paralelo)

TABLA: misma propiedades_v2 (un edificio puede tener venta + alquiler)
```

### 6.3 Estrategia de migracion

1. IA se prueba primero con alquileres (riesgo cero para datos existentes)
2. Si funciona bien, migrar venta al mismo approach con LLM
3. Eliminar 1,400 lineas de regex cuando IA este validada para ambos

---

## 7. Columnas Nuevas Necesarias

```sql
-- Migracion 130: Columnas rental en propiedades_v2
ALTER TABLE propiedades_v2 ADD COLUMN IF NOT EXISTS
  precio_mensual_bob    NUMERIC(10,2),   -- Precio mensual en Bs (fuente primaria)
  precio_mensual_usd    NUMERIC(10,2),   -- Convertido a USD
  deposito_meses        INTEGER,         -- 1-3 meses tipico Bolivia
  amoblado              BOOLEAN,         -- Amoblado/sin amoblar
  expensas_incluidas    BOOLEAN,         -- Gastos comunes incluidos
  monto_expensas_bob    NUMERIC(8,2),    -- Expensas mensuales si separadas
  contrato_minimo_meses INTEGER;         -- Duracion minima contrato

CREATE INDEX idx_prop_alquiler ON propiedades_v2(precio_mensual_usd)
  WHERE tipo_operacion = 'alquiler' AND status = 'completado';
```

**Nota:** `tipo_operacion_enum` ya incluye `'alquiler'` y `'anticretico'`. No necesita cambio.

---

## 8. Secuencia de Migraciones Propuesta

| # | Migracion | Que hace | Dependencias |
|---|-----------|----------|--------------|
| 130 | `rental_columns` | Agrega 7 columnas + indice | Ninguna |
| 131 | `discovery_alquiler` | Nueva funcion `registrar_discovery_alquiler()` | 130 |
| 132 | `enrichment_alquiler` | Nueva funcion `registrar_enrichment_alquiler()` | 130 |
| 133 | `merge_alquiler` | Nueva funcion `merge_alquiler()` (sin TC paralelo) | 130-132 |
| 134 | `reactivar_excluidos` | Las 32 props excluidas → re-procesar | 131 |

---

## 9. Estimacion de Esfuerzo (Solo Backend)

| Tarea | Dias |
|-------|------|
| Migraciones BD (130-134) | 1-2 |
| Parser HTML simple (C21 + Remax) | 1-2 |
| Prompt LLM + validacion | 1-2 |
| Workflow n8n discovery alquiler | 1 |
| Workflow n8n enrichment alquiler (con LLM) | 2-3 |
| Merge alquiler (funcion SQL) | 1-2 |
| Testing pipeline completo | 1-2 |
| **Total backend** | **8-13 dias** |

---

## 10. Decisiones Pendientes

1. **Anticretico**: se incluye o se deja excluido? (modelo boliviano unico)
2. **Moneda default alquiler**: guardar BOB + USD o solo USD convertido?
3. **Matching**: alquileres matchean a mismos `proyectos_master`? (recomendacion: si)
4. **Modelo LLM**: Haiku (barato, rapido) vs Sonnet (mejor, mas caro)?
5. **Fallback**: si LLM falla, que pasa? (opcion: marcar para revision manual)
6. **Merge mejorado**: implementar confianza para que enrichment pueda ganar cuando tiene mas detalle? (recomendacion: si, pero despues de validar IA)

---

## 11. Bug Documentado Relevante

`docs/bugs/BUG_001_CENTURY21_TIPO_OPERACION.md`

C21 API a veces devuelve `tipoOperacion: "venta"` para alquileres. Fix sugerido (no implementado):

```javascript
tipo_operacion: (() => {
  const url = (prop.urlCorrectaPropiedad || '').toLowerCase();
  if (url.includes('alquiler')) return 'alquiler';
  if (url.includes('anticretico')) return 'anticretico';
  return prop.tipoOperacion || 'venta';
})()
```

Este fix deberia implementarse en el workflow de discovery de alquileres.

---

## 12. Referencias

| Archivo | Contenido |
|---------|-----------|
| `sql/functions/discovery/registrar_discovery.sql` | Funcion discovery actual |
| `sql/functions/enrichment/registrar_enrichment.sql` | Funcion enrichment actual |
| `sql/functions/merge/merge_discovery_enrichment.sql` | Merge v2.3.0 |
| `n8n/workflows/modulo_1/flujo_a_discovery_century21_v1.0.3_FINAL.json` | Discovery C21 |
| `n8n/workflows/modulo_1/flujo_a_discovery_remax_v1.0.2_FINAL.json` | Discovery Remax |
| `n8n/workflows/modulo_1/flujo_b_processing_v3.0.json` | Enrichment (ambos portales) |
| `docs/extractores/heuristics/extractor_heuristics_parte1_century21.md` | Heuristicas C21 |
| `docs/bugs/BUG_001_CENTURY21_TIPO_OPERACION.md` | Bug tipo_operacion |
| `sql/schema/propiedades_v2_schema.md` | Schema BD |
