# BUG-002: Baulera/Storage incluida en analisis de departamentos

**Fecha descubrimiento:** 11 Enero 2026
**Severidad:** Baja
**Estado:** Documentado - Fix manual aplicado
**Afectados:** 1 propiedad confirmada (ID 130)

---

## Resumen

Una baulera (storage unit) de 12.5 m² fue incluida en el analisis de mercado de departamentos porque el filtro `buscar_unidades_reales()` solo verifica el campo `titulo` pero no `tipo_propiedad_original`.

---

## Root Cause

### Fuente del error
**Filtro incompleto en `buscar_unidades_reales()`**

### Evidencia (ID 130)
```sql
-- Datos de la propiedad
tipo_propiedad_original: 'baulera'  -- ✅ Correctamente identificado
titulo: NULL                         -- ❌ Campo vacio
area_total_m2: 12.5
dormitorios: 0
precio_usd: 3520.11 (24,500 BOB)
proyecto: SANTORINI VENTURA
```

### Filtro actual (insuficiente)
```sql
-- En buscar_unidades_reales()
WHERE LOWER(p.titulo) !~ '(baulera|parqueo|garaje|deposito)'
```

El filtro busca en `titulo` que esta NULL, no en `tipo_propiedad_original` que tiene 'baulera'.

---

## Impacto

| Metrica | Valor |
|---------|-------|
| Propiedades afectadas confirmadas | 1 |
| Datos corruptos | Ninguno (datos correctos, filtro incompleto) |
| Reportes afectados | Analisis de mercado mostraba $3,520 como depto |

### Sintomas visibles
- Propiedad de $3,520 apareciendo en analisis de departamentos
- Precio/m² de $281 (bajo pero no imposible, dificil de detectar)
- Distorsion menor en estadisticas de mercado

---

## Fix Aplicado

### Correccion manual (ID 130)
```sql
-- Ejecutado: 11 Enero 2026
UPDATE propiedades_v2
SET
  status = 'excluido_operacion',
  razon_inactiva = 'BUG-002: Baulera/storage incorrectamente incluida',
  fecha_inactivacion = NOW(),
  fecha_actualizacion = NOW()
WHERE id = 130;
```

---

## Prevencion Futura

### Fix recomendado en buscar_unidades_reales()
```sql
-- Agregar validacion de tipo_propiedad_original
WHERE (
  -- Filtro existente en titulo
  LOWER(p.titulo) !~ '(baulera|parqueo|garaje|deposito|bodega)'
  -- Nuevo: filtro en tipo_propiedad_original
  AND LOWER(COALESCE(p.tipo_propiedad_original, ''))
      NOT IN ('baulera', 'parqueo', 'garaje', 'deposito', 'bodega', 'estacionamiento')
)
```

### Validacion adicional por area
```sql
-- Unidades < 20m² son sospechosas para departamentos
AND (p.area_total_m2 >= 20 OR p.dormitorios > 0)
```

---

## Deteccion de casos similares

### Query para encontrar mas bauleras/parqueos
```sql
SELECT id, tipo_propiedad_original, area_total_m2, precio_usd, status
FROM propiedades_v2
WHERE LOWER(tipo_propiedad_original) IN ('baulera', 'parqueo', 'garaje', 'deposito', 'bodega')
  AND status = 'completado'
  AND tipo_operacion = 'venta';
```

---

## Referencias

- Propiedad afectada: https://remax.bo/propiedad/venta-departamento-santa-cruz-de-la-sierra-equipetrolnoroeste-120056075-135
- Funcion SQL: `sql/functions/matching/buscar_unidades_reales.sql`
- Proyecto asociado: SANTORINI VENTURA (ID 221)

---

## Historial

| Fecha | Accion |
|-------|--------|
| 11 Ene 2026 | Bug descubierto durante revision de datos corruptos |
| 11 Ene 2026 | Root cause identificado: filtro incompleto |
| 11 Ene 2026 | Fix manual aplicado a ID 130 |
