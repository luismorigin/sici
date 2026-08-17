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

---

# 🔴 DOBLE CHECK (17-ago, mismo día) — al barrido le faltaba un eje entero: EL CÓDIGO

> Pedido del founder: *"dale un doble check al nuevo documento con visión amplia y metiéndote en el
> código"*. Tenía razón otra vez: **todo lo de arriba mira la BASE DE DATOS**. Ninguna de sus
> consultas toca el repositorio. Y el código nombra la tabla tanto como las funciones.

## Los números

**53 puntos de código consultan `propiedades_v2_shadow` por nombre, en 20 archivos.**
(Contando solo `.from(...)` real; hay ~13 menciones más que son comentarios y no rompen nada.)

| Dónde | Puntos | Qué se cae con el rename |
|---|---:|---|
| `cargar-deptos-shadow.mjs` · `cargar-alquiler-shadow.mjs` | 7 + 7 | 🔴 **los dos cargadores nocturnos** |
| `verificador-deptos.mjs` · `verificador-alquiler.mjs` | 4 + 4 | los dos verificadores |
| `auditar-matching-shadow.mjs` · `auditar-shadow.mjs` | 3 + 1 | las auditorías |
| `discovery-deptos.mjs` · `discovery-alquiler.mjs` | 1 + 1 | el discovery de ambas operaciones |
| `usePropertyEditor.ts` | 8 | el editor del admin (vía constante `TABLA_PROPIEDADES`) |
| `admin/propiedades/index.tsx` | 4 | el listado del admin (misma constante) |
| `acm-buscar.ts` · `simon-contactos.ts` · `mercado-shadow-data.ts` | 1 c/u | el ACM · el CRM · la data de mercado |
| 6 utilitarios (`refrescar-fotos`, `chequear-portadas`, `derivar-pet-friendly`…) | 1-2 c/u | mantenimiento |

👉 **El rename no rompe 7 cosas: rompe 7 funciones SQL + 53 puntos de código.** Las 4 capturas
nocturnas, los verificadores, las auditorías, el editor del admin, el ACM y el CRM.

## 🔴 Y esto invalida la solución que el barrido daba por buena

Arriba se dice que el **atajo** (dejar el nombre viejo apuntando a la tabla renombrada) cubre las 7
funciones. Para leer, sí. **Para los cargadores, no**, y el motivo es concreto:

```js
await sb.from('propiedades_v2_shadow').upsert(f, { onConflict: 'id' })
```

Los dos cargadores escriben con **UPSERT**, que en SQL es `INSERT ... ON CONFLICT (id) DO UPDATE`.
`ON CONFLICT` necesita un **índice único real** para resolver el conflicto, y **una vista no tiene
índices**. Si el atajo es una vista, la captura de esa noche falla al escribir.

⚠️ **Declarado como pendiente de prueba, no como hecho:** esto es comportamiento conocido de
Postgres, pero **no se probó en esta base** (el acceso desde acá es de solo lectura). Dado cómo viene
el día, corresponde probarlo antes de confiar: crear la vista en una tabla de juguete e intentar el
upsert. Si funcionara, el atajo vuelve a ser suficiente y el plan se simplifica.

## Lo que se desprende

Si hay que tocar el código igual —y hay que tocarlo—, **el atajo pierde casi todo su valor**: se
vuelve una pieza extra que hay que limpiar después. El movimiento honesto es:

1. `ALTER TABLE ... RENAME` de la tabla.
2. **Recrear las 7 funciones** apuntando al nombre nuevo (mismo script).
3. **Buscar y reemplazar los 53 puntos de código** + desplegar.
4. Correr las 4 capturas a mano y mirar la línea de base de `FOTO_PREVIA_ARREGLOS_2026-08-17.md`.

Los 12 puntos del frontend pasan por **dos constantes** (`TABLA_PROPIEDADES` en `usePropertyEditor.ts`
y en `admin/propiedades/index.tsx`), así que ahí son 2 ediciones. Los **38 de los scripts no tienen
constante central**: cada archivo repite el literal.

> 🔴 **CORREGIDO el mismo día — acá decía "conviene crear esa constante ANTES del rename, sin
> riesgo". Es falso, y el análisis de riesgos lo desmintió.** Se escribió por inercia ("centralizar
> es buena práctica") sin mirar las condiciones de estos archivos en particular:
> - **Los scripts no tienen ninguna red de seguridad**: `package.json` de la raíz con `scripts: {}`
>   — sin tests, sin lint — y los `.mjs` no llevan tipos. Un import mal puesto **no lo atrapa nada**;
>   aparece cuando corre, a la 1:17 AM.
> - **Son el camino crítico nocturno**: los 2 cargadores, los 2 verificadores, los 2 discovery.
> - 🔑 **Y el argumento decisivo: centralizar no elimina el riesgo, lo MUEVE al peor momento.** El día
>   del rename hay foto previa, evals, el founder mirando y un `RENAME` inverso a mano. Una noche
>   cualquiera no hay nadie. Preparar lo difícil antes es correcto **cuando la preparación es más
>   segura que el momento del cambio**; acá es al revés.
> - Y el beneficio que compra es chico: reemplazar 38 literales es mecánico y **se verifica en un
>   segundo** (`grep -c` tiene que dar 0).
>
> 👉 **Decisión: NO centralizar antes del rename.** Se reemplazan los 38 el día del rename, bajo
> supervisión. Si se quiere la constante por mantenibilidad, va **después**, fuera del camino crítico
> del cutover. (Verificado de paso: **solo 1 rama modificó scripts** —2 archivos—, así que el riesgo
> de conflictos era nulo; una primera medición que daba 13 ramas estaba mal hecha, contaba también lo
> que avanzó `main`.)

