# Por dónde retomar — prompts listos

> Escrito el 11-ago-2026 al cerrar el día. Cada bloque es **autosuficiente**: se pega en una sesión
> nueva y arranca sin depender de ninguna conversación anterior.
> 🔴 Los tres piden lo mismo antes de escribir código: **goal en una frase · línea de base MEDIDA ·
> evals con criterio de aborto**. Esa disciplina es la que hizo que el TIEMPO 1 del cutover saliera
> sin sorpresas, y que el paso 1 del admin encontrara 4 errores que nadie había visto.

---

## 1. PASO 2 del admin

```
Retomamos el PASO 2 del rediseño del admin.

Leé primero, en este orden:
1. docs/backlog/ADMIN_ANALISIS_2026-08-11.md — el análisis completo y el plan en
   3 pasos. El paso 1 ya está hecho y en main (commits 1323b21 y 4aa0d0e).
2. La memoria project_admin_cambio_de_trabajo.

Antes de escribir código quiero, como en el paso 1:
- El goal del paso 2 en una frase, y qué NO entra.
- La línea de base MEDIDA de lo que vamos a tocar (números de hoy, guardados en
  un archivo, para poder comparar después).
- Los evals, con el criterio de aborto.
Recién con eso aprobado, la rama y la implementación.

El paso 2 son cuatro trabajos:
a) market y market-alquileres → apuntarlos a market_absorption_snapshots_shadow.
   Tiene TODAS las columnas de la serie vieja + 25 nuevas + macrozona. Declarar
   el corte del 21-jul.
b) Repuntar propagar / sincronizar / inferir del editor de proyectos: hoy sus
   funciones leen la tabla archivada.
c) Agregar a proyectos_master los 5 campos vivos que hoy no tienen pantalla:
   entrega_verificada (+_at/_por/_notas), alias_conocidos, pet_friendly,
   gps_verificado_visual. Son los que hoy se aplican pegando SQL.
d) Los rechazos del gate: que vayan a la base con su motivo y aparezcan en el
   parte matutino. Limpiar de paso las 109 entradas viejas sin motivo de
   scripts/deptos-equipetrol/output/rechazados.json.

Contexto que no está en los docs y conviene tener presente:
- El admin ya está apuntado a la base viva (propiedades_v2_shadow) y desplegado.
- lib/precio-utils tiene DOS normalizaciones: precioDelFeed (régimen nuevo, base
  viva) y normalizarPrecio (viejo, para el archivo). Usar la equivocada no da
  error: da ~67% de diferencia.
- El patrón de error que apareció 5 veces el 11-ago: tratar "no sabemos" como un
  número (null→false, sin área→0). Mirarlo en cada cosa que toques.

Empezá diciéndome qué entendiste del estado actual antes de proponer nada.
```

---

## 2. TIEMPO 2 del cutover (renombrar la tabla viva)

```
Retomamos el TIEMPO 2 del cutover: darle el nombre `propiedades_v2` a la tabla
viva, que hoy se sigue llamando propiedades_v2_shadow.

Leé primero:
0. scripts/deptos-equipetrol/BARRIDO_RENAME_2026-08-17.md — 🔴 EMPEZÁ ACÁ. Cada
   pieza de la base clasificada por lo que le pasa el día del rename. Tiene la
   lista cerrada de las 7 funciones VIVAS que el rename ROMPE (los dos feeds, el
   bot, la captura nocturna) y el dato de que la base viva no tiene triggers.
   Los inventarios de abajo clasifican lo ROTO y por eso no ven esas 7.
1. scripts/deptos-equipetrol/INVENTARIO_CUTOVER_2026-08-10.md — fuente única.
   §7-ter tiene el goal y las 5 CONDICIONES DE ENTRADA.
2. scripts/deptos-equipetrol/FOTO_PREVIA_TIEMPO1_2026-08-11.md — cómo se hizo el
   tiempo 1 y su veredicto.
3. Las memorias project_cutover_shadow_es_la_base y project_admin_cambio_de_trabajo.

🔴 LO PRIMERO: verificá una por una las 5 condiciones de entrada y decime cuáles
se cumplen HOY. Si alguna no se cumple, NO se ejecuta: se resuelve esa primero.

✅ La condición 2 YA SE CUMPLIÓ (17-ago-2026). Hasta esa fecha este prompt decía
que era "la más importante" porque `buscar_unidades_reales` y `buscar_extras`
inflarían ~47% "en la creación de shortlists y en el CMA del broker". Eso quedó
FALSO en los tres puntos, y conviene saber por qué antes de confiar en el resto:
  · las shortlists NUNCA usaron esa función (solo la nombran en un comentario);
  · `buscar_extras` ya tenía gemela `_shadow` desde antes;
  · el CMA v1 se apagó el 14-ago (410; lo reemplaza el ACM del PR #71) y el
    funnel premium se borró el mismo día.
Hoy `buscar_unidades_reales` no tiene un solo llamador en `src/` — se borra en la
limpieza del TIEMPO 2 y no hay que repuntar nada.
🔑 El párrafo viejo se había escrito leyendo un grep en vez del código de cada
llamador. Un grep encuentra el nombre de una función también donde solo está
MENCIONADA en un comentario, y no la encuentra donde el llamador es interno al
mismo archivo. Las dos cosas pasaron.

⚠️ Y ojo con la condición 1 ("cero referencias vivas al nombre `propiedades_v2`"):
está redactada de más. Su espíritu es que ninguna FÓRMULA VIEJA DE PRECIO despierte
sobre datos buenos — y de las 14 referencias que quedan, **una sola calculaba
precio, y ya cayó**. Las otras 13 son de matching y de proyectos: hoy están rotas y
**el rename las arregla, que es lo que se quiere**. Tomar la condición 1 al pie de
la letra manda a tocar 13 funciones para nada. Ver `docs/backlog/ADMIN_ANALISIS_2026-08-11.md` §13.

Después, y solo después:
- Foto previa MEDIDA, como la del tiempo 1 (feeds, bot, ACM, páginas, y esta vez
  TAMBIÉN una shortlist real con su hash: en el tiempo 1 se me escapó que
  /b/[hash] degradaba en silencio porque probé páginas de listado, no una
  shortlist).
- Predicción firmada ANTES: qué se rompe y qué no.
- Evals con criterio de aborto.
- El SQL, para que lo ejecute el founder (mi acceso a la BD es de solo lectura).

Otras cosas que hay que resolver en el mismo movimiento:
- La secuencia de ids de la tabla viva (hoy arranca en 9.000.000; el cargador
  asigna a mano desde 8.000.000 — que no se crucen).
- Las ~70 funciones del pipeline n8n muerto: al renombrar pasan a apuntar a la
  base buena. Un senior no las deja vivas ahí.
- `reconstruir_serie_precios_reexpresada` ya quedó apuntada al archivo en el
  tiempo 1: verificar que siga así.

Empezá por las 5 condiciones y decime el veredicto de cada una antes de proponer
nada.
```

