# Learnings — Baseline Equipetrol (reporte público trimestral)

> **Última actualización:** 22 abr 2026. Sesión de refactor + reposicionamiento completo.

Decisiones editoriales, metodológicas y de producto tomadas durante el desarrollo del reporte público trimestral. Consultá antes de tocar el reporte: muchas decisiones tienen razones no evidentes en el código.

---

## Público objetivo (decidido 22 abr 2026)

**Desarrolladoras e inversores.** Específicamente NO:
- ❌ Comprador directo: necesita herramienta web (filtros, precio por zona/dorms), no un PDF de 17k píxeles
- ❌ Broker: necesita datasheet 1-pager mensual, no análisis editorial largo
- ❌ Periodista: puede citarlo pero no es el público primario

**Razones del pivot desde "público general"**:
- Un reporte único no puede servir a 3 públicos distintos (lenguaje, profundidad y formato cambian)
- El dev/inversor sofisticado es quien SÍ lee 20 minutos + respeta rigor metodológico + entiende caveats
- Para comprador/broker se pueden crear derivados desde la misma data (ver "Pendientes")

## Decisiones editoriales

### Hallazgos primero, metodología al final
La metodología vive como **Apéndice al final**, no al inicio. Patrón WSJ/Economist: el lector que ya formó opinión con los hallazgos respeta la metodología como garantía; el lector que nunca terminó de leer la metodología al principio, nunca llegaba a los hallazgos.

### Voz pragmática, no académica
El dev boliviano es pragmático. "La variabilidad intrazonal es mayor que la interzonal" → no funciona. "Dos departamentos iguales en la misma zona pueden costar $70,000 de diferencia" → sí funciona. Cada tesis termina con una consecuencia operativa clara ("el comparable útil es edificio-a-edificio, no zona-a-zona").

### Titulares punzantes
Los 3 hallazgos son titulares completos, no "Tesis 1 — ...". Ejemplos actuales:
1. "Los departamentos chicos se renuevan al doble de velocidad que los grandes."
2. "Si buscás preventa en Equipetrol hoy, casi toda la oferta está en una zona: Sirari."
3. "Dos departamentos iguales en la misma zona pueden costar USD 70,000 de diferencia."

### Aviso honesto upfront
§1 abre con tarjeta "Cómo leer este reporte" declarando que los datos son **portal-observable**, no mercado real. Estilo WSJ/FT: transparencia antes de presentar hallazgos. Esto justifica el funnel al producto pago (estudios privados incluyen data off-portal).

## Decisiones metodológicas

### Corpus = vidriera pública, no mercado real
El reporte describe lo que está en Century21 + Remax. **No describe**:
- Inventario off-portal (relaciones directas desarrolladora-comprador)
- Publicación parcial estratégica (Rhodium tiene 17 en portal, puede tener 60 reales)
- Velocidad real de venta (la antigüedad del listado mide re-publicaciones, no cierres)

### Filtros de antigüedad (paridad feed público)
- Venta entrega_inmediata / nuevo_a_estrenar / no_especificado: ≤300 días
- Venta preventa: ≤730 días
- Alquiler: ≤150 días

Los listings fuera del filtro ("inventario estancado") se cuentan para contexto pero no entran en agregados.

### Tesis que sobreviven al sesgo portal-only
- ✅ **T1 Antigüedad dual por tipología**: el patrón de publicación SÍ se ve incluso si hay sesgo; los brokers republican 1D más seguido porque el producto efectivamente rota
- ⚠️ **T2 Sirari preventa**: dirección robusta, magnitud puede estar subreportada
- ✅ **T3 Dispersión P25-P75**: data real de los listings publicados, defendible

### Tesis descartadas (con razón)
- ❌ "Amoblado ≈ no amoblado en monoambientes" — riesgo de confounding no controlable (año construcción, amenidades, terminaciones). Aún verificando m² medianos (37 vs 35.6), no podemos aseverar. Bajada de tono: ahora dice "prima del mobiliario en renta/m² es ~8.5%, menor que la intuición de broker sugiere", con caveat explícito.

