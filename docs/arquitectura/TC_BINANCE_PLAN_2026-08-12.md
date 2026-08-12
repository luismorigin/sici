# Descongelar el TC — plan en 3 pasos con foto previa

> 12-ago-2026. El diagnóstico está en `TC_BINANCE_DIAGNOSTICO_2026-08-11.md`; esto es **cómo
> aplicarlo sin romper la superficie de al lado** — que es exactamente lo que faltó en las migs
> 315/316/317 esta semana.
> **Un paso por vez, con foto antes y después.** Si algo se mueve, se sabe cuál fue.

## GOAL

Que `config_global.tipo_cambio_paralelo` deje de estar congelado y se actualice solo cada noche,
sin que se mueva nada más que lo que tiene que moverse.

### Qué NO entra
- No se toca `tipo_cambio_oficial = 6.96` — es una **constante ancla muerta**, no el oficial de hoy.
  Cambiarla reescribiría el significado de la etiqueta `oficial_viejo` y endurecería el clasificador.
- No se marca `precio_normalizado_shadow` como `IMMUTABLE` (congelaría los precios con un TC viejo).
- No se rediseña la serie histórica sesgada — se declara, no se reconstruye.

---

## 📸 FOTO PREVIA — medida el 12-ago antes de tocar nada

| | |
|---|---|
| TC en `config_global` | **11.638** — congelado hace **16 días** (27-jul) |
| TC real en Binance hoy | **11.534** (promedio 5 primeros SELL) |
| Brecha | **−0,89%** |

**Lo que cambia al actualizar** (medido, no estimado):

| | |
|---|---|
| Props del feed de VENTA afectadas | **44** (las de etiqueta `bob`) |
| Suman hoy | **$3.662.897** |
| Pasarían a | **$3.695.925** → **+0,90%** |
| La más cara | **#3656: $256.058 → $258.367** |
| #2832 | $227.702 → $229.756 |
| #2471 | $180.443 → $182.070 |

**Lo que NO tiene que cambiar:**

| | |
|---|---|
| `/ventas` — activos | **354** |
| `v_mercado_venta_shadow` | **756** filas |
| `v_mercado_alquiler_shadow` | **294** filas |
| Precio de las props que no son `bob` | idéntico (712 de 756) |
| Display de alquiler | **en Bs, no se mueve** (solo cambia el USD derivado, que no se muestra) |

🔴 **Cambio de comportamiento a declarar:** con el TC actualizándose a diario, esas 44 props van a
moverse unas décimas **todos los días**. Es correcto —el precio en Bs es fijo y el dólar varía— pero
hoy el feed está quieto y va a dejar de estarlo. También mueve la mediana de `/mercado`.

---

## PASO 1 — Actualizar el TC de hoy 🟢 riesgo bajo, reversible

`node scripts/deptos-equipetrol/capturar-tc-binance.mjs --apply`

Escribe `config_global` **y** deja el registro en `tc_binance_historial` (a diferencia de un UPDATE
a mano, que no deja rastro).

**Por qué es seguro** (verificado hoy, no asumido):
- Los dos triggers de `config_global`: `trigger_tc_actualizado` está **DESACTIVADO** (`tgenabled='D'`,
  lo apagó el TIEMPO 1) y `trigger_actualizar_precios_cuando_cambia_tc` solo dispara con las claves
  en MAYÚSCULAS, borradas el 19-jun, y escribe sobre la tabla legacy `propiedades`.
- El módulo de recálculo masivo está deprecado desde el 19-jun y su cron desagendado.

### Evals
1. 🔴 **`/ventas` sigue en 354 activos.** *(El único que obliga a revertir: si el conteo se mueve, el
   cambio de TC sacó o metió propiedades del feed, que no es lo que se pidió.)*
2. Las 3 props de referencia muestran **$258.367 / $229.756 / $182.070**.
3. Una prop que NO sea `bob` muestra exactamente el mismo precio que antes.
4. El display de alquiler sigue en Bs, sin cambios.

**Rollback:** `UPDATE config_global SET valor='11.638' WHERE clave='tipo_cambio_paralelo';`

---

## PASO 2 — Aplicar la mig 322 🟢 riesgo bajo, es histórico

`sql/migrations/322_tc_binance_historial_registro_honesto.sql` (rama
`worktree-fix+tc-binance-captura`).

Corrige el flag `aplicado_a_config`, que está **invertido** —las 67 filas se aplicaron y las 67 dicen
FALSE— y amplía `registrar_consulta_binance` con los 3 parámetros que nunca recibió.

No toca ninguna superficie que el feed lea. Es el paso más tranquilo de los tres.

### Evals
1. Las 67 filas ≤27-jul quedan en `aplicado_a_config = true`.
2. El feed no se mueve (no debería tocarlo en absoluto): **354 activos**.

---

## PASO 3 — Agendar la captura diaria 🟠 EL DELICADO

**Por qué es el delicado:** el capturador hace `process.exit(1)` en **cinco** lugares —si Binance no
responde, si el TC sale del rango 8–15, si el salto supera el 10%—. Eso está bien para correrlo a
mano, pero **si se agrega como un paso más del cron nocturno y sale con error, puede cortar la
captura de propiedades de esa noche**.

🔑 Un fallo del tipo de cambio **no puede arrastrar la captura**. El paso tiene que estar envuelto
para que su error quede en el log y el cron siga.

Va como último paso, con los otros dos ya asentados, y con la ventaja de que corre **antes** que la
captura: así el clasificador de la noche usa el valor fresco. Hoy las cuatro capturas **leen** el TC
y ninguna lo **refresca**.

### Evals
1. Una noche completa: el TC se actualizó **y** las 4 capturas corrieron.
2. Forzar un fallo del TC (sin red) y comprobar que la captura **igual corre**.
3. El log de la mañana declara el TC del día.

---

## Lo que este plan NO resuelve
- La **serie histórica sesgada**: `tc_binance_historial` hasta el 27-jul no es la serie del TC, es la
  lista de días en que el paralelo se movió ≥0,5%. Se declara, no se reconstruye.
- Que `/admin/salud` y `/admin/market` muestren el 6,96 como "TC oficial". Es engañoso pero
  cosmético; va con el rediseño del admin.
