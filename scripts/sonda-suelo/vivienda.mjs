// Pasada VIVIENDA FINAL: casas como compra de hogar (no suelo). Standalone, read-only.
// Mide lo que evalúa un comprador: dorms/baños/garage/área construida + $/m² construido +
// seguridad(condominio)/piscina/jardín/quincho/dependencia/estado/fotos.
// Uso: node vivienda.mjs [--zonas zona-norte,urubo] [--muestra 40]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { enZona, ZONAS } from './lib/zonas.mjs';
import { c21Listado, c21Detalle, remaxListadoSC, remaxDetalle } from './lib/portales.mjs';
import { calidadVivienda } from './lib/calidad.mjs';
import { nuevoDir } from './lib/reporte.mjs';
import { sleep } from './lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const log = (m) => console.log(m);
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const zonas = arg('--zonas', 'zona-norte,urubo').split(',').filter(z => ZONAS[z]);
const MUESTRA = parseInt(arg('--muestra', '40'), 10);

const pct = (arr, f) => arr.length ? Math.round(100 * arr.filter(f).length / arr.length) : 0;
const med = (ns) => { const a = ns.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? (a.length % 2 ? a[(a.length - 1) / 2] : Math.round((a[a.length / 2 - 1] + a[a.length / 2]) / 2)) : null; };

log(`\n🏠  PASADA VIVIENDA — casas · zonas: ${zonas.join(', ')} · muestra: ${MUESTRA}/zona\n`);

// ---- Nivel 1: listado de casas ----
const casas = [];
for (const z of zonas) {
  log(`  C21 casas · ${z} …`);
  for (const p of await c21Listado(z, 'casa', { log })) if (enZona(p.lat, p.lon, z)) casas.push({ ...p, zona: z });
}
log(`  Remax casas · todo SC …`);
const sc = await remaxListadoSC('casa', { log });
for (const p of sc) for (const z of zonas) if (enZona(p.lat, p.lon, z)) casas.push({ ...p, zona: z });

// dedup por GPS≈
const seen = new Set();
for (const p of casas) { const k = `${p.zona}|${p.lat?.toFixed(4)},${p.lon?.toFixed(4)}`; p.unico = !seen.has(k); if (p.unico) seen.add(k); }
const u = casas.filter(p => p.unico);
log(`\n  Nivel 1: ${casas.length} casas (${u.length} únicas).`);

// ---- Nivel 2: detalle (muestra) ----
function muestrear(z) {
  const pool = u.filter(p => p.zona === z && p.url);
  const byF = (f) => pool.filter(p => p.fuente === f);
  const pick = (arr, n) => arr.length <= n ? arr : Array.from({ length: n }, (_, i) => arr[Math.floor(i * arr.length / n)]);
  return [...pick(byF('c21'), Math.ceil(MUESTRA / 2)), ...pick(byF('remax'), Math.floor(MUESTRA / 2))];
}
const cal = [];
for (const z of zonas) {
  const m = muestrear(z);
  if (!m.length) continue;
  log(`  Detalle · ${z}: ${m.length} casas …`);
  for (const [i, p] of m.entries()) {
    const det = p.fuente === 'c21' ? await c21Detalle(p.url) : await remaxDetalle(p.url);
    cal.push({ zona: z, fuente: p.fuente, id: p.id, ...calidadVivienda(det, p) });
    if ((i + 1) % 15 === 0) log(`    …${i + 1}/${m.length}`);
    await sleep(800);
  }
}

// ---- Reporte ----
const dir = nuevoDir(__dirname);
writeFileSync(join(dir, 'raw', 'casas.json'), JSON.stringify(casas, null, 2));
writeFileSync(join(dir, 'raw', 'calidad-vivienda.json'), JSON.stringify(cal, null, 2));

const R = [];
R.push(`# Sonda VIVIENDA — Casas (compra de hogar)\n`);
R.push(`Generado: ${new Date().toISOString()} · Zonas: ${zonas.join(', ')}\n`);
R.push(`> Standalone, read-only. Casa como vivienda final (no suelo).\n`);

