# Decisiones de arquitectura — Zona Norte

Formato ADR (Architecture Decision Record): contexto → opciones → decisión → consecuencias. Las decisiones se numeran y no se borran; si una se revierte, se marca como *Superada por ADR-XXX*.

---

## ADR-001 — Scope MVP: solo discovery (venta + alquiler)

**Contexto:** El primer planteo mezclaba discovery, frontend, posicionamiento, branding y comunicación a clientes en un PRD de 9 fases. Lucho lo cortó: es un MVP para validar el motor, no un lanzamiento de producto.

**Decisión:** El MVP se limita a **capturar departamentos (venta + alquiler) de Zona Norte y pasarlos por el pipeline real** (enrichment → merge → verificador). Posicionamiento, landing, rutas públicas y comunicación a clientes quedan **fuera** y se deciden después.

**Consecuencias:** Mucho menos scope, foco en la pregunta de fondo (¿el motor escala y produce data de calidad?). El brand "cosido" en landing/ventas/alquileres deja de ser un bloqueo.

---

## ADR-002 — Zona piloto: Zona Norte (Av. Banzer)

**Contexto:** Opciones eran 1 zona piloto vs varias vs todo SC vs multi-departamento. Lucho eligió 1 zona piloto. Candidatas: Urubó, Las Palmas, Zona Norte, Centro.

**Decisión:** **Zona Norte (Av. Banzer)** — eje consolidado con mucho departamento, ticket medio, buen volumen en portales.

**Consecuencias:** Validado por el PoC: ~595 props en la zona. Polígono de prueba inicial dibujado por Lucho (amplio, "toda una zona grande").

---

## ADR-003 — Sin matching con `proyectos_master` día 1

**Contexto:** `proyectos_master` está poblado para Equipetrol; no hay proyectos cargados en Zona Norte. Replicar ese nivel de matching toma meses.

**Decisión:** Las props de Zona Norte arrancan con `id_proyecto_master = NULL`. Sin matching automático. Cargar proyectos es una fase posterior si el piloto valida.

**Consecuencias:** El LLM de enrichment opera con `{lista_proyectos_zona}` vacía → "confianza media" (confirmado que no rompe). El matching GPS está blindado por `p.zona = pm.zona`, así que no cross-matchea. **Pero** el matching por nombre NO filtra zona → ver ADR-006.

---

## ADR-004 — Discovery por GPS (fetch amplio + filtro por polígono), no por slug/nombre

**Contexto:** La preocupación central de Lucho era la escalabilidad: si cada zona nueva obliga a "combinaciones más allá del GPS" por portal, el sistema no escala. Hoy los workflows están atados a Equipetrol de 3 formas distintas: C21 por grid bbox, Remax por slug (`equipetrolnoroeste`), BI por nombre de barrio (`barrio='equipetrol'`).

**Spike (evidencia empírica, 20 May):** Los **3 portales devuelven lat/lon en cada listing al 100%**. Remax incluso devuelve GPS en el endpoint base de SC (sin slug) → no estás atado a su taxonomía. (Detalle: un slug Remax inválido devuelve todo SC en silencio — trampa que se evita usando GPS.)

**Decisión:** Patrón único **"fetch amplio + filtrar por polígono GPS"**, con `zonas_geograficas` como fuente de verdad geográfica. C21 mantiene bbox (generando el grid desde el bounding box de los polígonos activos); Remax y BI traen todo SC y se filtran por `ST_Contains`. Los slugs/nombres quedan como legacy opcional.

**Consecuencias:** Agregar zona #N = dibujar 1 polígono. Cero trabajo manual por portal. Costo de "traer de más" es trivial (el filtro corre antes del enrichment caro).

---

## ADR-005 — Dark launch en producción real, no entorno paralelo

**Contexto:** Lucho propuso un entorno stand-alone para "no contaminar producción". Pregunta: ¿qué haría un dev senior?

**Decisión:** **NO clonar producción.** Hacer **dark launch en prod real**: las props entran a `propiedades_v2` con su zona y fluyen por el pipeline real, pero el frontend sigue filtrando Equipetrol → nadie las ve. Validar con data real.

**Razones:**
- El sistema ya es multi-zona (Equipetrol son 6 zonas); una séptima no es exótica.
- Un entorno aislado **miente**: no muestra cómo se comporta el pipeline con data real de Zona Norte.
- Casi todo es reversible (`DELETE WHERE zona='Zona Norte'`, sacar polígono, revertir blindajes).
- Clonar el pipeline para un dev solo es deuda de mantenimiento sin beneficio real.

