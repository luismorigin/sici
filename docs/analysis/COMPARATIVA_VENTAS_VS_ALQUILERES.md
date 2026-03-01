# Análisis Comparativo: Pipeline Ventas vs Alquileres

**Fecha:** 2026-03-01
**Propósito:** Diseñar un flujo de ventas v2 combinando lo mejor de ambos pipelines

---

## 1. Pipeline Alquileres (el modelo a seguir)

### 1.1 Discovery — Extracción por fuente

Las 3 fuentes llaman `registrar_discovery_alquiler()` con 17 parámetros idénticos.

| Campo | C21 (grid JSON) | Remax (API REST) | Bien Inmuebles (POST) |
|-------|-----------------|-------------------|----------------------|
| `precio_mensual_bob` | `prop.precio` (si BOB) | `prop.price.amount` | `item.precio_cata` |
| `precio_mensual_usd` | calc o `precios.vista.precio` | `prop.price.price_in_dollars` | `item.precio_cata` (si USD) |
| `area_total_m2` | `prop.m2C` | `listing_information.construction_area_m` | `item.supterreno_cata` |
| `dormitorios` | `prop.recamaras` | `listing_information.number_bedrooms` | `item.habitacion_cata` |
| `banos` | `prop.banos` | `listing_information.number_bathrooms` | `item.banio_cata` |
| `estacionamientos` | `prop.estacionamientos` | `listing_information.number_parking` | NULL (no disponible) |
| `latitud/longitud` | `prop.lat/lon` | `location.latitude/longitude` | `item.latitud/longitud_cata` |
| `fecha_publicacion` | `prop.fechaAlta` | `prop.date_of_listing` | NULL (no disponible) |
| `tipo_propiedad` | `prop.tipoPropiedad` | `subtype_property.name` | `'departamento'` (hardcoded) |

**Fotos:** C21 en `datos_json_discovery.fotos.propiedadThumbnail[0]`. Remax y BI se extraen en enrichment.
**Agente:** C21 en `datos_json_discovery.asesorNombre/whatsapp`. Remax en `agent.user`. BI en HTML.

### 1.2 Enrichment LLM — El diferenciador clave

**Modelo:** Claude Haiku 4.5 (`temperature: 0`, `max_tokens: 1024`)
**Scope:** Propiedades con `status IN ('nueva','actualizado')` AND `fecha_enrichment IS NULL`, LIMIT 20/run

**Flujo por propiedad:**
1. Firecrawl scrape (markdown + rawHtml, `waitFor: 3000ms`)
2. Extracción directa por fuente (fotos, agente) — NO pasa por LLM
3. Contenido → prompt LLM (max 3000 chars)
4. Parseo + validación del JSON de respuesta
5. `registrar_enrichment_alquiler()` escribe a BD

**Prompt LLM (verbatim):**
```
Eres un extractor de datos inmobiliarios para Bolivia.
Extraes datos de páginas web de propiedades en ALQUILER.
NUNCA inventes datos. Si no aparece en el texto, usa null.

DATOS YA CONOCIDOS (del discovery):
- URL: {url}
- Fuente: {fuente}
- Precio discovery: Bs {precio_mensual_bob}
- Área: {area_total_m2} m²
- Dormitorios: {dormitorios}
- Baños: {banos}
- Zona: {zona}

TEXTO DE LA PÁGINA:
{contenido}

Devuelve SOLO este JSON (sin explicaciones):
{
  "precio_mensual_bob": number | null,
  "precio_mensual_usd": number | null,
  "expensas_bs": number | null,
  "deposito_meses": number | null,
  "contrato_minimo_meses": number | null,
  "area_total_m2": number | null,
  "dormitorios": number | null,
  "banos": number | null,
  "estacionamientos": number | null,
  "baulera": boolean | null,
  "piso": number | null,
  "amoblado": "si" | "no" | "semi" | null,
  "acepta_mascotas": boolean | null,
  "servicios_incluidos": string[] | null,
  "nombre_edificio": string | null,
  "descripcion_limpia": string | null,
  "amenities_confirmados": string[] | null,
  "equipamiento_detectado": string[] | null,
  "agente_nombre": string | null,
  "agente_telefono": string | null,
  "agente_oficina": string | null
}
```

**Validación post-LLM:**

