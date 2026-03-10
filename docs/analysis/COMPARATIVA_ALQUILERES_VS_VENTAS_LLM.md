# Comparativa LLM Enrichment: Alquileres vs Ventas

> Fecha: 2026-03-10 | Alquileres: producción desde Feb 2026 | Ventas: v3.2 (test, no en producción)

---

## 1. Fuentes de data y campos extraídos

### Alquileres (producción)

| Fuente | Método extracción contenido | Fotos | Agente |
|--------|----------------------------|-------|--------|
| Remax | `data-page` JSON del HTML | `multimedias[].large_url` | `listing.agent` |
| Century21 | Firecrawl markdown (3000 chars) | Firecrawl | LLM extrae del texto |
| Bien Inmuebles | Markdown (3000 chars) | Regex `uploads/catalogo/pics/` | Regex `agent-sides_2` HTML |

**Campos LLM (21):**
`precio_mensual_bob`, `precio_mensual_usd`, `expensas_bs`, `deposito_meses`, `contrato_minimo_meses`, `area_total_m2`, `dormitorios`, `banos`, `estacionamientos`, `piso`, `baulera`, `amoblado`, `acepta_mascotas`, `servicios_incluidos`, `nombre_edificio`, `descripcion_limpia`, `amenities_confirmados`, `equipamiento_detectado`, `agente_nombre`, `agente_telefono`, `agente_oficina`

### Ventas (test v3.2)

| Fuente | Método extracción contenido | Fotos | Agente |
|--------|----------------------------|-------|--------|
| Remax | `datos_json_enrichment.descripcion` | No extrae | No extrae |
| Century21 | `datos_json_enrichment.descripcion` | No extrae | No extrae |

**Campos LLM (15 + plan_pagos anidado):**
`nombre_edificio`, `estado_construccion`, `tipo_cambio_detectado`, `piso`, `parqueo_incluido`, `parqueo_precio_adicional_usd`, `baulera_incluida`, `baulera_precio_adicional_usd`, `fecha_entrega_estimada`, `es_multiproyecto`, `plan_pagos.*` (6 subcampos), `descripcion_limpia`, `amenities_confirmados`, `equipamiento_detectado`

### Diferencias clave

| Aspecto | Alquileres | Ventas | Nota |
|---------|-----------|--------|------|
| **Precio** | LLM extrae precio BOB/USD | No extrae precio | Ventas: regex robusto, riesgo LLM alto |
| **Área/dorms/baños** | LLM extrae | No extrae | Ventas: discovery es fuente de verdad |
| **Agente** | LLM + data-page merge | No extrae | Ventas: agente viene de discovery directo |
| **Fotos** | Extracción directa HTML | No extrae | Ventas: fotos ya las maneja discovery |
| **Tipo cambio** | No aplica (BOB fijo 6.96) | LLM detecta paralelo/oficial | Ventas necesita TC, alquileres no |
| **Estado construcción** | No extrae | LLM clasifica 5 categorías | Solo relevante para ventas |
| **Plan de pagos** | No aplica | LLM extrae 6 subcampos | Solo relevante para ventas |
| **Proyectos master** | No inyecta lista | Inyecta ~50 proyectos/zona | Ventas matchea nombre_edificio |

---

## 1b. Extracción multi-fuente (detalle por portal)

### Alquileres: arquitectura híbrida (extracción directa + LLM)

El enrichment de alquileres NO pasa todo al LLM. Primero extrae campos estructurados directamente del HTML/API, y solo pasa al LLM lo que requiere comprensión semántica. Esto es un patrón de **extracción en dos fases**.

#### Fase 1: Firecrawl scrape (todas las fuentes)

Todas las URLs pasan por Firecrawl que devuelve `{ markdown, rawHtml }`. Luego el nodo "Construir Prompt" hace extracción per-source:

#### Remax — data-page JSON (extracción directa)

```javascript
// Del HTML: <script data-page="...encoded JSON...">
const match = html.match(/data-page=\"([^\"]*?)\"/i);
const data = JSON.parse(unescape(match[1]));
const listing = data.props.listing;
```

