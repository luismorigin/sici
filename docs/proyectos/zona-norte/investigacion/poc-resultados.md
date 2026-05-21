# PoC de discovery — resultados

**Fecha:** 20 May 2026. **Script:** `scripts/poc-zona-norte/poc-discovery.mjs`. **Polígono:** `scripts/poc-zona-norte/poligono-prueba.geojson` (amplio, dibujado por Lucho). **Sin tocar la BD** — trae de los 3 portales, filtra por polígono (point-in-polygon), reporta volumen y calidad. Output en `resultados.json` (gitignorado, se regenera al correr).

Reproducir: `node scripts/poc-zona-norte/poc-discovery.mjs`

---

## Resultados (props dentro del polígono)

Polígono bbox: lat -17.7716 → -17.7076, lon -63.1950 → -63.1363.

| Portal / operación | Dentro del polígono | Con precio | Con área |
|---|---|---|---|
| C21 venta | 316 | 316 | 316 |
| C21 alquiler | 82 | 82 | 82 |
| Remax venta | 140 | 140 | 139 |
| Remax alquiler | 27 | 27 | 27 |
| BI venta | 26 | 26 | 25 |
| BI alquiler | 4 | 4 | 1 |
| **TOTAL** | **595** | (482 venta / 113 alquiler) | |

**C21 es el portal dominante en el norte**: 398 de 595 (67%). Remax aporta 167, BI 30 (BI alquiler casi inexistente: 4).

Volumen de referencia: 595 props ≈ 80% del inventario actual de Equipetrol (~745). La zona casi duplica el sistema.

---

## Sanity check (la prueba de que el GPS funciona)

Las props se filtraron por **caja geográfica (GPS)**. Cruzadas contra la taxonomía propia de cada portal:

- **Remax `zone.name`:** 136 "Norte", 15 "Radial 26", 5 "Hamacas", 2 "Banzer 3er al 5to anillo"…
- **BI `nomb_barri`:** "Norte Entre 3er y 4to anillo", "Norte Entre 2do y 3er anillo", "Hamacas"…

→ Filtraste por un polígono que dibujaste vos, y los 3 portales —cada uno con su sistema de nombres— coinciden en que eso es el norte. El modelo GPS funciona sin depender de slugs/nombres.

**Precios medianos (USD aprox, coherentes entre portales):**
- Venta: C21 $80.9k · Remax $91k · BI $69k
- Alquiler: ~$500/mes en los tres

---

## Calidad de datos

Data **cruda de discovery** (sin enrichment todavía). Outliers esperables que el enrichment limpia: un C21 de "$72", un Remax de $143/mes con "1000m²", un BI de "9m²". Edificios reconocibles aparecen bien formados (Mangales Blue, Barcelona). La calidad de `dorms` en C21 venta es menor (213/316) porque ese dato suele completarse en enrichment.

---

## Muestra con links (revisada con Lucho)

C21 venta: [Mangales Blue 2](https://c21.com.bo/propiedad/104791_preventa-de-departamento-de-1-dormitorio-en-edificio-mangales-blue-2-zona-norte) ($63.7k) · [Barcelona 04-05](https://c21.com.bo/propiedad/98991_hermoso-departamento-de-2-dormitorio-en-barcelona-04-05) ($116.5k).
Remax venta: [Norte 2d 65m²](https://remax.bo/propiedad/venta-departamento-santa-cruz-de-la-sierra-norte-125001005-1513) ($91k).
BI venta: [Norte 4to-5to anillo](https://www.bieninmuebles.com.bo/property.php?id=5409) ($94k).

(Más en `resultados.json` tras correr el script.)
