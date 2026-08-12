# La primera pintura de los feeds llega vacía — línea de base y plan

> 11-ago-2026. Cierra el bug abierto desde el 27-jul (memoria
> `project_bug_ssg_ventas_cae_a_prod`, que decía *"falta un GRANT a anon"*): acá está la causa
> completa, el impacto medido en producción y la solución, que **no necesita tocar permisos**.
> **Nada aplicado.** Este documento se escribe ANTES de la implementación.

## GOAL — una frase

Que el HTML que el servidor entrega en `/ventas`, `/alquileres` y los dos feeds de Zona Norte
**traiga ya las primeras propiedades**, en vez de una página vacía que se llena por JavaScript.

### Qué NO entra
- **No se tocan permisos de la base.** Nada de `GRANT` a `anon` ni de volver atrás la mig 317.
- No se toca el comportamiento del feed una vez cargado (filtros, mapa, orden, tarjetas).
- No se toca `/ventas/casas`: **ya funciona** y por el motivo correcto (lee una vista).
- No se toca el cutover ni las 66 funciones. Este arreglo es independiente y no lo espera.
- No se rediseña `rpcShadowFirst` — su problema de fondo (§4) se declara, no se resuelve acá.

## 📸 Línea de base — MEDIDA en producción el 11-ago, antes de tocar nada

Método: abrir la página en simonbo.com y leer `window.__NEXT_DATA__.props.pageProps`, que es
exactamente lo que el servidor mandó en el HTML.

| Feed | Propiedades en el HTML | Debería traer | Título de la página |
|---|---:|---:|---|
| `/ventas` | **0** | 24 | "383 Departamentos…" ✅ |
| `/alquileres` | **0** | 8 | "174 Alquileres…" ✅ |
| `/zona-norte/ventas` | **0** | hasta 500 | "0 Departamentos…" ❌ |
| `/zona-norte/alquileres` | **0** | 8 | "99 Alquileres…" ⚠️ |
| **`/ventas/casas`** | **100** ✅ | 100 | ✅ |

(Los dos feeds de ZN se arreglan aparte — commit `6977790`. Su título ya pasó a "358". La primera
pintura sigue vacía por lo que describe este documento.)

🔑 **Los títulos vienen bien y el contenido no.** El título sale de los KPIs, que se leen de
**vistas**; las propiedades salen de **RPC**. Esa es toda la diferencia, y es la pista que explica
la causa.

## Por qué pasa

El `getStaticProps` de los feeds usa el cliente de Supabase con la **clave pública** — la misma que
viaja dentro del navegador de cualquier visitante.

1. Esa clave **sí puede ejecutar** las RPC `_shadow` (tiene `EXECUTE`).
2. Pero las RPC son `SECURITY INVOKER`: corren con los permisos de quien llama.
3. Adentro leen `propiedades_v2_shadow`, y **la mig 317 le sacó a `anon` el `SELECT`** sobre esa
   tabla (era el fix del agujero por el que la clave pública podía escribir propiedades).
4. La RPC falla con `42501 permission denied` → `rpcShadowFirst` cae a la RPC vieja → esa apunta a
   `propiedades_v2`, archivada por el TIEMPO 1 → `42P01 relation does not exist`.
5. El código toma `data` e **ignora `error`** → `rows` queda en `null` → la página se arma vacía,
   sin una línea en ningún log.

**Es un efecto secundario de haber cerrado bien un problema de seguridad.** No hay que reabrirlo.

Prueba de que la causa es ésa y no el flag de shadow: **`/alquileres` ya pide la base viva
explícitamente** (`{ shadow: true }`) y aun así trae 0. Y `/ventas/casas`, que lee una **vista** con
la misma clave pública, trae sus 100.

## Qué se pierde mientras tanto

- **Google indexa un feed sin propiedades.** El robot lee sobre todo el HTML servido. Hoy encuentra
  la estructura de la página y ningún departamento.
