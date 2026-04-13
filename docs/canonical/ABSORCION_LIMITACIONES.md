# Absorción de mercado — Limitaciones y cortes de datos

> Documento canónico. Consultar antes de presentar datos de absorción en estudios de mercado.

## Definición

**Absorbida** = propiedad que desapareció de los portales (C21/Remax), confirmada por el verificador HTTP.
- Campo: `status = 'inactivo_confirmed'` + `primera_ausencia_at` (fecha de primera detección de ausencia)
- NO significa necesariamente "vendida" — puede ser: vendida, retirada por el broker, listing expirado, o error del portal.

## Series de datos

| Serie | filter_version | Fechas | Confiabilidad |
|---|---|---|---|
| v1 | 1 | 12 Feb — 11 Mar 2026 | **No usar.** C21 verificador roto, filtros legacy |
| v2 | 2 | 12 Mar — 13 Abr 2026 | **Parcial.** Absorbidas recalculadas (migración 211 backfill). Inventario con filtro 300d (no corregible) |
| v3 | 3 | 14 Abr 2026 → futuro | **Confiable.** Filtros alineados, sin filtro 300d en inventario |

## Cortes de datos importantes

### 23 Mar 2026 — Backfill verificador C21
- **Antes:** verificador solo procesaba Remax. ~131 props C21 stuck en `inactivo_pending`.
- **Después:** verificador v5.1 procesa ambas fuentes. Backfill recalculó 40 fechas históricas.
- **Impacto:** absorción 2D pasó de 0-12% → 20-31%.

### 24 Mar 2026 — Snapshots por zona
- Antes: solo datos globales (zona='global').
- Después: snapshots por cada zona + global.

### 13 Abr 2026 — Migración 211: fix filtros absorción
- **Bug corregido:** absorbidas no filtraban duplicados, multiproyecto, parqueos, ni curación admin.
- **Bug corregido:** inventario activo usaba filtro 300d (UX), excluía props estancadas del conteo real.
- **Backfill v2:** absorbidas recalculadas con filtros correctos. Inventario no recalculable (requería historial de status por día, no guardado).
- **Nuevas columnas:** `venta_absorbidas_entrega`, `venta_absorbidas_preventa`, `roi_amoblado`, `roi_no_amoblado`.
- **`venta_usd_m2`** cambia de promedio a mediana (más robusto a outliers).
- **`primera_ausencia_at IS NOT NULL`** excluye inactivaciones manuales admin (curación BD ≠ absorción de mercado).

## Qué se puede presentar en estudios

### Verde (seguro)
- Inventario puntual (conteo de `v_mercado_venta` o `venta_activas` en snapshot v3)
- Precios: mediana, percentiles, $/m² (no afectados por absorción)
- Competidores específicos que salieron del mercado (verificable uno por uno)
- Yield bruto por amoblado/no amoblado (desde v3)

### Amarillo (con caveats)
- Tasa de absorción v3 (serie limpia pero corta — necesita ≥90 días para ser estable)
- Cambio neto de inventario (incluye envejecimiento de props, no solo ventas)
- Absorción v2 backfilled (absorbidas limpias pero inventario con filtro 300d)

### Rojo (no presentar como hecho)
- Absorción v1 (datos rotos)
- "Meses de inventario" como predicción (es un cociente instantáneo, no una proyección)
- Comparativas v1 vs v2 vs v3 (metodologías distintas)

## Contaminación conocida en v2

El inventario activo de v2 usaba `fecha_publicacion >= CURRENT_DATE - 300 days`:
- Props con >300 días salían del conteo sin ser vendidas → inventario aparecía menor
- Esto hacía que la tasa de absorción pareciera más alta de lo real
- El backfill de migración 211 corrigió las absorbidas pero NO el inventario (no se puede recalcular retroactivamente)

## Fuentes de falsos positivos en absorción

| Causa | Efecto | Mitigación (v3) |
|---|---|---|
| Curación admin (marcar inactivo manualmente) | Cuenta como absorbida | `primera_ausencia_at IS NOT NULL` |
| Duplicados marcados post-facto | Sale del inventario | `duplicado_de IS NULL` en ambos lados |
| Multiproyecto reclasificado | Sale del inventario | `es_multiproyecto = false` en ambos lados |
| Listing expirado (no renovado por broker) | Cuenta como absorbida | No mitigable — es indistinguible de venta |
| Portal caído temporalmente | Falso positivo en verificador | `inactivo_confirmed` requiere 2+ ausencias consecutivas |

## Para Simon Advisor

Las funciones de Simon Advisor (`yield_analysis`, `market_overview`, etc.) consultan `v_mercado_venta` y `v_mercado_alquiler` directamente — NO usan `market_absorption_snapshots`. Los datos de yield y precios del advisor no están afectados por los problemas de absorción.

Los snapshots se consumen en:
- `/admin/market` (Market Pulse Dashboard)
- Estudios de mercado (HTML)
- Análisis ad-hoc
