# Plan — las señales del lector que no mira nadie

**22-ago-2026.** Salió del caso `8001019`: un aviso de un condominio a 13 km de Equipetrol entró
al inventario y quedó fijando el piso del panorama del bot en 1.800 Bs. Lo encontró **lab-kapso
mirando el feed**, no nosotros — y el sistema tenía dos señales para detectarlo, las dos guardadas
en la base y ninguna conectada a nada.

---

## Lo medido (21-22 ago, Equipetrol)

**1. El nombre del edificio está en el aviso y no lo leemos.**

| | |
|---|---|
| alquileres activos | 195 |
| sin `nombre_edificio` | **30** (15%) |
| de esos, en C21 | 25 |
| **traen algo en `direccionFormat`** | **19 de 25** |
| de esos, nombre de edificio real | ~10 (*Macororo V · Sky Madero · Condominio Solo 206 · Speranto · One Soul · Stratto Up · Nano Tec · Baruc Dos · Eurodesign Leblanc*) |

Verificado: `grep direccionFormat` sobre `scripts/deptos-equipetrol/lib/` **no devuelve nada**.
El campo llega en el JSON del portal y se descarta.

**2. La confianza del lector se guarda y no se consume.**

| | activas | dudosas (media/baja) | las ve la sup. 4 | **nadie las ve** |
|---|---|---|---|---|
| alquiler | 345 | 63 | 32 | **31** |
| venta | 789 | 97 | 78 | **19** |

**50 propiedades activas** donde el lector dijo "no estoy seguro" y la frase cayó al vacío.
🔑 **En alquiler se pierde la MITAD** (31 de 63) contra 1 de cada 5 en venta: menos nombres →
menos matches → y la superficie 4 exige match.

Las 2 con confianza `baja` sin match hoy: `8000934` (4.800 Bs · 36 m²) y `8001021` (7.200 Bs ·
55 m², el aviso se titula literalmente *"alquiler"*). Las dos **caras** para su tamaño — el patrón
no es "las dudosas son baratas", es que nadie fue a confirmarlas.

⚠️ 125 alquileres y 569 ventas activas **no tienen dato de confianza**: son anteriores al 29-jul,
cuando se empezó a guardar. Para esas la señal no existe, no es que se pierda.

**3. Por qué las dos se encadenan.** `auditar-matching-shadow.mjs:441` exige
`id_proyecto_master != null && metodo === 'lector_fijo'`. Sin nombre no hay match, sin match no
hay superficie. La 8001019 disparó las dos: `metodo_match = 'sin_nombre'` y
`confianza_lector = 'baja'`.

---

## Pieza B — ✅ HECHA (22-ago) — la superficie 4b

Implementada en `auditar-matching-shadow.mjs` y **corrida en las 4 combinaciones**:

| | alquiler | venta |
|---|---|---|
| Equipetrol | **7** (2 con `baja`) | **8** |
| Zona Norte | **31** | **11** |

Ordena `baja` antes que `media`, avisa el backlog cuando pasa de 15, y el JSON trae los items
completos con `descripcion_anuncio` para que el juez pueda leer sin volver al portal.

⚠️ **Los conteos por macrozona se midieron CORRIENDO el audit, no con una query.** Una query con
`JOIN zonas_geograficas` los infla: Equipetrol tiene **7 polígonos para 6 nombres**, así que las
props de un nombre repetido salen dos veces. Mi primera medición daba 10 donde había 7, y los ids
duplicados lo delataron.

### El plan original de esta pieza (referencia)

Va primero porque es **read-only sobre el audit**: no toca la captura ni la base, se prueba en una
corrida y se revierte borrando un `else if`.

- Partir la superficie 4 en dos ramas:
  - **4a** (la de hoy): el lector fijó el pm con confianza no-alta.
  - **4b** (nueva): **confianza no-alta y SIN match** — hoy invisibles.
- Ordenar 4b por señal, no por id: primero las que además tienen `$/m²` fuera de rango.
- Respetar `campos_bloqueados` como el resto, y el tag `confirmado_por` para no re-abrir lo ya
  juzgado (el mecanismo ya existe: `supConfirmadas`).

🔴 **La primera corrida trae 50 de golpe** — es un backlog acumulado, no la tasa nocturna.
Declararlo en el log con esas palabras, o se va a leer como que el sistema se rompió. Después de
drenarlo quedan las que entren cada noche.

**Qué habría pasado con la 8001019:** aparecía la primera noche.

