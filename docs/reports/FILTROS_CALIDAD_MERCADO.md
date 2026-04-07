# Filtros de Calidad — Estudios de Mercado SICI

## Regla

**Cada vez que se genere un estudio de mercado, informe por edificio, o análisis comparativo, se DEBEN aplicar los filtros de calidad listados abajo.** Sin estos filtros, los datos incluyen duplicados, parqueos clasificados como departamentos, y propiedades que llevan más de 10 meses sin actualizarse — contaminando inventarios, precios y tasas de absorción.

## Filtros SQL obligatorios

```sql
-- 1. Solo props activas (excluye inactivas, excluidas por calidad/operación/zona)
AND status IN ('completado', 'actualizado')

-- 2. Sin duplicados
AND duplicado_de IS NULL

-- 3. Solo departamentos reales (excluir parqueos, bauleras, garajes, depósitos)
AND COALESCE(tipo_propiedad_original, '') NOT IN ('baulera', 'parqueo', 'garaje', 'deposito')

-- 4. Sin multiproyectos (evita contar la misma unidad varias veces)
AND (es_multiproyecto = false OR es_multiproyecto IS NULL)

-- 5. Área mínima 20m² (segundo filtro contra parqueos mal clasificados)
AND area_total_m2 >= 20

-- 6a. Antigüedad máxima VENTA: 300 días para entregados, 730 para preventa
AND (
  CASE WHEN COALESCE(estado_construccion::text, '') IN ('preventa', 'en_construccion', 'en_pozo')
    THEN CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 730
    ELSE CURRENT_DATE - COALESCE(fecha_publicacion, fecha_discovery::date) <= 300
  END
)

-- 6b. Antigüedad máxima ALQUILER: 150 días (migración 207)
AND CURRENT_DATE - COALESCE(fecha_publicacion::timestamp, fecha_creacion)::date <= 150
```

## Nomenclatura de zonas (Mar 2026)

Post migración 184, `p.zona` y `pm.zona` contienen nombres display directos:

| Valor en BD | Display corto | Props activas |
|-------------|---------------|:-------------:|
| `Equipetrol Centro` | Eq. Centro | ~156 |
| `Sirari` | Sirari | ~54 |
| `Villa Brigida` | V. Brígida | ~43 |
| `Equipetrol Oeste` | Eq. Oeste | ~32 |
| `Equipetrol Norte` | Eq. Norte | ~25 |

**Ya no es necesario** agrupar microzonas ni mapear nombres crudos.
`lib/zonas.ts` mantiene aliases legacy para backwards compatibility.

## Impacto de NO aplicar filtros (ejemplo real, 17 Feb 2026)

| Métrica | Sin filtros | Con filtros | Diferencia |
|---------|-------------|-------------|------------|
| Venta activas | 263 | 222 | -41 (16% inflado) |
| SANTORINI VENTURA | 17 uds (#1) | 0 uds (desaparece) | Todo duplicados/parqueos/viejos |
| V. Brígida activas | 55 | 36 | -19 (35% inflado) |
| Absorción 1D | 17.6% | 22.2% | Subestimada sin filtros |

## Status que excluyen props de análisis

Los queries de mercado filtran por `status IN ('completado', 'actualizado')`. Los siguientes status quedan excluidos automáticamente:

| Status | Significado | Ejemplo |
|--------|-------------|---------|
| `inactivo_pending` | URL devuelve 404, pendiente confirmación | Avisos removidos |
| `inactivo_confirmed` | Aviso terminado confirmado | Props vendidas/retiradas |
| `excluido_calidad` | Datos basura o no confiables | Descripción ".", precio imposible |
| `excluido_operacion` | Tipo de operación fuera de scope | Anticrético clasificado como venta |
| `excluida_zona` | GPS fuera de polígonos de cobertura | Props en Av. Bush, Av. Beni, etc. |
| `nueva` | Recién descubierta, sin enrichment | — |
| `pendiente_enriquecimiento` | Esperando enrichment | — |

### Props excluidas por zona (migración 181)

9 props cuyo GPS cae fuera de los polígonos de microzonas en `geodata/microzonas_equipetrol_v4.geojson`:

| ID | Edificio | Ubicación real |
|----|----------|---------------|
| 285 | — | Sin datos, GPS fuera |
| 580 | CUPESI | Av. Ovidio Barbery |
| 581 | — | Av. Bush |
| 598 | Mediterraneo 2 | Fuera de polígonos |
| 885 | Providence | 3er anillo externo |
| 886 | Maracana Apart Hotel | Borde fuera |
| 1019 | Condominio San Andrés | Fuera |
| 1055 | Millennial Tower | Av. Bush 1er-2do anillo |
| 1072 | Portobello Green | GPS fuera (Remax) |

## Datos de absorcion corruptos (feb-mar 2026) — CORREGIDO

**BUG-001:** Entre el 14 de febrero y el 22 de marzo de 2026, los campos de absorcion de venta en `market_absorption_snapshots` estaban incorrectos por una falla en el verificador de ausencias. Detalle completo en `docs/bugs/BUG_001_verificador_venta_inactivo.md`.

**RESUELTO 23 Mar 2026:**
- Verificador v5.1: eliminado filtro `fuente = 'remax'`, ahora procesa C21 + Remax
- Migración 199: backfill recalculó absorción para las 40 fechas históricas con C21 incluido
- Migración 200: snapshot ahora segmentado por zona + tracking de `inactivo_pending`
- **Toda la serie histórica (12 Feb - 23 Mar) está corregida.** Absorción 2 dorms pasó de 0-12% → 20-31%

**Nota:** Queries a `market_absorption_snapshots` ahora deben filtrar `zona = 'global'` para obtener los agregados globales (filas por zona son adicionales desde mig. 200).

## Cobertura temporal de las vistas canónicas

| Vista | Antigüedad máxima | Motivo |
|-------|-------------------|--------|
| `v_mercado_venta` | 300 días (entregados), 730 días (preventa) | Ciclo de venta largo, preventa puede durar 2 años |
| `v_mercado_alquiler` | **150 días** (migración 207) | Vida mediana C21 34d, Remax 73d. Un alquiler activo >150d es inventario estancado que contamina promedios |

**IMPORTANTE:** `v_mercado_alquiler` solo muestra listings de hasta 150 días. Si necesitás analizar inventario estancado (>150d), consultá `propiedades_v2` directo con tus propios filtros. El RPC `buscar_unidades_alquiler()` (feed público) usa el mismo corte de 150 días.

## Referencia

Estos filtros son los mismos que usa:
- `buscar_unidades_reales()` (función SQL de búsqueda)
- `buscar_unidades_alquiler()` (feed alquileres — 150 días)
- `/admin/proyectos/[id]` (editor admin por proyecto)
- Cualquier query que el usuario ve en el dashboard