## Decisiones de data

### Consolidación estado de obra
`nuevo_a_estrenar` se consolida en `entrega_inmediata` al mapear desde BD. Conceptualmente son lo mismo para el comprador (depto listo, nunca habitado). Esta consolidación se hace una sola vez en `db-baseline.ts`, todas las tools downstream trabajan con 3 estados: entrega_inmediata, preventa, no_especificado.

### Label "Mono" (vocabulario boliviano)
Los 0 dormitorios se etiquetan como **"Mono"** (monoambiente) en todas las tablas, charts y filtros. No "0D" (confuso), no "Estudio" (menos usado en Bolivia). Helper central: `baseline/html/labels.ts` con `dormLabel(0) = 'Mono'`.

### Monoambientes en tabla amoblado §8
La tabla `porDormsAmoblado` originalmente excluía 0D. Error — monoambientes son el segmento más grande de alquiler (38 de 129). `DORMS_PARA_AMOBLADO = [0, 1, 2, 3]` incluye todos.

### Filtro n≥3 para antigüedad por dorm
Segmentos con menos de 3 unidades se muestran como "—" en tablas de antigüedad. Villa Brígida 3D (n=2) se filtra — antes aparecía con 105d como caso extremo, ahora el máximo reportable baja a 82d (Eq. Centro 2D).

### Verificación de composición (monoambientes amoblado)
Antes de afirmar "amoblado ≈ no amoblado" controlé m² medianos:
- Amoblado: n=20, m² mediano 37.0
- No amoblado: n=10, m² mediano 35.6

Sin sesgo de tamaño. La prima real en renta/m² es 8.5% ($14.25 vs $13.13). Aun así queda pendiente controlar por año/amenidades/piso → tesis bajada de hallazgo a observación con caveat.

## Decisiones de diseño

### Todo SVG inline (sin Chart.js)
Se probó Chart.js en iteración inicial. Se migró a SVG nativo porque:
- Los charts genéricos Chart.js se ven "default" — no editoriales
- Dependencia externa innecesaria (CDN en head)
- SVG inline funciona offline, imprime bien, se ve más editorial

### Dot plot > bar chart para rangos (§6)
Cleveland dot plot clásico (línea P25↔P75 con 3 puntos: gris P25, negro grande mediana, gris P75). Menos tinta, más data-ink ratio. Ojo humano compara posiciones mejor que áreas.

### Small multiples > 2 charts (§4)
5 zona-tiles idénticas en grid > 2 bar charts separados. Comparación cruzada más rápida. Patrón editorial dominante (NYT, Bloomberg, Economist).

### Donut > bar rows para binary composition (§3)
Composición por fuente (C21 vs Remax) en donut chart con total al centro + leyenda lateral. Más editorial que bar rows genéricos.

### Details expandibles para contenido secundario
`<details>` colapsados por default para:
- Ejemplo numérico TC (§2/Apéndice Metodología)
- Tabla antigüedad vs días reales (§2)
- Otras definiciones operativas (§2)
- Tabla detallada precios zona×dorms (§6)
- Agenda de próximas ediciones (§9)

El valor central queda visible, el contenido de soporte expandible.

### Sin mapa SVG por ahora
Se intentó un mapa SVG con polígonos GeoJSON coloreados + labels. Se removió porque sin tiles (calles, contexto geográfico) parecía diagrama abstracto, no mapa real — "quitaba seriedad". Pendiente: static map con tiles OSM (Geoapify/Mapbox) para reemplazarlo.

## Aprendizajes de auditoría

