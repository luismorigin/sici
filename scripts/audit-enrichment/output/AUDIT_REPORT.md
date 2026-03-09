# Auditoría Enrichment LLM — 9 Mar 2026

## Metodología

Análisis SQL de 329 propiedades de venta completadas (sin duplicados). Para cada propiedad se compararon los valores actuales en BD contra lo extraíble de la descripción usando regex sobre keywords. Se respetaron candados (`campos_bloqueados`).

Campos auditados: `nombre_edificio`, `estado_construccion`, `parqueo_incluido`, `tipo_cambio_detectado`.

## Resumen Ejecutivo

| Campo | Sin cambio | Corrección segura | Rellenable | Conflicto candado | Sin detección |
|-------|-----------|------------------|------------|-------------------|---------------|
| **nombre_edificio** | 259 (79%) | 27 incorrecto + 3 basura | 40 variación menor | — | — |
| **estado_construccion** | 220 (67%) | **37** (11%) | — | 16 (5%) | 56 (17%) |
| **parqueo_incluido** | 39 (12%) | — | **44** (13%) | 1 | 245 (75%) |
| **tipo_cambio_detectado** | 128 (39%) | — | **18** (5%) | — | 183 (56%) |

### Impacto potencial

- **37 props** con `estado_construccion = 'no_especificado'` corregibles automáticamente (sin candado, keyword detectado)
- **44 props** con `parqueo_incluido = null` rellenable (16 incluido, 28 no incluido)
- **30 props** con `nombre_edificio` incorrecto (basura regex o nombre totalmente diferente al PM)
- **18 props** con `tipo_cambio_detectado` detectable desde descripción (9 paralelo, 9 oficial)
- **16 props** con candado en estado_construccion que el LLM sugiere diferente → requieren revisión manual

---

## 1. nombre_edificio

### 1A. Nombres basura (3 props) — CORRECCIÓN SEGURA

Regex del extractor produjo valores genéricos sin sentido.

| ID | nombre_bd | PM correcto | Zona |
|----|-----------|------------|------|
| 980 | `"Venta"` | Madero Residence | Eq. Centro |
| 1087 | `"Venta"` | TORRE ARA | Eq. Centro |
| 1103 | `null` | (sin match) | Sirari |

**Acción**: IDs 980 y 1087 se pueden corregir al nombre del PM. ID 1103 no tiene PM asignado.

### 1B. Nombre incorrecto vs PM (27 props) — CORRECCIÓN SEGURA

Regex extrajo un nombre que NO corresponde al proyecto matcheado. En estos casos, `pm.nombre_oficial` es la fuente de verdad (match fue validado por GPS/manual).

| ID | nombre_bd | PM correcto |
|----|-----------|------------|
| 20 | Venta En Equipetrol En Edificio Solo | SÖLO Industrial Apartments |
| 53 | Equipetrol Plaza Italia | Condado VI Plaza Italia |
| 57 | Venta En You Plaza | You Smart Studios |
| 125 | Brigida | SANTORINI VENTURA |
| 126 | Brigida | SANTORINI VENTURA |
| 162 | Uptown Drei | Uptown NUU |
| 176 | Edificio Uptown Equipetrol | Uptown NUU |
| 428 | Edificio Las Palmeras | EURODESIGN TOWER |
| 462 | Pre Venta | Condominio Las Dalias |
| 463 | Pre Venta | Condominio Las Dalias |
| 491 | LINDA VISTA | Legendary by EliTe |
| 502 | El Centro De | Edificio TORRE OASIS |
| 527 | Moderno | Vertical Terra |
| 555 | Condominio SKY LUXIA | Sky Lux |
| 560 | SKY Luxury | Sky Lux |
| 570 | Consta De Seguridad Las | Stratto Up |
| 571 | Consta De Seguridad Las | Stratto Up |
| 595 | Bloque La Salle | Edificio Equipetrol Norte - Calle H |
| 814 | Eco Sostenible Nomad By | Nomad by Smart Studio |
| 876 | Moderno Que Ofrece Una | Nano Smart |
| 887 | PAGO AL CONTADO | Sky Tower |
| 888 | Torre Real | TORRE ARA |
| 890 | Victor Pinto | Euro Design Le Blanc |
| 893 | Equipetrol Mas Parqueo | Nano Smart |
| 958 | De Dise | Portofino V |
| 969 | Nicolas Ortiz | Lofty Island |
| 1008 | Sirari Palm | Onix Art By EliTe |

**Acción**: Copiar `pm.nombre_oficial` a `nombre_edificio` para estas 27 props. Son correcciones seguras — el matching ya fue validado.

### 1C. Variación menor vs PM (40 props) — NORMALIZACIÓN OPCIONAL

Nombre reconocible pero no idéntico al PM. Ejemplos: "Stanza" vs "Condominio Stanza", "Alto  Busch" vs "Alto Busch", "STONE III" vs "Stone 3".

**Acción**: Opcional — normalizar `nombre_edificio = pm.nombre_oficial` para consistencia. Bajo riesgo.

---

## 2. estado_construccion

### 2A. Correcciones seguras (37 props) — SIN CANDADO

Props con `estado_construccion = 'no_especificado'`, sin candado, y keyword detectado en descripción.

| llm_estado | Cantidad | IDs |
|------------|----------|-----|
| entrega_inmediata | 37 | 159, 287, 355, 372, 554, 572, 577, 578, 584, 601, 602, 612, 814, 816, 842, 843, 888, 902, 907, 924, 934, 953, 968, 971, 972, 975, 977, 996, 1005, 1008, 1009, 1040, 1061, 1063, 1064, 1068, 1104 |

