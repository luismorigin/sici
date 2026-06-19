# Sonda de suelo — Casas y Terrenos

Generado: 2026-06-18T14:13:00.312Z
Zonas: zona-norte, urubo · Tipos: terreno, casa · Fuentes: C21 + Remax

> Standalone, read-only. NO toca propiedades_v2, workflows ni matching.

## 1. Volumen (listado, todo el inventario)

| Zona | Tipo | Fuente | Listings | Únicos | % área | % precio | % GPS-en-zona |
|---|---|---|---:|---:|---:|---:|---:|
| zona-norte | terreno | c21 | 139 | 115 | 100% | 100% | 100% |
| zona-norte | terreno | remax | 48 | 38 | 94% | 100% | 100% |
| zona-norte | casa | c21 | 192 | 164 | 100% | 100% | 100% |
| zona-norte | casa | remax | 113 | 100 | 99% | 100% | 100% |
| urubo | terreno | c21 | 199 | 156 | 100% | 100% | 100% |
| urubo | terreno | remax | 30 | 23 | 93% | 100% | 100% |
| urubo | casa | c21 | 22 | 20 | 100% | 100% | 100% |
| urubo | casa | remax | 24 | 24 | 100% | 100% | 100% |

**Únicos por zona × tipo (dedup cross-portal por GPS≈ + código):**

| Zona | Terrenos únicos | Casas únicas |
|---|---:|---:|
| zona-norte | 153 | 264 |
| urubo | 179 | 44 |

**Precio/m² terreno (referencial — ver caveat de moneda):**

| Zona | Fuente | n | p25 | mediana | p75 |
|---|---|---:|---:|---:|---:|
| zona-norte | c21 | 139 | $119 | $236 | $538 |
| zona-norte | remax | 45 | $111 | $250 | $400 |
| urubo | c21 | 199 | $65 | $180 | $267 |
| urubo | remax | 28 | $48 | $157 | $200 |

## 2. Calidad / suciedad (muestra del detalle)

Atributos que importan a un desarrollador, medidos sobre la muestra con descripción recuperada.

| Zona | Tipo | Fuente | Muestra | Desc. OK | Frente | (estruct.) | Uso suelo | Esquina | Demolible | Servicios |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| zona-norte | terreno | c21 | 18 | 18 | 39% | 17% | 22% | 0% | 6% | 22% |
| zona-norte | terreno | remax | 17 | 17 | 29% | 0% | 6% | 18% | 6% | 18% |
| zona-norte | casa | c21 | 18 | 18 | 33% | 22% | 17% | 6% | 17% | 6% |
| zona-norte | casa | remax | 17 | 17 | 12% | 0% | 0% | 0% | 6% | 12% |
| urubo | terreno | c21 | 18 | 18 | 22% | 17% | 33% | 11% | 33% | 22% |
| urubo | terreno | remax | 17 | 17 | 12% | 0% | 18% | 18% | 24% | 29% |
| urubo | casa | c21 | 18 | 18 | 22% | 22% | 11% | 11% | 0% | 17% |
| urubo | casa | remax | 17 | 17 | 18% | 0% | 0% | 0% | 0% | 29% |

### Suciedad de moneda (C21)

- Muestra C21 con descripción: **72**
- Casos con listado=`BOB` pero el texto habla en USD: **34 (47%)** → precio/m² del listado NO confiable sin leer texto/detalle.
- Detalle C21 con `moneda` propia (USD/BOB): 100% — el detalle ayuda a desambiguar.


## 3. Veredicto

**Volumen: sí, abrumador.** 640 propiedades de suelo únicas (332 terrenos + 308 casas) vs
~38 en Equipetrol. Patrón de mercado coherente con la realidad:
- **Zona Norte = consolidada**: dominan las casas (264) sobre terrenos (153). Las casas en zona
  consolidada son candidatas a demolición/redesarrollo (suelo "disfrazado").
- **Urubó = expansión**: dominan los terrenos (179) sobre casas (44). Suelo puro / loteamientos.
- Precio/m² terreno coherente entre fuentes: ZN ~$236-250, Urubó ~$157-180 (Urubó más barato = zona menos consolidada).

**Campos confiables vs sucios:**
- ✅ **Base física completa**: área 93-100%, precio presente 100%, GPS 100%.
- 🔴 **Precio NO confiable en el listado por moneda**: 47% de C21 marca `BOB` con texto en USD
  (subvalúa ~7×). Resoluble: el **detalle C21 trae `moneda` propia al 100%** → desambiguable.
- 🟡 **Atributos de desarrollo escasos**: frente 12-39%, uso de suelo 0-33%, esquina 0-18%.
  El broker no los carga. Un producto debe mostrar "lo que hay", no prometer ficha completa.

**Implicación de producto:** un inventario de suelo para desarrolladores es viable en volumen.
Su valor NO es tener más campos que el portal (el broker no los da) sino **normalizar bien el
precio** (resolver la moneda vía detalle) y **agregar/mapear** la oferta por zona y $/m². El
diferenciador es la limpieza y la vista agregada, no la ficha individual.

**Zona para empezar: Urubó para terrenos** (179 terrenos, mercado de suelo puro, target natural
de desarrolladoras) **+ Zona Norte para casas-demolibles** (264 casas en zona consolidada).

### Caveats
- Muestra de calidad: 35/zona×tipo (≈17-18 por fuente) → los % son orden de magnitud, ±10-15%.
- Remax no expone frente estructurado (solo texto) → su % de frente subestima.
- Urubó usa bbox (no polígono): puede incluir algo de borde rural al oeste; el orden no cambia.
- Dedup por GPS≈11m: cross-posting del mismo lote con GPS levemente distinto puede sobrecontar algo.
- **Bug de producción detectado**: el discovery Remax casas/terrenos lee `land_area_m` (no existe);
  el campo real es `land_m2`. Por eso los terrenos Remax llegan sin área a `propiedades_v2`.