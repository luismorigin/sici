# CONTRATO CANONICAL — FLUJO C: VERIFICADOR DE AUSENCIAS

**Versión:** 5.0
**Fecha:** 22 Mar 2026
**Estado:** PRODUCCIÓN (venta desde 18 Dic 2025, alquiler desde 12 Feb 2026)

---

## RESPONSABILIDAD ÚNICA

Confirmar las ausencias marcadas por Discovery. Existen **dos workflows separados** con estrategias distintas:

- **Venta:** Solo auto-confirmación por tiempo (2 días). HTTP no se usa — Remax devuelve 200 genérico (SPA), igual que C21.
- **Alquiler:** HTTP HEAD + auto-confirmación por tiempo (7 días) + ghost detection.

---

## DOS WORKFLOWS, DOS ESTRATEGIAS

| Aspecto | Venta (6:00 AM) | Alquiler (7:00 AM) |
|---------|-----------------|-------------------|
| **Archivo** | `modulo_1/flujo_c_verificador_v1.1.0_FINAL.json` | `alquiler/flujo_c_verificador_alquiler_v1.0.0.json` |
| **Fuentes** | Solo Remax venta (C21 excluido) | Todas (sin filtro fuente) |
| **Método** | Solo tiempo (sin HTTP) | HTTP HEAD + tiempo |
| **Auto-confirma** | 2 días | 7 días |
| **Reactivación** | No (Discovery se encarga) | Sí (HTTP 200 → completado) |
| **Ghost detection** | No | Sí (completado + es_activa + >14 días) |
| **LIMIT** | 200 | 100 (20 ghost + resto pending) |

---

## VENTA: SOLO REMAX, SOLO TIEMPO

### Por qué no se usa HTTP (BUG-001)

Tanto C21 como Remax devuelven HTTP 200 con página genérica para propiedades removidas. Remax es una SPA que sirve el mismo shell HTML para cualquier URL. No hay señal HTTP confiable para distinguir "existe" de "fue removida" en ningún portal boliviano.

**Discovery es la fuente de verdad:** si una propiedad reaparece en el API de Remax, `registrar_discovery()` la reactiva automáticamente vía `determinar_status_post_discovery(inactivo_pending → actualizado)`. Incluso `inactivo_confirmed` se reactiva si Discovery la encuentra.

### Query de entrada (venta)

```sql
SELECT id, url, fuente, codigo_propiedad, status, primera_ausencia_at,
       EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia
FROM propiedades_v2
WHERE status = 'inactivo_pending'::estado_propiedad
  AND fuente = 'remax'
  AND tipo_operacion = 'venta'
ORDER BY primera_ausencia_at ASC
LIMIT 200;
```

### Lógica de decisión (venta)

```
1. primera_ausencia_at IS NULL  → SKIP (datos inconsistentes)
2. dias_desde_ausencia >= 2     → CONFIRM (auto-confirmación por tiempo)
3. dias_desde_ausencia < 2      → SKIP (esperar)
```

No hay reactivación por HTTP. Si la propiedad reaparece, Discovery la reactiva en el siguiente ciclo nocturno.

### Updates (venta)

```sql
-- CONFIRMAR BAJA (único update posible)
UPDATE propiedades_v2
SET status = 'inactivo_confirmed', es_activa = FALSE, fecha_actualizacion = NOW()
WHERE id = $1 AND status = 'inactivo_pending';
```

---

## ALQUILER: TODAS LAS FUENTES + GHOST DETECTION

### Diferencia clave: dual mode

El verificador alquiler procesa dos tipos de propiedades:

1. **Pending** — `inactivo_pending` estándar (como venta)
2. **Ghost** — propiedades `completado` + `es_activa=true` con discovery >14 días que podrían ya no existir

Los ghosts son alquileres que Discovery nunca marcó como ausentes (quizás cambiaron de URL o la fuente dejó de listarlos sin señal clara). El verificador los detecta proactivamente.

### Query de entrada (alquiler)

