# El admin contra la data nueva — análisis profundo

> Pedido por el founder el 11-ago-2026 al arrancar el trabajo intermedio del cutover:
> *"antes estaba pensado para corregir cosas raras… vale la pena analizar cómo funciona y qué sirve
> ahora mejor con la data, y qué valdría la pena sacar o reordenar"*.
> Todo está **medido**: 6.516 ediciones reales de `propiedades_v2_historial`, las 21 pantallas, sus
> 16 funciones de BD y la lógica interna de los dos editores. Nada es opinión sobre cómo debería
> usarse: es cómo está hecho y cómo se usó.

## 1. Cómo se usó de verdad

| | |
|---|---|
| Ediciones de admin | **4.981**, sobre **534 propiedades**, en **63 días** con actividad |
| Última edición | **6-jul-2026** — 5 semanas antes de que se rompiera |
| Propagación proyecto→props | murió el **11-mar** |
| Sincronización proyecto→props | murió el **11-may** |

**El admin dejó de usarse solo, un mes antes del cutover.** No porque fallara: porque el trabajo que
hacía dejó de existir.

## 2. Qué se editaba, y qué pasa hoy con eso

| Campo | Veces | Hoy |
|---|---:|---|
| `equipamiento` | 813 | 🔻 lo extrae el lector (spec v4.2) |
| `amenities` | 636 | 🔻 lector + nivel edificio en `proyectos_master` |
| **`solo_tc_paralelo`** | 531 | 💀 **muerto** — el TC se unificó |
| `plan_pagos_desarrollador` | 509 | 🔻 lo lee el lector; el feed casi no lo usa |
| `precio_negociable` · `acepta_permuta` | 1.008 | 🔻 ídem |
| `baulera` | 490 | 🔻 el lector distingue incluida/aparte |
| **`estado_construccion`** | 464 | 🔄 cambió de forma (§4) |
| `zona` | 379 | 🔻 la resuelve `v_zona_efectiva_shadow` (mig 316) |
| **`precio_usd`** | 355 | ✅ vivo — superficie 7 del audit |
| `fecha_entrega` | 312 | 🔻 último uso 7-may |
| **`tipo_precio`** | 215 | 💀 muerto con el TC unificado |
| **`id_proyecto_master`** | 186 | ✅ vivo — pero hoy se resuelve por SQL |

**Más de 3.500 de las ~4.981 ediciones son de campos que el lector ya resuelve o que el TC unificado
volvió irrelevantes.**

### La data mejoró donde dolía
Piso **2% → 46%** · Edificio identificado **65% → 87%** · Baulera **11% → 24%** · Teléfono del
captador **96% → 100%**.
⚠️ El lector deja `null` honesto donde el aviso calla (equipado 23%, amoblado 15%, expensas 4%). Eso
**no es un hueco para llenar a mano**: es la diferencia entre "no sabemos" y "el pipeline viejo lo
inventaba".

## 3. 🔴 La lógica de precio del editor es del régimen VIEJO

Lo más grave del análisis, y no se ve desde afuera: `usePropertyEditor.ts` **convierte antes de
guardar**, con el TC viejo hardcodeado.

```js
// calcularPrecioNormalizado() — esto es lo que se ESCRIBE
case 'bob': return Math.round(precioPublicado / 6.96)   // TC real hoy: 11,64
```

**Tres formas distintas de corromper precio:**
1. **Venta en Bs** → `precio_usd = precio / 6,96` → **67% más caro**. Bs 700.000 se guardan como
   $100.575 en vez de $60.148.
2. **Alquiler** → escribe **las dos columnas** (`precio_mensual_bob` *y* `precio_mensual_usd`), y
   deriva el dólar con 6,96. El verificador nocturno controla justamente que eso **nunca** pase
   ("anti-doble-normalización: DEBE SER 0"). `pages/admin/alquileres/index.tsx` hace lo mismo, aunque
   con el TC correcto de Binance: sigue escribiendo las dos.
3. Sigue escribiendo `solo_tc_paralelo`, el flag del régimen muerto.

🔑 **El arreglo no es cambiar 6,96 por 11,64.** Es que el editor **deje de convertir**: guardar el
crudo con su tag de moneda, como hace el lector nocturno, y dejar que la base normalice al leer.
Es el principio que rige en todo el resto del sistema — *crudo adentro, normalizado afuera*.

⚠️ **Consecuencia operativa:** el admin **no se puede desplegar apuntado a la base viva** hasta
arreglar esto. Mientras escribía en la tabla que nadie leía, el error era inofensivo.

## 4. Estado por pantalla (21 pantallas, ~15.000 líneas)

| Pantalla | Líneas | Estado |
|---|---:|---|
| `market.tsx` | 2.157 | 🔴 lee la serie de prod, **cortada el 27-jul** + tabla vieja |
| `propiedades/index` | 1.579 | 🔴 usa `buscar_unidades_reales` (rota). Y la función nueva **esconde 182 props** sin edificio |
| `proyectos/[id]` | 1.160 | 🟡 anda, pero ver §5 |
| `alquileres/index` | 1.096 | 🟡 TC correcto, pero rompe la doble normalización |
| `proyectos/index` | 1.030 | 🟡 lee la tabla vieja |
| `salud` | 1.002 | 🔴 sus 3 fuentes están mudas desde el 28-jul |
| `propiedades/[id]` | 746 | 🔴 la lógica de precio de §3 |
| `market-alquileres` | 703 | 🔴 tabla vieja |
| **`supervisor/*` (5 pantallas)** | 2.721 | 💀 su cola (`matching_sugerencias`) **no recibe datos desde el 28-jul**, y **10 de sus funciones están rotas** |
| **`contactos`** | 412 | 🟢 **VIVO** — el CRM del bot, su data entra sola |
| `prospection`, `simon-brokers`, `brokers`, `property-reports` | ~2.400 | 🟢 no dependen de propiedades |

