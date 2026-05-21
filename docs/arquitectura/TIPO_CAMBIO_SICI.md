# Tipo de Cambio en SICI — Documento Autoritativo

**Fecha:** 10 de marzo de 2026
**Ultima actualizacion:** 10 de marzo de 2026 (post-fix dashboard double-normalization)
**Status:** Documento de referencia para entender el sistema de TC y precios en SICI
**Actualizar este documento** antes de modificar cualquier extractor, merge o funcion de precio.

---

## 1. Definicion de campos

### `precio_usd` (propiedades_v2)
- **Que es:** El precio en USD almacenado en la BD. Es el valor sobre el cual opera todo el sistema.
- **Origen:** Lo escribe el merge (`merge_discovery_enrichment.sql`) tomando el valor del enrichment o discovery.
- **Contrato:** Deberia representar USD reales del listing. NO se modifica por TC despues del merge.
- **Tipo:** NUMERIC(12,2)

### `moneda_original` (datos_json_enrichment)
- **Que es:** La moneda en la que el portal publico el precio.
- **Valores:** `"USD"` | `"BOB"`
- **Quien lo asigna:**
  - **Remax:** `currency_id === 1` → `"BOB"`, otro → `"USD"` (del JSON del portal)
  - **Century21:** `normalizacionPrincipal.normalizado ? "BOB" : "USD"` (heuristica post-normalizacion)
  - **Bien Inmuebles:** `moneda_cata === '2'` → `"USD"`, otro → `"BOB"` (campo API)
- **Nota C21:** Cuando C21 detecta "paralelo" en un precio USD, `normalizado=true` y `moneda_original="BOB"` — es un misnomer. La moneda real era USD, pero el extractor normalizo.

### `tipo_cambio_detectado` (propiedades_v2 + datos_json_enrichment)
- **Que es:** Si el vendedor indica que su precio es al TC paralelo, oficial, o no lo especifica.
- **Valores:** `"paralelo"` | `"oficial"` | `"no_especificado"`
- **Quien lo detecta:**
  - **Extractores (regex):** Funcion `detectarTipoCambio()` en ambos extractores
  - **LLM Enrichment:** El LLM lo extrae de la descripcion con mayor contexto
  - **Merge:** Escribe `v_enr_tipo_cambio_detectado` a la columna (desde v2.2.0, fix 14 Ene 2026)
- **Reglas de deteccion (regex):**
  - `paralelo`: "tc paralelo", "cambio paralelo", "dolar blue", "pago en dolares"
  - `oficial`: "tc oficial", "tc 7", "tc 6"
  - `no_especificado`: default

### `depende_de_tc` (propiedades_v2)
- **Que es:** Flag booleano que indica si `precio_usd` fue derivado de BOB.
- **Quien lo calcula:** El merge, lineas 825-830:
  ```sql
  depende_de_tc = CASE
      WHEN v_enr_tipo_cambio_detectado IN ('paralelo', 'oficial')
           AND v_enr_precio_fue_normalizado = true
      THEN true
      ELSE false
  END
  ```
- **Cuando es true:** TC detectado (paralelo u oficial) + precio fue normalizado de BOB a USD.

### `precio_normalizado()` (funcion SQL)
- **Que es:** Funcion que calcula precio comparable para queries de mercado.
- **Archivo:** `sql/functions/helpers/precio_normalizado.sql`
- **Logica:**
  ```sql
  CASE
    WHEN p_tipo_cambio_detectado = 'paralelo' THEN
      ROUND(p_precio_usd * (SELECT valor FROM config_global
        WHERE clave = 'tipo_cambio_paralelo') / 6.96, 2)
    ELSE p_precio_usd
  END
  ```
- **Intencion:** Si el precio es en "dolares billete" (paralelo), ajustar al equivalente en USD oficial para que sea comparable con precios publicados al TC oficial.
- **Donde se usa:** Todos los queries de mercado, informes, buscar_unidades_reales, buscar_unidades_alquiler.

---

## 2. Como publica cada portal

### 2.1 Remax

**Fuente de precio:** JSON embebido en atributo `data-page` del HTML.
```js
listing.prices.amount     // Valor numerico (ej: 1359490)
listing.prices.currency_id // 1 = BOB, 2+ = USD
```

**Caracteristicas:**
- Siempre trae un precio numerico limpio
- `currency_id` es confiable — campo estructurado del sistema Remax
- Muchos listings en Bolivia se publican en BOB (currency_id=1)
- La descripcion frecuentemente menciona un precio USD alternativo (ej: "Precio: 143,105 $us. a t.c. paralelo")