```sql
WITH pending AS (
  SELECT id, url, fuente, codigo_propiedad, status, primera_ausencia_at,
         EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia,
         'pending' as origen
  FROM propiedades_v2
  WHERE status = 'inactivo_pending'::estado_propiedad
    AND tipo_operacion = 'alquiler'
),
ghost AS (
  SELECT id, url, fuente, codigo_propiedad, status,
         fecha_discovery as primera_ausencia_at,
         EXTRACT(DAY FROM NOW() - fecha_discovery)::INTEGER as dias_desde_ausencia,
         'ghost' as origen
  FROM propiedades_v2
  WHERE status = 'completado'
    AND tipo_operacion = 'alquiler'
    AND es_activa = true
    AND fecha_discovery < NOW() - INTERVAL '14 days'
    AND url NOT LIKE '%empty_%'
  ORDER BY fecha_discovery ASC
  LIMIT 20
)
SELECT * FROM pending
UNION ALL
SELECT * FROM ghost
ORDER BY origen, dias_desde_ausencia DESC
LIMIT 100;
```

### Lógica de decisión (alquiler)

**Para pending:**
```
1. dias_desde_ausencia >= 7  → CONFIRM
2. HTTP 404                  → CONFIRM
3. HTTP 200                  → REACTIVATE (status='completado', limpiar primera_ausencia_at)
4. HTTP 301/302              → SKIP
5. Error/timeout             → SKIP
```

**Para ghost:**
```
1. HTTP 404                  → CONFIRM (confirmar baja del ghost)
2. HTTP 200                  → SKIP (ghost sigue listado, no hacer nada)
3. Cualquier otro            → SKIP (inconcluso)
```

### Updates (alquiler)

```sql
-- CONFIRMAR BAJA (pending + ghost)
UPDATE propiedades_v2
SET status = 'inactivo_confirmed', es_activa = FALSE,
    fecha_inactivacion = COALESCE(primera_ausencia_at, NOW()),
    razon_inactiva = 'aviso_terminado', fecha_actualizacion = NOW()
WHERE id = $1 AND es_activa = TRUE;

-- REACTIVAR (solo pending, nunca ghost)
UPDATE propiedades_v2
SET status = 'completado'::estado_propiedad, primera_ausencia_at = NULL,
    es_activa = TRUE, fecha_inactivacion = NULL, razon_inactiva = NULL,
    fecha_discovery = NOW(), fecha_actualizacion = NOW()
WHERE id = $1 AND status = 'inactivo_pending'::estado_propiedad;
```

---

## ESTADOS Y TRANSICIONES

```
                    Discovery marca ausencia
                            │
                            ▼
                    ┌─────────────────┐
                    │ inactivo_pending │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
     >= 2 días (venta)  HTTP 404 (alq)   HTTP 200 (alq)
     >= 7 días (alq)    ghost 404 (alq)  (pending only)
            │                │                │
            ▼                ▼                ▼
    ┌───────────────┐  ┌───────────────┐  ┌──────────┐
    │  inactivo_    │  │  inactivo_    │  │completado│ (alquiler)
    │  confirmed    │  │  confirmed    │  └──────────┘
    └───────────────┘  └───────────────┘

    Discovery reaparece propiedad → registrar_discovery() → actualizado
    (aplica tanto a inactivo_pending como inactivo_confirmed)
```

### Campos involucrados

| Campo | Propósito |
|-------|-----------|
| `status` | enum `estado_propiedad` |
| `es_activa` | Flag de actividad (false en confirmed) |
| `primera_ausencia_at` | Timestamp de Discovery (se limpia en reactivación) |
| `fecha_inactivacion` | Solo alquiler: cuándo se confirmó la baja |
| `razon_inactiva` | Solo alquiler: `'aviso_terminado'` |

---

## CONTRATOS CON OTROS COMPONENTES

### Con Discovery (Flujo A)

- **Recibe:** propiedades en `inactivo_pending` con `primera_ausencia_at` poblado
- **Devuelve:** `inactivo_confirmed` o reactivadas
- **Colaboración:** Discovery puede re-marcar como ausente si reaparece y luego desaparece otra vez

