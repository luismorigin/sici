# Market Investment Snapshots

## Propósito

Guardar snapshots diarios de métricas de inversión inmobiliaria de Equipetrol, desglosados por tipología (estudios, 1 dorm, 2 dorms, 3 dorms). Incluye: absorción, precios (activas vs absorbidas), renta, ROI y ratio oferta. Permite comparar evolución mes a mes.

## Tabla: `market_absorption_snapshots`

**Migración:** `sql/migrations/140_market_absorption_snapshots.sql`
**PK:** `id` (serial)
**Unique:** `(fecha, dormitorios)`
**Índice:** `idx_market_absorption_fecha` (fecha DESC)

### Columnas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `fecha` | DATE | Día del snapshot |
| `dormitorios` | INTEGER | 0=estudio, 1, 2, 3 |
| **Venta: inventario** | | |
| `venta_activas` | INTEGER | Propiedades de venta activas (status=completado) |
| `venta_absorbidas_30d` | INTEGER | Inactivo_confirmed con primera_ausencia_at últimos 30 días |
| `venta_nuevas_30d` | INTEGER | Creadas en últimos 30 días |
| `venta_tasa_absorcion` | NUMERIC(5,2) | % = absorbidas / (activas + absorbidas) |
| `venta_meses_inventario` | NUMERIC(5,1) | activas / absorbidas (NULL si 0 absorbidas) |
| **Venta: precios** | | |
| `venta_ticket_promedio` | INTEGER | Precio promedio USD |
| `venta_ticket_mediana` | INTEGER | Precio mediana USD |
| `venta_ticket_p25` | INTEGER | Percentil 25 |
| `venta_ticket_p75` | INTEGER | Percentil 75 |
| `venta_usd_m2` | INTEGER | Precio promedio por m² |
| `venta_area_promedio` | INTEGER | Área promedio m² |
| **Absorbidas** | | |
| `absorbidas_ticket_promedio` | INTEGER | Ticket promedio de las que salieron del mercado |
| `absorbidas_usd_m2` | INTEGER | $/m² de las absorbidas |
| **Alquiler** | | |
| `alquiler_activas` | INTEGER | Alquileres activos |
| `alquiler_mensual_promedio` | INTEGER | Renta mensual promedio USD |
| `alquiler_mensual_mediana` | INTEGER | Renta mensual mediana USD |
| `alquiler_mensual_p25` | INTEGER | Percentil 25 |
| `alquiler_mensual_p75` | INTEGER | Percentil 75 |
| **Cruzado** | | |
| `roi_bruto_anual` | NUMERIC(5,2) | (alquiler * 12) / precio_venta * 100 |
| `anos_retorno` | NUMERIC(5,1) | precio_venta / (alquiler * 12) |

### Filtros aplicados

- `area_total_m2 >= 20` (excluye bauleras/parqueos)
- `precio_usd > 0` (venta) / `precio_mensual_usd > 0` (alquiler)
- `fuente IN ('century21', 'remax')`
- `dormitorios BETWEEN 0 AND 3`
- Absorbidas: `status = 'inactivo_confirmed'` con `primera_ausencia_at` en últimos 30 días

## Función: `snapshot_absorcion_mercado()`

**Tipo:** SECURITY DEFINER
**Retorna:** TABLE(dormitorios_out INTEGER, insertado BOOLEAN)
**Idempotente:** Sí (ON CONFLICT DO UPDATE por fecha + dormitorios)

Calcula todas las métricas para cada tipología (0-3 dormitorios) y las inserta/actualiza en la tabla. Se puede ejecutar múltiples veces al día sin duplicar datos.

### Ejecución manual

```sql
SELECT * FROM snapshot_absorcion_mercado();
```

### Consultar snapshots

```sql
-- Último snapshot
SELECT * FROM market_absorption_snapshots
WHERE fecha = CURRENT_DATE
ORDER BY dormitorios;

-- Evolución últimos 30 días
SELECT fecha, dormitorios, venta_activas, venta_absorbidas_30d,
       venta_meses_inventario, roi_bruto_anual
FROM market_absorption_snapshots
ORDER BY fecha DESC, dormitorios;

-- Comparar 2 meses
SELECT
  a.dormitorios,
  a.venta_activas as activas_hoy,
  b.venta_activas as activas_hace_30d,
  a.roi_bruto_anual as roi_hoy,
  b.roi_bruto_anual as roi_hace_30d
FROM market_absorption_snapshots a
JOIN market_absorption_snapshots b
  ON a.dormitorios = b.dormitorios
  AND b.fecha = a.fecha - INTERVAL '30 days'
WHERE a.fecha = CURRENT_DATE;
```

## Integración con n8n

**Workflow:** `auditoria_diaria_sici.json`
**Nodo:** `PG: Snapshot Absorción Mercado`
**Posición en flujo:** En paralelo con Slack, Insert Snapshot, y Registrar Ejecución
**Cron:** 9:00 AM diario (misma hora que auditoría)

```
Schedule 9 AM
  → Stats Propiedades → Stats Matching → Stats Proyectos
  → Stats Sin Match → Stats TC → Stats Workflows
  → Consolidar Reporte
    ├→ Slack: Reporte Diario
    ├→ PG: Insert Snapshot (auditoria_snapshots)
    ├→ PG: Registrar Ejecución
    └→ PG: Snapshot Absorción Mercado  ← NUEVO
```

### Agregar manualmente en n8n

1. Abrir el workflow **Auditoría Diaria SICI** en n8n
2. Agregar un nodo **Postgres** después de "Code: Consolidar Reporte"
3. Configurar:
   - **Nombre:** `PG: Snapshot Absorción Mercado`
   - **Operation:** Execute Query
   - **Query:** `SELECT * FROM snapshot_absorcion_mercado();`
   - **Credentials:** Supabase SICI
4. Conectar: desde "Code: Consolidar Reporte" → nuevo nodo (output adicional, en paralelo con los existentes)

## Supuestos y limitaciones

1. **"Absorbida" ≠ vendida.** Significa que desapareció del portal. Puede ser: vendida, baja temporal, cambio de agente, expiración de anuncio.
2. **Ventana de 30 días rolling.** Cada día recalcula los últimos 30 días. Las primeras semanas pueden tener datos del backlog retroactivo (primera_ausencia_at seteada manualmente el 12 Feb 2026).
3. **Solo 2 fuentes.** Century 21 + Remax. No cubre el mercado total de Equipetrol.
4. **Precios publicados.** No son precios de cierre de venta.
5. **ROI bruto.** No descuenta vacancia, mantenimiento, comisiones ni impuestos.
6. **Datos se normalizan solos.** A medida que pase el tiempo y se acumule historial limpio, los datos retroactivos salen de la ventana de 30 días.

## Permisos

```sql
GRANT SELECT ON market_absorption_snapshots TO anon, authenticated;
GRANT EXECUTE ON FUNCTION snapshot_absorcion_mercado() TO authenticated;
```

`anon` puede leer (para dashboard público futuro), solo `authenticated` puede ejecutar la función.
