# Spec del LECTOR de deptos — reglas para producir el veredicto

> Contrato ÚNICO de lo que el lector decide al ingerir un depto. Lo cumple **el lector
> humano-agente (Claude Code en sesión, hoy)** y, cuando se enchufe, **un API (OpenRouter,
> mañana)** — con el MISMO texto como system-prompt. El cargador (`cargar-deptos-shadow.mjs`)
> prepara el material ($0) y aplica el veredicto; NO decide nada de esto.

> **v4 (10-jul-2026)** — cerró 4 zonas grises que destapó la validación ciega de 100 (spec v3 congelado):
> ② `equipado` solo con la PALABRA · ④ TC "oficial/paralelo" sin número = directo · ⑤ dos precios = el bajo ·
> 🚨 gate-renta distingue OFERTA de PITCH. El reader lee bien; estos son cortes de ambigüedad del TEXTO, no fixes.
>
> **v4.1 (13-jul-2026)** — 2 refuerzos al Discriminador UNIDAD vs MULTIPROYECTO (Nivel 3), validados 19/19 en
> test ciego tras la divergencia Speranto/Grigia: **A)** el área de unidad puede venir del TEXTO (`conts`), no solo
> del estructurado — pero SOLO la específica de la unidad (no "desde"/rango/terraza/total); sin área específica en
> ninguna fuente = multiproyecto. **B)** precio REDONDO = real (unidad) vs decimal crudo `.5` = `$/m²×área` fabricado
> (multiproyecto); el "$/m² uniforme" a secas NO prueba fabricación. Ver detalle en Nivel 3.
>
> **v4.2 (17-jul-2026)** — 2 cortes: **①** BAÑOS **≤1 dorm (mono O 1 dorm) sin señal → 1 baño** (antes solo mono;
> alinea con alquiler v2 — ver §BAÑOS). **②** BLOQUE / PISO COMPLETO / lote de N unidades juntas → **`es_multiproyecto`**
> (no es una unidad comparable; el $/m² NO lo detecta, discrimina cuántas unidades vende el aviso — caso real 3742
> Rhodium "SE VENDE PISO COMPLETO"; ver §GATE + MULTIPROYECTO).

## Entrada (lo que el lector LEE)
Por depto, el `--prep` arma un bundle con TODO el texto disponible (multi-fuente, sin regex):
- `slug` (de la URL) — **fuerte en C21** (`...green-tower`, `...edificio-hh-once`); código en Remax.
- `titulo` / `subtitulo` (discovery) — a veces trae el nombre.
- `descripcion` (extractor) — **fuerte en Remax** (el nombre suele estar en la 1ª línea).
- Señales estructuradas: `precio_candidato`, `precio_bob_portal`, `tc_portal`, `recamaras`, `area`, `banos`.
- `match_candidatos` — salida de `buscar_proyecto_fuzzy` sobre el mejor nombre-guess (referencia).

## Salida (el VEREDICTO — schema)
```jsonc
{
  "id": 3521,
  "gate": "aceptar",                 // "aceptar" | "rechazar" (basura REAL: baulera/parqueo suelto, otra-operación)
  "razon_gate": null,                // si rechazar, por qué
  "es_multiproyecto": false,         // true = aviso a nivel PROYECTO (rangos, "Desde X m²", tipologías sin unidad). Se GUARDA con el tag (feed lo excluye), NO se rechaza.
  "precio_usd": 78571,               // CRUDO en su moneda nativa: USD (billete/directo) o BOB si tag="bob". NO normalizar (lo hace el feed).
  "tipo_cambio_detectado": "oficial",// "paralelo" | "oficial" | "no_especificado" | "oficial_viejo" (6.96/7 explícito) | "bob" (crudo en bolivianos)
  "dormitorios": 1,                  // 0 = monoambiente (válido). Corregir 0→N solo si el texto dice N.
  "banos": 1,                        // base estructurada; el texto corrige si dice otra cosa. null si no hay señal.
  "area_m2": 74.5,                   // superficie de LA UNIDAD si el TEXTO la declara. null si el texto no la dice (→ queda la del portal). Ver regla.
  "piso": 3,                         // piso de LA UNIDAD (ver regla). null si no se declara / solo hay pisos de amenidades.
  "estado_construccion": "preventa", // "preventa" | "entrega_inmediata" | null (ver regla; port de prod)
  "fecha_entrega_estimada": "Diciembre 2026", // solo si preventa y el texto la da. null si no.
  "amoblado": null,                  // FLAG: true si el texto dice AMOBLADO (con muebles: living/camas/sofás). null si no menciona.
  "equipado": null,                  // FLAG: true si el texto dice "totalmente equipado"/"entrega equipada"/"equipado" (electrodomésticos/cocina). Distinto de amoblado.
  "nombre_edificio_canonico": "Stone 3", // el nombre CANÓNICO (romano→arábigo, sin ruido). El matcher lo usa.
  "id_proyecto_master": null,        // opcional: si YO ya resolví el pm (deja null → lo resuelve el matcher con el nombre)
  "alias_sugerido": "Stone III",     // opcional: variante cruda a guardar como alias del pm (se registra, NO se escribe a prod en fase shadow)

  // ── AMENIDADES + EQUIPAMIENTO (solo lo CONFIRMADO por el texto; NUNCA inferir/asumir) ──
  "amenidades": ["Piscina", "Gimnasio"],   // diferenciadores del EDIFICIO mapeados al vocabulario canónico (ver abajo)
  "amenidades_extra": ["Salas de TV"],     // confirmadas NO canónicas → no se pierden (patrón casas caracteristicas_extra)
  "equipamiento_canonico": ["Cocina equipada", "Heladera", "Roperos/Closets"], // features de UNIDAD del vocabulario canónico (filtrable, ver abajo)
  "equipamiento_otros": ["Doble vidrio", "Espejos"],  // confirmadas fuera del canónico → se muestran, no se filtran. Cola larga.

  // ── PARQUEO + BAULERA (estructurado como base; la DESCRIPCIÓN manda si dice otra cosa) ──
  "estacionamientos_incluidos": 2,   // cantidad incluida en el precio. null si no hay señal.
  "parqueo_precio_adicional_usd": null, // si el parqueo es APARTE, su costo. null si incluido/sin dato.
  "baulera_incluida": true,          // true/false/null. null si no hay señal.
  "baulera_precio_adicional_usd": null, // si la baulera es APARTE, su costo.

  "confianza": "alta",               // alta | media | baja
  "notas": "texto: '78.571 $us Oficial a Bs 7'"
}
```

