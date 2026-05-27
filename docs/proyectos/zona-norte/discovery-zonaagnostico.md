# Discovery zona-agnóstico — diseño de snippets reusables

> Diseño técnico de los bloques que se insertan en los workflows duplicados de Zona Norte. El objetivo: que cualquier zona futura entre con cargar 1 polígono en `zonas_geograficas`, sin tocar workflows.

**Fecha:** 26 May 2026. **Estado:** diseño aprobado, pendiente implementación en JSONs n8n.

---

## Arquitectura del workflow Zona Norte (versión genérica)

```
[Trigger cron 1:15 AM] (offset al original Equipetrol)
    ↓
[NUEVO: Postgres — leer polígonos activos]
    ↓
[NUEVO: Code — calcular bbox unión + lista de polígonos]
    ↓
[MODIFICADO: Code — generar grid/endpoints desde bbox]
    ↓
[Split In Batches]
    ↓
[HTTP Request al portal]
    ↓
[NUEVO: Code — filtrar listings por point-in-polygon contra polígonos activos]
    ↓
[Resto del workflow original sin cambios: dedupe, INSERT propiedades_v2, etc.]
```

Lo nuevo son los 3 bloques marcados. El resto se mantiene exacto.

---

## Snippet 1 — Postgres: leer polígonos activos

**Tipo de nodo:** `n8n-nodes-base.postgres` (operación: Execute Query).

**SQL:**
```sql
SELECT
  nombre,
  ST_AsGeoJSON(geom) AS geom_geojson,
  ST_XMin(geom) AS lon_oeste,
  ST_YMin(geom) AS lat_sur,
  ST_XMax(geom) AS lon_este,
  ST_YMax(geom) AS lat_norte
FROM zonas_geograficas
WHERE activo = true
  AND nombre = ANY(ARRAY['Zona Norte']::text[]);
```

**Variable controlable** (en cada workflow): el array `ARRAY['Zona Norte']::text[]`. Para el workflow Zona Norte arranca con solo Zona Norte. Si mañana querés que este mismo workflow traiga también "Urubó", agregás el nombre al array — cero cambio adicional.

**Output:** 1 fila por zona activa con bbox y geometría.

---

## Snippet 2 — Code: bbox unión + array de polígonos

**Tipo de nodo:** `n8n-nodes-base.code` (typeVersion: 2).

```javascript
// Procesa la salida del nodo Postgres anterior.
// Devuelve: bbox unión de todos los polígonos + array de polígonos para filtrar.

const items = $input.all();

if (items.length === 0) {
  throw new Error('No hay polígonos activos. Verificar zonas_geograficas.');
}

let minLat = Infinity, maxLat = -Infinity;
let minLon = Infinity, maxLon = -Infinity;
const polygons = [];

for (const item of items) {
  const data = item.json;
  minLat = Math.min(minLat, parseFloat(data.lat_sur));
  maxLat = Math.max(maxLat, parseFloat(data.lat_norte));
  minLon = Math.min(minLon, parseFloat(data.lon_oeste));
  maxLon = Math.max(maxLon, parseFloat(data.lon_este));

  // ST_AsGeoJSON devuelve string; lo parseamos al ring exterior
  const geo = JSON.parse(data.geom_geojson);
  polygons.push({
    nombre: data.nombre,
    coordinates: geo.coordinates[0]   // [[lon,lat],...] del ring exterior
  });
}

return [{
  json: {
    bbox: {
      lat_sur: minLat,
      lat_norte: maxLat,
      lon_oeste: minLon,
      lon_este: maxLon
    },
    polygons,
    zonas_incluidas: items.map(i => i.json.nombre)
  }
}];
```

---

## Snippet 3 — Code: generar grid desde bbox (reemplaza el actual de C21)

**Solo aplica a C21** (el que usa grid). Remax usa endpoints paginados, ver Snippet 4.

```javascript
// === GENERADOR DE CUADRANTES C21 ZONA-AGNÓSTICO ===
// Lee bbox del nodo anterior (en lugar de constantes hardcoded).

const config = $input.first().json;
const { lat_sur, lat_norte, lon_oeste, lon_este } = config.bbox;
const STEP = 0.010;

const cookieId = 'sici_' + Math.random().toString(36).substring(2, 15);
const cookie = `PHPSESSID=${cookieId}`;

const cuadrantes = [];
let gridId = 1;

for (let lat = lat_sur; lat < lat_norte; lat += STEP) {
  for (let lon = lon_oeste; lon < lon_este; lon += STEP) {
    const south = lat;
    const west = lon;
    const north = lat + STEP;
    const east = lon + STEP;

    const coordString = `coordenadas_${north.toFixed(6)},${east.toFixed(6)},${south.toFixed(6)},${west.toFixed(6)}`;

    cuadrantes.push({
      json: {
        grid_id: gridId++,
        path_coordenadas: coordString,
        cookie,
        fuente: 'century21',
        polygons: config.polygons,        // pasamos polígonos para filtrar después
        zonas_incluidas: config.zonas_incluidas
      }
    });
  }
}

console.log(`Grid generado: ${cuadrantes.length} cuadrantes (STEP=${STEP}) sobre zonas: ${config.zonas_incluidas.join(', ')}`);

return cuadrantes;
```

