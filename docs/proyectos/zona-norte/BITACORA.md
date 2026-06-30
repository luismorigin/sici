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
3. **`resumen_mercado()` y `buscar_propiedades()` hardcodean 5 zonas EQ** (falta 'Eq. 3er Anillo' — bug latente preexistente). Documentado para ticket #11.
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

## 16 Jun 2026 — Matching: aprobar sugerencias atascadas + 7 pm nuevos (venta 79.9%→85.8%, alquiler 79.6%→83.3%)

**Punto de partida (medido en BD):** venta 79.9% (314/393), alquiler 79.6% (82/103).

**Hallazgo central — el cuello de botella NO es cargar pm.** El matching automático ya genera sugerencias, pero quedan atascadas en `matching_sugerencias.estado='pendiente_zona_norte'` (ZN sin UI de aprobación HITL, por diseño — mig 254). Había **43 sugerencias en limbo** solo para las 37 props-con-nombre sin match. El trabajo es **revisar y aprobar**, no cargar edificios.

**Diagnóstico:** (1) separar sin-match con nombre vs sin nombre; (2) pm más cercano por `ST_DistanceSphere` (LATERAL); (3) cruzar contra la cola `pendiente_zona_norte`. **Trampa confirmada:** el score más alto a veces apunta al pm equivocado (prop 1996 "Ziri" → el motor sugería "CONDOMINIO ONE" score 85, cuando el correcto era "ZIRI ZWEI" a 6 m, score 60). **El GPS desempata.**

**Aplicado** (UPDATE directo con `metodo_match='auditor_zn_16jun'`, **nunca** `aplicar_matches_aprobados` por el bug del loop K1):
- **Venta:** Tier 1 (8 props nombre+GPS≤80 m), Tier 2 (4 con alias Rise/Ares), recuperados del enrichment (2411 Ares, 1984 Macororó 16/17).
- **Alquiler:** 5 matches (Lofty Green, Ares, Baruc, Tamisa III + pm nuevo).
- **7 pm nuevos** (GPS verificados por el director en Maps, `gps_verificado_visual='si'`): 500 Edificio Baruc Norte, 501 Edificio Macororó 13/14, 507 Sono Los Cusis, 508 Ibiza Deluxe Residence, 509 Torre Soho, 510 Yas Dahi, 511 Trivento III.

**Resultado:** venta **85.8%** (56 sin match), alquiler **83.3%** (17 sin match).

**Hallazgos colaterales:**
1. **Feed: INNER vs LEFT join.** `/ventas` (`buscar_unidades_simple`) usa **INNER JOIN** → las props sin match **no aparecen** (subir el match rate = inventario visible). `/alquileres` (`buscar_unidades_alquiler`) usa **LEFT JOIN** → sí aparecen, con `nombre_edificio || nombre_proyecto || 'Departamento'`.
2. **"Gap enrichment→columna" investigado y DESCARTADO.** La columna `nombre_edificio` sí se llena (incluso con basura de baja confianza). Alcance del "fix" global = ~6 props; tocaría el merge único → Equipetrol prod. Riesgo >> beneficio. **No hacer.**
3. **9 `nombre_oficial` feos limpiados** (mayúsculas/typo: Maré, Sky Luxia, Omnia Prime, Macororó 5, Elite Sirari, etc.) → mejora directa del feed de **ventas** (muestra `nombre_oficial`). Dejados como están las marcas legítimas en mayúsculas (INIZIO, SAOTA Park, T-VEINTICINCO). Lección: priorizar `nombre_oficial` en el feed expone la calidad de capitalización de `proyectos_master`.
4. **GPS de portal a veces roto** (prop 2757 "Tamisa 3" a 729 m del edificio real) → matcheada por nombre; pendiente auditar otros casos.

**Cambio de frontend asociado** (branch aparte `feat/nombre-generico-alquiler`): helper `nombreAlquiler()` → cards de alquiler sin nombre muestran "Monoambiente / Depto N dorm · microzona" en vez de "Departamento"/basura, y arregla el bug de orden (nombre del pm antes que `nombre_edificio` crudo). Impacto medido en Eq alquiler: 52/155 cards mejoran. Presentación pura, reversible.