### 2.2 Century21

**Fuente de precio:** No tiene campo moneda explicito. Se extrae de multiples fuentes con fallback:
1. `precioExplicitoDesc` — regex sobre descripcion (mayor prioridad)
2. `precioMetaNum` — meta tag HTML
3. `precioHTMLVisible` — valor visible en la pagina

**Patrones de extraccion (en orden de prioridad):**
```js
/(?:precio|desde)\s*:?\s*\$\s?([\d.,]+)(?:\s+a\s+tc)/i
/(?:precio|desde)\s*:?\s*\$?\s?(?:us\.?|usd)\s?([\d.,]+)/i
/(\d[\d.,]+)\s*\$?\s?(?:us\.?|usd)/i
/\$?\s?(?:us\.?|usd)\s?([\d.,]+)/i
/(?:precio|desde)\s*:?\s*bs\.?\s?([\d.,]+)/i     // ultimo recurso
```

**Caracteristicas:**
- Extrae predominantemente en USD (el primer patron que matchea es el que gana)
- Solo detecta BOB si el precio dice explicitamente "Bs." o "Bs"
- El extractor C21 detecta y ajusta TC en el mismo paso (ver seccion 3.2)

### 2.3 Bien Inmuebles

**Fuente de precio:** API con campo estructurado.
```js
item.precio_cata   // Valor numerico
item.moneda_cata   // '2' = USD, otro = BOB
```

**Nota:** Solo se usa para alquiler. No participa en el pipeline de ventas ni en el bug descrito aqui.

---

## 3. Que hace cada extractor con el precio

### 3.1 Extractor Remax (`n8n/extractores/extractor_remax.json`)

**Funcion:** `extraerPrecio()` (lineas 280-357)

```js
// Paso 1: Tomar precio del JSON del portal
precio_bruto = listing.prices.amount;        // ej: 1359490 (BOB)
currency_id = listing.prices.currency_id;    // ej: 1 (BOB)

// Paso 2: Convertir a USD
if (currency_id === 1) {
    moneda_original = "BOB";
    precio_final_usd = Math.round(precio_bruto / 6.96);  // BOB / TC oficial
    precio_fue_normalizado = true;
} else {
    precio_final_usd = Math.round(precio_bruto);
    moneda_original = "USD";
}

// Retorna:
{
    precio_usd: precio_final_usd,          // BOB/6.96 si era BOB
    precio_usd_original: precio_bruto,      // Valor crudo del portal (BOB o USD)
    precio_fue_normalizado,                 // true si convirtio de BOB
    moneda_original,                        // "BOB" o "USD"
}
```

**Funcion:** `detectarTipoCambio()` (lineas 404-421)
```js
// Se ejecuta SEPARADO de la extraccion de precio
// Lee la descripcion y clasifica:
if (/tc\s*paralelo|cambio\s+paralelo|dólar\s+blue|paralelo/i) return "paralelo";
if (/pago\s+en\s+dólares/i) return "paralelo";
if (/tc\.?\s*oficial|\btc\.?\s*[67]\b/i) return "oficial";
return "no_especificado";
```

**Punto critico:** El extractor Remax SIEMPRE convierte BOB→USD usando TC oficial (6.96). NO usa la deteccion de TC paralelo para ajustar el precio. El `tipo_cambio_detectado` se guarda como metadato pero no afecta `precio_usd`.

### 3.2 Extractor Century21 (`n8n/extractores/extractor_century21.json`)

**Funcion:** `normalizarPrecioUSD()` (lineas 264-293)

```js
function normalizarPrecioUSD(precio_original, descripcion) {
    const tipoCambio = detectarTipoCambio(descLower);

    // CASO 1: Precio explicitamente en Bs
    if (precio_original > 350000 && /precio\s*bs/i.test(desc)) {
        return { precio: Math.round(precio_original / 6.96), normalizado: true };
    }

    // CASO 2: Precio en USD pero menciona "TC Paralelo"
    if (tipoCambio === 'paralelo') {
        // Asume precio_original es USD billete
        const precioEnBs = precio_original * TC_PARALELO;    // USD billete -> BOB
        const precioNormalizado = precioEnBs / 6.96;          // BOB -> USD oficial
        return { precio: Math.round(precioNormalizado), normalizado: true };
    }

    // CASO 3: TC Oficial o no especificado — USD directo
    return { precio: precio_original, normalizado: false };
}
```

