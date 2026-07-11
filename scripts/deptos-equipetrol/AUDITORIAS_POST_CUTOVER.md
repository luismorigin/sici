# Auditorías vs. flujo híbrido — mapa de alineación al cutover

> Reconocimiento 11-jul (deptos-venta Equipetrol). Qué pasa con las skills `/audit-feed-ventas-*` y
> `/audit-cola-matching` cuando el híbrido reemplace a n8n. NO reescribir ahora — hoy prod = n8n y las
> skills sirven tal cual. Esto es el plan de qué tocar EN el cutover. Fuente: 2 reconocimientos read-only.

## Regla de oro
Las auditorías existen para **cazar los errores de n8n** (extractor v16.5 sin rama oficial, merge que repisa,
cola HITL, TC mal marcado). El híbrido **lee bien de origen con el reader v4** → varios controles se vuelven
redundantes (el reader ya los hace al leer), otros cambian de tabla, y unos pocos hay que reescribir.

## 🔴 Dos puntos de ruptura SILENCIOSA (lo más importante — arreglar SÍ o SÍ al cutover)

1. **Columna de la descripción.** Todo el SQL de la semanal lee `datos_json_enrichment->>'descripcion'`
   (lo poblaba el paso Firecrawl-enrichment de n8n). Si el híbrido escribe la desc a `datos_json.contenido`
   y NO a `datos_json_enrichment`, **los checks leen NULL y no flaggean nada — sin tirar error.** Parece que
   "todo pasa" cuando en realidad no revisó nada. Fix mecánico (repuntar la columna) pero obligatorio y global.
2. **Eje TC.** `internal-checks.mjs` tiene `TC_PARALELO=9.954` y `RATIO=1.43` hardcodeados + regex que solo
   conoce los tags viejos (`paralelo/oficial/no_especificado`). El régimen nuevo tiene `oficial_viejo` y `bob`
   que el check NO conoce. Hay que re-mapear todo el subsistema TC a los 4 tags nuevos.

## 🟢 Gap del híbrido: NO hay re-lectura por drift de descripción (insight founder, 11-jul)

**El problema.** El híbrido lee la descripción UNA sola vez (reader pass) y el cargador EXCLUYE los ya
cargados (`cargar-deptos-shadow.mjs:81`) → nunca re-mira. Pero los anunciantes dejan **el mismo anuncio,
misma URL, mismo precio de cabecera, y editan SOLO la descripción**: bajan el precio en el texto, ponen
"REBAJA", cambian "disponible"→"reservado/vendido", cambian condiciones. El precio estructurado no se mueve
→ el discovery nocturno no ve nada → **el híbrido nunca se entera** y el veredicto del reader (precio del
texto, TC, estado, amenidades) queda congelado y viejo en el feed.

**Por qué es PEOR que n8n.** n8n re-corría el enrichment cada noche (re-leía TODO con Firecrawl+LLM — caro,
pero cubría esto por fuerza bruta). El híbrido apuesta a una lectura única (el reader = el MOAT) → sin un
mecanismo de drift, tiene un punto ciego que n8n no tenía.

**El diseño (el drift ES el trigger de re-lectura):**
```
fetch barato de la desc (el drift) → comparar con la guardada
   ├─ igual        → nada
   └─ cambió mucho → marcar la prop → re-pasa SOLO esa por el reader (re-genera veredicto)
```
Es MÁS eficiente que n8n: en vez de re-leer todo cada noche, el drift dice QUÉ re-leer → solo se paga el
reader (lo caro) en las pocas que cambiaron. El drift decide *cuándo* vale la pena re-mirar. Reusa el fetcher
de la gemela `-fetch` + `similarity.mjs` (levenshtein/buckets) que ya existen.

**Acción de cutover:** el híbrido NECESITA este loop de drift→re-lectura (hoy no existe). Es parte del
paquete de enganches, junto al verificador. Sin esto, el feed híbrido acumula datos viejos en props editadas.

## `/audit-feed-ventas-*` — veredicto por capa

