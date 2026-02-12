# Bitácora Snapshots — Febrero 2026

## Resumen Ejecutivo

El sistema de Market Investment Snapshots fue activado el **12 de febrero de 2026**. Durante la puesta en marcha se identificó **contaminación por backlog retroactivo** en las métricas de absorción, tanto de venta como de alquiler. Este documento registra qué métricas son confiables, cuáles no, y cuándo se limpian.

---

## Cronología de Eventos (12 Feb 2026)

### 1. Activación pipeline alquiler

Se desplegaron los 4 workflows de alquiler en n8n:
- Discovery C21 Alquiler (2:00 AM)
- Discovery Remax Alquiler (2:15 AM)
- Enrichment LLM Alquiler (3:00 AM)
- Merge Alquiler (4:00 AM)

**Primera corrida test:**
- Discovery C21: 2 nuevas, 8 ausentes
- Discovery Remax: 0 nuevas, 38 ausentes
- Enrichment: 8 procesadas
- Merge: 168/168/0

### 2. Fix retroactivo `primera_ausencia_at` para ventas

**Problema:** 167 propiedades de venta en `inactivo_pending` tenían `primera_ausencia_at = NULL` porque fueron marcadas antes de que el Flujo A incluyera `COALESCE(primera_ausencia_at, NOW())`.

**Acción:** Se corrió UPDATE masivo seteando `primera_ausencia_at = fecha_actualizacion` para las 167 propiedades. Esto les dio fechas variadas (14 Ene - 11 Feb) pero no necesariamente corresponden al día real en que desaparecieron del portal.

### 3. Auto-confirmación C21 ventas

**Problema:** 129 propiedades de C21 en `inactivo_pending` con más de 1 día de ausencia.

**Verificación:** Se revisaron URLs manualmente — todas mostraban "aviso terminado" en el portal de C21.

**Acción:** Se confirmaron automáticamente como `inactivo_confirmed` via SQL. Sus fechas de `primera_ausencia_at` vienen del fix retroactivo del paso 2.

### 4. Flujo C verificador (Remax ventas)

Se corrió Flujo C para 38 Remax ventas:
- 22 confirmadas como `inactivo_confirmed` (HTTP HEAD → no 200)
- 16 reactivadas a `completado` (HTTP HEAD → 200, siguen activas)

### 5. Fix retroactivo `primera_ausencia_at` para alquileres

**Problema:** 40 alquileres en `inactivo_pending` con `primera_ausencia_at = NULL`. El Flujo A de alquiler ya tenía el COALESCE, pero estas propiedades ya estaban en `inactivo_pending` antes del fix (no se re-procesaron).

**Acción:** Se corrió `UPDATE SET primera_ausencia_at = NOW()` para las 40.

### 6. Confirmación directa alquileres

**Problema:** Las 40 alquileres en `inactivo_pending` iban a esperar 7 días innecesariamente. El Flujo C ya verificó por HTTP que las URLs no responden. Tenerlas en limbo contaminaba el snapshot (no contaban como activas ni como absorbidas).

**Acción:** Se confirmaron directamente como `inactivo_confirmed`:
- 46 alquileres confirmados
- 2 anticrético confirmados

### 7. Flujo C universal

Se modificó Flujo C para cubrir venta + alquiler:
- Removido filtro `AND tipo_operacion = 'venta'`
- LIMIT aumentado de 100 a 200

---

## Estado Final de Datos (12 Feb 2026)

### Inventario

| Tipo Operación | completado | actualizado | inactivo_confirmed | inactivo_pending |
|---------------|------------|-------------|-------------------|-----------------|
| Venta | ~326 | - | ~132 | 0 |
| Alquiler | 168 | 6 | 46 | 0 |
| Anticrético | - | - | 2 | 0 |

### Distribución de `primera_ausencia_at` en inactivo_confirmed

