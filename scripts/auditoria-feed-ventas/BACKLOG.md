# Backlog — Auditoría de descripciones drift

Pendientes detectados en la sesión del 2026-05-08. Ordenados por valor / urgencia.

## 🔥 Alta — bugs en sistema productivo

### 1. Verificador del pipeline tiene gap "HTTP 200 OK con HTML vacío"

C21 sirve listings inactivos con HTTP 200 + HTML esqueleto sin descripción ni meta tags. El verificador actual chequea 404/302 pero no este caso. Resultado: listings muertos quedan como `status='completado'` y siguen apareciendo en feed hasta que un humano los detecta.

**Casos detectados manualmente** (5 props del audit + 2 anteriores): #172, #497, #629, #888, #1141, #1142, #1143.

**Estado: bloqueado por bug secundario en el flujo legacy del verificador**. Test corrido el 2026-05-08 reveló que el nodo `UPDATE inactivo_confirmed` tiene hardcoded `status='inactivo_confirmed'` — ignora el `newStatus` que setea el código JS de "Procesar respuesta". Por eso el flujo no diferencia entre `pending` y `confirmed`, va siempre directo a `confirmed`.

**Para retomar este punto necesitarás 3 cambios**:

a) **Modificar `Procesar respuesta`** — bloque C21 con detector HTML vacío. Código completo de v2.1 ya redactado (ver historial de la sesión 2026-05-08, resumido en este archivo).

b) **Modificar `UPDATE inactivo_confirmed` para que sea dinámico**:
```sql
UPDATE propiedades_v2
SET
  status = '{{ $json.newStatus }}'::estado_propiedad,
  es_activa = CASE WHEN '{{ $json.newStatus }}' = 'inactivo_confirmed' THEN FALSE ELSE es_activa END,
  fecha_inactivacion = CASE
    WHEN '{{ $json.newStatus }}' = 'inactivo_confirmed'
    THEN COALESCE(primera_ausencia_at, NOW())
    ELSE fecha_inactivacion
  END,
  primera_ausencia_at = CASE
    WHEN '{{ $json.newStatus }}' = 'inactivo_pending' AND primera_ausencia_at IS NULL
    THEN NOW()
    ELSE primera_ausencia_at
  END,
  razon_inactiva = '{{ $json.razonInactiva }}',
  fecha_actualizacion = NOW()
WHERE id = {{ $json.id }}
RETURNING id, url, status, fecha_inactivacion, primera_ausencia_at, razon_inactiva,
  '{{ $json.action }}' as action,
  '{{ $json.razonInactiva }}' as "razonInactiva",
  '{{ $json.origen }}' as origen,
  '{{ $json.fuente }}' as fuente;
```

c) **Re-test con SQL de revert** (solo si retomás mañana — si pasaron varios días, los IDs pueden ser otros):
```sql
-- Revertir las 5 muertas de vuelta a completado para re-test
UPDATE propiedades_v2
SET status = 'completado'::estado_propiedad,
    es_activa = TRUE,
    fecha_inactivacion = NULL,
    primera_ausencia_at = NULL,
    razon_inactiva = NULL,
    fecha_actualizacion = NOW()
WHERE id IN (629, 888, 1141, 1142, 1143);
```

