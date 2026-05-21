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