| Campo | Regla | Si falla |
|-------|-------|----------|
| `precio_mensual_bob` | `> 0` AND `<= 50,000` | → null |
| `area_total_m2` | `>= 15` AND `<= 500` | → null |
| `dormitorios` | `>= 0` AND `<= 6` | → null |
| `banos` | `>= 0` AND `<= 6` | → null |
| `expensas_bs` | `>= 0` AND `< precio_mensual_bob` | → null |
| Más de 2 errores | — | `requiere_revision = true` |

**Merge de agente:** Para Remax y BI, el agente extraído directo del HTML tiene prioridad sobre el LLM.
**Merge de fotos:** Para Remax y BI, fotos del HTML se inyectan en `datos_llm.fotos_urls` (LLM no las ve).

### 1.3 Merge Alquiler — Enrichment-first

Prioridad de resolución (inversa a ventas):
```
1. ¿Campo en campos_bloqueados? → valor del candado GANA
2. ¿Columna ya tiene valor? → usarla (enrichment ya la escribió)
3. ¿Valor en datos_json_enrichment.llm_output? → usarlo
4. NULL
```

**Campos escritos a `datos_json`:** `descripcion_limpia`, `amenities_confirmados`, `equipamiento_detectado`, `servicios_incluidos`, audit trail.

**Post-merge:** `status = 'completado'` → trigger `trg_alquiler_matching` → `matchear_alquiler(id)`.

### 1.4 Campos que produce el pipeline alquiler

| Categoría | Campos |
|-----------|--------|
| **Financiero** | `precio_mensual_bob`, `precio_mensual_usd`, `monto_expensas_bob`, `deposito_meses` |
| **Contrato** | `contrato_minimo_meses`, `amoblado`, `acepta_mascotas`, `servicios_incluidos` |
| **Físico** | `area_total_m2`, `dormitorios`, `banos`, `estacionamientos`, `baulera`, `piso` |
| **Identificación** | `nombre_edificio`, `zona`, `microzona` |
| **Contenido** | `descripcion_limpia`, `amenities_confirmados`, `equipamiento_detectado` |
| **Agente** | `agente_nombre`, `agente_telefono`, `agente_oficina` |
| **Fotos** | `fotos_urls` (en `datos_json_enrichment.llm_output`) |

---

## 2. Pipeline Ventas (estado actual)

### 2.1 Discovery — Lo mismo que alquileres

C21 y Remax usan la misma lógica de discovery. `registrar_discovery()` con 17 parámetros. Los campos son idénticos a alquileres excepto:
- `precio_usd` en lugar de `precio_mensual_bob`
- Sin Bien Inmuebles (solo 2 fuentes)

**Gap crítico:** Ni la API de C21 ni la de Remax retornan `nombre_edificio`. Este campo es 100% dependiente del enrichment.

### 2.2 Enrichment Ventas — Regex, NO LLM

**Diferencia arquitectónica fundamental:** El enrichment de ventas es PURAMENTE regex/DOM extraction. **No usa LLM.**

**Flujo:**
1. Firecrawl scrape del HTML de la propiedad
2. Extractor C21 v16.5 o Remax v1.9 (funciones JavaScript en n8n)
3. `registrar_enrichment()` escribe a BD

#### C21 Extractor v16.5 — Campos extraídos (39 campos)

| Categoría | Campos | Método |
|-----------|--------|--------|
| **Precio** | `precio_usd`, `precio_usd_original`, `precio_min/max_usd`, `moneda_original`, `tipo_cambio_detectado`, `precio_fue_normalizado` | regex en HTML |
| **Precio BS** | `precio_bs`, `tipo_cambio_usado` | conversión interna |
| **Físico** | `area_total_m2`, `dormitorios`, `banos`, `estacionamientos` | regex en HTML |
| **GPS** | `latitud`, `longitud`, `zona_validada_gps` | meta tags HTML |
| **Tipo** | `tipo_propiedad_original`, `tipo_operacion`, `es_multiproyecto` | regex |
| **Construcción** | `estado_construccion`, `fecha_entrega_estimada`, `porcentaje_avance` | regex en descripción |
| **Nombre edificio** | `nombre_edificio`, `fuente_nombre_edificio`, `nivel_confianza`, `id_proyecto_master_sugerido`, `metodo_match` | cascada de 4 prioridades (ver abajo) |
| **Agente** | `agente_nombre`, `agente_telefono`, `url_whatsapp` | HTML block |
| **Oficina** | `oficina_nombre`, `oficina_telefono`, `oficina_direccion` | HTML block |
| **Fotos** | `fotos_urls`, `cantidad_fotos` | HTML gallery |
| **Contenido** | `descripcion`, `amenities`, `equipamiento` | regex/checkboxes |
| **Meta** | `nivel_confianza_general`, `conflictos`, `requiere_revision_humana`, `scraper_version` | computed |

