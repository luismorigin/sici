# Plataforma Híbrida Genérica — Visión de arquitectura del pipeline

> Estado: **VISIÓN / DISEÑO** — ⚠️ **PARCIALMENTE SUPERADO (act. 19-jul-2026):** deptos Equipetrol **venta Y
> alquiler** ya están implementados y cerrados en shadow, y el código está **en main** (PR #22, 18-jul). Lo que
> sigue siendo visión es la **generalización** (otras zonas/tipos). Fecha original: 2026-06-21. Autor: Lucho + Claude.
> 🔴 **Fuente de verdad del estado real: `scripts/deptos-equipetrol/ESTADO_MIGRACION.md` + `CUTOVER_DATA_PLAN.md`**
> (si este doc los contradice, ganan ellos).
> Contexto: nace de la sesión de casas ZN (jun-2026), donde el flujo híbrido demostró ser más barato
> (fetch directo vs Firecrawl pago), más mantenible (código + agente vs flujos n8n visuales) y más
> fácil de extender. Este doc define cómo generalizarlo para cubrir **todo el sistema** y retirar n8n.
> Relacionado: `docs/proyectos/zona-norte/DISENO_PIPELINE_CASAS_VIVIENDA.md` (el caso casas, ya implementado),
> memoria `project_sonda_suelo_zn_urubo_jun2026`.

---

## 1. La decisión

**Una sola plataforma híbrida genérica reemplaza gradualmente a n8n.** Cubre la matriz completa:

```
  TIPO        × OPERACIÓN     × ZONA
  ──────────    ───────────     ──────────
  departamento  venta           Equipetrol
  casa          alquiler        Zona Norte
  terreno       anticrético     Urubó, Polanco, Sur…  (futuro)
```

n8n **no se expande** (nada nuevo nace ahí) y eventualmente **se retira**. El reemplazo es por
**estrangulamiento** (strangler fig): el sistema nuevo crece alrededor del viejo hasta que el viejo
sobra, sin un "big bang" riesgoso. **Deptos en Equipetrol (producto vivo) se migra al final, con red.**

---

## 2. El insight fundamental: el contrato

No hay que elegir "n8n vs híbrido" a nivel producto. **El feed no sabe ni le importa quién llenó la tabla.**

```
   n8n  ─┐
         ├─→  propiedades_v2  ─→  vistas (v_mercado_*)  ─→  feed
 híbrido ─┘     [EL CONTRATO]
```

`propiedades_v2` + las vistas (`v_mercado_venta`, `v_mercado_alquiler`, `v_mercado_casas`, …) son
**el contrato**. n8n y el híbrido son **productores intercambiables**. Mientras ambos escriban las
mismas columnas, el feed los muestra igual. Evidencia: los deptos ZN del n8n y las casas ZN del
híbrido ya conviven en las vistas sin pisarse.

**Consecuencia:** n8n y el híbrido pueden coexistir indefinidamente durante la transición. La
migración no es un corte — es ir moviendo productores detrás de un contrato estable.

---

## 3. Genérico es el PROCESO, no los DATOS

El error que hunde a las plataformas genéricas: aplanar todo a un molde único y perder lo que hace
valioso cada tipo. Acá **no pasa**, porque se separan dos cosas:

| | ¿Genérico o específico? |
|---|---|
| **El proceso** (cómo capturás: discovery→fetch→MOAT→carga) | **Genérico** — igual para todo |
| **Los datos** (qué características guardás y mostrás) | **Específico** — distinto por tipo/operación |

**Analogía: línea de montaje, no uniforme.** La línea (proceso) es la misma para un sedán, una
camioneta y un deportivo — pero cada uno sale con su motor, su carrocería, sus asientos. La línea
genérica **produce autos distintos**. Lo común es la fabricación, no el producto.

Una casa, un terreno y un depto salen tan distintos y ricos como se quiera. Lo único que comparten
es el camino de producción y la mesa donde se guardan (`propiedades_v2` + JSON).

---

## 4. El esqueleto genérico (los 7 pasos fijos)

Cualquier combinación pasa por los mismos pasos. Esto **no cambia nunca**:

```
1. Discovery   → traer URLs del portal (filtrar por polígono de zona)
2. Dedup       → sacar repetidos (cross-portal + vs BD por id de URL)
3. Fetch       → bajar detalle: contacto, físicos, descripción, fotos
4. MOAT        → agente LLM extrae lo que el texto esconde (sin API: routine Claude Code)
5. Precio      → normalizar según operación
6. Matching    → vincular al catálogo que corresponda
7. Carga       → upsert en propiedades_v2 (onConflict url,fuente)
```

---

## 5. Los adaptadores: lo que varía, aislado y enchufable

Solo **3 ejes** varían, cada uno una pieza enchufable. La especificidad de cada tipo/operación vive
en **4 lugares**, ninguno se pierde:

```
1. ADAPTADOR de extracción → qué campos saca del portal      (varía por TIPO)
2. datos_json_enrichment   → qué se GUARDA                   (varía por TIPO/OPERACIÓN)
3. CATÁLOGO de matching     → a qué se vincula                (varía por TIPO)
4. CARD del feed            → qué se MUESTRA al usuario        (varía por TIPO/OPERACIÓN)
```

| Paso | Motor (fijo) | Varía según | Ejemplo de lo que cambia |
|---|---|---|---|
| Discovery | el crawler | **tipo** | sección del portal: `/departamento` vs `/casa` vs `/terreno` |
| Fetch | el fetcher | **tipo** | campos: depto→piso; casa→terreno/frente/fondo; terreno→solo suelo |
| MOAT | el agente | **tipo** | qué busca: depto→amenidades edificio; casa→jardín/quincho/condominio |
| Precio | la fórmula | **operación** | venta→TC billete/paralelo; alquiler→Bs/mes oficial; anticrético→monto |
| Matching | el motor | **tipo** | depto→`proyectos_master`; casa→`condominios_master`; terreno→ninguno |
| Geocerca | el filtro | **zona** | polígono de ZN / Equipetrol / Urubó |

**En la práctica** se corre un solo pipeline con un input:

```js
pipeline({ tipo: 'casa',    operacion: 'venta',    zona: 'zona-norte' })
pipeline({ tipo: 'depto',   operacion: 'alquiler', zona: 'urubo'      })
pipeline({ tipo: 'terreno', operacion: 'venta',    zona: 'equipetrol' })
```

Agregar "casa-alquiler-Urubó" = **una línea de config**, no scripts nuevos. Un bug se arregla en
**un** lugar, no en 45 (3 tipos × 3 operaciones × 5 zonas).

---

## 6. Estado de cada adaptador

La **especificidad** (qué extraer/guardar) y la **implementación** (código en el híbrido) son cosas
distintas. Deptos parte con ventaja: su especificidad ya está resuelta por el modelo maduro de Equipetrol.

| Adaptador | Especificidad (qué extraer/guardar) | Implementación en híbrido |
|---|---|---|
| **Deptos** | ✅ **resuelta** (modelo Equipetrol maduro, ya replicado a ZN) | 🔨 falta portar — incl. matching de edificios |
| **Casas** | ✅ resuelta | ✅ **hecho** (305 casas ZN cargadas) |
| **Terrenos** | 🔧 afinar (frente/fondo/uso de suelo/servicios) | 🔨 falta |
| **Venta** | ✅ resuelta (precio TC paralelo/billete) | ✅ hecho |
| **Alquiler** | 🔧 afinar (depósito/mascotas/amoblado/Bs-mes) | 🔨 falta |
| **Anticrético** | 🔧 afinar (monto/plazo/devolución) | 🔨 falta |

---

## 7. El modelo de datos: cómo conviven características distintas sin aplanarse

`propiedades_v2` ya tiene el modelo correcto (no hace falta una tabla por tipo):

- **Columnas comunes:** precio, área, GPS, zona, url, fuente, contacto → lo que TODA propiedad tiene.
- **`datos_json_enrichment` (JSONB):** lo variable → cada tipo mete SUS campos sin estorbar a los otros.

Lo que le importa al usuario, por tipo, **y dónde vive**:

| Tipo | Características que importan | Dónde |
|---|---|---|
| **Casa** | jardín, quincho, piscina, dependencia, niveles, área terreno, **condominio cerrado + amenidades comunes** | JSON + `condominios_master` |
| **Terreno** | frente, fondo, esquina, **uso de suelo**, topografía, servicios, demolible | JSON + columnas (sin catálogo) |
| **Depto** | piso, **amenidades del edificio**, expensas, parqueo, baulera | JSON + `proyectos_master` |

Por operación:

| Operación | Lo que importa | Dónde |
|---|---|---|
| **Venta** | precio (TC paralelo), plan de pagos, preventa | adaptador precio-venta |
| **Alquiler** | precio/mes Bs, **depósito, mascotas, amoblado, servicios incluidos, contrato mínimo** | adaptador precio-alquiler + columnas/JSON |
| **Anticrético** | monto, plazo, devolución | adaptador precio-anticrético + JSON |

El JSON flexible permite 20 campos de casa y 15 de terreno **sin** una tabla de 200 columnas ni una
tabla por tipo. (Ya funciona así: una casa guarda `es_cerrado`/`condominio`/`estacionamientos`; un
depto guarda `amenities`/`piso`/`expensas` — misma tabla, datos distintos.)

---

## 8. Deptos: ya tienen el traje, y ya cubre ZN

El modelo de información de deptos (venta + alquiler) fue diseñado para Equipetrol, pero su riqueza
ya se replicó a Zona Norte. Verificado (21-jun-2026, `v_mercado_venta` por `zona_general`):

| Campo valioso | Equipetrol | Zona Norte |
|---|---|---|
| Contacto del captador | 100% | **100%** |
| Amenidades | 100% | **100%** |
| Fotos | 100% | **100%** |
| Descripción | 100% | **100%** |
| Matching a edificio | 99% | **87%** |

**El traje de deptos es sólido y ZN ya lo tiene** (100% en todo lo valioso). La única diferencia
—matching de edificio 99% vs 87%— es el **catálogo `proyectos_master`**, que se cura por zona
(Equipetrol: años; ZN: ya al 87%). Regla general: *el discovery escala solo por GPS; el modelo/traje
se hereda; el catálogo de edificios se cura por zona.*

⚠️ **Matiz:** el discovery de deptos escala por GPS, pero el diseño asumía Equipetrol. Extender a una
zona nueva = clonar discovery (barato) **+ curar el catálogo de edificios** (laborioso, como fue ZN).
No es una plataforma multi-zona "lista"; es un modelo sólido extensible con trabajo de curación.

---

## 9. La pieza difícil de migrar deptos: el matching de edificios

Para deptos, la **especificidad** está resuelta; lo que falta **construir en el híbrido** es la
**implementación del matching de edificios** (`proyectos_master`). Las casas usan matching **areal**
a condominios (point-in-polígono + nombre, simple); los deptos necesitan el matching **fuzzy de
edificios** (nombre + GPS exacto), que es la parte más compleja del n8n actual. Portarla es el
trabajo técnico pesado de la migración de deptos. (Ojo con el bug histórico del loop K1: el matching
de edificios NO debe pisar `nombre_edificio`.)

> **⚠️ CORRECCIÓN (2-jul-2026, tras investigar el matching real):** esta sección SOBRESTIMÓ la
> dificultad. El matching de edificios **NO es JS pesado a reescribir — es 100% SQL reusable.**
> n8n solo ejecuta `SELECT * FROM matching_completo_automatizado();` (`modulo_2/matching_nocturno.json`);
> todo el fuzzy (nombre/URL/trigram/GPS) + scoring + auto-aprobación ≥85 vive en `sql/functions/matching/`.
> El híbrido **reusa el motor tal cual** (un `.mjs` corre el mismo query). Única trampa: NO usar
> `aplicar_matches_aprobados()` (bug loop K1) — aplicar con UPDATE directo estilo mig 259, sin pisar
> `nombre_edificio`. Además, con el LECTOR en la ingesta el match se **confirma al leer el anuncio**
> (nombre-primario, GPS solo desempata → robusto a GPS mal puesto por el broker). El trabajo neto de
> deptos resultó MUCHO menor: el extractor ya está construido, el matching se reusa. Ver
> `scripts/deptos-equipetrol/ESTADO_MIGRACION.md` y memoria `project_deptos_equipetrol_al_hibrido`.

---

## 10. Estrategia de migración (strangler) y orden de construcción

**Principio:** n8n se congela (nada nuevo nace ahí); el híbrido crece con lo nuevo; deptos —producto
vivo— se migra **al final, en paralelo, con validación antes de cortar**.

```
BLOQUE 1 — Validar la plataforma con lo NUEVO (bajo riesgo)
  - Casas (✅ hecho) + feed /ventas/casas (✅ en prod, mergeado, dark launch/noindex) + cron /cron-casas (verificador modelo deptos, ADR-015)
  - Terrenos: afinar adaptador + feed
  → con esto la plataforma genérica queda probada end-to-end

BLOQUE 2 — Afinar la dimensión OPERACIÓN
  - Alquiler + anticrético para casas/terrenos (mismo esqueleto, distinto precio)

BLOQUE 3 — Deptos al híbrido (el último, con red)
  - Portar extracción de deptos (especificidad ya resuelta) + matching de edificios
  - Correr en PARALELO a n8n  →  ⚠️ **el gate NO es "producir lo mismo que n8n"**: esa comparación
    shadow-vs-prod está **DEPRECADA** (conviven dos regímenes de TC + prod está parcheado). El gate real
    es **validar contra el ANUNCIO** (ver `ESTADO_MIGRACION.md`)
  - Recién ahí cortar n8n  →  n8n retirado
```

Construís y validás con lo nuevo (casas/terrenos, bajo riesgo); cuando la plataforma es robusta,
traés deptos —el adaptador con la especificidad ya resuelta— como el movimiento final que apaga n8n.

---

## 11. El cron: orquestación + modelo del MOAT (decisión 25-jun-2026)

> Esta sección reemplaza la idea original ("routine de Claude Code `/schedule`, MOAT sin API").
> Se probó empíricamente y NO es viable; abajo el porqué y el plan real.

### 11.1 Lo que se descartó: `/schedule` (routine remota en la nube de Anthropic)

Se creó una routine de test (`run_once`, 25-jun). **Disparó bien (el mecanismo funciona)**, pero el
**entorno remoto NO puede correr este cron**:
- ❌ **Red saliente bloqueada** a los portales (remax.bo → HTTP 000, `CONNECT tunnel failed`, proxy 403).
  Es el bloqueante de fondo: el sandbox solo permite destinos en allowlist (GitHub, npm, APIs de
  Anthropic), no sitios externos arbitrarios. **No se arregla con config simple.**
- ❌ Sin `.env.local` (el `SUPABASE_SERVICE_ROLE_KEY` está gitignored, no se clona).
- ❌ Sin `node_modules` (deps gitignored).
- ⚠️ Clona `main` (el script vivía en la branch).
- ⚠️ Cron recurrente mínimo = 1 hora (no "cada 2 min").

**Aclaración importante:** el modelo SÍ corrió bajo la cuenta (no es tema de API vs suscripción); lo que
bloquea es la **red del sandbox**. Por eso la nube no sirve para un cron que scrapea portales externos.

### 11.2 Lo que se eligió: n8n como disparador fino + scripts versionados

Corre en el **server de n8n existente** (always-on, con red a los portales, donde ya vive el pipeline de
deptos). Esto **NO contradice la visión de retirar n8n**: el doc (§10.2) dice *"Lógica → script Node
versionado; Orquestación → n8n (1 nodo) o cron"*. n8n acá es **solo el trigger**; la lógica vive en los
`.mjs` portables → el orquestador es **swappeable** (n8n hoy → cron de un box / Claude Code mañana) sin
reescribir nada. Cero lock-in.

```
n8n Schedule (nocturno)
 → Execute Command: node cron-casas-zn.mjs            (discovery → diff → detalle)   [HECHO]
 → Execute Command: node moat-casas.mjs               (MOAT vía LLM API → moat-output.json)  [FALTA]
 → Execute Command: node cargar-casas-nuevas.mjs --apply                              [HECHO]
 → Execute Command: node verificador-casas.mjs --apply                                [HECHO]
 → Slack (reusa el webhook existente)
```
**Setup una vez en el server:** mergear la branch → `git pull` → `npm install` (en
`scripts/casas-zn/`) → agregar la key del proveedor LLM y
`MOAT_MODEL` al `.env` → armar el workflow de 5 nodos.

### 11.3 El MOAT: modelo por API, **agnóstico y swappeable**

En n8n no hay "agente Claude que lee"; el MOAT (leer descripción → amenidades/precio_billete/TC +
**gate** anticrético/alquiler/depto) va por **API de un LLM**. `moat-casas.mjs` debe ser
**model-agnóstico vía OpenRouter** (modelo = env var `MOAT_MODEL`) → cambiar de modelo = 1 línea.

**Modelo por VOLUMEN** (no uno solo para todo):
- Alto volumen (deptos) → modelo barato (ya usan Haiku hoy).
- Bajo volumen (casas/terrenos) → modelo fuerte.

**Candidatos (precios ~jun-2026, por millón de tokens — verificar vigentes):**

| Modelo | Lab | Input | Output | Notas |
|---|---|---|---|---|
| **GLM-5.2** | Z.ai (Zhipu) | ~$1.4 | ~$4.4 | 1M contexto, **MIT open-weight**, fuerte. Candidato principal. ~2-3× más barato que Sonnet. |
| GLM-4.7-FlashX | Z.ai | ~$0.07 | ~$0.4 | ~40× más barato (casi gratis). **Riesgo de calidad en el gate** (modelo chico). Solo si pasa la validación. |
| Claude Sonnet 4.x | Anthropic | ~$3 | ~$15 | Default probado por el diseño (Haiku falló el gate). |
| DeepSeek-V3 / Qwen | DeepSeek / Alibaba | barato | barato | Alternativas a evaluar. |

**Costo (escala con avisos NUEVOS/noche, NO con el tamaño de la base):**
- Por casa ≈ 2.5k input + 0.4k output. GLM-5.2 ≈ **0.5¢/casa**; FlashX ≈ **0.03¢/casa**; Sonnet ≈ **1.4¢/casa**.
- ZN (~10 nuevas/noche): GLM-5.2 ~$1.5/mes · Sonnet ~$4/mes.
- Matriz completa (~150 nuevas/noche): GLM-5.2 ~$22/mes · FlashX ~$1.5/mes · Sonnet ~$20-40/mes.
- **A esta escala la API NO es un costo relevante.** El "sin API" de Claude Code era un lujo, no un requisito.

### 11.4 Protocolo de validación del modelo (OBLIGATORIO antes de confiarle el feed)

"Bueno en benchmarks" ≠ "confiable en el gate". El gate (rechazar anticrético/alquiler/depto + TC
"7"=oficial / "9"=paralelo / "TCP"=paralelo, en español boliviano) es lo difícil — un modelo que se
equivoca ahí mete basura al feed.

- **Gold standard:** `scripts/casas-zn/output/moat-output.json` (16 casas MOAT-eadas a mano,
  **7 rechazos** correctos + casos de TC). Es la verdad contra la que comparar.
- **Protocolo:** correr cada candidato (FlashX → GLM-5.2 → Sonnet) sobre esas 16 y verificar que
  (a) rechaza las 7, (b) acierta el TC. **Quedarse con el más barato que pase el gate al 100%.**
- **Default seguro** si no se valida: GLM-5.2 (o Sonnet).

### 11.5 Escape a self-host (futuro, si el volumen explota)

GLM-5.2 es **open-weight (MIT)**: si algún día la matriz completa genera cientos de $/mes de API, se
puede **self-hostear** (true $0, sin sandbox, sin proxy) en un box con GPU. Da las dos opciones: API
barata hoy, self-host mañana.

---

## 12. Riesgos honestos + mitigación

| Riesgo | Mitigación |
|---|---|
| **Ejecución del cron** (la nube `/schedule` bloquea la red a los portales — ver §11.1) | Correr en el server de n8n existente (always-on + red), n8n como trigger fino de los `.mjs` versionados. Orquestador swappeable, sin lock-in (§11.2). |
| **Costo del MOAT por API** | Escala con avisos nuevos/noche, no con la base; ~$1.5-40/mes según volumen/modelo (§11.3). Modelo swappeable vía OpenRouter; GLM-5.2 open-weight permite self-host si explota (§11.5). |
| **Robustez** (n8n es infra dedicada; el híbrido es scripts+agente) | El híbrido es código versionado/testeable, lo que compensa. Por eso deptos (producción) se migra al final. |
| **Dos paradigmas durante la transición** | Frontera nítida y estable (deptos vs no-deptos) mientras dura; el contrato común los hace convivir sin fricción; n8n tiene fecha de defunción (Bloque 3), no es permanente. |
| **Migrar deptos rompe el producto vivo** | Correr en paralelo + validar contra n8n (mismas columnas/conteos) antes de cortar. Nunca un corte ciego. |
| **Bloqueo de IP al crawlear** (pasó 26-jun: C21 dropeó la IP de casa tras apilar cron+sondeos+tests) | **El lever real es VOLUMEN + RITMO, no el IP.** El IP del server NO es inmune (un datacenter hasta es *más* detectable que uno residencial); deptos no se bloquea por correr **pausado, 1 vez/noche, repartido**, no por la IP. Mitigaciones, en orden: (1) los scripts ya se **autoprotegen** — `fetcher.mjs` tiene cooldown anti-stacking, circuit breaker (corta si 5 fallos seguidos), jitter y backoff; (2) **crawlear desde el server** (no desde tu laptop) **aísla** el riesgo de tu conexión y corre pausado; (3) throttle más agresivo / repartir en más horas si hace falta; (4) **proxies pagos** (Firecrawl/ScraperAPI) **solo** a escala muy grande donde un IP pausado no alcanza (lejos hoy). **El discovery NO necesita Firecrawl** — son endpoints JSON baratos (C21 `?json=true`, Remax `/api/search`, BI `procesos.php`), fetch directo $0. Ver `docs/proyectos/zona-norte/operacion.md` (anti-bloqueo). |

---

## 13. Qué se reúsa de lo ya hecho (no se construye de cero)

Piezas genéricas ya existentes en `scripts/sonda-suelo/`, `scripts/casas-zn/` y `scripts/auditoria-cola-matching/`:

- `enZona(polígono)` → adaptador de **zona** ✅
- `c21Listado` / `remaxListadoSC` → discovery, parametrizable por sección (tipo) ✅
- `fetch-contacto-escala.mjs` / `nuevas-paso2-detalle.mjs` → fetch detalle (contacto/físicos) ✅
- `backfill-campos-casas.mjs` → `extraerCampos()` (fotos/descripción/fecha/código), reusable ✅
- `matchear_condominio()` (SQL) → adaptador de matching de **casas** ✅
- `precio_normalizado()` (SQL) → adaptador de precio de **venta** ✅
- `sonda-suelo/discovery-dedup.mjs` (dedup) + `casas-zn/verificador-casas.mjs` (verificador) ✅

Lo que falta es **organizarlas** detrás de una interfaz `pipeline({tipo, operación, zona})` y escribir
los adaptadores que faltan (matching de edificios para deptos, normalización de alquiler/anticrético,
extractor de terrenos).

---

## 14. Punto de partida (21-jun-2026)

- ✅ Casas ZN venta: producidas por el híbrido (305 cargadas, contrato completo, vista `v_mercado_casas`).
- ✅ Deptos (venta+alquiler) Equipetrol + ZN: en n8n, traje completo, en las vistas.
- ❌ Feed deptos ZN: capturado pero filtrado en el frontend (`mercado-data.ts` → `ZONAS_EQUIPETROL_DB`).
- 🟡 Feed casas ZN (`/ventas/casas`): **en prod** (mergeado, dark launch/noindex) + cron `/cron-casas` (`scripts/casas-zn/`, verificador modelo deptos — ADR-015); pendiente validar unos días → og:image → público.
- ❌ Terrenos, anticrético, otras zonas: no empezados.

**Primer movimiento de mayor ROI / menor riesgo:** destapar el feed de **deptos ZN** (ya capturado,
solo es frontend) — producto nuevo sin tocar pipeline.

---

## 15. Mapa del cutover — estado 10-jul-2026 (rama `feat/deptos-hibrido-shadow`)

> Consolidado del due-diligence de cutover. **Deptos-VENTA es la punta de lanza**: acá se resuelve el
> proceso completo; después escala a alquiler/terrenos reusando el esqueleto. Memorias:
> `project_checkpoint_deptos_hibrido`, `project_discovery_c21_grid_bottleneck`,
> `project_multiproyectos_proyectos_detectados`, `project_bug_bob_moneda_usd_cutover`.

### 15.1 Estado real por pipeline (estrangular n8n = migrar los 4, no solo venta)
| Pipeline | Estado del híbrido |
|---|---|
| Deptos **venta** | 🟡 en curso — comando `/cron-deptos` (discovery propio + reader 12+ campos + apply resiliente + incremento 2 "empalme de nuevas" + tabla `proyectos_detectados` para multiproyectos). Reader **maduro** (test ciego de 50). |
| Deptos **alquiler** | ✅ **CON híbrido (cerrado en shadow, 19-jul)** — reader propio `READER_SPEC_ALQUILER.md`, `discovery-alquiler.mjs`, `cargar-alquiler-shadow.mjs`, skill `/cron-deptos-alquiler`; ~216 props en shadow. Precio `precio_mensual_bob` (Bs crudo+tag), `uso_inmueble`, depósito/mascotas/servicios/expensas. Funciones `_alquiler` (Regla 6: nunca tocar venta). |
| **Casas ZN** | ✅ híbrido (`/cron-casas`) |
| **Terrenos** / anticrético | ⚫ no empezados |

### 15.2 El cuello de botella descubierto (walking skeleton)
**No es el reader (impecable) — es el discovery C21.** El grid topaba a 100 props/cuadrante → perdía ~44%
del inventario C21 (veía 249 vs 444 de n8n). Fix: `STEP 0.005` (commit ce1e2fe). **Pendiente: correr el
discovery completo 0.005 con IP fresca** para validar el conteo total. Detalle + patrón anti-bloqueo en
`project_discovery_c21_grid_bottleneck`.

### 15.3 Consumidores de la data — quién se rompe al apagar n8n
Verificado leyendo el código. Todo el crudo se guarda (nada de data cruda se pierde).
| Consumidor | Lee | ¿Se rompe? |
|---|---|---|
| Feed `/ventas`, chat alquileres (front), broker shortlists | RPC (`buscar_unidades_simple`) | ❌ No |
| Admin editor | `datos_json` primero, `datos_json_enrichment` de fallback | ❌ No (degrada gracioso) |
| **Bot ventas (kapso, `lab-kapso/src/sici.js`)** | vista `v_mercado_venta` (`precio_norm`, `dias_en_mercado`…) | ❌ No — protegido por la frontera. ⚠️ revisar **copys "6.96"** en kapso |
| **Estudios de mercado** (`estudio-mercado/src/db.ts`) | `propiedades_v2` directo + normaliza en **JS** + lee `datos_json_enrichment` | 🟡 **paquete TC** + ajustar path enrichment→`datos_json` |
| **Snapshots absorción** (`sql/functions/snapshots`) | `precio_normalizado()` SQL | 🟡 absorción/inventario intacto; $/m² → **versionar (v4)** + tags nuevos |
| Skills de auditoría (venta/alquiler/casas/cola) | `datos_json_enrichment` | 🟢 herramientas — ajustar al usarlas |
| Merge / enrichment / matching de n8n | `datos_json_enrichment` | — se **apagan** (el híbrido matchea con `matcher.mjs`) |

### 15.4 El "paquete TC" — toca 4 lugares (va JUNTO a prod, al unificarse el oficial)
La normalización con tags nuevos (`bob`/`oficial_viejo`/default) hay que aplicarla a la vez en:
`precio_normalizado()` SQL · las **vistas** (`v_mercado_venta`) · la normalización **JS de estudios** · los
**snapshots**. Antes no rompe la comparación shadow-vs-prod. El fallback C21-BOB por $/m² ya resuelto
(`project_bug_bob_moneda_usd_cutover`).

### 15.5 Riesgo al re-escribir existentes (mismo id — id resuelto: lo da la secuencia de `propiedades_v2`)
- 🔴 **Candados** (`campos_bloqueados`): NO respetar ciego (la mayoría son parches sobre errores de n8n; el
  híbrido lee bien de origen → ~61% sobran). **Auditoría**: soltar donde el híbrido coincide, mantener el
  conocimiento puro (paralelo sin señal), revisar el resto. Conservador ante la duda.
- 🔴 **No empobrecer**: preservar campos que n8n llena y el híbrido no toca (no pisar con null).
- 🟡 **Corte limpio**: apagar n8n-deptos ANTES de que el híbrido escriba prod (no dos escritores).
- Comparación híbrido-vs-prod (10-jul): el híbrido MEJORA (piso 0→39, baulera, equipamiento, flags,
  parqueo aparte) y deja de INVENTAR (estado 88→38, baños 88→73 = null honesto en vez de default falso).

### 15.6 Snapshots / absorción — no se pierde historia
Absorción/inventario/DOM **no dependen del TC** → serie continua. $/m² sí → `filter_version` v4 (TC nuevo),
v3 congelada como histórico del régimen viejo, marcar el quiebre. Hacia adelante: que los snapshots guarden
crudo+tag (aplicar la frontera también acá) para que un futuro cambio de TC sea recalculable.

### 15.7 Orden de pendientes (cuando se retome) — ⚠️ DESACTUALIZADA: los ítems 1 y 2 ya están HECHOS
1. ~~Discovery C21 completo a 0.005 (IP fresca) — validar conteo.~~ ✅ **hecho** (fix del grid 0.005).
2. ~~Auditoría de candados (cero-fetch, sobre shadow vs prod).~~ ✅ **hecho** — y la comparación
   shadow-vs-prod como gate quedó **DEPRECADA** (ver `ESTADO_MIGRACION.md`).
3. Reader de **alquiler** (pipeline propio — el próximo gran paso).
4. Paquete TC (4 lugares) — al unificarse el oficial.
5. Badge "Entrega inmediata" del front + copys "6.96" del bot kapso.
6. id definitivo (secuencia en prod) · verificador integrado (incremento 3).

---

## Resumen en una frase

El contrato es `propiedades_v2` + vistas; n8n se congela y se estrangula; todo nace en una plataforma
híbrida genérica donde cada tipo/operación **afina su especificidad dentro de un proceso común**; y
deptos entra **al final, con ventaja** (su traje ya está diseñado) como el movimiento que apaga n8n.
