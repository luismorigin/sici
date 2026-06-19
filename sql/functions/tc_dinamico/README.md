# TC Dinámico - Sistema de Tipo de Cambio

> ⛔ **DEPRECADO (19-jun-2026).** Este módulo (cache `precio_usd_actualizado`) fue reemplazado por `precio_normalizado()` que normaliza EN VIVO en cada consulta del feed. El cron `recalcular-precios-diario` (corría 7:05 AM) fue **desagendado** y las funciones `recalcular_precios_batch_nocturno`/`recalcular_precio_propiedad` marcadas DEPRECADO. Ningún query del feed consume `precio_usd_actualizado` (verificado: ni RPCs, ni snapshots, ni absorción, ni estudio de mercado). Se deja la doc como referencia histórica. No revivir sin justificación. Ver memoria `project_bug_mig174_tc_paralelo_n8n_incompleta`.

**Versión:** 1.1.1 (deprecado)
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
| Función | `recalcular_precios_batch_nocturno()` | Job batch (cron 7:05 AM, **DESAGENDADO 19-jun**) |
| Función | `ver_historial_tc()` | Consulta auditoría |
| Función | `obtener_propiedades_tc_pendiente()` | Lista pendientes |
| Función | `obtener_tc_actuales()` | Retorna TCs + spread |
| Trigger | `trigger_tc_actualizado` | Auto-marca al cambiar TC |

---

## Configuración Actual

| Clave | Valor |
|-------|-------|
| `tipo_cambio_oficial` | 6.96 |
| `tipo_cambio_paralelo` | (dato dinámico — consultar `config_global WHERE clave='tipo_cambio_paralelo' AND activo`; binance_p2p lo actualiza a diario. NO hardcodear) |

> Nota: las claves MAYÚSCULAS fósiles (`TIPO_CAMBIO_OFICIAL`/`TIPO_CAMBIO_PARALELO`) fueron **borradas** de `config_global` el 19-jun-2026. Solo existen las minúsculas activas.

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

⛔ **DEPRECADO 19-jun-2026** (ver nota al inicio). Antes era "Módulo 1 Congelado / no modificar"; ahora el cron está desagendado y nadie consume su salida.
