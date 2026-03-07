# Auditoría de Precios — Ventas Equipetrol

**Fecha inicio:** 2026-03-01
**Última actualización:** 2026-03-07
**Scope:** Todas las propiedades de venta con precio anómalo (~660 venta analizadas, 102 afectadas)
**Método:** Comparación precio_usd en BD vs precio real en descripción del listing

---

## 1. Flujo Completo de Precios en SICI (Ventas)

### 1.1 ¿De dónde viene `precio_usd_original`?

De `registrar_discovery()`. Guarda el **monto crudo del portal en su moneda original**, a pesar del nombre. Si el listing es en BOB, guarda BOB. Si es en USD, guarda USD.

- C21: `datos_json_discovery->>'precio'` + `datos_json_discovery->>'moneda'`
- Remax: `datos_json_discovery->'price'->>'amount'` + `currency_id` (1=BOB, 2=USD)

### 1.2 ¿Qué campo guarda la moneda original?

`moneda_original` (VARCHAR). Valores: `'USD'` o `'BOB'`.
Solo **8 propiedades** en toda la BD tienen `moneda_original = 'USD'`.

### 1.3 ¿Cómo se calcula `precio_usd`?

En **3 etapas**:

**Etapa 1 — Discovery** (`get_discovery_value('precio_usd', ...)`):
- Remax: `price.price_in_dollars` (API pre-convierte)
- C21 + USD: `precio` directo
- C21 + BOB: retorna `NULL` (defer a enrichment)

**Etapa 2 — Enrichment** (Extractor regex n8n, **NO LLM** para ventas):
- Scrapea HTML del listing
- `detectarTipoCambio(descripcion)` → regex busca "paralelo", "oficial", etc.
- `normalizarPrecioUSD(precio_extraído, descripcion)`:
  - **CASO 1**: `precio > 350k` + descripción dice "precio bs" → `BOB / 6.96`
  - **CASO 2**: detectó "paralelo" → `precio × TC_PARALELO / 6.96` ← **BUG** (ver sección 4)
  - **CASO 3**: default → precio tal cual (asume USD)

**IMPORTANTE:** El extractor Remax v1.9 **NO usa normalizarPrecioUSD**. Tiene su propia lógica:
```javascript
if (currency_id === 1) {  // BOB
    precio_final_usd = Math.round(precio_bruto / TC_OFICIAL);  // ÷ 6.96
} else {                  // USD
    precio_final_usd = Math.round(precio_bruto);
}
```
Sin CASO 2, sin multiplicación por TC paralelo. Por eso Remax nunca infla precios.

**Etapa 3 — Merge** (`merge_discovery_enrichment()` v2.3.0):
```
1. Campo bloqueado (candado)     → mantener existente
2. Enrichment normalizó precio   → usar enrichment
3. Discovery tiene precio_usd    → comparar (>10% discrepancia → enrichment)
4. Fallback                      → usar enrichment
```

### 1.4 ¿Qué es `precio_usd_actualizado`?

Precio recalculado con TC paralelo actual. Fórmula producción (v2.0.0, migración 168):

```sql
IF tipo_cambio_detectado = 'paralelo' THEN
    precio_usd_actualizado = precio_usd × tc_paralelo_actual / 6.96
ELSE
    precio_usd_actualizado = precio_usd
```

Se recalcula nightly via `recalcular_precios_batch_nocturno()`.

**Agravante:** `recalcular_precio_propiedad()` lee `clave = 'tipo_cambio_paralelo'` (lowercase, correcto = 9.354) pero la aplica sobre `precio_usd` ya inflado. Resultado: doble inflación. Ej. ID 577: real $115,600 → precio_usd $172,736 → precio_usd_actualizado **$232,151** (+101%).

### 1.5 ¿Qué es `tc_referencia`?

No existe como columna. Lo que existe:

| Columna | Qué guarda |
|---|---|
| `tipo_cambio_usado` | TC que usó el enrichment (siempre 6.96 para ventas) |
| `tipo_cambio_detectado` | `'oficial'`, `'paralelo'`, `'no_especificado'` |
| `tipo_cambio_paralelo_usado` | Rate Binance/config usado, si aplica |
| `depende_de_tc` | Boolean: necesita recálculo cuando TC cambia |