**Punto critico:** C21 integra deteccion de TC en la normalizacion de precio. Si detecta "paralelo", el `precio_usd` resultante YA es USD oficial comparable (`USD_billete * TC_paralelo / 6.96`).

**`moneda_original` en C21:**
```js
function detectarMonedaOriginal(normalizacionPrincipal) {
    return normalizacionPrincipal.normalizado ? "BOB" : "USD";
}
```

### 3.3 LLM Enrichment (`scripts/llm-enrichment/enrich-ventas-llm.js`)

**El LLM NO modifica `precio_usd`.** Solo extrae:
- `tipo_cambio_detectado`: "paralelo" | "oficial" | "no_especificado"
- `tipo_cambio_confianza`: "alta" | "media" | "baja"

El prompt recibe como contexto el precio ya procesado:
```
Precio: $194,384 USD (moneda original: BOB)
```
Y devuelve su clasificacion de TC. El precio no cambia.

### 3.4 Merge (`sql/functions/merge/merge_discovery_enrichment.sql` v2.3.0)

**Regla de precio** (lineas 265-302):
```
1. Si precio_usd esta bloqueado (candado) -> mantener actual
2. Si enrichment normalizo (precio_fue_normalizado=true) O
   tipo_cambio != 'no_especificado' -> USAR enrichment precio_usd
3. Si discovery tiene precio -> comparar discrepancia:
   - >10% diferencia -> usar enrichment (fallback)
   - <=10% diferencia -> usar discovery
4. Sin precio discovery -> usar enrichment
```

**Regla de `depende_de_tc`** (lineas 825-830):
```sql
depende_de_tc = CASE
    WHEN tipo_cambio_detectado IN ('paralelo', 'oficial')
         AND precio_fue_normalizado = true
    THEN true ELSE false
END
```

---

## 4. Bug de doble normalizacion — causa raiz (CORREGIDO)

> **Estado: RESUELTO** — Fix en commit `ffdd5ca` (10 Mar 2026) + commit `c1f07ac` (display).
> Las 8 propiedades afectadas fueron corregidas manualmente desde el dashboard.

### 4.1 El bug real: dashboard normalizaba al guardar

El bug estaba en `usePropertyEditor.ts`, funcion `calcularPrecioNormalizado()`. Cuando un usuario editaba una propiedad con `tipoPrecio = 'usd_paralelo'` y guardaba:

```js
// ANTES del fix (BUG):
case 'usd_paralelo':
  return Math.round(precioPublicado * (tcParalelo / tcOficial));
  // Ej: 143,105 * (9.454 / 6.96) = $194,384 → se guardaba en precio_usd
```

Esto escribia un valor ya normalizado en `precio_usd`. Luego, `precio_normalizado()` en SQL normalizaba **de nuevo** al consultar:

```sql
-- precio_normalizado(194384, 'paralelo') = 194384 * 9.454 / 6.96 = $264,038
-- Inflacion: ~36%
```

**El pipeline nocturno (extractores + merge) NO tiene este bug.** El problema era exclusivamente en la edicion manual desde el dashboard.

### 4.2 El fix: guardar billete directo (commit ffdd5ca)

```js
// DESPUES del fix:
case 'usd_paralelo':
  return precioPublicado;  // Billete directo → precio_usd
  // Ej: 143,105 → se guarda 143,105 en precio_usd
  // precio_normalizado(143105, 'paralelo') = 143105 * 9.454 / 6.96 = $194,384 ✓
```

Se agrego `calcularPrecioDisplay()` separada (commit `c1f07ac`) para mostrar el precio normalizado en el UI del editor sin afectar lo que se guarda en BD.

### 4.3 Cadena correcta post-fix — Ejemplo ID 53

**Listing:** Condado VI 2D, 86.73 m2. Descripcion dice: "Precio: 143,105 $us. a t.c. paralelo"

| Paso | Componente | Valor | Correcto? |
|------|-----------|-------|-----------|
| 1 | Dashboard: usuario escribe | precio_publicado = 143,105 (billete) | SI |
| 2 | calcularPrecioNormalizado() | retorna 143,105 (billete directo) | SI |
| 3 | Save → BD | `precio_usd = 143,105` | SI |
| 4 | `precio_normalizado(143105, 'paralelo')` | `143105 * 9.454 / 6.96 = $194,384` | SI |
| 5 | Query de mercado | `$194,384 / 86.73 m2 = $2,240/m2` | SI |

