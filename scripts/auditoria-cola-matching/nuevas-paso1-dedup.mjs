// Paso 1: de las casas frescas (discovery-fresco.json), quitar las ya cargadas en BD + filtrar
// polígono ZN fino + calidad básica. Escribe nuevas-candidatas.json.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import { enZona } from '../sonda-suelo/lib/zonas.mjs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SS = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';

const idDeUrl = (u) => {
  if (!u) return null;
  const mc = u.match(/c21\.com\.bo\/propiedad\/(\d+)/); if (mc) return `c21:${mc[1]}`;
  const mr = u.match(/(\d{6,}-\d+)(?:$|\?)/); if (mr) return `remax:${mr[1]}`;
  return u;
};

// URLs ya cargadas (casas, activas e inactivas) → set de identificadores
const { data: cargadas } = await sb.from('propiedades_v2').select('url').eq('tipo_propiedad_original', 'casa');
const setCargadas = new Set(cargadas.map((c) => idDeUrl(c.url)).filter(Boolean));
console.log(`Casas ya en BD: ${cargadas.length} (ids únicos: ${setCargadas.size})`);

const fresco = JSON.parse(fs.readFileSync(`${SS}/discovery-fresco.json`, 'utf8'));
let yaCargada = 0, fueraZN = 0, sinCalidad = 0;
const cand = [];
for (const p of fresco) {
  if (setCargadas.has(idDeUrl(p.url))) { yaCargada++; continue; }
  if (!p.lat || !p.lon || !enZona(p.lat, p.lon, 'zona-norte')) { fueraZN++; continue; } // polígono FINO
  if (!p.precio_raw && !p.precio_usd) { sinCalidad++; continue; }
  if (!p.area_const_m2 && !p.area_terreno_m2) { sinCalidad++; continue; }
  cand.push(p);
}
fs.writeFileSync(`${SS}/nuevas-candidatas.json`, JSON.stringify(cand, null, 1), 'utf8');
console.log(`Frescas: ${fresco.length}`);
console.log(`  ya cargadas: ${yaCargada} | fuera polígono ZN fino: ${fueraZN} | sin precio/área: ${sinCalidad}`);
console.log(`CANDIDATAS NUEVAS a procesar: ${cand.length}`);
const porFuente = cand.reduce((a, c) => ((a[c.fuente] = (a[c.fuente] || 0) + 1), a), {});
console.log(`Por fuente:`, porFuente);