### 1.6 ¿Hay recálculo periódico de TC?

Sí. Workflow nightly:

```
00:00  Binance P2P → validar → actualizar config_global (tipo_cambio_paralelo)
       → trigger marca requiere_actualizacion_precio = TRUE
       → recalcular_precios_batch_nocturno() (hasta 1000 props)
```

### 1.7 ¿Qué pasa con props en USD?

Solo 8 propiedades tienen `moneda_original = 'USD'`. Para estas:
- `depende_de_tc = false`
- Nunca se recalculan
- `precio_usd` = monto directo del listing

### 1.8 Flujo paso a paso

```
LISTING (C21/Remax)
  │
  ▼
[1] DISCOVERY (1:00 AM) ─── registrar_discovery()
    ├─ precio_usd_original = monto crudo (BOB o USD según portal)
    ├─ moneda_original = 'BOB' o 'USD'
    └─ precio_usd = NULL si C21+BOB, price_in_dollars si Remax
  │
  ▼
[2] ENRICHMENT (2:00 AM) ─── Extractor regex n8n (NO LLM)
    ├─ C21: normalizarPrecioUSD() → CASO 1/2/3 (BUG en CASO 2)
    ├─ Remax: precio_bruto / 6.96 si BOB, directo si USD (sin bug)
    └─ registrar_enrichment() → datos_json_enrichment
  │
  ▼
[3] MERGE (3:00 AM) ─── merge_discovery_enrichment()
    ├─ Resuelve precio_usd final
    ├─ Escribe: tipo_cambio_detectado, depende_de_tc
    └─ NO toca precio_usd_actualizado
  │
  ▼
[4] TC DINÁMICO (00:00) ─── Binance P2P nightly
    ├─ Actualiza config_global.tipo_cambio_paralelo (lowercase)
    └─ Batch recalcula precio_usd_actualizado (amplifica error si precio_usd inflado)
```

---

## 2. Alcance del Problema

### 2.1 Distribución de tipo_cambio_detectado (todas las ventas)

| tipo_cambio_detectado | Cantidad | Infladas | OK | Notas |
|---|---:|---:|---:|---|
| `no_especificado` | 315 | 2 | 313 | CASO 3 (sin multiplicar) → seguras |
| `NULL` | 108 | 1 | 107 | Sin enrichment TC → seguras |
| `oficial` | 100 | 0 | 100 | CASO 3 → seguras |
| `paralelo` | 144 | 85 | 44+15 leve | **CASO 2 infla** |
| **Total** | **667** | **88** | — | |

Las 3 infladas sin `paralelo` (IDs 232, 317, 933) se inflaron por otros paths del merge.

### 2.2 ¿Por qué las 44 con paralelo OK no se inflaron?

Investigado en detalle (2026-03-07). Dos poblaciones:

**Remax (10 props):** El extractor Remax v1.9 NO usa `normalizarPrecioUSD`. Tiene lógica propia que divide BOB/6.96 directamente. `detectarTipoCambio` solo se usa para metadata, no afecta precio. IDs: 19, 36, 53, 59, 61, 419, 821, 905, 910, 1103.

**C21 con candado manual (10 props):** Fueron infladas por CASO 2, pero alguien corrigió manualmente el precio y puso candado. Merge posterior intentó sobreescribir con el valor inflado pero el candado lo impidió. IDs: 156, 338, 430, 501, 506, 562, 564, 565, 572, 816. Todas tienen `campos_bloqueados->>'precio_usd' = true` y `precio_usd ≠ enrichment_precio_usd`.

**C21 con enrichment fallido (2 props):** IDs 425 (enrichment=$747) y 891 (enrichment=$81). La extracción de precio falló, merge usó fallback → precio quedó correcto por accidente.

### 2.3 Resumen de props afectadas

| Grupo | Completado | Inactivo | Total |
|---|---:|---:|---:|
| Con precio verificado (corregibles) | 52 | 33 | **85** |
| Sin precio verificable (revisión manual) | 7 | 9 | **16** |
| Falso positivo (ID 465, OK) | 1 | 0 | 1 |
| **Total afectadas** | **60** | **42** | **102** |

---

## 3. Bug 1: config_global Duplicada — CORREGIDO (migración 174)

