#!/usr/bin/env node
/**
 * Iteración 1 del loop de perf: recomprime + redimensiona in-place los JPG de la landing.
 *
 * - Máx 2400px de ancho (withoutEnlargement: nunca upscalea)
 * - Calidad 80 mozjpeg (guardrail min_quality)
 * - .rotate() para hornear la orientación EXIF antes de strippear metadata
 * - Mantiene el nombre .jpg -> CERO cambios en el .tsx (broken_assets sigue 0)
 *
 * Git es la red de seguridad: revertir = git checkout -- public/condado-vi-v2
 *
 * Uso:  node scripts/optimize-images-condado.mjs [--dry]
 */
import sharp from 'sharp';
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, '..', 'public', 'condado-vi-v2');
const MAX_W = 2400;
const Q = 80;
const dry = process.argv.includes('--dry');

const files = readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f));
let before = 0, after = 0;
const rows = [];

for (const f of files) {
  const fp = join(DIR, f);
  const origBytes = statSync(fp).size;
  const input = readFileSync(fp);
  const meta = await sharp(input).metadata();
  const out = await sharp(input)
    .rotate()
    .resize({ width: MAX_W, withoutEnlargement: true })
    .jpeg({ quality: Q, mozjpeg: true })
    .toBuffer();
  if (!dry) writeFileSync(fp, out);
  before += origBytes;
  after += out.length;
  rows.push({
    f,
    w_before: meta.width,
    w_after: Math.min(meta.width ?? MAX_W, MAX_W),
    kb_before: Math.round(origBytes / 1024),
    kb_after: Math.round(out.length / 1024),
    saved_kb: Math.round((origBytes - out.length) / 1024),
  });
}

rows.sort((a, b) => b.saved_kb - a.saved_kb);
console.log(JSON.stringify({
  mode: dry ? 'DRY-RUN (sin escribir)' : 'APLICADO',
  files: files.length,
  mb_before: +(before / 1048576).toFixed(2),
  mb_after: +(after / 1048576).toFixed(2),
  saved_mb: +((before - after) / 1048576).toFixed(2),
  saved_pct: Math.round((1 - after / before) * 100),
  top: rows.slice(0, 12),
}, null, 2));
