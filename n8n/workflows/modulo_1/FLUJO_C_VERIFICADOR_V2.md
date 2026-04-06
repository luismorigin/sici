# Flujo C - Verificador Venta v2.0.0

## Cambios respecto a v1.1.0

- **Audit HTTP**: nueva capa que samplea 60 propiedades activas/noche y detecta bajas via HTTP status code
- **razon_inactiva**: ahora se popula con valor granular (`aviso_terminado`, `audit_c21_terminado`, `audit_remax_redirect`)
- **fecha_inactivacion**: ahora se setea con `COALESCE(primera_ausencia_at, NOW())`
- **Nodo Reactivar eliminado**: discovery es la fuente de verdad para reactivación
- **HTTP GET** en vez de HEAD (mas confiable para detectar 404)

## Arquitectura

```
[Trigger 6:00 AM diario]
    |
[Query: pending + audit (60 random)]
    |
[Hay propiedades?]
   |- NO -> [Sin pendientes] -> [Merge] -> [Registrar]
   |- SI  v
[Split propiedades] (loop 1x1)
    |
[Router origen]
    |
[Necesita HTTP?]
   |- SI (audit)  -> [HTTP GET] -> [Wait 1.5s] -> [Procesar respuesta]
   |- NO (pending) --------------------------->  [Procesar respuesta]
    |
[Confirmar baja?]
   |- SI  -> [UPDATE inactivo_confirmed] -> loop
   |- NO  -> [Log skipped]               -> loop
    |
[Agregar resultados] (cuando Split termina)
    |
[Generar resumen] -> [Merge] -> [Registrar ejecucion]
```

## Query: Pending + Audit

```sql
WITH pending AS (
  SELECT id, url, fuente, codigo_propiedad, status,
    primera_ausencia_at,
    EXTRACT(DAY FROM NOW() - primera_ausencia_at)::INTEGER as dias_desde_ausencia,
    'pending' as origen
  FROM propiedades_v2
  WHERE status = 'inactivo_pending'::estado_propiedad
    AND tipo_operacion = 'venta'
),
audit AS (
  SELECT id, url, fuente, codigo_propiedad, status,
    NULL::timestamptz as primera_ausencia_at,
    0 as dias_desde_ausencia,
    'audit' as origen
  FROM propiedades_v2
  WHERE status = 'completado'
    AND tipo_operacion = 'venta'
    AND es_activa = true
    AND fuente IN ('century21', 'remax')
  ORDER BY RANDOM()
  LIMIT 60
)
SELECT * FROM pending
UNION ALL
SELECT * FROM audit
ORDER BY origen, dias_desde_ausencia DESC;
```

## Logica de decision

### Pending (sin HTTP)
| Condicion | Accion | razon_inactiva |
|-----------|--------|----------------|
| dias >= 2 | confirm | `aviso_terminado` |
| dias < 2 | skip | — |
| primera_ausencia_at NULL | skip + ERROR | — |

### Audit (con HTTP)
| Fuente | Signal | Accion | razon_inactiva |
|--------|--------|--------|----------------|
| C21 | HTTP 404 | confirm | `audit_c21_terminado` |
| C21 | otro | skip | — |
| Remax | HTTP 301/302 | confirm | `audit_remax_redirect` |
| Remax | otro | skip | — |
| error HTTP | — | skip | — |

## UPDATE

```sql
UPDATE propiedades_v2
SET
  status = 'inactivo_confirmed',
  es_activa = FALSE,
  fecha_inactivacion = COALESCE(primera_ausencia_at, NOW()),
  razon_inactiva = '<valor>',
  fecha_actualizacion = NOW()
WHERE id = <id>
  AND es_activa = TRUE
RETURNING id, url, status, fecha_inactivacion, razon_inactiva, action, origen, fuente;
```

## Parametros

| Parametro | Valor |
|-----------|-------|
| Schedule | 6:00 AM diario (America/La_Paz) |
| MAX_DIAS_PENDING | 2 |
| AUDIT_LIMIT | 150 random/noche |
| HTTP timeout | 10s |
| HTTP maxRedirects | 0 |
| Wait entre requests | 1.5s |

## Rollback

Si hay problemas, desactivar este workflow y reactivar `flujo_c_verificador_v1.1.0_FINAL.json` en n8n.

## Verificacion post-deploy

```sql
-- Verificar ejecucion
SELECT * FROM workflow_executions
WHERE workflow_name = 'verificador_venta'
ORDER BY finished_at DESC LIMIT 1;

-- Verificar razon_inactiva
SELECT razon_inactiva, COUNT(*)
FROM propiedades_v2
WHERE tipo_operacion = 'venta'
  AND status = 'inactivo_confirmed'
  AND fecha_actualizacion >= CURRENT_DATE
GROUP BY razon_inactiva;
```
