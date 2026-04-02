# Learnings Pipeline Alquiler — Bugs, Fixes y Patrones para Venta

> **Fecha:** 26 Feb 2026
> **Contexto:** Sesión de debugging y curación del Admin Alquileres HITL.
> **Aplicabilidad:** Muchos de estos aprendizajes son transferibles al pipeline de venta.

---

## 1. Absorption Safety: inactivo_confirmed vs expirado_stale

### Problema
Al inactivar propiedades manualmente desde el admin, se contaminan los estudios de absorción. Si una propiedad se marca `inactivo_confirmed` pero en realidad simplemente expiró (no fue alquilada), infla artificialmente la tasa de absorción.

### Solución (migración 164)
Nuevo status `expirado_stale` para propiedades que pasan >150 días sin confirmación del broker:

| Status | Significa | Cuenta como absorción |
|--------|-----------|----------------------|
| `inactivo_confirmed` | Broker confirmó que se alquiló/vendió | **SÍ** |
| `expirado_stale` | Pasó >150 días sin confirmación | **NO** |
| `inactivo_pending` | Flujo C detectó URL caída | Depende (probable absorción) |

### Aplicación a venta
- Venta tiene el mismo riesgo: propiedades que llevan >300 días sin venderse no deberían contarse como "absorbidas" si simplemente desaparecen.
- **Recomendación:** Implementar `expirado_stale` para venta con umbral ~400 días (2x margen sobre vida mediana).
- El `snapshot_absorcion_mercado()` ya ignora `expirado_stale` porque setea `es_activa = false`.

### Ventana de contaminación
- **Alquiler:** Absorción confiable a partir de ~14 Mar 2026 (pipeline activo desde 12 Feb, 30 días de backlog para limpiar).
- Cualquier inactivación manual ANTES de esa fecha no afecta métricas porque ya están contaminadas.
- **Lección:** Al lanzar un pipeline nuevo, definir la ventana de contaminación desde el día 1.

---

## 2. fecha_discovery vs fecha_publicacion — Conceptos distintos

### Problema (migración 165)
`registrar_discovery_alquiler()` ejecuta cada noche y hacía `fecha_discovery = NOW()` en el UPDATE. Esto causaba:
- Bien Inmuebles (sin `fecha_publicacion`) → `días_en_mercado = 0` siempre
- C21/Remax no se afectaban porque usan `fecha_publicacion` para calcular días

### Conceptos
| Campo | Significado | Quién lo tiene |
|-------|-------------|----------------|
| `fecha_publicacion` | Cuándo el portal publicó el listing | C21 ✅, Remax ✅, BI ❌ |
| `fecha_discovery` | Cuándo SICI lo encontró por primera vez | Todos ✅ |

**`fecha_publicacion ≠ fecha_discovery`** — Un listing puede estar publicado hace 30 días pero SICI lo descubre hoy.

### Fix
```sql
-- En registrar_discovery_alquiler() UPDATE:
fecha_discovery = CASE
    WHEN p_fecha_publicacion IS NOT NULL THEN NOW()  -- C21/Remax: tienen fecha_pub
    ELSE fecha_discovery                              -- BI: sin fecha_pub, conservar original
END,
```

Fix retroactivo:
```sql
UPDATE propiedades_v2
SET fecha_discovery = fecha_creacion
WHERE fuente = 'bien_inmuebles'
  AND tipo_operacion = 'alquiler'
  AND fecha_creacion < fecha_discovery;
```

### Aplicación a venta
- `registrar_discovery()` de venta tiene el mismo patrón: `fecha_discovery = NOW()` en cada UPSERT.
- Actualmente no es problema porque C21/Remax siempre traen `fecha_publicacion`.
- **Si se agrega una fuente sin `fecha_publicacion` a venta, aplicar el mismo fix.**
- Principio: `fecha_discovery` debe ser inmutable después del INSERT inicial, a menos que la fuente tenga su propia fecha de publicación.

