/* Genera la copia que se sirve desde simonbo.com a partir del prototipo.
 *
 *   node docs/broker/preparar-para-web.mjs
 *   → simon-mvp/public/acm-b7k2.html
 *
 * Dos diferencias con el archivo de trabajo, y las dos importan:
 *
 * 1. Sin las fotos embebidas. En el archivo suelto son el único modo de que se vean
 *    (no hay servidor que las sirva). Servido desde simonbo.com el pool vivo las trae
 *    del CDN, así que arrastrar 1 MB de data URI solo hace más lenta la primera carga
 *    en el celular del cliente. Si el endpoint no responde tampoco habría fotos —
 *    pero si no responde, este archivo tampoco se habría descargado.
 *
 * 2. Con noindex. Esto no es una página de marketing: es un documento con el nombre de
 *    un broker y el precio de la casa de alguien. No tiene por qué estar en Google.
 *
 * El nombre lleva un sufijo poco adivinable: mismo nivel de protección que las
 * shortlists, que es el que el producto ya eligió.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEN = resolve(AQUI, 'acm-prototipo.html');
const DESTINO = resolve(AQUI, '../../simon-mvp/public/acm-b7k2.html');

let s = readFileSync(ORIGEN, 'utf8');
const antes = s.length;

// 1 · fuera las fotos embebidas (el pool vivo las trae)
const i = s.indexOf('var FOTOS_AV_RAW=`');
if (i < 0) throw new Error('no encontré las fotos embebidas');
const j = s.indexOf('`;', i) + 2;
s = s.slice(0, i) + 'var FOTOS_AV_RAW=``; /* servido: las fotos llegan con el pool vivo */' + s.slice(j);

const k = s.indexOf('var FOTOS_RAW=`');
const l = s.indexOf('`;', k) + 2;
s = s.slice(0, k) + 'var FOTOS_RAW=``;' + s.slice(l);

// 2 · noindex
if (!s.includes('name="robots"')) {
  s = s.replace('<meta name="viewport"',
    '<meta name="robots" content="noindex,nofollow">\n<meta name="viewport"');
}

for (const [que, mal] of [
  ['fotos embebidas', /data:image\/jpeg;base64/],
  ['noindex', /^(?!.*name="robots")/s],
]) if (mal.test(s)) throw new Error(`quedó sin resolver: ${que}`);

writeFileSync(DESTINO, s);
console.log(JSON.stringify({
  origenKB: Math.round(antes / 1024), servidoKB: Math.round(s.length / 1024), destino: DESTINO,
}));