### 4.4 Bug historico del extractor Remax (pipeline, NO dashboard)

Existe un bug **separado** en el extractor Remax que afecta props que nunca fueron editadas manualmente. El extractor hace `BOB / 6.96` sin considerar TC paralelo, produciendo `precio_usd ≈ BOB/6.96` en vez de billete. Esto causa que `precio_normalizado()` infle el precio ~36%.

Este bug del extractor **no fue corregido** en esta sesion — la correccion fue solo del dashboard. Las 8 props afectadas se corrigieron manualmente re-guardando desde el dashboard con el comportamiento correcto.

### 4.5 Por que C21 no tiene el bug del extractor

El extractor C21 integra deteccion de TC en la normalizacion (seccion 3.2). Si detecta "paralelo", guarda `precio_usd = USD billete directo`, y `precio_normalizado()` aplica la conversion correctamente.

---

## 5. Las 8 propiedades corregidas (10 Mar 2026)

> **Estado: CORREGIDAS** — Todas re-guardadas manualmente desde el dashboard post-fix.
> `precio_usd` ahora contiene el billete real extraido de la descripcion del listing.

| ID | Proyecto | Zona | Dorms | `precio_usd` ANTES | `precio_usd` DESPUES (billete) | Fuente |
|----|----------|------|-------|---------------------|-------------------------------|--------|
| 53 | Condado VI Plaza Italia | Eq. Centro | 2D | $194,384 | $143,105 | remax |
| 465 | Sky Plaza Italia | Eq. Centro | 1D | $120,892 | $89,001 | remax |
| 821 | Condado VI Plaza Italia | Eq. Centro | 3D | $315,225 | $210,638 | remax |
| 905 | Sky Plaza Italia | Eq. Centro | 2D | $191,102 | $127,891 | remax |
| 910 | Edificio Aura Concept | Eq. Centro | 2D | $148,034 | $108,000 | remax |
| 59 | Sky Eclipse | Eq. Oeste | 2D | $218,391 | $147,524 | remax |
| 1103 | (sin proyecto) | Sirari | 3D | $241,092 | $175,838 | remax |
| 519 | Garden Equipetrol | V. Brigida | 1D | ~$67,028 | $51,000 | remax |

**Todas son de Remax.** Los valores billete se extrajeron de la descripcion del listing (ej: "Precio: 143,105 $us. a t.c. paralelo").

**3 borderline NO corregidas** (desvio 5-10%, necesitan verificacion manual):

| ID | Proyecto | Zona | Dorms | % desvio | Fuente |
|----|----------|------|-------|----------|--------|
| 1011 | + PLUS ISUTO | V. Brigida | 0D | 9.0% | century21 |
| 902 | Nomad by Smart Studio | Eq. Centro | 1D | 9.0% | century21 |

---

## 6. Como detectar propiedades bugged

### Query de deteccion

```sql
SELECT
  p.id,
  COALESCE(pm.nombre_oficial, p.nombre_edificio) as proyecto,
  p.zona,
  p.dormitorios,
  ROUND(p.precio_usd::numeric, 0) as precio_usd_bd,
  ROUND((p.datos_json_enrichment->>'precio_bs')::numeric / 6.96, 0) as bob_div_oficial,
  ROUND(
    ABS(p.precio_usd - (p.datos_json_enrichment->>'precio_bs')::numeric / 6.96)
    / NULLIF(p.precio_usd, 0) * 100, 1
  ) as pct_match_oficial
FROM propiedades_v2 p
LEFT JOIN proyectos_master pm ON p.id_proyecto_master = pm.id_proyecto_master
WHERE p.datos_json_enrichment->>'moneda_original' = 'BOB'
  AND p.tipo_cambio_detectado = 'paralelo'
  AND p.depende_de_tc = true
  AND p.status = 'completado'
  AND (p.datos_json_enrichment->>'precio_bs')::numeric > 1000
ORDER BY pct_match_oficial ASC;
```

**Interpretacion de `pct_match_oficial`:**
- **0-5%:** BUGGED — `precio_usd ≈ BOB/6.96`, doble conversion confirmada
- **5-10%:** Borderline — probablemente bugged, verificar manualmente
- **~49%:** CORRECTO — `precio_usd ≈ BOB/tc_paralelo` (billete real)
- **>80%:** Anomalo — `precio_bs` puede estar corrupto, verificar datos

---

## 7. Fixes aplicados y pendientes

