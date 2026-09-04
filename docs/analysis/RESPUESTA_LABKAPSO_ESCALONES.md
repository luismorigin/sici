# Respuesta a lab-kapso — `resumen_mercado` ya devuelve los escalones

**4-sep-2026 · SICI → lab-kapso · mig 350, APLICADA y verificada**

Hecho. Fuimos por la **opción A**, la que preferían, y también por lo que marcaron en rojo.

## Lo primero: les confirmamos el diagnóstico

Reprodujimos el caso antes de tocar nada:

```
resumen_mercado('alquiler','Villa Brigida',1,2500,NULL)
→ { general: {total:0, desde:null, hasta:null, mediana:null}, por_zona: [], por_amoblado: [] }
```

Exactamente lo que reportaron. **Tienen razón en que no era un problema de prompt.** Tres
versiones parchando el mismo cálculo era la señal correcta.

## El contrato nuevo

Dos claves nuevas. **Ninguna existente cambió de forma, ni la firma de la función.**

```jsonc
{
  "moneda": "Bs",

  // lo que entra en el presupuesto del cliente — SIN CAMBIOS
  "general":  { "total": 0, "desde": null, "hasta": null, "mediana": null },

  // 🆕 el segmento completo, IGNORANDO p_precio_max
  "segmento": { "total": 21, "desde": 2800, "hasta": 6061, "mediana": 4500 },

  // 🆕 a qué precio se alcanzan 1, 3, 5 y 10 opciones
  "escalones": [
    { "cant": 1,  "precio": 2800 },
    { "cant": 3,  "precio": 3700 },
    { "cant": 5,  "precio": 3850 },
    { "cant": 10, "precio": 4330 }
  ],

  "por_zona": [], "por_amoblado": []
}
```

Con eso, el caso que falló se responde sin una sola resta:
> *"A 2.800 hay una sola. Estirando a 3.700 son 3, y a 3.850 tenés 5."*

## Tres decisiones que tomamos distinto de lo que pidieron — y por qué

**1 · `segmento` en clave propia, no pisando `general.desde`.**
Pidieron que la respuesta vacía trajera `{total: 0, desde: 2800}`. Lo pusimos aparte a propósito:
`general` sigue diciendo `total: 0, desde: null` porque **esa es la verdad** — en el presupuesto
del cliente no hay nada. Si `desde` valiera 2.800 con `total: 0`, es exactamente el tipo de
ambigüedad que causó este bug. Ahora son dos cosas con dos nombres: *lo que entra* y *el slice*.

**2 · `cant` es el conteo REAL a ese precio, no la posición pedida.**
Villa Brígida tiene **3 avisos a 4.330**. Si devolviéramos la posición, en un segmento con empates
estaríamos subcontando. Medido: hay 10 avisos hasta 4.330 y 9 hasta 4.200. Se deduplica por precio,
así que nunca van a ver dos escalones con el mismo número.

**3 · Los escalones ignoran `p_precio_max`, pero respetan todo lo demás.**
Zona, dormitorios y amoblado sí aplican. Sólo se ignora el techo — porque *"¿cuánto tengo que
estirar?"* únicamente tiene sentido mirando lo que está por encima de él.

## Lo que pueden sacar del prompt

Todo el cálculo del escalón del paso 3. El bot ya no necesita:
- llamar dos veces (una con techo y otra sin),
- restar para saber cuántas gana,
- ni elegir qué corte mencionar.

La regla *"decí cuántas GANA, nunca el total del mercado"* ahora se cumple sola: el total del
segmento está en `segmento.total` y las que gana están en `escalones`. Son campos distintos con
nombres distintos.

## Un detalle que les conviene saber

En alquiler, los avisos publicados en dólares se convierten a Bs con el **paralelo vivo**
(`config_global.tipo_cambio_paralelo`, hoy **12,37**). O sea que **los escalones se mueven con el
TC**, no sólo con el mercado. Es el mismo criterio que ya usaba `general`, así que no cambia nada
para ustedes — pero si comparan capturas de días distintos y ven diferencias chicas, puede ser eso
y no el inventario.

## Verificación

Contra la foto previa que tomamos antes de aplicar:

| chequeo | resultado |
|---|---|
| El caso de Villa Brígida a 2.500 | ✅ `general.total 0` · `segmento.desde 2800` · 4 escalones |
| Sin techo: `segmento` == `general` | ✅ idénticos |
| `general` / `por_zona` / `por_amoblado` / `por_estado` | ✅ **no se movió un número** |
| Venta (2 dorms) | ✅ escalones 78.000 / 79.464 / 87.000 / 97.099 USD |
| Validaciones de las migs 336/337 | ✅ siguen dando `22023` |

## Y sobre lo otro que preguntaron

No pedimos nada a cambio, pero por si sirve: sobre el aviso de 3.500 USD que levantaron el 1-sep,
verificamos contra Remax y **el precio es correcto** — y les avisamos que apareció por un cambio
nuestro del 31-ago. Está en `RESPUESTA_LABKAPSO_8000319.md`.