### Hallazgo

`config_global` tenía **4 filas** de tipo de cambio, 2 UPPERCASE y 2 lowercase:

| id | clave | valor | fecha | actualizado_por | Quién lee |
|---|---|---|---|---|---|
| 1 | `TIPO_CAMBIO_OFICIAL` | 6.96 | 2025-11-21 | null | Enrichment n8n |
| 2 | `TIPO_CAMBIO_PARALELO` | **10.4** | **2025-11-24** | **null** | **Enrichment n8n (STALE)** |
| 3 | `tipo_cambio_oficial` | 6.96 | 2025-12-13 | seed_data | `recalcular_precio_propiedad()` |
| 4 | `tipo_cambio_paralelo` | **9.354** | **2026-03-07** | **binance_p2p** | `recalcular_precio_propiedad()` |

El enrichment leía UPPERCASE → obtenía 10.4 (congelada 3.5 meses). Binance actualizaba lowercase nightly → 9.354. Nunca se cruzaban.

### Fix aplicado: migración 174 (2026-03-07)

1. **SQL:** `UPDATE config_global SET activo = false WHERE id IN (1, 2)` — desactivadas, no borradas (audit trail)
2. **n8n "Cargar Config Global":** Query cambiada a leer `tipo_cambio_oficial` y `tipo_cambio_paralelo` (lowercase)
3. **n8n "Transformar Config":** Sin fallbacks hardcodeados. Si config_global no tiene TC, el workflow falla con error claro: `"TC paralelo no encontrado en config_global — verificar Binance workflow"`

---

## 4. Bug 2: normalizarPrecioUSD CASO 2 — PENDIENTE (paso 2)

### El problema

Cuando `detectarTipoCambio()` retorna `"paralelo"`, CASO 2 hace:

```javascript
// CASO 2 actual (Extractor Century21 v16.5):
if (tipoCambio === 'paralelo') {
    const precioEnBs = precio_original * CONFIG.TIPO_CAMBIO_USD_BS_PARALELO;
    const precioNormalizado = precioEnBs / CONFIG.TIPO_CAMBIO_USD_BS_OFICIAL;
    return { precio: Math.round(precioNormalizado), normalizado: true, precio_original };
}
```

El precio extraído del HTML ya es USD real. Multiplicar por TC_PARALELO/6.96 lo infla 33-49%.

### Confirmación: CASO 2 nunca tiene input legítimo en BOB

Investigado 2026-03-07:

1. **Todas las 144 props con `paralelo`** tienen `moneda_original = 'BOB'`. Pero `moneda_original` viene de la API de C21 (siempre BOB), no de la extracción HTML. El extractor busca precios en el texto de la descripción, donde los desarrolladores siempre cotizan en USD.

2. **Patrón universal en descripciones con "paralelo":** Los desarrolladores escriben `"$us 115,600 TC paralelo"` o `"82.900$ o tc paralelo"`. Nunca escriben `"Bs. 1,098,200 TC paralelo"` — el BOB es un derivado que C21 calcula internamente.

3. **Si el input fuera BOB (ej. 1,098,200) y CASO 2 se aplicara:** Haría `1,098,200 × 10.4 / 6.96 = 1,640,690 USD` → absurdamente alto. No vemos estos valores en BD → confirma que el input siempre es USD.

### Fix propuesto (paso 2 del plan)

```javascript
// CASO 2 corregido:
if (tipoCambio === 'paralelo') {
    return { precio: precio_original, normalizado: false, precio_original };
}
```

Retornar precio tal cual (como CASO 3). `detectarTipoCambio` sigue clasificando para metadata, pero no modifica el monto. `normalizado: false` para que merge compare con discovery en vez de priorizar ciegamente.

### Regex de detección (detectarTipoCambio v24.32)

```javascript
// Detecta "paralelo" cuando la descripción dice:
//   "tc paralelo", "cambio paralelo", "dólar blue", "tc blue"
//   "pago en dólares"
//   "tc del día" o "cambio del día" (sin número después)
//   "PRECIO ... $us ... dólares"
//
// Detecta "oficial" cuando dice:
//   "tc oficial", "tc 6", "tc 7"
//
// Default: "no_especificado"
```

---

## 5. Props con precio verificado: 85 para corrección

