// DISCOVERY + DEDUP de casas ZN: trae la lista FRESCA de C21+Remax, filtra polígono ZN, dedup,
// y compara contra el universo conocido (casas-zn-full.json del 18-jun) para detectar NUEVAS y DESAPARECIDAS.
import fs from 'node:fs';
import { c21Listado, remaxListadoSC } from './lib/portales.mjs';
import { enZona } from './lib/zonas.mjs';

const DIR = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const log = (m) => console.log(m);
const idDeUrl = (u) => {
  if (!u) return null;
  const mc = u.match(/c21\.com\.bo\/propiedad\/(\d+)/); if (mc) return `c21:${mc[1]}`;
  const mr = u.match(/(\d{6,}-\d+)(?:$|\?)/); if (mr) return `remax:${mr[1]}`;
  return u;
};

log('Discovery C21 casas ZN…');
const c21 = await c21Listado('zona-norte', 'casa', { rateMs: 1200, log });
log(`  C21: ${c21.length} casas en bbox ZN`);
log('Discovery Remax casas SC (luego filtro ZN)…');
const remaxAll = await remaxListadoSC('casa', { rateMs: 1000, maxPages: 40, log });
const remax = remaxAll.filter((p) => p.lat && p.lon && enZona(p.lat, p.lon, 'zona-norte'));
log(`  Remax: ${remax.length}/${remaxAll.length} casas dentro del polígono ZN`);

// dedup cross-portal por identificador de URL
const fresco = new Map();
for (const p of [...c21, ...remax]) { const id = idDeUrl(p.url); if (id && !fresco.has(id)) fresco.set(id, p); }
log(`\nFRESCO único (C21+Remax, polígono ZN): ${fresco.size} casas`);

// universo conocido (18-jun)
const full = JSON.parse(fs.readFileSync(`${DIR}/casas-zn-full.json`, 'utf8'));
const conocido = new Set(full.map((c) => idDeUrl(c.url)).filter(Boolean));

const nuevas = [...fresco.keys()].filter((id) => !conocido.has(id));
const desaparecidas = [...conocido].filter((id) => !fresco.has(id));
log(`Conocidas (full 18-jun): ${conocido.size}`);
log(`NUEVAS (en fresco, no en full): ${nuevas.length}`);
log(`DESAPARECIDAS (en full, no en fresco hoy): ${desaparecidas.length}`);
fs.writeFileSync(`${DIR}/discovery-fresco.json`, JSON.stringify([...fresco.values()], null, 1), 'utf8');
log(`\nMuestra de nuevas: ${nuevas.slice(0, 10).join(', ')}`);
log(`(lista fresca completa en discovery-fresco.json)`);