**Nota sobre volumen:** el polígono Zona Norte tiene bbox aprox 6.5km × 7.2km = ~6×7 = 42 cuadrantes vs 6 de Equipetrol. Esto multiplica las requests a C21 por ~7. Si genera rate-limit, subir STEP a 0.015 o 0.020.

---

## Snippet 4 — Remax sin slug (reemplaza el generador actual)

**Solo aplica a Remax.** El endpoint base SC trae 517 props paginables en ~30 páginas.

```javascript
// === GENERADOR DE URLs REMAX ZONA-AGNÓSTICO ===
// Endpoint base SC sin slug. El filtro por polígono se hace post-fetch (Snippet 5).

const config = $input.first().json;
const TOTAL_PAGES = 30;  // ~517 props / ~20 por página = 26 páginas. Margen: 30.
const BASE_URL = 'https://remax.bo/api/search/departamento/santa-cruz-de-la-sierra';

const urls = [];

for (let page = 1; page <= TOTAL_PAGES; page++) {
  urls.push({
    json: {
      page_url: `${BASE_URL}?page=${page}`,
      page_number: page,
      fuente: 'remax',
      polygons: config.polygons,
      zonas_incluidas: config.zonas_incluidas
    }
  });
}

return urls;
```

---

## Snippet 5 — Filtro point-in-polygon post-HTTP

**Tipo:** Code node. Va después del nodo HTTP Request, antes del INSERT a BD.

```javascript
// === FILTRO POR POLÍGONOS ACTIVOS ===
// Descarta listings cuyo GPS no cae en ningún polígono activo.
// Ray casting algorithm (no requiere dependencias).

function pointInPolygon(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect =
      ((yi > lat) !== (yj > lat)) &&
      (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

const items = $input.all();

// Los polígonos vienen en cada item (los pasamos desde el snippet 2/3/4).
const polygons = items[0]?.json?.polygons || [];
if (polygons.length === 0) {
  console.warn('Sin polígonos para filtrar — devuelvo todo (FAIL OPEN evitado)');
  return [];   // FAIL CLOSED: si no hay polígonos, no inserto nada (seguro)
}

let totalListings = 0;
let dentroTotal = 0;
const output = [];

for (const item of items) {
  const props = item.json.propiedades || [];
  totalListings += props.length;

  const dentro = props.filter(p => {
    const lat = parseFloat(p.latitud);
    const lon = parseFloat(p.longitud);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return polygons.some(poly => pointInPolygon(lon, lat, poly.coordinates));
  });

  dentroTotal += dentro.length;

  if (dentro.length > 0) {
    output.push({
      json: {
        ...item.json,
        propiedades: dentro
      }
    });
  }
}

console.log(`Filtro polígono: ${dentroTotal}/${totalListings} dentro de [${polygons.map(p => p.nombre).join(', ')}]`);

return output;
```

**Por qué fail-closed (devuelve `[]` si no hay polígonos):** porque si la consulta Postgres falla, preferimos no insertar nada que insertar todo SC. Reversible: una vez resuelto el problema, la próxima corrida nocturna trae lo que faltó.

---

## Esquema mental: si después agregás Urubó

1. Cargás el polígono en `zonas_geograficas`:
   ```sql
   INSERT INTO zonas_geograficas (nombre, zona_general, geom, activo)
   VALUES ('Urubó', 'Urubó', ST_GeomFromGeoJSON('{...}'), true);
   ```
2. Decidís: ¿qué workflow trae Urubó?
   - **Opción A:** modificás el array del workflow Zona Norte → `ARRAY['Zona Norte','Urubó']`. Mismo workflow trae ambos.
   - **Opción B:** duplicás el workflow Zona Norte → `_uruboo_v1.0.0.json`, con `ARRAY['Urubó']`. Más control, kill-switch independiente.

**Cero cambio en código.** Solo configuración del array.

---

## Validación esperada para Zona Norte (post primera corrida)

```sql
-- Props nuevas insertadas hoy con zona='Zona Norte', tipo_operacion='venta'
SELECT COUNT(*), fuente
FROM propiedades_v2
WHERE zona = 'Zona Norte'
  AND tipo_operacion = 'venta'
  AND fecha_discovery::date = CURRENT_DATE
GROUP BY fuente;
-- Esperado (basado en PoC): C21 ~316, Remax ~140. Total ~456 props.
```

Si los conteos divergen mucho del PoC, investigar (cambios en portales, error en filtro, etc.).
