# Spec del LECTOR de deptos en ALQUILER — reglas para producir el veredicto

> Contrato ÚNICO de lo que el lector decide al ingerir un depto **en alquiler**. Espeja el `READER_SPEC.md`
> de VENTA (v4), pero con el sistema de precios y el gate propios de alquiler. Lo cumple **el lector
> humano-agente (Claude Code en sesión)** con este texto como system-prompt. El cargador prepara el material
> ($0) y aplica el veredicto; NO decide nada de esto.

> **v1 (12-jul-2026)** — arranque del híbrido de alquiler. Decisiones congeladas con el founder:
> ① **Precio = espeja venta**: crudo + etiqueta adentro, normalizado afuera; pero la **moneda dominante es Bs**
>   (81% de los avisos) y el precio es **MENSUAL**. ② El TC ahora se comporta **como venta** (unificación
>   oficial≈paralelo): NO más `bob / 6.96` fijo — se convierte con el **cambio real del día (Binance)**.
>   ③ **Gate inverso**: rechaza VENTA colada y ANTICRÉTICO colado en el feed de alquiler. ④ Anticrético NO se
>   cubre (se rechaza). ⑤ Fuentes piloto = **C21 + Remax**; Bien Inmuebles = capítulo aparte (reglas propias).
>
> **TODO ESTO ES SHADOW.** Producción = los 6 workflows n8n de alquiler (nocturna), intactos. El híbrido corre
> en un entorno shadow aislado; el switch a prod es el cutover (decisión founder), no trabajo técnico.
>
> **v2 (12-jul-2026)** — 1ª afinación tras el lote de 50 (50/50 aceptados, matching 80%). Cortes de ambigüedad
> que destaparon las 5 tandas de lectores (decisiones founder ✅): ① **baños: 1 dorm sin señal → 1** (como mono);
> ② **la SUITE cuenta como dormitorio** ("1 suite + 2 dorm" = 3); ③ **precio: el TEXTO manda** — la moneda del
> estructurado (esp. Remax) MIENTE seguido (trae USD pero el aviso cotiza en Bs); NO confundir el monto de
> **garantía/depósito** con la renta; ④ **`acepta_mascotas`: el checkbox del portal CUENTA** (fuente válida, como
> en venta); ⑤ **`equipado` = flag SEPARADO de `amoblado`** (electrodomésticos/cocina vs muebles sueltos); ⑥
> **`uso_inmueble`** (residencial/mixto) = FILTRO, no exclusión (como casas ZN); ⑦ nombre canónico SIEMPRE
> arábigo + sin prefijo "Condominio/Edificio"; ⑧ `expensas_incluidas`: solo el TEXTO afirma (el `false` del portal
> es un default, ruido).
>
> **v3 (13-jul-2026)** — 2 cortes tras auditar las 11 nuevas (`equipado` daba true en ~10/11 = no discriminaba):
> ⑨ **`equipado` = SOLO la PALABRA a nivel unidad** (alineado con venta v4); enumerar electrodomésticos sin la
> palabra → `null` (los ítems van a `equipamiento_canonico` igual). ⑩ **`acepta_mascotas`: el checkbox `false` del
> portal = ruido** → tratar como `null` (asimetría igual que `expensas_incluidas`); solo `true` del portal o el
> texto explícito cuentan.
>
> **v3.1 (13-jul-2026)** — ⑪ **`amoblado`: silencio → `null`, NO default "no"**. "no" SOLO si el texto confirma sin
> muebles ("sin amoblar"). Motivo: auditoría mostró que de 73 "no", solo 2 eran confirmados y 48 puro silencio → el
> default escondía "no sé". Ahora consistente con venta + equipado/mascotas (null = sin info). El filtro no cambia.

## Por qué el precio de alquiler cambia (contexto TC)
Hasta hoy, en producción, como el oficial ≈ paralelo NO tenía brecha relevante, el pipeline de alquiler tomaba
el precio en **bolivianos** y lo dividía por **6.96** fijo para mostrar dólares. Con la unificación (oficial nuevo
≈ Binance, muy por encima de 6.96) eso **infla el USD**: mediana Bs 3.900/mes ÷ 6.96 = $560, pero al cambio real
(~10) = $390 — **~44% de sobreprecio en dólares**. Por eso alquiler adopta el mismo contrato que venta:
**crudo + etiqueta adentro, la conversión a USD se hace UNA vez, al mostrar, con el cambio real (vivo)**.