| Campo | Fuente | Método |
|-------|--------|--------|
| `agente_nombre` | `listing.agent.user.name_to_show` | Directo del JSON |
| `agente_telefono` | `listing.agent.user.phone_number` | Directo del JSON |
| `agente_oficina` | `listing.agent.office.name` | Directo del JSON |
| `fotos_urls[]` | `listing.multimedias[].large_url` | Directo del JSON |
| `titulo` | `listing.title` | Directo del JSON |
| `descripcion` | `listing.description_website` | Directo del JSON |

**Contenido al LLM**: `"TÍTULO: {titulo}\n\nDESCRIPCIÓN:\n{descripcion}"` (max 3000 chars)

El LLM de Remax recibe texto limpio extraído del JSON, no markdown de Firecrawl. Es más limpio y predecible.

#### Century21 — Firecrawl markdown (LLM hace todo)

```javascript
contenido = markdown.substring(0, 3000);
// NO hay extracción directa de agente ni fotos
```

| Campo | Fuente | Método |
|-------|--------|--------|
| `agente_nombre` | Texto del markdown | LLM extrae |
| `agente_telefono` | Texto del markdown | LLM extrae |
| `fotos_urls[]` | Firecrawl (discovery) | Ya extraídas en discovery |
| Todo lo demás | Texto del markdown | LLM extrae |

**Contenido al LLM**: markdown crudo de Firecrawl (max 3000 chars). C21 es la fuente que más depende del LLM.

#### Bien Inmuebles — regex HTML (extracción directa)

```javascript
// Fotos: regex del HTML crudo
const fotoMatches = html.match(/uploads\/catalogo\/pics\/[^\"'\s)]+/g);
fotosUnicas = [...new Set(fotoMatches)]
  .map(f => 'https://www.bieninmuebles.com.bo/admin/' + f);

// Ordenar: nomb_img (foto principal) primero
fotosUnicas.sort((a, b) => (a.includes(nomb_img) ? -1 : b.includes(nomb_img) ? 1 : 0));

// Agente: regex de la sección agent-sides_2
const seccion = html.match(/agent-sides_2[\s\S]*?<\/div>/i)[0];
agente_nombre = seccion.match(/<h4>([^<]+)<\/h4>/i)[1];
agente_telefono = '+591' + seccion.match(/[67]\d{7}/)[0];
```

| Campo | Fuente | Método |
|-------|--------|--------|
| `agente_nombre` | HTML `agent-sides_2 > h4` | Regex directo |
| `agente_telefono` | HTML `agent-sides_2`, patrón `[67]\d{7}` | Regex directo |
| `agente_oficina` | Hardcodeado `'Bien Inmuebles'` | Constante |
| `fotos_urls[]` | HTML `uploads/catalogo/pics/*` | Regex directo |
| `nomb_img` (foto principal) | `datos_json_discovery.nomb_img` | Discovery API |

**Contenido al LLM**: markdown de Firecrawl (max 3000 chars). Pero agente y fotos ya fueron extraídos sin LLM.

#### Fase 2: Merge post-LLM (prioridad directo > LLM)

Después de que el LLM responde, el nodo "Parsear y Validar" fusiona:

```javascript
// Agente: directo tiene prioridad sobre LLM
agente_final = {
  nombre:  agente_directo?.nombre  || datos_llm.agente_nombre,
  telefono: agente_directo?.telefono || datos_llm.agente_telefono,
  oficina:  agente_directo?.oficina  || datos_llm.agente_oficina
};

// Fotos: directas reemplazan las del LLM
if (fotos_extraidas?.length > 0) {
  datos_llm.fotos_urls = fotos_extraidas;
}
```

**Cadena de prioridad para agente:**
1. data-page JSON (Remax) o regex HTML (BI) → **directo, más confiable**
2. LLM (C21 o fallback) → **solo si directo no encontró**

**Cadena de prioridad para fotos:**
1. data-page JSON (Remax) o regex HTML (BI) → **directo, reemplaza LLM**
2. Discovery (Firecrawl) → **fallback si enrichment no encontró**

### Ventas: fuente única (solo descripción)

Ventas NO tiene extracción multi-fuente. El script `enrich-ventas-llm.js` lee:

```javascript
// fetchProperties() query:
SELECT ..., datos_json_enrichment FROM propiedades_v2

// buildPrompt() usa:
const contenido = prop.datos_json_enrichment?.descripcion
  || prop.datos_json_enrichment?.scrape?.markdown
  || '';
```

