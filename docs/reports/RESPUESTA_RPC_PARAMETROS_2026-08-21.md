# Respuesta — validación de parámetros en las RPC del bot (SICI → lab-kapso, 21-ago-2026)

**Respuesta corta: aceptado y escrito.** La migración `336_rpc_bot_validan_parametros.sql` está
lista, con rollback y verificación. **Con su fix del manejo de errores el bloqueo se levantó** —
queda una sola cosa antes de aplicar, y es del lado de ustedes: el enum de `p_amoblado` (§5).

Las dos preguntas que dejaron abiertas ya están decididas: **`amoblado` se declara, no se
completa** (§2) y **el bot no cubre Zona Norte** (§3).

Dos cosas cambian respecto de lo acordado, ambas por medición:

1. **Uno de los dos filtros que pidieron NO se implementa: `p_estado` en alquiler.** Se rechaza.
2. **`amoblado` se declara, no se infiere.** Backtesteamos la inferencia y no da.

Y aceptamos su corrección sobre el punto 1: leímos `bot-core.js` cuando el archivo que corre es
`workflows/simon/workflow.js`. Verificado de este lado: una sola tool `buscar` con `p_operacion`
escrito por el modelo, y los cuatro `body_schema` vacíos. Nuestro propio CLAUDE.md advierte
*"verificado en el código real del workflow, no en la documentación"* — y miramos el prototipo
igual. Va a nuestras notas.

---

## 1. 🔴 `p_estado` en alquiler no se implementa: se rechaza

Medimos la cobertura antes de escribir el filtro:

```
p_estado   en ALQUILER  →    0 de 196 tienen el dato (ni declarado ni inferido)
p_amoblado en VENTA     →   75 'si' · 5 'no' · 305 SIN DATO (de 385)
```

**Implementarlo devolvería cero, siempre.** Hoy el filtro se ignora y la RPC contesta 196:
molesto, pero inofensivo. Implementarlo lo convierte en el bug que ustedes mismos denuncian
—un `[]` que el bot lee como *"no hay preventa en alquiler"*—. Sería cambiar un filtro mudo por
uno que miente.

Los dos casos se rechazan con mensaje:

```
p_estado no aplica a alquiler: ningun aviso de alquiler tiene estado de obra. Omitilo.
p_amoblado no aplica a venta: el dato falta en 305 de 385 avisos. Omitilo.
```