### 7.1 Fix aplicado: Dashboard (commit ffdd5ca, 10 Mar 2026)

**Archivo:** `simon-mvp/src/hooks/usePropertyEditor.ts`

**Cambio en `calcularPrecioNormalizado()`:**
- `case 'usd_paralelo'`: ahora retorna `precioPublicado` directo (billete) en vez de `precioPublicado * (tcParalelo / tcOficial)`
- `precio_usd` en BD contiene billete USD real
- `precio_normalizado()` en SQL es la unica normalizacion — funciona correctamente

**Nuevo: `calcularPrecioDisplay()` (commit c1f07ac):**
- Funcion separada para mostrar precio normalizado en el UI del editor
- `case 'usd_paralelo'`: retorna `Math.round(precioPublicado * (tcParalelo / tcOficial))`
- Se usa en: headline price, $/m2, alertas de precio, panel de conversion
- **NO** se usa en save ni validateForm

### 7.2 precio_normalizado() — funciona correctamente

La funcion SQL `precio_normalizado()` **NO tiene bug**. Su logica es correcta:

```sql
CASE WHEN p_tipo_cambio_detectado = 'paralelo'
  THEN ROUND(p_precio_usd * tc_paralelo / 6.96, 2)  -- billete → comparable
  ELSE p_precio_usd                                    -- ya es comparable
END
```

El contrato es: `precio_usd` debe contener USD billete para props paralelo. Si eso se cumple, la normalizacion es correcta. El bug era que el dashboard rompia ese contrato al escribir un valor ya normalizado.

### 7.3 Pendiente: Fix extractor Remax

El extractor Remax tiene un bug **separado** del dashboard: hace `BOB / 6.96` para TODAS las props BOB, sin importar si es TC paralelo. Para props BOB+paralelo, deberia guardar el billete (extraido de la descripcion) en vez de `BOB/6.96`.

**Impacto actual:** Limitado. Las props que pasan por el dashboard se corrigen con el fix 7.1. Solo afecta props que nunca se editan manualmente y cuyo merge hereda el `BOB/6.96` incorrecto del extractor.

**Propuesta (NO implementada):**
```js
if (currency_id === 1 && tipoCambio === 'paralelo' && precioExplicitoDesc) {
    precio_final_usd = Math.round(precioExplicitoDesc); // Billete de descripcion
} else if (currency_id === 1) {
    precio_final_usd = Math.round(precio_bruto / 6.96); // Comportamiento actual
}
```

### 7.4 precio_usd_original — campo NO confiable

`precio_usd_original` en `datos_json_enrichment` **no sirve como referencia** para correccion automatica:

- **Remax:** Contiene el monto crudo del portal (BOB en la mayoria de casos, ej: 1,359,490)
- **C21:** Contiene USD billete × TC paralelo (ya normalizado por el extractor)
- **Solo es confiable** cuando fue editado manualmente desde el dashboard

De las 99 props con `tipo_cambio_detectado = 'paralelo'` y `depende_de_tc = true`, 98 tienen BOB crudo en este campo. No se puede usar para automatizar correcciones.

---

## 8. Diagrama de flujo completo del precio

```
PORTAL REMAX                    PORTAL CENTURY21
      |                                |
      v                                v
[JSON: amount + currency_id]    [HTML: precio visible + meta + descripcion]
      |                                |
      v                                v
extraerPrecio()                 normalizarPrecioUSD()
  if BOB: USD = BOB/6.96         if "Bs.": USD = BOB/6.96
  if USD: USD = directo           if paralelo: USD = billete * TC_par / 6.96
  moneda_original = BOB|USD       if otro: USD = directo
  (NO usa TC paralelo)            (INTEGRA deteccion TC en precio)
      |                                |
      v                                v
detectarTipoCambio()             detectarTipoCambio()
  (solo clasifica, NO ajusta)     (ya fue usado arriba)
      |                                |
      +--------+     +---------+-------+
               |     |
               v     v
      datos_json_enrichment
      {precio_usd, moneda_original, tipo_cambio_detectado, ...}
               |
               v
      LLM Enrichment (opcional)
      - Confirma/corrige tipo_cambio_detectado
      - NO modifica precio_usd
               |
               v
      merge_discovery_enrichment()
      - Elige precio_usd (enrichment > discovery)
      - Escribe tipo_cambio_detectado a columna
      - Calcula depende_de_tc
               |
               v
      propiedades_v2.precio_usd
               |
               +<--- DASHBOARD EDIT (post-fix ffdd5ca):
               |     calcularPrecioNormalizado() retorna billete directo
               |     → precio_usd = billete USD (contrato correcto)
               |
               v
      precio_normalizado(precio_usd, tipo_cambio_detectado)
      - Si paralelo: precio_usd * tc_paralelo / 6.96
      - Si otro: precio_usd directo
               |
               v
      QUERIES DE MERCADO / INFORMES
      (buscar_unidades_reales retorna precio_normalizado() AS precio_usd)
```

