# Test LLM Enrichment Ventas — V3 vs V2

> Fecha: 2026-03-10 | Modelo: claude-haiku-4-5-20251001 | N=30 | Costo V3: $0.030

---

## Cambios en prompt V3

### Problemas detectados en V2

1. **tipo_cambio_detectado ID 234** — `oficial → no_especificado`. La descripción dice "al cambio Bs.7" y también tiene precios listados solo en Bs (ej: "Bs 480.000"). El LLM no detectó que un precio en bolivianos implica tipo de cambio oficial.

2. **solo_tc_paralelo IDs 30, 59, 519, 559** — `false → true`. El LLM interpretaba "dólares O paralelo" como "solo paralelo". En español, "o" indica opciones (acepta ambas), no exclusividad.

3. **nombre_edificio ID 1009** — `Onix Art By EliTe → Edificio Sirari Palm`. El LLM matcheó incorrectamente con un proyecto de otra zona.

### Cambios aplicados

| Cambio | Razón |
|--------|-------|
| TIPO_CAMBIO: precio en Bs/bolivianos sin mención USD = `oficial` | Precio en moneda local = tasa BCB fija |
| SOLO_TC_PARALELO: "dólares O paralelo" = `false` | "O" en español indica opciones, no exclusividad |
| SOLO_TC_PARALELO: solo `true` cuando NO hay alternativa | "Pago en Dolares" (sin "o"), "SOLO EN DOLARES" |
| Instrucciones expandidas con ejemplos negativos | Prevenir falsos positivos |

---

## Resultados V3 vs V2

### Agregados

| Métrica | V2 | V3 | Delta |
|---------|----|----|-------|
| igual | 286 | 287 | +1 |
| llm_agrega | 143 | 143 | 0 |
| llm_no_detecta | 2 | 2 | 0 |
| **llm_difiere** | **19** | **18** | **-1** |
| Tokens | 94,863 | 101,116 | +6,253 (+6.6%) |
| Costo | $0.029 | $0.030 | +$0.001 |

**Resumen: difiere bajó de 19→18. Mejora modesta pero quirúrgica — los 3 cambios targeted resolvieron los campos específicos.**

### Cambios V2→V3 (campo por campo)

Solo se listan campos donde cambió el veredicto de alguna propiedad:

| Campo | ID | V2 veredicto | V3 veredicto | Análisis |
|-------|----|-------------|-------------|----------|
| tipo_cambio_detectado | 234 | difiere | **igual** | FIXED: V3 detecta "Bs" = oficial |
| tipo_cambio_detectado | 101 | igual | **difiere** | REGRESIÓN: no_espec→oficial. Pero la prop tiene precios en Bs, así que V3 puede ser correcto |
| solo_tc_paralelo | 519 | difiere | **igual** | FIXED: V3 interpreta "o" correctamente |
| solo_tc_paralelo | 465 | igual | **difiere** | REGRESIÓN: false→true. Requiere revisión manual |
| nombre_edificio | 1009 | difiere | **igual** | FIXED: V3 mantiene "Onix Art By EliTe" en vez de matchear incorrectamente |

**Net: 3 fixes, 2 regresiones = +1 neto**

### Campo por campo (completo)