| Campo | Fuente | Método |
|-------|--------|--------|
| Descripción | `datos_json_enrichment.descripcion` | Texto del n8n extractor |
| Agente | No se extrae | Ya viene de discovery |
| Fotos | No se extraen | Ya vienen de discovery |
| Datos físicos | Columnas directas de `propiedades_v2` | Discovery + regex |

**No hay:**
- Parsing de `data-page` para Remax
- Regex de HTML para ninguna fuente
- Diferenciación por portal del contenido enviado al LLM
- Extracción directa pre-LLM de ningún campo

### Qué de esto ventas NO está usando

| Feature alquileres | Estado en ventas | Vale la pena? |
|--------------------|-----------------|---------------|
| **data-page Remax** (agente, fotos, título, descripción limpia) | No usa. Lee `datos_json_enrichment.descripcion` | **No prioritario** — ventas ya tiene agente y fotos de discovery. El título limpio de data-page podría mejorar matching de nombre_edificio, pero el gain es marginal. |
| **Contenido diferenciado por fuente** (data-page vs markdown) | No diferencia. Una sola fuente de texto. | **Sí vale** — Remax con data-page da texto más limpio al LLM. Pero requiere acceso al rawHtml en el paso de LLM, que hoy no tiene. |
| **Regex HTML para BI** (fotos, agente) | No aplica — ventas no tiene Bien Inmuebles | N/A |
| **Merge directo > LLM** para agente/fotos | No aplica — ventas no extrae agente/fotos por LLM | N/A |
| **Firecrawl en enrichment** (scrape fresh del HTML) | Ventas usa texto pre-scrapeado guardado en `datos_json_enrichment` | **Podría mejorar** — el texto guardado puede estar truncado o desactualizado. Pero Firecrawl agrega latencia y costo. |

### Conclusión extracción multi-fuente

La ventaja principal de alquileres es que **extrae agente y fotos sin LLM** (más barato, más confiable). Pero ventas no necesita esto porque discovery ya maneja agente y fotos.

La ventaja real que ventas podría adoptar es **contenido diferenciado por fuente**: usar data-page JSON para Remax (texto más limpio) en vez del markdown genérico. Esto requiere acceso al `rawHtml` en el paso de LLM, que hoy no está disponible porque el script lee de `datos_json_enrichment.descripcion` (ya procesado por el extractor regex). Sería un cambio en el flujo n8n, no en el script LLM standalone.

---

## 2. Construcción del prompt

### Alquileres

```
Contexto inyectado:
- URL, fuente, zona
- Precio discovery (si existe)
- Área, dormitorios, baños (si existen)

Contenido: markdown/data-page (max 3000 chars)

Sin lista de proyectos.
Sin valores actuales de BD.
```

### Ventas

```
Contexto inyectado:
- URL, fuente, zona
- Precio USD, moneda original
- Área, dormitorios, baños
- Nombre edificio (regex)
- Estado construcción (regex)

Lista de proyectos_master en la zona (~50 entries)

Contenido: datos_json_enrichment.descripcion (max 3000 chars)
```

### Qué hace alquileres que ventas NO hace

1. **Extracción multi-fuente**: Remax usa `data-page` (JSON estructurado), C21 usa Firecrawl markdown, BI usa regex HTML. Ventas solo lee `datos_json_enrichment.descripcion` sin diferenciar por fuente.

2. **Fotos + agente en el mismo paso**: Alquileres extrae fotos y datos de agente en el nodo de enrichment (antes del LLM), los inyecta al output. Ventas no extrae ni fotos ni agente.

3. **Agente merge con prioridad**: data-page (Remax) > LLM > null. El LLM es fallback para cuando data-page no tiene agente.

### Qué hace ventas mejor que alquileres

1. **Inyección de proyectos_master**: La lista de proyectos conocidos permite matching semántico (ej: "Edif Nomad" → "Nomad by Smart Studio"). Alquileres no tiene este contexto.

2. **Instrucciones por campo detalladas**: Ventas tiene instrucciones extensas con señales positivas/negativas, CUIDADOs, y reglas CLAVE. Alquileres tiene un prompt más genérico.

3. **Campos de confianza**: Ventas devuelve `*_confianza: alta|media|baja` para nombre_edificio, estado_construccion, tipo_cambio. Permite filtrar en merge. Alquileres no tiene confianza.

4. **Defaults alineados con BD**: Ventas usa DEFAULT false para booleanos (alineado con pipeline). Alquileres usa null (lo que causó problemas de no_detecta en V1 de ventas).