---

## Pieza A — que el reader capture el nombre desde `direccionFormat`

- Dónde: el fetcher de detalle de C21 (`lib/detalle-deptos.mjs`).
- Qué: la primera parte de `direccionFormat` (antes de la primera coma).

🔴 **NO guardarlo en `nombre_edificio` de entrada.** Medido: `Jazmines Nro 427` devuelve **1
candidato** en `buscar_proyecto_fuzzy`, y los 2 PM "Jazmines" están a 4,7 km — un nombre falso
produce un match falso, que es **peor** que no tener nombre. El campo trae mezclado:

```
nombre real   → "Macororo V" · "Condominio Solo 206" · "STRATTO UP"
solo la zona  → "Equipetrol" · "Zona Equipetrol" · "equipetrol sirari"
una dirección → "Jazmines Nro 427 427" · "Equipetrol Calle 7 este s/n"
```

- **Guardarlo como candidato en `datos_json`** (p. ej. `trazabilidad.nombre_en_direccion`), sin
  autoridad sobre el matching. El audit lo muestra; el matcher no lo usa.
- Recién con la primera tanda medida —cuántos matchean bien y cuántos son zona/calle— se decide
  si asciende a `nombre_edificio`.
- 🔑 **El filtro de ruido ya existe**: `NOMBRES_NO_EDIFICIO` en `auditar-matching-shadow.mjs:192`,
  con `esNombreNoEdificio()`. Pero es una **lista de casos juzgados uno por uno** (con fecha y
  razón), no un patrón — "Equipetrol" y "Zona Equipetrol" **no están** y habría que agregarlos.
  Ver `feedback_matching_token_calle_no_edificio`.

**Qué habría pasado con la 8001019:** `Estrella del Este` → **0 candidatos** en el fuzzy → cola de
matching → **superficie 1**, que ya existe. No hace falta inventar una alarma: hace falta darle de
comer la que ya tiene.

---

## Lo que NO hay que hacer, y está medido

- **No usar el precio como alarma.** De los 4 alquileres bajo la mitad de la mediana de `Bs/m²`,
  **3 son departamentos grandes y baratos legítimos** — el `$/m²` baja con la superficie. Un
  filtro de outliers habría escondido la 8001019 en vez de mostrarla.
- **No usar la zona que declara el portal.** Tiene dos campos y ninguno es confiable:
  `municipio` es el distrito de la ciudad y `a2Municipio` el barrio, pero *Sky Lumiere* (Eq.
  Norte) dice `municipio: "Oeste"` y *Atrium* (Eq. Centro) dice `a2Municipio: "Oeste"`. Un barrido
  de "zona SICI vs zona del aviso" marcó **3 de 12 propiedades legítimas**. No es una red, es un
  generador de falsos positivos. **Esto ya casi nos hace sacar del feed una propiedad correcta.**
- **No usar el GPS.** Es justamente lo que miente: `get_zona_by_gps` sobre el pin de la 8001019
  devuelve *Equipetrol Centro*, a 400 m del centro. Y de 1.135 activas, solo 5 tienen zona
  distinta de la de su GPS.

👉 La única señal que sirvió fue **lo que el aviso dice de sí mismo** (el nombre) y **lo que el
lector dijo de su propia lectura** (la confianza). Las dos ya existen; lo que falta es escucharlas.

---

## Estado

- `sql/fixes/ANULADO_2026-08-22_8001019_NO_APLICAR.sql` — el primer intento de fix, anulado: su
  fundamento (la zona del título) resultó falso. Se conserva como registro.
- La 8001019 **está fuera del feed** y corresponde que lo esté: el founder ubicó el condominio
  (*Estrella del Este I/II*, a **13,17 km** del pin; `get_zona_by_gps` sobre las coordenadas
  reales devuelve **NULL** = fuera de cobertura). ⚠️ Pendiente menor: la `razon_inactiva` dice
  "zona Este" (el distrito) cuando el motivo real es la distancia.
- Precio: **no hubo error de normalización**. `tipo_cambio_detectado = 'bob'`, moneda del portal
  BOB, `depende_de_tc = false`. El aviso muestra "259 USD" porque **C21 divide los 1.800 Bs por
  6,96** (`precio: 258.62`, `precioFormat: "259 USD"`). Queda la duda de si el propietario pide
  1.800 Bs o 259 USD reales (~3.000 Bs al paralelo): eso solo lo cierra el captador.
