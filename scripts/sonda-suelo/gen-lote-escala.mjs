// Selecciona las casas ZN que faltan cargar (universo 264 menos las 62 ya cargadas, ruido y baja calidad)
// y las reparte en sublotes de 15 para procesar por tandas. Escribe lote-escala-casas.json.
import fs from 'node:fs';
const DIR = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const full = JSON.parse(fs.readFileSync(`${DIR}/casas-zn-full.json`, 'utf8'));
const piloto = JSON.parse(fs.readFileSync(`${DIR}/lote-piloto-casas.json`, 'utf8'));

// idx del piloto (39 cargadas + idx 1 anticretico que NO se carga pero ya fue evaluado)
const idxPiloto = new Set(piloto.map((c) => c.idx));
idxPiloto.add(1); // anticretico, excluir del escalado tambien

// identificadores de URL de las 23 cargadas el 19-jun
const ID23 = ['112121','105352','103551','107583','106414',
  '1200164217-37','120033133-30','125001007-1624','120033054-98','125001005-1550',
  '1200646343-1','120107313-4','120034113-66','120040111-15','125001359-20',
  '1200796309-5','1200164217-59','120099002-261','120034083-38','1200164217-35',
  '120033133-23','1250013600-5','120034064-108'];
const cargada23 = (url) => ID23.some((id) => url.includes(id));

// ruido fuera de ZN (por texto)
const RUIDO = /urub[oó]|zona este|palma verde|cartago/i;

let excl_cargada = 0, excl_ruido = 0, excl_calidad = 0;
const restantes = [];
for (const c of full) {
  if (idxPiloto.has(c.idx) || cargada23(c.url)) { excl_cargada++; continue; }
  if (RUIDO.test(c.descripcion || '')) { excl_ruido++; continue; }
  const area = Number(c.area_const_m2);
  if (!area || area <= 0 || !c.precio_raw) { excl_calidad++; continue; }
  restantes.push(c);
}

// repartir en sublotes de 15
const SUB = 15;
restantes.forEach((c, i) => { c.sublote = Math.floor(i / SUB); });
fs.writeFileSync(`${DIR}/lote-escala-casas.json`, JSON.stringify(restantes, null, 1), 'utf8');

const nSub = Math.ceil(restantes.length / SUB);
console.log(`Universo full: ${full.length}`);
console.log(`Excluidas -> ya cargadas: ${excl_cargada} | ruido fuera ZN: ${excl_ruido} | baja calidad: ${excl_calidad}`);
console.log(`RESTANTES a cargar: ${restantes.length}  (en ${nSub} sublotes de ${SUB})`);
const porFuente = restantes.reduce((a, c) => ((a[c.fuente] = (a[c.fuente] || 0) + 1), a), {});
console.log(`Por fuente:`, porFuente);