---

## 3. Lo de Remax sin área (queda abierto)

```
Retomamos el hallazgo de calidad de datos del 11-ago: Remax alquiler tiene 22,9%
de propiedades sin área (1 de cada 4) contra 0,1% de Century21, y sigue pasando
en las capturas recientes.

Contexto en docs/backlog/ADMIN_ANALISIS_2026-08-11.md (sección "Hallazgo de
CALIDAD DE DATOS que destapó el listado").

Lo que ya se sabe:
- El área de Remax viene del DISCOVERY (search API), no del detalle. Lo dice
  scripts/deptos-equipetrol/lib/detalle-deptos.mjs: "El área NO se saca del
  detalle (Remax no la trae ahí)".
- Tampoco está en el texto de la descripción (8 casos revisados).

LA PREGUNTA QUE CIERRA EL TEMA, y que no pude responder: ¿el aviso en remax.bo
muestra la superficie? Si la muestra, es un bug del discovery. Si no, es dato
faltante del captador y no hay nada que arreglar.
⚠️ El fetch directo a remax.bo falla; hay que usar el proxy del pipeline
(PROXY_URL en el .env, como hace fetchRetry).

Importa porque el área es el denominador de la métrica central ($/m²): una prop
sin área no entra en ninguna mediana ni se puede comparar.
```

---

# 🌿 Mapa de ramas — qué hay sin integrar (12-ago-2026)

> Escrito al ordenar las ramas. **Nada de esto está en `main` ni pusheado.** Cada línea existe
> únicamente en la máquina del founder.
> 🔴 **Antes de crear una migración nueva, mirá la tabla de números de abajo.** El 12-ago aparecieron
> **dos migraciones 317 y tres 318**, escritas por sesiones que no se veían entre sí. Ya están
> repartidas; el próximo número libre es el **325**.

> ✅ **ACTUALIZADO AL CIERRE DEL 12-AGO: todo se mergeó, desplegó y pusheó**, menos preventa.
> Main está en GitHub, el working tree limpio, y la base y el repo dicen lo mismo.

| Rama | Qué es | Estado |
|---|---|---|
| `fix/bot-rpc-security-definer` | migs **320+321** | ✅ en main · aplicadas · **bot verificado respondiendo** |
| `fix/ssg-feeds-primera-pintura` (incluye `fix/zona-norte-lee-base-viva`) | los 4 feeds + ZN caído | ✅ en main · **desplegado y verificado en producción** |
| `worktree-fix-bsuid-crm-contactos` | migs **318**+319 · identidad del CRM | ✅ en main y desplegado · **la 318 aplicada + backfill 3/3**. 🔴 **La 319 NO** — ver abajo |
| `worktree-fix+tc-binance-captura` | mig **322** + capturador del TC | ✅ en main · aplicada · **el TC se refresca solo** (paso 0 del cron) |
| `worktree-feat+multiproyectos-feed-shadow` | migs **323+324** · folletos de preventa | ⏸️ **ÚNICA fuera de main, a propósito** — ver abajo |