## Reglas de decisión (validadas en el lote 3-jul)

### PRECIO + TC — RÉGIMEN NUEVO (activo para el HÍBRIDO)
> Fuente de verdad de la detección de tag: **`TC_NUEVO_DECISION.md`** (pieza 1). Resumen:
> - **`default`** (oficial nuevo = USD real): texto dice "paralelo"/"al día", "oficial del día" (= Binance, NO el viejo),
>   solo declara USD/moneda, o CALLA → normaliza **directo**.
> - **Tag consistente (evitar drift, auditoría 10-jul):** las frases que EQUIPARAN USD=paralelo — "dólares o
>   paralelo", "paralelo o dólares", "TC del día", "al día", "USD o TCP" — emití SIEMPRE el mismo tag
>   **`no_especificado`** (todas normalizan directo igual; usar tags distintos para la misma frase ensucia la data).
>   Reservá el tag `paralelo` para señal FUERTE y sola ("al paralelo", "TCP", "dólares físicos/billete").
> - **`oficial_viejo`**: SOLO si el texto ancla EXPLÍCITO al rate muerto ("6.96" / "Bs 7" / "TC 7" / "al oficial 7") → se descuenta.
> - **v4 — tag fiel a la cruda (NINGÚN tag infla: el feed shadow toma paralelo / oficial-nuevo / no_especificado
>   DIRECTO; solo `oficial_viejo` descuenta y `bob` convierte de bolivianos):**
>   · **"oficial" solo** (sin número) = oficial NUEVO (≈paralelo) → `no_especificado`. `oficial_viejo` SOLO con el
>     número viejo explícito (6.96/7) — único que descuenta; la palabra "oficial" sola NO descuenta (subvaluaría: Onix
>     Art $1.800→$1.188/m²).
>   · **"paralelo" DECLARADO solo** ("al paralelo", "TC/tipo de cambio paralelo", "dólares físicos/billete") → tag
>     `paralelo` (registro fiel; hoy normaliza directo igual que no_especificado — no infla).
>   · **"paralelo" EQUIPARADO** ("dólares O paralelo", "USD o TC del día") o **SILENCIO** → `no_especificado`.
> - **v4 — DOS precios en el aviso (sin amoblar / amoblado):** tomá el **MÁS BAJO** (inmueble sin muebles) como
>   `precio_usd` — comparable por $/m². El extra amoblado va a `notas` ("amoblado +$5.000"), NO al precio; `amoblado`
>   refleja que la opción existe. Ej: Sky Luxia 60.000 sin / 65.000 amoblado → `precio_usd=60000`.
> - **PRECIO del texto SIEMPRE primero** (con su TC según reglas de arriba). El siguiente bloque es SOLO fallback.
> - **Fallback C21-BOB (sin precio en el texto)** — regla INEQUÍVOCA, **crudo REAL (no dividir al leer)**:
>   `precio_usd = señales.precio_bob_portal` (el monto en **BOLIVIANOS, tal cual**) · `tipo_cambio_detectado = "bob"` · `moneda_original = "BOB"`.
>   La normalización hace `BOB / tasa_paralelo` **en vivo** (una vez, al consultar) → sin freezing, sin doble-norm.
>   **NUNCA** guardes `BOB/tasa` (eso es crudo-falso) NI uses `precio_candidato` (BOB/6.96). Si el texto dice 6.96/7 explícito → `oficial_viejo`.
> - Remax trae precio en USD → usá ese, tag según texto. `precio_usd` = CRUDO en su moneda nativa; el feed normaliza (keyed en el tag).
>
> ### Fallback C21 sin precio en el texto — elegir USD-directo vs bob por $/m² (RESUELTO 10-jul)
> C21 expone SIEMPRE el precio en BOB (`senales.precio_bob_portal`) Y en USD (`senales.precio_candidato =
> precio_bob_portal / 6.96`), con `senales.moneda='USD'`. Cuando el texto NO trae precio, el `precio_bob_portal`
> puede ser (a) un precio genuino en bolivianos, o (b) el USD del vendedor × 6.96 (crudo-falso). **NO defaultear a
> `bob` a ciegas** — elegí por **$/m² coherente** (~$1.500–2.300 Equipetrol; memoria `feedback_clasificacion_tc_por_m2`):
> - `usd_m2 = precio_candidato / area` · `bob_m2 = (precio_bob_portal / tasa_paralelo) / area`.
> - `usd_m2` en banda y `bob_m2` muy bajo → **USD directo** (`precio_usd = precio_candidato`, tag `no_especificado`,
>   `moneda_original='USD'`). El vendedor pensó en dólares; el BOB era USD×6.96.
> - `bob_m2` en banda y `usd_m2` muy alto → **bob** (`precio_usd = precio_bob_portal`, tag `bob`). Bolivianos genuinos.
> - Ambos en banda → mirá el tipo de unidad (mono amoblado tolera $/m² más alto → USD). Ninguno → el más cercano a la banda.
> - Ejemplos reales: Sky Eclipse 3434 → USD $1.643/m² (bob daría $1.085) → **USD**. Maré 3580 → bob $2.104/m²
>   (USD daría $3.187) → **bob**. Los desarrolladores difieren: Maré cotiza en Bs, Sky Eclipse en USD.
> - Si el texto SÍ dice 'Bs X' explícito → `bob` (el texto manda). Si dice USD / '6.96' / 'Bs 7' → esas reglas ganan.
>
> **PRODUCCIÓN = n8n** (sigue con el régimen VIEJO de abajo, intacto). El de abajo se conserva como **legacy/rollback**.

