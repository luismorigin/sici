# Spec del LECTOR de deptos — reglas para producir el veredicto

> Contrato ÚNICO de lo que el lector decide al ingerir un depto. Lo cumple **el lector
> humano-agente (Claude Code en sesión, hoy)** y, cuando se enchufe, **un API (OpenRouter,
> mañana)** — con el MISMO texto como system-prompt. El cargador (`cargar-deptos-shadow.mjs`)
> prepara el material ($0) y aplica el veredicto; NO decide nada de esto.

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
> - **`oficial_viejo`**: SOLO si el texto ancla EXPLÍCITO al rate muerto ("6.96" / "Bs 7" / "TC 7" / "al oficial 7") → se descuenta.
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
   - (b) **La descripción NO trae precio, pero hay precio ESTRUCTURADO por-unidad** (Remax `amount` /
     C21 `precioVenta`) con $/m² coherente → **aceptá** con ese precio + `no_especificado` (sin el texto
     no hay señal de TC → conservador, no infla; el badge `tc_sospechoso` es la red). Ej: preventa Sky Level
     (5 unidades, copy genérico idéntico, sin precio en texto, pero cada una con `amount` real 132k-150k).
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
3. **Monoambiente (dorms=0) → 1 baño** (definicional: un mono ES 1 ambiente + 1 baño; NO es asumir, es su
   definición). Aplica cuando 1-2 no dieron señal.
4. **Señal "en suite"** — "N dormitorios, M en suite" significa M dormitorios CON baño privado. Cuenta como
   ≥ M baños; si hay dormitorios NO-suite (o el aviso menciona baño social) → +1 social. Ej "2 dorm, 1 en
   suite" → **2 baños** (1 privado del suite + 1 social). "en suite" NO es equipamiento — es referencia de
   habitación-con-baño.
5. `null` solo si multi-dorm SIN número, SIN suite, SIN estructurado NI discovery. Honesto: no adivinar.

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
- `equipado` = viene con **electrodomésticos/cocina** — "totalmente equipado" / "entrega equipada" / "equipado" → `true`.
  El flag captura la AFIRMACIÓN resumen; **NO inventa** electrodomésticos específicos que el texto no nombre.

**B) `equipamiento_canonico`** — vocabulario FIJO, filtrable (mapeá sinónimos a estas claves):
> **Electrodomésticos**: Cocina equipada · Heladera · Lavadora · Secadora · Termotanque/Calefón · Aire acondicionado
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
- `parqueo_precio_adicional_usd`: si el parqueo es APARTE, su costo del texto ("parqueo opcional $8.000").
- `baulera_incluida`: true/false del texto o estructurado (**texto manda**). `null` si no hay señal.
- `baulera_precio_adicional_usd`: si la baulera es aparte, su costo del texto.
- Siempre: **tomar como válido lo de la descripción** — el estructurado es solo respaldo por si el texto calla.

> **Fuera de alcance (nice-to-have, casi ningún aviso los trae — NO extraer):** plan de pagos, permuta,
> negociable, descuento contado, expensas. Área/m2 tampoco es del juez (viene del discovery + fallback de texto).

### PISO (de la unidad)
- Base = `piso` estructurado (viene null seguido). El texto lo llena: "Nivel 3", "Piso 3", "3er piso".
- ⚠️ **Desambiguación** — NO confundir el piso de la UNIDAD con:
  - **pisos de amenidades**: "áreas sociales en pisos 4, 27 y 28" → NO es el piso del depto.
  - **altura del edificio**: "torre de 20 pisos", "niveles_edificio" → es el total, no la unidad.
- Si el texto NO declara el piso de la unidad (aunque mencione otros pisos) → `null`. No adivinar.

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
- **`equipado`** = `true` si el texto dice **"totalmente equipado" / "entrega equipada" / "equipado"** (electrodomésticos/cocina).
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
- **Multiproyecto NO se rechaza** — se TAGUEA. Aviso a nivel proyecto (rangos "1650$/m²", "Desde 62 m²",
  "1,2,3 dormitorios" sin unidad concreta ni precio total) → `gate: aceptar` + `es_multiproyecto: true`.
  Se guarda con el tag (el feed lo excluye por `es_multiproyecto`), para que una solución futura parsee sus
  tipologías en unidades. NO se pierde. (Ej: 2731 Condado VI Plaza Italia.)
- El feed ya filtra área<20 / duplicados / es_multiproyecto — el gate cubre lo que la metadata no ve pero el texto delata.

## Matching (lo hace el `matcher.mjs`, NO el lector)
El lector solo entrega `nombre_edificio_canonico`. El cargador llama `matchearPorNombre(nombre, zona, gps)`:
- score ≥ 0.95 + zona corrobora → **auto-asigna**.
- ambiguo / fuzzy débil / sin nombre → queda sin match (el lector puede fijar `id_proyecto_master` a mano, o va al audit).
GPS **secundario** (solo desempata mismo-nombre en zonas distintas). Ver `matcher.mjs`.