### 5.1 Propiedades OK (no tocar) — 6

| ID | Edificio | Precio desc | SICI | Error |
|---|---|---|---|---|
| 276 | Spazios Eden | $75,850 | $75,850 | 0% |
| 376 | Portofino 4 | $65,000 | $65,374 | +0.6% |
| 833 | Lofty Island | $116,000 | $116,000 | 0% |
| 834 | Lofty Island | $116,000 | $116,000 | 0% |
| 841 | Stone 3 | $100,000 | $100,000 | 0% |
| 887 | Sky Tower | $102,000 | $102,586 | +0.6% |

### 5.2 Falso positivo descubierto — 1

**ID 465** (Sky Plaza Italia): BD $89,128 vs desc $89,000 → 0.1% error → OK. Marcado como inflado por la fórmula `orig/6.96` pero el precio USD en BD es correcto.

### 5.3 Infladas verificadas — Auditoría original (57)

52 corregibles + 5 anticrético (ver sección 7). Ordenadas por % error descendente.

| ID | Edificio | Precio real (USD) | SICI precio_usd | % Error | Status | Candado |
|---|---|---:|---:|---:|---|---|
| 353 | Baruc IV | 52,000 | 114,751 | +121% | inactivo_confirmed | No |
| 235 | Sky Elite | 60,000 | 128,815 | +115% | inactivo_confirmed | No |
| 971 | Sky Onix | 76,000 | 150,929 | +99% | completado | No |
| 1040 | Torre Fragata | 218,500 | 422,191 | +93% | completado | No |
| 849 | Spazios 1 | 312,717 | 469,963 | +50% | completado | No |
| 527 | Moderno | 79,050 | 118,345 | +50% | completado | No |
| 577 | Sky Eclipse | 115,600 | 172,736 | +49% | completado | No |
| 578 | Sky Eclipse | 70,550 | 105,420 | +49% | completado | No |
| 972 | SKY ECLIPSE | 174,000 | 260,000 | +49% | completado | No |
| 968 | Condado Park | 102,647 | 153,381 | +49% | completado | No |
| 1010 | Bamboo | 49,500 | 73,966 | +49% | completado | No |
| 1011 | Plus+ Isuto | 97,500 | 145,690 | +49% | completado | No |
| 902 | Nomad | 70,000 | 104,598 | +49% | completado | No |
| 177 | Domus Insignia | 37,212 | 55,604 | +49% | inactivo_confirmed | No |
| 247 | Domus Infinity | 51,609 | 77,117 | +49% | inactivo_confirmed | No |
| 248 | Domus Tower | 45,376 | 67,803 | +49% | inactivo_confirmed | No |
| 288 | Aguai | 78,000 | 116,552 | +49% | inactivo_confirmed | No |
| 392 | Swissotel | 125,000 | 186,782 | +49% | completado | No |
| 416 | Curupau Isuto | 60,000 | 89,655 | +49% | inactivo_confirmed | No |
| 450 | Aria | 249,000 | 372,060 | +49% | completado | No |
| 933 | Sky Eclipse | 115,600 | 172,736 | +49% | inactivo_pending | No |
| 236 | Ara Equipetrol | 68,000 | 94,946 | +40% | inactivo_confirmed | No |
| 394 | Platinum II | 278,000 | 388,161 | +40% | inactivo_confirmed | No |
| 415 | Curupau Isuto | 255,000 | 356,047 | +40% | completado | No |
| 342 | Spazios Eden | 145,530 | 196,164 | +35% | inactivo_pending | Si |
| 488 | Spazios Eden | 145,530 | 196,164 | +35% | inactivo_pending | Si |
| 343 | Spazios Eden | 58,212 | 77,844 | +34% | inactivo_pending | Si |
| 559 | Platinum | 115,000 | 154,126 | +34% | completado | Si |
| 355 | Omnia Prime | 100,000 | 134,023 | +34% | completado | Si |
| 357 | Con. Luciana | 110,000 | 147,425 | +34% | completado | Si |
| 151 | Sky Equinox | 71,890 | 96,535 | +34% | completado | Si |
| 153 | Sky Equinox | 71,890 | 95,585 | +33% | completado | Si |
| 154 | Sky Equinox | 71,890 | 95,585 | +33% | completado | Si |
| 155 | Sky Equinox | 71,890 | 95,585 | +33% | completado | Si |
| 152 | Sky Equinox | 45,760 | 60,842 | +33% | completado | Si |
| 175 | MARE | 240,600 | 319,901 | +33% | completado | Si |
| 207 | Domus Infinity | 65,024 | 86,456 | +33% | completado | Si |
| 529 | Condado II | 215,000 | 285,864 | +33% | completado | Si |
| 555 | Sky Luxia | 75,000 | 99,720 | +33% | completado | Si |
| 349 | Spazios Eden | 56,826 | 75,556 | +33% | inactivo_pending | Si |
| 458 | Sky Tower | 66,528 | 88,455 | +33% | completado | Si |
| 622 | Baruc II | 66,500 | 88,495 | +33% | completado | Si |
| 602 | MonteBelluna | 150,000 | 199,612 | +33% | completado | Si |
| 835 | AZUL | 142,000 | 187,987 | +32% | completado | Si |
| 838 | Spazios Eden | 145,530 | 192,660 | +32% | completado | Si |
| 595 | Bloque La Salle | 320,000 | 423,632 | +32% | completado | Si |
| 367 | HH Once | 108,400 | 142,745 | +32% | completado | Si |
| 636 | Sky Collection | 120,000 | 157,931 | +32% | completado | Si |
| 230 | Kados | 110,000 | 144,644 | +32% | inactivo_confirmed | Si |
| 317 | La Riviera | 396,000 | 517,241 | +31% | completado | No |
| 295 | Sky Moon | 83,500 | 109,798 | +31% | inactivo_pending | Si |
| 829 | Spazios Eden | 56,826 | 73,580 | +30% | completado | Si |
| 157 | Ed. Kenya | 55,000 | 71,216 | +30% | completado | Si |
| 526 | Vertical Terra | 79,050 | 100,129 | +27% | completado | Si |
| 874 | Sky Plaza Italia | 109,000 | 132,989 | +22% | completado | No |
| 232 | Smart Studio | 55,000 | 67,170 | +22% | completado | No |
| 204 | Sky Art Deco | 195,000 | 232,680 | +19% | completado | Si |

