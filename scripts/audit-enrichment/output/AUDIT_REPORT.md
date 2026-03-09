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

---

## Correcciones Aplicadas (9 Mar 2026)

### Resumen de correcciones ejecutadas

| Acción | Props | Método | Estado |
|--------|-------|--------|--------|
| nombre_edificio → pm.nombre_oficial (basura + incorrecto) | 30 | Migración 187: `aplicar_matches_aprobados()` v3.1 | **APLICADO** |
| estado_construccion → entrega_inmediata (sin candado) | 32 | UPDATE directo | **APLICADO** |
| estado_construccion → preventa | 4 | UPDATE directo | **APLICADO** |
| estado_construccion → entrega_inmediata (con candado, revisión admin) | 14 | UPDATE directo | **APLICADO** |
| parqueo_incluido → true | 20 | UPDATE directo | **APLICADO** |
| parqueo_incluido → false | 24 | UPDATE directo | **APLICADO** |
| tipo_cambio_detectado → paralelo | 9 | UPDATE directo | **APLICADO** |
| tipo_cambio_detectado → oficial | 8 | UPDATE directo | **APLICADO** |
| tipo_cambio_detectado → paralelo (ID 335, era "pago en dólares") | 1 | UPDATE directo | **APLICADO** |
| Precios inflados CASO 2 (ratio 1.00) | 6 | UPDATE directo | **APLICADO** |
| Aire Acondicionado fantasma (regex `/ac/i`) | 440 | Migración 188 + fix regex n8n | **APLICADO** |

**Total: 588 correcciones aplicadas.**

### Detalle por campo

#### 1. nombre_edificio — Migración 187

`aplicar_matches_aprobados()` v3.1: SIEMPRE copia `pm.nombre_oficial` a `nombre_edificio` (excepto candado). Antes solo copiaba cuando `nombre_edificio IS NULL`, preservando basura del regex.

- 30 props corregidas (27 incorrecto + 3 basura)
- 40 variaciones menores también normalizadas por la misma lógica
- **Preventivo**: todo match futuro copia nombre oficial automáticamente

#### 2. estado_construccion — 50 correcciones

**32 → entrega_inmediata** (sin candado, keywords claros):
IDs: 159, 287, 355, 372, 554, 572, 577, 578, 584, 601, 602, 612, 814, 816, 842, 843, 888, 902, 907, 924, 934, 953, 968, 971, 972, 975, 977, 996, 1005, 1008, 1009, 1104

**4 → preventa** (detectados durante revisión manual):
- IDs 1061, 1068: Portobello Green — "Precios al cambio Bs.7" = preventa
- IDs 1063, 1064: Stone 3 — preventa confirmada por admin

**14 → entrega_inmediata** (con candado, revisión manual admin):
- 8 Sky Eclipse: IDs 18, 31, 59, 61, 62, 459, 479, 832
- ID 117: LUXE RESIDENCE — "totalmente equipado"
- ID 149: Nomad by Smart Studio — "EQUIPADO Y AMOBLADO"
- ID 173: Sky Collection Art Deco — piso específico, parqueo doble
- ID 198: OMNIA PRIME — "Departamento Equipado"
- ID 482: Breeze Tower — "A ESTRENAR"
- ID 555: Sky Lux — detalla muebles específicos (cama, TV, A/C, ropero)

**2 → sin cambio** (no determinable, se mantienen no_especificado con candado):
- ID 485: SPERANTO RESIDENZE — información insuficiente
- ID 557: Domus Tower — posible preventa ("pronto a entregarse")

**Lección clave**: "amoblado/equipado" NO implica entrega_inmediata. "Precios al cambio Bs.7" es señal de preventa. Ver `docs/analysis/LECCIONES_AUDITORIA_ENRICHMENT.md`.

#### 3. parqueo_incluido — 44 correcciones

**20 → true** (incluido):
IDs: 18, 173, 179, 246, 322, 450, 502, 636, 814, 828, 842, 843, 872, 972, 996, 997, 1006, 1040, 1074, 1087

**24 → false** (precio separado):
IDs: 43, 44, 45, 46, 48, 49, 52, 204, 207, 317, 483, 491, 510, 511, 527, 597, 612, 824, 827, 874, 953, 977, 1053, 1102

