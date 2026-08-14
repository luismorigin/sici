# Las funciones que nombran la tabla vieja — panorama para decidir el TIEMPO 2

> Medido contra la BD el 11-ago-2026, después del TIEMPO 1. Complementa
> [`INVENTARIO_CUTOVER_2026-08-10.md`](INVENTARIO_CUTOVER_2026-08-10.md) §6(b), que decía
> *"al menos 6 las usa el sitio vivo"* sin la lista completa. Esta es la lista completa.
> **Análisis puro: no se ejecutó ni se modificó nada.**

## El número exacto

**66 firmas · 64 nombres distintos** (`obtener_discrepancias` y `procesar_decision_sin_match` están
sobrecargadas) referencian `propiedades_v2` como palabra exacta. Una sola apunta al archivo:
`reconstruir_serie_precios_reexpresada`, repunteada en el TIEMPO 1.

⚠️ **Cuidado con el filtro:** buscar `LIKE '%propiedades_v2%'` trae también las `_shadow` (el texto
está contenido). Hay que usar límite de palabra (`~ '\mpropiedades_v2\M'`), o el inventario se infla
con las funciones buenas. Mismo cuidado con `precio_normalizado` vs `precio_normalizado_shadow`.

## Hoy fallan. Después del TIEMPO 2, contestan.

Esa es toda la cuestión. Hoy las 66 apuntan a una tabla que no existe → error ruidoso. El día que la
tabla viva tome el nombre `propiedades_v2`, **las 66 empiezan a responder sobre datos buenos con
lógica vieja**. No hay paso intermedio y no hay aviso.

---

## Grupo 1 — 🔴 Las que mienten (3). Sin resolver esto, el TIEMPO 2 no se hace.

Fórmula vieja (`precio_normalizado`, la del ×1,47) **y** llamador vivo:

| Función | Quién la llama | Qué pasaría |
|---|---|---|
| **`buscar_unidades_simple`** | `pages/ventas.tsx`, `pages/api/ventas.ts`, `pages/b/[hash].tsx`, `pages/zona-norte/ventas.tsx`, `api/broker/shortlists/[id].ts` | precios inflados en el **feed público** |
| **`buscar_unidades_reales`** | ~~`api/broker/generate-cma.ts`~~ · `admin/propiedades` · `lib/supabase.ts` → **funnel premium dormido** | admin (ver ✅ abajo) |
| **`analisis_mercado_fiduciario`** | `lib/supabase.ts` | análisis de mercado |

> ✅ **`buscar_unidades_reales` bajó de categoría el 14-ago-2026.** Sus tres llamadores, uno por uno:
> · **CMA del broker** → **apagado** (`api/broker/generate-cma.ts` devuelve 410; lo reemplaza el ACM
>   del PR #71, que lee `v_mercado_venta_shadow`). Llevaba 3 días roto —`42P01` tragado en silencio,
>   informes con cero comparables, crédito descontado igual— y nadie lo reportó: `broker_cma_uso`
>   tiene **0 filas** en toda su historia.
> · **`lib/supabase.ts` → `buscarUnidadesReales()`** → solo la usan `resultados-v2.tsx` y
>   `FilterBarPremium.tsx`, o sea el **funnel premium, dormido por decisión de producto**. No es
>   trabajo: es decidir si se apaga.
> · **`/admin/propiedades`** → único llamador vivo real, y ya entra por los pasos 2-3 del admin.
>
> 👉 **Ya no bloquea el TIEMPO 2 por sí sola.** No hay que repuntarla al régimen nuevo: hay que
> apagarla cuando el admin termine de mudarse. Detalle y corrección del párrafo que la listaba como
> bloqueante: `INVENTARIO_CUTOVER_2026-08-10.md` §6a.

### 🔴 El hallazgo que más pesa: `rpcShadowFirst` NO es cutover-safe

`lib/rpc-shadow.ts` intenta la RPC `_shadow` y **si falla cae a la vieja**. Su comentario dice:

> *"si la RPC `_shadow` deja de existir cuando shadow→prod, cae automáticamente a la RPC prod (que
> para entonces YA es igual a shadow) → nada se rompe"*.