```
14 Ene 2026:  61 props  ← backlog masivo (fecha_actualizacion retroactiva)
15-18 Ene:    15 props  ← backlog
19 Ene-9 Feb: 22 props  ← mix backlog + orgánicas
10 Feb:       27 props  ← confirmación manual reciente
11 Feb:        2 props  ← orgánicas recientes
12 Feb:       48 props  ← 46 alquiler + 2 anticrético (todas backlog)
```

---

## Contaminación Identificada

### Absorción de Venta

**Causa:** Se seteó `primera_ausencia_at = fecha_actualizacion` retroactivamente para ~167 ventas. Estas fechas NO corresponden al día real en que desaparecieron del portal — son aproximaciones basadas en la última actualización de la propiedad.

**Impacto:** La tasa de absorción y meses de inventario están inflados. Ejemplo: 132 absorbidas en 30 días sobre 326 activas = 40% de rotación mensual, lo cual es irreal para el mercado inmobiliario.

**Limpieza:** Progresiva.
- **13 Feb:** Salen 61 del 14 Ene → mejora significativa
- **17 Feb:** Salen las de 15-18 Ene → dato ya utilizable
- **14 Mar:** Sale todo el backlog → dato completamente limpio

### Absorción de Alquiler

**Causa:** Se seteó `primera_ausencia_at = NOW()` (12 Feb) para las 48 alquileres/anticrético confirmadas hoy. Todas tienen la misma fecha, pero en realidad desaparecieron en momentos diferentes durante semanas/meses anteriores.

**Impacto:** Si se calculara absorción de alquiler, mostraría 48 absorbidas en un solo día, lo cual es irreal.

**Limpieza:**
- **14 Mar 2026:** Las 48 de hoy salen de la ventana de 30 días → dato limpio

---

## Métricas Confiables vs No Confiables

### Confiables desde día 1 (12 Feb 2026)

| Métrica | Por qué es confiable |
|---------|---------------------|
| `venta_activas` | Count de propiedades con status=completado. No depende de fechas retroactivas |
| `venta_ticket_promedio/mediana/p25/p75` | Calculado sobre activas, no sobre absorbidas |
| `venta_usd_m2` | Calculado sobre activas |
| `venta_area_promedio` | Calculado sobre activas |
| `venta_nuevas_30d` | Usa `fecha_creacion`, que es orgánica (no retroactiva) |
| `alquiler_activas` | Count de alquileres con status=completado |
| `alquiler_mensual_promedio/mediana/p25/p75` | Calculado sobre activas |
| `roi_bruto_anual` | Usa promedios de activas (venta + alquiler) |
| `anos_retorno` | Derivado del ROI |

### NO confiables hasta limpieza

| Métrica | Contaminada hasta | Por qué |
|---------|-------------------|---------|
| `venta_absorbidas_30d` | ~17 Feb 2026 | Backlog retroactivo infla el count |
| `venta_tasa_absorcion` | ~17 Feb 2026 | Depende de absorbidas |
| `venta_meses_inventario` | ~17 Feb 2026 | Depende de absorbidas |
| `absorbidas_ticket_promedio` | ~17 Feb 2026 | Pool de absorbidas contaminado |
| `absorbidas_usd_m2` | ~17 Feb 2026 | Pool de absorbidas contaminado |
| Absorción alquiler | ~14 Mar 2026 | No se usa en el informe actual, pero el dato subyacente está contaminado |

---

## Primer Informe Compartible

### Estructura recomendada (disponible hoy)

1. **Inventario de venta** — activas por tipología
2. **Precios de venta** — ticket, mediana, percentiles, USD/m², área
3. **Precios de alquiler** — mensual por tipología
4. **ROI bruto anual** — cruzado venta vs alquiler, años retorno
5. **Disclaimer:** absorción disponible a partir de ~17 Feb (venta) y Mar 2026 (alquiler)

### Datos del snapshot 12 Feb 2026

