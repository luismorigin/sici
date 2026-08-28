# Auditoría — alias intrusos y colisiones de nombre en el catálogo

**27-ago-2026** · read-only, $0 · sobre `proyectos_master` (fichas activas) y `propiedades_v2`.

> **Por qué se hizo.** En una semana aparecieron **tres alias intrusos** —un alias cargado en una
> ficha que es el **nombre oficial de otra**— y los tres se descubrieron **de rebote**: dos tirando
> del hilo de una propiedad mal matcheada (Eurodesign el 18-ago, Portofino el 27) y uno midiendo el
> impacto de una migración (Uptown/Santorini, 27-ago). **Nunca porque algo los buscara.**
> La hipótesis era que hacía falta una superficie nueva del audit para barrerlos.

---

## Resultado corto

**La hipótesis era correcta pero menor.** Los alias intrusos ya estaban todos limpios y la superficie
propuesta daría **cero**. Lo que sí apareció, buscándolos, es un problema estructural más grande:

🔴 **24 fichas activas del catálogo, en 11 grupos, son INDISTINGUIBLES para el matcher.**
No por los alias: por cómo `normalize_nombre()` destruye justamente los dos discriminantes que
separan a los edificios de una misma familia — **el numeral y el prefijo**.

---

## 1 · Alias intrusos: 0 (el barrido que motivó la auditoría)

Tres formas de buscarlos, todas en **cero**:

| barrido | resultado |
|---|---|
| Un alias que coincide **exacto** (case-insensitive) con el `nombre_oficial` de otra ficha activa | **0** |
| El mismo alias cargado en **dos fichas distintas** | **0** |
| Alias intrusos conocidos, ya corregidos | 3 (pm 297 Eurodesign · pm 35 Uptown · pm 221 Santorini) |

👉 **La superficie nueva sigue valiendo la pena** —es una query, corre en segundos y es determinística
como el dedup— pero como **red de contención**, no como cola de trabajo: hoy no hay nada que levantar.

---

## 2 · 🔴 El hallazgo real: 24 fichas que el matcher no puede distinguir

Agrupando las fichas **activas** por `normalize_nombre(nombre_oficial)`:

| normalizado | fichas que colisionan |
|---|---|
| `barak` | 440 Barak II · 441 Barak III · **442 Barak** |
| `condado` | 60 Condado II · 125 Condado III · 127 Condado IV |
| `portofino` | 75 Portofino V · **156 Condominio Portofino** · 559 Portofino III |
| `barcelona` | **427 Condominio Barcelona** · 590 Barcelona III |
| `baruc` | 288 Baruc II · 592 Baruc V |
| **`barucnorte`** | **409 Torre Baruc Norte · 500 Edificio Baruc Norte** ← *no hay numeral* |
| `camila` | 412 Camila II · **584 Condominio Camila** |
| `domusluxury` | **73 Domus Luxury · 356 DOMUS LUXURY** ← *mismo nombre* |
| `galilparque` | 358 Galil Parque III · 518 Galil Parque I |
| `platinum` | 25 Platinum II · **71 Edificio PLATINUM** |
| `trivento` | 332 Trivento IV · 511 Trivento III |

**Para `buscar_proyecto_fuzzy` cada grupo es UN solo nombre.** Por eso los clusters numerados nunca
se auto-aprueban y siempre van al juez — no es una política prudente, es que **el matcher no puede
verlos separados**.

🔑 **Y explica el caso Portofino de hoy:** `pm 156 "Condominio Portofino"` es el **token pelado** del
grupo. Cuando C21 manda un slug sin apellido, el lector guarda `nombre_edificio = "Portofino"` y el
156 gana por nombre único. Ese pm **nunca acertó en nueve meses**: sus únicas 2 props estaban a
5.369 m y 6.547 m. Lo mismo puede pasar con los otros cinco tokens pelados marcados en negrita.

---

## 3 · Los tres defectos de `normalize_nombre()`

