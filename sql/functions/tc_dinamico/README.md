# TC Dinámico - Sistema de Tipo de Cambio

**Versión:** 1.1.1 🔒  
**Archivo:** `modulo_tipo_cambio_dinamico.sql`

---

## Propósito

Gestión automática de tipos de cambio (oficial/paralelo) con recálculo de precios en propiedades que dependen de TC.

---

## Componentes

| Tipo | Nombre | Propósito |
|------|--------|-----------|
| Tabla | `auditoria_tipo_cambio` | Historial de cambios TC |
| Función | `actualizar_tipo_cambio()` | Actualiza TC + marca propiedades |
| Función | `recalcular_precio_propiedad()` | Recalcula precio individual |
| Función | `recalcular_precios_batch_nocturno()` | Job batch (3 AM) |
| Función | `ver_historial_tc()` | Consulta auditoría |
| Función | `obtener_propiedades_tc_pendiente()` | Lista pendientes |
| Función | `obtener_tc_actuales()` | Retorna TCs + spread |
| Trigger | `trigger_tc_actualizado` | Auto-marca al cambiar TC |

---

## Configuración Actual

| Clave | Valor |
|-------|-------|
| `tipo_cambio_oficial` | 6.96 |
| `tipo_cambio_paralelo` | 10.50 |

---

## Flujo de Recálculo

```
1. Cambia TC en config_global
         ↓
2. Trigger marca propiedades (requiere_actualizacion_precio = TRUE)
         ↓
3. Job nocturno ejecuta recalcular_precios_batch_nocturno()
         ↓
4. Cada propiedad: recalcular_precio_propiedad()
         ↓
5. precio_usd_actualizado = precio_BOB / TC_nuevo
```

---

## Fórmula de Recálculo (v1.1.1)

```
precio_BOB = precio_usd × TC_usado_original
precio_usd_actualizado = precio_BOB / TC_actual
```

**Prioridad TC usado:**
1. `tipo_cambio_paralelo_usado` (si existe)
2. `tipo_cambio_usado` (fallback)
3. TC actual (último recurso)

---

## Propiedades Afectadas

Solo recalcula si:
- `depende_de_tc = TRUE`
- `es_activa = TRUE`
- `campos_bloqueados->>'precio_usd_actualizado' != TRUE`

---

## Dependencias

- Tabla: `config_global` (valor NUMERIC)
- Tabla: `propiedades_v2`

---

⚠️ **NO MODIFICAR** - Módulo 1 Congelado
