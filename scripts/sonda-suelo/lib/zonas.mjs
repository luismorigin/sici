// Zonas objetivo: bbox + (opcional) polígono real para point-in-polygon.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const znGeo = JSON.parse(readFileSync(join(__dirname, '..', 'zn-poligono.json'), 'utf8'));

export const ZONAS = {
  'zona-norte': {
    nombre: 'Zona Norte',
    bbox: { N: -17.664008, S: -17.771792, E: -63.111311, O: -63.194850 },
    poligono: znGeo, // MultiPolygon real (14 sub-zonas unidas)
  },
  'urubo': {
    nombre: 'Urubó',
    // Sin polígono en la BD → bbox aproximado (oeste del río Piraí), a calibrar con los hits.
    bbox: { N: -17.720, S: -17.840, E: -63.220, O: -63.360 },
    poligono: null,
  },
  'equipetrol': {
    nombre: 'Equipetrol (cross-check)',
    bbox: { N: -17.750, S: -17.775, E: -63.185, O: -63.205 },
    poligono: null,
  },
};

const enBbox = (lat, lon, b) => lat <= b.N && lat >= b.S && lon <= b.E && lon >= b.O;

// ray casting sobre un anillo [[lon,lat],...]
function enAnillo(lon, lat, ring) {
  let dentro = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    const corta = (yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (corta) dentro = !dentro;
  }
  return dentro;
}

// MultiPolygon: dentro si cae en el anillo exterior de algún polígono
function enMultiPoligono(lat, lon, geo) {
  if (!geo) return true;
  const polys = geo.type === 'MultiPolygon' ? geo.coordinates : [geo.coordinates];
  for (const poly of polys) if (enAnillo(lon, lat, poly[0])) return true;
  return false;
}

// Filtro: primero bbox (barato), luego polígono si existe.
export function enZona(lat, lon, zonaKey) {
  const z = ZONAS[zonaKey];
  if (!z || !Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  if (!enBbox(lat, lon, z.bbox)) return false;
  return z.poligono ? enMultiPoligono(lat, lon, z.poligono) : true;
}

export const bboxDe = (zonaKey) => ZONAS[zonaKey].bbox;
