# BUG: Falsos positivos Remax — Props activas marcadas inactivo_confirmed

**Fecha:** 13 Abril 2026
**Severidad:** CRITICA — contamina rotación, absorción, conteos de mercado
**Estado:** Diagnosticado, fix pendiente

---

## Resumen

11 de 23 propiedades Remax marcadas como `inactivo_confirmed` en Equipetrol Centro (últimos 30 días) siguen activas en el portal (HTTP 200). Tasa de falsos positivos: ~48%.

**IDs confirmados (HTTP 200 = siguen vivas):** 53, 56, 68, 905, 921, 980, 1160, 1183, 1307, 1309, 1310

## Cómo se descubrió

Durante la construcción de herramientas de estudio de mercado (`scripts/estudio-mercado/`), se hizo un batch HTTP check de las 59 props en rotación de Eq. Centro para verificar la calidad de los datos.

```bash
# Remax: 200 = activa, 302 = realmente eliminada
curl -s -o /dev/null -w "%{http_code}" -m 10 "URL"
```

C21 estaba caído al momento del test (18 URLs sin verificar, todas dieron timeout 000).

## Investigación del pipeline

### 1. Primera hipótesis: Verificador HTTP mal configurado

El verificador v2.0 usa `maxRedirects: 0` y marca como inactiva si Remax responde 302. Pero los falsos positivos tienen `razon_inactiva = 'aviso_terminado'` (9 de 11), no `audit_remax_redirect`. Esto descarta el audit HTTP como causa.

```sql
SELECT razon_inactiva, COUNT(*)
FROM propiedades_v2
WHERE id IN (53, 921, 1309, 56, 1310, 1307, 68, 905, 980, 1183, 1160)
GROUP BY razon_inactiva;
-- aviso_terminado: 9
-- NULL: 2
```

### 2. Segunda hipótesis: Discovery no reactiva

`aviso_terminado` viene del path "pending" del verificador: discovery no encontró la prop → `primera_ausencia_at` → 2 días después verificador confirma sin HTTP check.

Se verificó que la lógica de reactivación EXISTE y es correcta:

**`determinar_status_post_discovery()`:**
```sql
WHEN 'inactivo_confirmed' THEN RETURN 'actualizado';
```

**`registrar_discovery()` PASO 3 (UPDATE):**
```sql
status = v_status_nuevo,  -- sería 'actualizado'
es_activa = TRUE,         -- reactivaría
```

**Workflow n8n** (`flujo_a_discovery_remax_v1.0.2_FINAL.json`, línea 205):
- SÍ usa `registrar_discovery()` para props encontradas
- El path "Marcar Ausentes" (línea 275) excluye `inactivo_confirmed` correctamente

### 3. Tercera hipótesis (confirmada): Race condition entre pipelines

Las 11 props tienen:
```
fecha_discovery       = 2026-04-12 09:00  (discovery las encontró)
fecha_actualizacion   = 2026-04-12 14:06  (algo las tocó 5h después)
status                = inactivo_confirmed (siguen inactivas)
es_activa             = false
```

**La secuencia es:**
1. 09:00 — Discovery Remax las encuentra → `registrar_discovery()` → las reactiva (`actualizado`, `es_activa = TRUE`)
2. 14:06 — OTRO PROCESO las vuelve a marcar como `inactivo_confirmed` + `es_activa = FALSE`

No hay registro en `workflow_executions` de qué corrió a las 14:06. Puede ser:
- Merge que pisa `es_activa`/`status`
- Verificador que corre dos veces
- Ejecución manual en n8n

### 4. Qué NO es el problema

- `registrar_discovery()` — lógica correcta, reactiva bien
- `determinar_status_post_discovery()` — maneja `inactivo_confirmed` → `actualizado`
- "Marcar Ausentes" — excluye `inactivo_confirmed` correctamente
- HTTP check del audit — no es la causa (9/11 son `aviso_terminado`, no `audit_remax_redirect`)

## Historial de intentos previos