### 5.4 Infladas verificadas — Nuevas descubiertas (28)

Encontradas el 2026-03-07 al investigar las 89 props con `paralelo` fuera de la auditoría original.

**11 completado (activas):**

| ID | Edificio | Precio real (USD) | SICI precio_usd | % Error | Candado |
|---|---|---:|---:|---:|---|
| 483 | Platinium | 82,900 | 176,199 | +113% | No |
| 1104 | Stanza | 82,000 | 156,510 | +91% | No |
| 243 | La Casona | 100,000 | 153,810 | +54% | No |
| 975 | Luxe Suites | 73,000 | 109,080 | +49% | No |
| 977 | Breeze Tower | 85,000 | 127,011 | +49% | No |
| 996 | Smart Equipe 3 | 58,000 | 86,667 | +49% | No |
| 395 | Curupau Isuto | 89,900 | 134,333 | +49% | No |
| 298 | Ed. ITAJU | 327,000 | 477,326 | +46% | Si |
| 302 | Ed. ITAJU | 526,000 | 764,519 | +45% | Si |
| 530 | Macororo 12 | 140,000 | 186,144 | +33% | Si |
| 18 | Sky Eclipse | 170,000 | 225,055 | +32% | Si |

**17 inactivo:**

| ID | Edificio | Precio real (USD) | SICI precio_usd | % Error | Status |
|---|---|---:|---:|---:|---|
| 278 | Macororo 7 | 170,000 | 429,383 | +153% | inactivo_pending |
| 451 | (sin nombre) | 45,000 | 88,367 | +96% | inactivo_confirmed |
| 174 | Condado | 99,536 | 148,732 | +49% | inactivo_pending |
| 196 | Domus Insignia | 30,942 | 46,235 | +49% | inactivo_confirmed |
| 197 | Domus Insignia | 82,320 | 123,007 | +49% | inactivo_confirmed |
| 271 | Domus Infinity | 46,515 | 69,505 | +49% | inactivo_confirmed |
| 272 | Domus Infinity | 46,515 | 69,505 | +49% | inactivo_confirmed |
| 323 | Sky Moon | 120,000 | 179,310 | +49% | inactivo_confirmed |
| 382 | Vertical Terra | 97,162 | 145,185 | +49% | inactivo_confirmed |
| 386 | Sky Blue | 59,449 | 88,832 | +49% | inactivo_confirmed |
| 222 | Eurodesign Tower | 53,130 | 71,344 | +34% | inactivo_confirmed |
| 619 | Sky Moon | 260,000 | 348,460 | +34% | inactivo_pending |
| 169 | La Foret | 144,573 | 192,224 | +33% | inactivo_pending |
| 220 | Eurodesign Tower | 62,700 | 83,366 | +33% | inactivo_confirmed |
| 221 | Eurodesign Tower | 53,500 | 71,133 | +33% | inactivo_confirmed |
| 228 | Domus Infinity | 56,870 | 75,614 | +33% | inactivo_confirmed |
| 490 | Lofty Island | 44,000 | 57,857 | +32% | inactivo_confirmed |

