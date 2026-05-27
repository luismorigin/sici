# Backlog — Proyecto Zona Norte

> Tickets pendientes que surgieron de la validación Fase 3+4. Organizados por prioridad y por scope.

**Última actualización:** 27 May 2026.

---

## 🔴 Tickets críticos (próxima sesión)

### #1 — Decidir manejo de `nombre_edificio` para props ZN sin match

**Investigación 27-may-2026 (sub-sesión 2):** el ticket originalmente decía "mejorar prompt LLM v4.0". Tras investigar caso real resultó que **el LLM funciona bien** (devuelve `null` cuando no hay nombre claro). El bug está en el extractor REGEX del `flujo_b_processing_v3.0` que extrae "Preventa", "Venta", "Moderna" como nombre.

**Mecanismo real descubierto:**
- Cuando una prop matchea con `proyecto_master` → el merge pisa `nombre_edificio` con `pm.nombre_oficial`.
- Equipetrol: 97% de props matcheadas → 83% de columnas dominadas por pm.nombre_oficial (que coincide con LLM en 88% de los casos).
- Zona Norte (ADR-003: sin proyectos master): 93% de props SIN match → caen al COALESCE del regex → "Preventa"/"Moderna" emergen.

**El bug existe globalmente pero solo es visible en zonas sin pm cargados.**

**Datos actuales 27-may-2026:**
- 16 props ZN con `nombre_edificio='Preventa'` — palabra genérica (NO es edificio).
- 6 con `'Venta'` — palabra genérica (NO es edificio).
- 9 con `'Moderna'` — **SÍ es edificio real ("Torre Moderna")** pero el regex perdió "Torre" y el LLM no lo detectó (bug doble).
- Equipetrol: solo 2 props con genéricos (enmascarado por matching).

**Matiz crítico ("Moderna"):** el bug no es solo del regex. El LLM también falló para "Torre Moderna" — devolvió `null` cuando la descripción/URL sí mencionaban el nombre. Opción B sola NO arregla este caso; requiere ALGUNA de estas acciones adicionales:
- **a)** Mejorar prompt LLM para detectar "Torre X" como nombre válido.
- **b)** Cargar `Torre Moderna` en `proyectos_master` ZN → matching la corrige.
- **c)** Backfill por URL pattern: si URL contiene `torre-moderna` → `nombre_edificio='Torre Moderna'`.

**Decisión pendiente — 2 opciones:**

**Opción A — Backfill recurrente acotado a ZN** (cero código):
- Cada semana corre `UPDATE nombre_edificio = llm_output WHERE zona='Zona Norte' AND nombre_edificio IN ('Preventa','Moderna','Venta','Departamento','Nuevo')`.
- Tiempo: 30 segundos/semana.
- Costo: cero.
- Pros: cero riesgo Equipetrol.
- Contras: deuda recurrente.

**Opción B — Modificar merge para preferir LLM cuando no hay match**:
- Cambio quirúrgico en `merge_discovery_enrichment`: si `id_proyecto_master IS NULL`, usar `llm_output.nombre_edificio` antes que el regex.
- Equipetrol: no afecta (sus 559 matcheadas siguen usando pm.nombre_oficial — preserva comportamiento).
- ZN: las 361 sin match toman el LLM (mejor calidad) en vez del regex (basura).
- Tiempo: 30 min + validación.
- Costo: cero.
- Pros: fix sistémico, cero deuda futura, no rompe Equipetrol.
- Contras: cambio sistémico requiere testing cuidadoso.

**Recomendación: Opción B** — fix sistémico, acotado a 1 función SQL, no afecta el path Equipetrol que ya funciona.

**Estimación:** 30 min + validación.

---

### #2 — Fixear bug del regex en `flujo_b_processing_v3.0` (BLACKLIST_CRITICA)

**Contexto:** el flujo B tiene una `BLACKLIST_CRITICA` que SUPONE filtrar "preventa", "venta", "moderna", etc., pero no funciona. El regex extrae estas palabras como `nombre_edificio` y las mete en `datos_json_enrichment`.

**Investigación pendiente:**
- ¿Es case sensitivity? La blacklist tiene "preventa" en lowercase pero el extractor genera "Preventa" con mayúscula.
- ¿Es orden de aplicación? La blacklist se aplica DESPUÉS de la extracción, y solo a algunos paths.
- ¿Es regex pre-blacklist? Hay regex que escapa al filtro de blacklist.

**Riesgo:** ALTO. El flujo_b corre para todas las props (Equipetrol + ZN + casas + terrenos). Cambiar el regex en producción es riesgoso.

**Bloqueador:** si se aplica el #1 Opción B (merge prefiere LLM cuando no hay match), este ticket pasa a ser MENOR — el LLM ya cubriría el caso.

**Recomendación:** **NO priorizar** salvo que después de aplicar #1 todavía aparezcan casos problemáticos. El #1 ataca el síntoma de forma más sistémica.

**Estimación:** 2-3 horas + testing en sandbox de n8n.

---

## 🟡 Tickets medianos (post-validación piloto)

### #3 — Catalogar los 22 proyectos satélite "Sin zona"

**Contexto:** del backfill quedaron 22 proyectos master con `zona='Sin zona'` (edificios físicamente fuera del polígono Equipetrol pero cerca). Ejemplos: Brickell 7, Riviera 155, Portofino, Swissôtel, Sirari, etc.

**Decisión pendiente:**
- Ampliar el polígono Equipetrol para incluirlos.
- Crear polígonos para zonas vecinas (Polanco, Las Palmas, etc.).
- Aceptar "Sin zona" como categoría y darles tratamiento especial.

Sin esto: matching automático no los toca (blindajes filtran zona estricta).

**Estimación:** 1-2 horas decisión + ejecución.

