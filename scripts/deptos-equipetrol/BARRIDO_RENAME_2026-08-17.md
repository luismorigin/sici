# Barrido completo — qué le pasa a CADA pieza el día del rename

> **Por qué existe.** El founder: *"cada vez que te pido que verifiques nace algo nuevo porque no
> llegamos al fondo"*. Tenía razón, y el motivo era el método: se venía verificando **de a pedazos**,
> siguiendo el hilo de cada tarea. Este documento recorre el terreno **entero, una vez**, y contesta
> una sola pregunta para cada objeto: **¿qué le pasa el día que `propiedades_v2_shadow` pase a
> llamarse `propiedades_v2`?**
>
> Si después de esto aparece algo nuevo, el barrido estuvo mal hecho — no es que el terreno esconda.
>
> **Método:** catálogo de Postgres (`pg_proc`, `pg_class`, `pg_trigger`, `pg_rewrite`) + grep del
> código. Las funciones de lectura se **ejecutaron**; las de escritura se clasificaron por su texto y
> por quién las llama. Línea de base medida en `FOTO_PREVIA_ARREGLOS_2026-08-17.md`.

## El resultado en una tabla

**74 funciones** tocan alguna variante de `propiedades_v2`. Se reparten así:

| | Categoría | Cuántas | Qué hacer |
|---|---|---:|---|
| **C** | **Vivas hoy — el rename las ROMPE** | **7** | 🔴 protegerlas en el mismo movimiento |
| **B1** | Rotas — el rename las despierta **con precio viejo** | 6 | borrar antes |
| **B2** | Rotas — el rename las despierta **escribiendo** | 25 | borrar las que no queremos que revivan |
| **A** | Rotas — el rename las arregla **bien** | 34 | 🚫 no tocar |
| — | otros | 2 | — |

---

## 🔴 C — Las 7 que el rename ROMPE. Es lo más importante del barrido.

Nombran `propiedades_v2_shadow` **por texto**, y una función resuelve el nombre al ejecutarse. El día
que ese nombre no exista, las 7 fallan:

| Función | Qué se cae con ella |
|---|---|
| `buscar_unidades_simple_shadow` | **el feed de ventas** |
| `buscar_unidades_alquiler_shadow` | **el feed de alquileres** |
| `buscar_extras_shadow` | los extras de ambos feeds |
| `buscar_similares` | 🔴 **el bot de WhatsApp** (una de sus 3 RPC) |
| `reservar_ids_shadow` | **la captura nocturna** (el cargador pide ids acá) |
| `snapshot_absorcion_mercado_shadow` | el snapshot del cron (paso 5c) |
| `reconstruir_serie_precios_reexpresada` | la serie histórica de `/mercado` |

