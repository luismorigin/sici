# Bitácora — Proyecto Zona Norte

Log cronológico append-only. Cada entrada: qué se hizo, qué se decidió, qué quedó pendiente. Las decisiones de fondo viven en [DECISIONES.md](./DECISIONES.md); acá queda el hilo narrativo.

---

## 19 May 2026 — Arranque y primera investigación

**Origen:** Lucho, con más control sobre los audits semanal/mensual, pide investigar qué tan complejo sería ampliar SICI más allá de Equipetrol. Intención: ir por polígonos, seguir con departamentos. Pide alineación al 95% antes de investigar.

**Alineación (vía preguntas):**
- Alcance: 1 zona piloto.
- Tipos: departamentos venta + alquiler.
- Polígonos: los dibuja Lucho en geojson.io.
- Matching: lanzar sin `proyectos_master` día 1.
- Zona piloto tentativa: Zona Norte (Av. Banzer).
- Profundidad: mapa → spike → PRD, en cadena.

**Trabajo:** 3 subagentes en cadena.
1. **Mapa de impacto** (Explore): identificó que DB/triggers/vistas/LLM/audits/admin/brokers/GA4 son zone-agnostic; frontend y brand tienen hardcoding de Equipetrol. Creyó que el discovery era zone-agnostic (luego refutado).
2. **Spike de viabilidad** (general-purpose): encontró el CHECK constraint `zona_valida` hardcoded, y **refutó** que el discovery fuera agnóstico (C21 grid bbox, Remax slug, BI filtro por barrio).
3. **PRD** (prd-creator): documento de 9 fases con las 8 decisiones TBD. Quedó en `docs/backlog/EXPANSION_ZONAS_PRD.md`.

**Estado al cierre:** PRD ejecutable listo, pero con scope inflado (incluía posicionamiento/landing).

---

## 20 May 2026 — Reenfoque a MVP y validación empírica

**Reencuadre de Lucho:** "Me estoy confundiendo." El MVP es solo venta + alquiler; olvidar posicionamiento/landing/branding (se decide después). La preocupación real: **cómo se posiciona la zona en los 3 portales**, porque de eso depende la escalabilidad. Si hay que hacer combinaciones más allá del GPS, es un problema. Propone arrancar stand-alone para no contaminar producción. No entendió la jerga "Path A/B" → descartada.

**Spike de discovery geográfico (evidencia empírica real):** → ver [investigacion/spike-portales.md](./investigacion/spike-portales.md).
- Los 3 portales devuelven GPS por listing al 100%.
- Remax: el endpoint base SC (sin slug) trae 517 props todas con lat/lon → **no estás atado a los slugs**. (Slug inválido = devuelve todo SC en silencio.)
- Veredicto: el patrón "fetch amplio + filtrar por polígono GPS" es viable en los 3. Agregar zona = dibujar polígono. → **ADR-004**.

**PoC de discovery (sin tocar BD):** → ver [investigacion/poc-resultados.md](./investigacion/poc-resultados.md).
- Lucho pasó un polígono de prueba amplio.
- Script `scripts/poc-zona-norte/poc-discovery.mjs` trajo de los 3 portales y filtró por polígono: **595 props (482 venta / 113 alquiler)**.
- Sanity check: la taxonomía propia de cada portal ("Norte", "Radial 26", "Hamacas", "Norte entre Xto anillo") coincide con lo que el polígono captura por GPS. Precios coherentes entre portales.
- Muestra con links reales revisada (edificios reconocibles: Mangales Blue, Barcelona). Data cruda con outliers esperables (precio/área mal cargados en el portal) que el enrichment limpia.

**Discusión del enjambre completo:** Lucho marcó que el PoC solo probó discovery, y que SICI es un enjambre (discovery → enrichment → merge → matching → verificación). Se mapeó etapa por etapa → ver [investigacion/mapa-impacto.md](./investigacion/mapa-impacto.md). Hallazgo: solo 2 puntos contaminan (matching por nombre + snapshot global). → **ADR-006**.

**"¿Qué haría un dev senior?"** Recomendación: no clonar producción; dark launch en prod real, blindar primero, venta sola, kill-switch listo. → **ADR-005**.

---

## 21 May 2026 — Higiene de git y estructura del proyecto

**Decisión sobre microzonas:** subdividir después no es problema; arrancar con 1 polígono. → **ADR-008**.

**Decisión sobre organización:** carpeta de contexto en main, sin rama-proyecto de larga vida. → **ADR-007**.

**Higiene de git (working tree estaba sucio con temas mezclados):**
- `92f3cc8` docs(analysis): experimento natural post-paid Simón Alquileres.
- `9f74529` test(llm-enrichment): discriminación de nombres similares.
- `78d2d26` chore(repo): destrackear `settings.local.json` + gitignorear `personal-doble-via/` (negocio personal, fuera de SICI) y `poc-zona-norte/resultados.json` (output generado).

**Estructura del proyecto creada:** esta carpeta `docs/proyectos/zona-norte/` con README + DECISIONES + BITACORA + PRD + investigacion/. PRD movido desde `docs/backlog/` y actualizado al scope MVP.

**Pendiente / próximo paso:** diseñar e implementar los 2 blindajes (matching por nombre + snapshot global) ANTES de meter datos. Después: dark launch de venta.

---

## 26 May 2026 — Fases 1 y 2 aplicadas en producción

**Reanudación tras 5 días.** Investigación senior de los 2 blindajes con queries reales contra prod (no asunciones). Hallazgos clave que cambiaron el diseño original:

1. **Q1: 193 matches actuales con `p.zona ≠ pm.zona`** — no son retroactivos (la función filtra `id_proyecto_master IS NULL`), pero revela patrón estructural: 92 contra `pm.zona='Sin zona'`.
2. **Q3-Q8: Los 39 proyectos "Sin zona" son edificios reales** — todos con GPS preciso, 38/39 fuera de los polígonos Equipetrol actuales. La etiqueta "Sin zona" significa "no entra al polígono Equipetrol", no "pendiente de catalogar".
3. **Q11: 77 de 98 props matcheadas contra "Sin zona" también están con `p.zona=NULL`** — confirmación del patrón "anunciante dice Equipetrol pero GPS cae fuera del polígono".
4. **Q12 (instinto de Lucho): 17 de 39 proyectos "Sin zona" caen dentro del polígono Zona Norte** (44%). El backfill los re-etiqueta automáticamente.

**Decisión de diseño afinada:**
- **Invertir el orden** del PRD original: cargar polígono + CHECK + backfill PRIMERO, blindajes DESPUÉS. Razón: el backfill con `get_zona_by_gps()` limpia automáticamente los 17 proyectos legacy, eliminando el trade-off del blindaje estricto.
- **Blindaje 1 estricto sin excepción** (`pcn.zona = pm.zona`, sin `OR pm.zona = 'Sin zona'`). El argumento de preservar matching contra "Sin zona" colapsa cuando se ve que son edificios físicamente fuera de Equipetrol — incluirlos sería preservar el bug.
- **Blindaje 2 hardcoded las 6 zonas Equipetrol** (no `NOT IN ('Zona Norte')` por extensibilidad).

**Migraciones aplicadas:**
- `sql/migrations/250_zona_norte_poligono_y_backfill.sql` — polígono macro (27.73 km²) + CHECK ampliado + backfill.
- `sql/migrations/251_blindajes_matching_y_snapshot.sql` — los 2 blindajes con CREATE OR REPLACE.

**Resultado del backfill** (más rico de lo esperado):
- 158 props re-etiquetadas a Zona Norte: 2 venta `completado`, 1 venta `inactivo_pending`, 88 `inactivo_confirmed`, 67 `excluida_zona`.
- 18 proyectos master re-etiquetados (predicción 17, +1 caso borde).
- 21 proyectos master quedaron en `Sin zona` (satélite verdadero: Brickell 7, Riviera 155, Portofino, Swissôtel, etc.) → ticket cleanup futuro.

**Caveat documentado en README.md:** la serie `market_absorption_snapshots` de Zona Norte arranca con baseline ruidoso (tasa absorción aparente ~92% es falsa). Aplica regla 12 de CLAUDE.md: no usar como métrica hasta ≥90 días post-Fase 3.

**Próximo paso:** Fase 3 — adaptar los 3 workflows de discovery al patrón "fetch amplio + filtro polígono GPS".

---

## 27 May 2026 — Fase 3+4 ejecutadas, bugs raíz descubiertos y resueltos

**Mañana:** validación tras primera corrida nocturna. 408 props ZN aparecieron como `inactivo_pending` (causa: discovery Equipetrol comparaba todo `propiedades_v2` sin filtro de zona, marcaba ZN como ausentes). Fix aplicado en C21+Remax Equipetrol: agregar `AND zona IN (6 zonas Equipetrol)` al "Obtener URLs Activas BD". Commit `fb78d23`. También limpieza de 140 props legacy backfilleadas con status confirmed/excluida que no debían contar para absorción ZN.

**Tarde:** pipeline manual completo para acelerar dark launch (no esperar otro ciclo nocturno):

1. **Flujo B regex** (con LIMIT subido a 500 → restaurado a 100): 374/416 props con enrichment regex aplicado.
2. **Enrichment LLM** (~$3 total con Haiku 4.5): 343 props con `llm_output` poblado. Detección clara de edificios reconocidos (STONE 4, MIRO TOWER, MACORORO 15), TC paralelo, estado_construccion. **Bug pillado:** LIMIT estaba mal cambiado a `LENGTH(descripcion) >= 500` cuando debía ser `>= 30`. Fixeado.
3. **Merge** (2 corridas con LIMIT 200): 373 props ZN venta a `status='completado'`. **Hallazgo:** props pasaban directo de `actualizado` a `completado` sin pasar por merge formal — workaround: cambiar manual a `actualizado` para forzar merge. nombre_edificio + tipo_cambio_detectado consolidados al 100%.
4. **Matching nocturno:** 88 matches generados. **Detectados 15 cross-zona ZN→Equipetrol** (Domus Luxury, Sky Icon, Baruc II, TRIVENTO IV, Condominio La Madre).

**Investigación cross-zona:** análisis función por función reveló que solo `generar_matches_trigram` no tenía blindaje de zona (las otras 6 sí). `Condominio La Madre` además estaba **mal catalogada** en `proyectos_master` (zona='Equipetrol Norte' pero GPS cae en Zona Norte) — re-asignada a ZN.

**Migración 252 aplicada:** `generar_matches_trigram` con `AND psm.zona = pm.zona` (replicando estilo del blindaje fuzzy existente).

**Bug pillado en `aplicar_matches_aprobados`:** la función NO respeta reverts manuales de `id_proyecto_master`. Si el admin revierte un match pero la sugerencia sigue en estado='aprobado', el próximo matching la re-aplica. Solución: archivar las 26 sugerencias cross-zona aprobadas que involucran ZN como `obsoleto_cross_zona` (filtro acotado, NO toca cross-microzona Equipetrol históricas).

