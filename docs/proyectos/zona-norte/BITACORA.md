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
