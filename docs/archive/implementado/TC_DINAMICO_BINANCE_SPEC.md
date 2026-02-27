# Sistema de Tipo de Cambio Dinamico - Binance P2P

> **Version:** 1.0
> **Fecha:** 3 Enero 2026
> **Estado:** ✅ ACTIVO (schedule 00:00 AM)
> **Migracion:** `sql/migrations/014_tc_binance_historial.sql`
> **Workflow:** `n8n/workflows/modulo_2/tc_dinamico_binance.json`

---

## Objetivo

Automatizar la obtencion del tipo de cambio USDT/BOB desde Binance P2P para mantener precios actualizados en el sistema SICI.

---

## Problema Resuelto

**Antes:** El tipo de cambio paralelo se actualizaba manualmente cuando habia cambios significativos.

**Ahora:** Cada noche, antes del pipeline de Discovery, el sistema consulta Binance P2P, valida el TC, y lo actualiza automaticamente si hay cambios significativos (>0.5%).

---

## Arquitectura

### Flujo de Ejecucion

```
00:00 AM → TC Dinamico Binance
    ├─ 1. HTTP: Consultar Binance P2P (SELL + BUY en paralelo)
    ├─ 2. Code: Calcular promedio TOP 5 anuncios
    ├─ 3. PG: validar_tc_binance() → Validar rango y cambio
    │
    ├─ SI valido (cambio > 0.5%):
    │   ├─ 4a. PG: guardar_snapshot_precios() ← PRIMERO preservar estado
    │   ├─ 5a. PG: actualizar_tipo_cambio() ← DESPUES actualizar
    │   ├─ 6a. PG: registrar_consulta_binance()
    │   └─ 7a. Slack: Notificar cambio
    │
    └─ NO valido (sin cambio significativo):
        └─ 4b. Log: Razon del no-cambio
    │
    └─ PG: Registrar Ejecucion (siempre)

01:00 AM → Discovery (usa TC ya actualizado)
```

---

## Tablas

### tc_binance_historial

Registra cada consulta a Binance P2P:

```sql
CREATE TABLE tc_binance_historial (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    tc_sell NUMERIC(10,4),        -- Precio VENTA USDT
    tc_buy NUMERIC(10,4),         -- Precio COMPRA USDT
    spread_pct NUMERIC(5,2),      -- Diferencia %
    num_anuncios_sell INTEGER,
    num_anuncios_buy INTEGER,
    raw_response JSONB,
    aplicado_a_config BOOLEAN DEFAULT FALSE
);
```

### precios_historial

Snapshots diarios de precios para analisis de mercado:

```sql
CREATE TABLE precios_historial (
    propiedad_id INTEGER NOT NULL,
    fecha DATE NOT NULL DEFAULT CURRENT_DATE,
    precio_usd NUMERIC(12,2),              -- Inmutable
    precio_usd_actualizado NUMERIC(12,2),  -- Con TC del dia
    tc_paralelo_usado NUMERIC(10,4),
    tc_oficial_usado NUMERIC(10,4),
    moneda_original VARCHAR(10),
    precio_original NUMERIC(12,2),
    PRIMARY KEY (propiedad_id, fecha)
);
```

---

## Funciones SQL

### validar_tc_binance(tc_nuevo, tipo)

Valida si un TC de Binance es razonable antes de aplicar:

| Validacion | Criterio |
|------------|----------|
| Rango valido | 8.0 - 15.0 BOB/USD |
| Cambio maximo | <10% por actualizacion |
| Cambio minimo | >0.5% (evitar ruido) |

```sql
SELECT * FROM validar_tc_binance(10.45, 'paralelo');
-- Retorna: es_valido, razon, tc_actual, diferencia_pct
```

### guardar_snapshot_precios()

Guarda snapshot de precios actuales ANTES de recalcular:

```sql
SELECT guardar_snapshot_precios();
-- Retorna: cantidad de propiedades guardadas
```

### registrar_consulta_binance(tc_sell, tc_buy, ...)

Registra una consulta a Binance:

```sql
SELECT registrar_consulta_binance(10.45, 10.20, 10, 10, '{}'::jsonb);
-- Retorna: ID del registro
```

---

## API Binance P2P

### Endpoint

```
POST https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search
```

### Request Body

```json
{
  "page": 1,
  "rows": 10,
  "asset": "USDT",
  "fiat": "BOB",
  "tradeType": "SELL",  // o "BUY"
  "publisherType": null,
  "payTypes": []
}
```

### Response

```json
{
  "data": [
    {
      "adv": {
        "price": "10.45",
        "surplusAmount": "1000.00"
      },
      "advertiser": {
        "nickName": "Trader123",
        "monthFinishRate": 0.98
      }
    }
  ]
}
```

### Notas

- `tradeType: "SELL"` = Precio al que venden USDT (lo que paga un comprador)
- Se toma promedio de TOP 5 anuncios para mejor representatividad
- Rate limit: ~1 request/segundo

---