**Bug historico del dashboard (CORREGIDO):** Cuando un usuario editaba una prop `usd_paralelo` desde el dashboard, `calcularPrecioNormalizado()` escribia `billete * tc/6.96` en `precio_usd`. Luego `precio_normalizado()` multiplicaba de nuevo → ~36% inflacion. Fix: el dashboard ahora guarda billete directo (commit ffdd5ca).

**Bug pendiente del extractor Remax:** En Remax BOB+paralelo, `datos_json_enrichment.precio_usd` puede ser `BOB/6.96` (no billete). Si el merge hereda este valor y no se edita manualmente, `precio_normalizado()` infla el precio.

---

## 9. Tabla de referencia rapida

| Escenario | precio_usd contiene | precio_normalizado() debe hacer | Funciona? |
|-----------|--------------------|---------------------------------|-----------|
| Remax USD | USD real | Devolver directo | SI |
| Remax BOB + no_espec | BOB/6.96 (oficial) | Devolver directo | SI |
| Remax BOB + paralelo (editado dashboard) | USD billete (post-fix) | Multiplicar por tc_par/6.96 | SI |
| **Remax BOB + paralelo (sin editar)** | **BOB/6.96 (oficial)** | **Devolver directo (ya es comparable)** | **NO — multiplica de mas** |
| C21 USD + no_espec | USD real | Devolver directo | SI |
| C21 USD + paralelo | USD billete directo | Multiplicar por tc_par/6.96 | SI |
| C21 BOB explicito | BOB/6.96 (oficial) | Devolver directo | SI |
| Dashboard edit usd_paralelo (post-fix) | USD billete directo | Multiplicar por tc_par/6.96 | SI |

---

## 10. Impacto en el mercado (post-fix)

- **8 propiedades corregidas** manualmente el 10 Mar 2026 (ver seccion 5)
- **2 borderline pendientes** de verificacion (C21, desvio 9%)
- Todas eran de venta (no afecta alquiler)
- Precios estaban inflados ~36%, sesgaban promedios de Eq. Centro, Eq. Oeste, Sirari y V. Brigida
- **Dashboard fix previene recurrencia** — cualquier edicion futura desde el dashboard guarda billete directo
- **Extractor Remax sigue con el bug** — props nuevas de Remax BOB+paralelo que no se editen manualmente pueden tener precio inflado

---

## 11. Actualizacion dinamica del TC paralelo (Binance)

### 11.1 De donde viene el TC paralelo

`precio_normalizado()` lee el TC de la tabla `config_global`:

```sql
SELECT valor FROM config_global WHERE clave = 'tipo_cambio_paralelo'
```

**Estado actual de config_global (10 Mar 2026):**

| id | clave | valor | activo | actualizado_por | fecha_actualizacion |
|----|-------|-------|--------|-----------------|---------------------|
| 3 | `tipo_cambio_oficial` | 6.96 | true | seed_data | 2025-12-13 |
| 4 | `tipo_cambio_paralelo` | **9.454** | true | binance_p2p | 2026-03-10 08:00 |
| 7 | `umbral_discrepancia_tc` | 0.05 | true | seed_data | 2025-12-13 |
| 1 | `TIPO_CAMBIO_OFICIAL` | 6.96 | **false** | — | 2025-11-21 |
| 2 | `TIPO_CAMBIO_PARALELO` | 10.4 | **false** | — | 2025-11-24 |

Las claves UPPERCASE (ids 1 y 2) estan desactivadas desde migracion 174 (7 Mar 2026). Las activas son lowercase.

### 11.2 Workflow n8n: tc_dinamico_binance

**Archivo:** `n8n/workflows/modulo_2/tc_dinamico_binance.json`
**Schedule:** Diario a las **00:00 AM** (UTC) — se ejecuta ANTES del pipeline de discovery (1:00 AM).

**Flujo:**

