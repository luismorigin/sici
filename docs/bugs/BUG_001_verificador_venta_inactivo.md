# BUG-001: Verificador de venta no confirma inactivaciones

**Severidad:** CRITICA
**Detectado:** 2026-03-22
**Afecta desde:** ~2026-02-11
**Resuelto:** 2026-03-22
**Estado:** RESUELTO
**Componente:** Flujo C — Verificador de ausencias (venta)

---

## Resumen

El workflow `verificador` (venta) se ejecuta diariamente, reporta `status: success`, pero procesa **0 registros** desde al menos el 11 de febrero de 2026. Esto significa que ninguna propiedad de venta pasa de `inactivo_pending` a `inactivo_confirmed`, corrompiendo las metricas de absorcion del mercado.

El workflow `verificador_alquiler` funciona correctamente (20-42 registros/dia).

---

## Evidencia

### 183 propiedades de venta atrapadas en `inactivo_pending`

| Periodo primera_ausencia_at | Cantidad | Dias esperando (al 22 mar) |
|---|---|---|
| 13-14 feb | 20 | 37+ dias |
| 17-28 feb | 40 | 22-33 dias |
| 1-14 mar | 58 | 8-21 dias |
| 16-22 mar | 65 | 0-6 dias |

### Workflow executions

| Workflow | records_processed (tipico) |
|---|---|
| `verificador` (venta) | **0** — todos los dias |
| `verificador_alquiler` | 20-42/dia — normal |

### Impacto en market_absorption_snapshots

```
12 feb: venta_absorbidas_30d = 132
14 feb: 85
28 feb: 53
 7 mar: 42
12 mar: 23
13 mar: 2
14 mar+: 0    ← completamente corrupto desde aca
```

### Ultima confirmacion de venta

Fecha: **11 de febrero de 2026** (2 propiedades). Dia anterior: 26 propiedades. Despues: cero.

---

## Causa raiz probable

### Hipotesis 1: Query del verificador no encuentra propiedades de venta

El verificador de venta (Flujo C) ejecuta una query tipo:
```sql
SELECT id, url, fuente...
FROM propiedades_v2
WHERE status = 'inactivo_pending'
AND fuente = 'remax'
LIMIT 200
```

Pero procesa 0 registros a pesar de que hay 183 propiedades en `inactivo_pending`. Posible filtro incorrecto o condicion adicional que excluye todo.

### Hipotesis 2: Century21 excluido del verificador

El verificador de venta solo procesa fuente `remax` — las propiedades C21 en `inactivo_pending` (62 de las 183) nunca seran confirmadas por diseno. C21 fue excluido porque devuelve HTTP 200 con pagina generica en vez de 404.

### Hipotesis 3: Diferencia de campos entre pipelines

| Campo | Venta inactivo_pending | Alquiler inactivo_pending |
|---|---|---|
| `primera_ausencia_at` | Todas tienen fecha (183/183) | Ninguna tiene fecha (0/29) |
| `fecha_inactivacion` | Todas NULL | N/A |

Los pipelines operan con campos diferentes. El verificador de venta puede depender de un campo que no esta seteado correctamente.

---

## Archivos a investigar

1. **Edge function del verificador de venta:**
   - Buscar en `supabase/functions/` o donde esten las edge functions
   - Documento canonico: `sici/docs/canonical/flujo_c_verificador_canonical.md`

2. **Discovery de venta (Remax):**
   - Modificado el 28 feb 2026
   - Remax NO filtra por `tipo_operacion = 'venta'` en su SELECT (a diferencia de C21 que si filtra)

3. **Funciones SQL relacionadas:**
   - `registrar_discovery()` — venta
   - `determinar_status_post_discovery()` — transiciones de status
   - `es_propiedad_vigente()` — 300 dias para venta

---

## Impacto en metricas de negocio