**Migración 253 aplicada:** trigger BEFORE INSERT en `matching_sugerencias` separa el HITL de Zona Norte (estado `pendiente_zn`) del HITL Equipetrol (`pendiente`). Permanente, cero mantenimiento. UI futura documentada en README (3 opciones: UI separada nueva / toggle / migración total). Sin pérdida de datos — sugerencias ZN quedan completas, queryables por estado.

**Resultado final del día:**
- 373 props ZN venta en `completado`, 76 matches legítimos same-zone, 0 cross-zona, 297 sin match (esperado ADR-003).
- HITL Equipetrol limpio: 18 `pendiente`, 0 ZN.
- HITL ZN separado: 39 `pendiente_zn`.
- 65 `obsoleto_cross_zona` archivadas con trazabilidad.

**Snapshot del día (auditoria_diaria_sici_v3.0 manual):**
- Zona Norte tiene su PRIMERA serie por-zona con 4 filas (dorms 0-3): 372 props activas, mediana $59k-$157k según dorms, USD/m² $1304-$1700.
- Global Equipetrol sin contaminación ZN (blindaje 2 funcionando): 389 props activas.
- ZN ~30-50% más barata que Equipetrol global (esperable: zona menos premium).
- ZN absorbidas 30d = 0 (correcto post-limpieza, baseline ruidoso eliminado).

**Commits del día:** `fb78d23` (fix discovery filtro zona), `8f4e3ea` (mig 252+253+README HITL).

**Workflows ZN activos:** `flujo_a_discovery_century21_zonanorte_v1.0.0` (cron 1:15 AM), `flujo_a_discovery_remax_zonanorte_v1.0.0` (cron 1:45 AM). Mañana 1:15-9:00 AM el ciclo completo corre sin intervención.

