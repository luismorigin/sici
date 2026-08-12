# La captura del TC paralelo — diagnóstico, reescritura y auditoría de impacto

> 11-ago-2026 · rama `worktree-fix+tc-binance-captura`
> Complementa `TIPO_CAMBIO_SICI.md`, que describe el sistema; esto describe **por qué dejó de latir**.
> **Nada se aplicó a producción.** Todo lo medido es lectura; los dos cambios propuestos
> (migración 322 y puesta en marcha del capturador) esperan decisión.

---

## 1. Qué pasó: no fue el scheduler, fue n8n

La hipótesis de entrada era que la tarea del TC no había sobrevivido a la reconfiguración de
scheduled-tasks del 29-jul (la carpeta `RESPALDO-ZN-2026-07-29`). **Es descartable.** El escritor
nunca fue una scheduled-task: era el workflow n8n **`SICI - TC Dinamico Binance v1.1`**
(`n8n/workflows/modulo_2/tc_dinamico_binance.json`), con Schedule Trigger `0 0 * * *` en horario de
Bolivia. Murió con el servidor n8n a fines de julio, junto con `propiedades_v2` (congelada el 28-jul),
`market_absorption_snapshots` (cortada el 27-jul) y `workflow_executions` (mudo).

La última corrida del TC es del **27-jul**, el mismo día que el último snapshot de absorción. Es un
solo apagón, no dos fallas.

### Corrección a la premisa de los "dos escritores"

El síntoma decía: historial a las 04:00 UTC, `config_global` a las 08:00 UTC — dos procesos
distintos. **No lo son.** Medido:

| | |
|---|---:|
| Filas en `tc_binance_historial` | 67 |
| Filas en `auditoria_tipo_cambio` (`metodo='manual'`, `ejecutado_por='binance_p2p'`) | 67 |
| Pares con `tc_sell` = `valor_nuevo` exacto | **67 / 67** |
| Desfase máximo entre ambas escrituras | **0,58 segundos** |

Las cuatro horas son un artefacto de tipos: `tc_binance_historial.timestamp` es
`timestamp WITH time zone`, mientras que `auditoria_tipo_cambio.fecha_cambio` y
`config_global.fecha_actualizacion` son **`timestamp WITHOUT time zone`**. Al leerlas, el cliente le
pega una `Z` a un valor que nunca tuvo zona. Comparadas dentro de Postgres, las dos escrituras están
a medio segundo: son los nodos `PG: Actualizar TC` y `PG: Registrar Consulta Binance`, consecutivos
en la misma ejecución.

🔑 Un `timestamp` sin zona no se compara con uno con zona sin decir en qué zona se lo lee.

---

## 2. Por qué la serie tiene 32% de cobertura

No es que fallara: es que **estaba diseñada para no escribir**.

```
IF: TC Valido?  ──TRUE──►  Guardar Snapshot ─► Actualizar TC ─► REGISTRAR HISTORIAL ─► Slack
                └─FALSE─►  Code: "Log Sin Cambio"   ← no toca la base. Nada. Ni una fila.
```

El INSERT al historial colgaba de la rama TRUE. Y quien decide es `validar_tc_binance()`, que
rechaza tres casos: TC fuera de 8–15, salto mayor al 10%, y **cambio menor al 0,5%
("Cambio insignificante")**.

Ese tercer caso es el que se comió los ~139 días. La huella quedó en los datos:

| Días salteados | Casos | Cambio % mínimo observado |
|---:|---:|---:|
| 1 (día consecutivo) | 23 | **0,50** |
| 2 | 18 | 0,52 |
| 3 | 6 | 0,57 |
| 5 | 4 | 0,58 |
| 22 | 1 | 0,62 |

Ni un solo salto de la serie tiene un cambio por debajo de 0,50%. El umbral no explica *parte* de los
huecos: los explica todos.

### 🔴 Consecuencia para cualquier análisis financiero que use esta serie

**`tc_binance_historial` hasta el 27-jul-2026 no es la serie del tipo de cambio. Es la lista de días
en que el paralelo se movió al menos 0,5%.** Está sesgada por construcción hacia los saltos:

- La **volatilidad promedio calculada sobre estas filas está inflada** — los días quietos, que son
  la mayoría, no están.
- **Interpolar un día faltante es circular**: falta justamente porque no se movió, así que el valor
  correcto es "el mismo del día anterior", no un punto intermedio.
