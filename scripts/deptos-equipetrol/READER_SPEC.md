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
  "gate": "aceptar",                 // "aceptar" | "rechazar" (basura: baulera/parqueo/multiproyecto/otra-operación)
  "razon_gate": null,                // si rechazar, por qué
  "precio_usd": 78571,               // CRUDO: billete si paralelo; USD directo si oficial/no_especificado. NO normalizar.
  "tipo_cambio_detectado": "oficial",// "paralelo" | "oficial" | "no_especificado"
  "dormitorios": 1,                  // 0 = monoambiente (válido). Corregir 0→N solo si el texto dice N.
  "nombre_edificio_canonico": "Stone 3", // el nombre CANÓNICO (romano→arábigo, sin ruido). El matcher lo usa.
  "id_proyecto_master": null,        // opcional: si YO ya resolví el pm (deja null → lo resuelve el matcher con el nombre)
  "alias_sugerido": "Stone III",     // opcional: variante cruda a guardar como alias del pm (se registra, NO se escribe a prod en fase shadow)
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

### NOMBRE DE EDIFICIO (para matching, name-first)
- Leé el nombre del **slug (C21) / descripción (Remax)** y entregá el **canónico**: romano→arábigo
  ("Stone III"→"Stone 3"), sin sufijos de marketing ("by SmartStudio" queda si es parte del nombre real).
- Si el nombre crudo del portal difiere del canónico → poné el crudo en `alias_sugerido`.
- Si NO hay nombre en ninguna fuente → `nombre_edificio_canonico: null` (el matcher devuelve `sin_nombre`;
  NO se fuerza por GPS — los anunciantes lo ponen mal). Queda sin match → lo levanta el audit/lector luego.

### GATE (aceptar/rechazar)
- Rechazar: baulera/parqueo/depósito, multiproyecto, otra operación mal tipeada (anticrético/alquiler como venta),
  precio no confiable. El feed ya filtra área<20 / duplicados / es_multiproyecto — el gate cubre lo que la metadata
  no ve pero el texto delata.

## Matching (lo hace el `matcher.mjs`, NO el lector)
El lector solo entrega `nombre_edificio_canonico`. El cargador llama `matchearPorNombre(nombre, zona, gps)`:
- score ≥ 0.95 + zona corrobora → **auto-asigna**.
- ambiguo / fuzzy débil / sin nombre → queda sin match (el lector puede fijar `id_proyecto_master` a mano, o va al audit).
GPS **secundario** (solo desempata mismo-nombre en zonas distintas). Ver `matcher.mjs`.
