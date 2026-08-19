# TC Sospechoso — Criterios y documentación

> Creado en migración 219 (16 Abr 2026) · **umbral vigente: 28% desde migración 227**

## Qué es

Un flag booleano `tc_sospechoso` en `buscar_unidades_simple()` que indica propiedades cuyo tipo de cambio no está confirmado y cuyo precio es anormalmente bajo comparado con propiedades similares.

Se muestra como badge amber **"Confirmar tipo de cambio"** en las cards de `/ventas` (desktop, mobile y bottom sheet).

## Criterio

Una propiedad se marca como `tc_sospechoso = true` cuando cumple **todas** estas condiciones:

1. **`tipo_cambio_detectado = 'no_especificado'`** — el pipeline no pudo determinar si el precio está en USD oficial o USD paralelo (billete)
2. **Precio/m² > 28% por debajo de la mediana** de su grupo de referencia (factor `0.72` en SQL)
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

### SQL (CTE en migración 219, umbral en migración 227)

La función `buscar_unidades_simple()` incluye:

```sql
WITH medianas_tc AS (
  SELECT
    v.zona, v.dormitorios, v.estado_construccion::TEXT,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY v.precio_m2) AS mediana_m2,
    COUNT(*) AS n_grupo
  FROM v_mercado_venta v
  -- 🔴 ESTA LÍNEA ES LA QUE DEJÓ MUDO AL CRITERIO (medido 19-ago-2026).
  -- `oficial` dejó de emitirse cuando Bolivia unificó el tipo de cambio → hoy los tags
  -- son `no_especificado` · `oficial_viejo` · `paralelo` · `bob`. La referencia quedó en
  -- 70 avisos de 761, sólo 7 de 39 grupos llegan al mínimo de 3, y **el criterio marca
  -- CERO**. No falla: dejó de mirar. Ver `docs/arquitectura/TIPO_CAMBIO_SICI.md` §0 y
  -- `docs/reports/AUDITORIA_SENALES_PRECIO_2026-08-19.md`.
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
       AND (precio_normalizado(...) / NULLIF(p.area_total_m2, 0)) < m.mediana_m2 * 0.72
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
| Cambiar umbral (ej: 25% en vez de 28%) | Flag en `buscar_unidades_simple()` — cambiar el factor `0.72` (ej: `0.75` = 25%) |
| Cambiar grupo mínimo (ej: 5 en vez de 3) | CTE `medianas_tc` — cambiar `HAVING COUNT(*) >= 3` |
| Agregar/quitar dimensiones del grupo | CTE `medianas_tc` GROUP BY + JOIN conditions |
| Cambiar estilo del badge | Clases CSS en `ventas.tsx` estilos inline |
| Desactivar el badge | Quitar los 3 condicionales `p.tc_sospechoso &&` en `ventas.tsx` |

## Propiedades afectadas

El flag se calcula en vivo dentro de `buscar_unidades_simple()` (no es columna persistida). Para ver las marcadas hoy:

```sql
SELECT id, nombre_oficial, zona, dormitorios, tc_sospechoso
FROM buscar_unidades_simple('{}'::jsonb)
WHERE tc_sospechoso = true
ORDER BY zona, dormitorios;
```

> Referencia histórica: al deploy de mig 219 (umbral 30%) eran ~8 props (~2.5% del feed). Con el umbral 28% (mig 227) el set es algo mayor. El conteo vive en la función, no en este doc.

## Contexto

- El pipeline detecta TC por regex en la descripción del listing + LLM (prompt v4.1)
- Una porción relevante de props queda en `tipo_cambio_detectado = 'no_especificado'` (conteo actual: `SELECT tipo_cambio_detectado, COUNT(*) FROM v_mercado_venta GROUP BY 1`) — la mayoría son correctas (precio real en USD oficial); solo las significativamente debajo de la mediana del grupo son sospechosas
- Aún normalizando como paralelo (×TC paralelo/6.96), las props marcadas siguen sustancialmente debajo de la mediana — el TC paralelo explica parte pero no toda la diferencia
