# Backlog — Proyecto Zona Norte

> Tickets pendientes que surgieron de la validación Fase 3+4. Organizados por prioridad y por scope.

**Última actualización:** 27 May 2026 (sub-sesión 4 — visión multi-macrozona consolidada).

---

## Visión del proyecto (post-ADR-009)

**El proyecto Zona Norte deja de ser "piloto aislado" y pasa a ser "prototipo de la arquitectura multi-macrozona de Simón Santa Cruz".**

**Estrategia:** strangler pattern. **Equipetrol producción NO se toca.** Se construye lo nuevo en paralelo:

- `pages/ventas.tsx` (Equipetrol) intacto.
- `pages/mercado/zona-norte/*` se construye nuevo con patrón multi-macrozona.
- Workflows ZN (`*_zonanorte_v1.0.0`) son **los workflows universales multi-macrozona** — leen polígonos activos de BD; agregar Urubó/Polanco = editar 1 array.
- Workflows Equipetrol intactos (siguen procesando solo Equipetrol).

**Coexistencia indefinida.** Migrar Equipetrol al patrón nuevo = decisión futura (3-6 meses), no hoy.

Ver `DECISIONES.md` ADR-009 para detalle completo.

---

## 🔴 Tickets críticos (próxima sesión)

### #1 — Mejorar criterios de confianza del prompt LLM v4.0 + merge acepta 'media'

> **Reformulado tras 3 iteraciones de investigación 27-may-2026.** El ticket original ("Mejorar prompt LLM" / "Decidir A o B") era erróneo — el merge v2.6.0 YA tiene lógica híbrida correcta. La causa raíz real es que el **prompt nunca define criterios** sobre cuándo usar cada nivel de confianza → el LLM lo interpreta binario (alta/null).

**Contexto histórico (revisado git):** El sistema ya tuvo auditoría profunda sobre LLM (commits `dc4e4d7` 24-may, `5d86301` 22-may, `d00129b` 22-may). Decisiones en `docs/backlog/DEUDA_TECNICA.md` "Discovery pisa correcciones del LLM" (AUDITADO Y CERRADO 24-may-2026):

> "⚠ 'El LLM tiene razón' NO es universal. Distinguir por campo:"
> - **dormitorios**: LLM gana (cruda es árbitro)
> - **nombre_edificio**: LLM gana solo si regex sospechoso o no matchea pm (v2.6.0)
> - **estado_construccion, tipo_cambio_detectado**: existing_protected by-design (LLM puede leer aviso viejo)

→ La asimetría LLM-por-campo es **decisión consciente**, no bug. Cualquier cambio al prompt debe respetar esto.

**Datos medidos (27-may-2026):**

Auditoría sobre 824 props con LLM:
- 643 (78%) con confianza='alta'.
- 166 (20%) con confianza=null.
- 15 (2%) con confianza='media'.
- **0 (0%) con confianza='baja'.**

→ El LLM es **binario en la práctica**.

**Impacto real Zona Norte:**
- **135 props ZN con LLM=null** (32% del inventario).
- 22 tienen pattern `edificio-X` / `torre-X` / `condominio-X` en URL.
- 13 contienen nombre de edificio conocido en URL/slug.
- **~30-50 props ZN recuperables** post-fix del prompt.

**Impacto Equipetrol:** 42 props con LLM=null. Mayoría enmascaradas por matching que pisa con `pm.nombre_oficial`. Cambio probable: 0-3 props con cambios visibles.

**Acción (3 capas):**

1. **Agregar bloque al prompt** sobre cuándo usar cada nivel para `nombre_edificio_confianza` ESPECÍFICAMENTE:
   - `alta`: nombre explícito en descripción libre (texto del avisador).
   - `media`: nombre solo en título/URL/slug (señal indirecta pero verificable).
   - `baja`: inferido por modelo/código interno (ej. "modelo MA-8" → "Edificio Mangales").
   - `null`: no hay forma de extraerlo.

2. **NO cambiar criterios para `estado_construccion`, `tipo_cambio_detectado`.** Mantener existing_protected by-design (lecciones de los commits 22/24-may).

3. **Modificar merge** SOLO para `nombre_edificio`: cambiar `v_llm_nombre_edificio_confianza = 'alta'` a `IN ('alta', 'media')` en la rama LLM híbrida.

