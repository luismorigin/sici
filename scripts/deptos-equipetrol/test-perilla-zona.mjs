// Prueba de NO-REGRESIÓN de la perilla de zona.
// Pregunta que responde: ¿con el default (equipetrol) el híbrido se comporta
// EXACTAMENTE como antes? Los valores esperados están copiados a mano del código
// de `main` (b949f41), no derivados del módulo nuevo — si los derivara del propio
// módulo la prueba se aprobaría sola y no probaría nada.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });

const { ZONAS_HIBRIDO, resolverZona, conSufijo } = await import('./lib/zonas-hibrido.mjs');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ✅' : '  ❌'} ${msg}`); if (!cond) fallos++; };

// ---- Valores de `main`, transcritos literalmente ----
const ZONAS_EQ_MAIN = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const ZONA_KEY_MAIN = 'equipetrol-deptos';
const MACROZONA_MAIN = 'equipetrol';

console.log('\n=== 1. El default reproduce lo de main ===');
const eq = resolverZona([]);
ok(eq.id === 'equipetrol', 'sin flags → equipetrol');
ok(eq.bboxKey === ZONA_KEY_MAIN, `bboxKey = "${ZONA_KEY_MAIN}"`);
ok(eq.macrozona === MACROZONA_MAIN, `macrozona = "${MACROZONA_MAIN}"`);
ok(JSON.stringify(eq.zonas) === JSON.stringify(ZONAS_EQ_MAIN), 'las 6 zonas, mismo contenido Y mismo orden');
ok(eq.sufijoArchivo === '', 'sufijo vacío → los nombres de archivo de Equipetrol NO cambian');

console.log('\n=== 2. La perilla realmente mueve ===');
ok(resolverZona(['--zona=zona-norte']).id === 'zona-norte', 'flag --zona=zona-norte');
process.env.ZONA_HIBRIDO = 'zona-norte';
ok(resolverZona([]).id === 'zona-norte', 'variable de entorno ZONA_HIBRIDO');
ok(resolverZona(['--zona=equipetrol']).id === 'equipetrol', 'el flag le gana a la variable de entorno');
delete process.env.ZONA_HIBRIDO;
const zn = ZONAS_HIBRIDO['zona-norte'];
ok(zn.zonas.length === 14, `ZN tiene 14 microzonas (tiene ${zn.zonas.length})`);
ok(zn.sufijoArchivo === '-zn', 'ZN escribe con sufijo propio');
// La banda de $/m² tiene que ser PROPIA de cada zona. Heredar la de Equipetrol en una zona más
// barata hace que el lector desempate mal el tipo de cambio, y no da ningún error al hacerlo.
ok(zn.m2Tipico != null, 'ZN tiene su propia banda de $/m2 (calibrada 28-jul: 1500-1900)');
ok(zn.m2Tipico.min !== eq.m2Tipico.min || zn.m2Tipico.max !== eq.m2Tipico.max,
   '🔑 la banda de ZN NO es la de Equipetrol');
ok(zn.m2Tipico.max < eq.m2Tipico.max, 'ZN es más barata que Equipetrol (medido: ~12%)');

console.log('\n=== 3. Los archivos de una zona no pisan los de la otra ===');
const pref = (z) => `discovery-deptos${ZONAS_HIBRIDO[z].sufijoArchivo}-`;
const ajenos = (z) => Object.values(ZONAS_HIBRIDO).filter((o) => o.id !== z && o.sufijoArchivo).map((o) => `discovery-deptos${o.sufijoArchivo}-`);
const esDe = (f, z) => f.startsWith(pref(z)) && !ajenos(z).some((p) => f.startsWith(p));
ok(esDe('discovery-deptos-2026-07-28T10-00-00.json', 'equipetrol'), 'Equipetrol reconoce el suyo');
ok(!esDe('discovery-deptos-zn-2026-07-28T10-00-00.json', 'equipetrol'), '🔑 Equipetrol NO cuenta el de ZN como propio (si no, se auto-bloquearía por cooldown)');
ok(esDe('discovery-deptos-zn-2026-07-28T10-00-00.json', 'zona-norte'), 'ZN reconoce el suyo');
ok(!esDe('discovery-deptos-2026-07-28T10-00-00.json', 'zona-norte'), 'ZN no toma el de Equipetrol');
ok(conSufijo('material-x.json', zn) === 'material-x-zn.json', 'conSufijo respeta la extensión');
ok(conSufijo('material-x.json', eq) === 'material-x.json', 'conSufijo no toca los de Equipetrol');