**Esa premisa es falsa, medido:**

| | fórmula |
|---|---|
| `buscar_unidades_simple` | **`precio_normalizado`** (vieja) |
| `buscar_unidades_simple_shadow` | `precio_normalizado_shadow` (nueva) |

No son iguales y no se van a volver iguales solas. Hoy el fallback es inofensivo porque la vieja
falla. Después del TIEMPO 2 el fallback **funciona y devuelve precios inflados en el feed público**,
sin error en ningún log.

🔑 Es el modo de falla más caro que tiene este sistema: una red de seguridad que deja de serlo
justo el día que se la necesita.

### Fórmula vieja pero sin llamador desde el código (revisar, no urgente)
`explicar_precio` · `generar_razon_fiduciaria` · `snapshot_absorcion_mercado` (esta la llamaba n8n;
su gemela `_shadow` es la que escribe la serie viva).

---

## Grupo 2 — El pipeline n8n muerto, que **escribe** (13)

`registrar_discovery` (11 referencias en n8n) · `registrar_discovery_alquiler` ·
`registrar_enrichment` · `registrar_enrichment_alquiler` · `registrar_enrichment_venta_llm` ·
`merge_discovery_enrichment` (44 KB, la más grande) · `merge_alquiler` ·
`matching_completo_automatizado` · `crear_proyecto_desde_sugerencia` · `corregir_proyecto_matching` ·
`asignar_proyecto_existente` · `detectar_proyectos_sin_desarrollador` · `guardar_snapshot_precios` ·
`actualizar_tipo_cambio` · `snapshot_absorcion_mercado`.

n8n está apagado desde el 28-jul, pero **estas funciones no saben eso**. Si algo las dispara —un
webhook olvidado, alguien reviviendo un workflow, una llamada manual— escriben en la base buena con
las reglas del régimen viejo.

> 🔴 **`actualizar_tipo_cambio` merece su propia línea (agregado el 14-ago):** es la única del grupo
> que, si alguien la llama **hoy**, **rompe algo que hoy funciona**. Su paso 6 hace `UPDATE
> propiedades_v2` → `42P01` → y como el `UPDATE config_global` del paso 5 va en la misma transacción,
> **el TC no se escribe**. Por eso `capturar-tc-binance.mjs` la esquiva y escribe `config_global`
> directo (comentario en su cabecera, líneas 27-29).
> **Y después del TIEMPO 2 es peor, no mejor:** con la tabla renombrada deja de fallar y vuelve a
> marcar propiedades vivas con las reglas viejas, en silencio. Es el mismo patrón que el grupo 1.
> 👉 Se borra con el grupo, pero **verificar antes que ningún camino la llame** — el capturador del TC
> es el único que la nombra, y solo para explicar por qué NO la usa.

---

## Grupo 3 — Las del admin (13)

Viven o mueren con la decisión sobre cada pantalla:

| Función | Pantalla | Destino |
|---|---|---|
| `inferir_datos_proyecto`, `propagar_proyecto_con_apertura_temporal`, `sincronizar_propiedad_desde_proyecto` | editor de proyectos y propiedades | **repuntar** (paso 2b del admin) |
| `calcular_confianza_datos` | `lib/supabase.ts` | repuntar |
| `procesar_decision_sin_match`, `procesar_validacion_auto_aprobado`, `obtener_auto_aprobados_para_revision`, `exportar_propiedades_excluidas`, `procesar_accion_excluida`, `obtener_sin_match_para_exportar`, `obtener_pendientes_para_sheets` | **supervisor** | se van con las pantallas |
| `aplicar_match_piloto`, `obtener_pendientes_piloto` | `supervisor/matching-piloto` | obsoletas |

---

## Grupo 4 — Sin ningún llamador (16)