---

### #4 — Subir verificador throttle (Fase 6 PRD)

**Contexto:** verificador venta tiene `LIMIT 150/noche`. Equipetrol normal procesa ~3-5 pending. Zona Norte agregará 30-50 nuevas pending/día.

**Acción:** subir a `LIMIT 200/noche` para tener margen.

**Cuándo:** cuando el verificador empiece a tener backlog (>50 pending viejos).

**Estimación:** 5 min — cambiar LIMIT en `flujo_c_verificador_v2.0.0.json`.

---

## 🟢 Tickets de producto (post-piloto)

### #5 — Crear UI para HITL Zona Norte

**Contexto:** desde mig 253, las sugerencias ZN están en `estado='pendiente_zn'`, NO en el HITL Equipetrol (`/admin/supervisor/matching`).

**Tres opciones documentadas en README:**

1. **UI separada:** `/admin/supervisor/matching-zona-norte` filtrada por `estado='pendiente_zn'`.
2. **Toggle/dropdown** en UI actual de matching: alternar Equipetrol / ZN.
3. **Migración total:** `UPDATE estado='pendiente' WHERE estado='pendiente_zn'` + DROP trigger.

**Cuándo:** cuando las pendientes ZN crezcan a >200 o cuando se quiera revisar matches.

**Estimación:** 1-2 horas según opción elegida.

---

### #6 — Exposición pública de Zona Norte

**Contexto:** hoy ZN es dark launch. Frontend `/ventas` filtra solo Equipetrol. Admin tiene "Zona Norte (piloto)" via `ZONAS_ADMIN_FILTER` (mig commit `115b1e5`).

**Niveles de exposición:**

- **Mínimo (actual):** admin filter solo.
- **Beta soft:** agregar a `ZONAS_CANONICAS` para que aparezca en filtro público pero sin promoción (sin landing dedicada, sin SEO).
- **Producción completa:** rutas `/mercado/zona-norte/*`, SEO ad-hoc, copy hardcoded ajustado, mapa con bounds dinámicos.

**Bloqueador:** validar calidad data ≥90 días post-Fase 3 (regla 12 CLAUDE.md).

**Cuándo:** post-validación piloto + decisión de producto.

**Estimación:**
- Beta soft: 1 línea + 30 min validar.
- Producción completa: 1-2 semanas.

---

### #7 — Página preview privada con feed-look idéntico al de Equipetrol

**Contexto:** intento 27-may-2026 falló (hydration mismatch en `ventas.tsx` + bucle de re-fetch). Approach actual: usar `/admin/propiedades` para validación visual.

**Solución correcta:** refactor previo de `pages/ventas.tsx` para extraer el componente principal a un archivo separado y exponer una prop `forceZonas`. Después crear `/preview/[token].tsx` que lo importa con override.

**Estimación:** 2-3 horas + testing.

**Prioridad:** baja (admin panel cubre la necesidad de validación visual).

---

### #8 — Fase 5 PRD: Alquiler Zona Norte

**Contexto:** Fase 3+4 cubrió venta. Falta replicar para alquiler:
- Workflows: `flujo_discovery_c21_alquiler_zonanorte.json`, `flujo_discovery_remax_alquiler_zonanorte.json`, `flujo_discovery_bien_inmuebles_alquiler_zonanorte.json`.
- Endpoint base SC + filtro polígono GPS.
- Adaptar prompt LLM alquiler v2.0 con PROYECTOS CONOCIDOS de ZN.

**Bloqueador:** validar venta primero (Fase 4 confirma calidad de data).

**Estimación:** 2-3 horas (es replicar el patrón de venta).

---

### #9 — Mover el polígono "rápido" a uno definitivo

**Contexto:** el polígono actual (`docs/proyectos/zona-norte/poligono-prueba.geojson`) fue dibujado rápido para validar. ADR-008 dice que subdividir después es seguro porque `get_zona_by_gps()` permite re-asignar.

**Acción cuando aplique:**
1. Refinar polígono con bordes más precisos.
2. (Opcional) crear microzonas hijas (Hamacas, Radial 26, Norte Banzer 3er-4to, etc.).
3. `UPDATE propiedades_v2 SET zona = get_zona_by_gps(latitud, longitud) WHERE zona = 'Zona Norte'` para re-distribuir.

**Cuándo:** post-piloto + necesidad real (ej. estudios de mercado por microzona).

**Estimación:** medio día.

---

## ⚪ Investigación (no urgente)

### #10 — Cuál es la causa raíz del re-fetch bucle al usar query param + ventas.tsx

**Contexto:** intento 27-may de hacer `/preview/zn-piloto-mayo2026 → /ventas?_zn_preview=1` causó bucle de re-render. Posible hydration mismatch + `fetchProperties` con dependencias circulares.

**Investigación:** entender la causa exacta para hacer un refactor robusto cuando se implemente #7.

**Estimación:** 1-2 horas debug.

---

## Tickets ya resueltos hoy 27-may-2026

- ✅ Bug discovery Equipetrol marcando ZN como pending (commit `fb78d23`)
- ✅ Blindaje `generar_matches_trigram` cross-zona (mig 252)
- ✅ HITL separado ZN vs Equipetrol (mig 253 + trigger)
- ✅ Limpieza props legacy backfilleadas con status confirmed/excluida
- ✅ Reversión 15 cross-zona aplicados + archivado en `obsoleto_cross_zona`
- ✅ Reversión 52 K1 falsos
- ✅ Backfill `nombre_edificio` con `llm_output` (acotado a ZN)
- ✅ Agregado "Zona Norte (piloto)" a `ZONAS_ADMIN_FILTER` (commit `115b1e5`)
- ✅ Doc `operacion.md` con kill-switch + monitoreo diario
