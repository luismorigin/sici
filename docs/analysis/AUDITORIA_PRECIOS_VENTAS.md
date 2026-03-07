# Auditoría de Precios — Ventas Equipetrol

**Fecha:** 2026-03-01
**Scope:** Todas las propiedades de venta con precio anómalo (101 props analizadas)
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

Pero hay un bug: el recálculo usa una fórmula que asume `precio_usd` fue convertido al oficial (6.96). Si fue inflado por el bug del extractor, el recálculo infla aún más.

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
    ├─ Scrapea HTML, extrae precio de meta tags
    ├─ detectarTipoCambio(desc) → regex
    ├─ normalizarPrecioUSD() → CASO 1/2/3
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
    ├─ Actualiza config_global.tipo_cambio_paralelo
    └─ Batch recalcula precio_usd_actualizado
```

---

## 2. Resultados del Scan: Precio Descripción vs precio_usd SICI

### 2.1 Resumen

| Veredicto | Cantidad | % |
|---|---|---|
| **INFLADO** (>10% más alto) | **60** | 59% |
| **SIN PRECIO EN DESC** | **35** | 35% |
| **OK** (±10%) | **6** | 6% |
| **BAJO** | **0** | 0% |

Error promedio de las 60 infladas: **+40%**. Cero props con precio bajo. Bug 100% unidireccional.

### 2.2 Propiedades OK (6)

| ID | Edificio | Precio desc | SICI | Error |
|---|---|---|---|---|
| 276 | Spazios Eden | $75,850 | $75,850 | 0% |
| 376 | Portofino 4 | $65,000 | $65,374 | +0.6% |
| 833 | Lofty Island | $116,000 | $116,000 | 0% |
| 834 | Lofty Island | $116,000 | $116,000 | 0% |
| 841 | Stone 3 | $100,000 | $100,000 | 0% |
| 887 | Sky Tower | $102,000 | $102,586 | +0.6% |

### 2.3 Propiedades INFLADAS (60)

Ordenadas por % error descendente.

| ID | Edificio | Precio desc (USD) | SICI precio_usd | % Error |
|---|---|---|---|---|
| 353 | Baruc IV | 52,000 | 114,751 | +121% |
| 235 | Sky Elite | 60,000 | 128,815 | +115% |
| 971 | Sky Onix | 76,000 | 150,929 | +99% |
| 1040 | Torre Fragata | 218,500 | 422,191 | +93% |
| 849 | Spazios 1 | 312,717 | 469,963 | +50% |
| 527 | Moderno/V. Terra | 79,050 | 118,345 | +50% |
| 577 | Sky Eclipse | 115,600 | 172,736 | +49% |
| 578 | Sky Eclipse | 70,550 | 105,420 | +49% |
| 933 | Sky Eclipse | 115,600 | 172,736 | +49% |
| 972 | SKY ECLIPSE | 174,000 | 260,000 | +49% |
| 968 | Condado Park | 102,647 | 153,381 | +49% |
| 1010 | Bamboo | 49,500 | 73,966 | +49% |
| 1011 | Plus+ Isuto | 97,500 | 145,690 | +49% |
| 902 | Nomad | 70,000 | 104,598 | +49% |
| 177 | Domus Insignia | 37,212 | 55,604 | +49% |
| 247 | Domus Infinity | 51,609 | 77,117 | +49% |
| 248 | Domus Tower | 45,376 | 67,803 | +49% |
| 288 | Aguai | 78,000 | 116,552 | +49% |
| 392 | Swissotel | 125,000 | 186,782 | +49% |
| 416 | Curupau Isuto | 60,000 | 89,655 | +49% |
| 450 | Aria | 249,000 | 372,060 | +49% |
| 236 | Ara Equipetrol | 68,000 | 94,946 | +40% |
| 394 | Platinum II | 278,000 | 388,161 | +40% |
| 415 | Curupau Isuto | 255,000 | 356,047 | +40% |
| 342 | Spazios Eden | 145,530 | 196,164 | +35% |
| 488 | Spazios Eden | 145,530 | 196,164 | +35% |
| 559 | Platinum | 115,000 | 154,126 | +34% |
| 355 | Omnia Prime | 100,000 | 134,023 | +34% |
| 357 | Con. Luciana | 110,000 | 147,425 | +34% |
| 151 | Sky Equinox | 71,890 | 96,535 | +34% |
| 153 | Sky Equinox | 71,890 | 95,585 | +33% |
| 154 | Sky Equinox | 71,890 | 95,585 | +33% |
| 155 | Sky Equinox | 71,890 | 95,585 | +33% |
| 152 | Sky Equinox | 45,760 | 60,842 | +33% |
| 175 | MARE | 240,600 | 319,901 | +33% |
| 207 | Domus Infinity | 65,024 | 86,456 | +33% |
| 529 | Condado II | 215,000 | 285,864 | +33% |
| 555 | Sky Luxia | 75,000 | 99,720 | +33% |
| 349 | Spazios Eden | 56,826 | 75,556 | +33% |
| 343 | Spazios Eden | 58,212 | 77,844 | +34% |
| 458 | Sky Tower | 66,528 | 88,455 | +33% |
| 622 | Baruc II | 66,500 | 88,495 | +33% |
| 602 | MonteBelluna | 150,000 | 199,612 | +33% |
| 835 | AZUL | 142,000 | 187,987 | +32% |
| 838 | Spazios Eden | 145,530 | 192,660 | +32% |
| 595 | Bloque La Salle | 320,000 | 423,632 | +32% |
| 367 | HH Once | 108,400 | 142,745 | +32% |
| 636 | Sky Collection | 120,000 | 157,931 | +32% |
| 230 | Kados | 110,000 | 144,644 | +32% |
| 317 | La Riviera | 396,000 | 517,241 | +31% |
| 295 | Sky Moon | 83,500 | 109,798 | +31% |
| 829 | Spazios Eden | 56,826 | 73,580 | +30% |
| 157 | Ed. Kenya | 55,000 | 71,216 | +30% |
| 526 | Vertical Terra | 79,050 | 100,129 | +27% |
| 874 | (sin nombre) | 109,000 | 132,989 | +22% |
| 232 | Smart Studio | 55,000 | 67,170 | +22% |
| 204 | Sky Art Deco | 195,000 | 232,680 | +19% |

### 2.4 Clusters de inflación

| Cluster | % Error | Cant | TC paralelo usado | Causa |
|---|---|---|---|---|
| ~49% | 44-50% | 17 | 10.4 (config stale) | Config MAYÚSCULA congelada |
| ~33% | 29-35% | 33 | 9.2-9.3 (Binance real) | TC correcto pero bug CASO 2 |
| ~40% | 38-40% | 4 | 9.7 | TC Binance de ese período |
| >90% | 93-121% | 4 | Varios | Doble conversión o extracción errónea |
| ~19-27% | 19-27% | 2 | ~9.0 | TC más reciente |

### 2.5 Propiedades SIN PRECIO EN DESCRIPCIÓN (35)

Precio no visible en la descripción (truncada o no incluye monto). Requieren verificación manual visitando el URL.

| ID | Edificio | SICI precio_usd | precio_usd_original (BOB) | TC ratio |
|---|---|---|---|---|
| 176 | Uptown Equipetrol | 1,839,080 | 9,100,000 | 4.95 |
| 208 | T-Veinticinco | 232,505 | 1,217,090 | 5.23 |
| 209 | T-Veinticinco | 190,171 | 995,484 | 5.23 |
| 210 | T-Veinticinco | 232,500 | 1,217,062 | 5.23 |
| 211 | T-Veinticinco | 188,075 | 995,484 | 5.29 |
| 212 | T-Veinticinco | 232,500 | 1,217,062 | 5.23 |
| 213 | T-Veinticinco | 190,171 | 995,484 | 5.23 |
| 214 | T-Veinticinco | 272,328 | 1,217,090 | 4.47 |
| 215 | T Veinticinco | 303,982 | 1,415,904 | 4.66 |
| 216 | T-Veinticinco | 215,745 | 1,129,352 | 5.23 |
| 217 | T Veinticinco | 236,551 | 1,101,814 | 4.66 |
| 243 | La Casona | 153,810 | 766,700 | 4.98 |
| 257 | Multifamiliar | 150,862 | 980,000 | 6.50 |
| 278 | Macororo 7 | 429,383 | 2,000,000 | 4.66 |
| 298 | Edificio ITAJU | 477,326 | 2,637,840 | 5.53 |
| 299 | Edificio ITAJU | 477,326 | 2,498,640 | 5.23 |
| 300 | Edificio ITAJU | 490,622 | 2,568,240 | 5.23 |
| 301 | Edificio ITAJU | 477,330 | 2,568,240 | 5.38 |
| 302 | Edificio ITAJU | 764,519 | 4,002,000 | 5.23 |
| 308 | Sky Lux | 268,046 | 1,392,000 | 5.19 |
| 335 | Haus Equipetrol | 93,680 | 595,000 | 6.35 |
| 372 | Klug | 134,698 | 712,500 | 5.29 |
| 395 | Curupau Isuto | 134,333 | 595,080 | 4.43 |
| 422 | INIZIO | 168,492 | 875,000 | 5.19 |
| 451 | (sin nombre) | 88,367 | 411,600 | 4.66 |
| 465 | Sky Plaza Italia | 89,128 | 543,660 | 6.10 |
| 483 | Platinium | 176,199 | 820,710 | 4.66 |
| 486 | STONE 2 | 158,616 | 1,000,000 | 6.30 |
| 487 | Sky Moon | 386,494 | 2,229,500 | 5.77 |
| 494 | Luxe Tower | 216,992 | 1,134,900 | 5.23 |
| 521 | Experience | 103,983 | 540,000 | 5.19 |
| 530 | Macororo 12 | 186,144 | 974,400 | 5.23 |
| 575 | Sky Elite | 125,575 | 736,000 | 5.86 |
| 619 | Sky Moon | 348,460 | 1,809,600 | 5.19 |
| 621 | Las Dalias | 188,575 | 1,041,197 | 5.52 |
| 875 | (sin nombre) | 81,000 | 516,320 | 6.37 |
| 996 | Smart Equipe 3 | 86,667 | 403,680 | 4.66 |
| 1041 | El Mirador | 373,563 | 2,375,000 | 6.36 |

---

## 3. Bug: config_global Duplicada

### Hallazgo

`config_global` tiene **dos entradas** para el TC paralelo con distinta capitalización:

| id | clave | valor | última actualización | actualizado_por |
|---|---|---|---|---|
| 2 | `TIPO_CAMBIO_PARALELO` | **10.4** | 2025-11-24 | (manual) |
| 4 | `tipo_cambio_paralelo` | **9.012** | 2026-02-24 | binance_p2p |

### Quién lee qué

| Componente | Clave que lee | Valor que obtiene |
|---|---|---|
| Enrichment extractor (n8n flujo_b) | `TIPO_CAMBIO_PARALELO` (MAYÚSCULA) | **10.4** (stale) |
| TC dinámico Binance | `tipo_cambio_paralelo` (minúscula) | 9.012 (actualizado) |
| `recalcular_precio_propiedad()` | ? (verificar) | ? |
| `precio_normalizado()` query layer | ? (verificar) | ? |
| Frontend `normalizarPrecio()` | ? (verificar) | ? |

### Código del extractor (flujo_b_processing_v3.0.json, línea 50)

```sql
-- Query que carga config:
SELECT clave, valor FROM config_global
WHERE clave IN ('TIPO_CAMBIO_OFICIAL', 'TIPO_CAMBIO_PARALELO') AND activo = true
```

```javascript
// Transformar Config (línea 71):
config.TIPO_CAMBIO_USD_BS_PARALELO = config.TIPO_CAMBIO_PARALELO || 10.20