- La **forma de la curva sí sirve** (niveles y tendencia son reales y verificados contra
  `config_global`), y los conteos de "días con movimiento" son un dato legítimo por sí mismos.

Julio se ve como "el mejor mes" (16 filas) no porque el registro mejorara, sino porque el mercado se
movió más: es el mes del nuevo esquema cambiario.

---

## 3. El flag `aplicado_a_config`: está invertido, no incompleto

Las dos preguntas eran "¿es cosmético o hay dos caminos de escritura?". La respuesta es **las dos
cosas, y una tercera peor**:

- **Sí hay dos caminos**, pero en la misma ejecución: `actualizar_tipo_cambio()` escribe
  `config_global`; `registrar_consulta_binance()` escribe el historial. Son dos funciones distintas
  llamadas por dos nodos consecutivos.
- **Ninguna de las dos toca el flag.** `registrar_consulta_binance()` ni siquiera lo recibe como
  parámetro (mig 014). El silencio era estructural, no un olvido del operador.
- **Y el valor que quedó es el contrario del verdadero.** Como el INSERT vivía en la rama TRUE, una
  fila en esta tabla *sólo podía existir si el TC ya se había aplicado*. Las 67 filas se aplicaron;
  las 67 dicen `FALSE`. Quien lea la tabla concluye exactamente lo opuesto a lo que pasó.

Lo mismo con `razon_no_aplicado`: no está vacío por descuido, es **inalcanzable** — los días
rechazados nunca llegaban al INSERT. Y `promedio_volumen` está en NULL en las 67 filas porque la
función tampoco lo recibía.

**Propuesta:** migración `322_tc_binance_historial_registro_honesto.sql` — backfill del flag a TRUE
para las filas ≤27-jul (evidencia: 67/67 apareadas, valor exacto, <0,6 s), y `registrar_consulta_binance()`
ampliada con los tres parámetros faltantes, rechazando el par `(aplicado=FALSE, razon=NULL)`.
No inventa las filas perdidas: son irrecuperables, y el `COMMENT` de la tabla lo deja declarado.

---

## 4. Auditoría de impacto de los TC congelados

### 4.1 `tipo_cambio_paralelo = 11.638`, congelado hace 15 días

Binance hoy (medido en la corrida de prueba): **11,542** promedio de los 5 primeros SELL. La base
está **0,82% arriba** del mercado.

**Dónde se consume — y el punto que no estaba en el radar:**

| Consumidor | Qué hace con el número | Estado |
|---|---|---|
| **`/api/tc-actual` → `/ventas` y `/zona-norte/ventas`** | Imprime *"Precios en USD · TC Bs 11,64"* en el filtro de presupuesto | 🔴 **visible al público, 15 días viejo** |
| **`lib/superficies-data.ts` → home `/`** | La banda de mercado viva, "TC del día" | 🔴 **visible al público** |
| **`lib/tc.mjs` → `cargarTC()`** | **Clasifica el TC de cada aviso capturado cada noche** | 🔴 **riesgo operativo** |
| `precio_normalizado_shadow_v2()` | Feed Equipetrol: `precio × 6,96 / paralelo` para los `oficial_viejo` | 106 de 749 avisos activos |
| `precio_normalizado()` | Régimen viejo (ZN/casas): `precio × paralelo / 6,96` | 323 de 800 filas |
| `obtener_tc_actuales()` | Sirve a `/api/tc-actual` | funciona (sólo lee `config_global`) |
| `fn_trigger_tc_actualizado()` | Marcaba propiedades para recalcular | **DESACTIVADO** (ver 4.3) |

**Lo más caro no es el precio, es el clasificador.** `clasificarTCporRatio()` decide si un aviso nuevo
se etiqueta `paralelo` comparando el ratio BOB/USD del anuncio contra el paralelo vivo, con 6% de
tolerancia. Un falso positivo de `paralelo` es —según el comentario del propio módulo— *"el bug
histórico que infló 368 deptos"*. Hoy 11,638 vs 11,542 entra holgado en la tolerancia y no hace daño.
Pero el número está congelado y el mercado no: cuanto más se separe, más cerca del borde queda el
clasificador, **y va a fallar sin avisar**. Las cuatro capturas nocturnas leen ese valor todas las
noches y ninguna lo refresca.