<hr>

### PRECIO + TC — LEGACY (régimen viejo n8n, rollback — NO usar en el híbrido nuevo)
1. Texto dice **"paralelo"** / "al día" → `paralelo`; `precio_usd` = el USD **billete** del texto.
2. Texto dice **"TC 7"** / "oficial" / "a Bs 7" / "6.96" → `oficial`; `precio_usd` = el USD del texto.
3. **Bs equivalente en el texto** → el ratio Bs/USD manda: **≈7/6.96 → oficial**, **≈10 → paralelo**
   (ej Santorini "70.000 (Bs 490.000)" 490/70=7 → oficial). El ratio por-anuncio es señal fuerte.
4. Texto **calla** / solo `$us X` / "dólares" (solo declara moneda) → `no_especificado` (normaliza directo,
   NUNCA infla; el badge `tc_sospechoso` es la red). El `exchange_rate_amount` de Remax es GLOBAL (~9.78
   en TODO anuncio) → **NO marca paralelo** (fue el bug de los 368 deptos).
5. `precio_candidato` (`pickPrecioC21`) es HELPER, no oráculo — leé el número del TEXTO (3540 dio $229k, texto $160k).

> ⚠️ **FUTURO (NO ahora) — al unificarse el TC**: el default pasará a **paralelo** (el dólar físico ES el
> paralelo) + normalización **base-paralelo** (el oficial BAJA ×oficial/paralelo; el paralelo MANTIENE su
> valor en dólares — no se infla). Es un paquete que se aplica JUNTO a prod, DESPUÉS, para no ensuciar la
> comparación shadow-vs-prod. Por ahora el default es `no_especificado`, MISMA lógica que prod.
5. **Precedencia del precio (fallback estructurado):**
   - (a) **Precio en la descripción** → usá ese, y leé el TC ahí (reglas 1-3). Caso normal.
   - (b) **La descripción NO trae precio, pero hay precio ESTRUCTURADO REAL por-unidad** (Remax `amount` /
     C21 `precioVenta`) con $/m² coherente → **aceptá** con ese precio + `no_especificado` (sin el texto
     no hay señal de TC → conservador, no infla; el badge `tc_sospechoso` es la red). Ej: Remax con `amount`
     específico distinto por listing. **🔴 OJO (11-jul): NO confundir con estructurado FABRICADO** — si el
     precio estructurado da el **mismo $/m² en todas las tipologías** (= $/m² × área) o el texto dice "desde",
     NO es precio de unidad → es aviso-proyecto → **multiproyecto** (ver Discriminador nivel 2-3). Sky Level
     cayó acá: su C21 bob/6.96 daba $2.055/m² uniforme = fabricado, no `amount` real.
   - (c) **Sin precio en NINGUNA fuente** (solo parqueo/baulera, rango por-m² de proyecto, "cesión sin monto",
     otra operación) → `gate: rechazar` (RETENER).
   El estructurado es FALLBACK, NUNCA le gana al texto: cuando el texto tiene precio, manda el texto (y su TC).