Ver `TC_NUEVO_DECISION.md` (paquete TC de venta — este spec es su espejo para alquiler) y el
**PRINCIPIO DE ARQUITECTURA** ahí: normalización = frontera de acceso; el crudo nunca se lee directo.

## Entrada (lo que el lector LEE)
Por depto, el `--prep` arma un bundle con TODO el texto disponible (multi-fuente, sin regex):
- `slug` (de la URL) — fuerte en C21; código en Remax.
- `titulo` / `subtitulo` (discovery).
- `descripcion` (extractor) — fuerte en Remax (el nombre suele estar en la 1ª línea).
- Señales estructuradas de ALQUILER: `precio_mensual_bob` y/o `precio_mensual_usd` (el portal ya suele separar
  moneda), `moneda_portal`, `recamaras`, `area`, `banos`.
- `match_candidatos` — salida de `buscar_proyecto_fuzzy` sobre el mejor nombre-guess (referencia).

## Salida (el VEREDICTO — schema)
```jsonc
{
  "id": 1970,
  "gate": "aceptar",                 // "aceptar" | "rechazar"
  "razon_gate": null,                // si rechazar, por qué (venta colada / anticrético / basura)
  "es_multiproyecto": false,         // true = aviso a nivel PROYECTO (rangos, sin unidad). Se GUARDA con el tag, NO se rechaza.

  // ── PRECIO MENSUAL — CRUDO en su moneda nativa + etiqueta (espeja venta; NO normalizar) ──
  "precio_mensual": 3900,            // el monto MENSUAL crudo, tal cual: BOB (típico) o USD si la fuente/texto está en USD
  "moneda_original": "BOB",          // "BOB" | "USD" — la moneda del monto crudo de arriba
  "tipo_cambio_detectado": "bob",    // "bob" (crudo en Bs → USD = Bs/cambio_real) | "no_especificado"/"default" (USD real, directo) | "paralelo" (señal fuerte) | "oficial_viejo" (6.96/7 explícito → descuenta)

  // ── CONDICIONES DE ALQUILER (propias del dominio; reemplazan plan_pagos/permuta de venta) ──
  "expensas_bob": 350,               // gasto común MENSUAL en Bs. null si no se menciona. Debe ser < precio_mensual.
  "expensas_incluidas": false,       // true si el texto dice "expensas incluidas" / "sin gastos comunes extra". null si no hay señal.
  "deposito_meses": 1,               // garantía/depósito en meses (0-6). null si no se menciona.
  "contrato_minimo_meses": 12,       // permanencia mínima (1-60). null si no se menciona.
  "amoblado": null,                  // "si" | "no" | "semi" | null — muebles SUELTOS. v3.1: "no" SOLO si el texto confirma sin muebles; silencio → null (no default "no").
  "equipado": null,                  // v3: FLAG separado. true SOLO si el texto usa la PALABRA "equipado" a nivel unidad; enumerar electrodomésticos SIN la palabra → null (los ítems van a equipamiento_canonico igual). → datos_json.
  "acepta_mascotas": null,           // v2: true/false del TEXTO **o del checkbox del portal** (senales.mascotas_portal). null si ninguna fuente. (feed incluye NULL, excluye solo false)
  "uso_inmueble": "residencial",     // v2: "residencial" | "mixto" — "mixto" si el aviso ofrece también uso oficina/consultorio/comercial. FILTRO, no exclusión. → datos_json.
  "servicios_incluidos": [],         // ["agua","luz","internet","gas"] confirmados INCLUIDOS en el alquiler (no "el depto tiene gas"). Va a datos_json.

  "dormitorios": 1,                  // 0 = monoambiente (válido). Corregir 0→N solo si el texto dice N.
  "banos": 1,                        // base estructurada; el texto corrige. null si no hay señal.
  "area_m2": 74.5,                   // superficie de LA UNIDAD si el TEXTO la declara. null si el texto no la dice (→ queda la del portal).
  "piso": 3,                         // piso de LA UNIDAD. null si no se declara.
  "amoblado_confianza": "alta",      // opcional, si querés dejar traza
  "nombre_edificio_canonico": "Green Tower", // el nombre CANÓNICO (romano→arábigo, sin ruido). El matcher lo usa.
  "id_proyecto_master": null,        // opcional: si YO ya resolví el pm (deja null → lo resuelve el matcher)
  "alias_sugerido": null,            // opcional: variante cruda a guardar como alias del pm

  // ── AMENIDADES + EQUIPAMIENTO (idéntico a venta — mismo vocabulario canónico; solo lo CONFIRMADO) ──
  "amenidades": ["Piscina", "Gimnasio"],
  "amenidades_extra": ["Salas de TV"],
  "equipamiento_canonico": ["Cocina equipada", "Aire acondicionado"],
  "equipamiento_otros": ["Doble vidrio"],

  // ── PARQUEO + BAULERA (idéntico a venta) ──
  "estacionamientos_incluidos": 1,
  "parqueo_precio_adicional_bob": null, // en alquiler el adicional es MENSUAL en Bs
  "baulera_incluida": null,

  "confianza": "alta",
  "notas": "texto: 'Alquiler Bs 3.900/mes + expensas Bs 350. 1 dorm amoblado'"
}
```