4. **Re-procesar las 166 props con LLM=null** post-fix del prompt. Algunas extraerán vía título/URL.

**Riesgos:**
- LLM más permisivo con "media" → falsos positivos. Mitigación: definir "media" muy estricto en el prompt (solo URL/título exacto, no inferencia).
- Equipetrol: las 643 con confianza=alta no cambian; algunas con LLM=null podrían reclasificar a "media" en re-procesamiento.

**Prioridad: MEDIA.** ZN ya tiene 388/388 props con nombre (regex backfill manual). El bug afecta calidad, no funcionalidad. Pero la deuda **crece cada noche** con props nuevas.

**Estimación:** 2-3 horas + testing + re-procesamiento (~$3 Haiku).

---

### #1.5 — Cargar proyectos master para edificios reconocibles de Zona Norte

> **Ataque alternativo/complementario al #1.** Beneficio inmediato y visible.

**Contexto:** ADR-003 decidió arrancar ZN sin proyectos master. Pero el dark launch reveló que **muchos edificios ZN son recurrentes** y reconocibles. Cargarlos como `pm` elimina el problema "sin match" de raíz para esas props.

**Cuando hay match → matching pisa `nombre_edificio` con `pm.nombre_oficial` → no importa qué haya extraído el regex.** Es el mecanismo que protege Equipetrol del bug del regex.

**Edificios candidatos (visible en el inventario ZN actual):**

Identificados en el dark launch de hoy (con conteo de props):
- EDIFICIO K1 (3 props reales — el resto fue cleanup)
- Mangales Blue 2 (9+)
- HH HOME (14)
- Essenzia (6+)
- Vilareal Duo (8)
- Torre Moderna (9)
- Community Alto Norte (12)
- Blue Garden (6)
- STONE 4 (5)
- BLESS TOWER (5)
- Torres Evolution (5)
- Raizant Blend / Botanic (5)
- Ergo Experience (6)
- Sky Icon (4 — el real, no el cross-zona Equipetrol)

**Beneficio si se carga (~14 pm):**
- 100+ props ZN matchean automáticamente → `nombre_edificio` correcto vía `pm.nombre_oficial`.
- Cobertura de ~25% del inventario ZN.
- Elimina la dependencia del bug del regex para esas props.
- Habilita estudios de mercado por edificio.

**Precaución crítica detectada 27-may-2026:** **los GPS de las props NO son siempre confiables.** Los agentes a veces cargan GPS falsos. Análisis de cluster reveló:

- ~15 edificios con **dispersión GPS <50m** (confiables): Mangales Blue 2, Vilareal Duo, HH HOME, Blue Garden, Domus Luxury, BLESS TOWER, Torres Evolution, Sky Icon, KERONI, Essenzia, K1, ZIRI ZWEI, Macororo, Galil Parque III, ONE.
- 4-5 edificios con **dispersión >100m** (dudosos): Community Alto Norte (270-696m), STONE 4 (930-1015m), Curupaú Isuto (492-1588m), Cantabria (501m).

**Causa de dispersión:** condominio multi-torre, GPS falso de agente, o mismo nombre en edificios distintos.

**Acción refinada — metodología 3 pasos:**

**1. Auto-cargar solo los confiables (cluster <50m):**
- Calcular centroide GPS (promedio).
- INSERT en `proyectos_master` con `zona='Zona Norte'`, `nombre_oficial`, `latitud=centroide_lat`, `longitud=centroide_lon`, `activo=true`, `gps_verificado_google=false`.
- ~15 pm cargados → cobertura ~25% inventario ZN.

**2. Verificación con Google Places (post-INSERT):**
- El sistema YA tiene infraestructura: `gps_google_lat`, `gps_google_lng`, `gps_discrepancia_metros`, `gps_verificado_google`.
- Correr el verificador (función o workflow existente) sobre los nuevos pm.
- Si Google confirma GPS → flag `gps_verificado_google=true`.
- Si Google dice GPS muy distinto (>200m) → marcar para revisión admin.

**3. Dudosos (dispersión >100m): NO cargar automático**:
- Listar en `docs/proyectos/zona-norte/pm-pendientes-revision.md`.
- Admin revisa caso por caso (puede ser 1 condominio multi-torre que merece 2-3 pm distintos, o GPS falso a descartar).

