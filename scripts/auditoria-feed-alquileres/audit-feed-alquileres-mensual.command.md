---
description: Audit mensual del feed /alquileres — drift fetcher (curl) + inconsistencias internas + matching audit. Genera reporte ejecutivo con análisis humano.
---

# Audit mensual — feed /alquileres

Auditoría completa del feed cruzando 3 capas:

1. **Capa 1 — Drift fetcher (curl directo)**: re-scrapea las props vivas y compara descripción guardada (`datos_json_enrichment.descripcion`) vs portal actual.
2. **Capa 2 — Inconsistencias internas**: detecta desincronizaciones entre `precio_mensual_bob`, `area_total_m2` (v1.4), `nombre_edificio` y la descripción cruda.
3. **Capa 3 — Audit matching**: verifica que `nombre_edificio` BD aparece en slug/title/desc del listing, usando `proyectos_master.alias_conocidos`.

**Diferencias vs `/audit-feed-ventas-mensual`:**
- **Costo $0** (curl directo, sin Firecrawl). Los 3 portales sirven HTML estático suficiente para alquiler.
- **Sin TC paralelo** (alquiler usa precio_mensual_bob como fuente de verdad).
- **Capa 2 (v1.4)**: precio cruda↔BD + **área cruda↔BD** (NUEVO) + otro edificio mencionado, todos con verificación por lectura del agente (capa anti-FP sobre el regex).

## Argumentos

- (sin argumentos) — corrida normal con curl, costo $0
- `--use-cached <run-dir>` — re-procesa un reporte previo (instantáneo, para test)
- `--skip-insert` — no escribe a Supabase (útil si la migración 244 no está aplicada)

## Flujo de ejecución

Cuando el usuario invoca `/audit-feed-alquileres-mensual` (con o sin args):

### 1. Ejecutar el orquestador

Correr desde `scripts/auditoria-feed-alquileres/`:

```powershell
cd "C:\Users\LUCHO\Desktop\Censo inmobiliario\sici\scripts\auditoria-feed-alquileres"
node audit-feed-alquileres-mensual.mjs $ARGUMENTS
```

Si el usuario pasó argumentos (ej. `--use-cached mensual-2026-05-10-...`), reemplazar `$ARGUMENTS`. Si no, correr sin args.

**Tiempo:** ~30-60 segundos para ~141 props (curl es mucho más rápido que Firecrawl).

### 2. Leer los outputs

El orquestador genera 3 archivos en `reports/mensual-<timestamp>/`:

- `combined.json` — detalle por prop (las 3 capas combinadas)
- `meta.json` — stats + runId DB
- `summary.md` — reporte ejecutivo bruto

Leer los 3.

### 3. Análisis humano (acá está el valor)

**No te quedes con el reporte bruto del script.** Procesalo con contexto.

#### Ruido conocido (filtrar/agrupar)

- **Sin cruda en BD** (campo `len_bd=0`): props enriquecidas pre-9-may sin backfill aplicado. Si hay muchas, sugerir correr `npm run backfill`. NO accionar individualmente.
- **HTML entities** (`&nbsp;`, `&amp;` en `palabras_quitadas`): cosmético del render del portal, no es drift real.
- **Cambios de mes/fecha de disponibilidad** ("disponible 22 marzo" → "disponible 5 mayo"): es ruido editorial sin señal comercial.

#### Patrones críticos (siempre reportar)

- **Cambio de precio mensual real**: `precio_mensual_bob` BD ≠ precio en desc, diff >5% (issue `precio_mensual_mismatch_desc`). SQL listo:
  - `UPDATE propiedades_v2 SET precio_mensual_bob = X, fecha_actualizacion = NOW() WHERE id = Y;`
- **Área mal extraída** (v1.4): `area_total_m2` BD ≠ área en desc, diff >10% (issue `area_mismatch_desc`). El área cambia precio/m² y comparables. SQL: `UPDATE propiedades_v2 SET area_total_m2 = X, fecha_actualizacion = NOW() WHERE id = Y;`
- **Listings muertos**: `bucket='reescrita'` con `len_scraped=0` (HTTP 200 pero HTML sin descripción).
  - SQL: `UPDATE propiedades_v2 SET status='inactivo_pending', fecha_actualizacion=NOW() WHERE id IN (...);`
