// Generación de CSV + summary.md con veredicto.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const pctArr = (arr, f) => arr.length ? Math.round(100 * arr.filter(f).length / arr.length) : 0;
function mediana(nums) {
  const a = nums.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}
const cuantil = (nums, q) => { const a = nums.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.floor(q * (a.length - 1))] : null; };

export function escribirCSV(dir, listings) {
  const cols = ['zona', 'tipo', 'fuente', 'id', 'lat', 'lon', 'area_terreno_m2', 'area_const_m2', 'precio_usd', 'moneda', 'unico', 'url'];
  const esc = (v) => v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const lines = [cols.join(',')];
  for (const p of listings) lines.push(cols.map(c => esc(p[c])).join(','));
  writeFileSync(join(dir, 'listings.csv'), lines.join('\n'));
}

export function escribirSummary(dir, { generado, zonas, tipos, listings, calidad }) {
  const L = [];
  L.push(`# Sonda de suelo — Casas y Terrenos\n`);
  L.push(`Generado: ${generado}`);
  L.push(`Zonas: ${zonas.join(', ')} · Tipos: ${tipos.join(', ')} · Fuentes: C21 + Remax\n`);
  L.push(`> Standalone, read-only. NO toca propiedades_v2, workflows ni matching.\n`);

  // ---- NIVEL 1: VOLUMEN ----
  L.push(`## 1. Volumen (listado, todo el inventario)\n`);
  L.push(`| Zona | Tipo | Fuente | Listings | Únicos | % área | % precio | % GPS-en-zona |`);
  L.push(`|---|---|---|---:|---:|---:|---:|---:|`);
  for (const z of zonas) for (const t of tipos) for (const f of ['c21', 'remax']) {
    const g = listings.filter(p => p.zona === z && p.tipo === t && p.fuente === f);
    if (!g.length) { L.push(`| ${z} | ${t} | ${f} | 0 | 0 | — | — | — |`); continue; }
    const u = g.filter(p => p.unico);
    L.push(`| ${z} | ${t} | ${f} | ${g.length} | ${u.length} | ${pctArr(g, p => p.area_terreno_m2)}% | ${pctArr(g, p => p.precio_usd)}% | 100% |`);
  }
  // totales por zona×tipo (únicos, dedup cross-portal)
  L.push(`\n**Únicos por zona × tipo (dedup cross-portal por GPS≈ + código):**\n`);
  L.push(`| Zona | Terrenos únicos | Casas únicas |`);
  L.push(`|---|---:|---:|`);
  for (const z of zonas) {
    const ter = listings.filter(p => p.zona === z && p.tipo === 'terreno' && p.unico).length;
    const cas = listings.filter(p => p.zona === z && p.tipo === 'casa' && p.unico).length;
    L.push(`| ${z} | ${ter} | ${cas} |`);
  }

  // precio/m² terreno (solo como referencia, con caveat de moneda)
  L.push(`\n**Precio/m² terreno (referencial — ver caveat de moneda):**\n`);
  L.push(`| Zona | Fuente | n | p25 | mediana | p75 |`);
  L.push(`|---|---|---:|---:|---:|---:|`);
  for (const z of zonas) for (const f of ['c21', 'remax']) {
    const ppm = listings.filter(p => p.zona === z && p.tipo === 'terreno' && p.fuente === f && p.precio_usd && p.area_terreno_m2)
      .map(p => Math.round(p.precio_usd / p.area_terreno_m2));
    if (!ppm.length) continue;
    L.push(`| ${z} | ${f} | ${ppm.length} | $${cuantil(ppm, .25)} | $${mediana(ppm)} | $${cuantil(ppm, .75)} |`);
  }

  // ---- NIVEL 2: CALIDAD (muestra detalle) ----
  L.push(`\n## 2. Calidad / suciedad (muestra del detalle)\n`);
  L.push(`Atributos que importan a un desarrollador, medidos sobre la muestra con descripción recuperada.\n`);
  L.push(`| Zona | Tipo | Fuente | Muestra | Desc. OK | Frente | (estruct.) | Uso suelo | Esquina | Demolible | Servicios |`);
  L.push(`|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const z of zonas) for (const t of tipos) for (const f of ['c21', 'remax']) {
    const g = calidad.filter(c => c.zona === z && c.tipo === t && c.fuente === f);
    if (!g.length) continue;
    const ok = g.filter(c => c.descRecuperada);
    if (!ok.length) { L.push(`| ${z} | ${t} | ${f} | ${g.length} | 0 | — | — | — | — | — | — |`); continue; }
    L.push(`| ${z} | ${t} | ${f} | ${g.length} | ${ok.length} | ${pctArr(ok, c => c.frente)}% | ${pctArr(ok, c => c.frente_estructurado)}% | ${pctArr(ok, c => c.uso)}% | ${pctArr(ok, c => c.esquina)}% | ${pctArr(ok, c => c.demolible)}% | ${pctArr(ok, c => c.servicios)}% |`);
  }

  // moneda sucia (C21)
  L.push(`\n### Suciedad de moneda (C21)\n`);
  const c21 = calidad.filter(c => c.fuente === 'c21' && c.descRecuperada);
  const ambiguos = c21.filter(c => c.moneda_listado === 'BOB' && c.txtUSD && !c.txtBOB);
  L.push(`- Muestra C21 con descripción: **${c21.length}**`);
  L.push(`- Casos con listado=\`BOB\` pero el texto habla en USD: **${ambiguos.length} (${pctArr(c21, c => c.moneda_listado === 'BOB' && c.txtUSD && !c.txtBOB)}%)** → precio/m² del listado NO confiable sin leer texto/detalle.`);
  L.push(`- Detalle C21 con \`moneda\` propia (USD/BOB): ${pctArr(c21, c => !!c.moneda_detalle)}% — el detalle ayuda a desambiguar.\n`);

  L.push(`\n## 3. Veredicto\n`);
  L.push(`_(completar a mano tras revisar las tablas)_\n`);
  L.push(`- Volumen suficiente para producto de suelo: …`);
  L.push(`- Campos confiables vs sucios: …`);
  L.push(`- Zona para empezar: …`);

  writeFileSync(join(dir, 'summary.md'), L.join('\n'));
}

export function nuevoDir(base) {
  const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const dir = join(base, 'output', ts);
  mkdirSync(join(dir, 'raw'), { recursive: true });
  return dir;
}