En precios el efecto hoy es chico y de signo opuesto según el régimen: los 106 `oficial_viejo` del
feed de Equipetrol se muestran **~0,8% por debajo** de lo que darían con el TC real (USD 6,39 M vs
6,44 M agregados), y los 323 `paralelo` del régimen viejo, ~0,8% por encima. Es ruido comparado con
el margen del sistema — hoy.

### 4.2 `tipo_cambio_oficial = 6.96`: 🔴 esto NO hay que actualizar

La preocupación era que estuviera "a la mitad del real" frente al BCB de ~11,77. **Es una lectura
equivocada del rol de ese número, y actualizarlo sería el cambio más dañino de toda esta lista.**

6,96 no es "el tipo de cambio oficial de hoy". Es una **constante ancla muerta**: la tasa a la que
cotizaban los avisos viejos. Las fórmulas la usan como referencia histórica fija, y por eso está
escrita como literal en el código, no leída de la base:

```sql
-- precio_normalizado_shadow_v2: "6.96 = constante fija (rate muerto)"
WHEN p_tipo_cambio_detectado = 'oficial_viejo' THEN
  ROUND(p_precio_usd * 6.96 / (SELECT valor FROM config_global WHERE clave='tipo_cambio_paralelo'), 2)
```

Poner 11,77 ahí no corregiría nada: reescribiría el significado de la etiqueta `oficial_viejo`, que
justamente designa avisos anclados a 6,96. Y en `clasificarTCporRatio()` movería el punto medio
`(oficial + paralelo)/2` de 9,25 a 11,66, endureciendo la clasificación de cada aviso nuevo.

Lo que **sí** conviene es que deje de llamarse como se llama. Hoy `/admin/salud` y `/admin/market`
leen esa clave y la muestran como "TC oficial", con fecha `seed_data` de diciembre. Es engañoso para
quien mire el panel. Propuesta: **no tocar el valor**, y renombrar/comentar la clave como
`ancla_tc_oficial_viejo`, o dejar el `COMMENT` explicando que es una constante histórica.

### 4.3 ¿Se rompe algo si se toca el TC? — hoy no, y hay un doc desactualizado

`INVENTARIO_66_FUNCIONES_2026-08-11.md` (líneas 104-110) advierte que `fn_trigger_tc_actualizado`
está **activo** y que por eso *"actualizar el tipo de cambio hace fallar el trigger (la tabla no
existe) → el UPDATE de config_global falla entero"*.

**Ese doc quedó viejo el mismo día que se escribió.** El catálogo dice:

```
trigger_tc_actualizado   → config_global  → tgenabled = 'D'   (DESACTIVADO)
```

El TIEMPO 1 lo desactivó, tal como lo había planificado `INVENTARIO_CUTOVER_2026-08-10.md:272`. Vale
la pena corregir el inventario de las 66 funciones para que no bloquee una decisión por un peligro
que ya se neutralizó.

El otro trigger sobre `config_global` **sí está activo**: `trigger_actualizar_precios_cuando_cambia_tc`
→ `marcar_propiedades_para_actualizacion()`. Es inofensivo por dos motivos independientes: sólo
dispara con las claves en MAYÚSCULAS (`TIPO_CAMBIO_PARALELO`), que fueron borradas de `config_global`
el 19-jun-2026, y escribe sobre la tabla legacy `propiedades`, no sobre `propiedades_v2`.

**Conclusión: `UPDATE config_global SET valor=... WHERE clave='tipo_cambio_paralelo'` es seguro hoy.**
El capturador nuevo igual envuelve el UPDATE y, si un trigger llegara a abortarlo, deja el error
escrito en `razon_no_aplicado` en vez de perderlo.

### 4.4 Sobre `public.propiedades` — no hay nada que recalcular ahí

La pregunta apuntaba a `precio_fue_normalizado` / `tipo_cambio_usado` en `public.propiedades`. Medido:

| | |
|---|---:|
| Filas | 398 |
| `precio_fue_normalizado = TRUE` | 141 |
| `tipo_cambio_usado = 6.96` | 309 |
| `requiere_actualizacion_precio = TRUE` | **0** |
| Última fila creada | **9-dic-2025** |

Es la tabla **LEGACY**, congelada hace ocho meses y sin ningún consumidor (la activa es
`propiedades_v2`, hoy renombrada). Los 309 registros con 6,96 son historia, no deuda. **No hay que
recalcular nada.**