- **Cambio de amoblado/sin amoblar**: flag `amoblado_aparecio` o `amoblado_desaparecio`. Impacto comercial directo (cambia el público objetivo).
- **Cambio de mascotas**: flag `mascotas_aparecio` o `mascotas_desaparecio`. Decisivo para el inquilino.
- **Cambio de expensas**: flag `expensas_aparecio` o `expensas_desaparecio`. Cambia el precio neto al inquilino.
- **Mismatch de matching real**: capa 3 reporta `mismatch_real`. Discriminar 3 casos (ver guía completa en command de ventas):
  1. Variante del nombre faltante en `alias_conocidos`
  2. Edificio realmente distinto
  3. Falso positivo del regex

#### Verificación por lectura (v1.4 — capa anti-FP sobre el regex)

El script extrae precio/área con regex + heurística "monto más cercano al BD" (defensiva contra FP). Pero el regex es una **red automática**, no la palabra final. Para cada prop que el script flagea con `precio_mensual_mismatch_desc` o `area_mismatch_desc`:

1. **Leé la cruda** (`combined.json` trae el `detalle`, o consultá `datos_json_enrichment->>'descripcion'` por id) y confirmá que el monto/área que el regex tomó es realmente el del **alquiler/la unidad** — no garantía, comisión, expensas, terreno, ni el área de otra tipología.
2. **Mostrá el fragmento textual exacto** en el reporte, junto al valor BD y al valor leído. El humano verifica tu lectura de un vistazo.
3. Si la cruda es **ambigua** (varios montos, USD sin TC claro como el caso paralelo, áreas múltiples) → reportá 🟡 "revisar", NO 🔴. El silencio/duda es mejor que un FP.
4. Casos USD-paralelo en alquiler: el script convierte USD×6.96. Si el `precio_mensual_bob` ≈ USD×~9.5, es TC paralelo aplicado (no necesariamente error) → 🟡.

Esto le da al mensual la misma robustez de juicio que el semanal v1.4: el regex filtra las 141, vos verificás los pocos candidatos leyendo.

#### CAVEAT IMPORTANTE — primer audit con baseline reciente

Si el backfill se corrió hace <30 días, el primer audit comparará "scraped HOY" contra "cruda backfilleada hace pocos días". Vas a ver muchos `identicas` artificiales — es el baseline asentándose. **Audit #2 ya mide drift real.**

### 4. Reporte ejecutivo final al usuario

```
# Audit Mensual Alquileres — <YYYY-MM-DD>

## 🔴 CRÍTICO (X props con acción inmediata sugerida)

### Cambios de precio mensual reales (M props)
[tabla: ID | Edificio | Bs BD | Bs desc | diff % | fragmento cruda | acción]

### Área mal extraída (v1.4) (M props)
[tabla: ID | Edificio | m² BD | m² desc | diff % | fragmento cruda | acción]

### Listings muertos (P props)
[tabla + SQL para inactivo_pending]

### Cambios de amoblado/mascotas/expensas (Q props)
[tabla con prop + cambio + acción sugerida]

### Mismatch de matching reales (R props)
[tabla con BD asignado vs desc menciona]

## 🟡 ATENCIÓN (Z props para revisar)
[cambios de fecha, cosméticos, etc.]

## 🟢 INFORMATIVO

- Total auditado: <N> de <M> props
- Drift detectado: <X>% (vs <prev>% mes pasado)
- Listings muertos: <N>
- Sin cruda en BD: <N> ← si >0 sugerir backfill
- Costo: $0 (curl directo)
- DB run_id: <uuid>

## Detalle completo
`<run_dir>/summary.md` y `<run_dir>/combined.json`
```

### 5. Pregunta al usuario qué accionar

NO apliques mutations sin confirmación del usuario.

## Datos útiles para el análisis

- **Total feed actual**: ~141 props vivas en `v_mercado_alquiler`
- **Distribución por fuente**: ~111 C21, ~29 Remax, ~1 BI (Bien Inmuebles, baja participación)
- **TC oficial**: 6.96 (USD = BOB / 6.96)
- **Filtro de feed**: `<= 150 días` en mercado (vista pre-aplica)

## Querys históricos útiles

```sql
-- Tendencia mensual (separa por tipo_operacion)
SELECT * FROM audit_descripciones_tendencias WHERE tipo_operacion = 'alquiler';

-- Props con drift recurrente alquiler
SELECT prop_id, COUNT(DISTINCT run_id) as veces
FROM audit_descripciones_items
WHERE tipo_operacion = 'alquiler'
  AND bucket IN ('cambio_relevante', 'reescrita')
GROUP BY prop_id
HAVING COUNT(DISTINCT run_id) >= 2;
```
