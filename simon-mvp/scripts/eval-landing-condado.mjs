#!/usr/bin/env node
/**
 * Eval determinista de la landing Condado VI v2.
 *
 * Es la SEÑAL del loop de optimización: mide lo que optimizamos (peso de assets)
 * y los guardrails (refs rotas). Es $0, instantáneo y repetible (mismo input ->
 * mismo número). NO usa red ni navegador.
 *
 * Uso:  node scripts/eval-landing-condado.mjs
 * Salida: scorecard JSON por stdout.
 *
 * Campos:
 *   referenced_assets_kb : peso de las imágenes REFERENCIADAS en el .tsx (lo que minimizamos)
 *   referenced_count     : cuántas imágenes distintas referencia la página
 *   broken_assets        : GUARDRAIL — refs a archivos que NO existen (debe ser 0)
 *   dir_total_kb         : peso de TODO public/condado-vi-v2 (incluye huérfanos)
 *   heaviest             : top 5 assets referenciados más pesados (dónde está el ahorro)
 */
import { readFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');                       // simon-mvp/
const TSX = join(ROOT, 'src', 'pages', 'condado-vi-v2.tsx');
const PUBDIR = join(ROOT, 'public', 'condado-vi-v2');

const src = readFileSync(TSX, 'utf8');
const RE = /\/condado-vi-v2\/[A-Za-z0-9\-_.\/]+\.(?:jpg|jpeg|png|webp|avif|svg)/gi;
const refs = [...new Set(src.match(RE) || [])];

let referencedBytes = 0;
const broken = [];
const sizes = [];
for (const ref of refs) {
  const fp = join(ROOT, 'public', ref.replace(/^\//, ''));
  if (existsSync(fp)) {
    const s = statSync(fp).size;
    referencedBytes += s;
    sizes.push({ asset: ref, kb: Math.round(s / 1024) });
  } else {
    broken.push(ref);
  }
}

function walk(dir) {
  let total = 0, count = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { const r = walk(p); total += r.total; count += r.count; }
    else { total += statSync(p).size; count++; }
  }
  return { total, count };
}
const dir = existsSync(PUBDIR) ? walk(PUBDIR) : { total: 0, count: 0 };

const KB = (b) => Math.round(b / 1024);
const scorecard = {
  referenced_assets_kb: KB(referencedBytes),
  referenced_count: refs.length,
  broken_assets: broken.length,
  broken_list: broken,
  dir_total_kb: KB(dir.total),
  dir_file_count: dir.count,
  heaviest: sizes.sort((a, b) => b.kb - a.kb).slice(0, 5),
};
console.log(JSON.stringify(scorecard, null, 2));
