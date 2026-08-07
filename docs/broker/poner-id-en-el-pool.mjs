/* Mete el id de cada aviso en la fila del POOL y reindexa por id los tres mapas
 * auxiliares (ficha, aviso original, fecha de entrega) más el de fotos.
 *
 * Por qué: hasta ahora esos mapas se consultaban por `precio-area`, y esa clave es
 * ambigua — dos avisos de edificios distintos pueden coincidir en ambos. Ya nos costó
 * un bug donde el comparable decía "Sky Tower" y el enlace abría "Maré". Parchear la
 * clave (agregarle el edificio) tapa el síntoma; el arreglo real es que cada fila
 * traiga su identificador y no haya que adivinar nada.
 *
 * Se corre UNA vez sobre el prototipo. Idempotente: si el POOL ya tiene id, no hace nada.
 *
 *   node docs/broker/poner-id-en-el-pool.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HTML = resolve(dirname(fileURLToPath(import.meta.url)), 'acm-prototipo.html');
let s = readFileSync(HTML, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const leerBloque = (nombre) => {
  const i = s.indexOf(`var ${nombre}=\``);
  if (i < 0) throw new Error(`no encontré ${nombre}`);
  const ini = s.indexOf('`', i) + 1, fin = s.indexOf('`;', ini);
  return { ini, fin, lineas: s.slice(ini, fin).trim().replace(/\r/g, '').split('\n') };
};

const pool = leerBloque('RAW');
if (pool.lineas[0].split('|').length > 14) { console.log('el POOL ya tiene id — nada que hacer'); process.exit(0); }

const aMapa = (nombre) => Object.fromEntries(
  leerBloque(nombre).lineas.map((l) => { const i = l.indexOf('|'); return [l.slice(0, i), l.slice(i + 1)]; }));
const IDS = aMapa('IDS_RAW'), URLS = aMapa('URLS_RAW');
const ENT = aMapa('ENTREGAS_RAW'), FOT = aMapa('FOTOS_AV_RAW');

// el desempate manda: es el único que distingue dos avisos con igual precio y superficie
const DES = {};
for (const l of leerBloque('DESEMPATE_RAW').lineas) {
  const f = l.split('|');
  DES[`${f[0].trim()}|${f[1]}|${f[2]}`] = { id: f[3], u: f[4] };
}

const nuevoPool = [], ids = {}, urls = {}, ents = {}, fotos = {};
let sinId = 0;
for (const linea of pool.lineas) {
  const f = linea.split('|');
  const [e, , , , a, p] = [f[0].trim(), f[1], f[2], f[3], f[4], f[5]];
  const clave = `${Math.round(+p)}-${Math.round(+a)}`;
  const d = DES[`${e}|${Math.round(+p)}|${Math.round(+a)}`];
  const id = d ? d.id : IDS[clave];
  if (!id) sinId++;
  nuevoPool.push(`${id || ''}|${linea}`);
  if (!id) continue;
  const u = d ? d.u : URLS[clave];
  if (u) urls[id] = u;
  if (ENT[clave]) ents[id] = ENT[clave];
  if (FOT[clave]) fotos[id] = FOT[clave];
}

const serializar = (o) => Object.entries(o).map(([k, v]) => `${k}|${v}`).join(nl);

// reemplazos de atrás hacia adelante para no invalidar los índices
const cambios = [
  ['FOTOS_AV_RAW', serializar(fotos)],
  ['ENTREGAS_RAW', serializar(ents)],
  ['URLS_RAW', serializar(urls)],
  ['RAW', nuevoPool.join(nl)],
].map(([n, v]) => ({ ...leerBloque(n), v })).sort((x, y) => y.ini - x.ini);
for (const c of cambios) s = s.slice(0, c.ini) + c.v + s.slice(c.fin);

console.log(JSON.stringify({
  filas: nuevoPool.length, sinId, urls: Object.keys(urls).length,
  entregas: Object.keys(ents).length, fotos: Object.keys(fotos).length,
}));
writeFileSync(HTML, s);