#### Precios de Venta (USD) — CONFIABLE

| Tipología | Activas | Ticket Prom | Mediana | P25 | P75 | USD/m² | Área |
|-----------|---------|-------------|---------|-----|-----|--------|------|
| Estudio | 35 | $84,945 | $82,974 | $68,982 | $100,860 | $2,315 | 37 m² |
| 1 Dorm | 151 | $105,499 | $100,129 | $76,154 | $125,058 | $1,944 | 54 m² |
| 2 Dorms | 110 | $185,725 | $179,878 | $146,688 | $216,596 | $1,981 | 95 m² |
| 3 Dorms | 30 | $320,003 | $287,256 | $220,388 | $449,614 | $1,853 | 170 m² |

#### Precios de Alquiler (USD/mes) — CONFIABLE

| Tipología | Activas | Promedio | Mediana | P25 | P75 |
|-----------|---------|----------|---------|-----|-----|
| Estudio | 23 | $517 | $503 | $424 | $546 |
| 1 Dorm | 71 | $596 | $503 | $453 | $686 |
| 2 Dorms | 57 | $986 | $862 | $790 | $1,221 |
| 3 Dorms | 12 | $1,495 | $1,509 | $1,031 | $1,797 |

#### ROI Bruto Anual — CONFIABLE

| Tipología | ROI Bruto | Años Retorno |
|-----------|-----------|-------------|
| **Estudio** | **7.30%** | **13.7** |
| 1 Dorm | 6.78% | 14.8 |
| 2 Dorms | 6.37% | 15.7 |
| 3 Dorms | 5.61% | 17.8 |

#### Absorción de Venta — CONTAMINADA (backlog)

| Tipología | Absorbidas 30d | Tasa | Meses Inv. | Status |
|-----------|---------------|------|------------|--------|
| Estudio | 22 | 38.6% | 1.6 | Inflado |
| 1 Dorm | 63 | 29.4% | 2.4 | Inflado |
| 2 Dorms | 29 | 20.9% | 3.8 | Probablemente inflado |
| 3 Dorms | 18 | 37.5% | 1.7 | Inflado |

**No usar estas métricas en informes públicos hasta ~17 Feb 2026.**

---

## Timeline de Limpieza

```
12 Feb 2026  ─── HOY: Sistema activado. Backlog seteado.
                 Métricas confiables: precios, inventario, ROI
                 Métricas NO confiables: absorción venta y alquiler
    │
13 Feb 2026  ─── Salen 61 props del 14 Ene de la ventana → mejora notable
    │
17 Feb 2026  ─── Salen las de 15-18 Ene → absorción venta UTILIZABLE
    │            Primer informe completo de venta posible
    │
14 Mar 2026  ─── Salen las 48 de hoy → absorción alquiler LIMPIA
                 Informe completo con absorción venta + alquiler
```

---

## Lecciones Aprendidas

1. **Activar tracking ANTES de necesitar los datos.** El backlog retroactivo contamina las métricas de absorción porque no hay forma de saber cuándo realmente desapareció cada propiedad.

2. **`primera_ausencia_at` es la columna más crítica del sistema de absorción.** Sin ella, Flujo C no puede calcular `dias_desde_ausencia` y las propiedades quedan en limbo.

3. **El COALESCE pattern es esencial:** `primera_ausencia_at = COALESCE(primera_ausencia_at, NOW())` — solo setea la fecha la primera vez. Debe estar en TODOS los queries de "marcar ausente" de TODOS los flujos.

4. **Flujo C debe ser universal.** No tiene sentido mantener flujos C separados para venta y alquiler. El verificador HTTP es agnóstico al tipo de operación.

5. **Los datos de precios y ROI son inmediatamente confiables** porque se calculan sobre el inventario activo (status=completado), no sobre fechas retroactivas.

6. **La contaminación se auto-limpia** gracias a la ventana rolling de 30 días. Solo hay que esperar.