---

## 3. Filtro de antigüedad: calibrar con datos reales

### Problema
El filtro inicial era 180 días (arbitrario). Después de medir vida mediana real:
- C21: 34 días mediana
- Remax: 73 días mediana
- Regla: filtro = ~2x la fuente más lenta

### Resultado (migración 163)
- Alquiler: 180 → **150 días** (2x Remax)
- Venta: 300 días (730 para preventa) — ya calibrado

### Lección
- **SIEMPRE medir vida mediana real antes de definir filtros de antigüedad.**
- Query para medir vida mediana de listings inactivos:
```sql
SELECT fuente,
  PERCENTILE_CONT(0.5) WITHIN GROUP (
    ORDER BY CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date)
  ) AS mediana_dias
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'  -- o 'venta'
  AND status = 'inactivo_confirmed'
GROUP BY fuente;
```

---

## 4. Paths JSON por fuente — Documentar ANTES de codificar

### Problema
Al crear el Admin HITL, se asumieron paths JSON incorrectos:
- Fotos Remax/BI: se usó `datos_json_enrichment.fotos_urls` pero el path real es `datos_json_enrichment.llm_output.fotos_urls`
- Fuente C21: se usó `'c21'` pero en BD es `'century21'`

### Paths correctos (alquiler)

**Fotos:**
| Fuente | Path |
|--------|------|
| C21 | `datos_json_discovery.fotos.propiedadThumbnail[0]` |
| Remax | `datos_json_enrichment.llm_output.fotos_urls[0]` |
| Bien Inmuebles | `datos_json_enrichment.llm_output.fotos_urls[0]` |
| Fallback BI | `'https://www.bieninmuebles.com.bo/admin/uploads/catalogo/pics/' + datos_json_discovery.nomb_img` |

**Agente:**
| Fuente | Nombre | Teléfono/WA |
|--------|--------|-------------|
| C21 | `datos_json_discovery.asesorNombre` | `datos_json_discovery.whatsapp` |
| Remax | `datos_json_discovery.agent.user.name_to_show` | `datos_json_discovery.agent.user.phone` |
| BI | `datos_json_discovery.amigo_clie` | `datos_json_enrichment.llm_output.agente_telefono` |

**Valores de `fuente` en BD:** `century21`, `remax`, `bien_inmuebles` (NO `c21`, NO `bi`).

### Lección
- **Verificar SIEMPRE los valores reales en BD antes de hardcodear.**
- Query de verificación rápida:
```sql
SELECT fuente, COUNT(*),
  LEFT(datos_json_discovery::text, 200),
  LEFT(datos_json_enrichment::text, 200)
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler'
GROUP BY fuente
LIMIT 5;
```

---

## 5. Status activos: no es solo 'completado'

### Problema
El filtro de "activos" solo buscaba `status = 'completado'`, pero en BD hay:
- `completado` (mayoría)
- `actualizado` (re-descubiertos con cambios)
- `nueva` (recién descubiertos, pre-merge)

### Fix
```typescript
// MAL
const activos = data.filter(p => p.status === 'completado' && p.es_activa);

// BIEN
const activos = data.filter(p => !p.status.startsWith('inactivo') && !['expirado_stale', 'excluido_operacion'].includes(p.status) && p.es_activa);
```

### Aplicación a venta
- Venta tiene los mismos status. Verificar que dashboards no filtren solo por `completado`.

---

## 6. Búsqueda por ID debe ignorar filtros

### Problema
Cuando el usuario busca por `#784` o `880, 883`, los filtros de status/zona/dormitorios siguen activos. Si la propiedad es inactiva, no aparece aunque se busque por ID.

### Fix
Detectar búsqueda por ID (uno o múltiples) y saltear TODOS los filtros:
```typescript
const isIDSearch = /^\d+([\s,]+\d+)*$/.test(searchTerm.replace(/#/g, ''));
if (isIDSearch) {
  // Solo filtrar por IDs, ignorar status/zona/dorms/etc.
}
```