## ✅ Un falso positivo, dicho para que no se repita

`cargar-deptos-shadow.mjs:98` consulta `propiedades_v2` —la tabla muerta— y **no es un bug**: es el
modo `--prep`, retirado el 20-jul, y el código **detecta el error y explica por qué** en vez de morir
con un mensaje de Postgres. El ciclo nocturno usa `--nuevas`. Se verificó leyendo el contexto antes
de reportarlo.

---

## Lo que este barrido cambia del plan

1. **El atajo del rename pasa de "buena idea" a lista concreta**: tiene que cubrir 7 funciones, y
   dos de ellas (`reservar_ids_shadow`, `buscar_similares`) no estaban en ninguna lista previa. Sin
   ellas, el rename tumba la captura de esa noche y el bot.
2. **Los triggers ausentes explican la condición 4** y confirman que no se resuelve sola.
3. **B2 baja de prioridad**: es riesgo dormido, no activo, y muere con el retiro del supervisor.
4. 🔴 **(doble check) El rename toca 53 puntos de código además de las 7 funciones**, y el atajo
   probablemente no salve a los cargadores por el `ON CONFLICT`.
5. **Centralizar el nombre NO se hace antes** (ver el recuadro rojo de §doble check): movería el
   riesgo del día supervisado a una noche sin nadie mirando, y lo que compra es un reemplazo de un
   minuto.

---

# Veredicto de riesgo de los dos arreglos previos (verificado, 17-ago)

El founder preguntó si son de bajo riesgo **antes** de que se hicieran. Se midió en vez de afirmarlo:

## Arreglo 1 — quitarle el fallback a `rpcShadowFirst` · **bajo riesgo, verificado**

- El helper recibe **exactamente 3 bases** en todo el repo: `buscar_unidades_simple` (3 llamadas),
  `buscar_unidades_alquiler` (2), `buscar_extras` (2). No hay una cuarta escondida.
- Las 3 tienen gemela `_shadow` **que funciona** (652 / 288 / 20 filas, ejecutadas).
- Las 3 viejas **fallan** con `42P01` (ejecutadas una por una).
👉 Hoy el fallback no salva nada: cambia *"falla y después falla"* por *"falla"*. Lo que cambia es
**mañana**, y para bien: el error se ve en vez de convertirse en precios inflados.

## Arreglo 2 — borrar las 6 funciones de precio · **bajo riesgo CON UNA CONDICIÓN**

- `pg_depend`: **cero** dependencias reales. Ningún índice, constraint, default ni vista materializada
  las usa (consultado el catálogo, no por texto).
- Las 6 tienen fuente en `sql/` → parece reversible.
- 🔴 **PERO la regla 7 del proyecto dice que los archivos locales no son confiables**: *"pg_get_functiondef()
  SIEMPRE — nunca confiar en archivos de migración locales"*. Que el `.sql` exista **no prueba que sea
  igual a lo que corre**. Varias tienen 3 migraciones encima (`buscar_unidades_simple` → 219 y 227).
- 👉 **Condición de ejecución: el paso 1 del arreglo 2 es exportar `pg_get_functiondef()` de las 6 y
  guardarlo** junto al script de borrado. Sin ese export el borrado NO es reversible, por más que el
  repo tenga un archivo con el mismo nombre.

## 🔑 La lección del método, que es lo que más vale de este documento

El barrido original recorrió el catálogo de Postgres de punta a punta y **se sintió completo**. No lo
era: cubría **un eje de dos**. La pregunta *"¿qué le pasa a cada pieza el día del rename?"* se
respondió solo para las piezas que viven **en la base**, porque la herramienta que se usó —el
catálogo— solo conoce esas.

👉 **Un barrido hereda el punto ciego de su herramienta.** Antes de declarar cerrado el siguiente,
preguntar: *¿qué clase de objeto NO puede ver el instrumento que estoy usando?* Acá la respuesta era
"todo el repositorio", y eran 53 puntos.
Es la tercera vez en el día que el mismo patrón muerde: el grep que no ve llamadores internos, el
patrón que confunde `precio_normalizado` con `precio_normalizado_shadow`, y ahora el catálogo que no
ve el código.