### Con Matching

- Matching solo procesa `status = 'completado'`
- `inactivo_pending` e `inactivo_confirmed` están excluidas automáticamente

### Con Estudios de Mercado

- Estudios usan `primera_ausencia_at` para calcular "días en mercado"
- La fecha de confirmación de Flujo C es irrelevante para análisis
- `buscar_unidades_reales()` filtra por `es_activa = true` (excluye confirmed)

### Con buscar_unidades_alquiler()

- Filtro de 150 días (migración 163) excluye propiedades viejas del resultado
- Este filtro es independiente de Flujo C — opera sobre `fecha_publicacion`/`fecha_discovery`

---

## GARANTÍAS

- **Idempotente:** puede correr múltiples veces sin efecto
- **No usa HTTP para venta:** señal no confiable en portales bolivianos (SPA)
- **Auto-confirma a 2 días (venta) / 7 días (alquiler):** no deja pending indefinidamente
- **Discovery como safety net:** si la propiedad reaparece en el API, se reactiva automáticamente
- **Ghost detection** (solo alquiler): detecta propiedades que Discovery no captura

## LIMITACIONES

- **C21 venta queda en pending** hasta que Discovery las vuelva a encontrar o el admin las gestione manualmente. C21 no está en el scope del verificador (HTTP inútil).
- **`expirado_stale` nunca se implementó** (migración 164 no agregó el valor al enum). Las propiedades viejas no se transicionan a un status especial — simplemente dejan de aparecer en queries por el filtro de 150/300 días
- **HTTP no confiable:** Remax (SPA) y C21 devuelven HTTP 200 para propiedades removidas. Solo alquiler usa HTTP porque las fuentes de alquiler sí devuelven 404.

---

## MÉTRICAS (ambos workflows)

Cada ejecución registra en `workflow_executions`:
- Total procesadas
- Confirmadas (HTTP 404 + auto-confirmación)
- Reactivadas (HTTP 200)
- Skipped (redirects, errores, ghosts inconclosos)
- Ghosts detectados (solo alquiler)

---

## PRODUCCIÓN (28 Feb 2026)

| Tipo | inactivo_pending | inactivo_confirmed | Total |
|------|-----------------|-------------------|-------|
| Venta C21 | 62 | 129 | 191 |
| Venta Remax | 32 | 22 | 54 |
| Alquiler C21 | 0 | 79 | 79 |
| Alquiler Remax | 10 | 37 | 47 |
| Alquiler BI | 0 | 2 | 2 |

**Nota:** C21 venta tiene 62 pending porque Flujo C no las procesa. Alquiler C21 tiene 0 pending porque el verificador alquiler procesa todas las fuentes.

---

## CHANGELOG

**v5.0 — 22 Mar 2026 (BUG-001 fix):**
- Eliminado HTTP check para venta — Remax devuelve 200 genérico (SPA)
- `MAX_DIAS_PENDING` reducido de 7 a 2 para venta
- Agregado filtro `AND tipo_operacion = 'venta'` a la query
- Logging dinámico en `registrar_ejecucion_workflow` (antes hardcodeado a 0)
- Eliminada reactivación por HTTP para venta — Discovery es el safety net
- Ver `docs/bugs/BUG_001_verificador_venta_inactivo.md` para detalle completo

**v4.0 — 28 Feb 2026:**
- Reescritura completa verificada contra JSONs de producción
- Documentado workflow alquiler (dual mode: pending + ghost)
- Corregido: venta solo procesa Remax (no "universal"), LIMIT 200
- Corregido: venta no filtra `tipo_operacion` (solo `fuente = 'remax'`)
- Agregado: ghost detection, diferencias venta/alquiler
- Nota: `expirado_stale` nunca desplegado

**v3.0 — 18 Dic 2025:**
- Auto-confirmación por tiempo, reactivación HTTP 200
- Implementación en producción (solo venta)

**v2.0 — Dic 2024:**
- Confiabilidad por fuente, simplificado a confirmador técnico

**v1.0 — Inicial:**
- Concepto básico de verificación HTTP