```sql
-- paso 2: prefijos
regexp_replace(v_texto, 'condominio|edificio|torre|residencia|residencial|departamento|depto|dto', '', 'g')
-- paso 3: romanos
regexp_replace(v_texto, '\s+(i|ii|iii|iv|v|vi|vii|viii|ix|x)$', '', 'g')
-- paso 4: deja [a-z0-9áéíóúñü]
```

### 3.1 · 🔴 El paso 2 no está anclado y borra DENTRO de las palabras

```
'Torres Zen'  →  'szen'
```
`torre` matchea dentro de `Torres`, se borra, y queda la `s` huérfana pegada a `zen`. **El nombre
queda destruido.** Cualquier ficha cuyo nombre contenga esas ocho palabras como parte de otra sufre
lo mismo.

### 3.2 · 🔴 El prefijo es a veces el ÚNICO discriminante, y se borra igual

```
'Torre Baruc Norte'     →  'barucnorte'
'Edificio Baruc Norte'  →  'barucnorte'
```
Son **dos edificios reales a 1.134 m**. El matcher los ve idénticos. Esto no lo arregla ningún alias:
está en los nombres oficiales.

### 3.3 · 🔴 Los romanos se borran, los arábigos no

```
'Barcelona III'  →  'barcelona'      ← el numeral desaparece
'Barcelona 3'    →  'barcelona3'     ← el numeral sobrevive
```
**El mismo edificio normaliza distinto según cómo el captador escriba el numeral.** Esto contradice
lo que el spec del lector asume (*"el matcher normaliza romano↔arábigo"*,
`READER_SPEC_ALQUILER.md`): no lo hace — borra uno y conserva el otro.

---

## 4 · Fichas sin props: 🔴 **la lectura de esta sección era EQUIVOCADA** (corregida 28-ago)

Fichas activas del catálogo que **nunca tuvieron una sola propiedad**, o que quedaron sin ninguna:

| pm | nombre | zona | props vivas | props históricas |
|---|---|---|---:|---:|
| **73** | Domus Luxury | Equipetrol Centro | 0 | **0** |
| **35** | Edificio Uptown Equipetrol | Equipetrol Oeste | 0 | — |
| 156 | Condominio Portofino | *Sin zona* | **0 (hoy)** | 2, las dos mal matcheadas |

### 🔴 El pm 73 NO es el perfil del pm 156 — verificado el 28-ago-2026

Esta sección decía que el pm 73 era "el más sospechoso" y proponía decidir si era duplicado del 356.
**Está mal, y borrarlo o fusionarlo habría sido un error.** Lo que faltó mirar:

- El pm 73 **tiene desarrollador cargado**: `Alborada Group Bolivia`, el mismo de Domus Deluxe (312),
  Domus Infinity (18), Domus Insignia (19) y Domus Tower (84) — todas con props.
- En esa familia hay **otras dos fichas con 0 props**: **Domus Black (571)** y **Domus Gold (572)**.
- 👉 Son fichas cargadas **desde el material del desarrollador**, no derivadas de avisos. Una ficha así
  nace vacía por diseño y se llena cuando el edificio se publica. *(Detalle: 571 y 572 tienen el campo
  `desarrollador` en NULL — la familia se ve por el nombre, no por ese campo. Si alguna vez se usa
  `desarrollador` como señal, esas dos no la llevan.)*

🔑 **La lección de método:** "ficha activa sin props" se leyó como anomalía sin preguntar **de dónde
salió la ficha**. Dos orígenes distintos producen el mismo síntoma: el catálogo del desarrollador
(vacío legítimo, a la espera) y el mal matcheo histórico (vacío porque nunca acertó). El pm 156 era
el segundo; el pm 73 es el primero. **El discriminante es el desarrollador y la familia, no el conteo.**

### El problema real del pm 73 (que sí existe, y es otro)

