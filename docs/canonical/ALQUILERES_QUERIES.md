# Alquileres — Guía de Queries

## Campos de precio
- `precio_mensual_usd` → SIEMPRE usar para alquileres (NO `precio_usd`)
- `precio_mensual_bob` → precio original en BOB
- `precio_usd` → solo ~15% poblado, NO usar para mercado alquiler
- Conversión: TC oficial 6.96 (alquileres son BOB, no paralelo)

## Filtros estándar

```sql
WHERE tipo_operacion = 'alquiler'
  AND duplicado_de IS NULL
  AND status = 'completado'           -- activos
  AND precio_mensual_usd > 0
  AND area_total_m2 >= 20
  AND dormitorios IS NOT NULL
```

## Queries de referencia

### Volumen por zona

```sql
SELECT zona, COUNT(*) FILTER (WHERE status = 'completado') as activos,
  COUNT(*) FILTER (WHERE status IN ('inactivo_confirmed','inactivo_pending')) as inactivos
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND duplicado_de IS NULL AND zona IS NOT NULL
GROUP BY zona ORDER BY activos DESC
```

### Medianas por zona y tipología

```sql
SELECT zona, dormitorios,
  COUNT(*) as activos,
  ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY precio_mensual_usd)) as mediana_usd,
  ROUND(MIN(precio_mensual_usd)) as min_usd,
  ROUND(MAX(precio_mensual_usd)) as max_usd
FROM propiedades_v2
WHERE tipo_operacion = 'alquiler' AND duplicado_de IS NULL
  AND status = 'completado' AND precio_mensual_usd > 0 AND dormitorios IS NOT NULL
GROUP BY zona, dormitorios ORDER BY zona, dormitorios
```

### Yield bruto (cruzar con venta)

```sql
-- Usar mediana alquiler de la query anterior
-- Yield = (mediana_alquiler_mes × 12) / mediana_venta
-- Venta: usar precio_normalizado(precio_usd, tipo_cambio_detectado)
```

## Errores comunes

1. Usar `precio_usd` en vez de `precio_mensual_usd` → descarta ~85% de data
2. Asumir TC paralelo para alquileres → son en BOB, se usa TC oficial 6.96
3. `fecha_publicacion >= 150 days` es redundante si ya filtrás por `status = 'completado'`