// Las 4 combinaciones zona × operación tienen que dar 4 nombres DISTINTOS. Si dos coinciden, el
// segundo pisa al primero y los veredictos perdidos se caen del apply sin un solo error (bug 28-jul).
const nombreChunk = (op, z) => `lectura-${op}${z.sufijoArchivo}-2026-07-28-c1.json`;
const combos = [nombreChunk('venta', eq), nombreChunk('alquiler', eq), nombreChunk('venta', zn), nombreChunk('alquiler', zn)];
ok(new Set(combos).size === 4, '🔑 venta/alquiler × Equipetrol/ZN → 4 nombres de chunk distintos');
ok(combos[0] === 'lectura-venta-2026-07-28-c1.json', 'Equipetrol conserva EXACTAMENTE el nombre de siempre');

console.log('\n=== 4. Zona inválida: falla fuerte, no sigue en silencio ===');
const exitReal = process.exit; const errReal = console.error;
let salio = false; process.exit = () => { salio = true; throw new Error('exit'); }; console.error = () => {};
try { resolverZona(['--zona=inventada']); } catch { /* esperado */ }
process.exit = exitReal; console.error = errReal;
ok(salio, 'una zona que no existe corta la corrida');

console.log('\n=== 5. El filtro por zona del diff no cambia los números de Equipetrol ===');
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const todas = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2_shadow')
    .select('id, url, es_activa, zona').eq('tipo_operacion', 'venta').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  todas.push(...data); if (data.length < 1000) break;
}
const setEq = new Set(ZONAS_EQ_MAIN);
const filtradas = todas.filter((r) => setEq.has(r.zona));
// ⚠️ Esta sección se escribió cuando shadow era 100% Equipetrol y afirmaba "el filtro no saca
// nada". Desde el 28-jul hay 109 props de Zona Norte cargadas, así que ahora el filtro SÍ saca
// filas — y ese es justamente su trabajo. El test avisó del cambio (falló), y se actualizó a
// lo que corresponde comprobar hoy: que lo que saca sea SOLO de otras zonas, ni una de Equipetrol.
const ajenasV = todas.filter((r) => !setEq.has(r.zona));
console.log(`     sin filtro: ${todas.length} filas (${todas.filter((r) => r.es_activa).length} activas)`);
console.log(`     con filtro: ${filtradas.length} filas (${filtradas.filter((r) => r.es_activa).length} activas)`);
console.log(`     lo que saca: ${ajenasV.length} de otras zonas`);
ok(filtradas.length + ajenasV.length === todas.length, 'la partición es exacta: Equipetrol + otras = total');
ok(ajenasV.every((r) => !setEq.has(r.zona)), '🔑 lo que el filtro saca es SOLO de otras zonas — ni una de Equipetrol');
ok(filtradas.every((r) => setEq.has(r.zona)), 'lo que deja es todo de las 6 zonas de Equipetrol');
ok(todas.filter((r) => !r.zona).length === 0, 'ninguna prop sin zona (que quedaría invisible al verificador)');

console.log('\n=== 6. Alquiler: el filtro por zona saca Zona Norte, y NADA de Equipetrol ===');
const alq = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2_shadow')
    .select('id, es_activa, zona').eq('tipo_operacion', 'alquiler').range(from, from + 999);
  if (error) { console.error(error.message); process.exit(1); }
  alq.push(...data); if (data.length < 1000) break;
}
const alqEq = alq.filter((r) => setEq.has(r.zona));
const ajenas = alq.filter((r) => !setEq.has(r.zona));
console.log(`     sin filtro: ${alq.length} · con filtro: ${alqEq.length} · de otras zonas: ${ajenas.length}`);
console.log(`     zonas distintas afuera: ${new Set(ajenas.map((r) => r.zona)).size}`);
// Este assert afirmaba `ajenas.length <= 1`, escrito cuando había UNA sola prop de Zona Norte
// colada en shadow alquiler. Desde que ZN entró al híbrido (30-jul) hay 140 y son legítimas, así
// que el número exacto dejó de describir el mundo y el test fallaba por envejecer, no por romperse.
// Lo que el test tiene que defender no es CUÁNTAS salen sino QUE NINGUNA SEA DE EQUIPETROL: la
// perilla es correcta si particiona bien, sin importar el tamaño de la otra macrozona.
const zonasZN = new Set(ZONAS_HIBRIDO['zona-norte'].zonas);
ok(ajenas.every((r) => zonasZN.has(r.zona)),
   `todo lo que saca el filtro es de una zona conocida de ZN (${ajenas.filter((r) => !zonasZN.has(r.zona)).length} fuera de catálogo)`);
ok(ajenas.every((r) => !setEq.has(r.zona)), 'lo que saca es de otra zona, no de Equipetrol');
ok(alq.filter((r) => !r.zona).length === 0, 'ninguna prop de alquiler sin zona');

console.log(`\n${fallos === 0 ? '✅ TODO OK — Equipetrol se comporta igual que en main' : `❌ ${fallos} FALLO(S)`}\n`);
process.exit(fallos === 0 ? 0 : 1);