**Consecuencias:** Disciplina obligatoria: (1) blindar antes de meter datos, (2) empezar por venta sola, (3) kill-switch escrito antes de empezar. El riesgo real no es "contaminar" sino "¿la data sale de calidad?", que solo se responde con data real.

---

## ADR-006 — Blindar los 2 puntos de contaminación

**Contexto:** Una vez que una prop entra a `propiedades_v2`, todo el enjambre la procesa sin filtro de zona. Análisis del pipeline encontró que **solo 2 puntos contaminan** Equipetrol:

1. **Matching por nombre** (`generar_matches_por_nombre.sql:48`): matchea por nombre exacto sin filtrar zona → un edificio de Zona Norte con nombre igual a uno de Equipetrol = falso positivo.
2. **Snapshot de absorción global** (`snapshot_absorcion_mercado.sql:86+`): el loop `zona='global'` agrega todo `zona IS NOT NULL` → Zona Norte se mezcla en las métricas globales de Equipetrol.

(El matching GPS, en cambio, está blindado: requiere `p.zona = pm.zona` + 250m.)

**Decisión:** Antes de meter un solo dato, aplicar 2 blindajes:
1. Agregar `AND p.zona = pm.zona` al matching por nombre. **Bonus:** arregla un bug latente para todas las zonas.
2. Excluir Zona Norte del loop global del snapshot (o darle serie separada) hasta decidir.

**Consecuencias:** Enrichment, merge, verificador, matching GPS y snapshot por-zona procesan Zona Norte sin ensuciar nada. Cambios quirúrgicos, reversibles.

---

## ADR-007 — Carpeta de contexto en main, sin rama-proyecto de larga vida

**Contexto:** Lucho planteó una "rama protegida con todo el contexto". Análisis: una rama-proyecto de vida larga, para un dev solo y con dark launch, diverge de main y duele al mergear; además el SQL toca la BD igual, esté en la rama o no.

**Decisión:** El proyecto se organiza con esta **carpeta en main** (`docs/proyectos/zona-norte/`), versionada y visible. **No** se crea una rama-paraguas. Las ramas serán **cortas y descartables**, solo para cambios que puedan romper el pipeline nocturno (los workflows de discovery), y se mergean apenas estén probadas.

**Consecuencias:** La doc y los 2 blindajes (mejoras seguras) van a main directo. Branch protection formal de GitHub queda opcional (es un dev solo); lo que importa es la disciplina de commits atómicos.

---

## ADR-008 — Microzonas: arrancar con 1 polígono, subdividir después

**Contexto:** ¿Subdividir Zona Norte en microzonas más finas será un problema después? Verificación del trigger (`trigger_asignar_zona_venta.sql:47-59`): toma el **nombre del polígono** que contiene el punto y lo copia a `zona` Y `microzona` con el mismo valor. No hay jerarquía real activa, aunque `zonas_geograficas` tiene un campo `zona_general` preparado.

**Decisión:** Arrancar con **un polígono macro**. Subdividir es una decisión futura sin costo de migración pesado (el GPS guardado permite re-asignar cuando quieras). Dos caminos disponibles al subdividir:
- **Camino A** — polígonos hermanos (como Equipetrol hoy): cada microzona es su propia `zona`.
- **Camino B** — jerarquía real: `zona='Zona Norte'` estable + `microzona` para el detalle. Requiere tocar el trigger para usar `zona_general`.

**Consecuencias / cuidados al subdividir:** (1) las props ya cargadas no se re-asignan solas — hay que correr un re-cálculo una vez (limpiar zona/microzona y re-disparar, o backfill con `get_zona_by_gps()`); (2) los polígonos hijos NO deben solaparse (el trigger toma `LIMIT 1` sin orden).

---

## ADR-009 — Arquitectura multi-macrozona via strangler pattern (no tocar Equipetrol producción)

**Contexto:** Tras validar Fase 3+4 surgió la visión de evolucionar de "Simón Equipetrol" a "Simón Santa Cruz" multi-macrozona, donde Equipetrol y Zona Norte sean las primeras 2 macrozonas tratadas como pares (cada una con sus microzonas), y futuras (Urubó, Polanco, etc.) entren con el mismo patrón.

**Preocupación central de Lucho:** "No quiero tocar Equipetrol producción". El feed `/ventas` actual funciona bien y cualquier refactor implica riesgo de regresión en un producto consolidado.

**Decisión:** **Strangler pattern** — construir la arquitectura multi-macrozona EN PARALELO al sistema Equipetrol actual, sin tocar lo viejo.

