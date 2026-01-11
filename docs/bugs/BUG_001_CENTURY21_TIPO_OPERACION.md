# BUG-001: Century21 API devuelve tipo_operacion incorrecto

**Fecha descubrimiento:** 11 Enero 2026
**Severidad:** Media
**Estado:** Documentado - Fix manual aplicado
**Afectados:** 1 propiedad confirmada (ID 249)

---

## Resumen

El API de Century21 devuelve `tipoOperacion: "venta"` para propiedades que en realidad son alquileres, causando que precios de alquiler mensual (ej: 3750 BOB/mes) se interpreten como precios de venta.

---

## Root Cause

### Fuente del error
**API Century21** - El endpoint de listado devuelve metadata incorrecta.

### Evidencia (ID 249)
```json
// Respuesta del API Century21
{
  "tipoOperacion": "venta",           // ❌ INCORRECTO
  "urlCorrectaPropiedad": "/propiedad/91778_departamento-de-2-dormitorio-en-alquiler-zona-equipetrol-condominio-macororo-7",
  "precio": "3750",                   // BOB/mes (alquiler)
  "moneda": "BOB"
}
```

La URL contiene `en-alquiler` pero el API dice `venta`.

### Flujo del bug
```
Century21 API → tipoOperacion: "venta" (mal)
       ↓
Discovery n8n → Extrae prop.tipoOperacion sin validar
       ↓
registrar_discovery() → Guarda tipo_operacion = 'venta'
       ↓
Enrichment → Convierte 3750 BOB → $539 USD (como venta)
       ↓
Frontend → Muestra depto de $539 con precio/m² de $6.53
```

---

## Impacto

| Metrica | Valor |
|---------|-------|
| Propiedades afectadas confirmadas | 1 |
| Propiedades potencialmente afectadas | Desconocido |
| Datos corruptos | precio_usd, tipo_operacion |
| Reportes afectados | Informe fiduciario landing page |

### Sintomas visibles
- Propiedad Macororo 7 mostrando $539 (deberia ser ~$90,000 venta o excluido)
- Precio/m² de $6.53 (imposible para Equipetrol)
- Match score artificialmente alto por precio bajo

---

## Fix Aplicado

### 1. Correccion manual (ID 249)
```sql
-- Ejecutado: 11 Enero 2026
UPDATE propiedades_v2
SET
  tipo_operacion = 'alquiler',
  status = 'excluido_operacion',
  razon_inactiva = 'BUG-001: API Century21 devolvio tipo_operacion incorrecto',
  fecha_inactivacion = NOW()
WHERE id = 249;
```

### 2. View de monitoreo creada
```sql
-- v_sospechosos_tipo_operacion
-- Detecta propiedades con URL de alquiler pero tipo_operacion = venta
```

---

## Prevencion Futura

### Opcion A: Validacion en Discovery (Recomendado)
Modificar nodo "Extraer Propiedades" en `flujo_a_discovery_century21`:

```javascript
tipo_operacion: (() => {
  const url = (prop.urlCorrectaPropiedad || '').toLowerCase();
  if (url.includes('alquiler')) return 'alquiler';
  if (url.includes('anticretico')) return 'anticretico';
  return prop.tipoOperacion || 'venta';
})()
```

### Opcion B: Validacion en registrar_discovery()
```sql
-- Agregar validacion de precio/m² minimo
IF p_tipo_operacion = 'venta' AND p_precio_usd IS NOT NULL
   AND p_area_total_m2 IS NOT NULL
   AND (p_precio_usd / p_area_total_m2) < 500 THEN
  RAISE WARNING 'Precio/m² sospechoso para venta: %', p_precio_usd / p_area_total_m2;
  -- Marcar para revision manual
END IF;
```

---

## Monitoreo

### Query semanal
```sql
-- Ejecutar cada lunes para detectar nuevos casos
SELECT * FROM v_sospechosos_tipo_operacion;
```

### Alertas
- Si `COUNT(*) > 0` en view de sospechosos → Notificar Slack
- Agregar a auditoria_diaria_sici.json

---

## Referencias

- Propiedad afectada: https://c21.com.bo/propiedad/91778
- Workflow Discovery: `n8n/workflows/modulo_1/flujo_a_discovery_century21_v1.0.3_FINAL.json`
- Funcion SQL: `sql/functions/discovery/registrar_discovery.sql`

---

## Historial

| Fecha | Accion |
|-------|--------|
| 11 Ene 2026 | Bug descubierto durante revision de landing page Simon |
| 11 Ene 2026 | Root cause identificado: API Century21 |
| 11 Ene 2026 | Fix manual aplicado a ID 249 |
| 11 Ene 2026 | View de monitoreo creada |
