# Alquileres — Guía de Queries

> **Regla madre:** usar SIEMPRE la vista `v_mercado_alquiler`. Pre-aplica todos los filtros de calidad (`duplicado_de IS NULL`, `status` activo, `area_total_m2 >= 20`, `precio_mensual_usd > 0`, `dias_en_mercado <= 150`). NO escribir filtros canónicos a mano contra `propiedades_v2`. Ver CLAUDE.md regla 10.

## Campos de precio

- **`precio_mensual_bob`** → **fuente de verdad.** Precio original en Bs que pide el dueño (los alquileres se cotizan en bolivianos). Usar para display en Bs.
- **`precio_mensual`** → **USD para cálculos.** Campo derivado de la vista: `ROUND(precio_mensual_bob / 6.96, 2)`. Siempre consistente con la fuente de verdad.
- **`precio_mensual_usd`** (columna cruda de `propiedades_v2`) → **evitar.** Está 100% poblada pero puede divergir del derivado (verificado may-2026: 1 de 141 difiere hasta ~$28). La vista la usa solo para el filtro `> 0`. Para cálculos usá `precio_mensual`.
- **`precio_usd`** → **NUNCA** para alquiler (es el campo de venta).
- TC: oficial **6.96** (alquileres son en BOB, no paralelo).

## Queries de referencia (sobre la vista)

### Volumen por zona (activos, ya filtrado ≤150d)

```sql
SELECT zona, COUNT(*) AS activos
FROM v_mercado_alquiler
WHERE zona IS NOT NULL
GROUP BY zona ORDER BY activos DESC;
```

### Medianas por zona y tipología

```sql
SELECT zona, dormitorios,
  COUNT(*) AS activos,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual))      AS mediana_usd,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_bob))  AS mediana_bob
FROM v_mercado_alquiler
WHERE dormitorios IS NOT NULL
GROUP BY zona, dormitorios ORDER BY zona, dormitorios;
```

### Yield bruto (cruzar con venta)

```sql
-- Yield = (mediana_alquiler_mes_usd × 12) / mediana_venta_usd
-- Alquiler USD: PERCENTILE de precio_mensual sobre v_mercado_alquiler
-- Venta USD:    PERCENTILE de precio_norm    sobre v_mercado_venta
```

### Inventario estancado (>150 días)

La vista filtra a ≤150 días. Para inventario estancado o inactivo, consultar `propiedades_v2` directo (`status IN ('inactivo_pending','inactivo_confirmed')` o `dias_en_mercado > 150`).

## Errores comunes

1. Escribir filtros a mano contra `propiedades_v2` en vez de usar `v_mercado_alquiler` (la vista ya los aplica).
2. Usar `precio_mensual_usd` (columna cruda) en vez de `precio_mensual` (derivado de la vista).
3. Usar `precio_usd` → es el campo de venta, no de alquiler.
4. Asumir TC paralelo → los alquileres son en BOB, se usa TC oficial 6.96.