**4. Re-correr matching:**
- Las props con GPS dentro de 250m del pm matchean automáticamente (matching GPS).
- Las sugerencias caen a `pendiente_zn` (HITL separado por mig 253) para validación humana opcional.

**Riesgo:** **BAJO** si se respeta el filtro de cluster <50m. **MEDIO** si se cargan dispersos sin revisión.

**Estimación:**
- Solo confiables (15 pm): 1-2 horas (query + INSERT + verificación Google + matching).
- Con dispersos revisados manual: +2-3 horas.

**Recomendación:** ejecutar **ANTES** del #1. Beneficio más rápido y concreto. Si #1.5 cubre el 25% del inventario, el #1 ataca el 7-15% restante (cola larga de edificios únicos).

---

## 🟡 Tickets medianos (post-validación piloto)

### #2 — Catalogar los 22 proyectos satélite "Sin zona"

**Contexto:** del backfill quedaron 22 proyectos master con `zona='Sin zona'` (edificios físicamente fuera del polígono Equipetrol pero cerca). Ejemplos: Brickell 7, Riviera 155, Portofino, Swissôtel, Sirari, etc.

**Decisión pendiente:**
- Ampliar el polígono Equipetrol para incluirlos.
- Crear polígonos para zonas vecinas (Polanco, Las Palmas, etc.).
- Aceptar "Sin zona" como categoría y darles tratamiento especial.

Sin esto: matching automático no los toca (blindajes filtran zona estricta).

**Estimación:** 1-2 horas decisión + ejecución.

---

### #3 — Subir verificador throttle (Fase 6 PRD)

**Contexto:** verificador venta tiene `LIMIT 150/noche`. Equipetrol normal procesa ~3-5 pending. Zona Norte agregará 30-50 nuevas pending/día.

**Acción:** subir a `LIMIT 200/noche` para tener margen.

**Cuándo:** cuando el verificador empiece a tener backlog (>50 pending viejos).

**Estimación:** 5 min — cambiar LIMIT en `flujo_c_verificador_v2.0.0.json`.

---

## 🟢 Tickets de producto (post-piloto)

### #4 — Crear UI para HITL Zona Norte

**Contexto:** desde mig 253, las sugerencias ZN están en `estado='pendiente_zn'`, NO en el HITL Equipetrol (`/admin/supervisor/matching`).

**Tres opciones documentadas en README:**

1. **UI separada:** `/admin/supervisor/matching-zona-norte` filtrada por `estado='pendiente_zn'`.
2. **Toggle/dropdown** en UI actual de matching: alternar Equipetrol / ZN.
3. **Migración total:** `UPDATE estado='pendiente' WHERE estado='pendiente_zn'` + DROP trigger.

**Cuándo:** cuando las pendientes ZN crezcan a >200 o post-ejecución de #1.5 (donde van a crecer mucho).

**Estimación:** 1-2 horas según opción elegida.

---

### #5 — Exposición pública de Zona Norte

**Contexto:** hoy ZN es dark launch. Frontend `/ventas` filtra solo Equipetrol. Admin tiene "Zona Norte (piloto)" via `ZONAS_ADMIN_FILTER` (commit `115b1e5`).

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

### #6 — Construir `/mercado/zona-norte` (prototipo del patrón multi-macrozona)

**Reformulado tras ADR-009:** ya no es "preview privada" — es **el primer prototipo del patrón `/mercado/[macrozona]` que escalará a Urubó/Polanco/etc.**

**Decisión clave:** NO requiere tocar `pages/ventas.tsx` (intacto, Equipetrol sigue ahí). Se construye página y componente **nuevos** en paralelo.

**Arquitectura propuesta:**
```
pages/
├── ventas.tsx                            ← Equipetrol, INTACTO
├── mercado/
│   ├── equipetrol/                       ← rutas existentes, INTACTAS
│   │   ├── index.tsx
│   │   ├── ventas.tsx
│   │   └── alquileres.tsx
│   └── zona-norte/                       ← NUEVO
│       ├── index.tsx                     ← hub (similar a equipetrol/index)
│       └── ventas.tsx                    ← feed específico ZN
components/
└── mercado/
    └── FeedMacrozona.tsx                 ← NUEVO componente reusable
                                            (lo consume mercado/zona-norte/ventas)
```

**Fases:**
1. **Fase A — Privado por token** (mientras se valida calidad):
   - URL: `/mercado/zona-norte/ventas?token=zn-piloto`.
   - SSR valida token, si no hay → 404.
   - `noindex` + sin links desde landing.
