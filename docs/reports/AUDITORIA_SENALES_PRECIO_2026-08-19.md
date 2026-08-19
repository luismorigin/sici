# Auditoría de señales de precio en el feed de venta — 19-ago-2026

**Por qué se hizo:** el founder notó que la propiedad `#8000862` (Stone 7, ZN) muestra $72.000
cuando su aviso dice *"USD 72.000 · Tipo de cambio: Bs. 7"*, y preguntó por qué no se normaliza.
La respuesta corta es que **así se decidió el 28-jul** (mig 311). La respuesta larga destapó que
**el sistema tiene dos defensas contra precios dudosos y hoy funciona una sola**.

Universo: **761 avisos** activos del feed de venta — 386 Equipetrol + 375 Zona Norte.
Fuente: `v_mercado_venta_shadow` (la tabla viva) al 19-ago-2026.

---

## 1. El hallazgo estructural: el criterio de comparación está mudo

`buscar_unidades_simple_shadow` enciende el badge "Confirmar tipo de cambio" por **dos** vías:

| | qué mira | marca hoy |
|---|---|---|
| **A** — mig 311 | el **texto**: el aviso menciona TC 7 / 6.96 | 28 Eq · 72 ZN |
| **B** — mig 227 | la **comparación**: $/m² más de 28% bajo su grupo | **0** · **0** |

**B no marca nada porque no puede.** Su mediana de referencia se calcula así:

```sql
WHERE v.tipo_cambio_detectado IN ('paralelo', 'oficial')
```

y **el tag `'oficial'` dejó de existir** al pasar al régimen nuevo (hoy los tags son
`no_especificado`, `paralelo`, `oficial_viejo`, `bob`). La referencia se arma con **70 avisos de
761** y, con el mínimo de 3 por grupo, sólo **7 de 39 grupos** llegan a tener mediana. Resultado:
**537 avisos no tienen contra qué compararse** y el criterio marca cero.

🔑 **No dio error: dejó de mirar.** Es el mismo modo de falla que la regla 9 del proyecto describe
— una lista blanca que envejece con un cambio hecho en otra parte.

## 2. Cuántos casos hay

Categorías **no excluyentes**, sobre los 761 avisos:

| | qué es | Equipetrol | Zona Norte | total | ¿se ve hoy? |
|---|---|---|---|---|---|
| 1 | menciona TC 7 / 6.96 | 28 | 72 | **100** | ✅ badge |
| 2 | precio publicado en bolivianos | 17 | 29 | 46 | se convierte, ok |
| 3 | **barato atípico** (>28% bajo su grupo) | 10 | 20 | **30** | ❌ |
| 4 | **caro atípico** (>40% sobre su grupo) | 7 | 7 | **14** | ❌ |
| 5 | ~~área incoherente con los dormitorios~~ | ~~4~~ | ~~4~~ | **0** | 🟡 **falso positivo — ver §6** |
| 6 | sin referencia para comparar (grupo < 3) | 22 | 85 | 107 | no evaluable |

**Con al menos un problema: 135 avisos (17,7%)** — 43 en Equipetrol y **92 en Zona Norte**. De esos,
**100 se avisan hoy y 35 son invisibles**. *(Corregido: la categoría 5 se revisó aviso por aviso y
no era un problema — §6.)*

⚠️ Zona Norte tiene **el doble de tasa de problemas** que Equipetrol, y **85 de sus avisos** ni
siquiera tienen grupo comparable (contra 22 de Equipetrol): su inventario está más disperso.

## 3. El sesgo por tipo de aviso — dos direcciones opuestas

Ratio del $/m² de cada aviso contra la mediana de su grupo (zona × dormitorios × estado):

| tag del aviso | ratio promedio | baratos atípicos | caros atípicos |
|---|---|---|---|
| `no_especificado` | **1,008** ← neutro | 15 de 486 | 5 |
| `bob` (en bolivianos) | **0,886** ← −11% | **12 de 40 (30%)** | 0 |
| `paralelo` | 1,034 | 2 de 63 | 3 |
| `oficial_viejo` (TC 7) | **1,148** ← +15% | 1 | 6 de 65 |