---

## 3. Validación post-LLM

### Alquileres

| Campo | Rango | Si falla |
|-------|-------|----------|
| precio_mensual_bob | 0 < x < 50,000 | → null |
| area_total_m2 | 15 ≤ x ≤ 500 | → null |
| dormitorios | 0 ≤ x ≤ 6 | → null |
| baños | 0 ≤ x ≤ 6 | → null |
| expensas_bs | < precio_mensual | → null |
| >2 errores | — | requiere_revision = true |

JSON parsing: busca en ```json blocks``` primero, luego primer `{...}`.

### Ventas

| Campo | Rango | Si falla |
|-------|-------|----------|
| piso | -2 a 40 | → null |
| parqueo_precio_adicional | 0 a 50,000 | → null |
| baulera_precio_adicional | 0 a 20,000 | → null |
| descuento_contado_pct | 0 a 30 | → null |
| estado_construccion | enum only | → null |
| tipo_cambio_detectado | enum only | → "no_especificado" |
| >3 errores | — | requiere_revision = true |

JSON parsing: mismo patrón (```json``` o primer `{...}`).

### Qué vale la pena portar

**De alquileres a ventas:**
- Validación de `expensas < precio` → equivalente: `parqueo_precio < precio_usd` (no implementado)
- Threshold de errores más bajo (2 vs 3) — ventas debería usar 2 también

**De ventas a alquileres:**
- Campos de confianza (`*_confianza`) — permitiría merge más inteligente
- Defaults booleanos alineados con BD (false, no null) — evitaría falsos no_detecta si alquileres hace tests

---

## 4. Amenities y equipamiento

### Alquileres

- LLM extrae `amenities_confirmados[]` y `equipamiento_detectado[]`
- **Merge SÍ los consume**: copia a `datos_json.amenities_confirmados` y `datos_json.equipamiento_detectado`
- Query layer (`buscar_unidades_alquiler`) los lee desde `datos_json`
- NO escribe a columnas directas `amenidades_edificio`/`equipamiento_interior`
- Prioridad en query: `datos_json.amenities.lista` (manual) > `proyectos_master.amenidades` > null

### Ventas

- LLM extrae los mismos arrays
- **Merge NO los consume** — quedan en `datos_json_enrichment.llm_output` sin usar
- Opción B: solo lectura, fase posterior
- Prerequisito para activar: >90% match con correcciones manuales

### Diferencia crítica

Alquileres ya integra amenities en el flujo (merge → datos_json → query layer). Ventas no. La razón: ventas tiene correcciones manuales acumuladas (auditoría, candados, trigger `proteger_amenities`) que alquileres no tiene aún.

### Qué vale la pena portar

**De alquileres a ventas (futuro):**
- Patrón de merge: copiar a `datos_json.amenities_confirmados` (no a columna directa)
- Query layer: cascade `datos_json.amenities` > `proyectos_master.amenidades` > null
- Solo cuando se valide >90% match con correcciones humanas

**De ventas a alquileres:**
- Nada. Alquileres ya tiene esto resuelto.

---

## 5. Tipo de cambio y moneda

### Alquileres

- **Sin TC paralelo**. Precios fijos en BOB.
- Conversión: `precio_usd = precio_bob / 6.96` (divisor hardcodeado)
- LLM extrae `precio_mensual_bob` y `precio_mensual_usd` directamente
- No existe `tipo_cambio_detectado` ni `depende_de_tc` para alquileres

### Ventas

- **TC paralelo es crítico**. Binance P2P actualiza diariamente.
- `tipo_cambio_detectado`: paralelo/oficial/no_especificado (LLM extrae)
- `depende_de_tc`: determinístico desde `moneda_original` (merge calcula)
- `precio_normalizado()`: combina ambos campos para precio comparable
- `solo_tc_paralelo`: indica si vendedor exige exclusivamente USD/paralelo

### Diferencia fundamental

Alquileres opera en un mercado de moneda única (BOB). Ventas opera en un mercado de doble moneda donde el TC paralelo puede diferir 30-50% del oficial. Esto genera complejidad que alquileres no tiene:

| Complejidad | Alquileres | Ventas |
|-------------|-----------|--------|
| Precio base | BOB directo | USD, pero ¿a qué TC? |
| Normalización | ÷ 6.96 | `precio_normalizado()` |
| Señales en texto | No aplica | "solo dólares", "TC 7", "blue", "USDT" |
| Campos relacionados | 0 | 3 (`tipo_cambio`, `depende_de_tc`, `solo_tc_paralelo`) |

### Qué vale la pena portar

Nada en ninguna dirección — son dominios completamente distintos.

---

## 6. Merge y flujo de producción

### Alquileres (producción)

```
Discovery → Enrichment (LLM + fotos + agente) → Merge → Matching
                                                   ↓
                                          ENRICHMENT-FIRST
                                          (LLM > discovery para la mayoría)
```

- `registrar_enrichment_alquiler()`: escribe output LLM a columnas directas + `datos_json_enrichment.llm_output`
- `merge_alquiler()`: prioridad enrichment-first. Candados > enrichment > discovery > null
- Status final: `completado` si tiene precio + área + dorms

### Ventas (solo test, sin producción)

```
Discovery → Enrichment (regex) → Merge → Matching
                                    ↓
                            DISCOVERY-FIRST
                            (discovery > enrichment para campos físicos)

[Futuro: Discovery → Enrichment (regex) → LLM Enrichment → Merge → Matching]
```

- `merge_discovery_enrichment_v2()`: prioridad discovery-first para campos físicos
- LLM enrichment NO está integrado al merge aún
- Plan: LLM > regex para campos seleccionados, NUNCA para precio/área/dorms/GPS

### Diferencia de prioridad

| Prioridad | Alquileres | Ventas |
|-----------|-----------|--------|
| 1° | Campos bloqueados | Campos bloqueados |
| 2° | Enrichment (LLM) | Discovery |
| 3° | Discovery | Enrichment (regex) |
| 4° | null | LLM (futuro, campos específicos) |

La razón: en alquileres, el LLM enriquece significativamente sobre discovery (precio, agente, amenities). En ventas, discovery ya trae datos robustos para campos físicos y el LLM complementa con campos que el regex no puede extraer.

---

## 7. Resumen: qué portar en cada dirección

### De alquileres → ventas (recomendado)

| Feature | Prioridad | Esfuerzo | Impacto |
|---------|-----------|----------|---------|
| Merge consume `amenities_confirmados` en `datos_json` | Baja | Medio | Bajo (requiere validación previa) |
| Threshold errores = 2 (no 3) | Alta | Trivial | Medio (más estricto) |
| Fotos + agente en enrichment | Baja | Alto | Bajo (ventas ya tiene esto en discovery) |

### De ventas → alquileres (recomendado)

| Feature | Prioridad | Esfuerzo | Impacto |
|---------|-----------|----------|---------|
| Campos de confianza (`*_confianza`) | Media | Medio | Alto (merge más inteligente) |
| Defaults booleanos = false (no null) | Alta | Bajo | Alto (evita falsos negativos) |
| Instrucciones por campo detalladas con CUIDADOs | Media | Bajo | Medio (menos errores edge) |
| Inyección de proyectos_master para nombre_edificio | Media | Medio | Alto (matching semántico) |

### No portar (dominios distintos)

- TC paralelo / `tipo_cambio_detectado` → solo ventas
- `estado_construccion` / `fecha_entrega_estimada` → solo ventas
- `plan_pagos.*` → solo ventas
- `expensas_bs` / `deposito_meses` / `contrato_minimo_meses` → solo alquileres
- `amoblado` / `acepta_mascotas` / `servicios_incluidos` → solo alquileres
- Extracción de precio por LLM → solo alquileres (ventas usa regex)

---

## 8. Conclusión

Alquileres tiene un pipeline LLM maduro y en producción que ventas puede usar como referencia arquitectónica, pero los campos y la lógica de negocio son fundamentalmente distintos. Las oportunidades de cross-pollination más valiosas son:

1. **Defaults booleanos** (ventas → alquileres): evita 98% de falsos no_detecta
2. **Campos de confianza** (ventas → alquileres): permite merge selectivo por confianza
3. **Proyectos_master en prompt** (ventas → alquileres): matching semántico de nombre_edificio
4. **Threshold de errores más bajo** (alquileres → ventas): 2 errores, no 3

El patrón de producción de alquileres (n8n node → Anthropic API → parse/validate → registrar_enrichment → merge) es exactamente lo que ventas debe replicar en Fase 2 del plan de activación.
