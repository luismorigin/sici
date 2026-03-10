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