- **Absorcion de venta:** Completamente corrupta desde 14 de marzo (muestra 0%)
- **Meses de inventario:** Infinito (no hay absorciones)
- **Tasa de absorcion:** 0% falso
- **ROI bruto anual en snapshots:** Potencialmente afectado si depende de propiedades confirmadas
- **Cualquier analisis de inversion** que use absorcion de venta no es confiable

---

## Plan de remediacion propuesto

### Fase 1: Diagnostico exacto
- [ ] Leer codigo de la edge function `verificador` (venta)
- [ ] Identificar la query que devuelve 0 resultados
- [ ] Comparar con `verificador_alquiler` que si funciona

### Fase 2: Fix del verificador
- [ ] Corregir la query/condicion que excluye propiedades de venta
- [ ] Decidir que hacer con C21 (pagina generica en vez de 404)
- [ ] Testear con subset antes de ejecutar masivamente

### Fase 3: Limpieza retroactiva
- [ ] Confirmar las ~20 propiedades con 37+ dias en pending (evidencia suficiente)
- [ ] Evaluar caso por caso las mas recientes
- [ ] Recalcular `market_absorption_snapshots` retroactivamente

### Fase 4: Monitoreo
- [ ] Agregar alerta: si `inactivo_pending` crece N dias sin que `inactivo_confirmed` crezca, flag
- [ ] Dashboard de salud del verificador (records_processed > 0 para ambos workflows)

---

*Detectado durante analisis de viabilidad del Analizador de Inversiones de Simon (sesion 2026-03-22)*

---

## Resolucion (22 marzo 2026)

### Causa raiz (doble)

1. **HTTP HEAD sin error handling:** El nodo HTTP HEAD del verificador no tenia `continueOnFail: true` ni `neverError: true` (el verificador de alquiler si los tenia). Cuando Remax devolvia cualquier error HTTP, el workflow explotaba silenciosamente.

2. **Remax devuelve HTTP 200 generico para propiedades removidas:** Remax es una SPA — devuelve HTTP 200 con el shell de la homepage para cualquier URL, incluyendo propiedades que ya no existen. Esto es identico al problema de C21. El HTTP check no sirve como senal confiable para ningun portal boliviano.

### Fix aplicado

**Archivo:** `n8n/workflows/modulo_1/flujo_c_verificador_v1.1.0_FINAL.json`

- Eliminada logica HTTP del nodo "Procesar respuesta" (v3.0.0)
- Solo auto-confirmacion por tiempo: `MAX_DIAS_PENDING = 2` dias
- Agregado `AND tipo_operacion = 'venta'` a la query (antes tambien agarraba alquileres)
- Logging dinamico en `registrar_ejecucion_workflow` (antes hardcodeado a 0, 0, 0)
- `neverError: true` + `continueOnFail: true` en HTTP HEAD (por si se reactiva en el futuro)
- Discovery es el safety net: si una propiedad reaparece en el API de Remax, `registrar_discovery()` la reactiva automaticamente via `determinar_status_post_discovery(inactivo_confirmed → actualizado)`

### Resultado post-fix

- 35 propiedades confirmadas inmediatamente
- 17 propiedades pendientes (se auto-confirman 24 mar)
- Verificador logueando records_processed reales

### Impacto en datos

**Snapshots corruptos:** `market_absorption_snapshots` tiene `venta_absorbidas_30d` incorrecto entre 14-feb y 22-mar-2026.

| Periodo | Estado |
|---|---|
| Antes de 14 feb | Datos buenos |
| 14 feb - 12 mar | Absorcion subestimada (decae de 16 a 6 sin nuevas confirmaciones) |
| 13 mar - 22 mar | Absorcion = 0 (completamente corrupto) |
| 23 mar en adelante | Datos confiables |

**Campos NO afectados:** inventario activo, precios, USD/m2, areas, alquiler, ROI.

**Referencia limpia para el periodo corrupto:** snapshot del 15-feb-2026 (dormitorios=0: 16 absorbidas, tasa 30.19%, 2.3 meses inventario).