- **El visitante espera.** El pedido de datos tarda ~1,4 s medidos, más la latencia de red, con la
  pantalla en "Cargando…". En un feed que se explora scrolleando, es la primera impresión.

No es una caída: el sitio funciona. Es SEO y velocidad percibida.

## La solución — cambiar de llave, no abrir permisos

El `getStaticProps` corre **siempre en el servidor**, así que puede usar la clave de servicio sin
exponerla a nadie. **El patrón ya existe en el repo**: `lib/mercado-shadow-data.ts` tiene un
`serverClient()` con `SUPABASE_SERVICE_ROLE_KEY` y la advertencia *"importar SOLO desde
getStaticProps/getServerSideProps, NUNCA desde componentes cliente"*.

✅ **Verificado que esa clave funciona en el build de producción**: `/mercado/equipetrol` sirve su
serie histórica desde `market_price_reexpresado`, una tabla **sin acceso público**, y se ve. Si la
clave no estuviera, esa página no tendría datos.

Alternativas descartadas y por qué:

| Alternativa | Por qué no |
|---|---|
| `GRANT SELECT` a `anon` sobre la tabla | Reabre parte de lo que cerró la mig 317 y expone la tabla entera al browser (incluye contacto del captador y campos internos) |
| RPC a `SECURITY DEFINER` | Funciona, pero cambia el modelo de seguridad de funciones que sirven al público. Más superficie que cambiar una llave del lado servidor |
| Que el SSG lea vistas en vez de RPC | Es lo que hace casas y anda. Pero obliga a reescribir el mapeo de campos en 4 feeds |

## EVALS — definidos antes de implementar

1. 🔴 **Las propiedades aparecen en el HTML.** Medida: en los 4 feeds, `initialProperties.length > 0`
   (24 / 8 / >0 / 8). Hoy los cuatro dan 0.
2. 🔴 **Ningún precio cambia.** Medida: para las primeras 8 propiedades de `/ventas`, el precio del
   HTML servido == el precio que muestra la página ya cargada. *Si difieren, el SSG está leyendo con
   otra fórmula y hay que revertir.*
3. **El conteo del feed no cambia.** Medida: `/ventas` sigue diciendo **354 activos** y
   `/alquileres` **182**, igual que hoy. La primera pintura se llena; el total no se mueve.
4. **La clave de servicio no se filtra al navegador.** Medida: `SUPABASE_SERVICE_ROLE_KEY` no
   aparece en ningún archivo servido al cliente (grep sobre el bundle) y el import del helper server
   solo ocurre dentro de `getStaticProps`.
5. **Degrada bien.** Medida: sin la variable de entorno, el SSG vuelve a quedar vacío — como hoy —
   y la página igual carga por el navegador. Nunca peor que la línea de base.

**Criterio de aborto: sólo el eval 2.** Un precio distinto entre el HTML y la página cargada
significa dos fórmulas conviviendo, que es el error que este sistema paga caro. Los demás son
información: si el 1 no pasa, el cambio no sirvió, pero no rompió nada.

## Riesgo declarado

El cambio toca `/ventas` y `/alquileres`, los dos feeds principales. Lo que lo hace de bajo riesgo:
**hoy esos SSG devuelven cero**, así que el peor resultado posible es seguir devolviendo cero. No
hay un estado bueno que se pueda romper — salvo el eval 2, que es exactamente lo que se vigila.

## Lo que este documento NO resuelve

🔴 **`rpcShadowFirst` sigue siendo una red de seguridad que miente.** Su comentario afirma que al
cutover la RPC vieja "ya es igual a shadow": es falso, usan fórmulas distintas (ver
`scripts/deptos-equipetrol/INVENTARIO_66_FUNCIONES_2026-08-11.md`). Este arreglo hace que el camino
bueno funcione, pero **el fallback sigue ahí**, esperando el día del rename. Va con el cutover.

Y el patrón que lo escondió —tomar `data` sin mirar `error`— tiene **24 usos** en el sitio, 9 en
archivos que tocan propiedades. Ninguno revisado.