**Reclasificaciones vs auditoría original** (6 errores del regex corregidos):
- ID 953: auditoría decía "incluido" → realmente `false` ("Parqueo + Baulera: 14.000$")
- IDs 179, 843, 972, 1040, 1074: auditoría decía "no incluido" → realmente `true`
- ID 977: "Parqueo" en Áreas Sociales → `false` (no es parqueo propio)

#### 4. tipo_cambio_detectado — 18 correcciones

**9 → paralelo**: IDs 502, 554, 934, 953, 967, 997, 1053, 1073, 1075
- También corregido `depende_de_tc = false` (precios ya eran USD reales)

**8 → oficial**: IDs 162, 250, 251, 252, 289, 459, 525, 574
- ID 335 reclasificado: auditoría decía "oficial" pero desc dice "pago en dólares" = **paralelo**

**Lección clave**: "pago en dólares" / "solo dólares" = paralelo (en Bolivia, exigir USD = operar al paralelo). "TC 7" = oficial (6.96 redondeado, tasa fija). Ver `docs/analysis/LECCIONES_AUDITORIA_ENRICHMENT.md`.

#### 5. Precios inflados CASO 2 (ratio 1.00) — 6 correcciones

Props donde el extractor multiplicó USD × TC / 6.96 sobre precios que ya eran USD. Escaparon migraciones 176-178 porque `enrich_precio_original` ya estaba inflado (ratio = 1.00).

IDs corregidos: 567, 568, 953, 967, 997, 1053

**Lección**: la detección por ratio > 1.15 no cubre casos donde el enrichment guardó el precio ya inflado. Solo detectable comparando contra la descripción original.

#### 6. Aire Acondicionado fantasma — Migración 188

**Bug**: regex del extractor Remax/C21 usaba `/aire\s+acondicionado|split|ac/i`. El patrón `|ac` matcheaba cualquier palabra con "ac": espacios, ubicación, extractor, elegancia, capacidad, etc.

- **440 props** con A/C fantasma en equipamiento (80% del total con A/C)
- Solo 57 props realmente mencionaban aire acondicionado
- Fix regex: `/aire\s+acondicionado|split/i` (removido `|ac`)
- Fix BD: migración 188 limpió array equipamiento
- Fix n8n: actualizado en ambos nodos (C21 + Remax)

---

## Pendiente

| Prioridad | Acción | Props | Nota |
|-----------|--------|-------|------|
| **BAJA** | Normalizar nombre_edificio variaciones menores | 40 | Ya cubierto por migración 187 para matches futuros |
| ~~**REVISAR**~~ | ~~estado_construccion con candado~~ | ~~16~~ | **CERRADO**: 14 corregidos, 2 sin info suficiente (485, 557) |
| **GAP** | estado_construccion sin detección (regex) | 56 | Solo LLM real inferiría más por contexto |
| **GAP** | parqueo_incluido sin detección | 245 | Solo LLM real inferiría más |
| **GAP** | plan_pagos (0% regex, ~60% LLM estimado) | ~200 | Mayor gap — campo nunca extraído por regex |
| **MENOR** | IDs 322, 558 — TC 7 = oficial (están no_especificado) | 2 | Cero impacto en queries (oficial = no_especificado en precio_normalizado) |

---

## Limitaciones

1. **Solo keywords**: análisis basado en regex, no comprensión contextual. Un LLM real detectaría más (p.ej. "precio en BS al cambio 7" → preventa, "desde USD 65K" → preventa por rango).
2. **56 props sin detección de estado**: un LLM podría inferir por contexto en muchos casos.
3. **245 props sin detección de parqueo**: muchas probablemente lo incluyen pero no lo dicen explícitamente.
4. **plan_pagos**: regex no detectó ningún plan de pagos (0/329). El LLM detectaría "cuotas", "reserva + saldo", "financiamiento directo" — campo con mayor gap.
5. **Descripciones truncadas a 300 chars en queries**: algunas detecciones podrían haberse perdido.

## Referencia

- Datos crudos: `scripts/audit-enrichment/output/audit-results.json`
- Simulación 10 props: `docs/analysis/SIMULACION_LLM_VS_REGEX_2026_03_09.md`
- Lecciones para LLM: `docs/analysis/LECCIONES_AUDITORIA_ENRICHMENT.md`
- Prompt LLM propuesto: `docs/analysis/COMPARATIVA_VENTAS_VS_ALQUILERES.md` sección 4.3