Los avisos que **no declaran nada** son perfectamente neutros. Los dos grupos que **sí declaran**
una moneda o un tipo de cambio se van para lados opuestos: los que cotizan en bolivianos quedan
11% abajo, los que mencionan el TC viejo quedan 15% arriba.

🔴 **Esto contradice la evidencia que fundó la mig 311.** El 28-jul se midió que los "TC 7" valían
igual que sus vecinas del mismo edificio (**+3,7%**). Rehecho hoy: **+19% en Equipetrol y +20% en
Zona Norte**. La decisión sigue siendo mejor que descontar (descontar los deja 28% *por debajo*),
pero **el argumento que la sostenía envejeció en tres semanas y nadie lo estaba mirando**.

Diferencia entre zonas que importa: en Equipetrol los "TC 7" llevan **144 días** en el mercado
contra 78 del resto — son avisos viejos sin actualizar, y eso explica el sobreprecio. En Zona Norte
llevan **80 días contra 82**: son igual de recientes y están 20% arriba igual. **Ahí la explicación
de "aviso viejo" no alcanza.**

## 4. Por qué reparar el criterio B, solo, sería un error

Con la referencia corregida (`<> 'oficial_viejo'` en vez de la lista blanca vieja), B marcaría
**15 avisos**. Pero de esos 15:

- **2** tienen firma de conversión desde bolivianos
- **2** tienen el área **inflada por superficie descubierta** incluida en el total (§6)
- **11** tienen **precio redondo en dólares** ($40.000, $75.000, $100.000) → el vendedor pensó en
  dólares; no hay problema de moneda

Encender ahí un badge que dice **"Confirmar tipo de cambio"** sería **afirmar una causa falsa en 13
de 15 casos**. El criterio B no detecta "tipo de cambio dudoso": detecta **"precio atípico"**, que
puede venir del área mal leída, de un dato viejo o de un precio realmente bajo.

Casos ilustrativos:

| id | edificio | qué dice | qué pasa |
|---|---|---|---|
| `2000` | Condominio Disart (ZN) | dúplex 1 dorm · 140 m² · $126.500 | el área **incluye patio** (§6) |
| `3451` | Natalia 2 (ZN) | 1 dorm · 100 m² · $100.000 | ídem: 30 m² son patio |
| `2335` | (sin edificio, ZN) | 3 dorm · 130 m² · $59.000 = **$454/m²** | 59% bajo su grupo |
| `8000714` | Edificio Jana (Sirari) | 2 dorm · 86 m² · $87.000 = $1.012/m² | 44% bajo su grupo |
| `2833` | Green Tower (Eq) | 1 dorm · 70 m² · $206.000 = **$2.929/m²** | 55% **sobre** su grupo |

## 5. Lo que queda para decidir

1. **La referencia rota es un bug sin discusión** — una línea de SQL. Pero encender el badge de TC
   con ella miente en 13 de 15 casos.
2. **Nadie mira hacia arriba.** Los 14 "caros atípicos" no los señala ningún criterio, y son los
   que más le cuestan a quien compra.
3. ~~Las 8 áreas incoherentes son un bug de dato~~ → **eran un falso positivo mío (§6)**. Lo real es
   la **superficie descubierta incluida en el área**: 13 casos separables, 163 que la mencionan sin
   metraje. Contamina el `$/m²` y todas las medianas que salen de él.
4. **El texto "T.C. oficial"** aparece hardcodeado en 4 lugares del feed de venta, en las 386
   propiedades, afirmando algo que nadie verifica. En un aviso con TC 7 la card llega a decir
   *"Confirmar tipo de cambio"* y *"T.C. oficial"* **a la vez**.