## Configuracion

### Schedule

| Campo | Valor |
|-------|-------|
| Frecuencia | 1 vez al dia |
| Cron | `0 0 * * *` (00:00 AM) |
| Razon | Antes de Discovery (1:00 AM) |

### Umbrales

| Umbral | Valor | Descripcion |
|--------|-------|-------------|
| Minimo para actualizar | 0.5% | Evitar ruido |
| Maximo permitido | 10% | Proteccion outliers |
| Rango valido | 8.0 - 15.0 | BOB/USD razonable |

---

## Notificaciones Slack

Cuando hay actualizacion efectiva:

```
:chart_with_upwards_trend: *TC Actualizado desde Binance P2P*

*TC Anterior:* 10.44 BOB/USD
*TC Nuevo:* 10.52 BOB/USD
*Diferencia:* 0.77%

*Datos Binance:*
- SELL (promedio TOP 5): 10.52
- BUY (promedio TOP 5): 10.35
- Spread: 1.64%
- Anuncios: 10 SELL / 10 BUY
```

---

## Queries de Analisis

### Evolucion de precio de una propiedad

```sql
SELECT fecha, precio_usd_actualizado, tc_paralelo_usado
FROM precios_historial
WHERE propiedad_id = 123
ORDER BY fecha;
```

### Promedio de precios por dia (mercado)

```sql
SELECT fecha,
       AVG(precio_usd_actualizado) as precio_promedio,
       COUNT(*) as propiedades
FROM precios_historial
GROUP BY fecha
ORDER BY fecha;
```

### Comparar precio inicial vs actual

```sql
SELECT
    p.id,
    p.titulo,
    h_inicial.precio_usd_actualizado as precio_inicial,
    h_actual.precio_usd_actualizado as precio_actual,
    ROUND(100.0 * (h_actual.precio_usd_actualizado - h_inicial.precio_usd_actualizado)
          / h_inicial.precio_usd_actualizado, 2) as variacion_pct
FROM propiedades_v2 p
JOIN precios_historial h_inicial ON p.id = h_inicial.propiedad_id
JOIN precios_historial h_actual ON p.id = h_actual.propiedad_id
WHERE h_inicial.fecha = (SELECT MIN(fecha) FROM precios_historial WHERE propiedad_id = p.id)
  AND h_actual.fecha = CURRENT_DATE;
```

### Historial de cambios de TC

```sql
SELECT timestamp, tc_sell, tc_buy, spread_pct, aplicado_a_config
FROM tc_binance_historial
ORDER BY timestamp DESC
LIMIT 30;
```

---

## Fallbacks

| Escenario | Accion |
|-----------|--------|
| Binance no responde | Reintentar 3 veces con backoff |
| 3 fallos seguidos | Notificar en Slack, mantener TC actual |
| TC fuera de rango | No aplicar, registrar razon |
| Cambio muy grande (>10%) | No aplicar, notificar alerta |

---

## Troubleshooting

### TC no se actualiza

1. Verificar que workflow esta activo en n8n
2. Verificar logs del nodo HTTP (Binance puede bloquear)
3. Revisar `tc_binance_historial` para ver ultima consulta
4. Verificar que diferencia > 0.5%

### Precios no se recalculan

1. Verificar que `actualizar_tipo_cambio()` se ejecuto
2. Revisar `auditoria_tipo_cambio` para ver si hubo error
3. Ejecutar manualmente: `SELECT recalcular_precios_batch_nocturno()`

### Snapshots no se guardan

1. Verificar que `guardar_snapshot_precios()` se ejecuta ANTES de actualizar TC
2. Revisar `precios_historial` para ultima fecha

---

## Beneficios del Historial de Precios

1. **Analisis de tendencias**: Ver evolucion de precios en el tiempo
2. **Impacto del TC**: Cuantificar efecto del tipo de cambio
3. **Comparativas**: Precio inicial vs actual por propiedad
4. **Reportes mensuales**: Datos historicos para Radar Mensual
5. **Auditoria**: Trazabilidad completa de cambios

---

## Relacion con Columnas de Precio

| Columna | Mutabilidad | Descripcion |
|---------|-------------|-------------|
| `precio_original` | Inmutable | Precio extraido de portal |
| `moneda_original` | Inmutable | USD o BOB |
| `precio_usd` | Inmutable | Precio en USD al momento de discovery |
| `precio_usd_actualizado` | Mutable | Recalculado con TC actual |

**Importante:** `precio_usd` NUNCA cambia. Solo `precio_usd_actualizado` se recalcula cuando cambia el TC.

---

## Changelog

### v1.0 (2 Ene 2026)

- Tabla `tc_binance_historial` creada
- Tabla `precios_historial` creada
- Funciones: `validar_tc_binance()`, `guardar_snapshot_precios()`, `registrar_consulta_binance()`
- Workflow n8n con schedule 00:00 AM
- Notificaciones Slack integradas
- Documentacion completa

---

*Documentacion creada 2 Enero 2026*