| Fecha | Commit | Qué se hizo | Resultado |
|---|---|---|---|
| Feb 11 | ed1a9a2 | Fix: discovery no seteaba `primera_ausencia_at` | Parcial — 167 props afectadas |
| Mar 22 | 42bf8e1 | BUG-001: verificador procesaba 0 records. Remax HTTP 200 = SPA shell (no confiable) | Eliminó HTTP checks para pending |
| Mar 23 | 908490c, mig 199 | Fix filtro C21 (`fuente = 'remax'` excluía C21). Backfill absorción | 131 C21 confirmadas |
| Abr 6 | 6803626, 04c5b42 | Verificador v2.0: pending auto-confirm 2d + audit HTTP. Sin reactivación en verificador | Diseño "discovery es fuente de verdad" |
| Abr 13 | 1a77bd3, mig 211 | Fix absorción: filtros alineados, sin 300d en inventario | Snapshot v3 |

Cada vez se descubre una capa nueva del problema.

## ROOT CAUSE CONFIRMADO (15 Abr 2026) — Migración 215

**Causa raíz:** `registrar_discovery()` no limpia `primera_ausencia_at` ni `razon_inactiva` al re-encontrar una prop inactiva. Esto crea una cadena:

1. Prop va ausente → `primera_ausencia_at = NOW()` (e.g. 20 Mar)
2. Verificador auto-confirma tras 2 días → `inactivo_confirmed`
3. Discovery la re-encuentra → `es_activa = true`, `status = actualizado`, **pero `primera_ausencia_at` queda = 20 Mar**
4. Merge → `status = completado`
5. Scraper la pierde una noche (paginación intermitente) → "Marcar Ausentes": `inactivo_pending`, `COALESCE(primera_ausencia_at, NOW()) = 20 Mar` (preserva valor viejo)
6. Verificador: `dias_desde_ausencia = 26 días` → auto-confirma **inmediatamente** en vez de dar 2 días

**Descartado:**
- Merge: NO toca `es_activa` ni pone `inactivo_confirmed` (solo procesa `nueva`/`actualizado` → `completado`)
- Discovery "Marcar Ausentes": correctamente excluye `inactivo_confirmed` de urlsBD y del UPDATE
- Verificador doble: cron es `0 6 * * *` (1x/día), coincide con timestamps 10:00 UTC

**Datos al momento del fix:**
- 57/118 Remax activas (48%) tenían `primera_ausencia_at` stale (24-26 días)
- 2/286 C21 afectadas (0.7%)
- 6 props auto-confirmadas como falso positivo solo el 15 Abr

**Fix (migración 215):**
1. `registrar_discovery()`: agregar `primera_ausencia_at = NULL, razon_inactiva = NULL` en PASO 3
2. Cleanup one-time: limpiar 59 props activas con datos stale

**Seguridad absorción:** Verificado — absorption snapshots solo cuentan `status = 'inactivo_confirmed'`. El cleanup toca `status = 'completado'`. Conjuntos disjuntos.

**Estado:** RESUELTO (pendiente deploy migración 215)

## Impacto en estudios de mercado

La rotación reportada (56 salidas en 30d en Eq. Centro) está inflada ~30-50% por estos falsos positivos. Las herramientas de `scripts/estudio-mercado/` incluyen caveats pero los datos subyacentes son menos confiables de lo esperado. Post-fix, la absorción debería estabilizarse en ~2 semanas (30d rolling window).

## Archivos relevantes

| Archivo | Qué contiene |
|---|---|
| `n8n/workflows/modulo_1/flujo_a_discovery_remax_v1.0.2_FINAL.json` | Discovery Remax — línea 205 (registrar_discovery), línea 275 (Marcar Ausentes) |
| `n8n/workflows/modulo_1/flujo_c_verificador_v2.0.0.json` | Verificador venta v2.0 |
| `n8n/workflows/modulo_1/FLUJO_C_VERIFICADOR_V2.md` | Doc del verificador con lógica de decisión |
| `sql/functions/discovery/registrar_discovery.sql` | Función SQL — PASO 3 UPDATE con reactivación |
| `sql/functions/helpers/determinar_status_post_discovery.sql` | Lógica de transición de status |