#### Extracción de nombre_edificio — La cascada de 4 prioridades (C21)

| Prioridad | Fuente | Confianza | Ejemplo |
|-----------|--------|-----------|---------|
| 1 | URL slug (`edificio-X` o `condominio-X`) | 0.95 | `/propiedad/departamento-edificio-mirador-12345` |
| 1b | URL slug (ALL-CAPS o slug completo) | 0.90 | `/propiedad/TORRE-NOVA-equipetrol-12345` |
| 2 | Meta tag `ubicacion` | 0.85 | `"Edificio Mirador, Equipetrol"` |
| 3 | Keywords en descripción | 0.70 | `"...en el Edificio Torre Nova..."` |
| 4 | Líneas ALL-CAPS en descripción | 0.60 | `"TORRE NOVA"` (2-5 palabras mayúsculas) |

**Post-extracción:** Fuzzy match contra `proyectos_master` (Jaccard word-intersection, threshold >= 65). Si matchea → reemplaza con nombre oficial + guarda `id_proyecto_master_sugerido`.

**Blacklist:** Rechaza términos de marketing ('en venta', 'century 21', 'piscina', 'oportunidad', etc.).

#### Remax Extractor v1.9 — Nombre edificio (solo 3 patrones)

| Prioridad | Fuente | Confianza |
|-----------|--------|-----------|
| 1 | Título de página (después de strip "Remax") | fuzzy >= 70 |
| 2 | Descripción: `"proyecto X by"` | 0.70 |
| 3 | Descripción: `"edificio X"` | 0.65 |

**No hay fallback a ALL-CAPS ni URL slug** (los slugs de Remax son opacos).

### 2.3 Merge Ventas — Discovery-first

Prioridad de resolución (inversa a alquileres):
```
1. ¿Campo en campos_bloqueados? → candado GANA
2. ¿Discovery tiene valor? → Discovery GANA (para campos físicos)
3. ¿Enrichment tiene valor? → fallback
4. NULL
```

**Excepción importante:** `precio_usd` → Enrichment gana si hizo conversión BOB→USD o detectó TC paralelo. Discovery gana si la moneda original es USD y la discrepancia es ≤10%.

**Campos adicionales del merge ventas:**
- `score_calidad_dato` (0-100, completitud)
- `score_fiduciario` (0-100, coherencia — penaliza anomalías precio/m²)
- `flags_semanticos` (warnings/errors)
- `discrepancias_detectadas` (discovery vs enrichment)
- TC paralelo Binance P2P

**`nombre_edificio` en merge:** La regla dice "Discovery > Enrichment" PERO Discovery JSON NUNCA tiene `nombre_edificio` (las APIs no lo retornan). En la práctica, Enrichment siempre gana — la regla de prioridad es código muerto para este campo.

### 2.4 Matching — 4 métodos en cascada

| Método | Confianza | Requisito |
|--------|-----------|-----------|
| Exact name match | 95% | `nombre_edificio` exacto o alias en `proyectos_master` |
| URL slug match (solo C21) | 85-90% | Slug contiene nombre proyecto |
| Fuzzy word intersection | 75-90% | `nombre_edificio` tokenizado, similarity >= 70%, misma zona |
| GPS proximity | 60-85% | `gps_verificado_google=TRUE` en proyecto, < 250m, misma zona |

**Auto-aprobación:** score >= 85% → aprobado sin revisión humana.

### 2.5 Puntos débiles del pipeline actual de ventas