### DORMITORIOS
- `0` = **monoambiente** = correcto (el front muestra "Monoambiente"). Conservar 0 si el texto dice "monoambiente".
- Subir `0→N` solo si el texto dice "N dormitorios/habitaciones" y NO es mono (el `recamaras` del extractor
  devuelve 0 en deptos multi-dorm — 3539 117m² decía "2 habitaciones", recamaras=0).
- **El texto SIEMPRE pisa la señal estructurada.** Parseá el número aunque venga PEGADO ("2dormitorio",
  "2dorm.") o en PALABRA ("dos dormitorios", "tres habitaciones"). Ej 3378: título "2dormitorio" → 2, NO 1.

### BAÑOS
Cascada de fuentes (en orden), la descripción SIEMPRE pisa:
1. **Base = `banos` del DISCOVERY/listado** (`c21Listado`/`remaxListadoSC` lo traen del search API del portal —
   suele estar poblado aunque el detalle venga null). Segundo respaldo: `banos` del detalle.
2. **Texto CORRIGE** si dice un número ("2 baños") o "baño completo con box" (=1).
3. **≤1 dorm (monoambiente O 1 dormitorio) → 1 baño** (v4.2, alineado con alquiler v2: una unidad habitable de
   ≤1 dorm tiene ≥1 baño — definicional, NO es asumir). Aplica cuando 1-2 no dieron señal. (Antes solo mono=0 →
   dejaba los 1-dorm en null; ahora 1-dorm sin señal = 1, como el mono.)
4. **Señal "en suite"** — "N dormitorios, M en suite" significa M dormitorios CON baño privado. Cuenta como
   ≥ M baños; si hay dormitorios NO-suite (o el aviso menciona baño social) → +1 social. Ej "2 dorm, 1 en
   suite" → **2 baños** (1 privado del suite + 1 social). "en suite" NO es equipamiento — es referencia de
   habitación-con-baño.
5. `null` solo si **multi-dorm (≥2)** SIN número, SIN suite, SIN estructurado NI discovery. Honesto: no adivinar
   (poner "1" en un 2+ dorm haría creer que hay uno solo cuando es "no sé").

### ÁREA (`area_m2`) — el TEXTO pisa al portal (v4.3, 21-jul)
**Reportá la superficie de LA UNIDAD si el TEXTO la declara. `null` si el texto no la dice.**
- Fuentes en el texto: *"74,5 m²"*, *"superficie 63 m²"*, *"área construida 120 m2"*, *"consta de 31,83 m²"*.
- **`null` NO es "no sé cuánto mide"** — es "el aviso no lo declara" → el cargador deja la del portal. No
  inventar ni estimar por dormitorios/precio.
- **Qué NO es:** el área del LOTE/terreno del condominio, la del área social, ni un rango ("desde 60 m²" en
  un aviso-proyecto → eso es señal de multiproyecto, ver GATE, no `area_m2` de unidad).
- **Por qué existe esta regla (caso real, 21-jul):** el portal dio `1700 m²` para un depto cuyo texto dice
  **177 m²** (error ×10 de carga del captador). Entró al feed y cualquier $/m² de esa unidad sale absurdo.
  Era el ÚNICO campo donde la lectura del texto se descartaba: el cargador tomaba `a.area` (estructurado)
  mientras baños/piso/parqueo sí respetan el veredicto. Con esta regla el texto pisa, como en todo el spec.
- **Cero falsos positivos por diseño:** no es una heurística de rangos (que perdería un penthouse de 450 m²
  legítimo) — es el aviso hablando. Si el texto calla, no se toca nada.

### AMENIDADES + EQUIPAMIENTO (solo lo CONFIRMADO — NUNCA inferir/asumir/curar)
Regla madre (de prod `prompt-ventas.md`): **solo lo CONFIRMADO. NUNCA inferir** Pet Friendly, Sauna,
Ascensor, etc. sin evidencia. Ausencia = en blanco, **nunca "no tiene"** y **nunca "sí tiene" inventado**.

> **⚠️ "CONFIRMADO" = texto libre O estructurado del portal — NO solo la descripción.** Los checkboxes que
> el anunciante marcó en C21 (`caracteristicasJSON.campos` con `valor=true`) y las `features` de Remax son
> declaraciones EXPLÍCITAS del anunciante, tan válidas como el texto. El cargador ya las usa como fallback
> (`construirFila`: si el lector no trae amenidades del texto, canoniza el estructurado) — **eso es CORRECTO,
> NO invención**. Lo ÚNICO prohibido es inventar lo que NO está ni en el texto ni en el estructurado: derivar
> amenidades del NOMBRE del edificio ("Sky Luxury" → Piscina) o de conocimiento externo del proyecto. Ante
> duda sin ninguna de las dos fuentes → vacío.

