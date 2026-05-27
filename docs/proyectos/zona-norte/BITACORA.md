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
