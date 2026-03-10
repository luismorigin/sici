# Test LLM Enrichment Ventas — V2 vs V1

> Fecha: 2026-03-10 | Modelo: claude-haiku-4-5-20251001 | N=30 | Costo V2: $0.029

---

## Cambios en prompt V2

### Problema detectado en V1
El mayor problema de V1 fue **no_detecta masivo en campos booleanos** (90 casos). El patrón: BD tenía `false` (default del pipeline), LLM devolvía `null` (su default "no encontré info"). Ambos significan lo mismo ("no hay baulera", "no acepta permuta") pero se contaban como discrepancia.

Segundo problema: `tipo_cambio_detectado` — BD usa `no_especificado` como valor default, LLM devolvía `null`. Mismo dato, distinta representación.

### Cambios aplicados

| Cambio | Razón |
|--------|-------|
| `tipo_cambio_detectado`: agregar `"no_especificado"` como valor válido | Alinear con BD. "NUNCA devolver null — usar no_especificado" |
| `baulera_incluida`: DEFAULT false | Si no menciona baulera → false (no null) |
| `plan_pagos.tiene_plan_pagos`: DEFAULT false | Si no hay info de pagos → false |
| `plan_pagos.acepta_permuta`: DEFAULT false | Si no menciona permuta → false |
| `plan_pagos.precio_negociable`: DEFAULT false | Si no menciona negociable → false |
| `plan_pagos.solo_tc_paralelo`: DEFAULT false, exigir mención explícita | Solo true si dice "solo dólares"/"solo paralelo" |
| `parqueo_incluido`: DEFAULT false | Si no hay info de parqueo → false |
| Instrucciones expandidas para BAULERA | Sección propia (antes sin instrucciones) |
| Instrucciones expandidas para PLAN_PAGOS | Detalle por subcampo (antes solo 2 líneas) |

---

## Resultados V2 vs V1

### Agregados

| Métrica | V1 | V2 | Delta |
|---------|----|----|-------|
| igual | 282 | 286 | +4 |
| **llm_agrega** | **68** | **143** | **+75 (+110%)** |
| **llm_no_detecta** | **90** | **2** | **-88 (-98%)** |
| llm_difiere | 40 | 19 | -21 (-53%) |
| Tokens | 87,438 | 94,863 | +7,425 (+8.5%) |
| Costo | $0.026 | $0.029 | +$0.003 |

**Resumen: no_detecta bajó de 90→2 (-98%). llm_agrega subió de 68→143 (+110%). El costo solo subió 8.5%.**

### Campo por campo

| Campo | V1 no_det | V2 no_det | V1 difiere | V2 difiere | V1 agrega | V2 agrega | Mejora |
|-------|-----------|-----------|------------|------------|-----------|-----------|--------|
| tipo_cambio_detectado | 12 | 0 | 1 | 3 | 0 | 6 | no_det eliminado |
| baulera | 14 | 0 | 2 | 2 | 1 | 13 | no_det eliminado |
| plan_pagos_desarrollador | 16 | 0 | 1 | 1 | 5 | 13 | no_det eliminado |
| acepta_permuta | 17 | 0 | 0 | 0 | 2 | 13 | no_det eliminado |
| precio_negociable | 16 | 0 | 0 | 0 | 3 | 13 | no_det eliminado |
| solo_tc_paralelo | 11 | 0 | 5 | 4 | 5 | 13 | no_det eliminado, difiere -1 |
| parqueo_incluido | 0 | 0 | 0 | 0 | 3 | 23 | +20 agrega |
| nombre_edificio | 0 | 0 | 1 | 2 | 1 | 1 | +1 difiere (ID 1009 nuevo) |
| estado_construccion | 0 | 0 | 7 | 7 | 0 | 0 | sin cambio |
| piso | 0 | 0 | 0 | 0 | 7 | 7 | sin cambio |
| fecha_entrega_estimada | 0 | 0 | 0 | 0 | 9 | 9 | sin cambio |
| es_multiproyecto | 0 | 0 | 0 | 0 | 30 | 30 | sin cambio |

### Campos sin mejorar (V2 = V1)
- `descuento_contado_pct`: 2 no_detecta en ambas versiones
- `baulera_precio_adicional`: 0 problemas en ambas

---

## Problemas residuales en V2

### 1. tipo_cambio_detectado — 3 difiere
- ID 234: `oficial → no_especificado` — LLM no detectó "al cambio Bs.7" en la descripción
- ID 530: `paralelo → no_especificado` — LLM no detectó señal de paralelo
- ID 1049: `no_especificado → paralelo` — **Correcto** (dice "SOLO EN DOLARES")

### 2. solo_tc_paralelo — 4 difiere (false → true)
- IDs 30, 59, 519, 559: LLM dice true donde BD tiene false
- Posible que LLM detecte correctamente "solo dólares" en texto

### 3. nombre_edificio — 2 difiere
- ID 30: `TORRE OASIS → SKY LUXIA` — LLM matchea con proyectos_master
- ID 1009: `Onix Art By EliTe → Edificio Sirari Palm` — nuevo en V2

### 4. baulera — 2 difiere
- ID 611: `true → false` — LLM dice no hay baulera donde BD dice sí
- ID 1095: `false → true` — LLM dice hay baulera donde BD dice no

---

## Conclusión V2

El cambio de defaults (null→false para booleanos, null→no_especificado para TC) eliminó casi toda la categoría `no_detecta`. Los problemas restantes son difiere reales que requieren análisis por campo. El prompt V3 debe atacar los 3 difiere de tipo_cambio_detectado y los 4 de solo_tc_paralelo.