1. **`nombre_edificio` es 100% regex** — Sin LLM, la extracción depende de patrones rígidos. Si el listing no dice "Edificio X" o "Torre X" literalmente, se pierde.
2. **Blacklist demasiado agresiva** — Términos como `'venta'` pueden rechazar nombres legítimos (ej: "Conventura").
3. **Remax tiene solo 3 patrones** — Si el agente no puso "edificio" o "proyecto" en título/descripción, no hay forma de extraer el nombre.
4. **Sin `descripcion_limpia`** — Ventas NO genera una descripción limpia por LLM. Se queda con el HTML/markdown crudo.
5. **Sin `amenities_confirmados` por LLM** — Depende de checkboxes HTML que no siempre existen (especialmente en Remax).
6. **Sin `equipamiento_detectado` por LLM** — Mismo problema que amenities.
7. **TC paralelo es complejo** — Pipeline de BOB→USD con detección de TC paralelo/oficial es frágil y caro de mantener.
8. **Sin validación de rangos en enrichment** — El extractor regex no valida rangos (el LLM de alquileres sí: 0-6 dorms, 15-500 m², etc.).
9. **Merge "Discovery > Enrichment" para área/dorms es contraproducente** — La API a veces retorna datos incorrectos que el HTML tiene bien.

---

## 3. Tabla Comparativa Campo por Campo

### 3.1 Campos compartidos

| Campo | Alquileres | Ventas | Mejor fuente | Notas |
|-------|------------|--------|--------------|-------|
| `area_total_m2` | LLM refina (enrichment-first) | API gana (discovery-first) | **Alquileres** | LLM detecta mejor del HTML que la API |
| `dormitorios` | LLM refina | API gana | **Alquileres** | LLM valida 0-6, API no valida |
| `banos` | LLM refina | API gana | **Empate** | API suele ser correcta aquí |
| `estacionamientos` | LLM refina | Regex extrae | **Alquileres** | LLM más robusto que regex |
| `baulera` | LLM extrae (boolean) | Columna existe pero solo HITL | **Alquileres** | Ventas no la llena automáticamente |
| `piso` | LLM extrae | No se extrae | **Alquileres** | Ventas no tiene este campo en pipeline |
| `nombre_edificio` | LLM extrae | Regex cascada 4 prioridades | **Alquileres** | LLM entiende contexto, regex es rígido |
| `amenities` | LLM `amenities_confirmados[]` | Regex checkboxes HTML | **Alquileres** | LLM extrae de texto libre + checkboxes |
| `equipamiento` | LLM `equipamiento_detectado[]` | Regex checkboxes HTML | **Alquileres** | LLM detecta "cocina equipada" en descripción |
| `descripcion_limpia` | LLM genera | No existe | **Alquileres** | Ventas solo tiene descripción cruda |
| `agente_nombre` | LLM + directo HTML | Regex HTML | **Empate** | Ambos usan extracción directa |
| `agente_telefono` | LLM + directo HTML | Regex HTML | **Empate** | |
| `fotos_urls` | Directo HTML (no LLM) | Regex HTML | **Empate** | Ambos extraen directo |
| `latitud/longitud` | API + PostGIS trigger | API + HTML meta tags | **Empate** | |
| `zona/microzona` | PostGIS trigger | PostGIS trigger | **Empate** | |

### 3.2 Campos exclusivos de alquileres

| Campo | Existe en ventas? | Necesario para ventas? |
|-------|-------------------|----------------------|
| `precio_mensual_bob/usd` | No (usa `precio_usd`) | No |
| `monto_expensas_bob` | `parqueo_precio_adicional` similar | Parcial — podría mapearse a gastos comunes |
| `deposito_meses` | No | No |
| `contrato_minimo_meses` | No | No |
| `amoblado` | No | No (irrelevante en venta) |
| `acepta_mascotas` | No | No |
| `servicios_incluidos` | No | No |

### 3.3 Campos exclusivos de ventas