```
00:00 AM
  |
  +-> HTTP: Binance P2P SELL (top 10 anuncios USDT/BOB, tradeType="SELL")
  +-> HTTP: Binance P2P BUY  (top 10 anuncios USDT/BOB, tradeType="BUY")
  |
  +-> Code: Calcular TC
  |     tc_sell = promedio de top 5 anuncios SELL
  |     tc_buy  = promedio de top 5 anuncios BUY
  |     tc_paralelo = tc_sell  (precio que paga un comprador de USDT)
  |     spread_pct = (tc_sell - tc_buy) / tc_buy * 100
  |
  +-> PG: validar_tc_binance(tc_paralelo, 'paralelo')
  |     Rango valido: 8.0 - 15.0 BOB/USD
  |     Max cambio: 10% (proteccion contra datos anomalos)
  |     Min cambio: 0.5% (no actualizar si cambio insignificante)
  |
  +-> IF valido:
  |     +-> PG: guardar_snapshot_precios()     -- snapshot ANTES del cambio
  |     +-> PG: actualizar_tipo_cambio()       -- UPDATE config_global
  |     +-> PG: registrar_consulta_binance()   -- INSERT tc_binance_historial
  |     +-> Slack: notificar cambio a #sici-alertas
  |
  +-> ELSE:
  |     +-> Log razon de rechazo (fuera de rango, cambio muy grande, etc.)
  |
  +-> PG: registrar ejecucion en workflow_executions
```

**API endpoint de Binance P2P:**
```
POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
Body: { page: 1, rows: 10, asset: "USDT", fiat: "BOB", tradeType: "SELL"|"BUY" }
```

**Calculo del TC:**
- `tc_sell` = promedio de los 5 mejores precios SELL (lo que un comprador paga por USDT)
- `tc_buy` = promedio de los 5 mejores precios BUY (lo que un vendedor recibe por USDT)
- **`tc_paralelo = tc_sell`** — se usa el precio SELL porque refleja el costo real de comprar dolares

### 11.3 Funcion actualizar_tipo_cambio()

**Archivo:** `sql/functions/tc_dinamico/modulo_tipo_cambio_dinamico.sql`
**Firma:** `actualizar_tipo_cambio(p_tipo, p_nuevo_valor, p_ejecutado_por, p_notas)`

**Lo que hace, paso a paso:**
1. Mapea `p_tipo` ('paralelo') a clave `'tipo_cambio_paralelo'` en config_global
2. Lee valor actual de config_global (ej: 9.400)
3. Calcula diferencia porcentual vs valor nuevo (ej: 9.454 → +0.57%)
4. Cuenta propiedades con `depende_de_tc = TRUE` (las que dependen del TC)
5. **UPDATE config_global** SET valor = 9.454
6. **UPDATE propiedades_v2** SET `requiere_actualizacion_precio = TRUE` WHERE `depende_de_tc = TRUE`
7. INSERT registro en `auditoria_tipo_cambio`

**Retorna JSONB:**
```json
{
  "success": true,
  "tipo": "paralelo",
  "valor_anterior": 9.400,
  "valor_nuevo": 9.454,
  "diferencia_porcentual": 0.57,
  "propiedades_afectadas": 310,
  "mensaje": "310 propiedades marcadas para actualizacion"
}
```

### 11.4 Trigger automatico en config_global

**Funcion:** `fn_trigger_tc_actualizado()` — AFTER UPDATE ON config_global

Cuando cambia el valor de `tipo_cambio_paralelo` en config_global:
1. Marca todas las propiedades con `depende_de_tc = TRUE` y `tipo_cambio_detectado` correspondiente
2. Les pone `requiere_actualizacion_precio = TRUE`
3. Inserta registro de auditoria

### 11.5 Guardias y umbrales

| Parametro | Valor | Proposito |
|-----------|-------|-----------|
| TC minimo | 8.0 BOB/USD | Piso de sanidad |
| TC maximo | 15.0 BOB/USD | Techo de sanidad |
| Max cambio diario | 10% | Proteccion contra datos anomalos de Binance |
| Min cambio significativo | 0.5% | No actualizar si el cambio es irrelevante |
| Ads analizados | Top 5 de 10 | Promedio de los 5 mejores precios |
| Snapshot timing | ANTES del update | Preservar precios pre-cambio para analisis |

### 11.6 Que pasa con los precios cuando el TC cambia

**`precio_usd` NO cambia.** Es el precio historico fijado en el momento del merge. Nunca se modifica despues.