**`amenidades`** — solo DIFERENCIADORES del edificio, mapeados al vocabulario canónico. El vocabulario es
`AMENIDADES_MERCADO` (`simon-mvp/src/config/amenidades-mercado.ts`), subconjunto **`esEstandar: false`**:
> Piscina · Churrasquera · Sauna/Jacuzzi · Gimnasio · Estacionamiento para Visitas · Pet Friendly ·
> Salón de Eventos · Co-working · Parque Infantil · Jardín
- Mapeá sinónimos a la clave canónica ("pileta/pool"→Piscina, "cowork/co-work"→Co-working, "quincho/parrilla"→Churrasquera).
- **NO** son canónicas las `esEstandar: true` (Seguridad 24/7, Ascensor, Recepción, Área Social, Terraza, Lavadero):
  el broker no las menciona, curarlas por edificio es inviable y su ausencia no significa nada → **NO se extraen,
  NO se asumen, NO se curan**. Si el texto las menciona explícitas → van a `amenidades_extra`, nunca a `amenidades`.

**`amenidades_extra`** — cualquier amenidad de edificio CONFIRMADA que no esté en el vocabulario canónico
(ej "Salas de TV", "Cine", "Rooftop"). Balde catch-all: no se pierde nada, pero no ensucia el vocabulario.

### EQUIPAMIENTO de la UNIDAD — 3 baldes (captura TODO, solo lo tiera)
El equipamiento de unidad es una **cola larga impredecible** (chapa digital, domótica, doble vidrio…). NO se
intenta predecir todo. Se separa en:

**A) FLAGS de decisión** (booleanos de alto nivel — filtrables como "solo equipados"):
- `amoblado` = viene con **muebles** (living/camas/sofás).
- `equipado` = viene con **electrodomésticos/cocina**. **v4 — SOLO la afirmación del broker:** `true` únicamente si el
  texto usa la PALABRA ("totalmente equipado" / "entrega equipada" / "equipado"). Si el aviso solo **ENUMERA**
  electrodomésticos (heladera, cocina, AC) SIN decir "equipado" → flag `null` (no lo inferimos), PERO esos ítems SÍ
  van a `equipamiento_canonico` — no se pierde el detalle, el filtro por-ítem sigue funcionando. Así el flag no exige
  definir un combo arbitrario de "qué cuenta como equipado". El flag **NO inventa** electrodomésticos que el texto no nombre.
  - **v4 — la palabra debe recaer sobre la UNIDAD/entrega, NO sobre un ambiente aislado (decisión founder 10-jul):**
    "totalmente equipado" / "departamento equipado" → `true`. **"Cocina equipada"** / "baño equipado" / "gimnasio
    equipado" → NO disparan el flag (`null`): describen un ambiente, no la unidad. ("Cocina equipada" igual va a
    `equipamiento_canonico` como ítem → filtrable.) También el sustantivo "equipamiento completo/full" SIN el participio
    "equipad*" a nivel unidad → `null` (es enumeración, no la afirmación).

**B) `equipamiento_canonico`** — vocabulario FIJO, filtrable (mapeá sinónimos a estas claves):
> **Electrodomésticos**: Cocina equipada · Heladera · Lavadora · Secadora · Termotanque/Calefón · Aire acondicionado · Microondas · TV/Smart TV
> **Almacenamiento**: Roperos/Closets · Vestidor
> **Espacios**: Balcón · Terraza propia · Cuarto de servicio · Box de baño
> **Seguridad/smart**: Chapa digital · Domótica · Video portero
- **"Cocina equipada" = concepto**: mapeá acá cuando el texto diga muebles/cajonería de cocina, cocina
  empotrada/americana equipada, mesón, extractor, hornallas → todo colapsa a `Cocina equipada` (implica
  muebles empotrados + extractor + cocina). Así los ~8 nombres de cocina → 1.
- **Lavadora vs área de lavandería (desambiguar — falla real 3539):**
  - "**lavadora incluida**" / "con lavadora" / "espacio con lavadora" → `Lavadora` (el electrodoméstico SÍ va).
  - "**área de lavandería**" / "espacio de lavado" a secas = un AMBIENTE del depto, NO garantiza el
    electrodoméstico → NO mapear a `Lavadora`. Va a `equipamiento_otros: ["Área de lavandería"]` (o nada).
  - "área de lavandería **común**" / "lavandería en el piso X" = amenidad del EDIFICIO → `amenidades_extra: ["Lavandería"]`.

**C) `equipamiento_otros`** — todo lo demás CONFIRMADO fuera del canónico, tal cual, **sin predecir**:
> doble vidrio · mesón de granito · pisos de porcelanato · intercomunicador · iluminación LED · espejos · cortinas
- Se MUESTRAN (línea "También:…"), no se filtran. Nada se descarta salvo palabras que no son features.