**NOTA**: las 5 props (#629, 888, 1141, 1142, 1143) ya quedaron en `inactivo_confirmed` por el test fallido del 2026-05-08. **El estado final es correcto** (están realmente muertas), solo que llegaron por el camino equivocado. NO hace falta revertirlas a menos que se quiera re-testear el flujo `pending → confirmed`.

**Workflow duplicado para retomar**: `C:\Users\LUCHO\Downloads\Flujo C - Verificador Venta v2.0.0 copy.json` (en Downloads del user, no commiteado).

Ubicación del original: `n8n/workflows/modulo_1/flujo_c_verificador_v2.0.0.json`

**Riesgo concreto del fix** (re-evaluado con datos del sistema actual):
- Falsos positivos son **self-healing en <24h** porque `registrar_discovery` reactiva `inactivo_pending` → `actualizado` (`completado`) cuando vuelve a encontrar la URL en el portal (ver `sql/functions/discovery/funciones_auxiliares_discovery.sql:116-118`).
- Bajo riesgo total dado el self-healing.

**Alternativa si no se quiere tocar verificador**: el audit mensual ya detecta listings muertos (vía Firecrawl scraped vacío). Costo: hasta 30d de delay en marcarlos. Tasa observada: ~0.7%/mes (2-3 props/mes).

---

### 2. Admin no infiere `tipo_cambio_detectado` desde descripción

`usePropertyEditor.ts:810-839` solo actualiza `tipo_cambio_detectado` si el usuario toca el dropdown "tipo_precio". Si solo edita el precio o la descripción y la descripción menciona "paralelo" / "TC del día", el campo queda con el valor anterior (a veces NULL → feed muestra precio sin TC paralelo aplicado).

**Impacto medido**: con TC paralelo en 9.954 (vs oficial 6.96), una prop con descripción de paralelo y TC=NULL muestra el precio en feed **subestimado un 43%**. Casos detectados: #317, #428, #1689 (todos fueron corregidos manualmente en esta auditoría).

**Acción posible**: cuando el editor guarda una descripción, ejecutar una heurística (regex o LLM) que detecte "paralelo" / "oficial" en la descripción y sugiera el TC al usuario en el dropdown.

---

## 🟡 Media — automatización del audit

### 3. ~~Workflow nightly~~ → **Skill `/audit-feed-ventas-mensual`** ✅ implementada

Decisión final: en vez de workflow n8n o routine remota, **slash command local** que el usuario invoca 1 vez al mes desde su Claude Code. Razones:
- Cero infra adicional (sin n8n, sin routine remota, sin GitHub Action)
- Análisis humano incluido (Claude lee output y filtra ruido conocido)
- Costo Firecrawl: $1.75/mes (350 props × $0.005)
- Acceso directo al .env.local (Firecrawl + Supabase keys)

**Componentes implementados** (commit en este branch):
- `audit-feed-ventas-mensual.mjs` — orquestador que corre 3 capas + persiste a Supabase
- `audit-matching.mjs` — capa 3 (audit de matching usando alias_conocidos)
- `lib/matching-checks.mjs` — lógica de check matching
- `lib/internal-checks.mjs` — capa 2 afinada (de 118 → 18 issues, 6.5x menos ruido)
- `lib/extractor.mjs` — agregada extracción de title del HTML
- `audit-feed-ventas-mensual.command.md` — instrucciones de la skill (copiar a `.claude/commands/audit-feed-ventas-mensual.md`)
- `sql/migrations/242_audit_descripciones.sql` — persistencia (tablas + RLS + view de tendencias)

**Activación — ✅ COMPLETADA (verificado 2026-05-25)**:
- ✅ Migración `242` aplicada en Supabase (existen `audit_descripciones_runs`, `audit_descripciones_items`, `audit_descripciones_tendencias`)
- ✅ Migración `244` aplicada (columna `tipo_operacion` en runs/items)
- ✅ Las 4 skills instaladas en `.claude/commands/`: `audit-feed-ventas-mensual`, `audit-feed-ventas-semanal`, `audit-feed-alquileres-mensual`, `audit-feed-alquileres-semanal`
- ✅ Audits **en uso recurrente** (NO es pendiente): mensual corrido el 8-may con correcciones reales aplicadas al feed (ver `reports/AUDIT_LOG.md`) + reportes mensuales 11-may + skills semanales iteradas hasta **v1.4 (25-may)**. La tabla `audit_descripciones_runs` muestra pocas filas porque las corridas semanales NO persisten por diseño.

---

### 4. Refinar `audit-internal.mjs` con patterns reales detectados

El audit interno actual tira 118 issues con mucho ruido (34% del feed). Con lo aprendido en esta sesión, refinar:

**`precio_mismatch_desc`**:
- Filtrar precios cerca de "Precio:" / "Costo:" / "$us" no cualquier número
- Tolerar diferencias explicables por TC paralelo (ratio 1.43)
- Quitar el "precio principal = mayor número" — usar primer precio cerca de keyword

**`edificio_mismatch`**:
- Solo flag si la descripción menciona explícitamente OTRO nombre de edificio (regex `Edif(?:icio)?\.? \w+`), no si simplemente no lo menciona

**Quitar `precio_actual_vs_original`**:
- Es esperable cuando admin edita precio manualmente. No es señal de bug.

Estimación: pasaría de 118 issues a ~30-40 con señal limpia.

---

## 🟢 Baja — mejoras de calidad de vida

### 5. Sync automático entre `contenido.descripcion` y `enrichment.descripcion`

Hoy vimos que el merge nocturno (v2.6.0) ya hace este sync, pero updates manuales del admin lo rompen. Propuestas:

- Trigger Postgres que mantenga ambos campos en sync
- O simplemente: que admin actualice ambos al guardar (modificar `usePropertyEditor.ts:755`)

### 6. Tabla `auditoria_descripciones` en Supabase (futuro)

Si el workflow nightly se vuelve recurrente, conviene persistir hallazgos en BD para timeseries:
- ¿Qué props son drift recurrente?
- ¿Qué brokers actualizan más?
- Patrones de cambio (tipo de drift por edificio/zona)

Solo accionable cuando el workflow nightly esté en producción.

### 7. Audit similar para feed `/alquileres`

El audit actual cubre solo `/ventas` (`v_mercado_venta`).

**Pre-requisitos cubiertos (9 May 2026):** la descripción cruda del agente ya se persiste en `datos_json_enrichment.descripcion` para alquiler — misma key que venta. Migración 243 + workflow `Enrichment LLM Alquiler v2.1.0` en producción.

**Trabajo restante (chico):**
- Clonar `lib/db.mjs` cambiando `v_mercado_venta` → `v_mercado_alquiler`.
- Ajustar selectores de precio (`precio_norm` → `precio_mensual` o `precio_mensual_bob` según convenga).
- El extractor por fuente (Remax data-page, C21 og:description, BI block-body) ya está implementado en el workflow productivo — el audit solo necesita re-scrapear y comparar contra `datos_json_enrichment.descripcion` igual que ventas.
- Skill nuevo `/audit-feed-alquileres-mensual` análogo al de ventas.

**Caveat:** el primer audit de alquileres tendrá un % alto de "sin descripción en BD" para las ~146 props pre-9-May (no se hizo backfill — opción A). A medida que esas props caigan del feed por antigüedad o se re-procesen, la cobertura sube.

---

## 🟡 #8 — Híbrido curl/Firecrawl para el drift de ventas (reducir costo, crítico antes de expandir a más macrozonas)

**Contexto (1-jun-2026):** el drift de la mensual de ventas (capa 1) usa **Firecrawl ($1.75/corrida)** porque **C21 venta es un SPA** (la página individual se arma con JS; curl trae HTML vacío). Alquileres hace el mismo drift con **curl ($0)** porque sus 3 portales sirven HTML estático.

**Hallazgo verificado (1-jun):** el `datos_json_discovery` **NO trae la descripción de texto libre** (Remax: solo `listing_information` estructurado — dorms/baños/área; C21: solo `encabezado` + `metaTags` resumidos). Por eso el drift de descripción **requiere re-abrir la página individual** — no se puede derivar gratis del discovery nocturno. (Los cambios de **precio/área estructurados** sí los trae el discovery cada noche → el merge ya los captura; el audit no los necesita.)

**Propuesta — fetcher híbrido por fuente:**
- **Remax venta → curl** (probablemente sirve la página individual en estático, igual que en alquileres). $0.
- **C21 venta → Firecrawl** (inevitable mientras sea SPA).
- Ahorro estimado: ~$1.75 → ~$1.16 (-33%, al sacar las ~111 props Remax del Firecrawl). Clonar el `fetcher.mjs` de alquileres (curl) para Remax venta; dejar `firecrawl.mjs` solo para C21.

**Pre-requisito de verificación:** confirmar con un curl de prueba que **Remax venta sirve la página individual en estático** (la descripción completa, no vacía). Si no la sirve, el híbrido no aplica para Remax.

**⚠️ Motivación de escala (por qué NO postergar indefinidamente):** al expandir el audit a más macrozonas (Zona Norte, Urubó…) el volumen de props crece y **el costo Firecrawl escala linealmente**. Antes de correr audits mensuales sobre más zonas, conviene revisar **caso por caso qué peticiones a Firecrawl son realmente necesarias** (solo C21 SPA) vs cuáles pueden ser curl. Hacerlo ahora evita multiplicar un costo evitable.

**Costo de investigar:** $0. **Prioridad:** media — sube a alta cuando se decida correr el mensual de ventas sobre Zona Norte.

---

## Datos de referencia

### Props procesadas en esta sesión

- Total feed auditado: ~350 props
- Listings inactivos detectados: 7 (5 nuevos + 2 ya marcados)
- Cambios de precio reales corregidos: 9
- Caso crítico TC mal mapeado: 2 (#317 La Riviera, #428 Las Palmeras)
- Cambios menores corregidos: 25
- Cosméticos sin acción: 11
- Descripciones sincronizadas internamente (admin↔enrichment): 21
- Props blindadas con candado: 14

### Costos

- Firecrawl total: ~$1.65 (350 props × $0.005 + verificaciones)
- Reportes guardados en `reports/` (no se commitean por defecto, solo `.gitkeep` y `AUDIT_LOG.md`)

### Reportes generados

- `reports/2026-05-08-00-17-07/` — Batch 1 (50 props más viejas)
- `reports/2026-05-08-01-28-22/` — Batch 2 (50 siguientes)
- `reports/2026-05-08-14-41-17/` — Batch 3 (252 restantes, con bug waitFor)
- `reports/2026-05-08-15-06-55/` — Re-run 41 props con waitFor 5000
- `reports/2026-05-08-15-14-31/` — Re-run 19 props con drift
- `reports/2026-05-08-16-51-27/` — Verificación 25 correcciones
- `reports/internal-2026-05-08-14-30-54/` — Audit interno SQL (118 issues)
- `reports/AUDIT_LOG.md` — Bitácora de acciones aplicadas