**`precio_normalizado()` SI cambia** con cada actualizacion de TC, porque es una funcion que lee `config_global.tipo_cambio_paralelo` en tiempo real:

```sql
-- Si hoy tc_paralelo = 9.454:
precio_normalizado(100000, 'paralelo') = 100000 * 9.454 / 6.96 = $135,833

-- Si manana tc_paralelo sube a 9.60:
precio_normalizado(100000, 'paralelo') = 100000 * 9.60 / 6.96 = $137,931
```

Esto es **intencional**: los precios comparables deben reflejar el TC del momento para ser utiles en decisiones de mercado. Un departamento que cuesta "$100K billete" vale mas en USD oficial cuando el paralelo sube.

**`precio_usd_actualizado`** es un campo interno que se recalcula via `recalcular_precio_propiedad()` cuando el TC cambia. Pero ningun query de mercado lo consume — solo `precio_normalizado()` es la funcion de consulta.

### 11.7 Recalculo batch nocturno

**Funcion:** `recalcular_precios_batch_nocturno(p_limite DEFAULT 1000)`

Se ejecuta en un job separado (3:00 AM aprox) despues de que el merge termina. Procesa todas las propiedades marcadas con `requiere_actualizacion_precio = TRUE`:

1. Para cada propiedad marcada:
   - Lee el TC original usado (de `datos_json_enrichment.tipo_cambio_paralelo_usado`)
   - Recalcula: `precio_BOB = precio_usd * TC_original`, luego `precio_usd_actualizado = precio_BOB / TC_actual`
   - Pone `requiere_actualizacion_precio = FALSE`
2. Respeta candados en `precio_usd_actualizado`

**Nota:** Este batch actualiza `precio_usd_actualizado` (campo interno), no `precio_usd`. Los queries de mercado usan `precio_normalizado()` que lee config_global en tiempo real, no `precio_usd_actualizado`.

### 11.8 Tablas de historial

**`tc_binance_historial`** — Cada consulta a Binance P2P:

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| tc_sell | NUMERIC | Promedio top 5 SELL |
| tc_buy | NUMERIC | Promedio top 5 BUY |
| spread_pct | NUMERIC | (sell - buy) / buy * 100 |
| num_anuncios_sell | INTEGER | Anuncios SELL disponibles |
| num_anuncios_buy | INTEGER | Anuncios BUY disponibles |
| aplicado_a_config | BOOLEAN | Si se actualizo config_global |
| razon_no_aplicado | TEXT | Razon de rechazo si no se aplico |
| timestamp | TIMESTAMP | Momento de la consulta |

**`auditoria_tipo_cambio`** — Cada cambio de TC:

| Columna | Tipo | Descripcion |
|---------|------|-------------|
| tipo_cambio | VARCHAR | 'oficial', 'paralelo', o 'batch' |
| valor_anterior, valor_nuevo | NUMERIC | Antes y despues |
| diferencia_porcentual | NUMERIC | % de cambio |
| propiedades_afectadas | INTEGER | Cuantas se marcaron |
| ejecutado_por | VARCHAR | 'binance_p2p', 'manual', etc. |
| metodo | VARCHAR | 'manual', 'trigger', 'batch_nocturno' |

### 11.9 Diagrama: TC paralelo → precio comparable

```
00:00 AM  Binance P2P API
              |
              v
         tc_sell = avg(top 5 SELL ads)
              |
              v
         validar_tc_binance()
         [8.0 <= tc <= 15.0, cambio 0.5-10%]
              |
              v (si valido)
         config_global.tipo_cambio_paralelo = tc_sell
              |
              v (trigger)
         propiedades_v2.requiere_actualizacion_precio = TRUE
         (donde depende_de_tc = TRUE)
              |
              v
         03:00 AM: recalcular_precios_batch_nocturno()
         -> actualiza precio_usd_actualizado (campo interno, no usado en queries)

En todo momento, cualquier query de mercado:
         precio_normalizado(precio_usd, tipo_cambio_detectado)
         -> lee config_global.tipo_cambio_paralelo EN TIEMPO REAL
         -> resultado cambia automaticamente cuando TC cambia
         -> NO depende del batch nocturno
```

---

*Documento generado por SICI — 10 de marzo de 2026*
*Actualizado 10 Mar 2026: fix dashboard double-normalization (commits ffdd5ca, c1f07ac), 8 props corregidas*
*Basado en revision de codigo de extractores, merge, funciones SQL, workflow n8n, dashboard, y analisis de 99 propiedades paralelo activas en BD*