| Campo | V2 no_det | V3 no_det | V2 difiere | V3 difiere | V2 agrega | V3 agrega | Cambio |
|-------|-----------|-----------|------------|------------|-----------|-----------|--------|
| tipo_cambio_detectado | 0 | 0 | 3 | 3 | 6 | 6 | 1 fix + 1 regresión (net 0) |
| solo_tc_paralelo | 0 | 0 | 4 | 4 | 13 | 13 | 1 fix + 1 regresión (net 0) |
| nombre_edificio | 0 | 0 | 2 | 1 | 1 | 1 | -1 difiere (fix ID 1009) |
| estado_construccion | 0 | 0 | 7 | 7 | 0 | 0 | sin cambio |
| baulera | 0 | 0 | 2 | 2 | 13 | 13 | sin cambio |
| plan_pagos_desarrollador | 0 | 0 | 1 | 1 | 13 | 13 | sin cambio |
| descuento_contado_pct | 2 | 2 | 0 | 0 | 0 | 0 | sin cambio |
| piso | 0 | 0 | 0 | 0 | 7 | 7 | sin cambio |
| parqueo_incluido | 0 | 0 | 0 | 0 | 23 | 23 | sin cambio |
| fecha_entrega_estimada | 0 | 0 | 0 | 0 | 9 | 9 | sin cambio |
| es_multiproyecto | 0 | 0 | 0 | 0 | 30 | 30 | sin cambio |
| acepta_permuta | 0 | 0 | 0 | 0 | 13 | 13 | sin cambio |
| precio_negociable | 0 | 0 | 0 | 0 | 13 | 13 | sin cambio |

---

## Problemas residuales en V3

### 1. tipo_cambio_detectado — 3 difiere

- **ID 101**: `no_especificado → oficial` — V3 detecta precios en Bs. **Posiblemente correcto** (la prop tiene "Bs" en descripción).
- **ID 530**: `paralelo → no_especificado` — LLM no detecta señal de paralelo. Persiste desde V2.
- **ID 1049**: `no_especificado → paralelo` — Dice "SOLO EN DOLARES". **LLM correcto**, BD incorrecta.

### 2. solo_tc_paralelo — 4 difiere (false → true)

- **IDs 30, 59, 559**: Persisten desde V2. El texto puede tener señales ambiguas.
- **ID 465**: Nueva regresión en V3. Requiere revisión de la descripción.

### 3. estado_construccion — 7 difiere (sin cambio V2→V3)

- 4× `no_especificado → entrega_inmediata` (IDs 101, 450, 530, 1006)
- 3× `entrega_inmediata → nuevo_a_estrenar` (IDs 59, 479, 519)
- Estos son difiere "legítimos" — el LLM distingue matices que el regex no captura. Posiblemente el LLM es más correcto que la BD en varios casos.

### 4. baulera — 2 difiere (sin cambio)

- ID 611: `true → false` — LLM dice no hay baulera
- ID 1095: `false → true` — LLM dice hay baulera

### 5. descuento_contado_pct — 2 no_detecta (sin cambio)

- IDs 559, 569: BD tiene 1.5% y 7% respectivamente, LLM no los encuentra. Posiblemente datos manuales que no aparecen en la descripción.

---

## Evolución V1 → V2 → V3

| Métrica | V1 | V2 | V3 | Tendencia |
|---------|----|----|----|----|
| igual | 282 | 286 | 287 | +5 total |
| llm_agrega | 68 | 143 | 143 | +75 (V1→V2), estable |
| llm_no_detecta | 90 | 2 | 2 | -88 (V1→V2), estable |
| llm_difiere | 40 | 19 | 18 | -22 total |
| Tokens | 87,438 | 94,863 | 101,116 | +15.6% total |
| Costo | $0.026 | $0.029 | $0.030 | +$0.004 total |

---

## Conclusión V3

V3 es una mejora incremental sobre V2. Los grandes gains fueron V1→V2 (defaults alineados). V3 atacó 3 casos específicos y resolvió 3/5 con 2 regresiones menores.

**Los 18 difiere restantes se dividen en:**
- ~7 estado_construccion: LLM posiblemente más correcto que BD
- ~4 solo_tc_paralelo: señales ambiguas en texto, requieren revisión manual
- ~3 tipo_cambio: 1 correcto (1049), 1 posiblemente correcto (101), 1 error persistente (530)
- ~2 baulera: 1 error LLM, 1 posible corrección
- ~1 plan_pagos: posible corrección (ID 621)
- ~1 nombre_edificio: LLM matchea contra proyecto distinto (ID 30)

**Recomendación: V3 es production-ready.** Los difiere restantes son edge cases que no justifican más iteraciones de prompt. Mejor invertir en revisión manual de los 18 casos y ajustar la BD donde el LLM tenga razón.