R.push(`## 1. Volumen + completitud estructurada (listado)\n`);
R.push(`| Zona | Fuente | Casas | Únicas | %dorms | %baños | %garage | %área constr. |`);
R.push(`|---|---|---:|---:|---:|---:|---:|---:|`);
for (const z of zonas) for (const f of ['c21', 'remax']) {
  const g = casas.filter(p => p.zona === z && p.fuente === f);
  if (!g.length) continue;
  R.push(`| ${z} | ${f} | ${g.length} | ${g.filter(p => p.unico).length} | ${pct(g, p => Number.isFinite(p.dorms))}% | ${pct(g, p => Number.isFinite(p.banos))}% | ${pct(g, p => Number.isFinite(p.garage))}% | ${pct(g, p => Number.isFinite(p.area_const_m2))}% |`);
}

R.push(`\n## 2. Precio y tipología (únicas con dato)\n`);
R.push(`| Zona | n | $/m² constr. (mediana) | dorms (mediana) | distribución dorms |`);
R.push(`|---|---:|---:|---:|---|`);
for (const z of zonas) {
  const g = u.filter(p => p.zona === z);
  const ppm = g.filter(p => p.precio_usd && p.area_const_m2).map(p => Math.round(p.precio_usd / p.area_const_m2));
  const dist = [1, 2, 3, 4, 5].map(d => `${d}d:${g.filter(p => p.dorms === d).length}`).join(' ') + ` 6+:${g.filter(p => p.dorms >= 6).length}`;
  R.push(`| ${z} | ${g.length} | $${med(ppm) ?? '—'} | ${med(g.map(p => p.dorms)) ?? '—'} | ${dist} |`);
}
R.push(`\n_Nota: $/m² construido hereda la suciedad de moneda C21 (~47%); tomar como referencia._\n`);

R.push(`## 3. Atributos que valora un comprador (muestra del detalle)\n`);
R.push(`| Zona | Fuente | Muestra | Desc.OK | 🔒Condominio | Piscina | Jardín | Quincho | Depend. | A estrenar | Fotos≥5 | Fotos(med) |`);
R.push(`|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
for (const z of zonas) for (const f of ['c21', 'remax']) {
  const g = cal.filter(c => c.zona === z && c.fuente === f);
  if (!g.length) continue;
  const ok = g.filter(c => c.descRecuperada);
  const base = ok.length ? ok : g;
  R.push(`| ${z} | ${f} | ${g.length} | ${ok.length} | ${pct(base, c => c.condominio)}% | ${pct(base, c => c.piscina)}% | ${pct(base, c => c.jardin)}% | ${pct(base, c => c.quincho)}% | ${pct(base, c => c.dependencia)}% | ${pct(base, c => c.estrenar)}% | ${pct(g, c => c.fotos_ok)}% | ${med(g.map(c => c.fotos_n)) ?? '—'} |`);
}

R.push(`\n## 4. Veredicto vivienda\n`);
const totU = u.length;
const dormsOK = pct(casas, p => Number.isFinite(p.dorms));
R.push(`- Volumen casas únicas: **${totU}** (${zonas.map(z => `${z}: ${u.filter(p => p.zona === z).length}`).join(', ')}).`);
R.push(`- Completitud estructurada base (dorms): **${dormsOK}%** del listado.`);
R.push(`- Lo que un comprador valora (seguridad/piscina/jardín/estado) vive en el TEXTO → ver tabla 3.`);
R.push(`- Fotos: clave para vivienda; ver % con ≥5 fotos.`);
R.push(`- (completar a mano)\n`);

writeFileSync(join(dir, 'summary-vivienda.md'), R.join('\n'));

log(`\n${'='.repeat(64)}`);
for (const z of zonas) log(`  ${ZONAS[z].nombre}: ${u.filter(p => p.zona === z).length} casas únicas`);
log(`\n💾 ${dir}\\summary-vivienda.md\n`);