| Campo | Existe en alquileres? | Fuente actual | Podría mejorar con LLM? |
|-------|----------------------|---------------|------------------------|
| `precio_usd` | Sí pero como referencia | API + regex + TC | Sí — LLM puede detectar precio + moneda + TC |
| `precio_min/max_usd` | No | Regex multiproyecto | Sí — LLM entiende rangos "desde X hasta Y" |
| `estado_construccion` | No | Regex en descripción | **Sí** — LLM clasificaría mejor |
| `fecha_entrega_estimada` | No | Regex en descripción | **Sí** — LLM entiende "entrega 2027", "inmediata" |
| `porcentaje_avance` | No | Regex en descripción | Sí — pero raro en texto |
| `es_multiproyecto` | No | Regex (detectar rangos) | **Sí** — LLM entiende "tipologías desde..." |
| `tipo_cambio_detectado` | No (fijo 6.96) | Regex en descripción | **Sí** — LLM entiende "precio al tipo de cambio paralelo" |
| `score_fiduciario` | No | Calculado en merge | N/A (computed) |
| `plan_pagos_desarrollador` | No | Manual (HITL) | **Sí** — LLM puede detectar "financiamiento directo" |
| `acepta_permuta` | No | Manual | Parcial — LLM podría detectar "aceptamos vehículo" |
| `solo_tc_paralelo` | No | Manual | **Sí** — LLM puede detectar en descripción |
| `precio_negociable` | No | Manual | Sí — LLM detecta "precio negociable" |
| `descuento_contado_pct` | No | Manual | **Sí** — LLM detecta "10% descuento contado" |
| `parqueo_incluido` | No | Manual | **Sí** — LLM detecta "incluye parqueo" |
| `parqueo_precio_adicional` | No | Manual | **Sí** — LLM detecta "parqueo $5,000 adicional" |
| `baulera_incluido` | No | Manual | **Sí** — LLM detecta "incluye baulera" |
| `dormitorios_opciones` | No | Regex | Sí — LLM entiende "1, 2 o 3 dormitorios" |

---

## 4. Propuesta: Pipeline Ventas v2 (LLM-enhanced)

### 4.1 Cambio arquitectónico central

```
ACTUAL:   Discovery (API) → Enrichment (REGEX) → Merge (discovery-first) → Matching
PROPUESTO: Discovery (API) → Enrichment (REGEX + LLM) → Merge (enrichment-first) → Matching
```

**El cambio clave:** Agregar un paso LLM después del extractor regex actual, que reciba el contenido HTML + los datos ya extraídos, y genere campos que el regex no puede.

### 4.2 Flujo propuesto detallado

```
1:00 AM  Discovery C21 + Remax → registrar_discovery() [SIN CAMBIOS]
2:00 AM  Enrichment Fase 1: Regex (C21 v16.5 / Remax v1.9) [SIN CAMBIOS]
2:15 AM  Enrichment Fase 2: LLM Enhancement [NUEVO]
3:00 AM  Merge → enrichment-first [CAMBIAR prioridad]
4:00 AM  Matching [SIN CAMBIOS]
```

### 4.3 Enrichment LLM para Ventas — Prompt propuesto

**Modelo:** Claude Haiku 4.5 (`temperature: 0`, `max_tokens: 1500`)

El prompt recibe los datos ya extraídos por regex como contexto (para que el LLM no tenga que re-extraer lo que ya funciona bien):

```
Eres un extractor de datos inmobiliarios para Bolivia.
Extraes datos de páginas web de propiedades en VENTA.
NUNCA inventes datos. Si no aparece en el texto, usa null.

DATOS YA EXTRAÍDOS (del extractor regex):
- URL: {url}
- Fuente: {fuente}
- Precio: ${precio_usd} USD (moneda original: {moneda_original})
- Área: {area_total_m2} m²
- Dormitorios: {dormitorios}
- Baños: {banos}
- Estacionamientos: {estacionamientos}
- Nombre edificio (regex): {nombre_edificio_regex}  ← confianza: {nivel_confianza}
- Estado construcción (regex): {estado_construccion}
- Zona: {zona}

PROYECTOS CONOCIDOS EN ESTA ZONA:
{lista_proyectos_zona}  ← nombres oficiales de proyectos_master filtrados por zona

TEXTO DE LA PÁGINA:
{contenido}

Devuelve SOLO este JSON:
{
  "nombre_edificio": string | null,
  "nombre_edificio_confianza": "alta" | "media" | "baja" | null,
  "estado_construccion": "entrega_inmediata" | "preventa" | "construccion"
                       | "planos" | "usado" | "nuevo_a_estrenar" | null,
  "fecha_entrega_estimada": string | null,
  "es_multiproyecto": boolean | null,
  "precio_usd": number | null,
  "moneda_detectada": "USD" | "BOB" | null,
  "tipo_cambio_mencionado": "paralelo" | "oficial" | null,
  "precio_min_usd": number | null,
  "precio_max_usd": number | null,
  "dormitorios_opciones": string | null,
  "area_total_m2": number | null,
  "dormitorios": number | null,
  "banos": number | null,
  "estacionamientos": number | null,
  "baulera": boolean | null,
  "piso": number | null,
  "parqueo_incluido": boolean | null,
  "parqueo_precio_adicional_usd": number | null,
  "baulera_incluida": boolean | null,
  "plan_pagos_detectado": boolean | null,
  "descuento_contado_pct": number | null,
  "acepta_permuta": boolean | null,
  "precio_negociable": boolean | null,
  "solo_tc_paralelo": boolean | null,
  "descripcion_limpia": string | null,
  "amenities_confirmados": string[] | null,
  "equipamiento_detectado": string[] | null,
  "agente_nombre": string | null,
  "agente_telefono": string | null,
  "agente_oficina": string | null
}
```

