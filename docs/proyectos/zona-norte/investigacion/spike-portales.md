# Spike — Discovery geográfico en los 3 portales

**Fecha:** 20 May 2026. **Método:** requests reales (curl/fetch) a las APIs de cada portal + lectura de los workflows n8n actuales. Solo lectura, sin tocar la BD.

**Pregunta central:** ¿cada portal devuelve las coordenadas GPS de cada propiedad? Porque si los 3 lo hacen, la estrategia escalable es "traer amplio + filtrar por polígono GPS" → agregar zona = dibujar polígono.

---

## Cómo filtra cada portal hoy (workflows actuales)

| Portal | Mecanismo actual (atado a Equipetrol) | Archivo |
|---|---|---|
| C21 venta | grid bbox GPS `LAT_SUR=-17.775 … LON_ESTE=-63.185`, STEP 0.01 | `flujo_a_discovery_century21_v1.0.3_FINAL.json:27` |
| C21 alquiler | mismo grid, URL con `operacion_renta` | `flujo_discovery_c21_alquiler_v1.0.0.json:27` |
| Remax venta | slug `equipetrolnoroeste`, 8 páginas fijas | `flujo_a_discovery_remax_v1.0.2_FINAL.json:27` |
| Remax alquiler | mismo slug, filtra `transaction_type` en JS | `flujo_discovery_remax_alquiler_v1.0.0.json` |
| Bien Inmuebles | POST a `procesos.php`, filtra `barrio==='equipetrol'` en JS | `flujo_discovery_bien_inmuebles_alquiler_v1.0.0.json:60` |

→ El discovery NO es zone-agnostic hoy: 3 mecanismos distintos (bbox / slug / nombre de barrio).

---

## Hallazgos empíricos (la respuesta)

**Los 3 portales devuelven lat/lon en cada listing, al 100%.**

### C21 — GPS nativo por bounding box ✅
- URL: `c21.com.bo/v/resultados/tipo_departamento-o-penthouse/operacion_{venta|renta}/layout_mapa/coordenadas_{N},{E},{S},{W},15?json=true`
- El bbox filtra de verdad (caja norte → 202 hits, todos dentro; caja en el Pacífico → 0).
- Cada prop trae `lat`/`lon`. Campos: `precio`, `moneda`, `m2C`, `recamaras`, `banos`, `tipoOperacion`, `urlCorrectaPropiedad`.

### Remax — GPS en todo listing, incluso sin slug ✅ (sospecha resuelta)
- Endpoint base SC `remax.bo/api/search/departamento/santa-cruz-de-la-sierra?page=N` → **517 props, todas con `location.latitude/longitude` + `location.zone.name`** (verificado en múltiples páginas, 100%).
- Slug `equipetrolnoroeste` → 183 (sí filtra). Slug inválido (`zona-norte`, `avenida-banzer`) → 517 = **todo SC en silencio** (la trampa). Slugs reales existen (`/norte`=146) pero son frágiles.
- **Conclusión: usar GPS, no slug.** No estás atado a la taxonomía de Remax.
- Campos: `price.price_in_dollars`, `price.amount`, `price.currency_id`, `listing_information.{construction_area_m,number_bedrooms,number_bathrooms,number_parking}`, `transaction_type.name`, `slug`, `MLSID`.

### Bien Inmuebles — todo SC + GPS por listing ✅
- POST `procesos.php`, body `proceso=getCatalogo&modalidad={1=venta,2=alquiler}&id_fami=1&...&filas=N`. Header `X-Requested-With: XMLHttpRequest`. Respuesta = string JSON (requiere `JSON.parse`).
- Venta (modalidad=1) → 223 props, 100% con GPS. Alquiler (modalidad=2) → 22 props, 100% con GPS.
- `nomb_barri` del norte es granular e inconsistente ("Norte Entre 3er y 4to anillo", etc.) → el filtro por nombre no escala; el GPS sí.
- Campos: `precio_cata`, `moneda_cata` (2=USD), `latitud_cata`, `longitud_cata`, `supterreno_cata`, `habitacion_cata`, `banio_cata`, `id_cata`, `code_cata`, `nomb_barri`.

---

## Veredicto de escalabilidad

1. **¿Unificable a "todo SC + polígono GPS"?** Sí, los 3 lo permiten.
2. **¿Algún portal lo impide?** Ninguno (GPS al 100%).
3. **Remax (la duda principal):** no estás atado a slugs — el GPS viene en cada listing.
4. **Costo de "traer de más":** trivial. El filtro por polígono corre en discovery, **antes** del enrichment caro (LLM Haiku). No se enriquecen props fuera de zona.

→ Decisión registrada en [DECISIONES.md ADR-004](../DECISIONES.md).

---

## Otros hallazgos (para la fase de ejecución, no MVP de discovery)

- **CHECK constraint `zona_valida`** en `propiedades_v2` hardcodea las 6 zonas Equipetrol → migración necesaria cuando se inserte la zona nueva.
- **`buscar_unidades_alquiler.sql:32-43`** tiene un CASE con aliases legacy → 1 caso nuevo cuando se exponga en frontend (no en MVP).
- **Bug latente venta:** `flujo_enrichment_llm_venta_v1.0.0.json` no pasa proyectos al LLM (query sin filtro `pm.zona`, JS lee field inexistente). Independiente.