**Qué se mantiene intacto:**
- `pages/ventas.tsx` — feed Equipetrol, sin cambios.
- `pages/mercado/equipetrol/*` — rutas existentes, sin cambios.
- `flujo_a_discovery_century21_v1.0.3_FINAL.json` (Equipetrol) — workflow viejo, sin cambios.
- `flujo_a_discovery_remax_v1.0.2_FINAL.json` (Equipetrol) — idem.
- Branding actual ("Simón Equipetrol") en landing, heroes, copy — sin cambios.
- `ZONAS_CANONICAS` del público — sigue con las 6 microzonas Equipetrol solamente.

**Qué se construye nuevo (gradual):**
- `pages/mercado/zona-norte/*` — rutas nuevas, feed nuevo, código nuevo.
- Componente `<FeedMacrozona zona="...">` reusable — pero solo lo consume ZN al principio.
- `flujo_a_discovery_century21_zonanorte_v1.0.0` (ya creado) — **es de hecho el "workflow universal multi-macrozona"**. Su query lee polígonos activos de `zonas_geograficas` con array configurable. Para agregar Urubó: cambiar `ARRAY['Zona Norte']` a `ARRAY['Zona Norte', 'Urubó']` — cero workflow nuevo.
- Idem para `flujo_a_discovery_remax_zonanorte_v1.0.0`.

**Roles de los workflows en la arquitectura final:**
- **Workflow Equipetrol exclusivo** (vieja escuela, hardcoded): solo procesa Equipetrol. Intacto.
- **Workflow multi-macrozona** (zona-agnóstico, lee BD): procesa todas las macrozonas activas EXCEPTO Equipetrol. Crece con cada zona nueva editando el array.

**Coexistencia indefinida:** ambos sistemas pueden coexistir. Eventualmente (post-validación de ZN, 3-6 meses), se evaluará si migrar Equipetrol al patrón multi-macrozona. **NO es decisión para hoy.**

**Cuándo se vuelve problema mantener 2 implementaciones:**
- Si el feed evoluciona mucho mientras coexisten (ej. 5 features nuevos a duplicar).
- En ese momento, se migra Equipetrol. No antes.

**Beneficios:**
- Cero riesgo a Equipetrol producción.
- ZN es laboratorio del patrón multi-macrozona en condiciones reales.
- Futuras macrozonas (Urubó, Polanco) entran con cero refactor del viejo.
- Sin Big Bang.