**Pendiente:** venta — dudosos (San Diego, Jerico, Camila, Nicolás) + Tier 4 (~50 sin nombre real); alquiler — 17 sin match (cluster sin nombre); auditoría de GPS rotos.

---

## 21 Jun 2026 — Backfill de campos faltantes en las casas ZN (paridad con el contrato de deptos)

**Origen:** el founder preguntó "¿el flujo extrae las fotos?". Respuesta: **no**. La sonda (`scripts/sonda-suelo/lib/portales.mjs`) solo **contaba** fotos para la métrica de calidad (`fotos_ok` ≥5), nunca guardó las URLs. Al comparar las claves de `datos_json_enrichment` de un depto en prod (id 2876, ~75 claves) vs una casa cargada (10 claves), faltaban 5 campos relevantes que los deptos sí tienen.

**Diagnóstico (qué faltaba vs qué ya estaba):**
- **Ya estaba:** `url` (anuncio original, 306/306), `id` propio = PK → ref pública `SIM-V<id>` (igual que `lib/wa-message.ts:94`), `fuente` (Remax/C21, 306/306), `oficina_nombre` (franquicia, 305/306), contacto/WhatsApp del captador, MOAT (es_cerrado/amenidades).
- **Faltaba:** `fotos_urls`+`cantidad_fotos`, `descripcion`, `fecha_publicacion`, `codigo_propiedad` (el del portal), `estacionamientos`, `oficina_telefono`.

**Contrato de extracción por portal (verificado empíricamente):**
- **C21** (`?json=true`): fotos en `j.fotos[].large` (nivel top, NO en `entity`); `e.descripcion`; `e.estacionamientos` (parqueo, sí estructurado); fecha derivada de `e.dias` (días en mercado); `e.clave` (código, ej "100470--28"); `e.telefonoOfna`.
- **Remax** (`data-page`): `l.multimedias[].large_url`; `l.description_website`; `l.date_of_listing` (fecha exacta); `l.MLSID` (código); **parking y tel-de-oficina = campo fantasma** (null → del texto vía LLM, como ya sabíamos de la captura Remax).

**Trabajo:** script `scripts/auditoria-cola-matching/backfill-campos-casas.mjs` (dry-run por default + `--apply` vía service_role; merge que NO pisa contacto/MOAT; función `extraerCampos()` reusable para cablear al cron nocturno futuro). Dry-run sobre 8 → 100% en fotos/desc/fecha/código → aplicado a las 306.

**Resultado verificado en BD:** fotos 305/306, descripción 304/306, fecha_publicacion (columna) 305/306, código 306/306, estacionamientos 95/306 (solo C21, 31%), oficina_telefono 193/306 (solo C21, 63%). WhatsApp 306/306 + amenidades 283/306 **intactos**; 0 contaminan matching de deptos. Marcador `datos_json_enrichment->>'fuente_backfill'='backfill_campos_21jun'`. 1 sin fotos: **id 3246** (Remax Radial 26, listing sin multimedias en la fuente).

**Pendiente:** vista `v_mercado_casas` + feed `/ventas/casas` (ya con todos los datos: fotos, descripción, fecha, ref propia, portal); cablear `extraerCampos()` al cron del flujo híbrido para que las casas nuevas nazcan con estos campos.

---

## 21 Jun 2026 (tarde) — Bug: el pipeline nocturno degradaba las casas ZN + feed v_mercado_casas

**Origen:** al construir la vista del feed de casas (`v_mercado_casas`, migración 262), el SELECT devolvía **194 casas, no 305**. Diagnóstico: **113 casas remax ZN habían sido marcadas `inactivo_pending`** por el pipeline nocturno (marcas 20 y 21-jun 09:15), 1 ya en `es_activa=false`. Patrón idéntico al bug histórico de deptos ZN (esta misma bitácora, 19-may): un discovery comparaba props de la zona sin filtrar por tipo y marcaba ausente lo que su scraping no encontraba.

**Causa raíz (dos depredadores sobre las casas remax ZN):**
1. `discovery_remax_casas_terrenos` (Equipetrol-only): su "Obtener URLs Activas BD" trae TODAS las casas remax (`fuente='remax'`, **sin filtro de zona**) pero scrapea solo Equipetrol → no encuentra las ZN → las marca ausentes.
2. `flujo_a_discovery_remax_zonanorte` (deptos ZN): trae todo lo remax de ZN **sin filtrar tipo** (deptos + casas) → su scraping de deptos no encuentra las casas → las marca ausentes.
- Las casas **C21 se salvaron por casualidad de naming**: ambos discovery C21 buscan `fuente='century21'` y nuestras casas usan `fuente='c21'`.

