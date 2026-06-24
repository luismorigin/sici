// Consolida el catálogo FINAL: GPS verificados a mano por el founder (Google Maps) + amenidades del curado.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const curado = JSON.parse(readFileSync(join(__dirname, 'catalogo-condominios-zn-curado.json'), 'utf8')).catalogo;

// GPS verificados manualmente por el founder en Google Maps (18-jun)
const FOUNDER = [
  ['Portales del Norte', -17.685713887133215, -63.15270765939941],
  ['Alameda Fontana', -17.686821190164352, -63.14379393183785],
  ['Sevilla Las Terrazas 2', -17.680745807123348, -63.146039670655455],
  ['Sevilla Los Jardines', -17.681427194968208, -63.148823030277796],
  ['Sevilla Pinatar', -17.67924973659209, -63.14443339863018],
  ['Sevilla El Bosque', -17.67798817751489, -63.14301373017035],
  ['Sevilla Las Terrazas', -17.682875610250026, -63.15370371366094],
  ['La Fontana Riviera 1', -17.69619752465895, -63.130760681646954],
  ['La Fontana Riviera 2', -17.69663402374161, -63.131254106210235],
  ['Sevilla Real', -17.69455162077953, -63.14197431730065],
  ['Sevilla Norte I', -17.696061286071725, -63.15442674446833],
  ['Sevilla Norte II', -17.695860504792204, -63.15797944688464],
  ['Barcelona', -17.69543742921835, -63.15590201920053],
  ['Barceló Residence Club', -17.68961018948805, -63.161363059987615],
  ['Versalles', -17.69923630718445, -63.16895850256825],
  ['La Pradera', -17.701193451102245, -63.17783225828186],
  ['Brisas del Norte I', -17.70259095268365, -63.17850018601852],
  ['Colonial Norte', -17.702132040405235, -63.17426253461941],
  ['Valle Norte II', -17.70367395247375, -63.16878771148943],
  ['Riviera II', -17.705031918454665, -63.186930516326996],
  ['Riviera del Remanso I', -17.706414720186302, -63.18487513497416],
  ['Jardines de la Riviera', -17.707668042397987, -63.18665071653461],
  ['Riviera del Remanso A', -17.707696723566272, -63.18467866553561],
  ['Riviera del Remanso - Paraíso 1', -17.70875782961096, -63.18775086872514],
  ['Los Jardines', -17.710370676485613, -63.169240778000756],
  ['Florencia', -17.734816541373334, -63.16475919749163],
];
// confirmados por el founder con el GPS que ya teníamos (centroide)
const CONFIRMADOS_MIO = ['Bosques de la Colina', 'Paraiso Norte 1', 'La Fontana Family Club'];

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(condominio|cond|urbanizacion|urb)\b/g, '').replace(/sevillas/g, 'sevilla')
  .replace(/\bii\b/g, '2').replace(/\biii\b/g, '3').replace(/\bi\b/g, '1')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

const amenById = new Map(curado.map(c => [norm(c.nombre), c.amenidades || []]));
const getAmen = (n) => amenById.get(norm(n)) || [];

const final = [];
// 1) los del founder (GPS manual verdad)
for (const [nombre, lat, lon] of FOUNDER) {
  final.push({ nombre, gps: { lat, lon }, fuente_gps: 'founder_gmaps', amenidades: getAmen(nombre), nuevo: !amenById.has(norm(nombre)) });
}
// 2) confirmados por founder, GPS centroide nuestro
for (const nombre of CONFIRMADOS_MIO) {
  const c = curado.find(x => norm(x.nombre) === norm(nombre));
  if (c) final.push({ nombre: c.nombre, gps: c.gps_centroide, fuente_gps: 'centroide_confirmado_founder', amenidades: c.amenidades, nuevo: false });
}
// 3) mis verificados que el founder NO mencionó (mantener, GPS centroide/OSM)
const clavesFinal = new Set(final.map(f => norm(f.nombre)));
for (const c of curado.filter(x => x.veredicto === 'verificado')) {
  if (!clavesFinal.has(norm(c.nombre))) {
    final.push({ nombre: c.nombre, gps: c.gps_centroide, fuente_gps: 'verificado_web_sin_revision_manual', amenidades: c.amenidades, nuevo: false });
    clavesFinal.add(norm(c.nombre));
  }
}

const conAmen = final.filter(f => f.amenidades.length).length;
const nuevos = final.filter(f => f.nuevo).length;
writeFileSync(join(__dirname, 'catalogo-condominios-zn-FINAL.json'), JSON.stringify({
  generado: new Date().toISOString(), total: final.length,
  con_gps_manual: FOUNDER.length, con_amenidades: conAmen, nuevos_sin_amenidades: nuevos, catalogo: final,
}, null, 2));

console.log(`\n🏁 CATÁLOGO FINAL — ${final.length} condominios`);
console.log(`   GPS manual founder: ${FOUNDER.length} · con amenidades: ${conAmen} · nuevos a completar amenidades: ${nuevos}\n`);
for (const f of final) {
  const t = f.fuente_gps === 'founder_gmaps' ? '📍' : f.fuente_gps.startsWith('centroide') ? '✅' : '🌐';
  console.log(`${t} ${f.nombre}${f.nuevo ? ' 🆕' : ''}  ${f.amenidades.length ? '['+f.amenidades.length+' amen]' : '(sin amenidades)'}`);
}
console.log(`\n💾 catalogo-condominios-zn-FINAL.json`);