| Capa / check | Cutover | Nota |
|---|---|---|
| **Matching** (regex 3.1 + juez LLM 3.1b + GPS 3.2 + prefijos 3.3/3.4) | ✅ **SOBREVIVE** | La más portable — es intrínseca al matcheo por nombre, no al pipeline. |
| **Duplicados** (apart-hoteles, `dup-checks.mjs`) | ✅ **SOBREVIVE** | Comportamiento del PORTAL, ortogonal al pipeline. El híbrido tampoco los caza. |
| **Drift portal** (Capa 1) | 🟢 **CRÍTICO — es el disparador de re-lectura** | Ver "Gap del híbrido" abajo. NO es "menos volumen": es la única red que detecta cambios post-captura. La gemela `-fetch` ya usa el fetcher del híbrido. |
| similarity / reporter / persistencia (`audit_descripciones_*`, mig 242/267) | ✅ **SOBREVIVE** | Agnósticos del pipeline. `modo='fetch'` ya preparado. |
| Precio explícito (2.3), $/m² (2.4 base), nombre basura (2.6), booleanos (2.7), área/desc corta (4.1/4.2) | ✅ **SOBREVIVE** | QA independiente. Repuntar la columna de desc. |
| **Subsistema TC** (`checkPrecioVsDesc`, `checkTcVsDesc`, SQL 2.1, 4.3) | 🔧 **REESCRIBIR** | Al régimen nuevo (`oficial_viejo`/`bob`). Ver ruptura #2. |
| **2.9 flag paralelo contradicho** | ❌ **MUERE** | Parche explícito del bug extractor v16.5. El reader v4 taggea en origen. |
| **`desync_contenido_enrichment`** | ❌ **MUERE** | Sin merge de 2 descripciones, no hay qué desincronizar. |
| **2.8 dorms=0** / sub-caso **2.4 tipo_operacion** | ❌ **~MUERE** | Se apoyaban en el merge / discovery C21 viejo. Reader v4 valida en origen. |
| **Detector de atractores** + **auditoría auto-aprobados score≥85** | ❌ **MUERE** | Atados a `matching_sugerencias` + `generar_matches_fuzzy` + auto-aprobación de n8n. Sin cola HITL, no tienen sustrato. |
| **Candado formato-objeto** (paso 8) | 🔧 **SE SIMPLIFICA** | Su razón era proteger del merge nocturno que repisa. Sin merge, la doctrina anti-repisado sobra (salvo candado de cluster si el matcher re-evalúa). |

**Balance:** ~55-60% sobrevive tal cual o con ajuste mecánico · ~25% reescribir (eje TC + columna desc) · ~15-20% muere (redundante).

## `/audit-cola-matching` — veredicto: **MUDA DE TABLA** (no muere)

- **La cola `matching_sugerencias` muere** para Equipetrol/híbrido: el híbrido no la llena (matchea en el
  `--apply`). De hecho **Equipetrol nunca usó `pendiente_<macrozona>`** — usaba `pendiente` con UI propia.
- **El valor reutilizable NO es la cola** — es el patrón *fetch del anuncio → subagente-lector como juez →
  cruce contra `proyectos_master`+GPS → SQL con candados*. Eso sobrevive **intacto**; solo cambia `lib/db.mjs`.
- `lib/lector.mjs` (doble fetcher) y `lib/atractores.mjs` (clusters/atractores) ya son **compartidos** con
  las `/audit-feed-*` → sobreviven sin tocar.

**Qué auditaría la versión híbrida** (= exactamente lo que dejamos hoy en el barrido):
- **Superficie 1 (prioridad):** `id_proyecto_master IS NULL` CON nombre → candidatos **PM_NUEVO** (595 Bloque
  La Salle, 3660 Hamburgo) / **fuzzy débil** (1674 Sky Collection).
- **Superficie 2:** auto-matches riesgosos, sobre todo `nombre_unico_zona_dif` confianza 85 (nombre único
  pero zona no coincide — hoy: Sky Luxury, Maré, Stone 3, Uptown Drei). Falsos positivos.
- Cambio quirúrgico: solo `lib/db.mjs` (consultar `propiedades_v2 WHERE ... id_proyecto_master IS NULL AND
  tiene_nombre` en vez de `getColaPendiente`). El juez-subagente y el generador de SQL no cambian.
- Modo natural HOY: apuntarlo al **shadow** y comparar el veredicto del lector contra lo que el híbrido decidió.

## Qué NO cambia (para las OTRAS macrozonas)
Si zona_norte/urubo siguen en n8n mientras solo Equipetrol migra, **ambas skills siguen operativas tal cual**
para esas macrozonas. La transformación es solo sobre la porción que el híbrido absorbe.

## Orden sugerido al cutover
1. Arreglar los 2 puntos de ruptura silenciosa (columna desc + eje TC) — sin esto, media auditoría lee NULL.
2. Podar lo que muere (atractores, auto-aprobados, 2.9, desync) para no mantener código muerto.
3. Mudar `audit-cola-matching` a auditar no-matches del híbrido (cambio en `lib/db.mjs`).
4. El resto (matching, duplicados, drift-fetch) queda como está.