El principio del mensaje-que-enseña se aplica también a la **combinación**, no solo al valor
suelto. (`p_amoblado` en venta además nunca lo ofrece el bot: su propia tool lo declara "en
alquiler", así que ahí siempre es un error del modelo.)

## 2. `amoblado`: descartamos inferir, y con evidencia

Fuimos a buscar si servía la solución del estado de obra. Backtest de la descripción del aviso
contra los 107 casos con dato conocido:

| grupo | total | dice "amoblado" | solo dice "equipado" | no menciona |
|---|---|---|---|---|
| si | 99 | 90 | 4 | 3 |
| **no** | 4 | **3** ← | 0 | 1 |
| semi | 4 | 2 | 1 | 0 |
| (sin dato) | 89 | **9** | 43 | 31 |

Dos cosas la matan:

- **"equipado" es un falso amigo masivo.** La primera medición decía que 51 de los 89 sin dato
  eran recuperables. Separando los términos son **9**: los otros 43 dicen *cocina equipada*, que
  no es amoblado. Sin separar, el número era creíble y falso.
- **La mención no da la dirección.** En el grupo `no`, 3 de 4 dicen "amoblado" — porque dicen
  *"no amoblado"*, *"sin amoblar"*.

No hay nada parecido al 96,7% de los vecinos del edificio que sostiene el estado de obra.
Inferir acá sería inventar. **Se declara**, como con `estado_origen` y como con `[]` en
amenidades.

Cómo queda:

- **`resumen_mercado` ya lo declara** y no hay que cambiar nada: `por_amoblado` agrupa los NULL
  como `'no especifica'`. Ahí el bot ya puede ver los 89. Si hoy no los cuenta, es del lado del
  prompt.
- **`buscar_propiedades` gana el valor `no_declarado`** — aditivo, ningún comportamiento previo
  cambia — para pedir ese grupo explícitamente y aclarar que el aviso no lo dice.

**Corrección a su número:** los candidatos reales no son 93. De los 89 sin dato, ~9 sí mencionan
estar amoblados. El piso honesto es **~84**.

Dos tareas de datos que salen de esto y **no son de ustedes**: esos 9 con mención explícita que
quedaron en NULL son un **bug del lector** (el spec v4.2 dice que lo lee), y el campo `equipado`
ya se captura por separado en 282 avisos — dato vivo que el bot hoy no ve.

## 3. Zona Norte: cerrada, y es una decisión tomada

Tenían razón en sacarlo del pedido y en que no era suyo. **Decidido: el bot cubre solo
Equipetrol.** Hoy `zona = p_zona` no restringía `zona_general`, así que servía las 13 zonas de ZN
—305 ventas + 118 alquileres— que están en dark launch en todo el resto del sitio. Nadie lo usó
porque el bot no conoce esos nombres, pero servía sin que se hubiera decidido.

La lista blanca se **deriva de `zonas_geograficas`**, no se hardcodea: abrir ZN el día que se
decida es cambiar una condición, no mantener una lista.

⚠️ **Son seis zonas, no cinco.** Incluye `Eq. 3er Anillo` (1 venta, 2 alquileres), que su `ZONAS`
excluye a propósito. La lista de 5 es una decisión de presentación del bot; la RPC valida contra
su propio dominio, que es el de los datos. Si le mandan una zona que ustedes no ofrecen, no va a
fallar — simplemente el bot nunca la va a pedir.

Bonus: valida **case-insensitive** resolviendo al nombre canónico, así `'sirari'` entra como
`'Sirari'` en vez de devolver 0.

## 4. Lo demás, como lo acordamos

- `p_operacion`: `lower(trim(coalesce(...)))` — `'VENTA'` y `'venta '` entran; `'rent'`, `''` y
  `null` fallan. El `coalesce` es imprescindible: sin él NULL sigue cayendo a alquiler.
- `p_orden`: estricto a `precio` / `area`. `'area_desc'`, `'m2'`, `'superficie'` y
  `'precio_asc'` fallan en vez de ordenar por precio en silencio.
- `p_amoblado`: `si | semi | no | no_declarado`. `'sí'` con acento se normaliza; `true` falla.
- **Agregamos tres que quedaron fuera de su lista final** porque son la misma clase: `p_dorms`
  (0–10), `p_precio_max` (>0) y `p_limit` (1–50). Hoy `p_dorms: -1` devuelve 0, y "0" se lee
  como *"no hay monoambientes"*.
- **Todos los mensajes nombran el valor recibido y la lista completa de válidos**, con `ERRCODE
  22023` → HTTP 400. Su pedido explícito, y coincidimos en que es lo que decide si el arreglo
  ayuda o estorba.

**Nada de lo que funciona hoy cambia.** Sin cambio de firma, sin cambio en la forma del retorno,
sin tocar filtros. La verificación al pie de la migración chequea que los 4 casos correctos den
lo mismo antes y después de aplicar — comparando contra sí misma, no contra un número escrito
(ver §7).

Sus rangos de `p_dorms` (0–10) y `p_limit` (1–50) coinciden exactamente con los nuestros. No hay
nada que ajustar ahí.

**Cambio observable declarado:** `resumen_mercado(null)` pasa a fallar. Ustedes ya se hicieron
cargo del reintento.

## 5. 🔴 Su enum de `p_amoblado` deja inerte el arreglo que más les importa

Leímos los `body_schema` que declararon el 20-ago. Están bien y el efecto que miden es real. Pero
uno choca de frente con esto:

```json
"p_amoblado": { "enum": ["si", "semi", "no"] }
```

**No incluye `no_declarado`.** Con ese enum, el valor nuevo existe en la RPC y el modelo no puede
emitirlo nunca: la solución al problema (b) —el que ustedes mismos priorizaron como el más
caro— queda inerte del lado del bot.

⚠️ **Y no lo agreguen antes de que apliquemos.** Hoy `p_amoblado='no_declarado'` entra al
`amoblado = p_amoblado` y devuelve **0 en silencio**, que es peor que no tenerlo. El orden
importa: primero aplicamos, después lo agregan.

### Cuatro `description` que quedan falsas al aplicar

Son correctas **hoy** y describen el comportamiento que estamos por sacar:

| parámetro | lo que dice hoy | qué pasa al aplicar |
|---|---|---|
| `p_operacion` | *"Cualquier otro valor la RPC lo trata como alquiler sin avisar"* | falla |
| `p_estado` | *"En alquiler la RPC lo ignora entero"* | **falla** |
| `p_amoblado` | *"en venta la RPC lo ignora entero"* | **falla** |
| `p_orden` | *"'area_desc', 'm2' o 'precio_asc' caen a precio sin avisar"* | falla |

Las dos del medio son las que más importan: hoy le dicen al modelo que mandar ese parámetro es
inofensivo, y va a pasar a cortarle la llamada.

**Menor:** `p_precio_max` declara `minimum: 0` inclusive y la RPC exige `> 0`. Un
`p_precio_max: 0` pasa el schema y falla acá. Conviene hacerlo exclusivo.

**Su enum de `p_zona` (5 zonas) no hay que tocarlo.** La RPC valida contra 6 —incluye `Eq. 3er
Anillo`— así que el suyo es más estrecho y eso es compatible: nunca van a mandar algo que la RPC
rechace.

## 6. El orden, y por qué es seguro

1. **Nosotros**: aplicar la 336.
2. **Ustedes**: agregar `no_declarado` al enum y actualizar las cuatro `description`.

Hay una ventana entre 1 y 2 en la que sus descripciones mienten. **Es inevitable** —hasta que
apliquemos, esas frases son la verdad— y es segura **por el fix que hicieron**: el costo de la
ventana es un reintento, no un handoff. Antes del 20-ago este mismo orden habría derivado
conversaciones a un humano.

**Riesgo residual que declaramos:** con el prompt nuevo, un error que el bot no logra corregir en
un reintento se vuelve **invisible** — sigue la charla sin ese dato y sin mencionarlo. Eso sube
la vara sobre no rechazar de más, así que la validación toca solo dominios cerrados y no inventa
reglas de negocio. Si ven llamadas fallando dos veces seguidas, avisen: es nuestro.

Si algo sale mal, el rollback está escrito y revierte las dos funciones a su definición de hoy,
exportada con `pg_get_functiondef()`.

`buscar_similares` no se toca: quedó fuera del pedido.

## 7. Un número suyo que conviene no clavar

Miden `buscar venta sin filtro → 385`. Nosotros habíamos medido **383** el día anterior. Ninguno
de los dos está mal: **el inventario se mueve todas las noches** y esa noche entraron dos.

Lo decimos porque nuestra verificación original comparaba contra 383 clavado y habría "fallado"
por la captura, no por la migración — ya la cambiamos a comparar contra sí misma (antes/después,
misma sesión). Si tienen asserts con números fijos en la suite, les va a pasar lo mismo.

Por eso también sacamos las cifras de los mensajes de error: un error que dice *"falta en 305 de
385 avisos"* envejece solo. Las cifras quedan en la cabecera de la migración, fechadas.

---

**Archivos:** `sql/migrations/336_rpc_bot_validan_parametros.sql` ·
`sql/migrations/336_ROLLBACK_rpc_bot_validan_parametros.sql`
