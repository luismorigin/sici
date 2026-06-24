# Plataforma Híbrida Genérica — Visión de arquitectura del pipeline

> Estado: **VISIÓN / DISEÑO** (no implementado salvo lo indicado). Fecha: 2026-06-21. Autor: Lucho + Claude.
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

---

## 10. Estrategia de migración (strangler) y orden de construcción

**Principio:** n8n se congela (nada nuevo nace ahí); el híbrido crece con lo nuevo; deptos —producto
vivo— se migra **al final, en paralelo, con validación antes de cortar**.

```
BLOQUE 1 — Validar la plataforma con lo NUEVO (bajo riesgo)
  - Casas (✅ hecho) + feed /ventas/casas (✅ construido — dark launch, branch sin merge)
  - Terrenos: afinar adaptador + feed
  → con esto la plataforma genérica queda probada end-to-end

BLOQUE 2 — Afinar la dimensión OPERACIÓN
  - Alquiler + anticrético para casas/terrenos (mismo esqueleto, distinto precio)

BLOQUE 3 — Deptos al híbrido (el último, con red)
  - Portar extracción de deptos (especificidad ya resuelta) + matching de edificios
  - Correr en PARALELO a n8n; validar que produce lo mismo (mismas columnas, mismos conteos)
  - Recién ahí cortar n8n  →  n8n retirado
```

Construís y validás con lo nuevo (casas/terrenos, bajo riesgo); cuando la plataforma es robusta,
traés deptos —el adaptador con la especificidad ya resuelta— como el movimiento final que apaga n8n.

---

## 11. El cron: una routine de Claude Code (MOAT sin API)

El único paso con costo del híbrido es el **MOAT** (LLM sobre la descripción). Una **routine de
Claude Code** (`/schedule`) corre bajo la suscripción Max, **sin API facturada aparte**. Una sola
routine corre TODO el flujo lineal (no hace falta separar por horas como n8n, que separa por
dependencias entre workflows). Los pasos deterministas (discovery/fetch/carga) son $0.

---

## 12. Riesgos honestos + mitigación

| Riesgo | Mitigación |
|---|---|
| **Routines a escala** (límites de la suscripción Max) | Pasos deterministas (discovery/fetch/carga, $0) pueden correr en infra propia barata; reservar el agente solo para el MOAT. Para cientos de props/noche entra bien. |
| **Robustez** (n8n es infra dedicada; el híbrido es scripts+agente) | El híbrido es código versionado/testeable, lo que compensa. Por eso deptos (producción) se migra al final. |
| **Dos paradigmas durante la transición** | Frontera nítida y estable (deptos vs no-deptos) mientras dura; el contrato común los hace convivir sin fricción; n8n tiene fecha de defunción (Bloque 3), no es permanente. |
| **Migrar deptos rompe el producto vivo** | Correr en paralelo + validar contra n8n (mismas columnas/conteos) antes de cortar. Nunca un corte ciego. |

---

## 13. Qué se reúsa de lo ya hecho (no se construye de cero)

Piezas genéricas ya existentes en `scripts/sonda-suelo/` y `scripts/auditoria-cola-matching/`:

- `enZona(polígono)` → adaptador de **zona** ✅
- `c21Listado` / `remaxListadoSC` → discovery, parametrizable por sección (tipo) ✅
- `fetch-contacto-escala.mjs` / `nuevas-paso2-detalle.mjs` → fetch detalle (contacto/físicos) ✅
- `backfill-campos-casas.mjs` → `extraerCampos()` (fotos/descripción/fecha/código), reusable ✅
- `matchear_condominio()` (SQL) → adaptador de matching de **casas** ✅
- `precio_normalizado()` (SQL) → adaptador de precio de **venta** ✅
- `sonda-suelo/discovery-dedup.mjs` (dedup) + `auditoria-cola-matching/verificador-casas.mjs` (verificador) ✅

Lo que falta es **organizarlas** detrás de una interfaz `pipeline({tipo, operación, zona})` y escribir
los adaptadores que faltan (matching de edificios para deptos, normalización de alquiler/anticrético,
extractor de terrenos).

---

## 14. Punto de partida (21-jun-2026)

- ✅ Casas ZN venta: producidas por el híbrido (305 cargadas, contrato completo, vista `v_mercado_casas`).
- ✅ Deptos (venta+alquiler) Equipetrol + ZN: en n8n, traje completo, en las vistas.
- ❌ Feed deptos ZN: capturado pero filtrado en el frontend (`mercado-data.ts` → `ZONAS_EQUIPETROL_DB`).
- 🟡 Feed casas ZN (`/ventas/casas`): **construido** (dark launch, branch `feat/feed-casas-zn`, sin merge/deploy); pendiente merge + cron.
- ❌ Terrenos, anticrético, otras zonas: no empezados.

**Primer movimiento de mayor ROI / menor riesgo:** destapar el feed de **deptos ZN** (ya capturado,
solo es frontend) — producto nuevo sin tocar pipeline.

---

## Resumen en una frase

El contrato es `propiedades_v2` + vistas; n8n se congela y se estrangula; todo nace en una plataforma
híbrida genérica donde cada tipo/operación **afina su especificidad dentro de un proceso común**; y
deptos entra **al final, con ventaja** (su traje ya está diseñado) como el movimiento que apaga n8n.