```
buscar_proyecto_fuzzy('Domus Luxury')
  → pm  73  "Domus Luxury"  [Equipetrol]   1.000   ← sale PRIMERO, y tiene 0 props
  → pm 356  "DOMUS LUXURY"  [Zona Norte]   1.000   ← es el que corresponde, tiene 8
```
Empate perfecto a 2.375 m y en **macrozonas distintas**; el desempate cae en el id de ficha más bajo.
**Hoy no hay daño** —las 8 props están bien colgadas del 356— y lo que las salva es el **discriminador
de distancia, que actúa DESPUÉS del fuzzy**. Nada avisa de que esa sea la única red.

👉 Eso es lo que motivó la **superficie 11 del audit** (mig 345), §5 fila 2.

---

## 5 · Qué hacer, en orden de rentabilidad

| # | acción | esfuerzo | por qué |
|---|---|---|---|
| 1 | ~~Anclar el paso 2 al inicio~~ | — | 🔴 **MEDIDO Y DESCARTADO el 27-ago — ver §6.** Arregla los nombres mutilados pero **no cambia un solo match**, y NO separa los dos Baruc Norte como se afirmaba acá (los dos tienen prefijo al inicio y los dos lo pierden igual) |
| 2 | ✅ **Superficie 11 del audit: colisiones de catálogo** | chico | **HECHA el 28-ago** — mig 345 (`v_colisiones_catalogo`) + superficie 11 de `/audit-cola-shadow`. Determinística, sin juez. Reporta **8 pares** y silencia 9 vecinas declarándolas; marca 🆕 los que el audit nunca vio |
| 3 | ~~Revisar el pm 73 (Domus Luxury)~~ | — | ✅ **REVISADO el 28-ago — NO se toca.** Es ficha de desarrollador, no duplicado. Ver §4 |
| 4 | **Unificar romano↔arábigo** en el paso 3 | medio | Hace lo que el spec ya asume. **Necesita medición previa**: toca todos los nombres |
| 5 | Barrido de alias intrusos | chico | Hoy da 0. Vale como red, no como cola |

🔴 **Lo que NO haría sin medición aparte:** cambiar el paso 3 (numerales) o quitar el borrado de
prefijos por completo. Cualquiera de los dos **mueve el matching entero**, y esta semana ya hubo
**tres casos** en que una medición incompleta dio un número creíble y falso —"19 edificios sin zona"
que era 1, "el prep recupera 50 props" que eran 2, "37 rescates sin regresiones" que tenía una
regresión—. El patrón siempre fue el mismo: **medir con una réplica de la lógica en vez de con la
lógica real**. Para tocar `normalize_nombre` hay que comparar llamando a la función viva, sobre los
438 nombres reales, antes y después.

---

## Anexo · las queries de este informe

```sql
-- alias intruso: un alias que es el nombre oficial de OTRA ficha
SELECT a.id_proyecto_master, a.nombre_oficial, al AS alias_intruso,
       b.id_proyecto_master AS dueño_del_nombre, b.nombre_oficial
FROM proyectos_master a
CROSS JOIN LATERAL unnest(a.alias_conocidos) AS al
JOIN proyectos_master b ON b.id_proyecto_master <> a.id_proyecto_master
     AND lower(btrim(b.nombre_oficial)) = lower(btrim(al))
WHERE a.activo AND b.activo;

-- colisiones de normalización: fichas que el matcher no puede distinguir
SELECT normalize_nombre(nombre_oficial) AS normalizado, COUNT(*) AS fichas,
       string_agg(id_proyecto_master::text||' '||nombre_oficial, '  |  ') AS cuales
FROM proyectos_master WHERE activo
GROUP BY 1 HAVING COUNT(*) > 1 ORDER BY 2 DESC;

-- fichas fantasma: activas y sin una sola propiedad en la historia
SELECT pm.id_proyecto_master, pm.nombre_oficial, pm.zona
FROM proyectos_master pm WHERE pm.activo
  AND NOT EXISTS (SELECT 1 FROM propiedades_v2 p WHERE p.id_proyecto_master = pm.id_proyecto_master);
```