Ni el sitio, ni los scripts, ni n8n, ni otra función:

`buscar_similares` · `buscar_unidades_con_amenities` · `estadisticas_merge` ·
`intentar_match_con_fuzzy` · `knowledge_graph_health_check` · `matching_alquileres_batch` ·
`obtener_propiedades_requieren_revision` · `obtener_propiedades_tc_pendiente` · `poblar_zonas_batch` ·
`propagar_proyecto_a_propiedades` · `propiedades_requieren_revision` ·
`recalcular_precios_batch_nocturno` · `resetear_merge` · `separar_hitl_por_macrozona` ·
`separar_hitl_zona_norte` · **`fn_trigger_tc_actualizado`** ⚠️

### ⚠️ Y por qué "sin llamador" no es lo mismo que "borrable"

**`fn_trigger_tc_actualizado` no aparece en ningún grep.** Es el trigger `trigger_tc_actualizado`
sobre `config_global`, y **muta datos**. Los triggers no se invocan por nombre desde ningún archivo:
se disparan solos.

🔑 Un grep sobre el código nunca ve un trigger. Hay que preguntarle al catálogo (`pg_trigger`).

> ✅ **CORRECCIÓN (11-ago, misma tarde).** La primera versión de este documento decía que el trigger
> estaba **activo** y que por eso *"actualizar el tipo de cambio haría fallar el `UPDATE` de
> `config_global`"*. **Es falso: está DESACTIVADO** (`tgenabled='D'`) — lo apagó el TIEMPO 1 el mismo
> día, tal como estaba planificado en `INVENTARIO_CUTOVER_2026-08-10.md:272`. Lo detectó el
> diagnóstico del TC (`docs/arquitectura/TC_BINANCE_DIAGNOSTICO_2026-08-11.md` §4.3).
> **Consecuencia práctica: actualizar el TC paralelo es seguro hoy.**
> 🔑 Yo leí `pg_trigger` pero **no leí `tgenabled`**: pregunté si el trigger existía, no si estaba
> encendido. Un objeto presente no es un objeto activo — es la misma familia de error que este
> documento persigue.
>
> El otro trigger de `config_global`, `trigger_actualizar_precios_cuando_cambia_tc`, **sí está
> activo** pero es inofensivo: sólo dispara con claves en MAYÚSCULAS (borradas el 19-jun) y escribe
> sobre la tabla legacy `propiedades`.
>
> Para el TIEMPO 2 el trigger desactivado sigue contando: **al renombrar la tabla no se reactiva
> solo, pero queda como objeto muerto apuntando a la base buena.** Se borra con las 66.

### 🆕 Y el que falta, no el que sobra: la tabla viva **no tiene trigger de zona**

`propiedades_v2_shadow` no tiene ningún trigger propio. El inventario del 10-ago decidió no ponerlo:
*"hará falta el día que algo edite shadow a mano — o sea, después de arreglar §3.1, no antes"*.

**§3.1 se arregló el 11-ago**: el admin ya edita la base viva y está desplegado. La condición se
cumplió y el trigger no se puso → **si desde el admin se corrige el GPS de una propiedad, su zona
no se recalcula**. Queda con la zona vieja, en silencio.
No es del cutover: es de ahora. Va al paso 2 del admin.

---

## Resumen para decidir

| Grupo | Cuántas | Qué hacer |
|---|---:|---|
| 1 · Mienten sobre datos vivos | 3 | **Bloquean el TIEMPO 2.** Repuntar al régimen nuevo o borrar, y arreglar el fallback de `rpcShadowFirst` |
| 2 · n8n muerto, escriben | 13-15 | Borrar (n8n no vuelve) |
| 3 · Del admin | 13 | Las del supervisor se van con las pantallas; 4 se repuntan |
| 4 · Sin llamador | 16 | Borrar — **menos el trigger**, que se decide aparte |