5. **La evidencia de la mig 311 hay que re-medirla periódicamente** — cambió de +3,7% a +20% en tres
   semanas. Candidata a superficie nueva de `/audit-cola-shadow`.

## Bug aparte, encontrado en este barrido

`simon-mvp/src/pages/api/broker/shortlists/[id].ts:62` llama `buscar_unidades_simple` **sin** el
helper `rpcShadowFirst`. Esa función usa `precio_normalizado()` — la **fórmula vieja** — y desde el
TIEMPO 2 **lee la tabla viva**: los precios del preview de shortlists salen **inflados ~47%**.
Los demás llamadores del repo usan `rpcShadowFirst` y están bien. Arreglo: una línea.


---

## 6. La categoría 5 era un falso positivo — los 8 avisos están bien

Se revisaron **los 8 uno por uno contra el texto del aviso**. Los 8 dicen exactamente lo que
guardamos:

| id | lo que dice el aviso |
|---|---|
| `2000` Condominio Disart | *"DÚPLEX DE 1 DORMITORIO **140 mts2**"* |
| `2670` Magnum | *"1 dormitorio en suite · Superficie: **108,87 m²** interiores + 28 m² de patio"* |
| `8000754` HH Chuubi | *"departamento de 1 dormitorio, modelo 1D-G CT · Superficie: **103,08 m2**"* |
| `3451` Natalia 2 | *"1 dormitorio · **100 m²** · patio privado de aproximadamente 30 m²"* |
| `2129` Torre Moderna | *"Departamento de **94.47mt2** · consta de **1 dorm.** · patio cerrado"* |
| `2367` | *"DEPARTAMENTO DE UN DORMITORIO EN PRE VENTA · 1 Dormitorio en suite"* |
| `1728` / `8000799` | *"DEPARTAMENTO DE LUJO ÚNICO EN EL EDIFICIO · Más de 121 m²"* |

🔑 **El criterio "1 dormitorio con ≥90 m² es incoherente" fue inventado para esta auditoría y no se
validó contra un solo aviso antes de contarlo como problema.** Existe un segmento real que el umbral
no contemplaba: **1 dormitorio grande** — dúplex, en suite, con patio o terraza privada. Es la regla
9 del proyecto aplicada a mí mismo: el instrumento (un umbral arbitrario) no podía ver esa clase de
objeto, y su resultado "se sintió" como un hallazgo.

### Lo que sí apareció al releerlos: la superficie descubierta

En varios de esos avisos **el área total incluye patio o terraza**, y el `$/m²` se calcula sobre el
total. Eso hace ver barato un departamento que no lo es:

> `3451` Natalia 2 — $100.000 / **100 m²** = **$1.000/m²** (46% bajo su grupo).
> Pero el aviso dice *"patio privado de aproximadamente 30 m²"*: sobre los ~70 m² cubiertos son
> **$1.428/m²**, que es la mediana de su zona. **No estaba barato: estaba mal comparado.**

Dimensión del fenómeno, medida sobre los 765 avisos con descripción guardada:

| | Equipetrol | Zona Norte |
|---|---|---|
| declara superficie descubierta **con metraje** (separable hoy) | 10 | 3 |
| menciona patio/terraza **sin metraje** (no separable) | 93 | 70 |

**13 casos** se podrían separar leyendo el aviso; **163** mencionan superficie descubierta sin decir
cuánta. No es un bug de captura: es una **ambigüedad del propio anuncio**, y afecta a la métrica más
usada del feed (`$/m²`) y a todas las medianas que salen de ella.

### ✅ DECIDIDO (19-ago): no se hace nada. Medido, no opinado.

Se evaluó declarar la superficie descubierta en el detalle. **Se descartó por dos razones, las dos
medidas:**