2. **Fase B — Beta soft** (post-validación piloto):
   - URL pública sin token.
   - `noindex` removido.
   - Sin promoción activa todavía.
3. **Fase C — Producción completa**:
   - Link desde landing.
   - SEO ad-hoc.
   - Branding global "Simón Santa Cruz" (decisión separada).

**Componente `<FeedMacrozona>` requisitos:**
- Acepta prop `macrozona`.
- Aplica filtros por microzona dentro de esa macrozona.
- Mapa con bounds dinámicos según macrozona.
- Cards idénticas (estilo, formato, comportamiento) al feed Equipetrol actual.
- Reusable: cuando llegue Urubó, `/mercado/urubo/ventas` lo consume con `macrozona="Urubó"`.

**Estimación:**
- Fase A (privado token): 3-4 horas.
- Fase B (publicar): 30 min (remover noindex, agregar a sitemap).
- Fase C (branding global): scope mayor, separado.

**Prioridad:** ALTA en cuanto se quiera mostrar ZN visualmente a alguien. Hoy podés usar `/admin/propiedades` como sustituto temporal.

---

### #7 — Fase 5 PRD: Alquiler Zona Norte

**Contexto:** Fase 3+4 cubrió venta. Falta replicar para alquiler:
- Workflows: `flujo_discovery_c21_alquiler_zonanorte.json`, `flujo_discovery_remax_alquiler_zonanorte.json`, `flujo_discovery_bien_inmuebles_alquiler_zonanorte.json`.
- Endpoint base SC + filtro polígono GPS.
- Adaptar prompt LLM alquiler v2.0 con PROYECTOS CONOCIDOS de ZN.

**Bloqueador:** validar venta primero (Fase 4 confirma calidad de data).

**Estimación:** 2-3 horas (es replicar el patrón de venta).

---

### #8 — Definir microzonas de Zona Norte (subdivisión + refinar polígono macro)

**Promovido en prioridad post-ADR-009:** con la visión multi-macrozona, **cada macrozona debe tener sus microzonas** para que el patrón sea consistente con Equipetrol (que tiene 6 microzonas).

**Contexto:**
- ZN hoy: 1 polígono macro único (`docs/proyectos/zona-norte/poligono-prueba.geojson`), dibujado rápido para validar.
- ADR-008: subdividir después es seguro porque `get_zona_by_gps()` permite re-asignar.
- Microzonas ya identificadas por taxonomía de portales: Hamacas, Banzer 3er al 5to anillo, Radial 26, Norte (genérico), Norte 4to-5to anillo.

**Acción:**
1. **Refinar polígono macro** con bordes más precisos (revisar el "polígono rápido" actual).
2. **Definir microzonas hijas** dentro de Zona Norte:
   - Hamacas
   - Banzer 3er al 5to anillo
   - Radial 26
   - Norte 4to-5to anillo (o como se nombre).
3. Cargar polígonos hijos en `zonas_geograficas` con `zona_general='Zona Norte'`.
4. Re-correr `get_zona_by_gps()` sobre props ZN existentes para re-distribuir en microzonas.
5. Decidir entre ADR-008 Camino A (microzonas hermanas, como Equipetrol) o Camino B (jerarquía real con zona macro + microzona).

**Recomendación Camino:** el **Camino A** (hermanas) es consistente con Equipetrol actual. El **Camino B** (jerarquía) sería un refactor del trigger pero más limpio a largo plazo. Decidir en el ADR-009 cuál se adopta para todas las macrozonas.

**Cuándo:** antes de la exposición pública de ZN. Cuando empiece a haber demanda de filtros por microzona.

**Estimación:** medio día + decisión de Camino.

---

## ⚪ Investigación / no priorizar

### #9 — Causa raíz del re-fetch bucle al usar query param + ventas.tsx

**Contexto:** intento 27-may de hacer `/preview/zn-piloto-mayo2026 → /ventas?_zn_preview=1` causó bucle de re-render. Posible hydration mismatch + `fetchProperties` con dependencias circulares.

**Investigación:** entender la causa exacta para hacer un refactor robusto cuando se implemente #6.

**Estimación:** 1-2 horas debug.

---

### #10 — Fix bug del regex en `flujo_b_processing_v3.0` (BLACKLIST_CRITICA) — NO PRIORIZAR

