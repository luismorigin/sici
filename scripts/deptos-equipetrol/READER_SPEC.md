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
  "precio_usd": 78571,               // CRUDO: billete si paralelo; USD directo si oficial/no_especificado. NO normalizar.
  "tipo_cambio_detectado": "oficial",// "paralelo" | "oficial" | "no_especificado"
  "dormitorios": 1,                  // 0 = monoambiente (válido). Corregir 0→N solo si el texto dice N.
  "banos": 1,                        // base estructurada; el texto corrige si dice otra cosa. null si no hay señal.
  "piso": 3,                         // piso de LA UNIDAD (ver regla). null si no se declara / solo hay pisos de amenidades.
  "estado_construccion": "preventa", // "preventa" | "entrega_inmediata" | null (ver regla; port de prod)
  "fecha_entrega_estimada": "Diciembre 2026", // solo si preventa y el texto la da. null si no.
  "amoblado": null,                  // true si el texto dice AMOBLADO (con muebles). "equipado" NO cuenta. null si no menciona.
  "nombre_edificio_canonico": "Stone 3", // el nombre CANÓNICO (romano→arábigo, sin ruido). El matcher lo usa.
  "id_proyecto_master": null,        // opcional: si YO ya resolví el pm (deja null → lo resuelve el matcher con el nombre)
  "alias_sugerido": "Stone III",     // opcional: variante cruda a guardar como alias del pm (se registra, NO se escribe a prod en fase shadow)

  // ── AMENIDADES + EQUIPAMIENTO (solo lo CONFIRMADO por el texto; NUNCA inferir/asumir) ──
  "amenidades": ["Piscina", "Gimnasio"],   // diferenciadores del EDIFICIO mapeados al vocabulario canónico (ver abajo)
  "amenidades_extra": ["Salas de TV"],     // confirmadas NO canónicas → no se pierden (patrón casas caracteristicas_extra)
  "equipamiento_unidad": ["Cocina equipada", "Vestidor"], // features de la UNIDAD (libre)

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

### PRECIO + TC (CONSERVADOR — comparable con prod; el TEXTO manda)
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

### AMENIDADES + EQUIPAMIENTO (solo lo CONFIRMADO por el texto — NUNCA inferir/asumir/curar)
Regla madre (de prod `prompt-ventas.md`): **solo lo que el texto CONFIRME explícitamente. NUNCA inferir**
Pet Friendly, Sauna, Ascensor, etc. sin mención. Absencia en el texto = en blanco, **nunca "no tiene"** y
**nunca "sí tiene" inventado**.

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

**`equipamiento_unidad`** — atributos de la UNIDAD: cocina equipada, cajonería/closets, calefón, aire
acondicionado, domótica, box de baño, mobiliario, **cuarto de servicio, vestidor, balcón, sala-comedor**.
Libre (sin vocabulario fijo). Son data útil del depto.
- **ÚNICA exclusión**: `suite`/`en suite` NO va acá — es una habitación-con-baño → **señal de baños**
  (ver BAÑOS), no un atributo aparte.

**Desambiguación edificio vs unidad** (el juez lee CONTEXTO, el regex no puede):
- "área de lavandería común / en el piso 20" → edificio · "lavandería propia del depto" → `equipamiento_unidad`.
- "terraza social panorámica" → edificio · "cada depto con su balcón" → `equipamiento_unidad`.

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
- Sin evidencia clara → `null`. ⚠️ **"amoblado"/"equipado" SOLOS NO implican entrega_inmediata.**
- `fecha_entrega_estimada`: solo si preventa Y el texto la da ("entrega Diciembre 2026", "entrega 2027"). Sino `null`.

### AMOBLADO
- `true` SOLO si el texto dice **amoblado / amueblado / con muebles / se vende amoblado**.
- ⚠️ **"equipado" / "cocina equipada" NO es amoblado** (eso es `equipamiento_unidad`). Amoblado = viene con muebles.
- `null` si no se menciona (no asumir "sin muebles" — la venta suele ser vacía, pero no lo afirmamos).

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