### Lección
- **Búsqueda por ID es un "override" — el usuario sabe lo que busca.**
- Soportar formatos: `#784`, `784`, `882, 884, 881`, `882 884 881`.

---

## 7. Discovery UPSERT: cuidado con campos que deben ser inmutables

### Principio general
En el UPSERT del discovery, hay campos que solo deben setearse en el INSERT y NUNCA actualizarse:

| Campo | INSERT | UPDATE |
|-------|--------|--------|
| `fecha_discovery` | `NOW()` | **Preservar** (salvo que fuente tenga `fecha_publicacion`) |
| `fecha_creacion` | `NOW()` | **Nunca tocar** |
| `url` | Valor | **Nunca tocar** (es parte del UNIQUE) |
| `fuente` | Valor | **Nunca tocar** (es parte del UNIQUE) |

### Campos que SÍ se actualizan en cada discovery
- `precio_*` (puede cambiar)
- `datos_json_discovery` (contenido fresco)
- `fecha_actualizacion` (siempre NOW())
- `es_activa` (reactivar si se redescubre)
- `status` (reactivar si estaba inactivo/expirado)

### Aplicación a venta
- Revisar `registrar_discovery()` de venta y verificar que `fecha_discovery` se preserva correctamente.
- El mismo principio aplica: si se agrega una fuente sin `fecha_publicacion`, el discovery no debe pisar `fecha_discovery`.

---

## 8. expirado_stale reactivación

### Comportamiento deseado
Si una propiedad `expirado_stale` se redescubre en el siguiente discovery nocturno:
```sql
-- En registrar_discovery_alquiler():
status = CASE
    WHEN status IN ('excluido_operacion', 'inactivo_pending', 'expirado_stale')
    THEN 'nueva'::estado_propiedad
    WHEN status = 'completado' THEN 'actualizado'::estado_propiedad
    ELSE status
END
```

**No reactivar `inactivo_confirmed`** — ese es definitivo (broker confirmó).

---

## 9. localStorage para tracking de envíos (patrón broker-share)

### Patrón
```typescript
const STORAGE_KEY = 'admin_alquileres_sent_v1';

// Guardar
const sent = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
sent[propId] = new Date().toISOString().slice(0, 10); // '2026-02-26'
localStorage.setItem(STORAGE_KEY, JSON.stringify(sent));

// Leer
const sentDate = sent[propId]; // null si no enviado
```

### Migración desde otro sistema
Al migrar de `broker-share.html`, pre-seedear datos existentes:
```typescript
const MIGRATION_KEY = 'admin_alquileres_migrated_v1';
if (!localStorage.getItem(MIGRATION_KEY)) {
  const preSeeded = { 784: '2026-02-25', 882: '2026-02-24', ... };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preSeeded));
  localStorage.setItem(MIGRATION_KEY, 'true');
}
```

---

## 10. Cascade de fotos — orden de prioridad

```
1. datos_json → contenido → fotos_urls         (merge manual)
2. datos_json_enrichment → llm_output → fotos_urls  (enrichment LLM)
3. datos_json_discovery → default_imagen → url       (Remax, 1 foto)
4. datos_json_discovery → fotos → propiedadThumbnail (C21, múltiples)
5. bieninmuebles.com.bo/admin/uploads/catalogo/pics/ + nomb_img  (BI, 1 foto)
```

**Importante:** `merge_alquiler()` NO copia fotos a `datos_json.contenido`. Siempre leer de `datos_json_enrichment.llm_output.fotos_urls` como fuente principal.

---

## Resumen de migraciones relacionadas