**Fix (separación por tipo — cada pipeline ignora lo que no es suyo):**
- Discovery de **deptos ZN** (remax + century21): `+ AND lower(coalesce(tipo_propiedad_original,'')) NOT IN ('casa','terreno','lote')` en "Obtener URLs Activas BD" y "Marcar Ausentes". Aplicado por el founder en su instancia n8n (verificado contra sus exports reales). **Equipetrol NO se tocó** (no tiene casas del híbrido; git diff vacío — decisión de no tocar producción consolidada).
- Discovery de **casas/terrenos** (los 3 workflows, Equipetrol-only de prueba): **desactivados** en n8n (los reemplaza el flujo híbrido). Fix de zona Equipetrol dejado en el repo como respaldo por si se reactivan.

**Recuperación:** `scripts/auditoria-cola-matching/recuperar-casas-pending.mjs` (service_role) devolvió las 113 a `status='completado'`, `es_activa=true`, `primera_ausencia_at=NULL`. Verificado: 306 casas completado+activa, 0 pending. La vista `v_mercado_casas` ahora devuelve **298 casas** (189 c21 + 104 remax + 5 century21; 297 con fotos) — las 8 que faltan para 306 tienen anuncio >300 días (filtro de antigüedad canónico, correcto).

**Vista `v_mercado_casas` (migración 262, ✅ APLICADA 21-jun):** espejo de `v_mercado_venta` invirtiendo el filtro a `tipo_propiedad_original='casa'` (la de deptos excluye 'casa' explícitamente) + `es_activa` + antigüedad 300/730d + LEFT JOIN a `condominios_master` (condominio heredado). GRANTs Preset A. Aislada, no toca el feed de deptos. Decisión: antigüedad 300d (igual deptos), ruta separada `/ventas/casas`.

**Lección arquitectónica:** deptos (n8n) y casas (híbrido) comparten `propiedades_v2` → **cada pipeline debe filtrar por tipo para ignorar lo ajeno**. La frontera es por TIPO de propiedad, no por zona. El híbrido es multizona (genérico por polígono) pero solo para casas/terrenos; los deptos siguen en n8n.

**Pendiente:** construir feed `/ventas/casas` (vista mig 262 ✅ aplicada, 298 casas) → piloto del cron del híbrido vía routine de Claude Code (MOAT sin costo de API, una sola routine corre todo el flujo lineal).

---

## 24 Jun 2026 — Feed /ventas/casas construido (dark launch)

Feed público de casas ZN sobre `v_mercado_casas` (**SSG + filtrado client-side, sin API/RPC nueva** — las ~291 casas caben embebidas), aislado del feed de deptos, `noindex`. Branch `feat/feed-casas-zn` (commit `c0d0372`), **sin merge a main ni deploy**. Archivos nuevos: `pages/ventas/casas.tsx` + `lib/casas.ts` (`UnidadCasa`/`FiltrosCasa` + `mapCasaRow` + filtros).

**Qué incluye:** cards desktop/mobile, bottom sheet, mapa + `CasaMapFloatCard`, `PhotoViewer`, filtros completos (microzona/precio/dorms/condominio cerrado-individual/amenidades/terreno/orden), spotlight `?id`, contacto WhatsApp al captador (`agente_telefono`, ref `SIM-V`). Mobile = mismos componentes que el feed de deptos (search pill arriba + botón de mapa + overlay full-screen), no el FAB.

**Bugs/ajustes resueltos en la sesión (verificados en navegador):**
- Bottom sheet salía con texto invisible (tema claro de `alquileres.css` pisaba) → overrides scopeados bajo `.bs-venta` (convención del repo).
- Sheet desktop abría a la izquierda tapando el filtro → corregido a la derecha.
- Faltaba el `MapFloatCard` al clickear un pin → clonado adaptado a casas.
- Zona en cards mostraba la abreviatura (`displayZona`) en vez del nombre del filtro → helper `zonaChip` (`chipLabelZN(getZonaLabel())`).
- Área construida sin etiqueta ("152 m²" ambiguo) → "152 m² constr."