// Extractor (línea 509):
const TC_PARALELO = configGlobal.TIPO_CAMBIO_USD_BS_PARALELO || 7.25;
```

### Impacto

- 17 propiedades procesadas con TC = 10.4 → inflación ~49%
- Otras 43 propiedades de alguna forma obtuvieron TC ~9.2 de Binance (posiblemente por otro path o versión anterior del extractor)
- **El extractor sigue leyendo 10.4 HOY** — cada propiedad nueva que se enriquece con `detectado = 'paralelo'` se infla

### Fix requerido

Opción A: Actualizar id=2 a 9.012 y que Binance actualice AMBAS claves.
Opción B: Cambiar el query del extractor para leer `tipo_cambio_paralelo` (minúscula).
Opción C: Borrar id=2 y renombrar id=4 a MAYÚSCULA.

---

## 4. Bug: normalizarPrecioUSD CASO 2

### El problema

Cuando `detectarTipoCambio()` retorna `"paralelo"`, el CASO 2 hace:

```javascript
// CASO 2: Asume que precio_original está en USD (calculado al blue)
const precioEnBs = precio_original * TC_PARALELO;     // USD × 10.4
const precioNormalizado = precioEnBs / TC_OFICIAL;      // ÷ 6.96
return { precio: Math.round(precioNormalizado), normalizado: true };
```

El comentario dice "asume que precio_original está en USD (calculado al blue)". La intención es re-expresar un precio USD-blue al TC oficial. Pero en la práctica, el precio extraído del HTML **ya es el precio USD final** que el desarrollador publicó.

### Ejemplo concreto

ID 247 — Domus Infinity:
- Descripción: "Precio desde: **51.609$us** — Cancela en Bolivianos, al tipo de cambio paralelo"
- El precio ES $51,609 USD. "Cancela al paralelo" significa que si pagás en BOB, te cobran BOB = 51,609 × TC_paralelo_del_día
- CASO 2 hace: `51,609 × 10.4 / 6.96 = 77,117` → **inflado 49%**
- El precio correcto es simplemente **$51,609**

### Regex de detección (detectarTipoCambio v24.32)

```javascript
function detectarTipoCambio(descripcion) {
    // Detecta "paralelo" cuando la descripción dice:
    // - "tc paralelo", "cambio paralelo", "dólar blue"
    // - "pago en dólares"
    // - "tc del día" (sin número)
    // - "PRECIO ... $us ... dólares"

    // Detecta "oficial" cuando dice:
    // - "tc oficial", "tc 6", "tc 7"

    // Default: "no_especificado"
}
```

Nota: "pago en dólares" → retorna "paralelo", lo cual dispara CASO 2. Pero "pago en dólares" significa que el precio YA ESTÁ EN USD, no que necesita conversión.

---

## 5. Pregunta Arquitectural Pendiente

### ¿SICI trabaja en USD real o USD re-expresado al oficial?

Actualmente SICI tiene una ambigüedad:

- `precio_usd` se llena desde el enrichment. Para props con "paralelo", el CASO 2 re-expresa al oficial: `USD_blue × TC_paralelo / 6.96`
- `precio_usd_actualizado` ajusta con TC actual: `precio_usd × tc_actual / 6.96`
- El query layer `precio_normalizado()` hace lo mismo al vuelo

**Pero**: los 60 casos analizados muestran que las descripciones publican **USD real** ("$60,000 en dólares, o Bs al paralelo"). No hay "USD blue" vs "USD oficial" — hay UN precio en USD y la opción de pagar en BOB al paralelo.

### Definición necesaria antes de corregir

Antes de hacer cualquier UPDATE masivo, decidir:

1. **¿`precio_usd` = dólares reales del listing?** → Entonces las 60 se corrigen al precio de la descripción, y `precio_usd_actualizado` deja de tener sentido para estas
2. **¿`precio_usd` = precio re-expresado al TC oficial?** → Entonces la fórmula del CASO 2 sería correcta en concepto, pero necesita usar el TC correcto (no 10.4)

---

## 6. Anticrético Mal Clasificado como Venta

### Ya corregidos (2)

| ID | Edificio | Acción |
|---|---|---|
| 839 | Stone 3 | Cambiado a `anticretico` |
| 840 | Stone 3 | Cambiado a `anticretico` |

### Pendientes de corregir (7)

```sql
-- EJECUTAR para corregir:
UPDATE propiedades_v2 SET tipo_operacion = 'anticretico'
WHERE id IN (164, 448, 160, 596, 950, 495, 637);
```

| ID | Edificio | Descripción dice |
|---|---|---|
| 160 | (3er anillo Udabol) | "DEPARTAMENTO EN ANTICRÉTICO Bs 161.000" |
| 164 | (3er anillo Udabol) | "DEPARTAMENTO EN ANTICRÉTICO – Bs 150.000" |
| 448 | Baruc II | "Monoambiente amoblado y Equipado + parqueo en Anticretico" |
| 495 | Hotel Yotau | "EN ANTICRETICO DEPARTAMENTO DE 1 DORMITORIO" |
| 596 | La Casona | "DEPARTAMENTO AMOBLADO 3 DORMITORIOS EN ANTICRETICO" |
| 637 | Luxe Suites | "Precio Anticrético: 243.600,- Bs" |
| 950 | Sky Luxia | "MONOAMBIENTE AMOBLADO EN ANTICRETICO" |

---

## 7. Lista Completa de IDs Afectados

### IDs con precio inflado confirmado (60) — requieren corrección de precio_usd

```
151, 152, 153, 154, 155, 157, 175, 177, 204, 207,
230, 232, 235, 236, 247, 248, 288, 295, 317, 342,
343, 349, 353, 355, 357, 367, 392, 394, 415, 416,
450, 458, 488, 526, 527, 529, 555, 559, 577, 578,
595, 602, 622, 636, 829, 833, 834, 835, 838, 841,
849, 874, 887, 902, 933, 968, 971, 972, 1010, 1011, 1040
```

Nota: IDs 276, 376, 833, 834, 841, 887 están OK — no tocar.

### IDs sin precio en descripción (35) — requieren verificación manual

```
176, 208, 209, 210, 211, 212, 213, 214, 215, 216,
217, 243, 257, 278, 298, 299, 300, 301, 302, 308,
335, 372, 395, 422, 451, 465, 483, 486, 487, 494,
521, 530, 575, 619, 621, 875, 996, 1041
```

### IDs anticrético pendientes (7) — cambiar tipo_operacion

```
160, 164, 448, 495, 596, 637, 950
```

---

## 8. Próximos Pasos (No ejecutados)

1. **Decidir**: ¿precio_usd = USD real o re-expresado? (ver sección 5)
2. **Fix config_global**: Unificar las dos claves de TC paralelo
3. **Fix extractor**: Revisar lógica CASO 2 de normalizarPrecioUSD
4. **UPDATE 60 props**: Corregir precio_usd al valor real de la descripción
5. **Verificar 35 sin precio**: Visitar URLs o revisar datos_json más detalladamente
6. **Corregir 7 anticrético**: UPDATE tipo_operacion

---

*Auditoría realizada con queries directos a producción. Datos al 2026-03-01.*