**1. Detectarla con un patrón de texto falla en 6 de 13 (46%).** En Equipetrol hay un lugar que se
llama **Patio Design** y varios avisos dicen *"frente a Patio Design"*; otros nombran un *"Jardín
Zen"* que es una amenidad. El patrón agarra el metraje que viene después — que es **la superficie
del departamento**, no la del patio. También confunde el total con la parte: en `8000114`
(*"81,1 M2 internos + 21,86 de patio (Total 102,96)"*) captura 102,96.
👉 Distinguir *"frente a Patio Design"* de *"patio privado de 30 m²"* requiere **leer**, no
matchear. Un regex no va a poder nunca.

**2. Corregir los 7 casos que sí son reales mueve la mediana $4/m²:**

| | mediana hoy | corregida |
|---|---|---|
| Equipetrol | $1.684/m² | $1.688/m² |
| Zona Norte | $1.395/m² | $1.399/m² |

**0,25%.** Menos que el redondeo con el que se presenta cualquier cifra.

**3. La alternativa "que lo lea el reader" se evaluó y se descartó por riesgo.** El `READER_SPEC`
gobierna las 4 capturas nocturnas de las dos zonas; cada campo nuevo compite por la atención del
lector y puede degradar los que hoy salen bien; el proyecto ya aprendió que **un ejemplo en el spec
pesa como regla** ([[feedback_ejemplo_en_spec_pesa_como_regla]]); y no hay forma de probarlo de a
poco — entra esa noche para todo. **Costo alto y no acotable, beneficio 0,25%.**

👉 Si alguna vez el spec se toca por otra razón, sumar `superficie_descubierta_m2` de arrastre. Solo.


---

## 7. El cron del Advisor — pausado el 19-ago

Al barrer las funciones del régimen viejo apareció que **`generate_advisor_snapshot()` corría todos
los días a las 9:15 vía `pg_cron`** y llamaba a `buscar_unidades_reales()` — una de las que este
informe daba por **sin llamadores**.

🔑 **Tres puntos ciegos encadenados, todos del mismo tipo:**
1. El `grep` del repo `sici` no ve **pg_cron** — el job vive dentro de la base. Y
   `claude_readonly` **no tiene permiso sobre el schema `cron`**: ese ángulo siempre necesita al
   founder. Lo destapó él pegando la salida de `SELECT * FROM cron.job`.
2. El `grep` del repo `sici` tampoco ve **el repo de al lado**. La tabla
   `advisor_property_snapshot` la lee **`simon-advisor`** (repo y deploy propios, comparte base).
   Afirmé "no la lee nadie" habiendo buscado en un solo repositorio.
3. Renombrar `buscar_unidades_reales` a `_trash_` —lo que este informe proponía— **habría roto ese
   cron esa misma noche**, y el modo de falla es silencioso: el Advisor no muestra error, cae a
   calcular en vivo.

**Lo que hacía mal**: servía precios de la **fórmula vieja sobre la tabla viva** y los comparaba
contra medianas de `v_mercado_venta`, la vista pegada al **archivo congelado el 27-jul**. Dos
épocas en la misma fila.

**Estado de su serie** (`advisor_property_snapshot`, 120 días desde el 16-abr):

| tramo | filas/día | mediana $/m² |
|---|---|---|
| hasta el 11-ago | 426 | $1.865 ← el tramo bueno |
| 12 → 17-ago | **ninguna** | el cron falló 6 días, nadie se enteró |
| 18 → 19-ago | ~550 | $1.619 ← −13%, cambio de fuente, no de mercado |

**Decisión del founder: pausar, no descartar.** El Advisor es un piloto que puede retomarse.
Se corrió `SELECT cron.unschedule('advisor-snapshot-diario')` → `true`. La tabla, la función, el
repo y el deploy quedan intactos. Desagendar **protege** la serie: cada corrida nueva la ensuciaba.

👉 Instrucciones para retomarlo: **`simon-advisor/RETOMAR_ADVISOR.md`** (en el otro repo).

Con esto `buscar_unidades_reales` queda **sin llamadores vivos** y entra en la limpieza junto a las
otras cuatro.