### 4.4 Innovación clave: inyectar `proyectos_master` en el prompt

**Problema actual:** El regex intenta extraer `nombre_edificio` del texto y DESPUÉS lo matchea contra `proyectos_master`. Si el regex no encuentra nada, el matching solo tiene GPS.

**Solución:** Darle al LLM la lista de proyectos conocidos en la zona como contexto. El LLM puede:
- Reconocer variantes ("Mirador del Norte" → "Torre Mirador Norte")
- Detectar nombres parciales ("vivir en el Mirador" → match con "Torre Mirador")
- Entender contexto ("a pasos del proyecto X" ≠ "departamento EN el proyecto X")
- Resolver ambigüedades que el regex no puede

**Implementación:** Al inicio del workflow, query `SELECT nombre_oficial, alias_conocidos FROM proyectos_master WHERE zona = {zona} AND activo = TRUE`. Inyectar como lista en el prompt. Con ~50 proyectos por zona, esto agrega ~500 tokens al prompt — insignificante.

### 4.5 Campos nuevos que el LLM debería extraer (vs solo regex)

| Campo | Hoy | Con LLM v2 | Impacto |
|-------|-----|-----------|---------|
| `nombre_edificio` | Regex (60-95% confianza) | LLM con contexto de `proyectos_master` | **Alto** — mejora matching rate directamente |
| `estado_construccion` | Regex ("entrega inmediata" literal) | LLM entiende "listo para mudarse", "a estrenar" | **Alto** — mejora filtros de mercado |
| `fecha_entrega_estimada` | Regex (patrones fijos) | LLM entiende "segundo semestre 2027" | **Medio** |
| `es_multiproyecto` | Regex (detecta rangos) | LLM entiende "tipologías disponibles" | **Medio** |
| `tipo_cambio_mencionado` | Regex en descripción | LLM entiende "precio blue", "dólar libre" | **Alto** — afecta precio final |
| `plan_pagos_detectado` | Manual (HITL) | LLM detecta "financiamos hasta 36 meses" | **Alto** — automatiza HITL |
| `descuento_contado_pct` | Manual | LLM detecta "10% off contado" | **Medio** |
| `parqueo_incluido` | Manual | LLM detecta "incluye 1 parqueo" | **Medio** |
| `descripcion_limpia` | No existe | LLM genera resumen sin marketing | **Alto** — mejora UX Simón |
| `amenities_confirmados` | Regex checkboxes | LLM + checkboxes | **Medio** — extrae de texto libre |
| `equipamiento_detectado` | Regex checkboxes | LLM + checkboxes | **Medio** |
| `piso` | No se extrae | LLM detecta "piso 12", "planta baja" | **Bajo** |
| `baulera` | No se extrae auto | LLM detecta "incluye baulera" | **Bajo** |

### 4.6 Merge v2 — Cambiar a enrichment-first (como alquileres)

**Justificación:** Para la mayoría de campos, el LLM + regex combinados producen datos más confiables que la API sola. Discovery sigue siendo la fuente primaria para GPS (más confiable en APIs) y `fecha_publicacion`.