**Se borra más de la mitad.** El trabajo real no son 66 decisiones: son **3 que bloquean**, un
fallback mal comentado, un trigger activo y un trigger faltante. El resto es limpieza.

---

# Ronda 2 — los huecos que quedaban, cerrados (11-ago, tarde)

## El panorama de Supabase: limpio

| Qué | Resultado |
|---|---|
| **Tareas programadas** (`pg_cron`) | **3**: `vigilar-bot-wa` (3 min) · `parte-diario-bot` (1:00) · `advisor-snapshot-diario` (9:15). **Ninguna nombra la tabla vieja ni la viva.** No las afecta el cutover |
| **Edge Functions** | **ninguna** — el panel ofrece crear la primera |
| **Database Webhooks** | ninguno — revisados los triggers de todos los schemas, ninguno llama `http_request` |
| **Llamadas HTTP salientes** | una sola función: `slack_bot_aviso`. Nada que ver con propiedades |
| **Vistas** | ninguna nombra la tabla vieja → el feed y el bot sobreviven al rename sin tocarlos |

Era el agujero que más preocupaba —automatismos corriendo dentro de la base, invisibles a cualquier
búsqueda en el repo— y salió vacío.

## `buscar_extras`: inofensiva (queda clasificada)

Solo devuelve dos arrays de texto (`amenidades_extra`, `equipamiento_otros`) leídos de un JSON.
**No toca precio, no usa ninguna de las dos fórmulas.** Se borra con el resto: el feed usa
`buscar_extras_shadow`.

## El reemplazo en el repo es **la mitad** de lo estimado

| Carpeta | Archivos con `propiedades_v2_shadow` | ¿Se editan? |
|---|---:|---|
| `scripts/deptos-equipetrol` | 48 | **sí** |
| `simon-mvp/src` | 9 | **sí** (casi todo son comentarios) |
| `sql/migrations` | 31 | **NO — son historia.** Una migración aplicada no se reescribe |
| `.next/`, `node_modules` | — | artefactos de compilación |

**El trabajo real son 57 archivos, no 217 ni 107.** Corrección de los dos números que di antes: el
primero contaba las copias de skills y la carpeta de build; el segundo, las migraciones.

Y el sitio ya está preparado: `usePropertyEditor.ts` centraliza el nombre en una constante y lo
declara — *"el día que se renombre, se cambia ACÁ, una línea, y no se busca por el archivo"*. De los
9 del sitio, la mayoría solo lo nombra en comentarios.

## 🔴 El hallazgo que define el camino: el TIEMPO 2 tiene una ventana de caída

El TIEMPO 1 archivó una tabla **que ya no usaba nadie** → se podía hacer a cualquier hora, y lo que
se rompía era justamente lo que se quería descubrir.

El TIEMPO 2 renombra **la tabla que usa todo**. Entre el `ALTER TABLE` y el despliegue del código
corregido, los 57 archivos apuntan a un nombre que dejó de existir: **las capturas nocturnas, los
audits y el sitio quedan sin datos**. No es un riesgo teórico, es aritmética.

O sea que el TIEMPO 2 **no es una operación de base de datos**: es un despliegue coordinado de base
+ código, con una ventana que hay que diseñar. Tres caminos posibles (a resolver en el plan, no acá):
1. Ventana corta a una hora sin routines, con el deploy listo para apretar el botón.
2. Una **vista puente** `propiedades_v2_shadow` sobre la tabla nueva. ⚠️ **Ojo: los cargadores hacen
   `upsert` y `ON CONFLICT` no funciona sobre una vista** — habría que verificarlo antes de confiar.
3. Renombrar el código primero a un nombre neutro y la tabla después.

## Cómo medir sin que el caché mienta

Las páginas públicas son **ISR con 6 horas** (`revalidate: 21600` en ventas, alquileres, mercado,
home). La primera pintura sale de `getStaticProps`; el navegador después pide datos frescos a la API.

Consecuencia: **comparar el HTML antes y después no prueba nada** — puede dar idéntico porque sirvió
el caché viejo, y el daño aparecer 6 horas más tarde cuando ISR regenere.

