// Baja descripciones completas de una muestra de casas ZN (para probar el prompt LLM). Reusa portales.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { c21Detalle, remaxDetalle } from './lib/portales.mjs';
import { sleep } from './lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASAS = join(__dirname, 'output', '2026-06-18-15-40-53', 'raw', 'casas.json');
const casas = JSON.parse(readFileSync(CASAS, 'utf8'));
const zn = casas.filter(p => p.zona === 'zona-norte' && p.unico && p.url);

const pick = (arr, n) => arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor(i * arr.length / n)]);
const N = parseInt((process.argv.find(a => a.startsWith('--n=')) || '--n=25').slice(4), 10);
const muestra = [...pick(zn.filter(p => p.fuente === 'c21'), N), ...pick(zn.filter(p => p.fuente === 'remax'), N)];

const out = [];
for (const [i, p] of muestra.entries()) {
  const det = p.fuente === 'c21' ? await c21Detalle(p.url) : await remaxDetalle(p.url);
  out.push({
    id: p.id, fuente: p.fuente, url: p.url, lat: p.lat, lon: p.lon,
    descripcion: (det?.descripcion || '').replace(/\s+\n/g, '\n').trim(),
  });
  if ((i + 1) % 10 === 0) console.log(`[${i + 1}/${muestra.length}] …`);
  await sleep(600);
}
const file = join(__dirname, 'descripciones-casas-zn-cat.json');
writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\n💾 ${file}`);