### Bug Mare (pendiente de UPDATE en BD)
`proyectos_master.id_proyecto_master = 4` (nombre_oficial "Mare") tiene `desarrollador = 'Mare Desarrollos'`. Debería ser `'Mariscal Construcciones'` — "Mare Desarrollos" es un alias mal creado. Pendiente de ejecutar con usuario de escritura (claude_readonly no puede):
```sql
UPDATE proyectos_master SET desarrollador='Mariscal Construcciones' WHERE id_proyecto_master=4;
```
Impacto: Mariscal pasaría de 1 proyecto (Condominio MARE, 8 uds) a 2 proyectos (13 uds combinado), entrando al ranking de concentración en §7.

### Bug columnas proyectos_master
Primer intento usaba columnas inexistentes (`id`, `nombre_proyecto`, `desarrolladora`). Correcto: `id_proyecto_master`, `nombre_oficial`, `desarrollador`. Fix en `tools/top-proyectos.ts`.

### Placeholder en narrativa
Al agregar un nuevo placeholder (ej. `{{totalVenta}}` en hero.subtitle), hay que pasarlo en las `vars` del section correspondiente (`cover.ts`, `tres-lecturas.ts`). Si falta, el generator logea warning pero no rompe.

### Paridad numérica vs draft manual
Al regenerar con el framework, los números pueden diferir +/- 1-2% respecto al draft inicial por:
- Pipeline corrió entre el draft y la regeneración (días adicionales)
- Redondeo aplicado en distinto orden
- Composición amoblado: BD normalizó nulls entre ediciones

No son errores, son drift esperado.

## Decisiones descartadas (con razón)

- **Mapa SVG abstracto** — quita seriedad sin tiles reales
- **TL;DR tipo comprador** — redundante para dev/inversor (ellos leen todo)
- **CTA grande al inicio** — innecesario para este público (leen al final)
- **§2 Metodología al inicio** — bloquea lectura, ahora apéndice
- **Share buttons Twitter/LinkedIn** — baja prioridad para dev/inversor

## Pendientes (backlog)

1. **UPDATE BD Mare** — `proyectos_master.id=4` → `desarrollador='Mariscal Construcciones'`. Bloqueado por permisos.
2. **Static map con tiles OSM** — reemplazar el SVG abstracto removido. Geoapify tiene tier free, Mapbox también.
3. **Landing comprador** — web tool con filtros por zona/dorms/presupuesto (no PDF). Reutiliza infra de simonbo.com.
4. **Datasheet 1-pager para broker** — PDF mensual compartible por WhatsApp, 1 página letter, inventario + rango precios + top 5 proyectos. 2-3h de trabajo desde la data existente.
5. **Próxima edición: Julio 2026** — incorpora primera serie de absorción publicable (filter_version 3 con 90+ días) y rotación observada por submercado.
6. **Edición Octubre 2026** — separación amoblado/no amoblado en alquiler si para entonces se puede controlar por año/amenidades.
7. **Edición Enero 2027** — primera serie YoY completa.

## Commits de referencia

- `843fbcd` — draft inicial HTML + cambios BD
- `0a475b4` — disclaimer inventario estancado + backlog Fase 2
- `8622d63` — handoff doc para retomar
- `86987b2` — framework baseline paralelo (tools + sections + narrativa)
- `3fd146e` — empaquetado editorial (progress bar, mini-ToC, pull quotes, KPI hero, OG tags)
- `d314b63` — small multiples §4 + dot plot §6 + CTA producto
- `b4ff6eb` — "Mono" label + monoambientes en §8
- `ba6888a` — antigüedad por 1D/2D/3D (no solo 1D)
- `dbf6e1c` — geografía precisa en perfiles §4
- `a58b964` — logo Simón + contacto WhatsApp/email
- `eda8c6f` — 5 mejoras visuales (donut §3, matriz §5, details §2/§6)
- `31a3c22` — hallazgos primero, metodología al final (restructura editorial)
- `8dab71e` — voz pragmática en hallazgos §1
- `99934e2` — reposicionar para dev/inversor + aviso honesto upfront