✅ **El TIEMPO 1 midió bien**: sus evals principales fueron `POST /api/ventas` y `/api/alquileres`,
que se resuelven en el servidor y son frescos en cada llamada (354 y 182 props). El chequeo de "las
6 páginas con el mismo peso" era complementario — **por sí solo no habría probado nada.**

📌 **Regla para el TIEMPO 2:** medir contra las **APIs y las RPC**, nunca contra el HTML. Y probar
**una shortlist real con su hash**, no una página de listado (la lección que dejó el TIEMPO 1).

## 🔴 Y un bug VIVO que apareció de paso — no es del cutover, es de ahora

`lib/simon-contactos.ts:210-215` (el CRM de contactos, `/admin/contactos`) pide los datos de las
propiedades a **las dos tablas** y se queda con lo que encuentre:

```js
const [shadow, prod] = await Promise.all([
  client.from('propiedades_v2_shadow').select(cols).in('id', propIds),
  client.from('propiedades_v2').select(cols).in('id', propIds),   // ← desde ayer, esto falla
])
for (const r of prod.data ?? []) props.set(r.id, r)    // ?? [] se come el error
```

**No chequea `error`.** El `?? []` convierte "la consulta falló" en "no hay filas".

**Medido: de las 349 propiedades que aparecen en shortlists, 184 (53%) existen solo en el archivo.**
Desde el TIEMPO 1, esas 184 se muestran **sin nombre de edificio, sin zona y sin dormitorios** en la
pantalla que el founder declaró la de más valor del admin. Sin un error en ningún log.

### ⚖️ Pero el impacto real es casi nulo — medido después, a pedido del founder
La pregunta fue *"¿no afecta solo a shortlists pasadas, que ya no sirven?"*. Correcta:

| | |
|---|---|
| Última apertura de una shortlist **afectada** | **21-jul** (3 semanas atrás) |
| Última apertura de cualquier shortlist | hoy · 3 esta semana, **ninguna afectada** |
| Las 4 shortlists más nuevas (≥18-jul) | **0 items sin datos** |

El corte tiene explicación: desde el 21-jul las shortlists se arman con propiedades de la base viva.
Las rotas son de mayo y junio. **Queda abierta una puerta chica**: los links no vencen, así que un
cliente que vuelva a uno viejo lo vería degradado.

Y en la superficie del **cliente** (`/b/[hash]`) el daño es distinto y menor: los datos salen de la
RPC shadow; lo que consulta la tabla vieja es el `precio_usd` **crudo**, usado para avisar *"el
precio cambió desde que se armó la lista"* (líneas 610 y 524). Al cliente no le faltan datos: le
falta ese aviso.

👉 **Prioridad: backlog, no urgencia.** Se arregla junto con los otros 8 archivos del mismo patrón.
Lo que importa acá no es el bug, es el mecanismo.

🔑 **Es la tercera aparición del mismo mecanismo**, después de `verificar-shadow-alquiler.mjs` (que
iba a imprimir "✅ INVENTARIO CERRADO" sobre una consulta fallida) y del fallback de
`rpcShadowFirst`. El patrón es el del 11-ago: **tratar "no sabemos" como un dato**.
👉 Hay **24 usos** de `.data ?? []` en el sitio, 9 de ellos en archivos que tocan propiedades o RPC.
No todos son bugs —algunos chequean `error` antes—, pero **ninguno se revisó**. Va al backlog.

## Qué sigue sin responder
- Si algún disparador vive fuera de Supabase y del repo (Vercel Cron, algo configurado en Kapso).
- Los 9 archivos con `.data ?? []` sobre propiedades: cuáles chequean `error` y cuáles no.
- Si `ON CONFLICT` funciona sobre una vista puente (camino 2 de la ventana).
- El orden de ejecución del TIEMPO 2. Eso es un plan, y va cuando estas decisiones estén tomadas.
