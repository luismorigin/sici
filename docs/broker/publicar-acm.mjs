/* Genera la versión publicable del prototipo del ACM a partir de acm-prototipo.html.
 *
 *   node docs/broker/publicar-acm.mjs [destino.html]
 *
 * Publicar el prototipo tal cual no funciona por tres motivos, y cada uno tiene su
 * arreglo acá. Si mañana cambia el prototipo, se vuelve a correr esto — no se edita
 * a mano la copia, que es como se desincronizan las cosas.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEN = resolve(AQUI, 'acm-prototipo.html');
const DESTINO = resolve(process.argv[2] || resolve(AQUI, 'acm-publicable.html'));

let s = readFileSync(ORIGEN, 'utf8');
const antes = s.length;

// 1 · El wrapper (doctype, html, head, body) lo pone la plataforma al publicar.
s = s.slice(s.indexOf('<style>'), s.indexOf('</head>'))
   + s.slice(s.indexOf('<body>') + '<body>'.length, s.lastIndexOf('</body>'));

// 2 · La CSP del artifact bloquea todo host externo, incluidas las fuentes de Google.
//     Un <link> que no carga degrada en silencio a Times; mejor declarar una pila del
//     sistema. Figtree y DM Sans son geométricas humanistas y system-ui se les acerca.
const PILA = "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
s = s.replace(/font-family:'DM Sans',system-ui,sans-serif/g, `font-family:${PILA}`)
     .replace(/font-family:'Figtree',system-ui,sans-serif/g, `font-family:${PILA}`)
     .replace(/font-family:'Figtree'/g, `font-weight:700;font-family:${PILA}`)
     .replace(/font-family:Figtree;/g, `font-family:${PILA};`);

// 3 · El enlace ya lleva el análisis en el hash y se arma desde location.href, así que
//     publicado funciona solo. Solo se saca la nota que avisaba que era de ejemplo.
s = s.replace("'\\n\\n· En el prototipo el enlace es de ejemplo.'", "''");

for (const [que, mal] of [
  ['fuentes externas', /fonts\.(googleapis|gstatic)/],
  ['wrapper del documento', /<!DOCTYPE|<html|<\/body>/i],
]) if (mal.test(s)) throw new Error(`quedó sin resolver: ${que}`);
for (const [que, falta] of [
  ['el enlace con estado', /function linkAcm\(\)\{ return location\.href/],
  ['la apertura de compartidos', /abrirCompartido/],
]) if (!falta.test(s)) throw new Error(`falta en el publicable: ${que}`);

writeFileSync(DESTINO, s);
console.log(JSON.stringify({ origen: antes, publicable: s.length, destino: DESTINO }, null, 1));
