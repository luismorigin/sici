/* Arregla los enlaces que abrían OTRA propiedad.
 *
 * Los mapas de id-de-ficha y de aviso-original estaban indexados por `precio-area`, y
 * esa clave es ambigua: dos avisos de edificios distintos pueden coincidir en precio y
 * superficie. En este pool pasa 8 veces, y el síntoma es el peor posible — el
 * comparable dice "Sky Tower · 55 m² · $110.000" y el enlace abre "Maré · 55 m² ·
 * $110.000". Un enlace que abre otra propiedad es peor que no tener enlace.
 *
 * La corrección agrega un mapa de desempate indexado por `edificio|precio|area` que se
 * consulta PRIMERO. Solo hace falta para las claves en conflicto; el resto sigue
 * resolviéndose por la clave simple.
 *
 *   node docs/broker/desambiguar-enlaces.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const HTML = resolve(AQUI, 'acm-prototipo.html');
const DESEMPATE = readFileSync(resolve(AQUI, 'desempate-enlaces.txt'), 'utf8').trim().replace(/\r/g, '');

let s = readFileSync(HTML, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const bloque = [
  '',
  '/* ═══════ DESEMPATE — clave edificio|precio|area ═══════',
  '   Los mapas de arriba se indexan por precio-area, y esa clave es ambigua: hay 8 pares',
  '   de avisos de edificios distintos que coinciden en precio y superficie. Con la clave',
  '   simple, el enlace de "Sky Tower · 55 m² · $110.000" abría "Maré · 55 m² · $110.000".',
  '   Este mapa se consulta primero y solo contiene esos casos. */',
  'var DESEMPATE_RAW=`' + DESEMPATE + '`;',
  'var DESEMPATE={};DESEMPATE_RAW.trim().split(String.fromCharCode(10)).forEach(function(l){',
  "  var f=l.split('|');",
  "  DESEMPATE[f[0].trim()+'|'+f[1]+'|'+f[2]]={id:f[3],u:f[4]};});",
  "function desempate(p){return DESEMPATE[String(p.e).trim()+'|'+Math.round(p.p)+'|'+Math.round(p.a)]||null;}",
  '',
].join(nl);

const ancla = s.indexOf('/* ═══════ FOTO DEL AVISO');
if (ancla < 0) throw new Error('no encontré dónde insertar el desempate');
s = s.slice(0, ancla) + bloque + s.slice(ancla);

// fichaDe y avisoDe consultan el desempate antes que la clave simple
const fichaVieja = /function fichaDe\(p\)\{ if\(p\.dias>DIAS_FEED\)return null;\r?\n\s*var id=IDS\[[^\]]+\];\r?\n\s*return id\? 'https:\/\/simonbo\.com\/ventas\?id='\+id : null;\}/;
if (!fichaVieja.test(s)) throw new Error('fichaDe cambió de forma');
s = s.replace(fichaVieja, [
  'function fichaDe(p){ if(p.dias>DIAS_FEED)return null;',
  "  var d=desempate(p), id=d? d.id : IDS[Math.round(p.p)+'-'+Math.round(p.a)];",
  "  return id? 'https://simonbo.com/ventas?id='+id : null;}",
].join(nl));

const avisoViejo = "function avisoDe(p){return URLS[Math.round(p.p)+'-'+Math.round(p.a)]||null;}";
if (!s.includes(avisoViejo)) throw new Error('avisoDe cambió de forma');
s = s.replace(avisoViejo, [
  'function avisoDe(p){',
  "  var d=desempate(p), u=d? d.u : URLS_CRUDO[Math.round(p.p)+'-'+Math.round(p.a)];",
  "  if(!u)return null;",
  "  return (u.charAt(0)==='c'?'https://c21.com.bo/propiedad/':'https://remax.bo/propiedad/')+u.slice(1);}",
].join(nl));

// URLS guardaba la URL ya armada; ahora hace falta el código crudo para poder mezclarlo
const parseoViejo = /var URLS=\{\};URLS_RAW\.trim\(\)[^\n]*\r?\n[^\n]*\r?\n/;
if (!parseoViejo.test(s)) throw new Error('el parseo de URLS cambió de forma');
s = s.replace(parseoViejo,
  "var URLS_CRUDO={};URLS_RAW.trim().split(String.fromCharCode(10)).forEach(function(l){" +
  "var i=l.indexOf('|');URLS_CRUDO[l.slice(0,i)]=l.slice(i+1);});" + nl);

writeFileSync(HTML, s);
console.log(JSON.stringify({ desempates: DESEMPATE.split('\n').length, bytes: s.length }));
