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

## Nomenclatura de zonas (Feb 2026)

La migración 131 (`alinear_zona`) actualizó la columna `zona` para ventas pero NO para alquileres. Usar las tablas correctas:

### Ventas (zona actualizada)

| zona en BD | Display |
|------------|---------|
| `Equipetrol Centro` | Eq. Centro |
| `Sirari` | Sirari |
| `Villa Brígida` | V. Brígida |
| `Equipetrol Oeste` | Eq. Oeste |
| `Equipetrol Norte` | Eq. Norte |

### Alquileres (zona con nombres viejos)

| zona en BD | Display |
|------------|---------|
| `Equipetrol`, `Equipetrol Franja`, `Equipetrol Centro` | Eq. Centro |
| `Equipetrol Norte/Norte`, `Equipetrol Norte/Sur`, `Equipetrol Norte` | Eq. Norte |
| `Faremafu` | Eq. Oeste |
| `Sirari` | Sirari |
| `Villa Brigida` | V. Brígida |

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