### 🔢 Los números de migración, repartidos
`318-319` CRM/BSUID (**la 319 sin aplicar**) · `320-321` bot ✅ · `322` TC ✅ · `323-324` preventa
(sin aplicar) · `325` `buscar_similares` ✅. **Próximo libre: 326.**

### 🔴 Lo único pendiente con riesgo: la mig 319
Es la que hace que la identidad del CRM **deje de ser el teléfono**. NO es "cuando quieras":
tiene un **gate de 5 chequeos** en su encabezado, su **rollback es limitado** (volver a `NOT NULL`
solo se puede si todavía no entró ningún contacto sin teléfono) y **toca la alarma del bot**
(`simon_bot_incidentes.telefono` + `vigilar_bot_whatsapp()`). El código actual la tolera sin aplicar:
vuelve al camino por teléfono y lo dice por log. Detalle: memoria `project_crm_identidad_bsuid`.

### ⏸️ Proyectos de preventa — pausado, NO perdido
`worktree-feat+multiproyectos-feed-shadow` · último commit 9-ago · **2.343 líneas en 16 archivos**.

**Qué hace:** los avisos que publican un **proyecto entero** (folletos de preventa) hoy los aparta el
cargador a `proyectos_detectados` y **no se ven en ningún lado**. Esta rama los saca a la luz:
pestaña `/ventas/proyectos`, sheet con los avisos, lector de folletos y una pantalla de admin para
curarlos.

**Por qué no se descarta** (medido el 12-ago): la tabla tiene **225 avisos** acumulados desde el
10-jul, **+8 esta semana** (el último, hoy), **105 ya curados a mano** y **120 esperando**. El
sistema junta material para esto todas las noches y nadie lo mira.

**Por qué está en pausa:** aplicarla es *una jornada de trabajo dedicada* — decisión del founder,
12-ago. No es urgente.

**Ya se hizo lo peligroso:** sus migraciones se renumeraron a **323/324** (commit `88f7d9d`). Traía
una **317 propia que chocaba con la 317 de seguridad ya aplicada** — dos cosas distintas con el mismo
número: quien aplicara "la 317" sin mirar, aplicaba la otra. Esa bomba está desarmada.

**Cuando se retome:** renumeración ✅ hecha · falta revisar las 2.343 líneas (nadie las mira desde el
9-ago, y esta semana se vio lo que pasa al tocar vistas compartidas) · aplicar 323 y 324 · desplegar.

---

## Estado al cierre del 12-ago-2026

| Frente | Estado |
|---|---|
| Bot de WhatsApp | ✅ **responde** — migs 320+321+325, y ya hay **prueba diaria** (paso 6b del cron) |
| Zona Norte | ✅ **volvió** — 365 en venta, 103 en alquiler |
| Primera pintura de los 4 feeds | ✅ el HTML trae propiedades (24/8/24/8, antes 0) |
| CRM / BSUID | 🟡 paso 1 hecho y desplegado · **la 319 pendiente, con gate** |
| Tipo de cambio | ✅ al día (11,528) y **se refresca solo** cada noche |
| Ramas y worktrees | ✅ ordenados — 6 ramas viejas borradas, 115 MB liberados, **dos 317 y tres 318** repartidas |
| CLAUDE.md | ✅ corregido: decía 4 cosas que ya eran falsas (reglas #3 y #10 incluidas) |
| Proyectos de preventa | ⏸️ en pausa, registrado arriba |
| Prueba diaria del bot | ✅ hecha — ⚠️ corre **1 vez al día**; si se rompe a las 10 AM, se sabe a la 1 AM |

🔑 **La lección del día**: aparecieron **tres diagnósticos seguros y equivocados** — dos externos y
uno mío. Los tres tenían el síntoma bien y el mecanismo mal, y los tres se resolvieron igual:
**midiendo antes de aplicar**. El caso testigo: "resolver el TC una sola vez" habría dado 7,5% de
mejora sobre un problema que necesitaba 237×.

---

## Estado al 11-ago-2026, para ubicarse

| Frente | Estado |
|---|---|
| Seguridad (anon escribía las tablas) | ✅ cerrado — migs 317 + los 3 REVOKE de catálogos |
| Cutover TIEMPO 1 (archivar la vieja) | ✅ ejecutado, 4 evals en verde, 0 hallazgos no predichos |
| Candados (regla #1) | ✅ los cargadores los respetan al re-procesar |
| Admin PASO 1 (hablar el idioma del feed) | ✅ en main, 6 evals en verde |
| Admin PASOS 2 y 3 | ⬜ pendientes — ver arriba |
| Cutover TIEMPO 2 | ⬜ pendiente, con 5 condiciones de entrada |
| Remax sin área | ⬜ abierto, con la pregunta ya formulada |
| Topes de los feeds | ✅ subidos antes de que cortaran |

🔑 **La lección más reutilizable del día**: apareció **cinco veces** el mismo error —tratar "no
sabemos" como un número— en cinco lugares que nadie relacionaba. Y los tres hallazgos que evitaron
daño salieron de que el founder repreguntara, no de mi análisis. Ver la memoria
`feedback_verificado_no_es_exhaustivo`.