**Consecuencias para el resto del backlog:**
- "Refactor `ventas.tsx`" pasa a OPCIONAL (no requerido salvo decisión futura).
- "Cargar pm ZN" (#1.5) sigue valiendo igual.
- "Microzonas ZN" pasa a más importante (cada macrozona debería tener sus microzonas).
- "Exposición pública ZN" se vuelve "construir `/mercado/zona-norte`" como prototipo del patrón.
- Branding global ("Simón Santa Cruz" vs "Simón Equipetrol") queda como decisión futura, NO bloqueante.


---

## ADR-010 — Equipetrol y Zona Norte son macrozonas hermanas operativamente

**Fecha:** 29-may-2026 (parte del cierre del ticket #8).

**Contexto:** Al discutir las 14 microzonas Zona Norte, surgió la pregunta de si EQ pasa a ser "subzona de Zona Norte" (porque geográficamente lo es). El director aclaró que en la práctica cotidiana, EQ y ZN son entidades separadas en el habla del mercado, aunque geográficamente una contenga a la otra.

**Decisión:** EQ y ZN son **macrozonas hermanas operativamente**.
- A nivel UI: filtros y URLs separados (`/mercado/equipetrol` y `/mercado/zona-norte`).
- A nivel BD: ambas son grupos planos de microzonas. `zonas_geograficas.zona_general` agrupa (`Equipetrol` y `Zona Norte`) pero NO se usa para asignar `propiedades_v2.zona` (queda latente).
- A nivel discovery, snapshot y matching: cada macrozona tiene su flujo separado, alimentado por el array de sus microzonas.

**Implementación (mig 254):**
- `propiedades_v2.zona` = nombre de microzona específica (modelo PLANO, no jerárquico).
- `microzona` es redundante con `zona` (legado del trigger).
- `zona_general` se usa en el trigger HITL nuevo (`separar_hitl_por_macrozona`) para soportar múltiples macrozonas en piloto sin código condicional.
- Refactor jerárquico real (zona=macrozona + microzona=microzona) queda como deuda técnica futura (ticket #11), NO bloqueante.

**Consecuencias:**
- Cero impacto en EQ producción al cargar las 14 microzonas ZN.
- El día que llegue Urubó, mismo patrón: agregar polígonos con `zona_general='Urubó'`, modificar el trigger HITL para incluir 'Urubó' en piloto (o eliminar el filtro y separar todo no-EQ automáticamente).
- El refactor jerárquico real, si se decide hacer, es un proyecto separado que toca EQ producción y requiere backfill masivo.

**Alternativas descartadas:**
- **Modelo jerárquico real** (EQ.zona='Equipetrol' + microzona='Equipetrol Centro'): tocaría EQ producción, requiere backfill de ~5000 props, modificación de triggers. Excede el scope del ticket #8.
- **Modelo asimétrico** (ZN jerárquico, EQ plano): codebase termina con 2 modelos coexistiendo, deuda permanente.

**Vinculado a:** ADR-008 (Camino A: zonas hermanas), ADR-009 (visión multi-macrozona).

## ADR-011 — Auditar la cola de matching con un agente-lector, en skill separada

**Fecha:** 19-jun-2026.

**Contexto:** la cola HITL multi-macrozona (`matching_sugerencias.estado='pendiente_<macrozona>'`) acumulaba sugerencias del motor que el score/GPS/token NO bastan para aprobar. Auditando ZN se confirmó que aprobar por score (incluso 90-95) mete decenas de falsos positivos (atractores tipo "CONDOMINIO ONE", clusters numerados Macororó/Brickell). La única señal confiable es **leer el anuncio**.

**Decisión:** construir `/audit-cola-matching` como **skill SEPARADA** (no un modo `--cola` dentro de las skills de feed), porque la cola y el feed son problemas opuestos (la cola busca el match correcto de props SIN match; el feed busca FP en props YA matcheadas). Comparten solo el lector (`lib/lector.mjs`) y el pre-filtro (`lib/atractores.mjs`).

**Principio rector (clave):** el `.mjs` es FILTRO, no juez. Hace lo mecánico (trae la cola, fetchea C21 `?json=true`/Remax `data-page`, pre-clasifica por atractor/cluster/sin-nombre) y ORDENA. El **VEREDICTO lo dan subagentes-lectores (juez LLM)** que leen el anuncio — NUNCA el script. Si esto degradara a "el script clasifica y escupe SQL", vuelve el bug del score-como-juez que la skill existe para evitar.

**Implementación:** `scripts/auditoria-cola-matching/` + instalada en `.claude/commands/`. Multi-macrozona (`--macrozona=zona-norte|equipetrol|urubo`; `equipetrol`→`estado='pendiente'`). Genera SQL (UPDATE directo + candado `IS NULL`, NUNCA `aplicar_matches_aprobados`), read-only. Validada en producción 19-jun: cola ZN 33→0, Equipetrol 17→10, 3 pm nuevos.

**Consecuencias:** método replicable a Urubó/Polanco sin código nuevo. El lector (doble fetcher) y el detector de atractores quedan reutilizables por las skills `/audit-feed-*`. Lección transversal validada: el repo n8n ≠ producción, y verificar empíricamente contra la FUENTE correcta (API vs HTML) antes de "arreglar".

**Vinculado a:** ADR-009 (multi-macrozona), ADR-010 (macrozonas hermanas).

## ADR-012 — Paralelo en alquiler vía tag en la vista, NO normalización

**Fecha:** 19-jun-2026.

**Contexto:** algunos alquileres se cotizan en USD billete al paralelo (ej. "$500, pago en Bs al cambio paralelo"). El modelo de alquiler deriva `precio_mensual = bob/6.96` (oficial) fijo, lo que obligaba a elegir entre Bs-real o USD-correcto (no ambos).

**Decisión:** marcar esos alquileres con el tag **`solo_tc_paralelo=true`** (campo booleano que ya existía, limpio en alquiler) y que **la vista** `v_mercado_alquiler` divida por el TC paralelo en ese caso: `precio_mensual = bob / CASE WHEN solo_tc_paralelo THEN <tc_paralelo vivo> ELSE 6.96 END`. **NO es la normalización de venta** (`precio_normalizado()` es solo de venta) ni se toca el merge de alquiler — el cálculo vive solo en la vista.

**Por qué el tag y no `tipo_cambio_detectado`:** ese campo está contaminado en alquiler (241/266 con `'paralelo'` espurio heredado de migraciones de venta). `solo_tc_paralelo` estaba en 0 → backward-compatible (0 props cambian al desplegar la vista; testeado).

**Consecuencias:** Bs real + USD correcto a la vez. Hoy ~1 prop marcada (1970); el tag se setea manual. A futuro el LLM de enrichment de alquiler podría detectarlo. Ver `docs/arquitectura/TIPO_CAMBIO_SICI.md` y memoria `project_bug_mig174_tc_paralelo_n8n_incompleta`.

