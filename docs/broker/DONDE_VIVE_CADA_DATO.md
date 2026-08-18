# Dónde vive cada dato del ACM

**Leer esto ANTES de escribir una query.** No es documentación de consulta: es la lista de
los lugares donde yo ya busqué mal, con lo que pasó cada vez.

Todos los errores que evita esta tabla tuvieron el mismo síntoma: **ninguno falló**.
Devolvieron un dato vacío o incompleto, el documento lo mostró como si fuera cierto, y
el que lo encontró fue el founder. Buscar en el lugar equivocado no da error — da un
número creíble y falso.

---

## La regla, antes que la tabla

> **Si una pantalla de Simón ya muestra ese dato, mirá de dónde lo saca ella.**

El feed muestra fotos todos los días. Bastaba con leer su RPC (`buscar_unidades_simple_shadow`)
para saber dónde estaban. En cambio busqué en dos lugares plausibles, no encontré nada,
y construí una solución propia contra una tabla de snapshots que cubría el 58%.

Dos minutos de leer código ajeno contra medio día de construir el camino equivocado.

---

## La tabla

| Dato | Dónde vive | Dónde NO (y qué pasa) |
|---|---|---|
| **Precio** | `v_mercado_venta_shadow.precio_norm` | 🔴 `propiedades_v2.precio_norm` **no existe** — la calcula la vista. Pedirla rompe la query entera, y sin mirar `error` el resultado se lee como "no se encontró". <br>🔴 `precio_usd` es el crudo: nunca para comparar ni mostrar (regla 1 de CLAUDE.md). |
| **Fotos** | `datos_json->'contenido'->'fotos_urls'` — la misma fuente que el feed | 🔴 `datos_json->'fotos_urls'` y `datos_json_discovery->'imagenes'`: **vacíos**, 0 de 393. <br>🔴 `advisor_property_snapshot`: solo cubre 213 de 393 (54%). Yo lo usé y perdí 180 fotos. |
| **Fecha de entrega** | `proyectos_master.fecha_entrega` — 88 avisos | 🔴 `advisor_property_snapshot.fecha_entrega`: **11 avisos**. Ocho veces menos, y el campo se llama igual. |
| **Amenidades** | `proyectos_master.amenidades_edificio` (array de texto, 80 distintas) | 🔴 No está en la vista de mercado. <br>⚠️ Lista vacía = **no la tenemos cargada**, NO "el edificio no tiene". Pasa en el 38%. |
| **Estado de obra** | `v_estado_obra_inferido_shadow` (`estado_efectivo` + `estado_origen`) | 🔴 `estado_construccion` crudo deja **la mitad sin declarar**. <br>🔴 El enum dice **`entrega_inmediata`**, no `entregado`. Escribirlo mal no rompe nada: deja a todos en "sin declarar". <br>🔴 `estado_origen` tiene **cinco** valores, no dos (mig 315): `verificado` · `conflicto_resuelto` · `aviso` · `vecinos` · `alquiler`. Tratar solo dos deja 27 avisos sin declarar su origen. |
| **Identidad del edificio** | `id_proyecto_master` | 🔴 **`nombre_edificio` NO identifica**: 21 de 126 edificios tienen dos o tres nombres ("Condominio Maré / Mare / Maré"), y eso parte el 25% de los avisos en edificios fantasma. |
| **Nombre para mostrar** | `proyectos_master.nombre_oficial` | ⚠️ El del aviso es una variante. El filtro del feed (`?edificio=`) busca por nombre oficial **y** por `alias_conocidos`, sin acentos. |
| **Microzona** | `v_mercado_venta_shadow.microzona`, + rescate: si otro aviso del mismo edificio la tiene, vale para todos (257 → 348) | ⚠️ `get_zona_by_gps()` devuelve **solo zona**, no microzona. Pedirle microzona no falla: devuelve null. |
| **Baños, piso, parqueo, amoblado** | Están en la vista: `banos` (95%), `piso` (47%), `parqueo_incluido` + `estacionamientos`, `amoblado` (0% en venta) | ⚠️ "sin declarar" nunca es "no tiene". El 45% no dice si incluye parqueo, y ese grupo no se parece ni a los que dicen sí ni a los que dicen no. |
| **Días publicado** | `dias_en_mercado` de la vista | 🔴 Nunca `fecha_discovery`: se pisa con `NOW()` cada noche (regla 11 de CLAUDE.md). |
| **URL del aviso** | `url` de la vista. Para matchear, **el código**: C21 `/propiedad/<código>_slug`, Remax `...-<código>` | 🔴 La URL completa no sirve de clave: C21 **reescribe el slug** cuando editan el aviso. El código es único y sobrevive. |

---

## El estado de obra tiene un orden de precedencia (mig 315)

No es "lo que dice el aviso". Se resuelve así, y el ACM tiene que **declarar de cuál salió**:

| Origen | Regla | En el documento |
|---|---|---|
| `verificado` | alguien lo comprobó contra el edificio. 🔴 **Asimétrico**: "entregado" vale para siempre, "en pozo" solo 365 días | badge verde `verificado` |
| `conflicto_resuelto` | el edificio tiene avisos que se contradicen y **al menos uno** dice entregado → gana entregado. **Nunca por mayoría**: en HH Once la mayoría (5 de 7) se equivoca | `corregido` si contradice a su aviso, `según el edificio` si no |
| `aviso` | lo declara el aviso y nada lo contradice | sin marca |
| `vecinos` | consenso unánime del edificio (96,7% de acierto) | `deducido` |
| `alquiler` | hay alquiler activo ahí (95%: no se alquila lo que no está construido) | `deducido` |

🔴 **Cuando la corrección contradice al aviso hay que marcarlo.** Son 14 comparables hoy.
Si el broker abre el anuncio en C21 y lee "preventa" mientras el ACM dice "entregado",
sin explicación el documento pierde toda su autoridad. El eval lo verifica
("los estados corregidos se declaran").

## Tres trampas que no son de ubicación

**PostgREST corta en 1000 filas y no avisa.** Un total exactamente redondo es un límite,
no un dato. Hay que paginar con `.range()` hasta que una tanda vuelva incompleta.

**Las columnas calculadas viven en la vista, no en la tabla.** Si el dato se deriva de
algo (precio normalizado, días en mercado, precio por m²), está en `v_mercado_*`. La
tabla tiene lo crudo.

**Toda query mira su `error`.** Sin eso, un fallo se convierte en una lista vacía, y una
lista vacía se convierte en un mensaje plausible: *"amenidades no cargadas"*,
*"no encontramos ese aviso"*. Fallar fuerte es mejor que mentir en voz baja.

---

## Cómo verificar que no se rompió

El eval tiene un check para esto: **"el pool llega completo, no a medias"**. Mide qué
porcentaje de los comparables trae cada campo y falla si alguno se desploma. Los
umbrales son holgados a propósito — no miden calidad de datos, miden que la consulta
siga funcionando.

```bash
node simon-mvp/scripts/eval-acm.mjs --nivel 1
```