### 5.5 Clusters de inflación (85 props)

| Cluster | % Error | Cant | TC paralelo usado | Causa |
|---|---|---|---|---|
| ~49% | 44-50% | 30 | 10.4 (config stale) | Config MAYÚSCULA congelada (id=2) |
| ~33% | 29-35% | 45 | 9.2-9.4 (Binance real) | TC correcto pero bug CASO 2 sigue multiplicando |
| ~40% | 38-40% | 4 | 9.7 | TC Binance de ese período |
| >90% | 90-153% | 6 | Varios | Doble conversión o extracción errónea |

---

## 6. Props pendientes de revisión manual: 16

### 6.1 Precio ambiguo (4) — descripción dice "desde" (precio mínimo del proyecto)

| ID | Edificio | SICI precio_usd | Desc dice | Status |
|---|---|---:|---|---|
| 299 | Edificio ITAJU | 477,326 | "desde 327,000 USDT" (piso, no unidad) | completado |
| 300 | Edificio ITAJU | 490,622 | "desde 327,000 USDT" (piso, no unidad) | completado |
| 301 | Edificio ITAJU | 477,330 | "desde 327,000 USDT" (piso, no unidad) | completado |
| 494 | Luxe Tower | 216,992 | Solo precio/m2 ($1,250-1,450) | completado |

### 6.2 Sin precio en descripción (12) — requieren visita al URL

| ID | Edificio | SICI precio_usd | Status |
|---|---|---:|---|
| 208 | T-Veinticinco | 232,505 | inactivo_pending |
| 209 | T-Veinticinco | 190,171 | inactivo_pending |
| 210 | T-Veinticinco | 232,500 | inactivo_pending |
| 211 | T-Veinticinco | 188,075 | inactivo_pending |
| 212 | T-Veinticinco | 232,500 | inactivo_pending |
| 213 | T-Veinticinco | 190,171 | inactivo_pending |
| 214 | T-Veinticinco | 272,328 | inactivo_pending |
| 215 | T Veinticinco | 303,982 | inactivo_pending |
| 216 | T-Veinticinco | 215,745 | inactivo_pending |
| 217 | T Veinticinco | 236,551 | inactivo_pending |
| 308 | Sky Lux | 268,046 | completado |
| 521 | Experience | 103,983 | completado |

---

## 7. Anticrético Mal Clasificado como Venta

### Ya corregidos (2)

| ID | Edificio | Acción |
|---|---|---|
| 839 | Stone 3 | Cambiado a `anticretico` |
| 840 | Stone 3 | Cambiado a `anticretico` |

### Corregidos (6/6) — HECHO 2026-03-07

| ID | Edificio | Método |
|---|---|---|
| 839 | Stone 3 | Corregido previamente |
| 840 | Stone 3 | Corregido previamente |
| 160 | — | Corregido previamente |
| 164 | — | Corregido previamente |
| 448 | — | Corregido previamente |
| 596 | La Casona | Migración 176 |
| 637 | Luxe Suites | Migración 176 |
| 495 | Hotel Yotau | UPDATE manual post-migración |
| 950 | Sky Luxia | UPDATE manual post-migración |

---

## 8. Plan de Corrección (4 pasos)