**Exclusiones**: `suite`/`en suite` NO es equipamiento — es **señal de baños** (ver BAÑOS).

**Desambiguación edificio vs unidad** (el juez lee CONTEXTO):
- "área de lavandería común / en el piso 20" → amenidad de edificio · "lavandería propia del depto" → equipamiento (Lavadora).
- "terraza social panorámica" → edificio · "cada depto con su balcón" → equipamiento (Balcón).

> Escalabilidad: el vocabulario de diferenciadores es zona-INDEPENDIENTE (una piscina es una piscina en
> Equipetrol o ZN). El `%`/`esEstandar` es capa de DISPLAY por-zona, NUNCA entra en la extracción del juez.

### PARQUEO + BAULERA (estructurado como base; la DESCRIPCIÓN manda)
- `estacionamientos_incluidos`: cuántos parqueos incluye el precio. Base = estructurado; **el texto pisa**
  ("2 parqueos incluidos" > el dato del portal). `null` si ninguna fuente lo dice.
- `parqueo_precio_adicional_usd`: si el parqueo es APARTE, su costo del texto ("parqueo opcional/disponible/reservado $8.000").
- `baulera_incluida`: true/false del texto o estructurado (**texto manda**). `null` si no hay señal.
- `baulera_precio_adicional_usd`: si la baulera es aparte, su costo del texto.
- **🔴 APARTE ⟺ NO incluido (regla dura, falla frecuente 10-jul):** si hay `parqueo_precio_adicional_usd` (el
  texto dice "parqueo opcional/aparte/disponible $X") → `estacionamientos_incluidos = 0` (NO null, NO ≥1) — es
  incompatible con "incluido". Ídem baulera. **NUNCA** coexisten un precio adicional y "incluido=true".
- **Sin señal → null, no true:** si NI el texto NI el estructurado mencionan parqueo → `estacionamientos_incluidos = null`.
  NO inventar parqueo incluido (Remax sin checkboxes: parqueo ausente del texto = null). "Parqueo Y baulera: $X"
  conjunto → ambos APARTE (registrá el costo conjunto), no uno incluido.
- Siempre: **tomar como válido lo de la descripción** — el estructurado es solo respaldo por si el texto calla.

> **Fuera de alcance (nice-to-have, casi ningún aviso los trae — NO extraer):** plan de pagos, permuta,
> negociable, descuento contado, expensas. Área/m2 tampoco es del juez (viene del discovery + fallback de texto).

### PISO (de la unidad)
- Base = `piso` estructurado (viene null seguido). El texto lo llena: "Nivel 3", "Piso 3", "3er piso".
- ⚠️ **Desambiguación** — NO confundir el piso de la UNIDAD con:
  - **pisos de amenidades**: "áreas sociales en pisos 4, 27 y 28" → NO es el piso del depto.
  - **altura del edificio**: "torre de 20 pisos", "niveles_edificio" → es el total, no la unidad.
  - **"Pasillo N" / nº de departamento** ("Pasillo 1", "Dpto 302") → dirección/unidad, NO piso (falla 3342).
  - **romano del NOMBRE del edificio**: "Stone II", "Siria II" → el II es del nombre, NO el piso (falla 2656).
- Si el texto NO declara el piso de la unidad (aunque mencione otros pisos) → `null`. **NO heredes ciegamente el
  `piso` estructurado si el texto no lo corrobora** (viene mal seguido). No adivinar.

### ESTADO_CONSTRUCCION + FECHA_ENTREGA (port de prod `prompt-ventas.md`)
- **preventa**: "precios desde", "entrega [fecha futura]", "en construcción", "obra gruesa", "avance X%", fecha de entrega futura.
- **entrega_inmediata**: "listo para vivir", "entrega inmediata", "listo para ocupar", "a estrenar", inmueble terminado.
- **Sin FRASE EXPLÍCITA de estado → `null`.** ⚠️ NO inferir `entrega_inmediata` de "amoblado", "equipado",
  "moderno", "exclusivo", "listo para invertir", ni de la mera presencia de amenidades/fotos lindas.
  **Ejemplo negativo** (falla real, 3456/3540): un aviso que solo dice "Departamento amoblado y equipado"
  o "entorno moderno y seguro", SIN "a estrenar" / "listo para vivir" / "en construcción" / "entrega [fecha]"
  → `estado_construccion = null` (NUNCA `entrega_inmediata`). El estado se AFIRMA, no se deduce del ambiente.
- `fecha_entrega_estimada`: solo si preventa Y el texto la da ("entrega Diciembre 2026", "entrega 2027"). Sino `null`.

### AMOBLADO vs EQUIPADO (2 flags de decisión, distintos)
- **`amoblado`** = `true` SOLO si el texto dice **amoblado / amueblado / con muebles / se vende amoblado** (muebles: living/camas/sofás).
- **`equipado`** = `true` **SOLO** si el texto usa la PALABRA **"totalmente equipado" / "entrega equipada" / "equipado"** (v4).
  Enumerar electrodomésticos sin la palabra → flag `null` (los ítems van igual a `equipamiento_canonico`).
