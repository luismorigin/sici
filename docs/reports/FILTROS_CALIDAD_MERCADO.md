# Filtros de Calidad — Estudios de Mercado SICI

## Regla

**Cada vez que se genere un estudio de mercado, informe por edificio, o análisis comparativo, se DEBEN aplicar los filtros de calidad listados abajo.** Sin estos filtros, los datos incluyen duplicados, parqueos clasificados como departamentos, y propiedades que llevan más de 10 meses sin actualizarse — contaminando inventarios, precios y tasas de absorción.

## Filtros SQL obligatorios

```sql
-- 1. Sin duplicados
AND duplicado_de IS NULL

-- 2. Solo departamentos reales (excluir parqueos, bauleras, garajes, depósitos)
AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')

-- 3. Sin multiproyectos (evita contar la misma unidad varias veces)
AND (es_multiproyecto = false OR es_multiproyecto IS NULL)

-- 4. Área mínima 20m² (segundo filtro contra parqueos mal clasificados)
AND area_total_m2 >= 20

-- 5. Antigüedad máxima: 300 días para entregados, 730 para preventa
AND (
  CASE WHEN COALESCE(estado_construccion::text, '') IN ('en_construccion', 'en_pozo')
    THEN CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 730
    ELSE CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 300
  END
)
```

## Nomenclatura de zonas (Mar 2026)

Post migraciones 171-173, venta usa **nombres crudos de PostGIS** (= microzona). La migración 131 fue revertida porque rompía el matching `p.zona = pm.zona`.

### Ventas y Alquileres (misma convención)

`p.zona` y `p.microzona` ahora contienen nombres crudos de `zonas_geograficas.nombre`:

| zona/microzona en BD | Display | Zona canónica |
|---------------------|---------|---------------|
| `Equipetrol` | Eq. Centro | Equipetrol Centro |
| `Equipetrol Norte/Norte` | Eq. Norte (norte) | Equipetrol Norte |
| `Equipetrol Norte/Sur` | Eq. Norte (sur) | Equipetrol Norte |
| `Faremafu` | Eq. Oeste | Equipetrol Oeste |
| `Sirari` | Sirari | Sirari |
| `Villa Brigida` | V. Brígida | Villa Brígida |
| `Equipetrol Franja` | Marginal (ignorar) | — |

### Agrupar Eq. Norte en queries

Las dos microzonas de Eq. Norte deben agruparse para análisis por zona:

```sql
CASE zona
  WHEN 'Equipetrol Norte/Norte' THEN 'Equipetrol Norte'
  WHEN 'Equipetrol Norte/Sur' THEN 'Equipetrol Norte'
  ELSE zona
END AS zona_display
```

### Valores sucios residuales (alquiler)

36 alquileres aún tienen valores no estándar. Usar `buscar_unidades_alquiler()` que los mapea internamente.

| Valor sucio | Cantidad | Mapea a |
|-------------|:--------:|---------|
| `Equipetrol Centro` | 19 | Equipetrol |
| `Equipetrol Norte` | 10 | Eq Norte/Norte o Eq Norte/Sur |
| `Sin zona` | 4 | Sin asignar |
| `Villa Brígida` | 2 | Villa Brigida |
| `Equipetrol Oeste` | 1 | Faremafu |

## Impacto de NO aplicar filtros (ejemplo real, 17 Feb 2026)

| Métrica | Sin filtros | Con filtros | Diferencia |
|---------|-------------|-------------|------------|
| Venta activas | 263 | 222 | -41 (16% inflado) |
| SANTORINI VENTURA | 17 uds (#1) | 0 uds (desaparece) | Todo duplicados/parqueos/viejos |
| V. Brígida activas | 55 | 36 | -19 (35% inflado) |
| Absorción 1D | 17.6% | 22.2% | Subestimada sin filtros |

## Referencia

Estos filtros son los mismos que usa:
- `buscar_unidades_reales()` (función SQL de búsqueda)
- `/admin/proyectos/[id]` (editor admin por proyecto)
- Cualquier query que el usuario ve en el dashboard