## Reglas de decisión

### PRECIO MENSUAL + TC — el corazón de alquiler
> **La descripción manda la ETIQUETA, no el número.** El monto crudo + su moneda los da el PORTAL (estructurado:
> C21/BI suelen dar Bs, Remax da USD). La **etiqueta** (a qué cambio pensar ese monto) la decide el LECTOR
> leyendo el texto. La conversión a USD la hace la función de acceso, una sola vez, con el cambio real vivo.

- **Regla madre**: `precio_mensual` = el monto MENSUAL **crudo, tal cual**, en su moneda nativa. NUNCA lo dividas
  ni multipliques al leer. NUNCA escribas `precio_usd` (es el campo de venta; en alquiler no se usa).

- **🔴 ANTI-DOBLE-NORMALIZACIÓN (regla dura del cargador — el dolor histórico del cron `recalcular-precios-diario`):**
  cada aviso llena **SOLO la columna de su moneda** con el crudo REAL; la otra queda **NULL**:
  · aviso en Bs → `precio_mensual_bob` = crudo Bs · `precio_mensual_usd` = **NULL** · tag `bob`.
  · aviso en USD → `precio_mensual_usd` = crudo USD · `precio_mensual_bob` = **NULL** · tag `no_especificado`/`paralelo`/`oficial_viejo`.
  **NUNCA** rellenes la otra columna con un derivado (ej. `precio_mensual_usd = bob/6.96` = **crudo-falso**, el pecado
  que causaba la doble conversión). El crudo jamás está pre-normalizado — la ÚNICA conversión vive en
  `precio_normalizado_alquiler()` (al leer, una vez). Es el mismo principio que venta ("guardá el BOB crudo, NUNCA
  BOB/tasa"). El Bs de display de los avisos USD lo deriva la RPC/vista en vivo (`usd × paralelo`), no el cargador.

- **Caso típico — avisos en bolivianos (C21, BI, la mayoría):**
  - `precio_mensual` = el monto en Bs · `moneda_original = "BOB"` · `tipo_cambio_detectado = "bob"`.
  - La normalización hace **`Bs / cambio_real`** (Binance vivo) al mostrar. Reemplaza el `/6.96` fijo de prod.
  - Si el texto dice literal **"al cambio 6.96" / "Bs 7" / "TC 7"** anclado al rate muerto → `oficial_viejo`
    (se descuenta). **Confirmado founder (12-jul): SÍ ocurre en alquiler** — el lector lo detecta y descuenta
    igual que en venta.

- **Caso — avisos en dólares (Remax `price_in_dollars`, o el texto cotiza en USD):**
  - `precio_mensual` = el monto en USD · `moneda_original = "USD"` · `tipo_cambio_detectado`:
    - texto CALLA o dice "dólares"/"al día"/"oficial del día" (post-unificación) → `no_especificado` → **directo** (USD real).
    - texto dice señal FUERTE y sola de paralelo ("al paralelo", "TCP", "dólares físicos/billete") → `paralelo`
      (registro fiel; hoy normaliza directo igual que no_especificado — no infla).
    - frases que EQUIPARAN USD=paralelo ("dólares o paralelo", "TC del día") → `no_especificado` (evita drift).

- **Dos precios en el aviso** (ej. con/sin expensas, o Bs y su "equivalente en USD"): tomá el **precio del
  alquiler mensual base**. Si el aviso da Bs Y su equivalente USD calculado, el crudo es el **Bs** (moneda de
  cotización real del dueño); el USD calculado del aviso es informativo, va a `notas`, NO al precio.

- **Precio del TEXTO primero**; el estructurado del portal es fallback. Si el texto no trae precio pero el portal
  da `precio_mensual_bob`/`precio_mensual_usd` específico por-unidad coherente → aceptá con ese + su moneda + tag
  conservador (`bob` si Bs, `no_especificado` si USD). Si NO hay precio mensual en ninguna fuente (solo precio de
  venta, o rango de proyecto sin monto) → ver GATE / multiproyecto.

- **🔴 v2 — la MONEDA del estructurado MIENTE (validado en el lote de 50, esp. Remax):** `senales.moneda_original`
  puede decir USD cuando el aviso cotiza en **Bs** — el portal guardó un USD derivado (crudo-falso). Leé la moneda
  del **TEXTO**. Ej reales: 3522 estructurado "USD 4200" pero texto "Bs 4.200/mes" → `precio 4200, moneda BOB, bob`
  (el estructurado había derivado 29.232 Bs, absurdo). 3494 "USD 335" pero texto "3.350 Bs" → `3350 BOB bob`.
  Solo tag USD cuando el TEXTO cotiza en dólares ("$us 1.500", "TC del día") → `no_especificado`.
- **🔴 v2 — NO confundas GARANTÍA/DEPÓSITO con la renta:** un aviso puede tener 2-3 números — la renta, la
  garantía ("1 mes de garantía Bs 3.500"), el depósito. El `precio_mensual` es la **renta mensual**, NO el mayor
  ni el de garantía. Ej: 3423 "3.300 bs (incluye expensas)… garantía 3.500 bs" → `precio 3300` (no 3500).

> **Nota de esquema (shadow, implementado en migs 274/275):** el modelo `precio_mensual` crudo + `moneda_original` +
> etiqueta se implementó en la migración shadow de alquiler (migs 274/275, análoga a la 268 de venta): la función
> **`precio_normalizado_alquiler()`** AISLADA (regla 6: NUNCA tocar las funciones de venta) + la
> `v_mercado_alquiler_shadow` que la consume + `buscar_unidades_alquiler_shadow`. El reader spec congeló el CONTRATO;
> la migración lo implementó.
> El cambio real vive en `config_global.tipo_cambio_paralelo` (Binance, cron diario — el mismo que venta).
> **Confirmado founder (12-jul): 100% DINÁMICO** (Binance vivo), sin valor fijo — la función lee `config_global`
> en cada consulta, nunca congela un número.

### GATE (aceptar/rechazar) — INVERSO al de venta
En el feed de alquiler, la basura a rechazar es lo que NO es **alquiler mensual puro**:

- **🔴 RECHAZAR VENTA colada** — si el CUERPO del aviso OFRECE una VENTA (verbo "se vende"/"en venta"/"venta
  directa" **Y** un precio de **venta**: 5-6 cifras en USD, no un mensual) → `gate: rechazar`
  (razon_gate: "venta tipeada como alquiler"). La contradicción de operación gana sobre la metadata del portal.
  Ej real: 2705 "Se vende… 88.000 $us al paralelo" con slug de alquiler → RECHAZAR.
- **🔴 v2 — el PRECIO es el discriminador DURO (verbo venta + precio de renta-magnitud = ACEPTAR):** si el verbo
  dice "venta"/"pre-venta" PERO el precio es **inequívocamente de renta** (Bs/mes, o USD de 3 cifras/mes tipo
  $460–$650) → es un **alquiler mal-etiquetado**, ACEPTALO como alquiler (confianza media, notá el mislabel). No
  existe venta a $460. Ej reales: 2802/2779/2778 (cuerpo "en venta" pero $460–$490/mes) → aceptar como alquiler.
  Regla: rechazá solo si el precio TAMBIÉN es de venta (6 cifras USD); verbo venta + precio renta = renta.
- **🔴 RECHAZAR ANTICRÉTICO** — si el aviso OFRECE anticrético ("en anticrético", "anticretico", monto de
  anticrético = una suma grande única, no mensual) → `gate: rechazar` (razon_gate: "anticrético"). El anticrético
  NO se cubre en este pipeline. Si el aviso ofrece alquiler **Y** anticrético como opciones, y el alquiler mensual
  está claro → aceptar como alquiler (el anticrético es una alternativa, no la operación); si SOLO es anticrético
  → rechazar.
- **RECHAZAR basura REAL** — baulera/parqueo/depósito suelto sin vivienda, precio no confiable/contradictorio.
- **ACEPTAR** = ofrece alquiler mensual con precio mensual identificable (Bs/mes o USD/mes).
- **Señal dura**: precio **mensual** → alquiler (aceptar). Precio de **venta** (6 cifras USD) → rechazar. Monto
  único grande de **anticrético** → rechazar.

### CONDICIONES DE ALQUILER (propias — el lector las lee del texto)
- **`expensas_bob`**: gasto común MENSUAL en Bs. Debe ser **< `precio_mensual`** (si sale mayor, es error de
  lectura). null si no se menciona.
- **`expensas_incluidas`**: `true` SOLO si el TEXTO dice "expensas incluidas" / "sin gastos comunes aparte". `false`
  solo si el texto dice que van aparte. `null` si el texto calla. **v2: IGNORÁ el `expensas_incluidas: false` del
  portal** (`senales.expensas_incluidas`) — es un default, ruido; muchos avisos que SÍ incluyen expensas lo traen
  en `false`. (Puede coexistir un monto `expensas_bob` con `expensas_incluidas: true` — el monto es informativo.)
- **`deposito_meses`**: garantía en meses (0-6). "un mes de garantía" → 1; "dos meses de depósito" → 2. null si calla.
- **`contrato_minimo_meses`**: permanencia mínima (1-60). "contrato mínimo 1 año" → 12. null si calla.
- **`acepta_mascotas`** (v2): `true`/`false` del TEXTO **o del checkbox del portal** (`senales.mascotas_portal`).
  **v3 (13-jul) — asimetría del checkbox (igual que `expensas_incluidas`):** un `mascotas_portal = true` CUENTA
  (afirmación explícita), pero un `mascotas_portal = false` es DEFAULT/ruido → **trátalo como `null`**, NO como
  "no acepta" (salvo que el TEXTO diga explícito "no mascotas"). `null` si ninguna fuente afirmativa lo dice.
  ⚠️ "pet zone" / "pet wash" es una AMENIDAD del edificio, NO política de contrato → no dispara `acepta_mascotas`.
- **`servicios_incluidos`**: array de servicios CONFIRMADOS **incluidos en el alquiler** ("agua","luz","internet",
  "gas"). ⚠️ "el depto TIENE gas domiciliario" ≠ "gas incluido en la renta" → eso NO va acá. `[]` si no se menciona.
- **`uso_inmueble`** (v2): `"residencial"` (default) | `"mixto"` — `"mixto"` si el aviso ofrece también uso
  oficina/consultorio/comercial ("ideal para oficina/consultorio/spa"). Es un **FILTRO, no exclusión** (como casas
  ZN): el aviso se ACEPTA igual; el uso solo se etiqueta. (El gate de tipo ya excluye lo que no es depto.)

### AMOBLADO + EQUIPADO (v2 — dos flags SEPARADOS, distintos)
Muchos avisos de alquiler dicen "equipado" (electrodomésticos) SIN muebles sueltos. Por eso separamos:
- **`amoblado`** (`"si"`/`"no"`/`"semi"`/`null`) = **muebles SUELTOS** (camas, sofás, mesas, sillas, escritorios).
  - `"si"` si el texto dice amoblado/amueblado/con muebles/amoblamiento/furnished, o enumera muebles sueltos de la unidad. `"semi"` si semi-amoblado.
  - **v3.1 (13-jul) — `"no"` SOLO si el texto CONFIRMA sin muebles** ("sin amoblar", "no incluye muebles", "se entrega
    vacío"). **Si el texto CALLA sobre muebles → `null`** (no sabemos), NO `"no"`. Alineado con venta y con equipado/
    mascotas (null = sin info). El default viejo "no" mezclaba confirmado con asumido (auditoría 13-jul: de 73 "no",
    solo 2 confirmados, 48 puro silencio) → esconde la incertidumbre. El filtro "solo amoblados" no cambia (null tampoco
    muestra como amoblado); lo que gana es honestidad (confirmado ≠ desconocido).
  - **NO cuentan como amoblado** (son fijos, no muebles sueltos): roperos empotrados, cocina equipada, AC, heladera,
    "baño con muebles" (mueble de baño = fijo del ambiente). Mencionar un fijo NO confirma "no" → sigue siendo `null`.
- **`equipado`** (`true`/`null`) = **electrodomésticos/cocina** (heladera, cocina, microondas, lavadora, AC).
  **v3 (13-jul, alineado con venta v4) — SOLO la PALABRA a nivel UNIDAD dispara el flag:** `true` únicamente si el
  texto usa "equipado"/"totalmente equipado"/"entrega equipada"/"departamento equipado". Si el aviso solo **ENUMERA**
  electrodomésticos (heladera, cocina, AC) SIN la palabra → `null` (no lo inferimos), PERO esos ítems SÍ van a
  `equipamiento_canonico` (el filtro por-ítem sigue vivo). ⚠️ **"cocina equipada" NO dispara el flag** (describe un
  ambiente, no la unidad) — igual va a `equipamiento_canonico`. Motivo del cambio: con la regla vieja ("o enumera")
  el flag daba `true` en ~10/11 avisos = no discriminaba nada; casi toda renta lista electrodomésticos.
- Un monoambiente puede ser **`equipado: true` + `amoblado: "no"`** (electrodomésticos sí, muebles sueltos no) —
  común en alquiler. Los ítems concretos van igual a `equipamiento_canonico`; el flag `equipado` es la señal de
  decisión de alto nivel (filtrable), y solo se prende cuando el broker lo AFIRMA con la palabra.

### DORMITORIOS — igual que venta (v2: la suite cuenta)
- `0` = monoambiente/studio/loft = correcto (el front muestra "Monoambiente"). Conservar 0 si el texto lo dice.
- Subir `0→N` solo si el texto dice "N dormitorios/habitaciones" y NO es mono.
- El texto SIEMPRE pisa el estructurado (el `recamaras` del portal es POCO confiable — da 0 en unidades multi-dorm).
  Parseá aunque venga pegado ("2dorm") o en palabra ("dos dormitorios").
- **v2 — la SUITE es un dormitorio:** "1 suite + 2 dormitorios" = **3 dormitorios**; "suite principal + 1 dorm" = 2.
  La suite es una habitación con baño propio → suma al conteo (y a baños, ver §BAÑOS).

### BAÑOS — igual que venta (v2: extendido a 1-dorm)
Cascada: (1) base = `banos` del discovery; (2) el texto corrige si dice un número; (3) **v2 — dorms ≤ 1
(monoambiente O 1 dormitorio) → 1 baño** si no se declara otro (una unidad habitable de ≤1 dorm tiene ≥1 baño;
antes solo aplicaba a mono); (4) "N dorm, M en suite" → M baños privados + 1 social si hay no-suite; (5) `null`
solo si **multi-dorm (≥2)** sin número, sin suite, sin estructurado.

### AMENIDADES + EQUIPAMIENTO — mismo vocabulario canónico que venta (v2: lista explícita)
Regla madre: **solo lo CONFIRMADO** (texto libre O estructurado del portal), NUNCA inferir. 4 baldes:
- **`amenidades`** = diferenciadores del EDIFICIO, SOLO estas claves canónicas (mapeá sinónimos):
  > Piscina · Churrasquera (parrilla/quincho) · Sauna/Jacuzzi · Gimnasio · Estacionamiento para Visitas ·
  > Pet Friendly · Salón de Eventos · Co-working · Parque Infantil · Jardín
  NO son canónicas (NO extraer, ausencia no significa nada): Seguridad 24/7, Ascensor, Recepción, Área Social,
  Terraza, Lavandería. Si el texto las menciona explícitas → van a `amenidades_extra`, nunca a `amenidades`.
- **`amenidades_extra`** = amenidad de edificio CONFIRMADA fuera del vocabulario (ej "Cine", "Rooftop", "Sala de TV").
- **`equipamiento_canonico`** = features de UNIDAD, claves fijas (mapeá sinónimos; el loader canonicaliza igual con `lib/canonicalizar.mjs`):
  > Cocina equipada · Heladera · Lavadora · Secadora · Termotanque/Calefón · Aire acondicionado · **Microondas** · **TV/Smart TV** ·
  > Roperos/Closets · Vestidor · Balcón · Terraza propia · Cuarto de servicio · Box de baño · Chapa digital · Domótica · Video portero
- **`equipamiento_otros`** = todo lo demás CONFIRMADO fuera del canónico (doble vidrio, porcelanato, espejos…), tal cual.
En alquiler el AC y la cocina equipada pesan → capturarlos bien. El flag de alto nivel `equipado` (ver §AMOBLADO+EQUIPADO)
es SEPARADO de esta lista: acá van los ítems concretos, allá la señal filtrable.

### PARQUEO + BAULERA — igual que venta (adicional en Bs/mes)
- `estacionamientos_incluidos`: cuántos incluye el alquiler. Base estructurado, el texto pisa. null si calla.
- `parqueo_precio_adicional_bob`: si el parqueo es APARTE, su costo **mensual en Bs**. **APARTE ⟺ incluidos=0**.
- `baulera_incluida`: true/false del texto/estructurado. null si no hay señal.
- Sin señal → null, NO true. No inventar parqueo incluido.

### ÁREA (`area_m2`) — igual que venta (v3.2, 21-jul): el TEXTO pisa al portal
Reportá la superficie de LA UNIDAD si el TEXTO la declara; `null` si no la dice (→ queda la del portal).
NO es el área del lote/condominio ni un rango. Motivo (caso real 21-jul, alquiler): el portal dio
**1.700 m²** para un depto cuyo texto dice **177 m²** (error ×10 del captador) y entró al feed. Detalle
completo de la regla en `READER_SPEC.md` §ÁREA.

### PISO — igual que venta
Base = `piso` estructurado (null seguido). El texto lo llena ("Nivel 3", "Piso 3"). NO confundir con pisos de
amenidades, altura del edificio, nº de departamento, ni romano del nombre. Si el texto no lo declara → null.

### NOMBRE DE EDIFICIO — igual que venta (name-first)
Leé el nombre del slug (C21) / descripción (Remax), entregá el canónico (romano→arábigo, sin ruido marketing).
Crudo distinto del canónico → `alias_sugerido`. Sin nombre en ninguna fuente → `null` (el matcher devuelve
`sin_nombre`; NO se fuerza por GPS). NUNCA devolver "Alquiler"/"Departamento"/direcciones como nombre.

### MULTIPROYECTO — igual que venta (menos frecuente en alquiler)
`es_multiproyecto: true` (+ `gate: aceptar`) para avisos a nivel proyecto (rangos "desde", tipologías sin unidad).
El cargador lo desvía a `proyectos_detectados`, no al feed. En alquiler es raro (los proyectos se venden, no se
alquilan en preventa), pero un edificio que publica varias unidades con rango entra acá. Discriminador de 2
niveles igual que venta: precio EXACTO de una unidad → unidad; "desde X" / mismo $/m² fabricado / área absurda →
multiproyecto.

### NO APLICA en alquiler (presente en venta, se OMITE aquí)
- **`estado_construccion` / `fecha_entrega`**: un depto en alquiler está terminado por definición. No se captura
  (no hay preventa de alquiler).
- **`precio_usd` / TC paralelo ×1.47 de venta / `precio_normalizado()` de venta**: NUNCA en alquiler. Alquiler usa
  su función `_alquiler` propia.
- **plan de pagos / permuta / negociable**: no aplican a alquiler.

## Matching (lo hace el `matcher.mjs`, NO el lector) — reuso sin cambios
El lector solo entrega `nombre_edificio_canonico`. El cargador llama `matchearPorNombre(sb, { nombre, zona, lat, lon })`
(agnóstico a operación, se reusa de venta tal cual): score ≥ 0.95 + zona corrobora → auto-asigna; ambiguo /
fuzzy débil / sin nombre → queda sin match. GPS secundario. El catálogo `proyectos_master` es compartido
edificio-nivel (venta y alquiler comparten edificios).

---

## Pendientes que este spec deja abiertos (para el diseño de esquema / cargador)

> **✅ HECHO (17-jul) — los ítems 1-4 ya están implementados** (migs 274/275, `cargar-alquiler-shadow.mjs`,
> `discovery-alquiler.mjs`). Se conservan abajo como registro de las decisiones congeladas. Solo el ítem 5
> (confirmaciones con founder) sigue abierto.

1. **✅ RESUELTO (migs 274/275) — Migración shadow de alquiler** (análoga a mig 268/269/271 de venta). **Decisión founder (12-jul): UNA SOLA
   tabla shadow** — reusar `propiedades_v2_shadow` discriminando por `tipo_operacion='alquiler'`, NO crear tabla
   separada. Razón: espeja prod (venta y alquiler conviven en `propiedades_v2` por `tipo_operacion`) → cutover más
   fiel; la tabla shadow ya heredó todas las columnas de alquiler (`LIKE ... INCLUDING ALL`). El aislamiento vive
   en las FUNCIONES, no en la tabla: `precio_normalizado_alquiler(crudo, moneda, tag)`, `v_mercado_alquiler_shadow`
   (filtra `tipo_operacion='alquiler'`), `buscar_unidades_alquiler_shadow` — todas propias, AISLADAS de venta
   (regla 6), nunca tocan las funciones de venta. Recarga selectiva = borrar filas `tipo_operacion='alquiler'`.
2. **✅ RESUELTO (migs 274/275) — Mapeo del veredicto a columnas** (founder confirmó 12-jul: SÍ hay que mapear a columnas): el modelo crudo+tag
   necesita repensar las columnas actuales que asumían "siempre Bs / ÷6.96". Recomendación a validar en la migración
   shadow — espejar venta (que guarda el crudo BOB-o-USD en un solo campo `precio_usd` + `moneda_original` + tag):
   guardar el monto crudo mensual en un campo agnóstico a moneda + `moneda_original` ('BOB'/'USD') +
   `tipo_cambio_detectado`, y que `precio_normalizado_alquiler()` mire moneda+tag. Se cierra al diseñar la migración.
3. **✅ RESUELTO (`cargar-alquiler-shadow.mjs`) — Cargador de alquiler**: implementado como cargador propio de
   alquiler (los 14 acoplamientos venta→alquiler mapeados; el grande era el modelo de precio en `construirFila`).
4. **✅ RESUELTO (`discovery-alquiler.mjs`) — Discovery de alquiler**: implementado; parametriza `operacion` y
   filtra `tipo_operacion='alquiler'` en el diff (antes hardcodeaba `operacion_venta` en `sonda-suelo/lib/portales.mjs`).
5. **Confirmar con founder**: si el valor del cambio real se fija o queda 100% dinámico Binance (misma
   pregunta abierta que venta en `TC_NUEVO_DECISION.md`).
   [El descuento de `oficial_viejo` en alquiler → ✅ **CONFIRMADO founder 12-jul: SÍ ocurre** (ver §PRECIO, arriba).]