### Paso 1: Fix config_global — HECHO (migración 174, 2026-03-07)

- Desactivadas id=1,2 (UPPERCASE stale) con `activo = false`
- n8n cambiado a leer lowercase (id=3,4)
- Sin fallbacks hardcodeados: workflow falla con error claro si TC no encontrado

### Paso 2: Fix normalizarPrecioUSD CASO 2 — HECHO (migración 175, 2026-03-07)

Cambio en Extractor Century21 v16.5 (flujo_b_processing_v3.0.json):

```javascript
// ANTES:
if (tipoCambio === 'paralelo') {
    const precioEnBs = precio_original * CONFIG.TIPO_CAMBIO_USD_BS_PARALELO;
    const precioNormalizado = precioEnBs / CONFIG.TIPO_CAMBIO_USD_BS_OFICIAL;
    return { precio: Math.round(precioNormalizado), normalizado: true, precio_original };
}

// DESPUÉS:
if (tipoCambio === 'paralelo') {
    return { precio: precio_original, normalizado: false, precio_original };
}
```

Verificado que merge no re-infla: `depende_de_tc` se pone `false` porque merge chequea `precio_fue_normalizado = true AND tipo_cambio IN ('paralelo','oficial')`. Con normalizado=false, la condición no se cumple.

### Paso 3: UPDATE de 85 propiedades — HECHO (migración 176, 2026-03-07)

UPDATE con precios verificados de la descripción + reset de campos derivados:
- `precio_usd` = precio real de la descripción
- `precio_usd_actualizado` = precio_usd (sin re-expresión, es USD real)
- `depende_de_tc` = false (precio USD fijo)
- `requiere_actualizacion_precio` = false

**Verificación post-ejecución: 85/85 OK** en todos los campos.

### Paso 4: Candados — HECHO (migración 176, 2026-03-07)

Candado `campos_bloqueados->'precio_usd'` con metadata completa (`bloqueado`, `por`, `fecha`, `motivo`, `valor_original`). Las 30 que ya tenían candado se preservaron. Las 55 restantes recibieron candado nuevo con `por: 'migracion_176'`.

**Verificación: 85/85 con candado activo.**

### Anticréticos — HECHO (migración 176 + UPDATE manual, 2026-03-07)

6 propiedades reclasificadas de `venta` a `anticretico`:
- IDs 839, 840 (corregidos previamente)
- IDs 596, 637 (migración 176)
- IDs 495, 950 (UPDATE manual post-migración)

### Resumen ejecución

```
2026-03-07:
  Paso 1 (config_global)           ✅ HECHO — migración 174
  Paso 2 (fix extractor n8n)       ✅ HECHO — migración 175 + deploy n8n
  Paso 3 (UPDATE 85 props)         ✅ HECHO — migración 176
  Paso 4 (candados 85 props)       ✅ HECHO — migración 176
  Anticréticos (6 props)           ✅ HECHO — migración 176 + manual
Pendiente:
  Verificar pipeline nocturno (mañana)
  Revisar 16 props manual
```

---

## 9. IDs Consolidados

### Para corrección de precio (85)

```
-- Auditoría original (57):
151, 152, 153, 154, 155, 157, 175, 177, 204, 207,
230, 232, 235, 236, 247, 248, 288, 295, 317, 342,
343, 349, 353, 355, 357, 367, 392, 394, 415, 416,
450, 458, 488, 526, 527, 529, 555, 559, 577, 578,
595, 602, 622, 636, 829, 835, 838, 849, 874, 902,
933, 968, 971, 972, 1010, 1011, 1040

-- Nuevas verificadas (28):
18, 169, 174, 196, 197, 220, 221, 222, 228, 243,
271, 272, 278, 298, 302, 323, 382, 386, 395, 451,
483, 490, 530, 619, 975, 977, 996, 1104
```

### Para revisión manual (16)

```
-- Precio ambiguo (4): 299, 300, 301, 494
-- Sin precio (12): 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 308, 521
```

### Anticrético — HECHO (todos corregidos)

```
495, 596, 637, 950 — reclasificados a 'anticretico'
```

### Falso positivo (no tocar)

```
465
```

---

*Auditoría realizada con queries directos a producción. Datos verificados al 2026-03-07.*