> **Ticket movido de crítico → no priorizar tras investigación 27-may.**

**Contexto:** el flujo B tiene una `BLACKLIST_CRITICA` que SUPONE filtrar "preventa", "venta", "moderna", etc., pero no funciona. El regex extrae estas palabras como `nombre_edificio` y las mete en `datos_json_enrichment`.

**Por qué NO priorizarlo:**
- Perseguir cada palabra mala del regex es **jugar al topo** (parche infinito).
- El #1 (mejorar prompt LLM) y #1.5 (cargar pm ZN) **atacan el síntoma de forma estructural**.
- Tocar el flujo B en producción es RIESGO ALTO (workflow crítico que procesa todas las zonas).

**Cuándo reconsiderar:** si después de aplicar #1 y #1.5 todavía aparecen casos problemáticos visibles. Por ahora, dejar como deuda conocida.

**Estimación:** 2-3 horas + testing en sandbox de n8n (si alguna vez se hace).

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
- ✅ Investigación profunda del prompt LLM + criterios de confianza (documentado en #1, no aplicado fix)

## Tickets resueltos 28-may-2026 — auditoría completa GPS

Sesión larga de audit + cleanup + carga de pm + verificación visual con herramienta nueva.

### Cleanup adicional matching legacy (post-blindaje 251/252)

- ✅ **K1 (pm 272) — 54 falsos positivos restantes** desmatcheados (el cleanup del 27-may fue parcial). Quedaron 8 props reales con GPS coherente <100m del pm.
- ✅ **STONE 4 (pm 268) — 3 falsos** desmatcheados (2 eran STONE 7, 1 URL genérica). Quedan 8 reales.
- ✅ **CURUPAU ISUTO (pm 271) — 2 falsos** desmatcheados (URLs genéricas). Quedan 8 reales.
- ✅ **Cross-zona restantes** — 5 props matched a pm de Equipetrol limpiadas (deuda pre-blindaje).
- ✅ **Nombres basura en `nombre_edificio`** — 32 props con "Preventa"/"Moderna"/"Venta"/"Con" nuleadas o backfilleadas (las 9 "Moderna" eran "Torre Moderna" recuperables vía URL).
- ✅ **Re-merge masivo de 147 props ZN** con `nombre_edificio = NULL` para que el LLM re-popule el nombre (recuperó +73 nombres reales).

### Ticket #1.5 ejecutado — 20 pm cargados

- ✅ INSERT de 20 pm con cluster GPS <100m de dispersión (centroides de props matched).
- ✅ Matching automático same-zone (`generar_matches_por_nombre`) re-corrido: +47 props matched a los pm nuevos (de 77 a 124).
- ✅ Aliases configurados para HH HOME (`'HH HOME'`), Essenzia (`'Essenzia'`).

### Verificación GPS automática + visual (38 pm ZN)

- ✅ **Nueva herramienta `scripts/verify-pm-gps/`** — verificación gratuita de GPS de pm vía Overpass API + Nominatim (OpenStreetMap). $0, sin API key. Reutilizable para Urubó/Polanco cuando se agreguen.
- ✅ **Nuevas columnas** `gps_verificado_osm`, `osm_buildings_around_30m`, `osm_nominatim_address`, `osm_verified_at` en `proyectos_master`.
- ✅ Verificación OSM aplicada a los 38 pm ZN: 13 con edificio OSM a 30m, 25 sin (OSM tiene cobertura parcial en SC).
- ✅ **HTML interactivo `verify-sospechosos.html`** con mini-mapa Leaflet (tile satelital Esri) y botones a Google Maps/Street View por prop individual. Permite comparación visual sin abrir 10 tabs.
- ✅ **Verificación visual de los 38 pm** por el usuario: 30 confirmed, 8 sospechosos iniciales.
- ✅ **Re-verificación de los 8 sospechosos con mini-mapa**: 6 confirmed por evidencia interna (cluster de props con GPS coherente) + 1 sospechoso mantenido (Vertical Isuto, aviso terminado) + 1 dividido (Essenzia).
- ✅ **Nuevas columnas** `gps_verificado_visual`, `gps_verificacion_notas`, `gps_verificado_visual_at` en `proyectos_master`.

### Mudanzas de GPS (4 pm donde el usuario detectó coords incorrectas visualmente)

- ✅ **pm 274 Vertical Isuto** — GPS movido a -17.76238, -63.18972. Aviso terminado: prop 407 marcada `inactivo_confirmed`.
- ✅ **pm 353 Vilareal Duo** — GPS movido a -17.71965, -63.17575 (~127m del cluster de listings — los agentes tenían GPS desplazado).
- ✅ **pm 355 Blue Garden** — GPS movido a -17.76768, -63.17851 (~1167m del cluster de listings — desplazamiento sistémico grave del agente).
- ✅ **pm 366 Edificio Essenzia** — GPS movido a -17.74696, -63.16970. 7 props desmatcheadas (cluster A "edificio-essenzia-zona-norte" + cluster C "condominio-essenzia" son otros 2 edificios distintos). Quedan 3 props reales (cluster B).

### Renombres por nota del usuario

- ✅ **pm 361** → `Edificio Macororo 15` (con `alias_conocidos = ['Edificio Macororo','Macororo']`).
- ✅ **pm 369** → `Condominio Berchatti Norte 1` (con `alias_conocidos = ['Condominio Berchatti Norte']`).
- ✅ **pm 370 Sky Epic** + **pm 371 Torre Vento** — GPS ajustado con coords del usuario.

### Resultado final 28-may-2026

| Métrica | Valor |
|---|---|
| pm ZN activos | 38 (37 confirmed + 1 sospechoso) |
| Props ZN venta matched | 112 (28.6%) |
| Props ZN venta sin match | ~279 (cola larga del ticket #1) |
| Cross-zona aplicados | 0 |
| K1/STONE/CURUPAU falsos positivos | 0 |
| Nombres basura | 0 |
| pm con `gps_verificado_visual` | 38/38 (100%) |

**Sigue pendiente:**
- Ticket #1 (mejorar prompt LLM) — ataca los 279 sin match.
- 7 props ZN Essenzia desmatcheadas — el próximo merge nocturno las re-popula desde LLM; eventualmente surgirán pm para "Condominio Essenzia" + el edificio del cluster A.
- 2 props desmatcheadas STONE 7 — ídem, posible nuevo pm "STONE 7" cuando emerja.
- Revisar 6 pares de pm con GPS <100m entre sí (multi-torre vs duplicados).

### Hallazgos meta del 28-may

1. **El cluster GPS interno > Google Maps para verificar pm en Bolivia.** OSM/Google no rotulan todos los edificios. La convergencia de N listings independientes con el mismo nombre + GPS coherente es evidencia más fuerte que la inspección visual.
2. **Agentes ponen GPS sistemáticamente desplazado.** Vilareal Duo, Blue Garden, Essenzia tenían 6-10 listings con GPS-de-agente apilado, pero el edificio físico estaba en otro punto (verificado visualmente). El GPS del pm debe ser el del edificio real, no el promedio de los listings.
3. **Edificios con nombre parecido (Essenzia + Condominio Essenzia) son comunes.** El matching debe poder dividirlos vía cluster GPS, no sólo por nombre. Insight relevante para futuras macrozonas.
4. **Patrón K1 (cleanup pre-blindaje parcial) afectaba a 3 pm**: K1, STONE 4, CURUPAU ISUTO. El blindaje 251/252 protege contra nuevos casos pero la deuda residual hay que limpiarla case-by-case.

---

## Aprendizajes meta del proyecto

**Sobre diagnóstico:** la sesión del 27-may tuvo 3 iteraciones de hipótesis incorrectas antes de llegar a la causa raíz:

1. ❌ "Mejorar prompt LLM para no extraer genéricos" → el LLM ya devolvía null correctamente.
2. ❌ "Modificar merge para preferir LLM" → el merge YA tiene esa lógica (v2.6.0).
3. ❌ "Fixear blacklist del regex" → parche infinito, no escalable.
4. ✅ "Prompt nunca define criterios de confianza" → causa raíz real.

**Lección:** antes de proponer fix, **leer las decisiones históricas en git** (commits + docs canónicos). El sistema ya tuvo auditoría profunda sobre LLM en 22-24 may; ignorarla llevó a hipótesis incorrectas.

**Sobre estimaciones:** la estimación inicial del impacto fue de "9 props" (Torre Moderna). Medición real: **135 props ZN con LLM=null** (32% del inventario). Lección: **medir antes de estimar**.