---

# 6 · MEDIDO Y DESCARTADO — el arreglo de `normalize_nombre` no se hace (27-ago-2026)

> **Decisión del founder, con la medición en la mano:** *"si trae más problemas que beneficios,
> mejor borrarlo y quitarlo del backlog, o ver cómo arreglarlo mejor, pero no ahora."*

## Cómo se midió (el método que faltaba)

Se creó un **banco de prueba**: `normalize_nombre_v2` y `buscar_proyecto_fuzzy_v2`, funciones nuevas
al lado de las vivas. **Ninguna función del sistema las llamaba**, así que el matcher, el cargador y
el audit siguieron intactos durante toda la prueba.

🔑 **Por qué así y no como antes:** las tres mediciones fallidas de esta semana compararon una
*réplica en SQL* de la lógica contra la función real, e inventaron diferencias que no existían.
Acá se compararon **dos funciones reales** corriendo en la misma base, sobre los **431 nombres de
edificio vivos**. Es la diferencia entre medir y suponer.

## Resultado

| | |
|---|---|
| Nombres evaluados | **431** |
| **Cambian de ganador** | **0** |
| Mejoras | 0 |
| Regresiones | 0 |
| Colisiones resueltas | **0** — siguen los 11 grupos / 25 fichas |

**El cambio no arregla nada medible y tampoco rompe nada.**

## Por qué el cero, que es lo interesante

El bug de normalización **no cambia ningún ganador hoy porque la rama `alias_exacto` compara texto
CRUDO, sin pasar por el normalizador**. Los nombres mutilados se comparan contra sí mismos y la
mutilación se cancela:

```
aviso 'Torres Zen'          → szen        ficha 'Torre Zen' gana por alias_exacto (crudo) → igual
aviso 'Condominio 3 Torres' → 3s          ficha idem → 3s = 3s = similitud 1.000        → igual
```

Los 15 nombres mutilados del catálogo (`3s`, `sevolution`, `szen`, `sgemelas`,
`magnumsequipetrol`…) están **tapados por los alias ya cargados**.

## Y dos cosas que la prueba encontró en contra

1. **La v1 del arreglo introdujo una regresión.** Anclar el prefijo *una sola vez* rompía el match
   entre la ficha *"Edificio Torre Chiquitana"* y el aviso *"Torre Chiquitana"*: el ancla borraba
   un prefijo y quedaba `torrechiquitana` ≠ `chiquitana`. Se corrigió con `+` (repetición), pero
   **apareció solo porque el banco existía**.
2. **Cambia los candidatos SECUNDARIOS que ve el juez.** Para "Torres Zen" la versión nueva ofrece
   *Torres Soho* y *Torres Isuto*, que la vieja no mostraba. Es ruido nuevo en la cola del audit —
   chico, pero real, y sin beneficio que lo compense.

## Qué queda anotado, para no re-abrirlo a ciegas

- **El bug existe y está documentado** (§3): el paso 2 borra prefijos dentro de las palabras, el
  prefijo es a veces el único discriminante, y los romanos se borran mientras los arábigos no.
- **Pero es inofensivo mientras el catálogo tenga los alias cargados.** El día que eso deje de ser
  cierto —un edificio nuevo sin alias, con un nombre que contenga "torre"/"condominio"/"residencia"
  en el medio— vuelve a importar.
- **El problema real sigue siendo otro:** las **11 colisiones** (§2), que este cambio NO toca. Ahí
  la causa es el borrado de numerales, y arreglarlo mueve el matching entero.
- 🔑 **Si alguien retoma esto:** el camino no es tocar `normalize_nombre`, es **preservar el numeral**
  — y eso exige el mismo banco de prueba, porque el efecto se mide en los 11 grupos, no en los 431
  nombres.

**Banco de prueba borrado** (`DROP FUNCTION buscar_proyecto_fuzzy_v2`, `normalize_nombre_v2`).
Nada del sistema lo llamó nunca.