- Un depto puede estar **equipado sin amoblar** (lo más común en venta): electrodomésticos sí, muebles no.
- Ambos `null` si no se mencionan (no asumir). El flag NO inventa ítems específicos del `equipamiento_canonico`.

### NOMBRE DE EDIFICIO (para matching, name-first)
- Leé el nombre del **slug (C21) / descripción (Remax)** y entregá el **canónico**: romano→arábigo
  ("Stone III"→"Stone 3"), sin sufijos de marketing ("by SmartStudio" queda si es parte del nombre real).
- Si el nombre crudo del portal difiere del canónico → poné el crudo en `alias_sugerido`.
- Si NO hay nombre en ninguna fuente → `nombre_edificio_canonico: null` (el matcher devuelve `sin_nombre`;
  NO se fuerza por GPS — los anunciantes lo ponen mal). Queda sin match → lo levanta el audit/lector luego.

### GATE (aceptar/rechazar) + MULTIPROYECTO
- **rechazar** = basura REAL que no se debe guardar: baulera/parqueo/depósito suelto, otra operación mal tipeada
  (anticrético/alquiler como venta), precio no confiable/contradictorio. Va a `rechazados.json`.
- **🔴 GATE de OPERACIÓN — leé el TEXTO (falla real 10-jul, 2697):** si el CUERPO del aviso **OFRECE** alquiler/
  anticrético → `gate: rechazar` (razon_gate: "operación alquiler/anticrético tipeada como venta"), **aunque la
  metadata sea venta**. La contradicción de operación gana; no te fíes solo del `tipo_operacion` del portal.
  - **RECHAZAR** = el aviso OFRECE la operación: verbo de oferta ("se alquila", "en alquiler", "en anticrético",
    "en renta", "disponible para alquiler") **O** un precio **MENSUAL / Bs-por-mes / monto de anticrético**.
  - **v4 — NO rechazar** si "renta/rentabilidad/rentable/Airbnb" es **PITCH de inversión sobre una VENTA** ("renta
    ejecutiva", "alta rentabilidad", "ideal para renta corta/Airbnb", "excelente inversión") Y el precio es de venta
    (6 cifras USD, no mensual). El adjetivo de inversión NO es la operación. **Señal dura:** precio mensual → alquiler;
    precio de venta + "renta" adjetivo → venta.
- **🔴 v4.2 — BLOQUE / PISO COMPLETO / LOTE DE UNIDADES → `es_multiproyecto: true`** (caso real 17-jul, prop 3742
  Rhodium: *"SE VENDE PISO COMPLETO"*, 4 unidades en bloque, $429.000 / 250 m²). El aviso vende **N unidades juntas**,
  no un depto → **NO es una unidad comparable**: ensucia la mediana y al que busca un depto le aparece un piso entero.
  - **Señal:** "piso completo", "piso entero", "bloque de N deptos", "N departamentos juntos/en bloque", "todo el piso",
    "venta en bloque", y el área/precio son de VARIAS unidades sumadas (ej. 250 m² con 2 dorm = suma, no una unidad).
  - **Ojo — el $/m² NO lo detecta:** 3742 daba $1.716/m² (coherente) y pasó el discriminador. Lo que discrimina es
    **cuántas unidades vende el aviso**, no si el precio cierra. Si vende más de una → multiproyecto.
  - NO usar `gate: rechazar` (no es basura: es inventario real, solo que agrupado) → taguear y que el cargador lo
    desvíe a `proyectos_detectados`.
- **Multiproyecto NO se rechaza** — se TAGUEA `es_multiproyecto: true` (+ `gate: aceptar`). El cargador lo
  DESVÍA a la tabla `proyectos_detectados` (mig 273): NO entra a `propiedades_v2_shadow` ni al feed. Se guarda
  la **cruda** (activo durable, portable, contable) para el **despliegue diferido** de tipologías.
- **Discriminador UNIDAD vs MULTIPROYECTO (2 niveles) — el estructurado puede MENTIR:**
  1. El **TEXTO** da un **PRECIO ESPECÍFICO y EXACTO de una unidad** ("$us 159.000", "USD 49.500", "85.000 $us")
     → es una **UNIDAD**, aunque el copy sea de proyecto.
  2. 🔴 **"DESDE X" NO es precio de unidad — es el PISO de un rango de proyecto → MULTIPROYECTO** (corrección
     11-jul, falla Sky Level 182-185). Señales duras de aviso-proyecto: la palabra **"desde"/"a partir de"** antes
     del precio; **rangos por tipología** ("1D desde 55.000$ y 2D desde 97.350$"); "precios de lanzamiento";
     "recibí el brochure"; **el mismo "desde" INCONSISTENTE entre avisos del mismo proyecto** (Sky Level: "2D desde
     132.750$" en un aviso, "desde 97.350$" en otro). Tener un área por listing NO lo hace unidad si el precio es
     "desde": sin un monto EXACTO de esa unidad, el precio real es indeterminable → va a `proyectos_detectados`,
     NO al feed (poner "desde"=subvalúa; poner el estructurado bob/6.96=infla — ambos adivinan).
  3. El texto solo da **$/m² / rangos sin precio** ("Desde 62m²", "1,2,3 dorms", "1650$/m²") → mirá la **COHERENCIA
     del par (precio, área)** del estructurado: área realista (≤~400 m²) + $/m² en banda → unidad real; **área ABSURDA**
     (ej `14431`) o `precio = $/m² × área` (mismo $/m² en todas las tipologías) → **multiproyecto** (el estructurado
     fabricó el precio). Ej: Condado VI 2731 (área "14431", precio 238.111 = 1650 × 144,31); Sky Level (bob/6.96 da
     ~$2.055/m² uniforme en las 4 = fabricado).
  - **v4.1 (13-jul) — de qué fuente y CUÁL área (validado 19/19 en test ciego, falla Speranto/Grigia):** el área del
    Nivel 3 viene del ESTRUCTURADO (`senales.area`) **O del TEXTO** — el texto pisa (como todo en el spec). PERO solo
    cuenta el área **ESPECÍFICA DE LA UNIDAD** (misma desambiguación que el PISO):
    · ✅ **TOMAR** — construida atada a UNA tipología: *"Departamento de 1 dormitorio mt2. conts: 39,44"*, *"Monoambiente
      31,83 m²"*, *"superficie del depto 63 m²"*. Es EL m² de ESE depto (aunque `senales.area` venga null).
    · ❌ **NO como área de unidad** — *"DESDE X m²"* / **rango** (*"de 39 a 120 m²"*): piso de rango de proyecto (Nivel 2)
      → área indeterminable → **multiproyecto**.
    · ❌ **IGNORAR** — amenidad (*"piscina 200 m²"*), **total** del edificio/terreno, y **terraza/balcón** (adicional →
      usar la construida `conts`, no la terraza; trampa real: Speranto 8000012 terraza 40,19 ≈ conts 41,09).
    · ❌ **Aviso que LISTA múltiples tipologías** (*"Tipologías: monoambientes, 1, 2 y 3 dorms"*) SIN un `conts` de una
      unidad → brochure de proyecto → **multiproyecto** (así se separa Domus Onix, que enumera todas + precio `.5`, de
      Speranto/Grigia, que dan `conts` por listing + precio redondo).
    · Sin área específica de unidad en NINGUNA fuente **y** sin precio exacto en el texto → indeterminable → multiproyecto.
  - **v4.1 — REDONDO vs FABRICADO (el tell, NO el "$/m² uniforme" a secas):** el $/m² parecido entre listings de un
    mismo edificio es NORMAL (misma lista de precios del desarrollador) y NO prueba fabricación. La fabricación se delata
    por el PRECIO: **redondo** (52.500, 57.000, 72.500 — múltiplos de 500/1.000) = lo fijó una persona → precio REAL de
    tipología → con área = **UNIDAD**; **decimal crudo** (`.5`/`.25` — 67.787,5 / 46.327,5) = es el producto `$/m² × área`
    que calculó el sistema → **FABRICADO** → multiproyecto. El corte de fabricación es **decimal crudo o área absurda**.
- **`tipologias` (dorms/area/precio desde-hasta) NO se captura ahora** — se extrae en una SEGUNDA PASADA sobre la
  cruda guardada (decisión founder 10-jul). Nada se pierde: la cruda está en `proyectos_detectados`.
- El feed ya filtra área<20 / duplicados / es_multiproyecto — el gate cubre lo que la metadata no ve pero el texto delata.

## Matching (lo hace el `matcher.mjs`, NO el lector)
El lector solo entrega `nombre_edificio_canonico`. El cargador llama `matchearPorNombre(sb, { nombre, zona, lat, lon })`
(pide `p_limite: 15`, no 5 — para no perder candidatos válidos fuera del top-5 del fuzzy):
- score ≥ 0.95 + zona corrobora → **auto-asigna**.
- **desde 17-jul — `mismoTokenSet` (orden invertido):** un candidato con score < 0.95 también se da por **FUERTE** si
  tiene el **MISMO conjunto de tokens distintivos** que el nombre-guess (p. ej. "Torre Alfa" ↔ "Alfa Torre"). Guardas:
  ≥2 tokens, los dos conjuntos idénticos, y los números cuentan como token. Implementado en `mismoTokenSet` (lib/matcher.mjs).
- ambiguo / fuzzy débil / sin nombre → queda sin match (el lector puede fijar `id_proyecto_master` a mano, o va al audit).
GPS **secundario** (solo desempata mismo-nombre en zonas distintas). Ver `matcher.mjs`.