Y el módulo que recalculaba —`recalcular_precio_propiedad`, `recalcular_precios_batch_nocturno`,
`precio_usd_actualizado`— está **deprecado desde el 19-jun-2026**, reemplazado por normalización en
vivo (`precio_normalizado*()`). Su cron está desagendado y ningún query del feed lo consume. Aunque
el TC se actualizara todos los días, ese camino no se despierta.

---

## 5. La reescritura

`scripts/deptos-equipetrol/capturar-tc-binance.mjs` — validado en dry-run contra Binance hoy
(11,542; coincide con el mercado 11,52–11,55). Tres diferencias con el n8n muerto:

1. **El historial se escribe SIEMPRE**, aplique o no, y también cuando Binance falla (fila con
   `razon_no_aplicado`). Es el pedido de "registro de fallos, no en silencio".
2. **Se va el piso de 0,5%.** Existía para no disparar el recálculo en masa del trigger que marcaba
   ~800 propiedades. Ese trigger está desactivado y su módulo deprecado: el piso ya sólo sirve para
   dejar el TC viejo en la base. Se conservan los guardarraíles que sí protegen —rango 8–15 y salto
   máximo de 10%—, y cuando bloquean, la razón queda escrita.
3. **No pasa por `actualizar_tipo_cambio()`**, que nombra `propiedades_v2` y hoy aborta.

**Continuidad de la serie:** `tc_sell` sigue siendo el **promedio de los 5 primeros SELL**, igual que
n8n (en las 67 filas viejas `tc_sell` es idéntico al valor de `config_global`, y esa relación se
mantiene). La mediana —que usa el viejo `actualizar-tc-binance.mjs`— se guarda en `raw_response` para
poder comparar métodos, pero no manda. Se completa además `promedio_volumen`, nunca poblado.

Protección contra doble corrida: si ya hay una captura **aplicada** hoy, no vuelve a escribir salvo
`--force`; un reintento después de un fallo sí se permite.

### Dónde correrlo — pendiente de decidir

n8n no vuelve, así que hay tres opciones. **Recomiendo la primera:**

| Opción | A favor | En contra |
|---|---|---|
| **Un paso más en `cron-deptos-ventas` (01:17)** | Cero infraestructura nueva; corre antes que todo lo que consume el TC, así la captura de la noche clasifica con el valor fresco | Si esa routine falla, el TC no se refresca |
| Scheduled-task propia | Aislada de las demás | Una sesión Claude entera para un fetch de 3 segundos |
| Cron de Vercel → API route | Independiente de la máquina del founder | Expone una ruta que escribe; hay que protegerla |

La primera además resuelve un orden que hoy está mal: las cuatro capturas nocturnas **leen** el TC y
ninguna lo **refresca**.

---

## 6. Lo que este documento no responde

- **Si algún disparador fuera del repo escribe el TC** (Edge Functions de Supabase, webhooks
  externos). Se verificaron `pg_cron`, `pg_trigger`, scheduled-tasks, el repo y los workflows n8n;
  fuera de eso, no.
- **Cuánto tiempo el clasificador tolera el desvío** antes de empezar a etiquetar mal. Es medible
  —reprocesar avisos conocidos con distintos valores de paralelo— y no se hizo.
- 🔎 **Fuera del alcance del TC, pero visto de paso:** el rename del TIEMPO 1 arrastró a las vistas.
  `v_mercado_venta`, `v_mercado_alquiler` y `v_mercado_casas` hoy leen `propiedades_v2_archivo`
  (verificado por `pg_depend`), o sea que los feeds de ZN y casas están sirviendo una tabla
  congelada. No lo investigué; queda anotado para el TIEMPO 2.

---

## 📌 Nota de numeración (12-ago-2026)

La migración se numeró **322**, no 318. Al ordenar las ramas aparecieron **dos migraciones 318
distintas**: ésta y `318_bsuid_registrar_identidad_meta.sql` de la rama
`worktree-fix-bsuid-crm-contactos` (identidad del CRM por BSUID de Meta), escrita el mismo día sin
que ninguna de las dos sesiones supiera de la otra. Main estaba en 317 y las dos tomaron "el
siguiente libre".

Se resolvió así: el **CRM conserva 318 y 319** (es el trabajo más grande, 2.135 líneas, y no valía
la pena tocarlo), el **bot se quedó con 320 y 321** (ya aplicadas el 12-ago) y **el TC pasa a 322**.

🔑 Dos números iguales no dan error al escribirlos: dan un índice donde nadie puede saber después
cuál se aplicó. Se ve al ordenar, no al trabajar.