Keywords detectados: "amoblado", "equipado", "listo para", "entrega inmediata".

**Acción**: Actualizar `estado_construccion = 'entrega_inmediata'` para estas 37 props. Todas son "amoblado/equipado" → claramente entrega inmediata.

### 2B. Conflictos con candado (16 props) — NO TOCAR

Props con `estado_construccion = 'no_especificado'` + candado admin. El LLM sugiere diferente pero el admin dejó 'no_especificado' intencionalmente.

| ID | llm_estado | Nota |
|----|------------|------|
| 18, 31 | preventa | Sky Eclipse — desc dice "Pre-Venta" pero admin fijó no_especificado |
| 59, 61, 62 | nuevo_a_estrenar | Sky Eclipse — desc dice "nuevo a estrenar" |
| 117 | entrega_inmediata | LUXE RESIDENCE |
| 149 | entrega_inmediata | Nomad by Smart Studio |
| 173 | entrega_inmediata | Sky Collection Art Deco |
| 198 | entrega_inmediata | OMNIA PRIME |
| 459 | entrega_inmediata | Sky Eclipse |
| 479, 482, 485 | nuevo_a_estrenar | varios |
| 555 | entrega_inmediata | SKY LUXIA |
| 557 | entrega_inmediata | |
| 832 | nuevo_a_estrenar | |

**Acción**: Revisar manualmente si el admin quiso dejar 'no_especificado' o si fue un descuido.

### 2C. Sin detección (56 props)

Descripción no contiene keywords suficientes para inferir estado. Un LLM real podría inferir más por contexto (p.ej. "precio en BS" → probable preventa, "piso 8 con vista" → terminado).

---

## 3. parqueo_incluido

### 3A. Rellenable — incluido (16 props)

Descripción menciona "parqueo incluido", "incluye parqueo", o similar.

IDs: 18, 173, 246, 322, 450, 502, 636, 814, 828, 842, 872, 953, 996, 997, 1006, 1087

**Acción**: Actualizar `parqueo_incluido = true`.

### 3B. Rellenable — no incluido (28 props)

Descripción menciona "parqueo $X USD", "parqueo adicional", parqueo con precio separado.

IDs: 43, 44, 45, 46, 48, 49, 52, 179, 204, 207, 317, 483, 491, 510, 511, 527, 597, 612, 824, 827, 843, 874, 972, 977, 1040, 1053, 1074, 1102

**Acción**: Actualizar `parqueo_incluido = false`.

### 3C. Sin detección (245 props)

Descripción no menciona parqueo o mención ambigua. Requeriría LLM real para inferir.

---

## 4. tipo_cambio_detectado

### 4A. Detectable — paralelo (9 props)

Descripción menciona "paralelo", "T/C paralelo" pero BD tiene `no_especificado` o `null`.

IDs: 502, 554, 934, 953, 967, 997, 1053, 1073, 1075

**Acción**: Actualizar `tipo_cambio_detectado = 'paralelo'`. **PRECAUCIÓN**: verificar que `depende_de_tc` sea consistente.

### 4B. Detectable — oficial/USD (9 props)

Descripción menciona "TC oficial", "pago en dólares", "al oficial".

IDs: 162, 250, 251, 252, 289, 335, 459, 525, 574

**Acción**: Actualizar `tipo_cambio_detectado = 'oficial'`.

---

## Resumen de acciones recomendadas

| Prioridad | Acción | Props | Riesgo |
|-----------|--------|-------|--------|
| **ALTA** | Corregir nombre_edificio basura/incorrecto → pm.nombre_oficial | 30 | Bajo — PM ya validado |
| **ALTA** | estado_construccion no_especificado → entrega_inmediata (sin candado) | 37 | Bajo — keywords claros |
| **MEDIA** | parqueo_incluido null → true/false según descripción | 44 | Bajo — keywords explícitos |
| **MEDIA** | tipo_cambio_detectado → paralelo/oficial según descripción | 18 | Medio — verificar depende_de_tc |
| **BAJA** | Normalizar nombre_edificio variaciones menores → pm.nombre_oficial | 40 | Muy bajo |
| **REVISAR** | estado_construccion con candado — ¿admin intencional? | 16 | N/A — manual |

### Total: ~129 correcciones automatizables + 40 normalizaciones + 16 revisiones manuales

---

## Limitaciones

1. **Solo keywords**: análisis basado en regex, no comprensión contextual. Un LLM real detectaría más (p.ej. "precio en BS al cambio 7" → TC paralelo, "desde USD 65K" → preventa por rango).
2. **56 props sin detección de estado**: un LLM podría inferir por contexto en muchos casos.
3. **245 props sin detección de parqueo**: muchas probablemente lo incluyen pero no lo dicen explícitamente.
4. **plan_pagos**: regex no detectó ningún plan de pagos (0/329). El LLM detectaría "cuotas", "reserva + saldo", "financiamiento directo" — campo con mayor gap.
5. **Descripciones truncadas a 300 chars en queries**: algunas detecciones podrían haberse perdido.

## Referencia

- Datos crudos: `scripts/audit-enrichment/output/audit-results.json`
- Simulación 10 props: `docs/analysis/SIMULACION_LLM_VS_REGEX_2026_03_09.md`
- Prompt LLM propuesto: `docs/analysis/COMPARATIVA_VENTAS_VS_ALQUILERES.md` sección 4.3
