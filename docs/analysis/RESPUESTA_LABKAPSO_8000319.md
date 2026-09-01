# Respuesta a lab-kapso — el aviso 8000319 y el tope del rango

**1-sep-2026 · SICI → lab-kapso**

## 1 · Verificado contra la fuente: **el precio es correcto**

Fuimos al aviso de Remax. Lo dice con todas las letras:

> DEPARTAMENTO DE LUJO EN ALQUILER
> Completamente amoblado, ubicado en equipetrol
> 3 dormitorios en suite · cocina americana · balcón · área de servicio y lavandería · parqueo
> **precio 3500$**

Y el campo estructurado de Remax coincide: `precio_fuente_usd: 3500`, `moneda: USD`.
Publicado el **26-jul**, agente Natali Olmedo (RE/MAX Fortaleza), 19 fotos.

**No es confusión de moneda, ni precio de venta, ni un decimal corrido.** El aviso queda como está.

## 2 · Por qué apareció ahora: **fue un cambio nuestro, del 31-ago**

Esto es lo importante, y no lo sabían: el aviso está capturado desde el **29-jul**, pero era
**invisible** hasta ayer.

`8000319` **no tiene área**, y las vistas de mercado filtraban `area_total_m2 >= 20`. En SQL
`NULL >= 20` no es falso, es *desconocido* — así que el aviso se caía sin que nada lo declarara.
Ayer aplicamos las migs **348/349** justamente para dejar de ocultar los avisos sin superficie
(eran 28) y este entró con ellos.

👉 **Ese "saltó de 23.932 a 41.881 en una hora" fue nuestra migración**, no el mercado.
El 23.932 anterior era Green Tower (2.000 USD), que pasó a ser el segundo.

**No lo vamos a revertir**: el aviso es real, su precio es correcto y ocultarlo era el bug.
Pero era nuestro cambio y corresponde que lo sepan.

## 3 · Lo que sí sigue siendo un problema — y es de su lado

Medido sobre los 338 alquileres con precio:

| | Bs/mes |
|---|---:|
| mínimo | 2.100 |
| mediana | 4.000 |
| p90 | 8.500 |
| p95 | 10.500 |
| p99 | 15.393 |
| **máximo** | **41.881** |

**El máximo es 4 veces el p95.** Coincide con su medición.

Están en lo cierto en no pedirnos que filtremos outliers: **el dato es correcto y el bot debe
poder decirlo**. Pero el problema no es el dato, es **usar el máximo como tope del rango**. El
máximo de una distribución con cola larga no describe el mercado — describe el caso más raro.

**Sugerencia (decisión de ustedes, no tocamos la RPC):** que el panorama use el **p95** y, si
corresponde, mencione el extremo aparte. Algo como:
*"de 2.350 a 10.500 Bs, con la mediana en 4.500 — y un caso aislado de lujo a 41.881."*
Dice lo mismo, es igual de honesto, y no le deja a alguien con presupuesto de 4.000 la impresión
de estar mirando el piso de otro mercado.

⚠️ **Y hay una fragilidad de fondo**: este aviso **no tiene área, ni nombre de edificio, ni
proyecto master**. Es de lo menos verificado que tenemos, y hoy fija el techo que el bot le cita a
todos. Cualquier regla que dependa del máximo va a ser frágil por esto, no por este aviso puntual.

## 4 · Sobre las bajas: **sí, las detectamos** — con un límite conocido

Tenemos un verificador que corre cada noche y exige **dos señales** para dar de baja: que el aviso
desaparezca del listado del portal **y** que su ficha responda muerta (C21 404 · Remax 302),
sostenidas más de 2 días de gracia.

🔴 **Su límite, que importa para lo que ustedes vieron:** hay avisos cuya ficha está muerta pero
que **el portal sigue mostrando en su listado**. Nunca cumplen la primera señal, así que el
verificador **no puede verlos nunca** — los llamamos *residuales*. Ayer dimos de baja 9 así, a
mano, tras confirmar el 302 con controles.

Su número de antigüedad lo confirmamos: **29% del inventario de alquiler lleva más de 60 días
publicado** (67 avisos entre 61 y 90 días, 32 con más de 90). Su 28% era correcto.

**Traducción honesta:** parte de lo que el bot muestra probablemente ya no esté disponible, y hoy
no tenemos forma de saber cuál. El comentario del cliente —*"la mayoría ya estaba alquilada"*— es
consistente con eso y es la mejor señal que recibimos en semanas.

## 5 · Lo que hacemos de nuestro lado
- Nada sobre `8000319`: el precio es correcto.
- Queda anotado que **un aviso sin área ni edificio puede fijar el extremo del rango**.
- La detección de bajas residuales pasa a revisarse en cada corrida del audit mensual de drift.
