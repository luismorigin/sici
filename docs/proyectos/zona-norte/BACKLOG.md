# Backlog — Proyecto Zona Norte

> Tickets pendientes que surgieron de la validación Fase 3+4. Organizados por prioridad y por scope.

**Última actualización:** 27 May 2026.

---

## 🔴 Tickets críticos (próxima sesión)

### #1 — Mejorar prompt LLM v4.0 para no extraer palabras genéricas como nombre_edificio

**Problema detectado 27-may-2026:** el prompt LLM `scripts/llm-enrichment/prompt-ventas.md` extrae palabras genéricas como `nombre_edificio`:
- 16 props ZN con `nombre_edificio='Preventa'`.
- 9 props con `'Moderna'`.
- 6 props con `'Venta'`.

**Scope:** afecta también Equipetrol — verificar alcance.

**Acción:**
1. Auditar las extracciones de nombre del LLM en `propiedades_v2.datos_json_enrichment->'llm_output'->>'nombre_edificio'`.
2. Lista negra de palabras genéricas: "Preventa", "Venta", "Moderna", "Nuevo", "Departamento", etc.
3. Re-tunear prompt para que distinga "nombre propio del edificio" vs descripción.
4. Re-procesar props afectadas tras fix.

**Estimación:** 1-2 horas + re-processing.

---

### #2 — Refactor merge + matching para priorizar `llm_output.nombre_edificio`

**Problema detectado 27-may-2026:** el COALESCE en 4 funciones SQL ignora el `llm_output`:
- `merge_discovery_enrichment` (consolidación a columna `nombre_edificio`).
- `generar_matches_por_nombre` (matching exacto).
- `generar_matches_trigram` (matching fuzzy con trigramas).
- `generar_matches_fuzzy` (matching fuzzy por palabras).

Todas usan:
```sql
COALESCE(
  NULLIF(TRIM(p.nombre_edificio), ''),
  TRIM(p.datos_json_enrichment->>'nombre_edificio'),
  TRIM(p.datos_json->'proyecto'->>'nombre_edificio')
)
```

→ Ignoran `datos_json_enrichment->'llm_output'->>'nombre_edificio'` (el más confiable).

**Riesgo:** **CAMBIO SISTÉMICO** que afecta Equipetrol. Hacer con cuidado:
1. Bajar muestra de 50 props Equipetrol con regex vs LLM divergente → ver qué cambiaría.
2. Modificar COALESCE en las 4 funciones para incluir llm_output al inicio:
   ```sql
   COALESCE(
     TRIM(p.datos_json_enrichment->'llm_output'->>'nombre_edificio'),  -- NUEVO
     NULLIF(TRIM(p.nombre_edificio), ''),
     TRIM(p.datos_json_enrichment->>'nombre_edificio'),
     ...
   )
   ```
3. Aplicar uno a la vez, monitorear matches generados antes de aprobar.

**Estimación:** 2-3 horas + validación cuidadosa.

**Bloqueado por #1:** el LLM aún tiene bug de palabras genéricas. Hasta que se fixee, NO conviene priorizarlo en el COALESCE.

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
