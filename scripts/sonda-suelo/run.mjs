// Sonda completa: volumen (listado) + calidad (detalle, muestra). Standalone, read-only.
// Uso: node run.mjs [--zonas zona-norte,urubo] [--tipos terreno,casa] [--muestra 35]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { enZona, ZONAS } from './lib/zonas.mjs';
import { c21Listado, c21Detalle, remaxListadoSC, remaxDetalle } from './lib/portales.mjs';
import { calidadDeDetalle } from './lib/calidad.mjs';
import { escribirCSV, escribirSummary, nuevoDir } from './lib/reporte.mjs';
import { sleep } from './lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(m);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const zonas = arg('--zonas', 'zona-norte,urubo').split(',').filter(z => ZONAS[z]);
const tipos = arg('--tipos', 'terreno,casa').split(',');
const MUESTRA = parseInt(arg('--muestra', '35'), 10);

log(`\n🛰️  SONDA COMPLETA — zonas: ${zonas.join(', ')} · tipos: ${tipos.join(', ')} · muestra detalle: ${MUESTRA}/zona×tipo\n`);

// ---------- NIVEL 1: VOLUMEN ----------
const listings = [];
// C21: grid por zona×tipo
for (const z of zonas) for (const t of tipos) {
  log(`  C21 listado · ${z} / ${t} …`);
  const props = await c21Listado(z, t, { log });
  for (const p of props) if (enZona(p.lat, p.lon, z)) listings.push({ ...p, zona: z, tipo: t });
}
// Remax: traer todo SC por tipo UNA vez, repartir a cada zona por GPS
for (const t of tipos) {
  log(`  Remax listado · todo SC / ${t} …`);
  const sc = await remaxListadoSC(t, { log });
  for (const p of sc) for (const z of zonas) if (enZona(p.lat, p.lon, z)) listings.push({ ...p, zona: z, tipo: t });
}

// dedup: cross-portal por GPS≈ (4 dec ~11m) + único por (zona,tipo)
const seen = new Set();
for (const p of listings) {
  const key = `${p.zona}|${p.tipo}|${p.lat?.toFixed(4)},${p.lon?.toFixed(4)}`;
  p.unico = !seen.has(key);
  if (p.unico) seen.add(key);
}

log(`\n  Nivel 1 listo: ${listings.length} listings (${listings.filter(p => p.unico).length} únicos).`);

// ---------- NIVEL 2: CALIDAD (muestra detalle) ----------
function muestrear(z, t) {
  const pool = listings.filter(p => p.zona === z && p.tipo === t && p.unico && p.url);
  const porFuente = (f) => pool.filter(p => p.fuente === f);
  const pick = (arr, n) => arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor(i * arr.length / n)]);
  const mitad = Math.ceil(MUESTRA / 2);
  return [...pick(porFuente('c21'), mitad), ...pick(porFuente('remax'), MUESTRA - mitad)];
}

const calidad = [];
for (const z of zonas) for (const t of tipos) {
  const m = muestrear(z, t);
  if (!m.length) continue;
  log(`  Detalle · ${z} / ${t}: ${m.length} props …`);
  for (const [i, p] of m.entries()) {
    const det = p.fuente === 'c21' ? await c21Detalle(p.url) : await remaxDetalle(p.url);
    const c = calidadDeDetalle(det, p.fuente);
    calidad.push({ zona: z, tipo: t, fuente: p.fuente, id: p.id, url: p.url,
      moneda_listado: p.moneda, moneda_detalle: det?.moneda || null, ...c });
    if ((i + 1) % 15 === 0) log(`    …${i + 1}/${m.length}`);
    await sleep(800);
  }
}

// ---------- SALIDA ----------
const dir = nuevoDir(__dirname);
const generado = new Date().toISOString();
writeFileSync(join(dir, 'raw', 'listings.json'), JSON.stringify(listings, null, 2));
writeFileSync(join(dir, 'raw', 'calidad.json'), JSON.stringify(calidad, null, 2));
escribirCSV(dir, listings);
escribirSummary(dir, { generado, zonas, tipos, listings, calidad });

// resumen consola
log(`\n${'='.repeat(64)}`);
for (const z of zonas) {
  const ter = listings.filter(p => p.zona === z && p.tipo === 'terreno' && p.unico).length;
  const cas = listings.filter(p => p.zona === z && p.tipo === 'casa' && p.unico).length;
  log(`  ${ZONAS[z].nombre}: ${ter} terrenos únicos · ${cas} casas únicas`);
}
log(`\n💾 ${dir}\\summary.md\n`);