| Migración | Problema | Fix |
|-----------|----------|-----|
| 163 | Filtro antigüedad arbitrario 180d | Reducir a 150d basado en vida mediana real |
| 164 | Inactivar contamina absorción | Nuevo status `expirado_stale` |
| 165 | BI: días_en_mercado = 0 siempre | Preservar `fecha_discovery` si fuente sin `fecha_publicacion` |

---

## 11. Discovery Remax: moneda USD no se convertía a BOB

### Problema (fix 2 Apr 2026)
El nodo "Procesar Alquileres" del workflow Remax pasaba `prop.precio_bob` (campo `price.amount` del API) directo a `p_precio_mensual_bob`. Pero para listings con `currency_id = 2` (USD), `price.amount` contiene el monto en USD, no BOB.

**Resultado:** 26 propiedades Remax con `moneda_original = 'USD'` tenían `precio_mensual_bob = precio_mensual_usd` (mismo número). El feed mostraba "Bs 646/mes" cuando el depto cuesta Bs 4.500/mes.

### Evidencia
- `price.amount = price.price_in_dollars` (idénticos) para `currency_id = 2`
- Valores como `502.87 × 6.96 = 3,500 Bs` exacto confirman que dueños piden en BOB y Remax convierte a USD
- 18.2% del feed visible afectado (25/137 props activas)
- Bug existía desde dic 2025 (fecha_creacion de las props más antiguas)

### Fix
**Workflow n8n** (nodo "Procesar Alquileres"):
```javascript
// Antes (buggy):
p_precio_mensual_bob: prop.precio_bob,
p_precio_mensual_usd: prop.precio_usd,

// Después:
p_precio_mensual_bob: prop.moneda_original === 'USD'
    ? Math.round(prop.precio_usd * 6.96 * 100) / 100
    : prop.precio_bob,
p_precio_mensual_usd: prop.moneda_original === 'BOB'
    ? Math.round(prop.precio_bob / 6.96 * 100) / 100
    : prop.precio_usd,
```

**Backfill** (26 rows):
```sql
UPDATE propiedades_v2
SET precio_mensual_bob = ROUND(precio_mensual_usd * 6.96, 2)
WHERE tipo_operacion = 'alquiler'
  AND fuente = 'remax'
  AND moneda_original = 'USD'
  AND precio_mensual_bob = precio_mensual_usd
  AND precio_mensual_usd > 0;
```

### Impacto colateral
- Promedio mercado alquiler subdeclarado ~14% (Bs 4.936 → Bs 5.635 corregido)
- Slider precio, ordenamiento, WhatsApp leads, Market Pulse contaminados
- Villa Brígida (36%) y Eq. Norte (19%) las zonas más afectadas proporcionalmente

### Lección
- **Siempre verificar qué contiene cada campo del API según la moneda.** `price.amount` no siempre es BOB.
- El nodo "Extraer Propiedades" ya detectaba `moneda_original` correctamente (`currency_id === 1 ? 'BOB' : 'USD'`), pero "Procesar Alquileres" no usaba esa info para convertir.
- **Patrón:** si un extractor detecta moneda, el nodo de preparación DEBE normalizar ambas columnas (BOB y USD) antes de pasar a la función SQL.

---

## Checklist para agregar nueva fuente (alquiler o venta)

1. [ ] Verificar moneda del API y convertir USD↔BOB en el nodo de preparación (Learning 11)
2. [ ] Verificar si la fuente tiene `fecha_publicacion` propia
2. [ ] Si NO tiene → asegurar que discovery preserve `fecha_discovery` en UPDATE
3. [ ] Documentar paths JSON (fotos, agente, teléfono, precio)
4. [ ] Verificar valor exacto de `fuente` en BD
5. [ ] Agregar branches de fotos en la RPC (`buscar_unidades_*`)
6. [ ] Agregar branches de agente en la RPC
7. [ ] Calibrar filtro de antigüedad con vida mediana real de la nueva fuente
8. [ ] Definir ventana de contaminación de absorción desde fecha de lanzamiento