**~9.000 de las 15.000 líneas trabajan sobre datos muertos o rotos.**

🔑 **Y el dato que más dice del rediseño: la pantalla más útil del admin hoy es la única que no fue
hecha para editar** — el CRM de contactos, que solo muestra lo que el bot trae solo.

## 5. 🔴 El editor de proyectos edita el campo que el sistema dejó de creer

`proyectos_master` es **el catálogo vivo** (456 edificios, 281 con alias) y donde pasa el trabajo
real de hoy. Pero su editor no permite tocar **ninguno** de los campos que el sistema nuevo usa:

| Campo | Para qué | ¿Editable? |
|---|---|---|
| `entrega_verificada{,_at,_por,_notas}` | Sellar la observación humana del estado de obra (mig 315) | ❌ |
| `alias_conocidos` | Que un edificio no vuelva a la cola cada noche | ❌ |
| `pet_friendly` | Chip del feed (mig 278) | ❌ |
| `gps_verificado_visual` | Marcar el GPS confirmado a mano | ❌ |
| `estado_construccion` | **El campo que la mig 315 declara poco confiable (acierta 78%)** | ✅ |

Por eso los alias y los sellos se aplican **pegando SQL**: no tienen dónde entrar.

## 6. Lo que hace falta hoy — y no tiene pantalla

| Trabajo pendiente | Hoy |
|---|---|
| Props **sin edificio identificado** (no llegan al feed) | **182** (11 con nombre en el aviso) |
| Estado de obra **sin confirmar** | **187** |
| Estado de obra **deducido, no afirmado** (vecinos / hay alquiler) | **234** |
| Edificios sellados por el founder | 10 |
| Props con candado | 140 |

Cada noche el audit produce aprobaciones, confirmaciones, PM_NUEVO bloqueados por GPS, dedup,
dictados de estado y precios incompatibles. **El circuito es: el audit escribe un `.sql` → el founder
lo pega en Supabase.** El admin no participa. Eso significa: sin registro en el historial, sin
validación previa, y hay que leer SQL para entender qué se decide.

## 7. Propuesta

### Antes que nada (bloquea todo lo demás)
1. **Los candados protegen a medias** — y fallan justo donde hacen falta.
   - **Los que valen son los 140 de la base viva.** En el archivo hay 2.678 más, pero esa tabla ya no
     se lee: son historia. Y varias están **corruptas**, con claves numéricas (`0`,`1`,`2`…) en vez de
     nombres de campo — el formato roto que la memoria `feedback_candado_formato_objeto` ya había
     detectado (un string no protege; tiene que ser objeto).
   - **Quién los respeta:** el audit nocturno (`auditar-matching-shadow.mjs`) y el cron de casas. ✅
   - **Quién NO:** los cargadores de deptos. Pero el riesgo es **más específico** de lo que parece: el
     cargador hace `upsert` por `id` y en el ciclo nocturno normal **solo procesa nuevas** → inserta,
     no pisa. **El peligro aparece al RE-PROCESAR una prop existente** (`--ids`, relectura, barrido):
     ahí el upsert sobrescribe todas las columnas, candado incluido.
     🔑 O sea: **el candado falla exactamente en el caso para el que se puso.** En la operación diaria
     no molesta; el día que se relee un edificio entero, la corrección se pierde.
   - **Y el panel miente sin querer:** dice *"protegidos del merge nocturno"*, pero ese merge era del
     pipeline n8n, apagado desde el 28-jul. Quien lo lea confía en una protección que cambió de dueño.
2. **Sacar la conversión de precio del editor** (§3) antes de desplegarlo contra la base viva.

### Sacar
3. Flags de TC del editor (`solo_tc_paralelo`, `tipo_precio`) — 746 ediciones históricas, cero uso hoy.
4. Propagación y sincronización — muertas hace 3 y 5 meses.
5. **Las 5 pantallas del supervisor** (2.721 líneas) — cola sin datos, 10 funciones rotas.
6. `market`, `market-alquileres` y `salud`: repuntar a las fuentes vivas o retirar. Hoy muestran un
   mercado congelado el 27-jul y una salud que nadie reporta.

### Reordenar
7. **El editor de propiedades**: dejar arriba lo que se toca de verdad (precio, edificio, GPS/zona,
   estado, candados) y plegar el resto en "avanzado".
8. **El listado**: ordenar por lo que necesita atención (las 182 sin edificio primero), no por fecha.
   Y que consulte la tabla directo — el admin necesita ver lo que el feed esconde, que es lo contrario
   de lo que hace la función del feed.

### Agregar — lo que cambia el valor del admin
9. **La bandeja del audit**: que las decisiones que hoy viajan en `.sql` se vean como casos con su
   evidencia (la cita del anuncio, los candidatos, la distancia al edificio) y dos botones.
10. **Los campos vivos de `proyectos_master`** (§5): sellar entrega, alias, pet friendly, GPS
    verificado. Es donde está el trabajo real y hoy no tiene interfaz.

## 8. En una frase

El admin fue construido para **corregir a mano lo que el pipeline viejo hacía mal**. El pipeline
nuevo hace bien casi todo eso —y donde no sabe, dice `null` en vez de inventar—. Lo que quedó sin
resolver no son campos sueltos: son **decisiones**, y hoy se toman pegando SQL.

El admin no necesita arreglarse. Necesita **cambiar de trabajo**: de editor de fichas a mesa de
decisiones. Y antes de cualquier pantalla nueva, que el candado proteja también al **re-procesar** —
porque es ahí, y no en la noche normal, donde hoy se pierde una corrección hecha a mano.
