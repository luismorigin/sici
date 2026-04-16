# TC Sospechoso — Criterios y documentación

> Migración 219 · Commit `7388376` · 16 Abr 2026

## Qué es

Un flag booleano `tc_sospechoso` en `buscar_unidades_simple()` que indica propiedades cuyo tipo de cambio no está confirmado y cuyo precio es anormalmente bajo comparado con propiedades similares.

Se muestra como badge amber **"Confirmar tipo de cambio"** en las cards de `/ventas` (desktop, mobile y bottom sheet).

## Criterio

Una propiedad se marca como `tc_sospechoso = true` cuando cumple **todas** estas condiciones:

1. **`tipo_cambio_detectado = 'no_especificado'`** — el pipeline no pudo determinar si el precio está en USD oficial o USD paralelo (billete)
2. **Precio/m² > 30% por debajo de la mediana** de su grupo de referencia
3. **Grupo de referencia con ≥ 3 propiedades** con TC conocido (`paralelo` u `oficial`)

### Grupo de referencia

Cada propiedad se compara contra propiedades de la misma:
- **Zona** (ej: Equipetrol Centro, Sirari)
- **Dormitorios** (0, 1, 2, 3+)
- **Estado de construcción** (entrega_inmediata, preventa)

Esto evita comparar preventas con entrega inmediata (las preventas son naturalmente más baratas) o zonas con perfiles de precio distintos.

### Por qué solo por debajo

- Precios **por encima** de la mediana son premium legítimos, no errores de TC
- Precios **por debajo** en props sin TC conocido sugieren que el precio publicado es en dólar paralelo (vale menos que el oficial), lo que haría que el precio "real" normalizado sea mayor

## Implementación

### SQL (migración 219)

La función `buscar_unidades_simple()` incluye:

```sql
WITH medianas_tc AS (
  SELECT
    v.zona, v.dormitorios, v.estado_construccion::TEXT,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2) AS mediana_m2,
    COUNT(*) AS n_grupo
  FROM v_mercado_venta v
  WHERE v.tipo_cambio_detectado IN ('paralelo', 'oficial')
  GROUP BY v.zona, v.dormitorios, v.estado_construccion
  HAVING COUNT(*) >= 3
)
```

El flag se calcula como:

```sql
CASE
  WHEN p.tipo_cambio_detectado = 'no_especificado'
       AND m.mediana_m2 IS NOT NULL
       AND (precio_normalizado(...) / NULLIF(p.area_total_m2, 0)) < m.mediana_m2 * 0.70
  THEN true
  ELSE false
END
```

`LEFT JOIN` a `medianas_tc` — si no hay grupo de referencia, `tc_sospechoso = false` (fail safe).

### Frontend

- **Tipos**: `tc_sospechoso: boolean` en `RawUnidadSimpleRow` y `UnidadVenta`
- **Mappers**: `api/ventas.ts` mapRow y `ventas.tsx` getStaticProps — `?? false`
- **UI**: Badge amber sobre foto en desktop card (`.vc-tc-badge`), mobile card (`.mc-tc-badge`), e inline en bottom sheet (`.bs-tc-badge`)

## Cómo modificar

| Cambio | Dónde |
|--------|-------|
| Cambiar umbral (ej: 25% en vez de 30%) | CTE `medianas_tc` en `buscar_unidades_simple()` — cambiar `0.70` por `0.75` |
| Cambiar grupo mínimo (ej: 5 en vez de 3) | CTE `medianas_tc` — cambiar `HAVING COUNT(*) >= 3` |
| Agregar/quitar dimensiones del grupo | CTE `medianas_tc` GROUP BY + JOIN conditions |
| Cambiar estilo del badge | Clases CSS en `ventas.tsx` estilos inline |
| Desactivar el badge | Quitar los 3 condicionales `p.tc_sospechoso &&` en `ventas.tsx` |

## Propiedades afectadas al deploy (16 Abr 2026)

8 propiedades (~2.5% del feed):

| ID | Edificio | Zona | Dorms | $/m² | Mediana | Diff |
|----|----------|------|-------|------|---------|------|
| 916 | Alto Busch | Eq. Oeste | 1 | $1,086 | $2,171 | -50% |
| 911 | Sky Level | Eq. Centro | 1 | $1,500 | $2,700 | -44% |
| 1283 | T-VEINTICINCO | Eq. Centro | 1 | $1,400 | $2,345 | -40% |
| 1374 | HH Once | Eq. Centro | 1 | $1,534 | $2,345 | -35% |
| 1042 | Cond. Mirage | Sirari | 2 | $1,498 | $2,292 | -35% |
| 522 | Omnia Lux | Eq. Centro | 2 | $1,321 | $2,013 | -34% |
| 1145 | Siria II | V. Brigida | 1 | $1,444 | $2,159 | -33% |
| 557 | Domus Tower | Eq. Centro | 1 | $1,880 | $2,700 | -30% |

## Contexto

- El pipeline detecta TC por regex en la descripción del listing + LLM (prompt v4.1)
- ~44% de props tienen `tipo_cambio_detectado = 'no_especificado'` — la mayoría son correctas (precio real en USD oficial), solo las que están significativamente debajo de la mediana son sospechosas
- Aún normalizando como paralelo (×7.80/6.96), estas 8 props siguen entre -22% y -44% debajo — el TC paralelo explica parte pero no toda la diferencia