| Campo | Prioridad actual | Prioridad v2 | Razón |
|-------|-----------------|--------------|-------|
| `area_total_m2` | Discovery > Enrichment | **Enrichment > Discovery** | LLM valida rangos, API a veces miente |
| `dormitorios` | Discovery > Enrichment | **Enrichment > Discovery** | LLM valida 0-6 |
| `banos` | Discovery > Enrichment | **Enrichment > Discovery** | Consistencia |
| `estacionamientos` | Discovery > Enrichment | **Enrichment > Discovery** | LLM más robusto |
| `nombre_edificio` | Discovery > Enrichment (pero discovery siempre NULL) | **Enrichment** (eliminar dead code) | Ya es así en la práctica |
| `precio_usd` | Complejo (depende TC) | **Enrichment** si detectó moneda/TC; **Discovery** si USD puro | Simplifica lógica TC |
| `latitud/longitud` | Discovery > Enrichment | **Discovery > Enrichment** | API GPS es más preciso |
| `fecha_publicacion` | Discovery > Enrichment | **Discovery > Enrichment** | API es fuente |
| `zona` | PostGIS trigger | **Sin cambio** | PostGIS es source of truth |

### 4.7 Validación post-LLM para ventas

| Campo | Rango válido | Si falla |
|-------|-------------|----------|
| `precio_usd` | `> 5,000` AND `< 2,000,000` | → null |
| `area_total_m2` | `>= 20` AND `<= 1,000` | → null |
| `dormitorios` | `>= 0` AND `<= 6` | → null |
| `banos` | `>= 0` AND `<= 8` | → null |
| `estacionamientos` | `>= 0` AND `<= 5` | → null |
| `piso` | `>= -2` AND `<= 40` | → null |
| `descuento_contado_pct` | `> 0` AND `<= 30` | → null |
| `parqueo_precio_adicional_usd` | `> 0` AND `< 50,000` | → null |
| Más de 3 errores | — | `requiere_revision = true` |

### 4.8 Costo estimado

| Concepto | Alquileres actual | Ventas v2 propuesto |
|----------|-------------------|---------------------|
| Modelo | Haiku 4.5 | Haiku 4.5 |
| Props/noche | ~20 | ~40-50 (más volumen) |
| Input tokens/prop | ~1,200 (3000 chars) | ~1,800 (3000 chars + lista proyectos) |
| Output tokens/prop | ~400 | ~600 (más campos) |
| Costo/prop | ~$0.0004 | ~$0.0006 |
| Costo/noche | ~$0.008 | ~$0.03 |
| Costo/mes | ~$0.24 | ~$0.90 |

**Conclusión:** El costo es despreciable (~$1/mes) para una mejora significativa en matching rate y calidad de datos.

### 4.9 Lo que NO cambia

- **Discovery:** Idéntico. APIs de C21 y Remax siguen siendo la primera captura.
- **Extractor regex:** Se mantiene como Fase 1 del enrichment. El LLM es Fase 2 complementaria.
- **Matching:** Los 4 métodos siguen igual, pero con mejores inputs (`nombre_edificio` del LLM).
- **`registrar_enrichment()`:** Se extiende para aceptar los campos nuevos del LLM.
- **`campos_bloqueados`:** Sigue siendo prioridad máxima en todo el pipeline.

### 4.10 Resumen de impacto esperado

| Métrica | Actual | Esperado con v2 | Cómo |
|---------|--------|-----------------|------|
| Matching rate | ~75% (estimado) | ~88-92% | LLM + proyectos_master en prompt |
| `nombre_edificio` fill rate | ~50% | ~80% | LLM entiende variantes |
| `estado_construccion` accuracy | ~60% (regex rígido) | ~90% | LLM clasifica lenguaje natural |
| `descripcion_limpia` coverage | 0% | ~95% | LLM genera para todas |
| Campos forma de pago automated | 0% (solo HITL) | ~40-60% | LLM detecta en descripciones |
| Costo adicional/mes | $0 | ~$0.90 | Haiku 4.5 es baratísimo |

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| LLM alucina nombre_edificio | Validar contra `proyectos_master` post-LLM (si no matchea, marcar confianza "baja") |
| LLM más lento que regex puro | Fase 2 es aditiva; si falla/timeout, Fase 1 (regex) ya escribió lo que pudo |
| Conflicto regex vs LLM en mismo campo | Regla simple: si regex tiene confianza >= 0.90, mantener regex. Si < 0.90, LLM gana |
| Cambio de merge priority rompe scoring | Recalibrar `score_fiduciario` tras migración (one-time) |
| LLM no disponible una noche | Graceful degradation: pipeline actual sigue funcionando sin Fase 2 |