**Próximo paso:** validar primera corrida nocturna 100% automática 28-may-2026. Tasks pendientes: documentar kill-switch (#10) cuando se considere necesario.

---

## 27 May 2026 (continuación) — Bug K1 inflado + descubrimiento de problemas LLM/merge

**Trigger:** lectura visual de Zona Norte tras Fase 3+4 reveló que "EDIFICIO K1" tenía 54-55 props matcheadas, número absurdamente alto para un solo edificio. Investigación reveló múltiples bugs interconectados:

**Bug 1 — Prompt LLM v4.0 extrae palabras genéricas como nombre_edificio:**
- 16 props con `nombre_edificio='Preventa'` (palabra genérica de la descripción).
- 9 con `'Moderna'` (adjetivo).
- 6 con `'Venta'` (palabra genérica).
- No es bug específico de Zona Norte — también afecta Equipetrol (no investigado el alcance).

**Bug 2 — Merge ignora `llm_output.nombre_edificio`:**
- El COALESCE del merge prioriza: columna nombre_edificio > regex (datos_json_enrichment) > json viejo.
- El LLM v4.0 extrae nombres MUCHO mejores que el regex pero está en `llm_output.nombre_edificio` — el sistema lo ignora.
- Mismas funciones afectadas: `generar_matches_por_nombre`, `generar_matches_trigram`, `generar_matches_fuzzy`.

**Bug 3 — Loop self-reinforcing K1:**
- Match GPS inicial captura props cerca del K1 (radio 250m sobre Av. Banzer).
- Merge pisa `propiedades_v2.nombre_edificio` con `pm.nombre_oficial='EDIFICIO K1'`.
- Próximo matching fuzzy ve "EDIFICIO K1" en columna → 100% similitud contra pm K1 → re-confirma.
- Self-reinforcing: el match crea el campo que después lo valida.

**Hallazgo positivo:** el LLM SÍ extrajo bien los nombres reales (Mangales Blue 2, HH HOME, Essenzia, Raizant Blend, Ergo Experience, Vilareal Duo, Ziri Zwei, etc.). Solo el sistema downstream los ignora.

**Acciones aplicadas (acotadas a Zona Norte, NO tocan Equipetrol):**
1. **UPDATE revertir matches falsos K1:** `id_proyecto_master=NULL` para 52 props ZN matcheadas contra K1 cuyo `llm_output` decía otro nombre. Quedan 3 K1 reales legítimos.
2. **UPDATE backfill nombre_edificio:** poblar columna con `llm_output.nombre_edificio` para todas las props ZN del workflow `zonanorte_%`. Resultado: nombres reales emergen (Mangales Blue 2, Domus Luxury, etc.).

**Estado final post-limpieza:** 27 matches legítimos en ZN (vs 88 con falsos), 361 sin match (esperado ADR-003).

**Aplicaciones de UI:** agregado "Zona Norte (piloto)" al filtro admin (`/admin/propiedades`, `/admin/proyectos`) vía `ZONAS_ADMIN_FILTER`. Solo admin lo ve; público sigue sin Zona Norte (dark launch intacto). Commit `115b1e5`.

**Pendientes documentados en BACKLOG.md.** Ver ese archivo para tickets de próxima sesión (mejora prompt LLM, refactor merge/matching para usar llm_output).

---

## 27 May 2026 (continuación 2) — Re-investigación del ticket #1: NO era el LLM

**Trigger:** intento de fixear el ticket "mejorar prompt LLM v4.0" reveló que el diagnóstico inicial estaba equivocado.

**Hallazgos al investigar caso real (Remax prop con `nombre_edificio='Preventa'`):**

| Fuente | Valor |
|---|---|
| `llm_output.nombre_edificio` | **null** ✅ (LLM correctamente identifica que no hay nombre claro) |
| `datos_json_enrichment.nombre_edificio` (regex) | `"Preventa"` ❌ (regex toma palabra del título) |
| Columna final | `"Preventa"` (merge usa regex cuando LLM no estaba siendo considerado) |

**Conclusión:** el LLM funciona bien. El bug está en el extractor REGEX del `flujo_b_processing_v3.0`. Tiene una `BLACKLIST_CRITICA` con "preventa, pre venta, venta, etc." pero NO se aplica (probable case sensitivity o orden de filtrado).

**Análisis del alcance real del bug:**

Auditoría sobre 568 props Equipetrol completadas:
- 472 (83%) `nombre_edificio = llm_output.nombre_edificio` — el LLM ya domina la columna.
- 559 (97%) tienen `id_proyecto_master` (matcheadas con proyecto master).
- 490 (88%) `nombre_edificio = pm.nombre_oficial` — el merge pisa con el nombre del proyecto cuando hay match.

→ **El mecanismo real**: cuando una prop matchea con `proyecto_master`, el merge pisa `nombre_edificio` con `pm.nombre_oficial`. Eso enmascara el bug del regex en Equipetrol (todo matchea).

**¿Por qué el bug emerge en Zona Norte?**

- ADR-003: ZN arranca SIN proyectos master propios (decisión).
- 361 de 388 props ZN están **sin match** (93%).
- Sin match → merge usa COALESCE → cae al regex → "Preventa"/"Moderna"/"Venta" emergen.

**Comparativa:**

| Caso | Equipetrol | Zona Norte |
|---|---|---|
| Props matcheadas (pm pisa nombre) | 559 (97%) | 27 (7%) |
| Props sin match (regex gana) | ~9 (1.6%) | **361 (93%)** |
| Props con nombre genérico | 2 (Venta) | 31 (Preventa/Moderna/Venta) |

**Re-categorización del ticket original:** "Mejorar prompt LLM" estaba mal nombrado. El issue real es:

> "Props Zona Norte sin match exponen el bug del regex porque no hay pm.nombre_oficial que las salve. Soluciones: backfill recurrente (cero código) o modificar merge para preferir LLM cuando id_proyecto_master IS NULL."

**No se aplicó ningún fix en esta sub-sesión.** Solo investigación. Tickets actualizados en BACKLOG.md.

---

## 27 May 2026 (continuación 3) — La deuda real: prompt LLM sin criterio de confianza

**Trigger:** investigación más profunda del ticket #1 reveló que el merge v2.6.0 YA tiene lógica híbrida (LLM > regex cuando regex sospechoso). El "bug" raíz NO era ninguna de las hipótesis anteriores.

**Auditoría sobre 824 props con LLM aplicado:**
- 643 (78%) con `nombre_edificio_confianza='alta'`.
- 166 (20%) con confianza=null.
- 15 (2%) con confianza='media'.
- **0 (0%) con confianza='baja'.**

→ El LLM es **binario en la práctica**: "alta" o "null".

**Causa raíz definitiva:** el prompt `prompt-ventas.md` define los valores válidos del campo `nombre_edificio_confianza` en el schema JSON, pero **NUNCA explica al LLM cuándo usar cada nivel.** Sin criterio, el LLM lo interpreta binario.

**Cómo explica el caso "Moderna" (Torre Moderna):**
- El nombre del edificio aparece SOLO en la URL/slug (`torre-moderna`), no en la descripción libre.
- El LLM ve la descripción y no encuentra "Torre Moderna" mencionada explícitamente.
- Sin criterio en el prompt sobre cuándo usar "media", el LLM devuelve null.
- Merge solo confía en confianza='alta' → cae al regex que extrae "Moderna" (sin Torre).

**Por qué los parches no servían:**
- Agregar "moderna" a la blacklist del merge: parche cosmético, no escalable.
- Cargar "Torre Moderna" como pm: ayuda 1 caso, no resuelve la categoría.
- Re-fixear el flujo B regex: el regex SIEMPRE va a tener casos borde.

**El fix correcto (3 capas):**
1. **Prompt LLM**: enseñar gradientes de confianza (alta=descripción, media=título/URL, baja=inferido).
2. **Merge**: aceptar también `confianza='media'` además de `'alta'`.
3. **Re-procesar** las 166 props con LLM=null (algunas probablemente ahora detectan vía título/URL).

**Decisión:** ticket separado para próxima sesión (#1.1 en BACKLOG). Impacto en Equipetrol requiere análisis cuidadoso (algunas props pueden cambiar etiqueta). Hoy queda solo como aprendizaje.

**Estado actual ZN funcional:** las 31 props con nombres genéricos ya fueron limpiadas via backfill manual del nombre_edificio con llm_output (donde el LLM tenía algo). Las que el LLM tampoco tenía nombre quedan con regex pero NO contaminan métricas (sin match en proyectos_master, no afectan absorción).

---

## 27 May 2026 (continuación 4) — Visión multi-macrozona y ADR-009

**Trigger:** Lucho planteó que en el futuro "Simón Equipetrol" se transforma en "Simón Santa Cruz" multi-macrozona — Equipetrol y Zona Norte como las primeras 2 macrozonas tratadas como pares, con microzonas dentro de cada una, y escalable a futuras macrozonas (Urubó, Polanco, etc.).

**Cambio de mentalidad:**
- **Antes:** "Equipetrol producción + Zona Norte piloto agregado"
- **Después:** "Equipetrol y ZN como macrozonas de primera clase del producto Simón Santa Cruz"

**Preocupación crítica:** Lucho marca que NO quiere tocar producción Equipetrol (feed consolidado funciona bien, riesgo innecesario). Eso dispara el approach correcto.

**Approach decidido (ADR-009): strangler pattern.** Construir la arquitectura multi-macrozona EN PARALELO al sistema Equipetrol actual:
- `pages/ventas.tsx` (Equipetrol): INTACTO.
- `pages/mercado/equipetrol/*`: INTACTO.
- Workflows Equipetrol: INTACTOS.
- Branding actual ("Simón Equipetrol"): SIN CAMBIOS.
- `pages/mercado/zona-norte/*`: NUEVO (rutas, componente `<FeedMacrozona>`).
- Workflows ZN: son **los workflows universales multi-macrozona** (lectura zona-agnóstica de BD).

**Workflows aclarados:** los `flujo_a_discovery_*_zonanorte_v1.0.0.json` que armamos hoy NO son "workflows de Zona Norte específica" — son **workflows multi-macrozona** que casualmente arrancan procesando solo ZN. Para agregar Urubó/Polanco mañana: cambiar `ARRAY['Zona Norte']` a `ARRAY['Zona Norte', 'Urubó']` en el array de la query SQL. Cero workflow nuevo.

**Microzonas ZN promovidas en prioridad:** la visión multi-macrozona requiere que cada macrozona tenga sus microzonas (consistencia con Equipetrol que tiene 6). Backlog #8 reformulado: "Definir microzonas de Zona Norte" (Hamacas, Banzer 3er-4to, Radial 26, Norte 4to-5to anillo, etc.). Decisión pendiente: Camino A (hermanas como Equipetrol) o Camino B (jerarquía macro+micro).

**Ticket #6 reformulado:** "Página preview privada" → "Construir `/mercado/zona-norte` (prototipo del patrón multi-macrozona)" con 3 fases (privado por token → beta soft → producción completa).

**Documentos creados/actualizados:**
- `DECISIONES.md` ADR-009 (NUEVO): arquitectura multi-macrozona via strangler.
- `BACKLOG.md`: sección "Visión del proyecto" agregada arriba + ticket #6 reformulado + #8 promovido.
- `BITACORA.md`: esta entrada.

**Decisiones pendientes (no para hoy):**
- Branding global: "Simón Santa Cruz" vs mantener "Simón Equipetrol" vs "Simón" paraguas.
- Cuándo migrar Equipetrol al patrón multi-macrozona (3-6 meses post-validación, o nunca).
- Camino A vs B para jerarquía zona/microzona.

---

## 28 May 2026 — Sesión maratón de matching (19.7% → 54.2% match rate, +52 pm cargados)

**Trigger:** Lucho pidió auditoría de Zona Norte para entender qué pasa con los flujos y la calidad de la data.

**Resultado:** sesión más larga del proyecto (~8h en 2 tandas), match rate ZN venta pasa de **19.7% a 54.2%** (+34.5 pp), pm activos de 18 a **70**, verificación visual **100%** (70/70).

### Hitos cronológicos

1. **Audit inicial detectó 3 problemas críticos en producción ZN:**
   - K1 (pm 272) con 54 props matched falsos pre-blindaje mig 251/252
   - STONE 4 (pm 268) con 3 falsos (2 eran STONE 7) + CURUPAU ISUTO (pm 271) con 2 falsos
   - Brickell 4 (pm 122) con 4 props que eran DOMUS LUXURY/MADERO (descubrimiento)
   - 32 props con nombres basura del regex ("Preventa", "Moderna", "Venta")
   - 5 props cross-zona aplicadas (deuda pre-blindaje)

2. **Cleanup masivo aplicado:** 63 falsos desmatcheados + nombres basura → NULL + cross-zona limpiado. Re-merge de 147 props recuperó 73 nombres reales via LLM.

3. **#1.5 ejecutado: carga inicial de 20 pm** con cluster GPS <100m (Mangales Blue 2, HH HOME, Vilareal Duo, Blue Garden, etc.) + matching automático same-zone (+47 props matched).

4. **Herramienta nueva `scripts/verify-pm-gps/`:** verificación gratuita de GPS de pm vía Overpass + Nominatim (OSM) + HTML interactivo Leaflet con tile satelital Esri. **Reutilizable para Urubó/Polanco.** Costo $0. Sin API key.

5. **Patrón "verify-*.html" emergente:** 4 HTMLs interactivos generados (verify-pm-gps.html, verify-sospechosos.html, verify-pm-nuevos-zn.html, verify-dispersos-zn.html, verify-pm-capa3-zn.html). Cada uno con mini-mapa Leaflet por pm + pins de props matched + botones Maps/Street View + veredictos persistentes en localStorage + export SQL. Vos clickeás cada URL del listing, mirás Maps satelital, decidís. ~10-15 min por batch de 12-15 pm.

6. **Nuevas columnas en `proyectos_master`:**
   - `gps_verificado_visual TEXT` ('confirmed' / 'sospechoso' / 'dividir' / 'mover')
   - `gps_verificacion_notas TEXT` (notas del usuario, incluyendo GPS corregidos)
   - `gps_verificado_visual_at TIMESTAMPTZ`
   - `gps_verificado_osm BOOLEAN` (auto-verificado via Overpass)
   - `osm_buildings_around_30m INTEGER`
   - `osm_nominatim_address TEXT`
   - `osm_verified_at TIMESTAMPTZ`

7. **6 pares pm <100m auditados:** 5 confirmados vecinos legítimos + 1 bug (Brickell 4 absorbía DOMUS LUXURY y DOMUS MADERO — edificio nuevo descubierto).

8. **Re-análisis ticket #1 (mejorar prompt LLM):** habíamos diseñado plan staged de 6 fases A→F con wording "Opción 1D" suffix-aware para mitigar 20+ pares pm parecidos en Equipetrol. **Una sola query reveló que el problema era otro:** 70% de las props sin match TENÍAN nombre extraído, faltaba pm. **Ticket #1 ARCHIVADO COMO INNECESARIO.** El LLM hizo su trabajo bien.

9. **Ticket #1.7 nuevo:** detector automático de clusters emergentes (función SQL + cron semanal n8n). Para escalar sin más sesiones manuales. NO bloquea #8 ni #6.

10. **Carga incremental (capas 2, dispersos, 3):**
    - Capa 2 (12 pm + Sky Icon movido de EQ a ZN + aliases): +37 props matched
    - Aliases capa 2 (Vilareal, Berchatti, Orange, Disart, Lusitano): +10 props
    - Dispersos (Bless One, Community Alto Norte, Cantabria, Torre Moderna — los 4 con GPS de agente desplazados): +31 props
    - Capa 3 (15 pm extraídos de URLs: Macororo 16/17, Ares By Elite, Hera Tower, LIMCO II, Soul Parc, TRIII, Torre Baruc Norte, Zero, Atlantis, Camila II, Cozumel, Rafaela II, Santa Fe, Tamisa III, Westgate): +22 props

11. **Verificación visual 100%:** los 70 pm activos al cierre tienen `gps_verificado_visual` ≠ NULL. 67 confirmed + 3 sospechoso (Vertical Isuto con aviso terminado + SANTA FE + Westgate).

### Lecciones meta del 28-may (las MÁS importantes para futuras sesiones)

1. **El cluster GPS interno de N listings con el mismo nombre > Google Maps en Bolivia.** OSM/Google no rotulan todos los edificios. Cuando varios listings independientes convergen en GPS y nombre, esa convergencia es la verdad.

2. **Agentes ponen GPS sistemáticamente desplazados, pero las URLs SÍ son confiables.** Bless One, Vilareal Duo, Blue Garden, Essenzia, ATLANTIS TOWERS — todos tenían listings con GPS desplazado hasta 1.7km del edificio real. Pero las URLs/slugs mencionaban el nombre correcto. La verificación visual del usuario corrigió los GPS, los nombres sirvieron para matchear.

3. **pm legacy absorbe props vecinas en zonas densas.** Brickell 4 absorbió por GPS props de DOMUS LUXURY (36m) y DOMUS MADERO (50m) que aún no existían como pm. **Patrón a vigilar:** al cargar pm nuevo en zona densa, re-auditar matched por GPS a pm vecinos viejos.

4. **Medir antes de optimizar.** Habíamos pasado horas diseñando plan staged de 6 fases para mitigar 22% error LLM en EQ. Una sola query midió: el problema era otro. La pregunta del usuario *"explicame el problema que estamos tratando de resolver"* destrabó todo.

5. **No persigás métricas vacías.** "Subir match rate a 50%" no es objetivo, es vanity. El objetivo real era: ¿qué requiere el roadmap (#6 frontend)? No requiere 100% match rate — requiere base de pm verificada para construir el feed. Eso ya está.

6. **HTML + verificación humana batch escala mejor que automatización ciega.** El patrón verify-*.html con pin Maps + Street View + veredictos localStorage es reutilizable. Lo que toma 6h una sesión manual lo va a hacer el #1.7 en 15 min/semana cuando se construya.

7. **URLs son la fuente más confiable de nombre.** El 70% de las props sin match al inicio del día tenían el nombre del edificio extraíble del slug Remax/C21. El LLM ya las identificó bien. Solo faltaba pm.

### Estado al cierre

| Métrica | Inicio del día | Cierre |
|---|---|---|
| pm ZN activos | 18 | **70** |
| Match rate ZN venta | 19.7% | **54.2%** |
| Props matched | 77 | 212 |
| Props sin match | 313 | 179 (90 sin nombre + 2 con N≥2 + 87 con N=1) |
| pm con verificación visual | 0 | **70/70 (100%)** |
| Falsos K1+STONE+CURUPAU+Brickell | 63 | 0 |
| Cross-zona | 5 | 0 |
| Nombres basura | 32 | 0 |
| GPS corregidos manualmente | 0 | 11 |
| Edificios "nuevos" descubiertos | — | 3 (DOMUS MADERO + Sky Icon re-zonificado + Torre Baruc Norte) |

### Commits del día (7)

```
ead8b51 — Sesión 1: Audit GPS + cleanup + tool verify-pm-gps
ca438cd — Sesión 1: 6 pares pm + descubrimiento DOMUS MADERO
ead0be9 — Re-análisis ticket #1 con datos EQ (plan staged)
e105aa4 — Sesión 2 capa 1: cierre audit + ticket #1 archivado
47f8793 — Ticket #1.7 detector automático
3a2b178 — Capa 2 + dispersos
71cee8a — Capa 3 cierre día (15 pm extraídos de URLs)
```

### Roadmap para próximas sesiones

```
[29-may]
- ✅ Verificar merge nocturno → ejecutado, ver sección "29 May 2026" abajo

[Próxima sesión grande, ~medio día]
- #8 microzonas ZN (Hamacas, Banzer 3-5to, Radial 26, Norte 4-5to)
   bloquea #6 frontend

[Después de #8]
- #6 frontend /mercado/zona-norte (privado por token)
- #1.7 detector automático (en paralelo)
```

---

## 29 May 2026 — Verificación nocturna + 3 pm nuevos + cleanup falsos STONE 4/K1

**Origen:** TODO de cierre del 28-may pedía verificar merge nocturno sobre 7 Essenzia + 2 STONE 7 desmatcheadas. La revisión arrancó como check de 5 min y derivó en cleanup de 10 props con 3 pm nuevos creados.

### Health del pipeline nocturno (28→29-may)

- `enrichment_llm_venta` 02:15 → success, 0 errores. Único workflow trackeado en `workflow_executions` (discovery / merge / matching / verificador no escriben ahí — deuda de observability conocida).
- 486 props ZN con `fecha_discovery=29-may` (re-discovery diario esperado, regla 11 CLAUDE.md).
- 149 sugerencias `pendiente_zn` en cola HITL. Las 27 `pendiente` (sin sufijo) son **todas Equipetrol** → trigger `trg_separar_hitl_zona_norte` (mig 253) funciona perfecto.
- 30 props alquiler ZN ya con `status='completado'` (entrando por GPS sin necesidad de Fase 5 formal).

### Hallazgos de auditoría sobre las desmatcheadas

| Caso | Diagnóstico |
|---|---|
| 2 STONE 7 (2083, 2084) | El cleanup del 28-may las dejó NULL pero el matching nocturno las re-asignó a STONE 4 (pm 268) porque `nombre_edificio` quedó pegado en "STONE 4". URLs c21 `stone-7-...` confirman edificio distinto. |
| 3 "Condominio Essenzia" (2102, 2103, 2104) | pm 366 "Edificio Essenzia" no tenía alias `Condominio Essenzia` → 3 props legítimas sin match por bug de aliasing. |
| 3 Essenzia ya matched (2082, 2085, 2269) | Bien matched, sin acción. |
| 2268 (Remax sin nombre, 10m de Essenzia) | Listing sin nombre extraíble → asignable por GPS al pm 366. |
| 2101 (`nombre="Con"` truncado, 22m) | Mismo patrón GPS. |
| 2097 (sin nombre, GPS desplazado 277m) | URL `97817_condominio-essenzia` confirma edificio. Patrón "agente publicó GPS aproximado" documentado en bitácora 28-may. URL manda. |
| **2287 (matched a EDIFICIO K1)** ⚠️ | **Match falso no detectado el 28-may.** Estaba a 110m del GPS Essenzia y a **2249m** del K1 real. Director confirmó: es Edificio Mangales Blue (GPS -17.7479083, -63.16937597), torre distinta de pm 352 "Mangales Blue 2". |
| **2436 ("Sky Line", 4m del GPS STONE 7)** | Director confirmó: Edificio Sky Line es vecino pared con pared de STONE 7. Edificio distinto, mismo GPS centroidal. |

### Acciones aplicadas (3 bloques DO PL/pgSQL desde Supabase UI)

**Bloque 1 — STONE 7 + Sky Line:**
- Creado pm **#418 "STONE 7"** (Zona Norte, GPS verificado director, aliases `STONE 7/Stone 7/STONE7/stone 7/stone-7`).
- Creado pm **#419 "Edificio Sky Line"** (Zona Norte, GPS idéntico a STONE 7, aliases `Sky Line/Skyline/SKY LINE/sky-line/sky line`).
- Reasignados 2083, 2084 → STONE 7; 2436 → Sky Line. Todos con `campos_bloqueados.nombre_edificio` para que el matching nocturno no los vuelva a robar.

**Bloque 2 — Essenzia:**
- Aliases `Condominio Essenzia/CONDOMINIO ESSENZIA/condominio essenzia/Essenzia/ESSENZIA` agregados al pm 366.
- Reasignadas 2102, 2103, 2104 vía `metodo_match='alias_manual_29may'`.
- Reasignadas 2268, 2101, 2097 vía `gps_manual_29may` / `url_manual_29may` + `campos_bloqueados.nombre_edificio` con `nombre_edificio='Edificio Essenzia'`.

**Bloque 3 — Mangales Blue:**
- Creado pm **#420 "Edificio Mangales Blue"** (Zona Norte, GPS verificado director, aliases `Mangales Blue/MANGALES BLUE/mangales-blue`). Es torre 1, distinta del pm 352 "Mangales Blue 2" a 44m de distancia.
- Reasignada 2287 (estaba mal matched a K1, con metodo_match anterior). Ahora `metodo_match='manual_gps_29may'` + nombre bloqueado.

### Patrón nuevo confirmado

**Edificios pared con pared / torres gemelas** del mismo desarrollo aparecen como pm separados con GPS idéntico (Sky Line + STONE 7) o casi idéntico (Mangales Blue 1 a 44m de Mangales Blue 2). El matcher `gps_verificado` va a generar sugerencias HITL **dobles** para props ≤80m del cluster, pero no asigna automático — las distingue la URL/nombre en revisión humana. No es bug, es comportamiento esperado para zonas densas con desarrolladoras de torres múltiples. Misma situación probable en Equipetrol (DOMUS LUXURY + DOMUS MADERO descubiertos 28-may a 36-50m de Brickell 4).

### Estado al cierre

| Métrica | Cierre 28-may | Cierre 29-may | Δ |
|---|---|---|---|
| pm ZN activos | 70 | **73** | +3 (STONE 7, Sky Line, Mangales Blue) |
| Match rate ZN venta | 54.2% | **60.6%** | +6.4 pp |
| Props matched | 212 | 238 | +26 (incluye delta de la corrida nocturna +19) |
| Props sin match | 179 | ~155 | -24 |
| pm con verificación visual | 70/70 | **73/73 (100%)** | mantiene |
| Falsos matches detectados y limpiados | 63 (K1+STONE+CURUPAU+Brickell) | +3 (2 STONE 7, 1 K1) | acumulado: 66 |
| `campos_bloqueados.nombre_edificio` aplicados | — | **10 props** | nuevo |

### Lecciones meta del 29-may

1. **Los falsos matches reaparecen si el `nombre_edificio` quedó pegado.** El cleanup del 28-may seteó `id_proyecto_master=NULL` pero el matching nocturno los re-asignó al mismo falso porque `nombre_edificio='STONE 4'` seguía persistido. **Bloqueo de `nombre_edificio` con `campos_bloqueados` debe ser parte del cleanup desde el inicio**, no opcional.

2. **El audit del 28-may fue exhaustivo pero no detectó el match falso 2287→K1** (estaba a 2.2km del K1 real). El cleanup de K1 (54 falsos pre-blindaje) se enfocó en GPS cercanos al pm K1; 2287 no salió ahí porque su GPS está lejos de K1. **Patrón: matches viejos donde tanto el nombre como el GPS son falsos pueden pasar inadvertidos en audits geográficos.** El cleanup del 29-may los encontró porque empezó por nombre + GPS objetivo del director.

3. **El bug de alias chico (`Condominio Essenzia` vs pm `Edificio Essenzia`) costó 3 props sin match durante 2 días.** Vale la pena enriquecer alias proactivamente: cualquier pm nuevo debería arrancar con ≥3 variantes (Edificio X, Condominio X, X). Candidato para tooling automático en #1.7.

4. **GPS idéntico entre pm vecinos pared con pared es manejable** vía HITL `pendiente_zn`. No forzar separación artificial — la URL/nombre va a distinguir en revisión.

### Commits del día (0)

Cambios fueron 3 DO blocks aplicados desde Supabase UI + docs (este append + README contadores). Sin migraciones nuevas. Sin código.

### Roadmap (sigue igual)

```
[Próxima sesión grande, ~medio día]
- #8 microzonas ZN (Hamacas, Banzer 3-5to, Radial 26, Norte 4-5to)
   bloquea #6 frontend

[Después de #8]
- #6 frontend /mercado/zona-norte (privado por token)
- #1.7 detector automático (en paralelo) — sumar al scope: enriquecer alias automáticamente al crear pm
```

---

## 29 May 2026 (continuación) — Diseño completo del ticket #8 + revisión senior

**Origen:** después de la sesión técnica de la mañana (verificación nocturna + 3 pm nuevos), la pregunta del director: "cuál es el siguiente paso en Zona Norte?" llevó al diseño completo del ticket #8 microzonas.

### Cronología del diseño

1. **Discusión criterio de microzonas**: arrancamos con mi propuesta de 4 rectángulos por bandas latitudinales (Hamacas, Banzer Norte, Banzer Sur, Frontera EQ). Descartada — el director propuso criterio más granular siguiendo patrón Equipetrol (anillos × calles).

2. **Iteración en geojson.io**: 3 archivos progresivos del director:
   - Borrador 1: 3 polígonos del 2do-3er anillo.
   - Borrador 2: 17 polígonos con duplicados + nombres cruzados + 1 polígono con coords del macro.
   - Borrador 3: 14 polígonos limpios (la grilla final).

3. **Recorte automático contra EQ**: identifiqué 2 overlaps reales con EQ (184m y 142m) en el lado oeste (La Salle-Banzer). Aplicado `ST_Difference` vs EQ activo: 574 m² + 165 m² recortados. Overlap residual final: 4 m² (irrelevante).

4. **Verificación de gaps**: la unión de las 14 cubre el bbox del macro original con **1.56% sin cubrir** (43 hectáreas en 3 gaps + 2 slivers). **0 props/pm caen en gaps hoy**. Query de monitoreo agregada a `operacion.md`.

5. **Discusión modelo conceptual**: el director explicó que EQ y ZN son macrozonas hermanas operativamente (no jerárquicas) en el habla del mercado, aunque ZN geográficamente contenga EQ. → ADR-010.

6. **Revisión senior de plan A SEGURA**: el plan inicial tenía 3 pasos. La revisión exhaustiva detectó 5 bloqueantes:
   - CHECK constraint `zona_valida` rechaza las 14 microzonas.
   - Trigger HITL mig 253 hardcodea `zona='Zona Norte'` (CONTAMINA EQ HITL post-migración).
   - Matching mig 251 requiere actualizar los 73 pm a microzona específica.
   - `get_zona_by_gps()` sin filtro `activo=TRUE`.
   - Filtro admin "Zona Norte (piloto)" en `lib/zonas.ts:92` queda obsoleto.

7. **Discusión escalabilidad**: el director preguntó "es escalable? cada microzona nueva voy a tener que tocar el discovery?". Respuesta honesta: NO, no es escalable. Identifiqué 7 puntos de hardcoding. Diseñamos:
   - **Camino W** (low regret): 3 mejoras chicas + ticket #11 nuevo para refactor escalable completo.
   - **Camino B refactor snapshot**: paralelización con `filter_version=4` para refactorizar `snapshot_absorcion_mercado()` a dinámico vía `zona_general` sin riesgo a EQ.

8. **Producción de documentación final**: el director pidió "hace un doble check al plan como lo haría un senior de clase mundial revisando todo, arquitectura posible bugs y todo lo que no veo porque no soy desarrollador para que la implementación fluya sola". Resultado: 4 documentos nuevos + 2 docs actualizados + 14 microzonas listas para aplicar.

### Hallazgos críticos del doble-check senior

1. **`/admin/market.tsx` filtra por `zona='global'`** (líneas 1020, 1033, 1057). El refactor v4 preserva ese nombre para EQ por backward compat.
2. **`snapshot_absorcion_mercado()` LOOP 2 ya itera por DISTINCT zona** — Zona Norte automáticamente tiene serie por microzona post-migración.
3. **`resumen_mercado()` y `buscar_propiedades()` hardcodean 5 zonas EQ** (falta 'Eq. 3er Anillo' — bug latente preexistente). Documentado para ticket #11. **✅ RESUELTO 1-jun-2026 (mig 258):** allowlist reemplazada por `zona_general='Equipetrol'` (6 zonas — decisión: 3er Anillo ES Equipetrol).
4. **`insertar_proyectos_aprobados()` asigna `zona='Equipetrol'` sin sufijo** — no existe en CHECK constraint, probablemente bug latente. Investigar en ticket #11.
5. **`populate_broker_prospection()` solo trae brokers EQ** — si se quiere prospección ZN, hay que agregar microzonas o usar `zona_general`. Documentado.

### Artefactos producidos al cierre del día

| Archivo | Estado |
|---|---|
| `docs/proyectos/zona-norte/PLAN_IMPLEMENTACION_MICROZONAS.md` | NUEVO — master document, 7 fases + rollback + monitoreo |
| `sql/migrations/254_microzonas_zona_norte.sql` | NUEVO — migración principal lista para aplicar |
| `sql/migrations/254_microzonas_zona_norte_rollback.sql` | NUEVO — rollback completo |
| `sql/migrations/255_snapshot_absorcion_v4_dinamico.sql` | NUEVO — refactor snapshot con paralelización (LOOP 2 con placeholder a completar) |
| `docs/canonical/ZONAS_ZONA_NORTE.md` | NUEVO — canonical paralelo a ZONAS_EQUIPETROL.md |
| `docs/proyectos/zona-norte/DECISIONES.md` | ACTUALIZADO — ADR-010 agregado |
| `docs/proyectos/zona-norte/BACKLOG.md` | ACTUALIZADO — ticket #8 marcado "plan listo", ticket #11 nuevo agregado |
| `docs/proyectos/zona-norte/microzonas-propuesta/microzonas-zn-final-recortado.geojson` | NUEVO (commit anterior) — fuente de verdad |

### Estimación de aplicación final

| Fase | Tiempo |
|---|---|
| Sesión 1: migración SQL + frontend + workflows + docs | ~7h |
| Observación pasiva paralelización snapshot | 14 días |
| Sesión 2: switch v3→v4 (futura) | 30 min |

### Lecciones meta del día

1. **El usuario que NO es desarrollador tiene razón al preguntar "es escalable?"**. Mi plan inicial pasaba sobre eso y me marcó la deuda. Reaccioné con Camino W + ticket #11.
2. **Las revisiones senior detectan cosas que el plan optimista oculta**. 5 bloqueantes salieron solo al leer código real (no docs). El trigger HITL hubiera contaminado EQ silenciosamente.
3. **Fui demasiado conservador en mi estimación de complejidad del refactor snapshot**. Al re-analizar con paralelización filter_version=4, el riesgo bajó de "medio-alto" a "bajo". Aprender a separar riesgo inherente vs riesgo manejable con red de seguridad.
4. **El patrón "paralelización por versión"** (filter_version) que ya existía en `market_absorption_snapshots` fue clave para reducir riesgo. Aprovechar features ya construidas antes de inventar.
5. **Documentación pre-implementación valiosa**: el director pidió "que la implementación fluya sola" — el `PLAN_IMPLEMENTACION_MICROZONAS.md` con orden de pasos, checkpoints de validación, rollback documentado y smoke tests permite que cualquier ingeniero (incluso él mismo) aplique sin contexto adicional.

### Roadmap

```
[Sesión siguiente]
- Aplicar mig 254 + mig 255 con paralelización
- Update lib/zonas.ts + workflows n8n
- Smoke tests frontend

[14 días después]
- Switch snapshot v3→v4

[Cuando llegue Urubó/próxima macrozona]
- Empezar ticket #11 (refactor zonas dinámico)
```

---

### Auditoría del backlog al cierre del 29-may (mini-housekeeping)

Antes de cerrar la sesión para preparar la implementación en sesión nueva, auditoría rápida del estado del backlog. Detectado:

1. **#1 (mejorar prompt LLM)** seguía marcado como "🔴 Crítico próxima sesión" aunque estaba ARCHIVADO desde el 28-may. Marcado como ✅ ARCHIVADO en el título + nota explicativa. Contenido histórico mantenido para trazabilidad de las 3 iteraciones de análisis.

2. **#1.5 (cargar pm ZN)** seguía marcado como pendiente aunque los 73 pm ZN estaban verificados al 100% al 29-may. Marcado como ✅ COMPLETADO en el título + nota.

3. **Sección "🔴 Tickets críticos (próxima sesión)"** renombrada a "🟡 Tickets de calidad de matching (paralelos a #8, no bloquean)" porque el #1 está archivado, el #1.5 está hecho, y el #1.7 (detector automático de clusters) no bloquea la próxima sesión que es aplicar #8.

4. **Header del BACKLOG** actualizado a 29-may + agregada línea "🎯 Próxima sesión: aplicar Ticket #8 según PLAN_IMPLEMENTACION_MICROZONAS.md".

**Por qué importa este detalle**: el prompt para la sesión nueva indica leer el BACKLOG antes de tocar nada. Si el #1 hubiera seguido marcado como "Crítico próxima sesión", el modelo nuevo podría haberse confundido sobre cuál es el ticket activo.

**Reglas que quedan claras para futuros tickets**:
- Cuando un ticket cierra, marcar el título con ✅ + breve nota de cómo se resolvió.
- Cuando un ticket se archiva sin ejecutar, marcar título con ✅ ARCHIVADO + razón.
- Mantener contenido histórico abajo del título marcado para trazabilidad.
- Reservar etiqueta 🔴 solo para tickets que SÍ son urgentes ahora.

---

## 29 May 2026 — Aplicación FASE 1 (mig 254) + descarte de v4 snapshot

Sesión de **ejecución** del ticket #8 (el diseño se cerró antes, mismo día). Branch de trabajo `feat/zn-microzonas-aplicacion` desde `f1a86d8`.

### FASE 1 — mig 254 aplicada ✅ (8/8 CHECKs, EQ intacto)

- **Pre-requisitos:** baseline guardado (`pre-migracion-baseline.txt`), backup dirigido (`backup_dirigido_pre_mig254_2026-05-29.sql`), workflows discovery ZN + auditoría diaria (snapshot) desactivados en n8n.
- **Bug encontrado al aplicar (PASO 5/6):** `UPDATE ... FROM LATERAL` referenciaba la tabla target (`p`) — PostgreSQL no lo permite. La mig falló atómicamente (BD intacta). **Fix:** envolver el `LATERAL` sobre una instancia separada (`p2`/`pm2`) + JOIN por PK. Re-aplicada OK.
- **Resultado:** 14 microzonas activas, macro desactivado, 520 props + 73 pm redistribuidos (0 en gaps), trigger HITL → `pendiente_zona_norte` (149 migrados), **CHECK 5 EQ diff=0 (sin bandera roja)**.
- **Hallazgo de datos:** 3 props anómalas (843/1018 `microzona='Sin zona'`, 1942 `NULL`) que el rollback estándar dejaría mal → **parcheado el rollback (PASO 2b)** + cubierto por el backup dirigido.
- **Pre-test que de-riesgó CHECK 3:** las 520 props testeadas contra los 14 WKT antes de aplicar → 0 en gaps confirmado.
- **Commit:** `3a8309f` (local).

### FASE 2-4 — v4 snapshot DESCARTADO (no era necesario)

Al preparar la mig 255 (snapshot v4 paralelo), **dos hallazgos** llevaron a descartar el enfoque:

1. **Bug de duplicación (LOOP 1):** el `INNER JOIN zonas_geograficas` de v4 duplicaba props de `Equipetrol Norte` (**2 polígonos, mismo nombre** en `zonas_geograficas`) → conteos inflados (+6/+18/+13/+3 por dorm). Fix conocido: `IN`-subquery.

2. **🔴 Bloqueante de diseño:** la unique constraint `(fecha, dorm, zona)` **no incluye `filter_version`**. v3 (fv=3) y v4 (fv=4) no pueden coexistir en `zona='global'` — el `ON CONFLICT` de v4 pisaría la serie de producción que consumen `/admin/market` **y el feed público** `/mercado/equipetrol/ventas`. La "paralelización" del Camino B era inviable sin tocar tabla + función nocturna v3 + 2 frontends (uno público).

**Decisión (con el director):** descartar v4 y la paralelización. Razones:
- La paralelización de 14 días existía para **ganar confianza** en el enfoque dinámico. Esa confianza se obtuvo en minutos vía **validación compute-only** (query readonly, cero escritura): **paridad EQ exacta diff=0** en activas/absorbidas/pending/nuevas × 4 dorms. El `IN`-subquery también quedó validado.
- La función **v3 actual, sin cambios, ya genera las series por-microzona ZN** (su LOOP 2 itera `DISTINCT zona`). Verificado: **12 microzonas ZN con venta `completado`** → 12 series al reactivar el cron. La serie ZN tendría 379 activas (48/180/106/45 por dorm).
- ⇒ Snapshot de Zona Norte **cubierto sin escribir una línea de SQL nuevo**. Solo falta reactivar el workflow de auditoría.

**Lo único que v3 no hace:** un agregado `'global_zona_norte'`. Eso pasa a **ticket #12** (no bloqueante; se resuelve con cambio mínimo y aislado cuando lo pida el frontend ZN #6).

- **mig 255:** marcada `⚠️ NO APLICAR — DESCARTADA` en su header (se conserva como registro del intento + el fix del JOIN).
- **Deuda menor anotada:** `Equipetrol Norte` tiene 2 polígonos en `zonas_geograficas` — inofensivo hoy (nadie hace JOIN-por-nombre en prod; todo es `ST_Contains`/`LIMIT 1`), pero conviene revisar si deberían fusionarse.

### Lección meta del día

**Validar contra la BD real antes de aplicar revela lo que el plan optimista oculta.** Dos defectos (LATERAL sobre target, y constraint sin filter_version) estaban en migraciones "cerradas tras revisión senior" que **nunca se ejecutaron**. La condición del director ("solo si no daña producción") fue la que forzó verificar la constraint **antes** de correr v4 — sin eso, se habría pisado el feed público. Y la validación compute-only mostró que toda la maquinaria de paralelización (14 días) sobraba para el riesgo real.

### Próximo paso

FASE 5-7 (no dependen del snapshot): `lib/zonas.ts` (14 microzonas en filtro admin) → workflows n8n ZN (array de microzonas) → docs. **Reactivar el workflow `auditoria_diaria_sici_v3.0`** en n8n (se desactivó para la ventana de migración).

---

## 30 May 2026 — Cierre end-to-end del ticket #8 (predicción v3 → hecho verificado)

Sesión de **verificación** tras la primera corrida nocturna completa post-mig 254. El 29-may quedó como **predicción** que "v3 sin cambios genera las series por-microzona ZN" (justificación para descartar v4). Hoy quedó **confirmado con datos reales**.

### Lo verificado

- **14 microzonas en producción**, branch `feat/zn-microzonas-aplicacion` mergeada a `main` (merge commit `ad22b24`, PR #1). FASES 5-7 aplicadas (`lib/zonas.ts` con las 14 microzonas, workflows discovery ZN con array de microzonas, docs).
- **Pipeline nocturno completo sin errores.** El ciclo 1:15-9:00 AM corrió 100% automático.
- **Snapshot generando las 14 series por-microzona ZN** — la función `snapshot_absorcion_mercado()` v3, **sin una línea de SQL nueva**, las produjo vía su LOOP 2 (`DISTINCT zona`). Esto cierra la predicción del 29-may: la maquinaria de paralelización v4 + 14 días de observación pasiva nunca fue necesaria.
- **EQ intacto, sin contaminación** (blindaje 2 sigue firme: `global` Equipetrol no incluye microzonas ZN). Branches limpias.

### Estado del ticket #8

**100% aplicado y validado en producción.** Lo único que v3 no produce es el agregado `'global_zona_norte'` → queda en **ticket #12** (no bloqueante, se resuelve cuando lo pida el frontend ZN #6). Tickets de seguimiento **#12 / #13 / #14** documentados, todos baja prioridad.

### Lección meta del día

**La validación compute-only del 29-may predijo bien, pero el cierre honesto exige confirmar con la corrida real.** El riesgo de la predicción no era el cómputo (ya validado readonly), sino que algún efecto del pipeline nocturno completo (discovery → enrichment → merge → matching → snapshot encadenados) revelara un borde no contemplado. No lo hubo. Convertir "debería funcionar" en "funcionó" cuesta una corrida y un check — y es la diferencia entre cerrar un ticket y dejarlo abierto disfrazado de cerrado.

### Próximo paso

Roadmap sin cambios respecto al 29-may: **#6 frontend `/mercado/zona-norte`** (prototipo multi-macrozona, privado por token) y **#7 alquiler** (replicar patrón). #1.7 detector automático de clusters en paralelo. Los 3 tickets nuevos (#12/#13/#14) no bloquean.

---

## 30 May 2026 (continuación) — Auditoría Fase 4 alquiler ZN: el motor ya procesa ZN solo + 2 hallazgos en prod

**Origen:** elegido #7 (alquiler) como siguiente ticket. El director marcó —con razón— que el pipeline de alquiler es **separado** del de venta (Regla 6) y pidió **investigar antes de planear** + ver los verificadores. Se hizo auditoría contra producción (no supuestos) y export de funciones con `pg_get_functiondef` (Regla 7).

### Hallazgo central: #7 NO es "replicar el pipeline de venta"

El pipeline alquiler **ya procesa Zona Norte solo**: Remax alquiler trae todo Santa Cruz → el trigger `trg_asignar_zona_alquiler` (mig 232) zonifica a microzonas ZN → enrichment/merge/verificador/HITL son zone-agnostic y ya funcionan. **31 props ZN alquiler en `completado`** (30 Remax + 1 C21), solo 2 pending. El agente de mapeo fue alarmista (predijo masacre nocturna); prod lo desmintió.

**El "BUG #1 de venta" (marcar ausentes sin filtro de zona) es benigno en alquiler:** al revés que venta. Remax trae todo SC → las props ZN están en el scrape → no se marcan ausentes. En venta C21 usaba bbox y las excluía.

### Doble-check senior (leyendo las funciones de prod) — 2 hallazgos reales

1. **🔴 El snapshot global de alquiler NO está blindado por zona → Equipetrol está contaminado HOY.** `snapshot_absorcion_mercado` LOOP 1 (`zona='global'`) blinda venta a las 6 zonas EQ pero **el bloque de alquiler no tiene filtro de zona** (el propio comentario lo admite). → `alquiler_activas`/`mediana`/`roi` del global cuentan las 31 props ZN junto con EQ. Eso alimenta `/admin/market-alquileres` **y el feed público `/mercado/equipetrol/alquileres`**. **El yield "de Equipetrol" ya está sucio con ZN.** Inverso al riesgo que buscábamos: el fix LIMPIA EQ, no lo amenaza. Además el LOOP 2 por-zona escribe `alquiler_*=NULL` literal → **ninguna zona (ni EQ) tiene serie de alquiler por-zona**.

2. **🔴 `matchear_alquiler` Tier 1/2 auto-aprueban sin guard GPS ni zona.** El auto-approve aplica `UPDATE id_proyecto_master` directo, **no pasa por `matching_sugerencias`** → el trigger HITL separador (mig 254) no lo intercepta. Caso real: prop **2307** (alquiler "Condominio Portobello Isuto") → Tier 1 exact → pm **269** a **3.1 km**, microzona distinta. Ventas 2107/2108 (mismo nombre) también a ~4 km del mismo pm. pm 269 absorbe 3 clusters dispersos. "ISUTO" = desarrolladora con homónimos. **No se corrige a ciegas** (lección 24-may) → HTML de verificación visual generado.

### Diseño del fix (NADA aplicado)

- **FIX A (snapshot):** A1 blindar bloque alquiler global a 6 zonas EQ (limpia contaminación EQ); A2 computar alquiler en LOOP 2 por-zona (additive, da serie ZN + EQ-por-zona). **In-place sobre v3** — A1 solo quita contaminación del global, A2 solo llena NULLs; ninguno toca la serie de venta. No hace falta v4 (misma lógica que cerró #8).
- **FIX B (matching):** B1 guard de distancia (>800m) en auto-approve Tier 1/2 → degradar a HITL (atrapa Portobello sin romper same-building); B2 cleanup del falso 2307 tras verificación visual. ⚠️ B1 toca EQ también → medir distribución de distancias en matches EQ auto-aprobados antes de aplicar (cuidado GPS de agente desplazado, igual que ticket #13).
- **Cobertura C21+BI ZN:** opcional; Remax ya trae el grueso.

### Artefactos producidos

| Archivo | Estado |
|---|---|
| `docs/proyectos/zona-norte/AUDITORIA_Y_FIX_ALQUILER_ZN.md` | NUEVO — auditoría + diseño fix + doble-check senior + plan implementable 7 pasos |
| `docs/proyectos/zona-norte/verify-portobello.html` | NUEVO — mapa Leaflet satelital, 3 pm + props, distancias, links Maps/Street View |
| BACKLOG #7 | reformulado (de "replicar pipeline" → "snapshot + matching + cleanup") |

### Lección meta del día

**Medir antes de construir/planear** (otra vez). El título "#7 = replicar pipeline alquiler" implicaba duplicar 3 workflows + funciones. La BD mostró que el motor ya procesa ZN y que el trabajo real es otro — y que **Equipetrol ya tiene una contaminación de yield que nadie había visto** hasta leer la función de prod. El doble-check senior sobre código real (no docs) destapó lo que el plan optimista ocultaba, igual que en #8.

### Próximo paso

Decidir con el director: (a) verificación visual Portobello, (b) aplicar FIX A (net-positivo para EQ), (c) medir antes de FIX B1. Pasos 1-3 del plan son bajo riesgo y mejoran Equipetrol.

---

## 30 May 2026 (continuación 2) — Cleanup familia Portobello/Stone/Praga (FIX B2 aplicado)

**Origen:** verificación del falso match Portobello (prop 2307 a 3.1 km del pm 269) que destapó la auditoría Fase 4. Se generó HTML satelital (`verify-portobello.html`) + se cruzaron las **URLs/slugs de los avisos** (fuente más confiable del nombre, lección 28-may). El director verificó GPS en terreno.

### Hallazgo: el pm 269 "Portobello Isuto" absorbía 3 edificios distintos por el agujero del Tier 1

`matchear_alquiler` Tier 1 (exact lookup) auto-aprueba por nombre **sin mirar GPS** → el pm 269 se comía cualquier prop con nombre "Portobello…". Las URLs lo desmienten:
- **Portobello 6** (slug c21 `portobello-6`, pre-venta) — props 2107/2108, a ~4 km del pm 269.
- **Stone By Portobello** (alianza desarrollador Stone + Portobello) — props 2228/2307/2387 + 2323 (estaba mal en pm 268 STONE 4).
- **Portobello Isuto real** (slug `canal-isuto`/`portobello-isuto`) — los 4 que quedaron bien en pm 269.

Es la **familia numerada del desarrollador** (Portobello 5 "V" pm 248, 6, 7, Green pm 326, Isuto pm 269) + alianza Stone, dispersa por la ciudad. Mismo patrón K1 de venta (loop self-reinforcing: match falso → merge pisa `nombre_edificio` con `pm.nombre_oficial`).

### Verificación por el director (GPS de terreno)

- Portobello 6: `-17.74812, -63.15608` (2107/2108 a 7-14m).
- Condominio Stone By Portobello: `-17.73650, -63.17439` (2323@28m, 2228@113m). **2307 (843m) y 2387 (2.571m) tienen GPS de agente desplazado** — confirmados por la descripción del aviso, no por GPS.
- Edificio Praga: `-17.75105, -63.15522` (prop 2332, sin nombre en BD, a 7m).

### Aplicado (DO block transaccional desde Supabase UI — `cleanup-portobello-stone-praga-30may.sql`)

- **3 pm nuevos:** Portobello 6 (#421), Condominio Stone By Portobello (#422), Edificio Praga (#423). Todos `gps_verificado_visual='confirmed'`, microzona vía `get_zona_by_gps`.
- **7 props reasignadas** + candado `nombre_edificio`; candado **adicional de `id_proyecto_master` en 2307 y 2387** (GPS desplazado → que ningún recálculo nocturno las robe por cercanía).
- pm 269 limpio (4 Isuto reales); pm 268 STONE 4 soltó 2323.

### Lección meta (refuerza las del 28-29 may)

1. **El slug/URL del aviso > GPS > nombre en BD.** El nombre en BD estaba pisado a "Portobello Isuto" por el merge; el slug decía "portobello-6". Las URLs resolvieron lo que el GPS y el nombre BD no podían.
2. **Tier 1 exact sin guard GPS es el agujero estructural** (→ FIX B1 del doc de auditoría, pendiente con carve-out por nombre). Este cleanup es el parche de datos; el fix de raíz sigue en backlog.
3. **GPS de agente desplazado hasta 2.5 km** — el candado de `id_proyecto_master` es obligatorio en estos casos, no opcional.

### Pendiente menor

- Prop **800** (`nombre="ISUTO"`, alquiler `inactivo_confirmed`) sigue en pm 269 — nombre genérico de la desarrolladora, ambiguo. Inactiva → no contamina. Sin urgencia.

### Próximo paso

FIX B2 cerrado. Queda **FIX A (snapshot alquiler)** — el de bajo riesgo y net-positivo para EQ — y, más adelante, FIX B1 (guard GPS en `matchear_alquiler`) con el carve-out por nombre que pidió el doble-check.

---

## 30 May 2026 (continuación 3) — FIX A aplicado y validado (mig 256)

**`sql/migrations/256_snapshot_alquiler_zonas.sql`** aplicada (`CREATE OR REPLACE` + `SELECT * FROM snapshot_absorcion_mercado()` para regenerar el día). Dos cambios sobre `snapshot_absorcion_mercado`, ambos sin tocar la lógica de venta:

- **A1 — Blindar el alquiler global a las 6 zonas EQ.** El bloque de alquiler del LOOP 1 no filtraba zona → el yield global mezclaba ZN con EQ. Ahora replica el blindaje de venta.
- **A2 — LOOP 3 nuevo: serie de alquiler por-zona.** Antes el LOOP 2 escribía `alquiler_*=NULL`; ahora un loop separado computa alquiler por zona (precio `bob/6.96`, regla 10) vía `ON CONFLICT DO UPDATE` solo de columnas alquiler. Itera zonas de **alquiler** (no de venta) → cubre microzonas ZN con alquiler y 0 venta (bug de cobertura C4 evitado). ROI cruzado lee `venta_ticket_mediana` de la fila del LOOP 2.

### Diseño guiado por el doble-check senior

El revisor adversarial encontró 3 errores en el diseño original (documentados en `AUDITORIA_Y_FIX_ALQUILER_ZN.md` §0): el "feed público contaminado" era **falso** (nadie consume las columnas de alquiler del snapshot → A1 es higiene, no urgencia), el impacto era 1-5% (no 30-50%), y A2 tenía un bug de cobertura. La versión aplicada incorpora las 3 correcciones. **LOOP 3 separado = cero cambio a venta** (máximo aislamiento a EQ producción).

### Validación (compute-only antes + post-ejecución)

| Check | Resultado |
|---|---|
| A) Global alquiler blindado | 72/50/40/9 → **61/41/36/6** (saca ~29 props ZN); mediana +1-5% |
| B) Microzonas ZN con alquiler + ROI | 10 celdas pobladas (antes NULL); ROI cruzado OK (ej 4to-6to Banzer-Alemana 1d: $575, ROI 10.55%) |
| C) Venta intacta | venta_activas 29→30may = variación normal de discovery, sin quiebre |

Las 2 celdas ZN de 4 dorms quedan fuera (loops `0..3`, igual que venta — C5, no regresión).

### Estado del ticket #7

- ✅ Auditoría Fase 4 (motor ya procesa ZN solo).
- ✅ FIX B2 (cleanup Portobello/Stone/Praga, 3 pm + 7 props).
- ✅ **FIX A (mig 256)** aplicado y validado.
- ⬜ **FIX B1** (guard GPS en Tier 1 de `matchear_alquiler` con carve-out por nombre) — requiere medir los ~15 matches EQ >800m antes. Único pendiente del #7.
- 🟡 Cobertura C21+BI ZN — opcional (Remax ya trae el grueso).

### Lección meta

El doble-check independiente **pagó dos veces**: desinfló una urgencia falsa (global sin consumidor) y atrapó un bug de cobertura que habría dejado sin serie a las microzonas ZN chicas — las que el ticket quería poblar. Validar el diseño con un revisor que no lo escribió, + validación compute-only antes de aplicar, hizo que la aplicación fluyera sin sorpresas (mismo patrón que cerró #8).

---

## 30 May 2026 (continuación 4) — Corrección: alquiler ZN NO está cerrado (falta el discovery dedicado)

**Trigger:** el director cuestionó el "fase cerrada" de la continuación 3: *"no está nada en producción para C21 y BI; Remax no necesitaba discovery/enrichment/merge nuevos... hay algo raro acá."* Tenía razón. Investigación de los workflows reales confirmó la asimetría.

### La asimetría venta vs alquiler en el discovery ZN

- **Venta ZN:** workflows `_zonanorte` dedicados (Remax/C21) que traen todo SC + filtran por polígono ZN + filtran zona en "marcar ausentes" (`fb78d23`). Base sólida.
- **Alquiler ZN:** **NO existe ningún workflow `*_alquiler_zonanorte`.** Las 30 props Remax entran **de colado**: el discovery Remax alquiler de Equipetrol usa el slug `equipetrolnoroeste` que la API de Remax no filtra efectivamente → devuelve todo SC → el trigger GPS (mig 147b) las etiqueta `Zona Norte`. **Accidental, no diseñado.**
- **C21 alquiler:** grid de coordenadas fijo en Equipetrol → no llega a ZN (0-1 props). **BI alquiler:** filtra `barrio=equipetrol` → 0 ZN.

### Riesgo confirmado (bug #1 latente en alquiler)

Los 3 discovery de alquiler tienen el "marcar ausentes" **sin filtro de zona** — el mismo bug que venta resolvió en `fb78d23`, abierto en alquiler. Ya visible: **1 C21 ZN + 1 Remax ZN en `inactivo_pending`** (props que el discovery no re-encuentra y marca ausentes). Inofensivo con 30 props; deuda con volumen.

### Corrección del estado

- **Cerrado de verdad:** el *procesamiento* (snapshot FIX A + matching + cleanup FIX B2).
- **NO cerrado:** la *captura/discovery* de alquiler ZN. Es parcial (solo Remax) y frágil (depende de que el slug roto de Remax siga devolviendo todo SC). → **ticket #7.1** (nuevo en BACKLOG): Fase 3 alquiler ZN = 3 workflows discovery dedicados + arreglar el "marcar ausentes" con filtro de zona. FIX B1 va dentro de ese paquete.

### Lección meta

**Cuidado con declarar "cerrado" lo que en realidad es "procesa lo poco que entra de colado".** El error fue clasificar la cobertura de discovery como "opcional 🟡" en vez de "la base de producción que falta". El director, que no es dev, lo detectó por sentido común del negocio ("¿por qué venta sí y alquiler no?"). Mismo valor que el "¿es escalable?" del #8: las preguntas ingenuas del dueño exponen deuda que el plan optimista esconde. Salvedad: repo puede diferir de prod (drift n8n) — el diagnóstico se sostiene igual porque los datos de la BD (30 Remax / 1 C21 / 0 BI + pendings) confirman el comportamiento real.

---

## 30 May 2026 (continuación 5) — Panorama del enjambre + plan #7.1 + catch de método (extrapolación EQ→ZN)

**Panorama del enjambre alquiler (3 subagentes en paralelo):** enrichment, merge y verificador **zone-agnostic confirmado** — no hay más hardcodes EQ como el del discovery. Solo ajustes menores de throughput (LIMITs) + verificaciones de drift n8n. El único agujero estructural es el discovery.

**Plan #7.1 redactado** (`PLAN_FASE3_DISCOVERY_ALQUILER_ZN.md`) + doble-check senior que podó over-engineering (no blindar 3 discovery EQ sino donde haga falta; Remax = patch no workflow nuevo; LIMITs condicionales).

### 🔴 Catch de método del director (corrige a mí Y al doble-check)

Tanto mi plan como el revisor priorizaron portales por el **volumen de alquiler en Equipetrol** (C21 121 > Remax 22 > BI 2) → "C21 core, BI descartable". **El director lo marcó: el mix de portales cambia por zona; no se infiere ZN desde EQ.** La evidencia ya lo gritaba: en ZN es Remax 30 vs C21 1 (opuesto a EQ). Y ese dato ZN está **sesgado** (solo Remax llega a ZN por el slug roto; el 1 de C21 / 0 de BI miden nuestra captura, no el inventario del portal).

**Corrección aplicada al plan (§0.1):**
- Se cae "C21 es la fuente #1 de ZN" y "BI descartable" — eran extrapolaciones de EQ.
- Se agrega **Fase 0a: spike de inventario alquiler ZN por portal** (consultar los portales por el polígono ZN, como el PoC de venta del 20-may). Ese dato decide alcance.
- **Por defecto: clonar los 3** (postura del director), sin descartar ninguno sin el spike.
- Lo que SÍ se sostiene (no depende del mix por zona): el bug marcar-ausentes + su fix, el riesgo-EQ-nulo del filtro, el zone-agnostic del core.

### Lección meta

**Sesgo de extrapolación zona-a-zona.** Usé Equipetrol como proxy de Zona Norte para dimensionar portales — inválido, y el dato disponible ya lo contradecía. Tercer catch del dueño en la sesión (tras "¿es escalable?" del #8 y "¿por qué venta sí y alquiler no?"): las preguntas de negocio del director exponen fallas de método que ni yo ni un revisor adversarial agarramos cuando ambos compartimos el mismo dato sesgado. **Antes de dimensionar/priorizar por zona, medir esa zona — no otra.**

---

## 30 May 2026 (continuación 6) — Spike Fase 0a ejecutado: el dato real reescribe la prioridad

**`scripts/poc-zona-norte/spike-alquiler-zn.mjs`** (nuevo, clon del PoC de venta para alquiler; fetch directo a los 3 portales sobre el polígono ZN de 14 microzonas; costo $0, no toca BD). Resultado del inventario alquiler ZN por portal:

| Portal | Tiene en ZN | Capturamos (BD) | Gap |
|---|---|---|---|
| **C21** | **89** | 1 | **88** |
| Remax | 31 | 30 | ~1 |
| BI | 2 | 0 | 2 |
| Total | ~122 | ~31 (25%) | ~91 |

**Lo que el spike destapó (que ni EQ ni la BD mostraban):**
- **C21 es la fuente #1 de alquiler en ZN (89), y la perdemos casi entera** (su grid fijo EQ no llega a ZN → capturamos 1 de 89). El gap total de alquiler ZN es ~91 props, y el **97% es C21**.
- La BD decía "Remax dominante" (30 vs 1) — **sesgo de captura**, no realidad del mercado. Remax domina lo *capturado* solo porque es el único con discovery que llega a ZN.
- Calidad: Remax 31/31 completo; C21 89/89 con precio/área pero 37 sin dorms (enrichment los completa); BI 2 sin área.

**Prioridad del plan #7.1 reescrita con dato de ZN:** (1) C21 ZN grid = prioridad 1 (el gap real), (2) Remax patch = robustez no cobertura (ya tenemos 30/31), (3) BI descartado (2 props). El spike también confirma el **total de mercado de alquiler ZN (~122)** vs EQ — dato de producto, no solo de pipeline.

**Meta:** el método del director (medir ZN, no extrapolar) no solo evitó un error de priorización — cuantificó que estábamos capturando 1 de cada 4 alquileres de ZN, con el grueso del agujero en un portal (C21) que la BD hacía ver como irrelevante. **Pendiente:** Fase 0b (drift n8n, UI en vivo) + implementación. Sin aplicar nada en esta sesión.

---

## 30 May 2026 (continuación 7) — Verificación BI + corrección "los 3 portales"

**Dos catches más del director:**

1. **"Te pusiste bizco priorizando — voy a hacer los 3 portales igual."** Tenía razón: estuve rankeando/descartando (C21 sí, BI no) cuando su decisión ya era clonar los 3. El spike **no es para descartar** — sirve para dimensionar el mercado ZN (~122) y validar captura. Corregido en plan + backlog: **se clonan los 3** (C21/Remax/BI), el ranking es solo color.

2. **"Creo que hay un error en validar BI, no se capta bien la cantidad."** Sospecha válida — verificada con `scripts/poc-zona-norte/diag-bi-alquiler.mjs`. **NO hay error de captura:** las 16 BI alquiler tienen GPS 100% (mi hipótesis de "GPS faltante" quedó refutada), y el endpoint anda perfecto (**BI da 233 venta vs 16 alquiler** — si fuera bug del script, venta también daría poco). **BI es venta-pesado**: casi no lista alquileres (16 en todo SC, ~2 en ZN). El 2 es real. La duda valió la pena chequearla aunque la conclusión sea "no hay error".

**Meta (4to/5to catch de la sesión):** tiendo a optimizar/priorizar/descartar cuando la decisión del dueño ya es "hacer todo" — sobre-ingeniería de la decisión, no solo del código. Y una corazonada de error (GPS BI) hay que verificarla con dato (233 vs 16 lo cerró), no asumirla para complacer la sospecha. El dato manda en ambas direcciones: validó "medir ZN" y refutó "error en BI".

---

## 31 May 2026 — Plan #7.1 implementado: discovery C21 alquiler ZN (Paso 1) end-to-end ✅

**Contexto:** Lucho exportó los 8 workflows de alquiler de prod (`Flujos 31.05.26/`). 3 subagentes los analizaron sin gastar contexto (plantilla venta ZN / discovery alquiler EQ / core). Hallazgos que ajustaron el plan:
- **Fase 0b (drift n8n) resuelta sin abrir la UI** — los exports SON prod. Confirmado: enrichment v2.1.0, verificador v2.0.0 (`followRedirects:false`), merge v1.0.0, los 3 **zone-agnostic** (no se tocan).
- **Corrección de orden:** el blindaje EQ va **emparejado** con el clon, no después (si no, el EQ tumba las props ZN esa misma noche).
- **Remax (para Paso 4):** el clon usa el endpoint todo-SC de la plantilla venta + nodo "Filtrar Solo Alquileres", NO el slug `equipetrolnoroeste`.

**Tres preocupaciones del director, todas verificadas con datos (PostGIS + BD) antes de tocar nada:**
1. **¿Remax todo-SC se cuela fuera de ZN?** No. Fetch amplio + filtro point-in-polygon (mismo mecanismo que venta ZN en prod). Lo que entra a la BD ya pasó el polígono. Fail-closed.
2. **¿Esparcimiento/solape EQ↔ZN?** Las zonas **no se solapan en área** (overlap 0 km², solo comparten frontera). ZN es 60 km² vs 2.5 de EQ (24×). El grid de fetch hardcodeado del C21 EQ sí se mete 1.46 km² en ZN (3 microzonas) = **redundancia de fetch inofensiva** (UPSERT idempotente), neutralizada por el blindaje. NO se agrega filtro de polígono al EQ (viola strangler).
3. **¿Las props EQ usan los nombres de microzona o "Equipetrol" genérico?** Todas usan nombres de microzona exactos (`Equipetrol Centro/Norte/Sirari/Oeste/Villa Brigida`). **Cero sin match.** El blindaje `zona IN (… zona_general='Equipetrol') OR zona IS NULL` matchea las 167 props EQ sin perder ninguna. Las únicas NULL activas son 6 `excluida_zona` (se comportan igual que hoy).

**Implementado (Pasos 1-3 del plan #7.1):**
- **Clon** `n8n/workflows/alquiler/flujo_discovery_c21_alquiler_zonanorte_v1.0.0.json` — esqueleto geográfico de venta ZN (grid dinámico desde polígonos, point-in-polygon, ARRAY['Zona Norte'] parametrizable) + extracción/registro de alquiler del C21 EQ (`precio_mensual_bob`, `registrar_discovery_alquiler`). Cron 1:35 AM. Verificados los 6 nodos que tocan la BD + el contrato de datos entre nodos.
- **Blindaje** del C21 alquiler EQ (`flujo_discovery_c21_alquiler_v1.0.0.json`) — filtro de zona en "Obtener Alquileres Activos BD". Aplicado en prod por Lucho y reflejado en el repo.

**Corrida de validación (manual, costo $0 — C21 no usa Firecrawl en discovery):**
- Discovery clon: snapshot 88, **83 nuevas / 5 actualizadas / 0 ausentes marcadas**, las 14 microzonas. Pasamos de 1 a 88 props C21 alquiler ZN — el gap del 97% cerrado.
- Calidad: 82 nuevas con precio/GPS/zona/área al 100%.
- Enrichment (2 lotes, LIMIT subido temporal y revertido a 20): **79/83 enriquecidas**, dorms completados al 100% en las procesadas. 4 rebotaron en Firecrawl → re-intento automático nocturno.
- **proyectos_master ZN: 76 disponibles** → enrichment con contexto "PROYECTOS CONOCIDOS" + matching habilitado (el caveat no aplica).

**Pendiente:** activar cron del clon → validar 1ra nocturna conjunta (clon 1:35 + EQ blindado 1:30 + merge + matching; confirmar 0 props ZN tumbadas por el EQ + las 4 enrichment) → **Paso 4 (Remax ZN)** → Paso 5 (BI ZN). Merge/matching corren esta noche (zone-agnostic, ya verificados).

**Remax (Paso 4, misma sesión):** clon `flujo_discovery_remax_alquiler_zonanorte_v1.0.0.json` (endpoint todo-SC + nodo "Filtrar Solo Alquileres" + polígono, **NO slug**; conversión moneda USD↔BOB del fix abr-2026; cron 1:50) + blindaje del Remax EQ (mismo patrón que C21). Corrida manual: API 536 → 110 alquileres → **30 en ZN; 0 nuevas / 30 existentes / 0 ausentes** — esperado, porque Remax ya capturaba ZN de colado (su slug `equipetrolnoroeste` devuelve todo SC); el clon es **robustez** (no depende del slug roto), no cobertura nueva. **Alquiler ZN activo pasó de ~31 a 113 props** (83 C21 + 30 Remax). 2 props Remax sin `precio_mensual_bob` (calidad menor del portal, no del clon). El Remax EQ (slug roto) y el clon registran las mismas 30 ZN — redundancia inofensiva (UPSERT idempotente); el blindaje evita el marcado-ausente cruzado. NO se toca el slug del EQ (strangler). Falta **BI (Paso 5)** + validar nocturna conjunta.

**Sobre el matching (decisión del director):** el match rate de alquiler ZN es bajo (~23% en las completadas, vs ~60% EQ) porque `proyectos_master` ZN es ralo (76 pm / 60 km² vs 250 / 2.5 km² en EQ). **No es bloqueante** — el matching se resuelve después con auditoría + creación de pm, y **más volumen ayuda** (props con GPS similares forman clusters → asignación/creación de pm más fácil, ticket #1.7). Diagnóstico de las sin-match: ~44 tienen pm a ≤100m (matching débil, mejorable / FIX B1) + ~42 sin pm cerca (crear el proyecto). El batch manual de pm se arma con el universo completo post-nocturna. Las props sin match igual se muestran en el feed (el match solo agrupa por edificio + habilita estudio por proyecto).

**BI (Paso 5, misma sesión) — LOS 3 PORTALES CERRADOS.** Clon `flujo_discovery_bien_inmuebles_alquiler_zonanorte_v1.0.0.json` (POST único sin grid; filtro client-side `nomb_barri='equipetrol'` **reemplazado por point-in-polygon GPS** + nodos Leer Polígonos/Calcular BBox de la plantilla; cron 2:40) + blindaje BI EQ. Corrida manual: 16 catálogo SC → **2 en ZN**; 1 nueva legítima (id 2577) + reclamo de 1385 (edge case, abajo).

**Sospecha del director ("muy pocos alquileres BI en ZN, investigar la API"):** verificada con variaciones del endpoint (costo $0). **REFUTADA con dato:** el endpoint trae TODO lo que BI tiene. `id_fami=0` (todas las familias) = 16, igual que `id_fami=1`; `filas=500` → sin paginación oculta; sin modalidad = 251 (232 venta + 16 alquiler + solapamiento). BI es **estructuralmente venta-pesado** (232 venta vs 16 alquiler en todo SC). Los 16 alquiler dispersos por barrio BI: Urubó 4, Centro 2, Equipetrol 2, resto 1 c/u (Hamacas, Plan 3000, varios anillos) — solo 2 caen en el polígono ZN. **Bonus: 4 alquileres BI en Urubó** → el mismo clon multi-macrozona los captura cuando se active esa macrozona (ADR-009).

**Edge case prop 1385 (Ed. Europeo):** BI manda GPS errado (3 km al norte → cae en polígono ZN), el clon la reclama por usar el GPS crudo del portal (no el corregido de la BD). Investigada `registrar_discovery_alquiler` (Regla 7, def de prod): `metodo_discovery` y `status` se pisan SIEMPRE (ignoran `campos_bloqueados`) → **NO existe candado por-campo que corte el re-reclamo** (la idea de candar `metodo_discovery` resultó inviable). PERO **daño NULO**: la función NO resetea `fecha_enrichment` (sin re-enrichment, sin costo), y `lat/lon/area/id_proyecto_master` están bloqueados + el clon manda `p_zona=null` → zona sigue `Equipetrol Norte` correcta, coords intactas. El re-reclamo es ruido de cero costo: `status` oscila `completado↔actualizado` + re-merge idempotente. **Decisión: aceptar + documentar** (no tocar la función ni hardcodear exclusión — desproporcionado para 1 prop de impacto cero). Si aparecen varias props con GPS errado de BI, reevaluar.

**Total alquiler ZN: 115 props activas (83 C21 + 30 Remax + 2 BI). Los 3 portales con discovery dedicado multi-macrozona + blindaje EQ par.** Pendiente: validar nocturna conjunta (los 6 workflows: 3 clones ZN + 3 EQ blindados + merge + matching) + batch manual de pm.