👉 **Sin protección, el rename tumba los dos feeds, el bot y la captura de esa noche.** Es
exactamente lo que el plan previene con el atajo (*"el renombrado va con alias"*, §"vistas vs
funciones"). Este barrido aporta **la lista cerrada de qué tiene que cubrir ese atajo.**

✅ **Las 4 vistas `_shadow` NO se rompen.** `v_mercado_venta_shadow`, `v_mercado_alquiler_shadow`,
`v_estado_obra_inferido_shadow` y `v_zona_efectiva_shadow` se ligan a la tabla **por OID, no por
nombre**. No es teoría: se comprobó en el TIEMPO 1, cuando las vistas sin sufijo quedaron pegadas al
archivo al renombrarlo (regla 10 de CLAUDE.md). Las vistas siguen a la tabla; las funciones no.

## B1 — Las 6 que despertarían con la fórmula vieja de precio

`buscar_unidades_simple` · `buscar_unidades_reales` · `analisis_mercado_fiduciario` ·
`explicar_precio` · `generar_razon_fiduciaria` · `snapshot_absorcion_mercado`

Las 6 usan `precio_normalizado()` (la del ×1,47) y leen la tabla inexistente. **Son las del arreglo 2.**
Detalle de llamadores y dependencias en `FOTO_PREVIA_ARREGLOS_2026-08-17.md` §4.

## B2 — Las 25 que despertarían escribiendo

Son las del pipeline n8n muerto: `registrar_discovery`, `registrar_enrichment`, `merge_*`,
`matching_*`, `procesar_*`, `recalcular_precios_batch_nocturno`, `actualizar_tipo_cambio`…
Al despertar harían `UPDATE`/`INSERT` sobre la base viva con reglas del régimen viejo.

⚠️ **Pero ninguna se ejecuta sola** — hay que invocarlas. Y quien las invocaba (n8n) está apagado
desde el 28-jul. Las que quedan alcanzables desde el código son **las del `/admin/supervisor`**, las
6 pantallas que el plan del admin ya manda a retirar (grupo C de `ADMIN_ANALISIS` §13.4).
👉 Riesgo **dormido**, no activo. Pero un sistema que guarda 25 escrituras listas para despertar no
es un sistema terminado: se borran junto con las pantallas que las llaman.

## A — Las 34 que el rename ARREGLA. No tocar.

Matching y proyectos: `inferir_datos_proyecto`, `propagar_proyecto_a_propiedades`,
`sincronizar_propiedad_desde_proyecto`, los `generar_matches_*`… Hoy están rotas y **queremos que
vuelvan**. Tocarlas antes es hacer el trabajo dos veces (`ADMIN_ANALISIS` §13.2).

---

## 🔴 Los triggers: la base viva no tiene NINGUNO

Hallazgo del barrido, y no estaba en ningún documento.

| Tabla | Triggers activos |
|---|---|
| `propiedades_v2_shadow` (**la viva**) | **0** |
| `propiedades_v2_archivo` (congelada) | **5**: `tr_proteger_amenities_merge`, `trg_asignar_zona_venta`, `trg_asignar_zona_alquiler`, `trg_alquiler_matching`, `trg_sync_sin_match` |

Los triggers **siguieron a la tabla** cuando el TIEMPO 1 la renombró, y `propiedades_v2_shadow` se
creó sin ellos. Dos consecuencias:

1. **`tr_proteger_amenities_merge` —la protección de candados— vive en el archivo, no en la base
   viva.** Eso explica de dónde sale la condición de entrada 4 (*"que los cargadores respeten
   `campos_bloqueados`"*): la protección estaba en un trigger que la base viva no heredó.
2. **`trg_asignar_zona_venta` tampoco está**, así que la zona por GPS no se asigna sola en la base
   viva. Hoy lo resuelve el cargador del híbrido.

👉 **El rename NO mueve los triggers**: seguirán en el archivo. No hay que hacer nada por ellos en el
cutover — pero tampoco esperar que aparezcan.

✅ `fn_trigger_tc_actualizado` (el que el inventario marcó en su ronda 3) está **deshabilitado**.
Verificado por `tgenabled`.

## 🚫 Lo que NO se toca

**`precio_normalizado()` se queda.** La usan 4 vistas y las 4 leen el archivo — entre ellas
**`v_mercado_casas`, que sirve el feed vivo `/ventas/casas`**. Para el archivo la fórmula vieja es la
**correcta**: esos datos son del régimen viejo. Se borran sus consumidores rotos, no ella.

## Lo que este barrido cambia del plan

1. **El atajo del rename pasa de "buena idea" a lista concreta**: tiene que cubrir 7 funciones, y
   dos de ellas (`reservar_ids_shadow`, `buscar_similares`) no estaban en ninguna lista previa. Sin
   ellas, el rename tumba la captura de esa noche y el bot.
2. **Los triggers ausentes explican la condición 4** y confirman que no se resuelve sola.
3. **B2 baja de prioridad**: es riesgo dormido, no activo, y muere con el retiro del supervisor.
