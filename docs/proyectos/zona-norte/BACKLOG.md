# Backlog — Proyecto Zona Norte

> Tickets pendientes que surgieron de la validación Fase 3+4. Organizados por prioridad y por scope.

**Última actualización:** 27 May 2026 (sub-sesión 3 — reorganización post-investigación profunda).

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

### #6 — Página preview privada con feed-look idéntico al de Equipetrol

**Contexto:** intento 27-may-2026 falló (hydration mismatch en `ventas.tsx` + bucle de re-fetch). Approach actual: usar `/admin/propiedades` para validación visual.

**Solución correcta:** refactor previo de `pages/ventas.tsx` para extraer el componente principal a un archivo separado y exponer una prop `forceZonas`. Después crear `/preview/[token].tsx` que lo importa con override.

**Estimación:** 2-3 horas + testing.

**Prioridad:** baja (admin panel cubre la necesidad de validación visual).

---

### #7 — Fase 5 PRD: Alquiler Zona Norte

**Contexto:** Fase 3+4 cubrió venta. Falta replicar para alquiler:
- Workflows: `flujo_discovery_c21_alquiler_zonanorte.json`, `flujo_discovery_remax_alquiler_zonanorte.json`, `flujo_discovery_bien_inmuebles_alquiler_zonanorte.json`.
- Endpoint base SC + filtro polígono GPS.
- Adaptar prompt LLM alquiler v2.0 con PROYECTOS CONOCIDOS de ZN.

**Bloqueador:** validar venta primero (Fase 4 confirma calidad de data).

**Estimación:** 2-3 horas (es replicar el patrón de venta).

---

### #8 — Mover el polígono "rápido" a uno definitivo

**Contexto:** el polígono actual (`docs/proyectos/zona-norte/poligono-prueba.geojson`) fue dibujado rápido para validar. ADR-008 dice que subdividir después es seguro porque `get_zona_by_gps()` permite re-asignar.

**Acción cuando aplique:**
1. Refinar polígono con bordes más precisos.
2. (Opcional) crear microzonas hijas (Hamacas, Radial 26, Norte Banzer 3er-4to, etc.).
3. `UPDATE propiedades_v2 SET zona = get_zona_by_gps(latitud, longitud) WHERE zona = 'Zona Norte'` para re-distribuir.

**Cuándo:** post-piloto + necesidad real (ej. estudios de mercado por microzona).

**Estimación:** medio día.

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

---

## Aprendizajes meta del proyecto

**Sobre diagnóstico:** la sesión del 27-may tuvo 3 iteraciones de hipótesis incorrectas antes de llegar a la causa raíz:

1. ❌ "Mejorar prompt LLM para no extraer genéricos" → el LLM ya devolvía null correctamente.
2. ❌ "Modificar merge para preferir LLM" → el merge YA tiene esa lógica (v2.6.0).
3. ❌ "Fixear blacklist del regex" → parche infinito, no escalable.
4. ✅ "Prompt nunca define criterios de confianza" → causa raíz real.

**Lección:** antes de proponer fix, **leer las decisiones históricas en git** (commits + docs canónicos). El sistema ya tuvo auditoría profunda sobre LLM en 22-24 may; ignorarla llevó a hipótesis incorrectas.

**Sobre estimaciones:** la estimación inicial del impacto fue de "9 props" (Torre Moderna). Medición real: **135 props ZN con LLM=null** (32% del inventario). Lección: **medir antes de estimar**.
