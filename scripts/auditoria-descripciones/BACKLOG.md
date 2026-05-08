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

### 3. Workflow nightly de auditoría (Opción A discutida)

Hoy hice el audit a mano. Para que se mantenga:

**Diseño propuesto:**
- Workflow n8n nuevo, corre cada noche
- Procesa 1/7 del feed por noche (rotativa) — 50 props/noche para 350 totales
- Detecta drift: similitud < 90% o flags semánticos
- Si detecta drift:
  - Setea `fecha_enrichment = NULL` para que el flujo nocturno re-procese
  - Si el precio_usd está bloqueado pero la descripción del portal tiene precio distinto, **dispara alerta a Slack al admin** con el diff
- Si detecta listing muerto (HTML vacío con 200 OK), marca `inactivo_pending`

**Costo**: ~$0.25/noche × 30 = **$7.50/mes** Firecrawl. Despreciable.

**Componentes a portar al workflow**:
- `lib/firecrawl.mjs` (cliente con retry)
- `lib/extractor.mjs` (C21/Remax descripción)
- `lib/similarity.mjs` (Levenshtein + flags semánticos)

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

El audit actual cubre solo `/ventas` (`v_mercado_venta`). Sería trivial replicarlo para alquileres (cambiar query a `v_mercado_alquiler`, ajustar extractor para Bien Inmuebles).

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
