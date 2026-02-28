# Snapshot Precios — Fix TC Paralelo

**Fecha implementación:** 26 Feb 2026
**Fecha verificación:** 26 Feb 2026
**TC Paralelo:** 9.012 (Binance P2P)
**TC Oficial:** 6.96 (fijo)
**Factor normalización:** ×1.2948 (+29.5%)
**Estado:** DESPLEGADO Y VERIFICADO EN PRODUCCION

---

## ANTES del fix

`buscar_unidades_reales()` usaba `COALESCE(precio_usd_actualizado, precio_usd)` — fórmula buggy round-trip.

| ID | Proyecto | precio_usd (BD) | precio_usd_actualizado | Mostrado (COALESCE) |
|----|----------|-----------------|----------------------|---------------------|
| 152 | Sky Equinox | $60,842 | $62,476 | **$62,476** |
| 302 | Edificio ITAJU | $764,519 | $785,049 | **$785,049** |
| 429 | Sky Magnolia | $82,841 | $89,331 | **$89,331** |
| 497 | Sky Plaza Italia | $81,105 | $83,283 | **$83,283** |
| 619 | Sky Moon | $348,460 | $360,679 | **$360,679** |

---

## DESPUES del fix — Verificado en produccion

Verificado con MCP Postgres contra BD producción el 26 Feb 2026.

### 1. Funcion `precio_normalizado()` — PASS

| Input | Resultado | Esperado | Status |
|-------|-----------|----------|--------|
| `(60842, 'paralelo')` | $78,779.90 | ~$78,780 | PASS |
| `(100000, 'oficial')` | $100,000 | $100,000 | PASS |
| `(100000, NULL)` | $100,000 | $100,000 | PASS |

### 2. `buscar_unidades_reales()` — ID 152 Sky Equinox — PASS

| Campo | ANTES | DESPUES |
|-------|-------|---------|
| precio_usd | $62,476 | **$78,779.90** |
| precio_m2 | ~$1,776 | **$2,238** |

### 3. 5 propiedades paralelo — todas PASS

| ID | Proyecto | ANTES (COALESCE) | DESPUES (normalizado) | Delta |
|----|----------|-------------------|----------------------|-------|
| 152 | Sky Equinox | $62,476 | **$78,779.90** | +$16,304 (+26.1%) |
| 302 | Edificio ITAJU | $785,049 | **$989,920.29** | +$204,871 (+26.1%) |
| 429 | Sky Magnolia | $89,331 | **$107,264.81** | +$17,934 (+20.1%) |
| 497 | Sky Plaza Italia | $83,283 | **$105,016.99** | +$21,734 (+26.1%) |
| 619 | Sky Moon | $360,679 | **$451,195.62** | +$90,517 (+25.1%) |

### 4. Propiedades TC oficial — sin cambio (control) — PASS

| ID | Proyecto | precio_usd | tc_detectado | Normalizado |
|----|----------|-----------|--------------|-------------|
| 153 | Sky Equinox | $222,000 | oficial | $222,000 (sin cambio) |
| 154 | Sky Equinox | $222,000 | oficial | $222,000 (sin cambio) |
| 155 | Sky Equinox | $167,000 | oficial | $167,000 (sin cambio) |

### 5. Vistas SQL — sin errores — PASS

| Vista/Funcion | Status | Nota |
|---------------|--------|------|
| `v_metricas_mercado` | PASS | Retorna rows con precios normalizados |
| `v_alternativas_proyecto` | PASS | precio_desde/hasta normalizados |
| `snapshot_absorcion_mercado()` | PASS | Insertó snapshot, `insertado: true` |

---

## Checklist post-deploy

- [x] `SELECT precio_normalizado(60842, 'paralelo')` → $78,779.90
- [x] `SELECT precio_normalizado(100000, 'oficial')` → $100,000
- [x] `SELECT precio_normalizado(100000, NULL)` → $100,000
- [x] `buscar_unidades_reales`: ID 152 muestra $78,779.90
- [x] `v_metricas_mercado` sin errores
- [x] `v_alternativas_proyecto` sin errores
- [x] `snapshot_absorcion_mercado()` sin errores
- [ ] Admin editor `/admin/propiedades/152`: sigue mostrando $60,842 (sin normalizar)
- [ ] Market dashboard: KPIs reflejan precios normalizados
- [ ] Landing hero: precio/m2 promedio sube ~5-7%

---

## Migraciones desplegadas

1. `sql/migrations/167_precio_normalizado_helper.sql` — funcion helper SQL
2. `sql/migrations/168_normalizar_precios_tc_paralelo.sql` — 9 funciones/vistas actualizadas

## Archivos frontend editados

- `src/lib/precio-utils.ts` (NUEVO)
- `src/lib/landing-data.ts`
- `src/lib/supabase.ts`
- `src/pages/admin/market.tsx`
- `src/pages/admin/propiedades/index.tsx`
- `src/pages/admin/proyectos/[id].tsx`

## Notas tecnicas

- `precio_usd` en BD no se toca — normalización es en vivo via `precio_normalizado()`
- `precio_usd_actualizado` se mantiene como cache — `recalcular_precio_propiedad()` corregida con formula `precio_usd * tc / 6.96`
- Admin editor muestra precio crudo (sin normalizar) — correcto, el admin ve/edita el precio real
- Broker pages leen de `propiedades_broker`, no afectadas
- `analisis_motivos_rechazo` usa tabla legacy `propiedades`, no se tocó
