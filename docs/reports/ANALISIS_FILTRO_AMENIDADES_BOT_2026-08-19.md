# Filtrar por amenidades en el bot — lectura desde SICI (19-ago-2026)

Sobre el análisis de lab-kapso: *"11 de 143 conversaciones (8%) piden amenidades y el bot responde
que no puede filtrar"*. La medición de la demanda es de ellos y no la puedo verificar desde acá —
los mensajes viven en su base. **La tomo como buena.** Lo que sí puedo aportar es el lado del dato, y
ahí hay **dos conclusiones que se dan vuelta**.

---

## 1. La cobertura no es 59% — es 90,8%

El informe midió `proyectos_master.amenidades_edificio`, que es el dato del **edificio**. Pero el
reader del híbrido extrae amenidades **por propiedad**, y ese campo cubre más:

| fuente | propiedades de Equipetrol con dato |
|---|---|
| `proyectos_master.amenidades_edificio` (lo que midió el informe) | 240 / 391 — **61%** |
| `datos_json->'amenities'->'lista'` (por propiedad) | 308 / 391 — **79%** |
| **las dos combinadas** | **355 / 391 — 90,8%** |

Por amenidad concreta, combinando ambas:

| | con dato |
|---|---|
| piscina | **346** (88%) |
| churrasquera | 327 |
| gimnasio | 248 |
| sauna/jacuzzi | 181 |
| balcón o terraza | 148 |

El argumento del informe —*"al filtrar por piscina dejás fuera al 41% que quizá también la tiene"*—
se cae: **la omisión real es del 9%**, no del 41%.

## 2. 🔴 El parqueo es el PEOR candidato, no el mejor

El informe lo propone como el arreglo obvio: *"lo más pedido, el dato ya está en la vista, agregar
`p_parqueo` es simple"*. La primera y la tercera son ciertas. **La segunda no.**

| | Equipetrol |
|---|---|
| tienen dato en `estacionamientos` | **135 / 391 — 34,5%** |
| declaran que **sí** tienen | **99** |
| no dicen nada | **256** |

Un filtro duro por parqueo devolvería **99 de 391** y escondería 256 — y en Equipetrol un
departamento sin parqueo es la excepción, no la regla. **Sería el filtro que más miente por
omisión de todos**, justo el defecto que el informe quería evitar en las amenidades.

Es contraintuitivo porque el bot ya muestra el parqueo en cada propiedad. Pero mostrar *"parqueo no
especifica"* es honesto; **filtrar** con ese mismo dato esconde dos de cada tres.

## 3. El sitio ya resolvió este problema entero

No hay que diseñar nada: el feed público filtra por comodidades desde hace meses, y las decisiones
finas ya están tomadas en `simon-mvp/src/config/amenidades-mercado.ts`, que es **fuente de verdad
única** (los feeds tienen prohibido hardcodear).

**a) Sólo se filtra por lo que se lista bien.** Un flag `filtrable` separa tres clases:

| filtrables (diferenciadores bien listados) | % que confirma |
|---|---|
| Piscina | 63% |
| Churrasquera | 48% |
| Sauna/Jacuzzi | 35% |
| Gimnasio | 29% |
| Salón de Eventos | 17% |
| Co-working | 11% |

**No filtrables por estándar** (filtrar por algo que tiene todo el mundo no discrimina):
Seguridad 24/7 · **Terraza/Balcón (43%)** · Área Social · Ascensor · Recepción.
**No filtrables por dato pobre**: Pet Friendly (19%, subreportado) · Parque Infantil (4%) · Jardín (1%).

⚠️ **"Balcón" —que el informe cuenta como pedido 2 veces— está deliberadamente fuera**: es estándar,
no diferencia nada. Y **mascotas ya estaba descartado** por la misma razón que dice el informe.

**b) El filtro no oculta a los que no la listan.** Ésta es la decisión importante y está textual en
el código del feed:

> *"El filtro no oculta a los que no la listan: parte los resultados en **confirmados** y **no
> listados** (podrían tenerla sin mencionarla)."*

O sea: el problema de "mentir por omisión" **ya tiene solución probada en producción**, y no es
poner una aclaración: es **partir el resultado en dos grupos**.

## 4. Qué costaría llevarlo al bot

`v_mercado_venta_shadow` **no expone amenidades** (sólo `estacionamientos`), así que `buscar_propiedades`
necesita un JOIN a `propiedades_v2` y `proyectos_master`. Es el mismo patrón que la mig 329:
un CTE con un LEFT JOIN más un parámetro nuevo.

- **Parámetro**: `p_amenidades text[]`, validado contra la lista de filtrables (6 valores).
- **Respuesta**: devolver los confirmados y, aparte, cuántos "no lo mencionan" — para que el bot
  pueda decir *"5 confirman piscina; hay otras 12 que no lo mencionan y podrían tenerla"*.
- **Del lado de lab-kapso**: un parámetro más en la tool.

No es un proyecto grande. Es una migración comparable a la 329.

## 5. Recomendación

**Coincido en que no es urgente** (8% de las conversaciones, y el bot hoy responde sin mentir ni
perder al cliente). Pero si se hace, **al revés de lo que propone el informe**:

1. **Piscina y churrasquera primero** — 88% y 84% de cobertura, son las que mejor se listan.
   Gimnasio y sauna después.
2. **Parqueo NO** — 34,5% de cobertura. Sería el peor filtro del conjunto.
3. **Balcón NO** — es estándar, no discrimina; el feed ya lo descartó.
4. **Mascotas NO** — coincido con el informe.
5. **Copiar la partición confirmados / no listados** del feed, no inventar una aclaración nueva.

🔑 **Y lo más barato de todo**: hoy el bot dice *"no puedo filtrar por piscina"*. Con el dato que ya
existe podría decir **"de estas 6, cuatro confirman piscina"** sin ningún filtro nuevo — sólo
mostrando las amenidades que ya tenemos en las propiedades que devuelve. Eso resuelve buena parte
del 8% sin tocar la firma de ninguna RPC.

---

Referencias: `simon-mvp/src/config/amenidades-mercado.ts` (fuente de verdad) ·
`components/feed/FeedVentas.tsx` §filtro de amenidades · mig 329 (patrón del JOIN)