**Verificación:** `tsc --noEmit` limpio; `/ventas/casas` carga 200 con las 291 casas embebidas, `noindex` presente, 0 errores de runtime.

**Pendiente:** merge a main + deploy + **cron de captura** (routine Claude Code, cablear `extraerCampos()`) + asset `og:image` (`skyline-zona-norte.jpg`).
**Deuda detectada:** `VentaMap` reconstruye el mapa y resetea el zoom al seleccionar un pin (afecta a todos los feeds) → anotada en `docs/backlog/DEUDA_TECNICA.md`.

---

## 26 Jun 2026 (noche) — Tile casa × alquiler ZN: C21 reconectó + clasificador de uso (residencial/mixto/comercial)

**Contexto:** retomado el ticket "sondeo casa × alquiler × ZN" que el 26-jun (tarde) quedó frenado por `UND_ERR_CONNECT_TIMEOUT` de C21. **Una prueba de 1 request confirmó que C21 ya conecta** (HTTP 200, 64 KB, <2s): el bloqueo era transitorio a nivel de IP de casa y se levantó solo en horas. Todo lo de esta sesión fue **read-only, sin tocar la BD** (output a JSON gitignored).

**Extracción de detalle de alquiler validada (no solo conteo):** prototipo `scripts/casas-zn/muestra-alquiler-zn.mjs` — discovery C21 `operacion_renta` con corte temprano (junta N+pool y para, ~9 requests para muestra de 3) + detalle completo reusando la lógica de `cron-casas-zn.mjs` (desc, WhatsApp del captador, fotos, área, dorms, código, fecha). **Bugs a resolver en el MOAT antes de cualquier upsert:** (1) C21 devuelve el alquiler convertido BOB→USD con etiqueta USD errada ("5.500 bs" → "USD 790.23"); (2) WhatsApp a veces enmascarado (`...9999`).

**Hallazgo de producto — cómo separar comercial de residencial:** ~1 de cada 3 casas-alquiler en ZN son **locales comerciales** (sobre avenida, "ideal para empresa/oficina/clínica"). **El filtro por keywords NO sirve** — casi toda casa grande en avenida se promociona "también para negocio", la palabra "comercial/oficina" está hasta en residenciales. La señal que SÍ separa = **dormitorios mencionados en el TEXTO** (el campo estructurado `recamaras` viene NULL en casas C21). Comercial puro = 0 dorms en texto + lista de usos empresariales; residencial = enumera dorms/suites/cocina/lavandería.

**Clasificador `scripts/casas-zn/clasificar-uso.mjs` (reusable por el futuro cron):**
- Capa 1 (regex): `residencial | mixto | comercial`, conteo de dorms del texto **sin inflar con suites** ("5 dormitorios (3 suites)" = 5, no 8), flag `posible_depto` (título que arranca en "departamento" — C21 cuela deptos en `tipo_casa`). Clasifica lo claro, marca `a_agente` los ambiguos.
- Capa 2 (agente-lector / juez LLM): resuelve los ambiguos leyendo la descripción completa — nunca el regex decide los dudosos (mismo patrón que `/audit-cola-matching`).
- Validado sobre muestra de 10: 🟢5 / 🟡2 / 🔴3, 7/10 en firme por capa 1; el lector resolvió los 3 dudosos (1 depto colado → excluido del feed de casas; 2 mixtos confirmados casas reales con 5 dorms + chimenea/piscina vendidas también para oficina).

**Decisión de producto (Lucho):** NO excluir el comercial → **clasificar `uso_inmueble` y exponerlo como FILTRO** en el feed (default residencial+mixto on, comercial off pero visible). No se pierde inventario, no hay falso negativo caro, sirve al que busca local; el `mixto` es categoría legítima. Hace el sistema tolerante a errores → capa 1 basta para el MVP, el lector refina.

**Estado:** clasificador cerrado (productor del campo). **Falta de verdad** el PIPELINE y el FEED de alquiler de casas (ninguno existe), el campo `uso_inmueble` en `propiedades_v2` (migración pendiente) y el volumen total (BI `id_fami` de casa sin resolver). Detalle en el ticket del BACKLOG y memoria `project_feed_alquiler_casas_zn_uso`.
