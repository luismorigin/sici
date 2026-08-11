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
1. scripts/deptos-equipetrol/INVENTARIO_CUTOVER_2026-08-10.md — fuente única.
   §7-ter tiene el goal y las 5 CONDICIONES DE ENTRADA.
2. scripts/deptos-equipetrol/FOTO_PREVIA_TIEMPO1_2026-08-11.md — cómo se hizo el
   tiempo 1 y su veredicto.
3. Las memorias project_cutover_shadow_es_la_base y project_admin_cambio_de_trabajo.

🔴 LO PRIMERO: verificá una por una las 5 condiciones de entrada y decime cuáles
se cumplen HOY. Si alguna no se cumple, NO se ejecuta: se resuelve esa primero.
La más importante: `buscar_unidades_reales` y `buscar_extras` siguen calculando
con la fórmula vieja y leen `propiedades_v2` POR NOMBRE. El día que la tabla viva
tome ese nombre, se despiertan sobre datos buenos con la cuenta vieja e inflan
~47% en la creación de shortlists y en el CMA del broker. No da error: da un
número creíble y falso.

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
