# Respuesta — atribución CTWA (SICI → marketing, 24-ago-2026)

**Verificamos el cruce contra nuestra base y da lo mismo que ustedes.** Tomamos los 10 teléfonos de
los cinco creativos minoritarios del CSV y los buscamos uno por uno:

```
los 10 escribieron
 1 sola llegó a shortlist   →  "Todo Equipetrol, de un vistazo"
```

Su tabla se sostiene. Un detalle que agrega color: esa única persona que llegó a shortlist tuvo
**27 mensajes** — la conversación más larga de las diez. Las que se fueron en 2 mensajes no
llegaron a nada. Con este volumen, **la longitud de la conversación separa mejor que el creativo**.

Coincidimos con todo lo demás: la conclusión sobre el diseño del experimento, la reordenación de
prioridades y el ABO por conjunto. Van tres observaciones sobre lo que viene.

---

## 1 · El cálculo de muestra está ~20-25% optimista

Para detectar las diferencias que plantean, con poder 80% y 95% de confianza:

| diferencia a detectar | ustedes calculan | hace falta |
|---|---:|---:|
| 21% → 41% (20 pp) | 70 por brazo | **~85** |
| 21% → 36% (15 pp) | 120 por brazo | **~145** |
| 21% → 31% (10 pp) | 250 por brazo | **~308** |

Están en el orden de magnitud correcto —y lo declaran como tal—, pero si el presupuesto se arma
con esos números los brazos quedan cortos **justo en el margen** donde la diferencia se vuelve
visible. Con **~US$ 110** en tres brazos, en vez de US$ 90, quedan holgados.

## 2 · El brazo del filtro de precio: el número que lo motiva viene de un piso equivocado

Dicen que *«diez pidieron menos de 2.500 Bs cuando el piso real es 2.600»*.

**El piso es 2.600 desde el 23-ago.** Durante toda la campaña de agosto el bot venía anunciando
**«desde 1.800 Bs»**, porque un aviso mal ubicado —un departamento a 13 km de Equipetrol, con el
pin del portal puesto en el barrio— fijaba el mínimo del panorama. Ya está corregido: la propiedad
salió del inventario y el piso quedó en 2.600, que es el real.

Lo traemos porque afecta la lectura de agosto, no porque quede algo por arreglar:

- Esos diez que pidieron menos de 2.500 **pueden haber venido con la expectativa que el propio bot
  les dio**, no con una expectativa de mercado.
- La hipótesis del brazo 2 —*«un creativo que diga el precio de entrada traerá menos leads y
  mejores»*— **ya se cumplió en parte sola**: el bot dejó de prometer un piso que no existía.

La hipótesis sigue valiendo la pena. Lo que conviene es **re-mirar ese número después de unos días
con el piso corregido** antes de diseñar el creativo, para saber cuánto de esos diez era el error
nuestro y cuánto es demanda real por debajo del mercado.

## 3 · Hay una métrica más cerca del dinero, y ya la tienen

Sus «11 contactaron una propiedad» coincide **exactamente** con nuestros 11 clics de WhatsApp
registrados desde el 13-ago. Pero esa tabla (`wa_clicks`) guarda `shortlist_id` y `contacto_id`,
así que **se cruza directo con el referral** sin pasar por el teléfono. Y ese clic es lo que
tenemos definido como la métrica del negocio: es el momento en que alguien contacta a un corredor.

El trade-off es real y conviene elegirlo a propósito:

- **«llegó a shortlist»** — 32 eventos en agosto. Volumen para comparar brazos, pero es un proxy.
- **«hizo clic en WhatsApp»** — 11 eventos. Es el hecho que importa, pero con 11 el poder
  estadístico cae fuerte: detectar diferencias entre brazos exigiría muestras mucho más grandes.

Nuestra sugerencia: **el KPI del experimento sea la shortlist** (es lo que da poder con el
presupuesto disponible) y **el clic se reporte al lado** como el número que importa de verdad. No
mezclarlos en la misma tabla de decisión.

---

## De nuestro lado

**El CSV cierra.** Verificamos fila por fila contra `mkt_piezas`: la base tiene 45, ninguno de los
6 nuevos (67, 68, 69, 73, 74, 75) está cargado, y no hay un solo `num` que colisione con un nombre
distinto. Son seis altas limpias, como dijeron. No hay nada que decidir.

**`simon_eventos_sin_procesar`.** Lo miramos en serio y **lo postergamos a propósito**. Medimos qué
se descarta hoy: son dos números de Brasil, y está bien que se descarten porque WhatsApp tiene
restricciones allá — no son leads que perdamos. Sin ese caso, crear la tabla es prevención sin
evidencia de daño.

Lo que sí hicimos hoy es la parte que responde la pregunta de fondo: **el webhook ahora dice cuántos
eventos descarta y por qué motivo**, en cada lote. Antes no dejaba ningún rastro. El día que Meta
saque el teléfono de más eventos y los descartes salten de 2 a 50, aparece en los logs. La tabla la
haremos cuando toquemos ese archivo para persistir el `referral`, donde el costo es cero.

**Persistir el referral** queda como infraestructura para que septiembre se lea solo, sin bloquear
nada. Como dijeron ustedes: cuando nos quede cómodo.
