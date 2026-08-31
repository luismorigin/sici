// ============================================================================
// AUDIT DE COLA / MATCHING — versión SHADOW (híbrido)  ·  $0, read-only
// ----------------------------------------------------------------------------
// Port alineado de /audit-cola-matching al feed híbrido. El doc AUDITORIAS_POST_CUTOVER.md
// §"/audit-cola-matching — MUDA DE TABLA": la cola `matching_sugerencias` NO existe para el
// híbrido (matchea en el --apply). El VALOR reutilizable no es la cola, es el patrón
//   leer el anuncio → subagente-lector JUEZ → cruce contra proyectos_master+GPS → SQL con candados.
// Cambio quirúrgico: en vez de `getColaPendiente`, leemos las DOS SUPERFICIES de shadow.
//
// Ventaja vs el audit-cola de prod: shadow YA guarda el anuncio que el reader juzgó
// (`datos_json.contenido.descripcion`) → el juez lee de ahí, SIN re-fetch → $0 y sin riesgo de IP.
//
// SUPERFICIES (las que el doc nombra):
//   1) SIN MATCH con nombre  → id_proyecto_master IS NULL AND nombre_edificio IS NOT NULL
//        (metodo sin_match/fuzzy_debil/ambiguo) → candidatos PM_NUEVO / fuzzy débil.
//   2) AUTO-MATCH RIESGOSO   → datos_json.trazabilidad.metodo_match = 'nombre_unico_zona_dif'
//        (confianza 85, nombre único exacto pero ZONA ≠ → falsos positivos: Sky Luxury/Maré/Uptown Drei).
//
// El .mjs es FILTRO, no juez: trae las superficies + candidatos fuzzy + GPS. El VEREDICTO
// (aprobar/corregir/rechazar/pm-nuevo) lo dan subagentes-lectores. El SQL lo aplica el humano
// contra propiedades_v2_shadow (candado IS NULL sup.1 / formato-objeto sup.2).
//
// Uso:
//   node auditar-matching-shadow.mjs                  # ambas operaciones, SOLO Equipetrol
//   node auditar-matching-shadow.mjs --op venta
//   node auditar-matching-shadow.mjs --op alquiler --limit 40
//   node auditar-matching-shadow.mjs --zona=zona-norte  # auditar ZN (ver abajo)
//   node auditar-matching-shadow.mjs --zona=todas       # auditar todo lo que haya en shadow
//   node auditar-matching-shadow.mjs --sin-guarda     # saltear la guarda de orden (ver abajo)
// Salida: output/audit-matching-shadow-<ts>.json (superficies para el juez) + summary.
//
// 🎛️ ALCANCE POR ZONA (29-jul-2026) — default `equipetrol`, igual que el resto del híbrido.
// Cuando entraron 188 props de Zona Norte a shadow por el flujo manual, este audit pasó de 2 a
// 26 casos en superficie 1 de una noche a la otra. No se rompió nada: `proyectos_master` se
// construyó para Equipetrol y casi no conoce edificios de ZN, así que afloran todos juntos como
// PM_NUEVO. Pero el audit NOCTURNO es desatendido y su salida son pendientes para el humano:
// mezclar el goteo real de Equipetrol con el arrastre de una zona a medio releer hace que lo
// urgente se pierda entre lo esperado. ZN se audita aparte y a propósito, con --zona=zona-norte,
// cuando la zona esté cargada entera o casi.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectarDuplicados } from '../auditoria-feed-ventas/lib/dup-checks.mjs';
import { ZONAS_HIBRIDO } from './lib/zonas-hibrido.mjs';
import { nucleo } from './lib/filtrar-alias.mjs';   // normaliza nombres de edificio (sin acentos ni prefijo)

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const opArg = (() => { const i = argv.indexOf('--op'); return i >= 0 ? argv[i + 1] : 'ambos'; })();
const OPS = opArg === 'venta' ? ['venta'] : opArg === 'alquiler' ? ['alquiler'] : ['venta', 'alquiler'];
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? Number(argv[i + 1]) : null; })();
const SIN_GUARDA = argv.includes('--sin-guarda');
// 🔁 --si-falta: modo REINTENTO AGENDADO. Sale sin hacer nada si el audit de hoy ya corrió
// con las 4 capturas presentes, o si todavía faltan capturas por correr. Pensado para
// agendarse varias veces al día: el primer disparo que encuentre las 4 corre y deja marca;
// los demás salen en segundos. Nace del 21-ago-2026, cuando el audit se disparó 09:01 y las
// 4 capturas 09:06-09:11 — la guarda lo detectó y abortó, pero el re-corrido fue a mano.
// 🔑 Se agenda EL AUDIT varias veces en vez de que la última captura lo llame: si esa captura
// falla o la cadena se desordena, un audit que depende de ella no corre nunca.
const SI_FALTA = argv.includes('--si-falta');
// 🧬 --solo-colisiones: corre SOLO la superficie 11 (el chequeo del CATÁLOGO) y sale.
// No lee propiedades, no toca la bandeja `audit_hallazgos` y NO deja la marca de audit
// completo del día — o sea, no le miente a los reintentos agendados. Sirve para revisar
// el catálogo en cualquier momento sin correr el audit entero.
const SOLO_COLISIONES = argv.includes('--solo-colisiones');
let guardaGlobal = null, marcaCompletaGlobal = null;   // los usa el cierre para dejar la marca del dia
let AVISO_ALCANCE = null;   // se llena si faltan capturas: se repite al final del resumen

// --zona=<id> · default 'equipetrol' (el audit nocturno no pasa nada → sigue auditando Equipetrol).
// 'todas' = sin filtro, para cuando prod y shadow sean lo mismo (post-cutover).
const ZONA_ID = (() => {
  const a = argv.find((x) => x.startsWith('--zona='));
  return a ? a.slice('--zona='.length) : (process.env.ZONA_HIBRIDO || 'equipetrol');
})();
if (ZONA_ID !== 'todas' && !ZONAS_HIBRIDO[ZONA_ID]) {
  // Falla fuerte, no en silencio: una zona mal escrita auditando "todo" sería peor que no correr.
  console.error(`\n🛑 Zona desconocida: "${ZONA_ID}". Válidas: ${Object.keys(ZONAS_HIBRIDO).join(', ')}, todas\n`);
  process.exit(2);
}
const ZONAS_FILTRO = ZONA_ID === 'todas' ? null : ZONAS_HIBRIDO[ZONA_ID].zonas;

// ---------------------------------------------------------------------------
// 🔒 GUARDA DE ORDEN — el audit DEBE correr después de las capturas de esa noche.
// ---------------------------------------------------------------------------
// El 24-jul-2026 la máquina estuvo apagada durante la ventana nocturna (01:17–03:10) y el
// scheduler lanzó las 3 routines JUNTAS al arrancar. El audit ganó la carrera: corrió a las
// 04:19 y las capturas a las 06:37. Auditó el inventario de la víspera y reportó
// "superficie 1 = 0 · nada que aplicar" — cierto sobre lo que vio, y falso sobre la noche.
// Se perdió los 3 casos capturados esa madrugada y nadie se enteró, porque el log decía que
// todo estaba limpio. Ese es el peor modo de falla: no romperse, sino mentir en verde.
//
// Marcador de "las capturas ya corrieron hoy": el snapshot diario (paso 5c), que escriben
// AMBAS capturas y es idempotente. No sirve mirar si hay props nuevas: una noche sin altas
// es perfectamente normal y no distingue "no había nada" de "no corrió".
// 🔴 CORREGIDO 20-ago-2026 — el snapshot NO distingue CUÁL captura corrió.
// Las 4 capturas ejecutan el paso 5c y el snapshot es idempotente, así que con que UNA
// corriera, la guarda vieja daba OK. El 19-ago habían corrido 3 de 4 (faltaba alquiler ZN,
// que cerró 12 min DESPUÉS de este audit): la guarda pasó, el audit declaró
// "0 en las 7 superficies" y había 2 props sin match que no podía ver. Un cero parcial es
// peor que un error, porque se lee como "está todo bien".
// Ahora se verifica CADA captura por su propio log: cada routine appendea una entrada
// `## <fecha>` al suyo. Es un marcador conservador a propósito (el log se escribe al final
// de la sesión, después de que la captura terminó), y eso es exactamente lo que queremos.
const LOGS_CAPTURA = [
  ['venta Equipetrol',    'cron-deptos-ventas-log.md'],
  ['alquiler Equipetrol', 'cron-deptos-alquiler-log.md'],
  ['venta Zona Norte',    'cron-deptos-ventas-zn-log.md'],
  ['alquiler Zona Norte', 'cron-deptos-alquiler-zn-log.md'],
];

async function capturasDeHoyCorrieron() {
  const ahora = new Date(); // la máquina del founder corre en hora de Bolivia
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const corrieron = [], faltan = [];
  for (const [nombre, archivo] of LOGS_CAPTURA) {
    let tiene = false;
    try {
      // Se busca el ENCABEZADO de hoy en TODO el archivo, no en la cabecera: el log de
      // alquiler Equipetrol appendea abajo y los otros arriba (verificado el 19-ago, su
      // entrada del día estaba en la línea 2218). Una posición fija leería la noche equivocada.
      const txt = readFileSync(join(OUT, archivo), 'utf8');
      tiene = new RegExp(String.raw`^##\s+` + hoy, 'm').test(txt);
    } catch { tiene = false; }   // log inexistente = esa captura nunca corrió
    (tiene ? corrieron : faltan).push(nombre);
  }
  // ok = corrieron LAS 4. Ninguna = caso original (el audit le ganó la carrera a todas).
  return { ok: faltan.length === 0, ninguna: corrieron.length === 0, hoy, corrieron, faltan };
}

// Métodos que marcan AUTO-MATCH RIESGOSO (surface 2). El matcher híbrido pone confianza 85 +
// metodo 'nombre_unico_zona_dif' cuando el nombre es único exacto pero la zona no corrobora.
const METODOS_RIESGO = new Set(['nombre_unico_zona_dif']);
const slugDe = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '') : null);
// 🔗 La URL va SIEMPRE junto al id en la salida: un id suelto obliga a ir a buscar el aviso a mano
// para poder decidir. Pedido del founder el 20-ago-2026 — el veredicto de casi toda superficie se
// toma LEYENDO el anuncio, así que el link es parte del hallazgo, no un adorno.
const linkDe = (u) => (u ? `
        🔗 ${u}` : '');

function haversine(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || isNaN(Number(v)))) return null;
  const R = 6371000, toRad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// `fecha_publicacion` (2-ago-2026): no decide el dedup, pero DESEMPATA para el humano.
// Dos avisos del mismo piso publicados el MISMO día son casi con seguridad el mismo depto;
// publicados con días de diferencia, pueden ser dos unidades del piso. Se muestra en sup.3.
// `estado_construccion` + `fecha_discovery` los suma la SUPERFICIE 6 (6-ago-2026):
// hacen falta para reproducir en JS la vigencia que en SQL calcula `es_propiedad_vigente()`.
const COLS = 'id,fuente,url,tipo_operacion,latitud,longitud,zona,nombre_edificio,id_proyecto_master,piso,duplicado_de,campos_bloqueados,primera_ausencia_at,precio_usd,precio_mensual_usd,precio_mensual_bob,area_total_m2,fecha_publicacion,fecha_discovery,estado_construccion,datos_json';

// 🔒 REGLA CRÍTICA #1 del proyecto: `campos_bloqueados` SIEMPRE se respetan (Manual > Automatic).
// Si un humano ya decidió sobre este campo (ej. "este match es un FP, dejar sin pm"), el audit NO
// debe volver a proponerlo: reaparecería en cada corrida y el juez podría RE-INTRODUCIR el error que
// se sacó. Bug cazado 17-jul: la prop 3505 (FP desmatcheado el 14-jul, candado explícito) volvía a
// Superficie 1 con candidato score 1.0.
const candado = (p, campo) => p?.campos_bloqueados?.[campo]?.bloqueado === true;

// ── NOMBRES QUE NO IDENTIFICAN UN EDIFICIO (30-jul-2026) ──────────────────────────
// Problema que resuelve: hay props cuyo `nombre_edificio` NO alcanza para elegir un edificio, y
// el veredicto correcto es SIN_NOMBRE. Pero SIN_NOMBRE **no deja rastro en la BD** (la prop queda
// igual: sin pm y sin candado), así que la prop vuelve a Superficie 1 TODAS las noches y el juez
// gasta una lectura en re-decidir lo mismo. Medido: 8000213 y 8000253 cayeron 6 noches seguidas.
// Es el mismo patrón de `feedback_decision_terreno_va_al_catalogo` con una vuelta de tuerca: acá
// NO hay pm al que colgarle un alias, porque el veredicto es "no existe tal edificio".
//
// Dos familias de caso:
//   · odonimo        → el nombre es una CALLE, no un edificio ("Los Jazmines" en Sirari).
//   · familia_ambigua → prefijo compartido por varios edificios reales, sin el sufijo que discrimina.
//
// 🔒 REGLAS DE ESTA LISTA (para que no se convierta en un tapa-agujeros):
//   1. Comparación EXACTA del nombre normalizado, nunca `includes`. "Sky Collection" a secas es
//      ambiguo; "Sky Collection Tulip" es un nombre válido y DEBE seguir yendo al juez.
//   2. Solo entra lo YA DECIDIDO por el juez o el founder, con su fecha. No se anticipan casos.
//   3. No se silencia: las props filtradas se listan aparte en el resumen y en el JSON
//      (`superficie_1_ruido_conocido`). Un descarte invisible se lee como "no había nada".
//   4. Si un caso deja de ser ambiguo (ej. el founder decide que "Ziri" ES Ziri Zwei), el arreglo
//      va al ALIAS del catálogo y la entrada se saca de acá.
//
// NO están acá a propósito:
//   · "Ziri" — decisión de terreno ABIERTA (podría ser alias de Ziri Zwei, pm 362). Mientras no se
//     decida, tiene que seguir apareciendo.
//   · "Holiday" — riesgo latente (pm 487 "Condominio Holiday" y 488 "Holiday Smart Studio" a 350 m),
//     pero todavía no apareció ningún aviso así. La primera vez la tiene que ver el juez.
const NOMBRES_NO_EDIFICIO = [
  { nombre: 'jazmines',            tipo: 'odonimo',         decidido: '2026-07-24', razon: 'calle Los Jazmines (Sirari): 19 edificios del catalogo a <=250 m del pin y ninguno se llama Jazmines; los 2 PM "Jazmines" estan a 4,7 km' },
  { nombre: 'los jazmines',        tipo: 'odonimo',         decidido: '2026-07-24', razon: 'idem "jazmines"' },
  { nombre: 'edificio jazmines',   tipo: 'odonimo',         decidido: '2026-07-24', razon: 'idem "jazmines"' },
  { nombre: 'sky collection',      tipo: 'familia_ambigua', decidido: '2026-07-28', razon: 'prefijo de 5 edificios (Tulip / Art Deco / Equipetrol + alias Plaza Italia y Magnolia); elegir uno es tirar una moneda' },
  { nombre: 'galil',               tipo: 'familia_ambigua', decidido: '2026-07-30', razon: 'Galil Parque I (pm 518) y III (pm 358) estan a 10-30 m entre si, misma zona; precedente: se aprobo III con score 95 y era el I' },
  { nombre: 'condominio galil',    tipo: 'familia_ambigua', decidido: '2026-07-30', razon: 'idem "galil"' },
  { nombre: 'baruc',               tipo: 'familia_ambigua', decidido: '2026-07-30', razon: '6 edificios "Baruc" en el catalogo; se resuelve por GPS, no por nombre' },
  { nombre: 'condominio baruc',    tipo: 'familia_ambigua', decidido: '2026-07-30', razon: 'idem "baruc"' },
  { nombre: 'condominio norte',    tipo: 'familia_ambigua', decidido: '2026-07-29', razon: 'descriptivo de zona, no nombre propio (pm 409 / 500 empatan en 0.308)' },
  { nombre: 'edificio condominio norte', tipo: 'familia_ambigua', decidido: '2026-07-29', razon: 'idem "condominio norte"' },
];

const normNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

const NO_EDIFICIO_IDX = new Map(NOMBRES_NO_EDIFICIO.map((e) => [normNombre(e.nombre), e]));
const esNombreNoEdificio = (nombre) => NO_EDIFICIO_IDX.get(normNombre(nombre)) || null;

// Confianza que declaró el lector al fijar el pm. Se guarda desde el 29-jul-2026 → las props
// cargadas ANTES devuelven null y no entran a la superficie 4 (no hay con qué juzgarlas).
const confianzaLector = (p) => p?.datos_json?.trazabilidad?.confianza_lector ?? null;

// ── MATCH YA CONFIRMADO POR EL JUEZ (30-jul-2026) ─────────────────────────────────
// Tercer caso del mismo bug: **un veredicto que no se escribe en la BD se vuelve a emitir todas las
// noches.** Las superficies 2 y 4 miran matches que YA EXISTEN, y el veredicto CONFIRMAR (el más
// frecuente de las dos) no dejaba rastro en ningún lado: la prop quedaba igual, el `.mjs` la volvía a
// levantar y el juez gastaba una lectura en re-confirmar lo mismo.
// Medido el 30-jul: las 13 props de superficie 4 se confirmaron 13/13 de madrugada y volvieron a
// aparecer intactas 5 horas después; las de superficie 2 (8000275 / 8000145 / 8000187) llevaban
// SEIS noches confirmándose. Ver `feedback_decision_terreno_va_al_catalogo`.
//
// El tag lo escribe el HUMANO con el SQL que genera este audit (el audit es read-only por diseño).
//
// ⚠️ POR QUÉ UN TAG Y NO subir `confianza_lector` a 'alta' (que también sacaría la prop de la
//    superficie 4): porque eso la mandaría al PUNTO CIEGO — los `lector_fijo` de confianza alta no
//    entran a NINGUNA superficie. El tag deja la confianza original intacta, así queda auditable
//    quién confirmó qué y cuándo, y el día que se implemente el muestreo del punto ciego estas props
//    siguen siendo elegibles.
// ⚠️ El tag NO caduca. Si un match confirmado resultara malo, se revoca borrando el tag; el drift del
//    anuncio lo cubre `/audit-deptos-shadow`, que es el que sí re-fetchea.
const confirmadoPorAuditor = (p) => p?.datos_json?.trazabilidad?.confirmado_por ?? null;

function imprimirColisiones(sup11, sup11Vecinas) {
  if (sup11.length) {
    const nuevas = sup11.filter((c) => c.nuevo).length;
    console.log(`  🧬 Superficie 11 (dos fichas del CATÁLOGO que el matcher ve como una): ${sup11.length} pares` +
      (nuevas ? `  ·  🆕 ${nuevas} que este audit nunca vio` : ''));
    console.log(`     ⚠️  No depende de la zona auditada: sale igual en los dos logs de la noche.`);
    console.log(`         Lo que hoy los salva es el discriminador de DISTANCIA, que actúa DESPUÉS`);
    console.log(`         del fuzzy. REPORTA, NO ARREGLA — tocar normalize_nombre() se midió y descartó.`);
    for (const c of sup11) {
      const sello = `${c.nuevo ? '🆕 ' : ''}${c.mismo_nucleo ? '🔴 mismo nombre' : '   numeral comido'}`;
      console.log(`     ${sello} · "${c.normalizado}" · ${c.metros ?? '?'} m${c.cruza_macrozona ? '  ⚠️ CRUZA MACROZONA' : ''}`);
      console.log(`        pm ${c.pm_a} "${c.nombre_a}" [${c.macrozona_a || 'sin macro'} · ${c.zona_a}] · ${c.props_a} props`);
      console.log(`        pm ${c.pm_b} "${c.nombre_b}" [${c.macrozona_b || 'sin macro'} · ${c.zona_b}] · ${c.props_b} props`);
    }
    if (sup11Vecinas) console.log(`     └─ + ${sup11Vecinas} pares silenciados (misma macrozona y < ${COLISION_METROS} m: elegir mal no mueve ni la zona ni la mediana)`);
    console.log('');
  }
}

const COLISION_METROS = 800;   // el mismo umbral que la superficie 5, a propósito
// ---------------------------------------------------------------------------
// SUPERFICIE 11 — DOS FICHAS DEL CATÁLOGO QUE EL MATCHER VE COMO UNA (28-ago-2026)
// ---------------------------------------------------------------------------
// Las 10 superficies de arriba miran PROPIEDADES. Esta mira el CATÁLOGO, que es de
// donde salen los errores que ninguna propiedad delata: `normalize_nombre()` borra el
// prefijo genérico y los numerales romanos, así que dos fichas activas distintas pueden
// colapsar al mismo texto. Para `buscar_proyecto_fuzzy()` son EL MISMO EDIFICIO, con
// score idéntico, y el desempate termina cayendo en el id de ficha más bajo.
//
// 🔑 Por qué existe: los tres casos de esta semana (Eurodesign 18-ago, Uptown y
// Portofino 27-ago) se descubrieron DE REBOTE, tirando del hilo de una propiedad mal
// matcheada. Nunca porque algo los buscara. El pm 156 "Condominio Portofino" llevó
// NUEVE MESES capturando propiedades ajenas sin que ninguna alarma lo viera.
//
// 🔑 LO QUE HACE PELIGROSA A UNA COLISIÓN NO ES QUE EXISTA: ES LA DISTANCIA. Los tres
// "Condado" están a 50 m entre sí — elegir mal no mueve ni la zona ni la mediana del m².
// Los dos "Domus Luxury" están a 2.375 m y en macrozonas distintas: ahí elegir mal manda
// la propiedad al mercado equivocado. Por eso las vecinas (misma macrozona, < 800 m) se
// silencian y se DECLARAN contadas, y el orden del reporte es el del daño potencial.
//
// 🔴 REPORTA, NO ARREGLA — igual que las superficies 5, 6 y 7. Lo que hoy salva a los
// homónimos lejanos es el discriminador de DISTANCIA, que actúa DESPUÉS del fuzzy. Esta
// superficie existe para que se sepa de quién depende eso, no para tocar el matcher:
// cambiar `normalize_nombre()` mueve el matching entero y ya se midió y descartó
// (docs/reports/AUDITORIA_NORMALIZACION_NOMBRES_2026-08-27.md §6).
async function colisionesCatalogo() {
  const sup11 = [];
  let sup11Vecinas = 0;
  {
    const ARCHIVO_COLISIONES = join(OUT, 'colisiones-catalogo-conocidas.json');
    let conocidas = new Set();
    try {
      if (existsSync(ARCHIVO_COLISIONES)) conocidas = new Set(JSON.parse(readFileSync(ARCHIVO_COLISIONES, 'utf8')));
    } catch { /* archivo ilegible: se tratan todas como nuevas, que es el lado seguro */ }

    const { data: col, error: eCol } = await sb.from('v_colisiones_catalogo').select('*');
    if (eCol) {
      console.log(`   ⚠️  Superficie 11 no pudo leer v_colisiones_catalogo (${eCol.message}) — se DECLARA, no se omite.`);
      console.log(`       Si dice "does not exist": falta aplicar sql/migrations/345_vista_colisiones_catalogo.sql.`);
    } else {
      for (const c of col || []) {
        const m = c.metros == null ? null : Number(c.metros);
        // Vecinas: misma macrozona y pegadas. Dos torres del mismo predio con el mismo
        // nombre son ruido — el error existe pero no tiene consecuencia medible.
        if (!c.cruza_macrozona && m != null && m < COLISION_METROS) { sup11Vecinas++; continue; }
        sup11.push({ ...c, metros: m, nuevo: !conocidas.has(`${c.pm_a}|${c.pm_b}`) });
      }
      sup11.sort((a, b) => (Number(b.mismo_nucleo) - Number(a.mismo_nucleo))
        || (Number(b.cruza_macrozona) - Number(a.cruza_macrozona))
        || ((b.metros ?? 0) - (a.metros ?? 0)));
      // La marca 🆕 dice "este audit nunca lo vio", NO "apareció hoy en el catálogo".
      // Se escribe en un temporal y se renombra: writeFileSync TRUNCA antes de fallar y este
      // archivo es la única memoria de qué colisión ya se reportó (lección del 24-ago-2026).
      try {
        const todas = [...new Set([...conocidas, ...sup11.map((c) => `${c.pm_a}|${c.pm_b}`)])];
        writeFileSync(`${ARCHIVO_COLISIONES}.tmp`, JSON.stringify(todas, null, 2));
        renameSync(`${ARCHIVO_COLISIONES}.tmp`, ARCHIVO_COLISIONES);
      } catch (e) { console.log(`   ⚠️  No se pudo guardar la memoria de colisiones (${e.message}) — mañana saldrán todas como nuevas.`); }
    }
  }

  return { sup11, sup11Vecinas };
}

async function main() {
  // Atajo del catálogo: no depende de la zona ni de las capturas de la noche.
  if (SOLO_COLISIONES) {
    const { sup11, sup11Vecinas } = await colisionesCatalogo();
    console.log('');
    if (!sup11.length) console.log('  🧬 Superficie 11: sin colisiones de catálogo con riesgo (0 pares).');
    imprimirColisiones(sup11, sup11Vecinas);
    return;
  }
  console.log(`\n🔎 AUDIT MATCHING SHADOW — ops: ${OPS.join('+')}${LIMIT ? ` (limit ${LIMIT}/op)` : ''}. READ-ONLY, $0 (sin fetch).\n`);

  const guarda = await capturasDeHoyCorrieron();

  // 🔁 MODO REINTENTO AGENDADO (--si-falta): decide solo si le toca correr.
  //    · ya corrió hoy con las 4 capturas  -> sale (no re-audita al pedo)
  //    · todavia faltan capturas           -> sale (que lo tome el proximo disparo)
  //    · estan las 4 y aun no corrio       -> corre normal y deja la marca al final
  const marcaCompleta = join(OUT, `.audit-completo-${guarda.hoy}.json`);
  guardaGlobal = guarda; marcaCompletaGlobal = marcaCompleta;
  if (SI_FALTA) {
    if (existsSync(marcaCompleta)) {
      let cuando = '';
      try { cuando = ` (corrio ${JSON.parse(readFileSync(marcaCompleta, 'utf8')).ts})`; } catch {}
      console.log(`
  ⏭️  El audit de hoy (${guarda.hoy}) ya corrio con las 4 capturas${cuando}. Nada que hacer.
`);
      process.exit(0);
    }
    if (!guarda.ok) {
      console.log(`
  ⏳ Todavia faltan capturas de hoy (${guarda.hoy}): ${guarda.faltan.join(' · ')}.`);
      console.log(`     No audito ahora — lo toma el proximo disparo agendado. (Para forzar: --sin-guarda)
`);
      process.exit(0);
    }
    console.log(`
  ▶️  Las 4 capturas de hoy estan y el audit todavia no corrio con ellas: corro ahora.
`);
  }

  // NINGUNA corrió → abortar (caso original del 24-jul-2026: el audit le ganó la carrera a
  // todas y auditó el inventario de la víspera reportando "nada que aplicar").
  if (guarda.ninguna && !SIN_GUARDA) {
    console.error(
      `
🛑 ABORTADO — NINGUNA de las 4 capturas de hoy (${guarda.hoy}) dejó log.
` +
      `   Este audit estaría revisando el inventario de ayer y reportaría "nada que aplicar"
` +
      `   sin haber visto lo de esta noche (pasó el 24-jul-2026).

` +
      `   Qué hacer:
` +
      `     · Corré primero las capturas y después este audit.
` +
      `     · Para auditar el inventario actual igual: node auditar-matching-shadow.mjs --sin-guarda
`
    );
    process.exit(2);
  }
  // ALGUNAS corrieron → NO abortar: no auditar es peor que auditar con aviso. Pero se declara
  // fuerte, arriba y abajo, nombrando las que faltan. Sin esto el audit del 19-ago dijo
  // "0 en las 7 superficies" con 3 de 4 capturas y se leyó como noche limpia.
  if (!guarda.ok) {
    AVISO_ALCANCE = `las capturas de ${guarda.hoy} corrieron PARCIALMENTE: falta(n) ${guarda.faltan.join(' · ')}. `
      + `Lo que esas capturas carguen NO está en este audit — el cero de una superficie no las cubre.`;
    console.log(`
🔴 ALCANCE INCOMPLETO — ${guarda.faltan.length} de 4 capturas sin log de hoy (${guarda.hoy}):`);
    for (const f of guarda.faltan)    console.log(`      ❌ ${f}`);
    for (const c of guarda.corrieron) console.log(`      ✅ ${c}`);
    console.log(`   Audito igual (no auditar sería peor), pero este audit NO cubre lo que carguen las que faltan.`);
    console.log(`   👉 Si corren después, RE-CORRÉ este audit: es read-only y $0.
`);
  } else {
    console.log(`   ✅ Las 4 capturas de hoy (${guarda.hoy}) dejaron log — este audit corre después de todas.
`);
  }

  // ── Qué se audita (1-ago-2026) ──────────────────────────────────────────
  // `es_activa` NO alcanza: es "el aviso sigue publicado en el portal", y sigue
  // siendo true en props que el sistema ya sacó del inventario (`excluida_zona`,
  // `excluido_operacion`, `excluido_calidad`). Sin este filtro vuelven al juez
  // todas las noches para volver a decidir lo mismo — el patrón de siempre: un
  // veredicto que no deja rastro se repite.
  //
  // 🔴 El corte es por STATUS, **NO** por "tiene id_proyecto_master".
  // Filtrar por proyecto asignado parecería razonable ("audito lo que el feed
  // muestra") y sería un error grave: el feed exige pm (INNER JOIN), pero las
  // VISTAS DE MERCADO no — `v_mercado_venta_shadow` tiene hoy 795 filas, 99 de
  // ellas SIN pm (12,5%), y todas cuentan para medianas, $/m² y absorción.
  // Las props sin match son, además, justo las que este audit existe para
  // resolver. Auditar "lo que se muestra" dejaría fuera al 12,5% del inventario
  // que sí pesa en los estudios de mercado.
  //
  // `STATUS_INVENTARIO` es el MISMO corte de `v_mercado_venta_shadow` /
  // `v_mercado_alquiler_shadow` y de `buscar_unidades_simple_shadow`: alinea el
  // audit con lo que el resto del sistema considera inventario vivo, sin
  // inventar un criterio propio.
  const STATUS_INVENTARIO = ['completado', 'actualizado'];

  let filas = [];
  for (const op of OPS) {
    let q = sb.from('propiedades_v2').select(COLS).eq('tipo_operacion', op)
      .eq('es_activa', true).in('status', STATUS_INVENTARIO).order('id', { ascending: true });
    if (ZONAS_FILTRO) q = q.in('zona', ZONAS_FILTRO);
    if (LIMIT) q = q.limit(LIMIT);
    const { data, error } = await q;
    if (error) throw error;
    filas.push(...(data || []));
  }
  const alcance = ZONAS_FILTRO ? `${ZONAS_HIBRIDO[ZONA_ID].nombre} (${ZONAS_FILTRO.length} zonas)` : 'TODAS las zonas de shadow';
  console.log(`   ${filas.length} filas activas en shadow · alcance: ${alcance}.\n`);

  // ⚠️ AVISO DE ALCANCE PARCIAL (30-jul-2026) — un auditor que no ve la mitad del inventario
  // deja de ser auditor. El default de la perilla es 'equipetrol' (bien pensado para el
  // pipeline de CAPTURA: aislar ZN para que no arrastre a Equipetrol si algo sale mal), pero
  // en un AUDIT ese mismo default hace que lo no auditado se lea como "limpio".
  // Caso real: la noche del 30-jul la routine corrió sin `--zona` → habría reportado
  // "nada que aplicar" con 793 filas de Equipetrol en cero, mientras ZN acumulaba 17 UPDATE
  // y un PM_NUEVO en silencio. Falla en la dirección peligrosa: el silencio parece salud.
  if (ZONAS_FILTRO) {
    let fuera = 0;
    for (const op of OPS) {
      const { count } = await sb.from('propiedades_v2')
        .select('id', { count: 'exact', head: true })
        .eq('tipo_operacion', op).eq('es_activa', true).in('status', STATUS_INVENTARIO)  // mismo corte que arriba, si no el aviso de alcance miente
        .not('zona', 'in', `(${ZONAS_FILTRO.map((z) => `"${z}"`).join(',')})`);
      fuera += count || 0;
    }
    if (fuera > 0) {
      console.log(
        `   🔴 ALCANCE PARCIAL — hay ${fuera} filas activas en shadow FUERA de este alcance y este audit NO las mira.\n` +
        `      Lo no auditado NO es lo mismo que lo auditado y limpio. Para cubrir todo:\n` +
        `        node auditar-matching-shadow.mjs --zona=todas\n` +
        `      (o corré una vez por zona: --zona=equipetrol y --zona=zona-norte)\n`
      );
    }
  }

  const sup1 = [];
  const sup1Ruido = [];        // nombres ya juzgados no-edificio (odónimo / familia ambigua) — no van al juez
  const supConfirmadas = [];   // matches de superficie 2/4 que el juez YA confirmó (tag confirmado_por)
  let sup2 = [], sup2Auto = [];
  const sup4 = [];   // el lector fijo el pm con confianza no-alta (superficie 4, 29-jul-2026)
  const sup4b = [];  // el lector dudo y NO hay match: nadie las miraba (superficie 4b, 22-ago-2026)
  let sup5 = [];     // match con DISTANCIA sospechosa prop↔pm (superficie 5, 4-ago-2026)
  const pmRiesgoIds = new Set();

  // ── SUPERFICIE 5 · umbral de distancia ────────────────────────────────────────
  // 800 m es el umbral que se diseñó el 30-may-2026 (BITACORA "FIX B1") y que quedó
  // condicionado a "medir la distribución antes de aplicar". La medición se hizo el
  // 4-ago: de 932 matches activos con GPS, 841 caen a <150 m. Un umbral de 800 m no
  // roza nada de lo que hoy funciona — solo levanta la cola larga.
  const DISTANCIA_SOSPECHOSA_M = 800;

  // ── PINES GENÉRICOS DEL PORTAL (se detectan solos, no se hardcodean) ──────────
  // Una coordenada compartida por MÁS DE UN edificio no es una ubicación: es el pin
  // por defecto del portal. Medido el 25-jul: `-17.766967/-63.192905` aparecía en 25
  // props de **17 edificios distintos** — físicamente imposible. Las demás coordenadas
  // repetidas del set tenían 1 edificio cada una (varias unidades del mismo edificio,
  // legítimo). Detectarlo por datos y no por lista fija hace que un pin nuevo del
  // portal quede cazado solo.
  const claveGps = (lat, lon) => (lat == null || lon == null ? null : `${Number(lat).toFixed(6)},${Number(lon).toFixed(6)}`);
  const pinesGenericos = (() => {
    const porGps = new Map();
    for (const p of filas) {
      const k = claveGps(p.latitud, p.longitud);
      // 🔴 excluye los gemelos deduplicados: dos filas del MISMO aviso en la misma
      // coordenada (dedup por slug reescrito, PR #64) fabricaban un "pin generico" falso
      // que apagaba a la vez la superficie 2 y la 5. Cazado el 20-ago-2026 (Onix, 960 m).
      if (!k || p.id_proyecto_master == null || p.duplicado_de != null) continue;
      if (!porGps.has(k)) porGps.set(k, new Set());
      porGps.get(k).add(p.id_proyecto_master);
    }
    return new Set([...porGps.entries()].filter(([, pms]) => pms.size > 1).map(([k]) => k));
  })();
  if (pinesGenericos.size) console.log(`   📍 ${pinesGenericos.size} pin(es) genérico(s) del portal detectados (misma coordenada, >1 edificio) → su distancia no se usa como evidencia.\n`);

  for (const p of filas) {
    const dj = p.datos_json || {};
    const metodo = dj.trazabilidad?.metodo_match || null;
    const base = {
      prop_id: p.id, op: p.tipo_operacion, fuente: p.fuente, url: p.url,
      lat: p.latitud, lon: p.longitud, zona: p.zona, nombre_edificio: p.nombre_edificio,
      titulo: dj.contenido?.titulo || null,
      descripcion_anuncio: dj.contenido?.descripcion || null,
      pistas_nombre: { col: p.nombre_edificio || null, slug: slugDe(p.url) },
    };
    // SUPERFICIE 1 — sin match, con nombre → PM_NUEVO / fuzzy débil
    // (excluye las candadas: un humano ya decidió que van sin pm — no re-proponer)
    if (p.id_proyecto_master == null && p.nombre_edificio && !candado(p, 'id_proyecto_master')) {
      // Nombre ya juzgado como "no identifica un edificio" (odónimo / familia ambigua):
      // no va al juez, pero se REPORTA aparte. Ver NOMBRES_NO_EDIFICIO.
      const noEdif = esNombreNoEdificio(p.nombre_edificio);
      if (noEdif) sup1Ruido.push({ ...base, metodo: metodo || 'sin_match', ruido: noEdif });
      else sup1.push({ ...base, metodo: metodo || 'sin_match', candidatos: [] });
    }
    // SUPERFICIE 2 — auto-match riesgoso (nombre único, zona ≠)
    else if (p.id_proyecto_master != null && METODOS_RIESGO.has(metodo) && !candado(p, 'id_proyecto_master')) {
      const yaConf = confirmadoPorAuditor(p);
      if (yaConf) supConfirmadas.push({ ...base, superficie: 2, pm_actual: p.id_proyecto_master, confirmado_por: yaConf });
      else {
        sup2.push({ ...base, pm_actual: p.id_proyecto_master, metodo, pm_nombre: null, pm_zona: null, dist_metros: null });
        pmRiesgoIds.add(p.id_proyecto_master);
      }
    }
    // SUPERFICIE 4 — el LECTOR fijó el pm, pero con dudas (29-jul-2026)
    // Punto ciego que existía desde el principio: las 3 superficies de arriba miran lo que el
    // MATCHER hizo (o no hizo), y ninguna mira lo que decidió el LECTOR. Un `lector_fijo` se daba
    // por bueno para siempre. Medido en la tanda 2 de ZN: 51 matches del lector, 15 con confianza
    // media; un juez independiente sobre esos 15 corrigió 2 falsos positivos que ya iban a la base
    // ("CONDOMINIO ONE 1" contra un pm sin numeral, y un "Ares" que el aviso no nombraba).
    // Solo entran los de confianza NO alta: los que el propio lector marcó como dudosos.
    else if (p.id_proyecto_master != null && metodo === 'lector_fijo'
             && confianzaLector(p) && confianzaLector(p) !== 'alta'
             && !candado(p, 'id_proyecto_master')) {
      const yaConf = confirmadoPorAuditor(p);
      if (yaConf) supConfirmadas.push({ ...base, superficie: 4, pm_actual: p.id_proyecto_master, confirmado_por: yaConf, confianza_lector: confianzaLector(p) });
      else {
        sup4.push({ ...base, pm_actual: p.id_proyecto_master, confianza_lector: confianzaLector(p), pm_nombre: null, pm_zona: null, dist_metros: null });
        pmRiesgoIds.add(p.id_proyecto_master);
      }
    }
    // SUPERFICIE 4b — el LECTOR dudó y NO hay match (22-ago-2026)
    // Hermana de la 4, y el punto ciego que la 4 dejó abierto: su condición exige
    // `id_proyecto_master != null`, o sea que la duda del lector sólo se mira cuando ADEMÁS
    // hubo match. Sin nombre no hay match, sin match no hay superficie — y la señal que el
    // propio sistema emitió ("no estoy seguro") se guardaba en la base sin que la leyera nadie.
    //
    // Medido el 22-ago sobre las activas: 63 dudosas en alquiler y 97 en venta; la superficie 4
    // veía 32 y 78. Las otras **50 no las miraba nada**, y ninguna tiene nombre, así que
    // tampoco caían en la superficie 1. Como el audit corre por MACROZONA, se reparten así
    // (medido CORRIENDO las 4 combinaciones, no con una query — un JOIN a `zonas_geograficas`
    //  duplica filas: Equipetrol tiene 7 polígonos para 6 nombres):
    //   Equipetrol  alquiler  7 (2 con `baja`) · venta  8
    //   Zona Norte  alquiler 31               · venta 11
    // 🔑 En alquiler se perdía la MITAD de las señales, contra 1 de cada 5 en venta: menos
    // nombres → menos matches → y la 4 apoyaba su alarma justo en lo que faltaba.
    //
    // Caso de origen: 8001019, un aviso a 13 km de Equipetrol que fijaba el piso del panorama
    // del bot en 1.800 Bs. El lector lo había marcado `confianza: baja` el día que se capturó.
    // Lo encontró lab-kapso mirando el feed. Ver docs/backlog/PLAN_SENALES_HUERFANAS_DEL_LECTOR.md
    //
    // 🔴 REPORTA, NO DECIDE: que el lector dudara no dice QUÉ está mal — puede ser el nombre, el
    // precio, el área o nada. Es una cola de lectura priorizada, no un veredicto.
    // ⚠️ La PRIMERA corrida trae el backlog acumulado (~50), no la tasa nocturna.
    else if (p.id_proyecto_master == null && !candado(p, 'id_proyecto_master')
             && confianzaLector(p) && confianzaLector(p) !== 'alta') {
      sup4b.push({ ...base, metodo: metodo || 'sin_metodo', confianza_lector: confianzaLector(p) });
    }
    // SUPERFICIE 5 — el match está LEJOS del edificio (4-ago-2026)
    // Cierra el FIX B1 que quedó pendiente desde el 30-may (BITACORA:669). Las superficies
    // 1/2/4 miran CÓMO se hizo el match (método, confianza, zona); ninguna mira DÓNDE quedó.
    // Un match por nombre exacto con GPS coherente nunca entraba a ninguna — y ahí vivía el
    // caso Portobello Isuto: 3 avisos a 4 km de su ficha durante meses, con el nombre perfecto.
    //
    // 🔴 REPORTA, NO DESCONECTA — y esto es la lección, no una precaución genérica. El 4-ago se
    // leyeron 6 casos sospechosos y **solo 3 eran error real** (todos del mismo edificio, cuya
    // ficha tenía el GPS copiado de otro). En los otros 3 el match era correcto y lo que estaba
    // mal era el pin que el captador puso en el portal. Degradar por distancia habría roto 3
    // matches buenos. La distancia sirve para PRIORIZAR la lectura, nunca para decidir.
    //
    // El error puede estar en cualquiera de los dos lados, y por eso lo juzga un humano/lector:
    //   · el AVISO mal colgado (homónimo, fuzzy equivocado) → se corrige el match;
    //   · la FICHA del catálogo con el GPS mal → se corrige el pm (¡y arrastra a todos sus avisos!);
    //   · el PIN del captador, genérico o mal clickeado → no se toca nada.
    else if (p.id_proyecto_master != null && !candado(p, 'id_proyecto_master')
             && p.latitud != null && p.longitud != null
             && !pinesGenericos.has(claveGps(p.latitud, p.longitud))) {
      const yaConf = confirmadoPorAuditor(p);
      const yaRev = dj.trazabilidad?.distancia_revisada || null;
      // Memoria: un veredicto sin rastro se repite cada noche (feedback_decision_terreno_va_al_catalogo).
      // `distancia_revisada` lo escribe el humano al resolver el caso; sin eso, los 43 de la cola
      // larga volverían todas las noches y la superficie se volvería ruido que nadie mira.
      if (!yaConf && !yaRev) {
        sup5.push({ ...base, pm_actual: p.id_proyecto_master, metodo: metodo || 'sin_metodo', pm_nombre: null, pm_zona: null, dist_metros: null });
        pmRiesgoIds.add(p.id_proyecto_master);
      }
    }
  }

  // Superficie 1: candidatos fuzzy del catálogo (prod, read-only) para que el juez tenga referencia
  for (const s of sup1) {
    const { data } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: s.nombre_edificio, p_umbral_minimo: 0.3, p_limite: 5 });
    s.candidatos = (data || []).map((c) => ({ pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score), tipo: c.match_tipo }));
  }
  // Superficies 2 y 4: traer nombre + GPS del pm actual → dist prop↔pm (¿el match tiene sentido
  // geográfico?). La 4 lo necesita igual que la 2: el juez tiene que ver CONTRA QUÉ edificio lo
  // ató el lector, no solo el número de pm.
  if (pmRiesgoIds.size) {
    const { data: pms } = await sb.from('proyectos_master').select('id_proyecto_master,nombre_oficial,zona,latitud,longitud').in('id_proyecto_master', [...pmRiesgoIds]);
    const byId = new Map((pms || []).map((r) => [r.id_proyecto_master, r]));
    for (const s of [...sup2, ...sup4, ...sup5]) {
      const pm = byId.get(s.pm_actual);
      if (pm) {
        s.pm_nombre = pm.nombre_oficial; s.pm_zona = pm.zona;
        s.gps_placeholder = pinesGenericos.has(claveGps(s.lat, s.lon));
        // Con pin genérico la distancia es una ILUSIÓN: no se calcula, para que ni el juez
        // ni el humano la lean como evidencia (25 props compartían un pin y producían
        // "distancias" de 900-1100 m que no significaban nada).
        s.dist_metros = s.gps_placeholder ? null : haversine(s.lat, s.lon, pm.latitud, pm.longitud);
      }
    }
    // Catálogo completo (~600 filas) para poder contar HOMÓNIMOS del nombre. Se trae una
    // sola vez: es la diferencia entre "el nombre identifica" y "el nombre es un token que
    // responde a diez edificios". Si falla, el filtro sigue funcionando como antes.
    let catalogoParaHomonimos = [];
    {
      const { data: cat, error: eCat } = await sb.from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial, alias_conocidos, activo');
      if (eCat) console.log(`   ⚠️  No se pudo leer el catálogo para contar homónimos (${eCat.message}) — el filtro de ruido corre sin esa señal.`);
      else catalogoParaHomonimos = cat || [];
    }

    // ── Filtro de RUIDO (25-jul-2026) ─────────────────────────────────────────────
    // `nombre_unico_zona_dif` acumulaba 23/23 veredictos CONFIRMAR: gritaba lobo todas
    // las noches y el juez releía lo mismo. Las causas del falso positivo, medidas:
    //   · pin genérico del portal → la "zona distinta" es un artefacto del pin, no del match;
    //   · borde de polígono → las zonas son polígonos y <200 m de ruido cambian de zona.
    // En ambos casos el nombre coincide y NO hay nada que juzgar. Se auto-confirman y se
    // declaran en el resumen (no desaparecen: quedan en `sup2_autoconfirmados` para poder
    // ajustar el umbral si algún día uno sale mal).
    // ⚠️ NO se toca el caso de riesgo REAL — nombres con hermanos numerados (Baruc Uno/II,
    // Condado II/III), donde el fuzzy sí falla. Esos siguen yendo al juez porque su GPS es
    // legítimo y su distancia, real.
    // 🔴 EXCEPCIÓN AL FILTRO (27-ago-2026): pin genérico + nombre con HOMÓNIMOS = al juez.
    // El 27-ago `8000909` estaba colgada de un edificio a 6.547 m y NINGUNA superficie la
    // levantó: el filtro la había auto-confirmado por pin genérico. Se encontró tirando del
    // hilo de otra prop, no por diseño.
    // 🔑 El razonamiento del filtro es "el nombre coincide y la distancia es un artefacto del
    // pin, así que no hay nada que juzgar". Eso vale cuando el nombre IDENTIFICA. Pero si el
    // nombre es un token pelado con hermanos en el catálogo —"Portofino", con 10 fichas—,
    // apagar la distancia deja el caso SIN NINGÚN discriminante, y la lista de
    // auto-confirmados **se siente resuelta sin estarlo** (`feedback_verificado_no_es_exhaustivo`).
    // El borde de zona <200 m NO se toca: ahí la distancia es real y chica, o sea el nombre
    // coincide Y el edificio está al lado. El problema es solo el pin genérico.
    const RUIDO_METROS = 200;
    const familiasPorNucleo = (() => {
      const idx = new Map();
      for (const pm of (catalogoParaHomonimos || [])) {
        if (pm.activo === false) continue;
        for (const c of [pm.nombre_oficial, ...(pm.alias_conocidos || [])]) {
          const k = nucleo(c);
          if (!k) continue;
          if (!idx.has(k)) idx.set(k, new Set());
          idx.get(k).add(pm.id_proyecto_master);
        }
      }
      return idx;
    })();
    // cuántos pm distintos responden a ese nombre, contando los que lo llevan como PREFIJO
    // ("portofino" es el comienzo de "portofino v", "portofino beni", …)
    const homonimosDe = (nombre) => {
      const n = nucleo(nombre);
      if (!n) return 0;
      const out = new Set();
      for (const [k, pms] of familiasPorNucleo) {
        if (k === n || k.startsWith(n + ' ')) for (const id of pms) out.add(id);
      }
      return out.size;
    };
    for (const s of sup2) {
      if (s.gps_placeholder) {
        s.homonimos_catalogo = homonimosDe(s.nombre_edificio);
        if (s.homonimos_catalogo > 1) s.pin_generico_pero_ambiguo = true;
      }
    }
    sup2Auto = sup2.filter((s) => s.pm_nombre && !s.pin_generico_pero_ambiguo
      && (s.gps_placeholder || (s.dist_metros != null && s.dist_metros < RUIDO_METROS)));
    const autoIds = new Set(sup2Auto.map((s) => s.prop_id));
    sup2 = sup2.filter((s) => !autoIds.has(s.prop_id));
    // Superficie 5: recién ACÁ se conoce la distancia (necesita el GPS del pm). Se descarta
    // todo lo que quedó por debajo del umbral — que es la enorme mayoría — y lo que no pudo
    // medirse (pin genérico o pm sin GPS): sin distancia no hay nada que juzgar.
    sup5 = sup5.filter((s) => s.dist_metros != null && s.dist_metros > DISTANCIA_SOSPECHOSA_M);
    // ── La pista que decide QUIÉN está mal (criterio que resolvió Portobello Isuto) ──
    // Si los HERMANOS del mismo pm están pegados al edificio, el pm está bien y el
    // sospechoso es ESTE aviso. Si NINGÚN aviso del pm está cerca, el sospechoso es la
    // FICHA (su GPS) — y corregirla arregla todos sus avisos de una sola vez.
    // Sin este dato el juez tiene que salir a contar hermanos a mano, que es lo que costó
    // media hora el 4-ago.
    // 🔴 Los hermanos se consultan a la BD, NO a `filas`: `filas` viene filtrado por la ZONA
    // que se está auditando, y los hermanos de un pm pueden estar en otra (el pm de "Torre
    // Moderna" tiene 7 avisos pegados que el audit de ZN no ve). Contarlos sobre `filas` daba
    // "0/0 hermanos" siempre y dejaba la pista inservible — cazado al probar, 4-ago-2026.
    if (sup5.length) {
      const pmsSup5 = [...new Set(sup5.map((s) => s.pm_actual))];
      const { data: hermanosDb } = await sb.from('propiedades_v2')
        .select('id, id_proyecto_master, latitud, longitud')
        .in('id_proyecto_master', pmsSup5).eq('es_activa', true).is('duplicado_de', null);
      const porPm = new Map();
      for (const h of hermanosDb || []) {
        if (h.latitud == null || h.longitud == null) continue;
        if (!porPm.has(h.id_proyecto_master)) porPm.set(h.id_proyecto_master, []);
        porPm.get(h.id_proyecto_master).push(h);
      }
      for (const s of sup5) {
        const pm = byId.get(s.pm_actual);
        if (!pm || pm.latitud == null) { s.hermanos_pegados_al_pm = null; s.sospechoso = 'indeterminado (el pm no tiene GPS)'; continue; }
        const hermanos = (porPm.get(s.pm_actual) || []).filter((h) => h.id !== s.prop_id);
        s.hermanos_del_pm = hermanos.length;
        s.hermanos_pegados_al_pm = hermanos.filter((h) => haversine(h.latitud, h.longitud, pm.latitud, pm.longitud) < 150).length;
        s.sospechoso = s.hermanos_pegados_al_pm > 0
          ? 'el_aviso (sus hermanos SÍ están pegados al edificio → el pm está bien)'
          : (s.hermanos_del_pm === 0
              ? 'indeterminado (es el ÚNICO aviso del edificio — hay que leer el aviso)'
              : 'la_ficha_del_pm (NINGÚN aviso del edificio está cerca → corregir el pm los arregla a todos)');
      }
    }
    // Ordenadas por distancia: lo más raro primero, que es lo que conviene leer si hay poco tiempo.
    sup5.sort((a, b) => b.dist_metros - a.dist_metros);
  }

  // ── SUPERFICIE 3 — DUPLICADOS (apart-hoteles / republicaciones) ──
  // El detector del pipeline NO los caza (cada aviso tiene código único). Agrupa por
  // nombre+precio+área y compara descripciones (≥90% = mismo aviso replicado). Reusa
  // `detectarDuplicados` de prod. MEJORA shadow: agrupa por PM cuando existe (más certero
  // que el string del nombre) — el pm ya matcheado deja el dedup servido. $0, ya tenemos la desc.
  const precioDe = (p) => p.tipo_operacion === 'venta'
    ? (Number(p.precio_usd) || 0)
    : (Number(p.precio_mensual_usd) || Number(p.precio_mensual_bob) || 0);
  const realPorId = new Map(filas.map((p) => [p.id, { nombre: p.nombre_edificio, pm: p.id_proyecto_master, precio: precioDe(p), op: p.tipo_operacion, piso: p.piso, pub: p.fecha_publicacion ? String(p.fecha_publicacion).slice(0, 10) : null }]));
  const sup3 = [];
  let sup3Revisados = 0;   // clusters silenciados porque un humano ya los juzgó (ver abajo)
  for (const op of OPS) {
    // SOLO props que NO traen `duplicado_de` (heredado de prod / verificador). Sin este filtro, el dedup
    // marcaría un sobreviviente ya elegido por prod como duplicado → CICLO A↔B (los dos se ocultan, el
    // edificio desaparece del feed). Bug real cazado 14-jul (Santorini 1740↔1754, Lofty 51↔52). Al ignorar
    // los ya-deduplicados, el cluster se reduce a los survivors NULL y nunca se pisa una cadena existente.
    // + excluye las candadas en `duplicado_de`: un humano ya dictaminó "NO son duplicados" (ej. Luxe
    //   Suites 1090/1091, dos unidades reales de 34,5 y 32,5 m² con el mismo texto). Sin esto el dedup
    //   las re-propone en cada corrida y alguien las termina fusionando mal.
    const props = filas.filter((p) => p.tipo_operacion === op && p.duplicado_de == null && !candado(p, 'duplicado_de')).map((p) => ({
      id: p.id,
      // clave de grupo: pm si existe (robusto ante variantes del nombre), si no el nombre real.
      // GUARDA POR PISO: si el aviso declara piso, lo sufijo a la clave → dos unidades del MISMO
      // edificio/precio/área pero PISO distinto caen en grupos separados y NUNCA se marcan duplicadas
      // (aunque la desc sea ≥90%). Caso Las Dalias 324 piso1 / 325 piso5 = unidades reales, no dup.
      // piso null (sin dato) = comodín: agrupan entre sí (no fuerza separación sin evidencia).
      nombre_edificio: (p.id_proyecto_master ? `pm${p.id_proyecto_master}` : p.nombre_edificio)
        + (p.piso != null ? `#p${p.piso}` : ''),
      precio: precioDe(p),
      area: Number(p.area_total_m2) || 0,
      descripcion: p.datos_json?.contenido?.descripcion || '',
      // CLAVE FUERTE (2-ago-2026): el aviso DECLARA piso → la clave del grupo ya identifica
      // la unidad, no solo la tipología. Con eso el dedup no necesita que los textos se
      // parezcan. Cazó Macororó 18 (3543/3544: mismo pm, piso 13, 42,5 m², $75.000, misma
      // fecha_publicacion) que se escapaba porque el captador escribió dos textos distintos.
      // 🔑 Solo con piso EXPLÍCITO. Con piso null la clave vuelve a ser la tipología, y ahí
      // precio+área iguales son UNA coincidencia, no dos (el precio sale del área) — es el
      // caso K1 y Sky Equinox, donde deduplicar escondería unidades reales.
      clave_fuerte: p.piso != null,
      // AUSENTE DEL PORTAL (28-ago-2026): el verificador ya no lo encuentra. Solo decide
      // quién sobrevive en un cluster; no cambia qué se agrupa. Ver dup-checks.mjs.
      ausente: p.primera_ausencia_at != null,
    }));
    // 🔴 CLAVE DE RASTRO DE LA SUPERFICIE 3 (31-ago-2026) — el hueco que faltaba.
    // Era la ÚNICA superficie sin forma de registrar un veredicto: un cluster juzgado
    // "NO son duplicados" volvía TODAS las noches. Medido: Berchatti (8001153/54/55) se
    // juzgó el 28-ago y reapareció intacto el 29, el 30 y el 31 — cuatro noches, cuatro
    // veces el mismo trabajo. Es el mismo mecanismo que se cerró el 30-jul en las
    // superficies 2 y 4 con `confirmado_por`.
    //
    // 🔑 SE SILENCIA EL CLUSTER, NO LA PROPIEDAD, y la diferencia importa: si se excluyeran
    // las props marcadas, un aviso NUEVO que entre a ese mismo grupo se quedaría solo y el
    // duplicado real pasaría inadvertido. Acá el cluster se arma completo como siempre y
    // recién después se calla, y SOLO si TODOS sus integrantes están revisados. Basta que
    // aparezca uno sin marcar para que el grupo entero vuelva al humano.
    const revisadoDedup = new Set(
      filas.filter((p) => p.datos_json?.trazabilidad?.dedup_revisado).map((p) => p.id));
    for (const c of detectarDuplicados(props)) {
      const miembros = [c.sobreviviente, ...c.duplicados];
      if (miembros.every((id) => revisadoDedup.has(id))) { sup3Revisados++; continue; }
      const r = realPorId.get(c.sobreviviente) || {};
      sup3.push({
        op, edificio: r.nombre || c.nombre_edificio, pm: r.pm ?? null,
        precio: c.precio, area: c.area,
        sobreviviente: c.sobreviviente, duplicados: c.duplicados, n: c.n, ejemplo: c.ejemplo,
        por_clave_fuerte: c.por_clave_fuerte === true,
        piso: r.piso ?? null,
        // Refuerzo para el humano (NO cambia el veredicto): ¿todos los avisos del cluster
        // se publicaron el mismo día? Mismo piso + misma fecha = casi seguro el mismo depto.
        // Fechas distintas = pueden ser dos unidades del piso, o una republicación.
        fechas_pub: [...new Set([c.sobreviviente, ...c.duplicados].map((id) => realPorId.get(id)?.pub ?? '—'))],
      });
    }
  }

  // ── SUPERFICIE 6 — EL EDIFICIO SE CONTRADICE A SÍ MISMO (6-ago-2026) ──────────
  // Origen: el founder encontró HH Once mostrándose a la vez como "preventa" y como
  // "entrega inmediata" en el mismo feed. El daño NO es de cobertura (solo 7 props
  // quedaban sin estado por esto) sino de CREDIBILIDAD: el mismo edificio con dos
  // etiquetas contradictorias en la misma pantalla no se lee como "faltan datos",
  // se lee como que el sitio no sabe lo que dice.
  //
  // 🔑 LA REGLA (mig 315) YA RESUELVE LA MAYORÍA hacia "entregado": un edificio no
  //    vuelve al pozo, así que "entrega_inmediata" (evidencia positiva: alguien lo vio
  //    parado) le gana a "preventa" (el default del aviso que nadie actualizó). Esta
  //    superficie NO existe para arreglar el feed — existe para que un humano SELLE
  //    la presunción, o la corrija cuando la regla se equivoque.
  //
  // 🔴 REPORTA, NO DECIDE — igual que la superficie 5. La regla es una presunción
  //    razonable; el dictado del founder es lo único que la vuelve afirmable.
  //
  // Rastro que corta la relectura: `proyectos_master.entrega_verificada` (mig 315).
  // Sin esto los mismos 8 edificios volverían todas las noches — el patrón de siempre
  // (feedback_decision_terreno_va_al_catalogo): un veredicto sin rastro se repite.
  const sup6 = [];
  {
    // Misma regla de vigencia que `es_propiedad_vigente()` en SQL: 300 días para todos,
    // sobre fecha_publicacion y, si falta, fecha_discovery. Replicada acá y no consultada
    // para no pedirle a la BD una fila por prop.
    const HOY = new Date();
    const vigente = (p) => {
      const f = p.fecha_publicacion || p.fecha_discovery;
      if (!f) return false;
      return (HOY - new Date(f)) / 86400000 <= 300;
    };
    const estDe = (p) => (p.estado_construccion && p.estado_construccion !== 'no_especificado')
      ? p.estado_construccion : null;

    const porPm = new Map();
    for (const p of filas) {
      if (p.id_proyecto_master == null || p.duplicado_de != null) continue;
      if (!porPm.has(p.id_proyecto_master)) porPm.set(p.id_proyecto_master, { venta: [], alquiler: [] });
      porPm.get(p.id_proyecto_master)[p.tipo_operacion === 'venta' ? 'venta' : 'alquiler'].push(p);
    }

    const candidatos = [];
    for (const [pm, g] of porPm) {
      const ventaVig = g.venta.filter(vigente);
      const declaran = ventaVig.filter((p) => estDe(p) !== null);
      const estados = new Set(declaran.map(estDe));
      const alqVig = g.alquiler.filter(vigente).length;

      // Clase A · CONFLICTO INTERNO: los avisos de venta vigentes del mismo edificio
      // se contradicen entre sí. Es el caso HH Once.
      if (estados.size > 1) {
        candidatos.push({
          pm, clase: 'conflicto_interno',
          avisos_entregado: declaran.filter((p) => estDe(p) === 'entrega_inmediata').length,
          avisos_preventa:  declaran.filter((p) => estDe(p) === 'preventa').length,
          alquileres_activos: alqVig,
          props_afectadas: g.venta.length,
          // Cómo lo resolvió la regla de la mig 315 (para que el humano confirme o corrija)
          resuelto_por_regla: declaran.some((p) => estDe(p) === 'entrega_inmediata') ? 'entrega_inmediata' : null,
          ejemplos: declaran.slice(0, 6).map((p) => ({ id: p.id, dice: estDe(p), url: p.url, pub: p.fecha_publicacion })),
        });
      // Clase B · CONFLICTO CRUZADO: todos los avisos de venta dicen "preventa" PERO
      // hay alquiler activo. No se alquila lo que no está construido (señal 95%). La
      // regla NO lo toca a propósito: el consenso de vecinos (96,7%) le gana al alquiler
      // y son fuerzas parejas — quién tiene razón lo dice un humano, no un umbral.
      } else if (estados.size === 1 && [...estados][0] === 'preventa' && alqVig > 0) {
        candidatos.push({
          pm, clase: 'conflicto_cruzado',
          avisos_entregado: 0,
          avisos_preventa: declaran.length,
          alquileres_activos: alqVig,
          props_afectadas: g.venta.length,
          resuelto_por_regla: null,   // queda en 'preventa'; solo el dictado lo cambia
          ejemplos: declaran.slice(0, 6).map((p) => ({ id: p.id, dice: estDe(p), url: p.url, pub: p.fecha_publicacion })),
        });
      }
    }

    if (candidatos.length) {
      // Los ya dictados por un humano NO vuelven (rastro de la mig 315).
      // ⚠️ TOLERANTE A LA MIG 315 SIN APLICAR: si las columnas todavía no existen, el
      //    audit NO se cae — reporta la superficie completa y lo DECLARA. Un audit que
      //    revienta por una migración pendiente se lleva puesto el parte de toda la noche.
      const ids = candidatos.map((c) => c.pm);
      let pmsEstado = null, sinMig315 = false;
      {
        const r1 = await sb.from('proyectos_master')
          .select('id_proyecto_master,nombre_oficial,zona,fecha_entrega,entrega_verificada,entrega_verificada_at')
          .in('id_proyecto_master', ids);
        if (r1.error) {
          sinMig315 = true;
          const r2 = await sb.from('proyectos_master')
            .select('id_proyecto_master,nombre_oficial,zona,fecha_entrega').in('id_proyecto_master', ids);
          if (r2.error) throw r2.error;
          pmsEstado = r2.data;
          console.log(`   ⚠️  Superficie 6 sin memoria: la mig 315 (entrega_verificada) no está aplicada.`);
          console.log(`      Los edificios ya dictados NO se pueden saltear → van a volver a aparecer.\n`);
        } else pmsEstado = r1.data;
      }
      const idx = new Map((pmsEstado || []).map((r) => [r.id_proyecto_master, r]));
      for (const c of candidatos) {
        const r = idx.get(c.pm) || {};
        if (r.entrega_verificada) continue;   // ya sellado por el founder → no se re-propone
        sup6.push({
          ...c,
          pm_nombre: r.nombre_oficial ?? null,
          pm_zona: r.zona ?? null,
          // Respaldo independiente para el humano: una entrega prometida que YA venció
          // apoya "entregado". NO decide (la ficha acierta 78% y las obras se atrasan).
          fecha_entrega: r.fecha_entrega ?? null,
          fecha_entrega_vencida: r.fecha_entrega ? new Date(r.fecha_entrega) <= HOY : null,
        });
      }
      sup6.sort((a, b) => b.props_afectadas - a.props_afectadas);
    }
  }

  // ── SUPERFICIE 7 — DOS AVISOS DEL MISMO DEPTO A PRECIOS INCOMPATIBLES (8-ago-2026) ──
  // Origen: Sky Eclipse. La captadora Elizabeth Oconnor tenía 3 avisos del mismo depto
  // (2 dorm, 101 m²) y uno estaba a $84.000 contra $165.948 de sus gemelos — la MITAD.
  // Estuvo 5 semanas tirando abajo la mediana de Equipetrol Centro.
  //
  // 🔑 POR QUÉ ESTO Y NO "ARREGLAR EL DEDUP" (medido el 8-ago antes de escribir nada):
  // El dedup NO está roto. Se midió qué pasaría si se agregara el captador como señal
  // fuerte: marcaría como duplicados 5 grupos de UNIDADES REALES en pisos distintos
  // (Community Alto Norte 1/2/11 · Las Dalias 1/5 · Macororó 15 13/15 · Le Blanc 4/5 ·
  // Soul Parc 1/2) y reabriría los 3 clusters de EDIFICIO K1 que el founder ya juzgó
  // como inventario real el 5-ago. En Sky Eclipse no había NINGUNA señal que discriminara
  // (sin piso, mismo texto, misma área): cualquier umbral que cace ese caso rompe K1.
  //
  // Lo que sí era inequívoco no era la duplicación: era el PRECIO. Dos avisos del mismo
  // edificio, misma área y mismo captador no pueden diferir 97%. Uno de los dos está mal.
  //
  // 🔴 REPORTA, NO DECIDE — igual que las superficies 5 y 6. No dice cuál precio es el
  //    bueno; dice que los dos no pueden serlo a la vez.
  //
  // UMBRAL 30%: medido sobre los grupos legítimos de hoy (mismo pm+área+captador con
  // precios distintos), la brecha máxima es 7% — variación normal entre pisos. Sky
  // Eclipse era 97%. 30% deja pasar la variación real y caza el error de carga.
  //
  // Lee de `v_mercado_venta_shadow` a propósito: ahí el precio ya está NORMALIZADO
  // (`precio_norm`). Comparar `precio_usd` crudo daría brechas falsas entre un aviso
  // tagueado `bob` y uno en USD — el mismo error que este detector busca cazar.
  const BRECHA_SOSPECHOSA_PCT = 30;
  const sup7 = [];
  {
    let q = sb.from('v_mercado_venta_shadow')
      .select('id,id_proyecto_master,nombre_edificio,zona,area_total_m2,precio_norm,precio_m2,url,datos_json')
      .not('id_proyecto_master', 'is', null).not('area_total_m2', 'is', null);
    if (ZONAS_FILTRO) q = q.in('zona', ZONAS_FILTRO);
    const { data: mv, error: errMv } = await q;
    if (errMv) {
      console.log(`   ⚠️  Superficie 7 no pudo leer v_mercado_venta_shadow (${errMv.message}) — se declara, no se silencia.`);
    } else {
      const grupos = new Map();
      for (const p of (mv || [])) {
        const cap = p.datos_json?.agente?.nombre || null;
        if (!cap || p.precio_norm == null) continue;
        // Ya revisado por un humano → no vuelve (mismo mecanismo que distancia_revisada).
        if (p.datos_json?.trazabilidad?.brecha_precio_revisada) continue;
        const k = `${p.id_proyecto_master}|${Number(p.area_total_m2).toFixed(2)}|${cap}`;
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push({ ...p, captador: cap, precio: Number(p.precio_norm) });
      }
      for (const [, g] of grupos) {
        if (g.length < 2) continue;
        const min = Math.min(...g.map((x) => x.precio));
        const max = Math.max(...g.map((x) => x.precio));
        if (min <= 0) continue;
        const brecha = Math.round((100 * (max - min)) / min);
        if (brecha < BRECHA_SOSPECHOSA_PCT) continue;
        sup7.push({
          pm: g[0].id_proyecto_master, edificio: g[0].nombre_edificio, zona: g[0].zona,
          area: Number(g[0].area_total_m2), captador: g[0].captador,
          brecha_pct: brecha, n: g.length,
          avisos: g.sort((a, b) => a.precio - b.precio).map((x) => ({
            prop_id: x.id, precio_norm: Math.round(x.precio),
            precio_m2: x.precio_m2 != null ? Math.round(Number(x.precio_m2)) : null, url: x.url,
          })),
        });
      }
      sup7.sort((a, b) => b.brecha_pct - a.brecha_pct);
    }
  }

  // ── SUPERFICIE 9 — EL AVISO PUBLICA EN BOLIVIANOS Y NO ESTA TAGUEADO `bob` (20-ago-2026) ──
  // Origen: 8000699 (Vilareal Duo). El aviso decia "Precio: Bs. 382.800" y nada mas —
  // ni una mencion de dolares. Alguien lo dividio por 6,96 y guardo $55.000, cuando al
  // cambio real son $33.097. **66% de sobreprecio**, en el feed y en el bot, 5 semanas.
  //
  // 🔑 POR QUE ESTE DETECTOR Y NO "REVISAR LOS TAGS DE TC" (medido el 20-ago antes de
  // escribirlo). Se probo la via del tag: buscar props con `oficial_viejo` cuyo aviso no
  // mencione el numero. De 6 candidatos, **5 tenian el tag BIEN puesto** — 83% de falsos
  // positivos — porque el ancla al 7 se escribe de formas que ningun regex alcanza:
  //   · `T. C. 7.00` (puntos y espacios)  · `Tipo de cambio promocional de Bs. 7`
  //   · `(𝐓𝐂 𝟕)` en Unicode decorativo — no son las letras T y C
  //   · `$us 70.000 (Bs 490.000)` → **el ratio da 7,0 exacto sin nombrar el tipo de cambio**.
  //     No existe expresion regular para "estos dos numeros se dividen en 7".
  // Esa via necesitaba un juez LLM para confirmar 5 de cada 6. **La moneda, en cambio, es
  // inequivoca**: si el aviso solo habla en Bs, el precio esta en Bs. Sobre los 769 avisos
  // dio exactamente 1 resultado y era el correcto: **0 falsos positivos, sin juez**.
  //
  // Es el mismo razonamiento de la superficie 7: cuando aparecio Sky Eclipse no se toco el
  // dedup (habria roto 5 grupos legitimos), se agrego el detector que SI discriminaba.
  //
  // 🔴 REPORTA, NO DECIDE. El arreglo no es solo el tag: hay que mover el precio en Bs a
  // `precio_usd` (los `bob` guardan los bolivianos CRUDOS y la vista los divide por el TC
  // del dia). Por eso sale con el SQL sugerido y lo aplica el humano.
  //
  // FILTROS: el aviso menciona un monto en Bs de 5+ digitos (para no cazar "expensas Bs 500")
  // y NO menciona dolares en ninguna forma. Rastro que corta la relectura:
  // `datos_json.trazabilidad.moneda_revisada`.
  const sup9 = [];
  {
    let q9 = sb.from('v_mercado_venta_shadow')
      .select('id,nombre_edificio,zona,area_total_m2,precio_usd,precio_norm,precio_m2,tipo_cambio_detectado,url')
      .neq('tipo_cambio_detectado', 'bob');
    if (ZONAS_FILTRO) q9 = q9.in('zona', ZONAS_FILTRO);
    const { data: mv9, error: e9 } = await q9;
    if (e9) {
      console.log(`   ⚠️  Superficie 9 no pudo leer v_mercado_venta_shadow (${e9.message}) — se declara, no se omite.`);
    } else {
      const ids9 = (mv9 || []).map((x) => x.id);
      const { data: crudas9 } = ids9.length
        ? await sb.from('propiedades_v2').select('id,datos_json').in('id', ids9)
        : { data: [] };
      const porId9 = new Map((crudas9 || []).map((x) => [x.id, x]));
      for (const p of (mv9 || [])) {
        const cruda = porId9.get(p.id);
        if (cruda?.datos_json?.trazabilidad?.moneda_revisada) continue;   // ya revisado por un humano
        const desc = (cruda?.datos_json?.contenido?.descripcion || '').replace(/\s+/g, ' ');
        if (!desc) continue;
        const t = desc.toLowerCase();
        const montoBs = t.match(/bs\.? ?([0-9][0-9.,]{4,})/);
        if (!montoBs) continue;
        // 🔴 CORREGIDO 31-ago-2026 — faltaba la forma `US$`. El guard buscaba `$us` (signo
        // primero) y no reconocia `US$` (signo despues), asi que un aviso que dice
        // "Precio de venta: US$ 85.000" pasaba como si hablara SOLO en bolivianos.
        // Costo medido: `8001114` (Curupau Isuto) se levanto como falso positivo **cuatro
        // noches seguidas** (28, 29, 30 y 31-ago) y se juzgo cuatro veces.
        // 🔑 Verificado contra el caso que MOTIVO el detector antes de tocarlo: `8000699`
        // (Vilareal Duo, el `bob` que estuvo 5 semanas con 66% de sobreprecio) NO menciona
        // dolares en ninguna forma → el guard nuevo NO lo frena y el detector lo sigue viendo.
        // Medido sobre el feed de venta completo: el guard viejo levanta 1, el nuevo 0, y el
        // unico que deja de levantarse es el falso positivo. Cero efecto colateral.
        if (/\$us|us\$|u\$s|usd|d[oó]lar/.test(t)) continue;   // habla en las dos monedas → no es inequivoco
        const bs = Number(montoBs[1].replace(/[.,]/g, '').slice(0, 9));
        sup9.push({
          prop_id: p.id, nombre_edificio: p.nombre_edificio, zona: p.zona,
          tag_actual: p.tipo_cambio_detectado,
          precio_guardado_usd: p.precio_usd != null ? Number(p.precio_usd) : null,
          precio_que_muestra: p.precio_norm != null ? Math.round(Number(p.precio_norm)) : null,
          precio_m2_hoy: p.precio_m2 != null ? Math.round(Number(p.precio_m2)) : null,
          bs_del_aviso: bs,
          divisor_implicito: p.precio_usd ? Number((bs / Number(p.precio_usd)).toFixed(2)) : null,
          cita: montoBs[0], url: p.url,
        });
      }
      sup9.sort((a, b) => (b.bs_del_aviso || 0) - (a.bs_del_aviso || 0));
    }
  }

  // ---------------------------------------------------------------------------
  // SUPERFICIE 10 — la PROPIEDAD y su EDIFICIO están en MACROZONAS distintas
  // ---------------------------------------------------------------------------
  // Un edificio no está en dos macrozonas. Si la prop dice Zona Norte y su pm es de
  // Equipetrol, uno de los dos está mal — y el que casi siempre está mal es el de la
  // prop, porque su `zona` la escribe el cargador desde el GPS del aviso, que a menudo
  // es el pin genérico del portal.
  // 🔴 No falla, no avisa, y el precio de esa prop entra en la mediana de una microzona
  // donde no está. Dos casos en una semana: 8000944 (Smart Quipe, monoambiente de
  // USD 52.000 zonificado en el 6to-8vo anillo de ZN estando en Equipetrol Centro) y
  // 8000995 (Edificio García, en ZN estando en Av. Busch). Los dos se encontraron a mano.
  // 🔑 Se compara MACROZONA, no zona: entre zonas vecinas de la misma macrozona el borde
  // es difuso y daría ruido; entre macrozonas no hay ambigüedad posible.
  const sup10 = [];
  {
    const macroDe = (zona) => {
      for (const [id, cfg] of Object.entries(ZONAS_HIBRIDO)) {
        if ((cfg.zonas || []).includes(zona)) return id;
      }
      return null;   // zona fuera de toda macrozona conocida → no se juzga
    };
    const conPm = filas.filter((p) => p.id_proyecto_master != null && p.zona && !p.duplicado_de);
    const idsPm = [...new Set(conPm.map((p) => p.id_proyecto_master))];
    let porPmZona = new Map();
    if (idsPm.length) {
      const { data: pmsZ, error: ePm } = await sb.from('proyectos_master')
        .select('id_proyecto_master,nombre_oficial,zona').in('id_proyecto_master', idsPm);
      if (ePm) console.log(`   ⚠️  Superficie 10 no pudo leer proyectos_master (${ePm.message}) — se declara, no se omite.`);
      else porPmZona = new Map((pmsZ || []).map((x) => [x.id_proyecto_master, x]));
    }
    for (const p of conPm) {
      const pm = porPmZona.get(p.id_proyecto_master);
      if (!pm || !pm.zona) continue;
      const mProp = macroDe(p.zona), mEdif = macroDe(pm.zona);
      if (!mProp || !mEdif || mProp === mEdif) continue;
      sup10.push({
        prop_id: p.id, op: p.tipo_operacion, url: p.url,
        zona_prop: p.zona, macrozona_prop: mProp,
        pm: p.id_proyecto_master, pm_nombre: pm.nombre_oficial,
        zona_pm: pm.zona, macrozona_pm: mEdif,
        lat: p.latitud, lon: p.longitud,
      });
    }
  }


  const { sup11, sup11Vecinas } = await colisionesCatalogo();

  // ═══════════════════════════════════════════════════════════════════════════
  // PERSISTIR LOS HALLAZGOS DE MATCHING (mig 335) — la bandeja de /admin/revisar
  // ═══════════════════════════════════════════════════════════════════════════
  // El audit sigue escribiendo su log y su JSON: son lo que se lee a la mañana y no
  // se tocan. Esto es ADEMÁS, y resuelve lo que el log no puede: que lo NO aplicado
  // quede en algún lado. Hoy, un caso que no se aplicó esa mañana desaparece — la
  // noche siguiente se vuelve a detectar y a juzgar, gastando lectores, y nadie
  // sabe si ya se había decidido que no.
  //
  // 🔑 UPSERT por (propiedad_id, superficie): el mismo caso vuelve todas las noches
  // mientras no se resuelva. Sin la clave habría siete copias en una semana; con
  // ella se actualiza y `visto_veces` cuenta cuántas noches lleva esperando.
  //
  // ⚠️ NO PISA lo ya resuelto: un hallazgo aplicado o descartado se deja como está.
  // Si se re-abriera cada noche, descartar no serviría de nada.
  //
  // Solo superficies 1, 2 y 4 — las de matching. Las tres terminan en la misma
  // acción (asignar o corregir el edificio) y comparten la misma evidencia.
  // El VEREDICTO lo da el juez, no este script: acá va NULL y la bandeja muestra el
  // candidato con su contexto. Escribirlo como veredicto sería hacer pasar por
  // decisión lo que es una detección.
  // ───────────────────────────────────────────────────────────────────────────
  // 🧹 AUTO-CIERRE de la bandeja (25-ago-2026)
  // ───────────────────────────────────────────────────────────────────────────
  // La bandeja se ABRÍA sola pero no se CERRABA sola: el SQL del audit se aplica por
  // fuera (UI de Supabase) y nada marcaba el ticket. El 25-ago `/admin/revisar` mostraba
  // **15 pendientes y 9 ya estaban hechos** — uno visto 4 veces sin cambiar de estado.
  // 🔑 El daño es de credibilidad, no de datos: una bandeja donde el 60% ya está resuelto
  // deja de leerse, y el día que aparezca uno que importa va a estar entre fantasmas.
  //
  // El arreglo usa LA MISMA SEÑAL que el audit ya usa para no re-juzgar la prop — no
  // inventa una tercera memoria:
  //   · superficie 1 (sin match) → resuelta cuando la prop YA tiene id_proyecto_master
  //   · superficies 2 y 4        → resueltas cuando la prop YA tiene `confirmado_por`
  // Conservador a propósito: no cierra por "la prop desapareció" ni por antigüedad.
  try {
    const { data: pend, error: ePend } = await sb
      .from('audit_hallazgos')
      .select('id, propiedad_id, superficie, nombre_propuesto')
      .eq('estado', 'pendiente');
    if (ePend) throw ePend;

    if (pend?.length) {
      const ids = [...new Set(pend.map((t) => t.propiedad_id))];
      const { data: props, error: eProps } = await sb
        .from('propiedades_v2').select('id, id_proyecto_master, datos_json').in('id', ids);
      if (eProps) throw eProps;
      const porId = new Map((props || []).map((r) => [r.id, r]));

      const aCerrar = [];
      for (const t of pend) {
        const pr = porId.get(t.propiedad_id);
        if (!pr) continue;                                   // la prop ya no existe: no se toca
        const tieneMatch = pr.id_proyecto_master != null;
        const tieneTag = !!pr.datos_json?.trazabilidad?.confirmado_por;
        // 🔴 CORREGIDO 30-ago-2026 — antes decía `tieneTag || tieneMatch` para las superficies
        // 2 y 4, y eso las cerraba SIEMPRE en la primera corrida siguiente. Motivo: en esas dos
        // superficies **tener match es la PRECONDICIÓN, no la resolución** — la 2 mira auto-matches
        // riesgosos y la 4 los que el lector fijó con dudas: las dos, por definición, ya tienen
        // `id_proyecto_master`. Así que `tieneMatch` era true siempre y el ticket se cerraba solo,
        // sin que nadie hubiera juzgado nada.
        // Medido el 30-ago: de 15 tickets de superficie 4 cerrados, **4 no tenían el tag** — los 4
        // del 29-ago, cuyo SQL nunca se aplicó. El caso se veía en la misma corrida: el audit cerró
        // los tickets y a la vez volvió a listar las mismas 4 props en la superficie 4.
        // 🔑 Para la 2 y la 4 el ÚNICO cierre válido es el tag `confirmado_por`, que es el rastro
        // que deja el juez. Para la 1 sí alcanza el match: ahí la resolución ES conseguir el pm.
        const resuelto = t.superficie === 1 ? tieneMatch : tieneTag;
        if (resuelto) aCerrar.push({ ...t, motivo: t.superficie === 1
          ? `la prop ya tiene id_proyecto_master = ${pr.id_proyecto_master}`
          : `la prop ya lleva el tag ${pr.datos_json?.trazabilidad?.confirmado_por}` });
      }

      if (aCerrar.length) {
        const { error: eCierre } = await sb.from('audit_hallazgos')
          .update({
            // 🔴 'aplicado', NO 'resuelto': el CHECK de la tabla solo admite
            // pendiente | aplicado | descartado. Con 'resuelto' el UPDATE entero falla
            // (violates check constraint) — pasó en la primera prueba, 25-ago.
            estado: 'aplicado',
            resuelto_at: new Date().toISOString(),
            resuelto_por: `auditor_cola_shadow_auto_${new Date().toISOString().slice(0, 10)}`,
            evidencia: 'Cierre automatico: la propiedad ya quedaba resuelta en la base cuando corrio el audit (el SQL se aplico por fuera de la bandeja).',
          })
          .in('id', aCerrar.map((t) => t.id))
          .eq('estado', 'pendiente');                        // candado: no pisa una decisión humana
        if (eCierre) throw eCierre;
        console.log(`🧹 bandeja: ${aCerrar.length} ticket(s) cerrado(s) solos — ya estaban resueltos en la base:`);
        for (const t of aCerrar.slice(0, 12)) {
          console.log(`      #${t.id} · prop ${t.propiedad_id} · sup ${t.superficie}${t.nombre_propuesto ? ` "${t.nombre_propuesto}"` : ''} → ${t.motivo}`);
        }
        if (aCerrar.length > 12) console.log(`      … y ${aCerrar.length - 12} más`);
      }
    }
  } catch (e) {
    // No tumba el audit: cerrar la bandeja es higiene, no el trabajo. Pero se DECLARA.
    console.warn(`⚠️  bandeja: no se pudo auto-cerrar lo ya resuelto → ${e?.message || e}`);
  }


  try {
    const paraBandeja = [
      ...sup1.map((x) => ({ sup: 1, x, pm_actual: null })),
      ...sup2.map((x) => ({ sup: 2, x, pm_actual: x.pm_actual ?? null })),
      ...sup4.map((x) => ({ sup: 4, x, pm_actual: x.pm_actual ?? null })),
    ];

    if (paraBandeja.length) {
      // qué hay ya en la tabla, para no pisar lo resuelto y para contar las vueltas
      const { data: previos, error: ePrev } = await sb
        .from('audit_hallazgos')
        .select('id, propiedad_id, superficie, estado, visto_veces')
        .in('propiedad_id', paraBandeja.map((h) => h.x.prop_id));
      if (ePrev) throw ePrev;

      const porClave = new Map((previos || []).map((r) => [`${r.propiedad_id}|${r.superficie}`, r]));
      const filasUp = [];
      let saltados = 0;

      for (const { sup, x, pm_actual } of paraBandeja) {
        const prev = porClave.get(`${x.prop_id}|${sup}`);
        if (prev && prev.estado !== 'pendiente') { saltados++; continue; }  // ya decidido
        filasUp.push({
          superficie: sup,
          propiedad_id: x.prop_id,
          // 🔴 El NOMBRE de la macrozona tal como vive en la BD ('Equipetrol' / 'Zona
          // Norte'), no el id del flag ('equipetrol' / 'zona-norte'): la bandeja lo
          // muestra y se cruza con las vistas, que usan el nombre.
          macrozona: ZONA_ID === 'todas' ? (x.zona || 'sin zona') : ZONAS_HIBRIDO[ZONA_ID].nombre,
          operacion: x.op,
          veredicto: null,
          pm_actual,
          pm_propuesto: null,
          nombre_propuesto: x.nombre_edificio || null,
          evidencia: null,
          contexto: {
            url: x.url, titulo: x.titulo, zona: x.zona,
            nombre_edificio: x.nombre_edificio,
            candidatos: x.candidatos || null,
            metodo: x.metodo || null,
            pm_nombre: x.pm_nombre || null,
            dist_metros: x.dist_metros ?? null,
            confianza_lector: x.confianza_lector || null,
          },
          ultima_vez_at: new Date().toISOString(),
          visto_veces: prev ? (prev.visto_veces || 1) + 1 : 1,
        });
      }

      if (filasUp.length) {
        const { error: eUp } = await sb
          .from('audit_hallazgos')
          .upsert(filasUp, { onConflict: 'propiedad_id,superficie' });
        if (eUp) throw eUp;
      }
      console.log(`🗂️  bandeja: ${filasUp.length} hallazgo(s) escrito(s)` +
        (saltados ? ` · ${saltados} ya resuelto(s), no se re-abren` : ''));
    } else {
      console.log('🗂️  bandeja: sin hallazgos de matching esta corrida');
    }
  } catch (e) {
    // 🔴 NO tumba el audit. La bandeja es un extra: si falla, el log —que es lo que
    // se lee a la mañana— tiene que salir igual. Pero se DECLARA, porque una bandeja
    // vacía por un error se ve idéntica a una bandeja vacía porque no hubo hallazgos.
    console.warn(`⚠️  bandeja: NO se pudieron persistir los hallazgos → ${e?.message || e}`);
    console.warn('    (el log y el JSON salieron igual; /admin/revisar va a mostrar de menos)');
  }

  const file = join(OUT, `audit-matching-shadow-${TS}.json`);
  writeFileSync(file, JSON.stringify({
    generado: TS, ops: OPS, total_filas: filas.length,
    resumen: { superficie_1_sin_match_con_nombre: sup1.length, superficie_1_ruido_conocido: sup1Ruido.length, superficie_2_automatch_riesgoso: sup2.length, superficie_2_autoconfirmados_ruido: sup2Auto.length, superficie_3_clusters_duplicados: sup3.length, superficie_3_props_a_deduplicar: sup3.reduce((a, c) => a + c.duplicados.length, 0), superficie_4_lector_dudoso: sup4.length, superficie_5_distancia_sospechosa: sup5.length, superficie_6_estado_obra_contradictorio: sup6.length, superficie_6_props_afectadas: sup6.reduce((a, c) => a + c.props_afectadas, 0), superficie_7_brecha_precio: sup7.length, superficie_7_props_afectadas: sup7.reduce((a, c) => a + c.n, 0), superficie_10_macrozona_incoherente: sup10.length, superficie_11_colisiones_catalogo: sup11.length, superficie_11_vecinas_silenciadas: sup11Vecinas, ya_confirmados_por_auditor: supConfirmadas.length },
    superficie_7_umbral_brecha_pct: BRECHA_SOSPECHOSA_PCT,
    superficie_9_moneda_incoherente: sup9.length,
    superficie_10: sup10,
    // SUPERFICIE 11 — dos fichas ACTIVAS que el matcher no puede distinguir. Es del
    // CATÁLOGO, no de la zona auditada: sale igual en los dos logs de la noche.
    superficie_11: sup11,
    superficie_11_vecinas_silenciadas: sup11Vecinas,
    superficie_5_umbral_metros: DISTANCIA_SOSPECHOSA_M,
    superficie_1: sup1, superficie_2: sup2,
    // Nombres YA juzgados como no-edificio (odónimo / familia ambigua) → no van al juez.
    // Quedan acá para poder auditar la lista: si una de estas props resultara ser un edificio
    // real, la entrada de NOMBRES_NO_EDIFICIO está mal y hay que sacarla.
    superficie_1_ruido_conocido: sup1Ruido.map((s) => ({
      prop_id: s.prop_id, op: s.op, nombre_edificio: s.nombre_edificio, url: s.url,
      tipo: s.ruido.tipo, decidido: s.ruido.decidido, razon: s.ruido.razon,
    })),
    // Se auto-confirmaron por ruido geográfico (pin genérico o <200 m). NO van al juez,
    // pero quedan acá para poder auditar el umbral si alguno saliera mal.
    superficie_2_autoconfirmados: sup2Auto.map((s) => ({
      prop_id: s.prop_id, op: s.op, nombre_edificio: s.nombre_edificio,
      pm_actual: s.pm_actual, pm_nombre: s.pm_nombre,
      motivo: s.gps_placeholder ? 'pin_generico_del_portal' : 'borde_de_zona_<200m',
      dist_metros: s.dist_metros,
    })),
    superficie_3: sup3,
    // Clusters que un humano YA juzgó (tag `dedup_revisado`) y por eso no se re-proponen.
    // Se DECLARA el número: un descarte invisible se lee como "no había duplicados".
    superficie_3_ya_revisados: sup3Revisados,
    superficie_4: sup4,
    // SUPERFICIE 5 — el match quedó LEJOS del edificio. REPORTA, NO DESCONECTA: medido el
    // 4-ago, la mitad de los sospechosos tenían el match BIEN y el pin del portal mal.
    // El juez tiene que decidir cuál de los tres lados falla (aviso / ficha del pm / pin).
    superficie_5: sup5,
    // SUPERFICIE 6 — el edificio se contradice a sí mismo sobre su estado de obra.
    // `resuelto_por_regla` dice cómo lo dejó la mig 315; el humano lo SELLA con un
    // dictado (`proyectos_master.entrega_verificada`) o lo corrige. Sin el sello,
    // el edificio vuelve a esta lista todas las noches.
    superficie_6: sup6,
    // SUPERFICIE 7 — dos avisos del MISMO depto (pm + área + captador) a precios que no
    // pueden ser los dos ciertos. REPORTA, NO DECIDE: no dice cuál es el bueno. El rastro
    // que corta la relectura es `datos_json.trazabilidad.brecha_precio_revisada`.
    superficie_7: sup7,
    // SUPERFICIE 9 — el aviso habla SOLO en bolivianos y no esta tagueado `bob`. El precio
    // en Bs es el dato del aviso; si figura en USD, alguien lo convirtio (y con que rate).
    // REPORTA, NO DECIDE: el arreglo mueve el precio ademas del tag. Rastro:
    // `datos_json.trazabilidad.moneda_revisada`.
    superficie_9: sup9,
    // SUPERFICIE 4b — el lector dudó y NO hay match. La 4 sólo mira las dudas que ADEMÁS
    // tuvieron match; éstas no las miraba nadie. `baja` antes que `media`. REPORTA, NO DECIDE:
    // la duda no dice qué está mal, sólo que hay que leer el aviso.
    superficie_4b: sup4b.slice().sort((a, b) =>
      (a.confianza_lector === 'baja' ? 0 : 1) - (b.confianza_lector === 'baja' ? 0 : 1) || a.prop_id - b.prop_id),
    // Matches de superficie 2/4 que un juez YA confirmó (tag `datos_json.trazabilidad.confirmado_por`).
    // No vuelven al juez. Quedan acá para poder revocar una confirmación que hubiera salido mal.
    ya_confirmados_por_auditor: supConfirmadas.map((s) => ({
      prop_id: s.prop_id, op: s.op, superficie: s.superficie, nombre_edificio: s.nombre_edificio,
      pm_actual: s.pm_actual, confirmado_por: s.confirmado_por, confianza_lector: s.confianza_lector ?? null,
    })),
  }, null, 2));

  console.log(`────────── RESUMEN AUDIT MATCHING SHADOW ──────────`);
  if (sup5.length) {
    console.log(`  📍 Superficie 5 (match LEJOS del edificio, >${DISTANCIA_SOSPECHOSA_M} m): ${sup5.length}`);
    console.log(`     ⚠️  REPORTA, NO DESCONECTA: la mitad de los sospechosos suelen tener el match BIEN`);
    console.log(`         y el pin del portal mal (medido 4-ago: 3 de 6). Hay que LEER el aviso.`);
    for (const s of sup5.slice(0, 12)) {
      console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio || '—'}" → pm ${s.pm_actual} "${s.pm_nombre || '?'}"  ${(s.dist_metros / 1000).toFixed(1)} km${linkDe(s.url)}`);
      console.log(`        sospechoso: ${s.sospechoso}${s.hermanos_del_pm != null ? `  (${s.hermanos_pegados_al_pm}/${s.hermanos_del_pm} hermanos pegados)` : ''}`);
    }
    if (sup5.length > 12) console.log(`     … y ${sup5.length - 12} más (todas en el JSON, ordenadas por distancia)`);
    console.log('');
  }
  if (sup6.length) {
    const props6 = sup6.reduce((a, c) => a + c.props_afectadas, 0);
    console.log(`  🏗️  Superficie 6 (el EDIFICIO se contradice sobre su estado de obra): ${sup6.length} edificios · ${props6} props`);
    console.log(`     ⚠️  REPORTA, NO DECIDE. La regla (mig 315) ya los resuelve hacia "entregado" —`);
    console.log(`         un edificio no vuelve al pozo—, pero eso es una PRESUNCIÓN. El dictado del`);
    console.log(`         founder (proyectos_master.entrega_verificada) es lo único que la vuelve afirmable,`);
    console.log(`         y es lo que hace que el edificio no vuelva a esta lista mañana.`);
    for (const s of sup6.slice(0, 12)) {
      const cruz = s.clase === 'conflicto_cruzado';
      console.log(`     pm ${s.pm} "${s.pm_nombre || '?'}" [${s.pm_zona || '?'}] · ${s.props_afectadas} props`);
      console.log(`        ${cruz ? '↔ CRUZADO: todos los avisos dicen preventa PERO hay alquiler activo (no se alquila lo no construido)'
                                 : `⇄ INTERNO: ${s.avisos_entregado} avisos dicen entregado vs ${s.avisos_preventa} preventa`}`
                  + `${s.alquileres_activos ? ` · ${s.alquileres_activos} alquiler(es) activo(s)` : ''}`
                  + `${s.fecha_entrega_vencida ? ' · ⏰ fecha_entrega YA VENCIDA' : ''}`);
      console.log(`        la regla lo deja en: ${s.resuelto_por_regla || 'preventa (sin cambio) → necesita dictado'}`);
    }
    if (sup6.length > 12) console.log(`     … y ${sup6.length - 12} más (todos en el JSON)`);
    console.log('');
  }
  if (sup7.length) {
    const props7 = sup7.reduce((a, c) => a + c.n, 0);
    console.log(`  💸 Superficie 7 (mismo depto, precios incompatibles >${BRECHA_SOSPECHOSA_PCT}%): ${sup7.length} grupos · ${props7} avisos`);
    console.log(`     ⚠️  REPORTA, NO DECIDE: no dice cuál precio es el bueno, dice que los dos no`);
    console.log(`         pueden serlo. Origen: Sky Eclipse, un aviso a la MITAD de sus gemelos`);
    console.log(`         estuvo 5 semanas tirando abajo la mediana de su zona.`);
    for (const s of sup7.slice(0, 10)) {
      console.log(`     pm ${s.pm} "${s.edificio || '?'}" [${s.zona}] · ${s.area} m² · ${s.captador} · brecha ${s.brecha_pct}%`);
      for (const a of s.avisos) console.log(`        ${a.prop_id}  $${a.precio_norm}${a.precio_m2 ? `  ($${a.precio_m2}/m²)` : ''}`);
    }
    if (sup7.length > 10) console.log(`     … y ${sup7.length - 10} más (todos en el JSON)`);
    console.log('');
  }
  if (sup9.length) {
    console.log(`  💱 Superficie 9 (el aviso habla SOLO en Bs y no está tagueado \`bob\`): ${sup9.length}`);
    console.log(`     ⚠️  El precio en Bs es el dato del aviso. Si figura en USD, alguien lo convirtió`);
    console.log(`         — y el divisor dice con qué rate. 6,96/7 = el rate MUERTO (infla ~66%).`);
    for (const s of sup9.slice(0, 10)) {
      console.log(`     ${s.prop_id} "${s.nombre_edificio || '—'}" [${s.zona}] · aviso: "${s.cita}"${linkDe(s.url)}`);
      console.log(`        guardado $${s.precio_guardado_usd} · muestra $${s.precio_que_muestra}` +
        `${s.precio_m2_hoy ? ` ($${s.precio_m2_hoy}/m²)` : ''} · divisor implícito: ${s.divisor_implicito ?? '—'}`);
      console.log(`        → si es \`bob\`: precio_usd = ${s.bs_del_aviso} (los Bs crudos) y la vista los divide por el TC del día`);
    }
    if (sup9.length > 10) console.log(`     … y ${sup9.length - 10} más (todos en el JSON)`);
    console.log('');
  }
  if (sup10.length) {
    console.log(`  🗺️  Superficie 10 (la prop y su EDIFICIO en macrozonas distintas): ${sup10.length}`);
    console.log(`     ⚠️  Un edificio no está en dos macrozonas. La zona de la prop la escribe el`);
    console.log(`         cargador desde el GPS del aviso — que suele ser el pin genérico del portal.`);
    console.log(`         Mientras no se corrija, esa prop alimenta la mediana de una microzona ajena.`);
    console.log(`         🔴 Corregir el GPS NO recalcula la zona: va en el MISMO UPDATE.`);
    for (const s of sup10.slice(0, 15)) {
      console.log(`     ${s.prop_id} [${s.op}] "${s.pm_nombre}" (pm ${s.pm})${linkDe(s.url)}`);
      console.log(`        prop dice: ${s.zona_prop} [${s.macrozona_prop}]  ·  edificio: ${s.zona_pm} [${s.macrozona_pm}]`);
    }
    if (sup10.length > 15) console.log(`     … y ${sup10.length - 15} más (todos en el JSON)`);
    console.log('');
  }
  imprimirColisiones(sup11, sup11Vecinas);
  console.log(`  Superficie 1 (sin match + con nombre → PM_NUEVO/fuzzy): ${sup1.length}`);
  for (const s of sup1.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}"  cands:${s.candidatos.length}${s.candidatos[0] ? ` (mejor ${s.candidatos[0].nombre} ${s.candidatos[0].score})` : ''}${linkDe(s.url)}`);
  // Se DECLARA lo filtrado (regla 3 de NOMBRES_NO_EDIFICIO): un descarte invisible se lee
  // como "no había nada". Estas props siguen sin match — que es el veredicto correcto —,
  // lo único que se evita es re-juzgarlas cada noche.
  if (sup1Ruido.length) {
    console.log(`  └─ + ${sup1Ruido.length} con nombre YA juzgado no-edificio (NO van al juez, siguen sin match):`);
    for (const s of sup1Ruido.slice(0, 20)) console.log(`        ${s.prop_id} [${s.op}] "${s.nombre_edificio}" · ${s.ruido.tipo} (decidido ${s.ruido.decidido})`);
  }
  console.log(`  Superficie 2 (auto-match riesgoso nombre_unico_zona_dif): ${sup2.length}`);
  for (const s of sup2.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre || '?'}, zona ${s.pm_zona || '?'} vs ${s.zona}) dist ${s.dist_metros ?? '?'}m` +
    (s.pin_generico_pero_ambiguo ? `  ⚠️ pin genérico Y ${s.homonimos_catalogo} homónimos en el catálogo → sin discriminante, va al juez` : '') + linkDe(s.url));
  // Se DECLARA lo silenciado: un filtro que no se ve es un filtro que nadie audita.
  if (sup2Auto.length) {
    const nPin = sup2Auto.filter((s) => s.gps_placeholder).length;
    console.log(`  └─ + ${sup2Auto.length} auto-confirmadas por ruido geográfico (NO van al juez): ${nPin} por pin genérico · ${sup2Auto.length - nPin} por borde de zona <200m`);
    for (const s of sup2Auto.slice(0, 20)) console.log(`        ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre}) · ${s.gps_placeholder ? 'pin genérico' : `${s.dist_metros}m`}`);
  }
  const dupProps = sup3.reduce((a, c) => a + c.duplicados.length, 0);
  console.log(`  Superficie 3 (duplicados apart-hotel/republicación): ${sup3.length} clusters · ${dupProps} props a deduplicar`);
  for (const c of sup3.slice(0, 20)) console.log(`     [${c.op}] "${c.edificio}"${c.pm ? ` pm${c.pm}` : ''} $${c.precio} ${c.area}m² → sobrevive ${c.sobreviviente}, duplicados: ${c.duplicados.join(',')} (${c.n} avisos)${c.por_clave_fuerte ? ` · ⚑ por PISO ${c.piso}+área+precio (textos DIFIEREN) · publicados ${c.fechas_pub.length === 1 ? `el MISMO día (${c.fechas_pub[0]}) → fuerte` : `en fechas DISTINTAS (${c.fechas_pub.join(' vs ')}) → mirar`}` : ''}`);
  // Se DECLARA lo silenciado: un cluster que no se ve no se distingue de uno que no existe.
  if (sup3Revisados) console.log(`  └─ + ${sup3Revisados} cluster(s) que un humano YA juzgó (tag \`dedup_revisado\`) → no se re-proponen`);
  console.log(`  Superficie 4 (el LECTOR fijó el pm, con dudas): ${sup4.length}`);
  for (const s of sup4.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre || '?'})  confianza del lector: ${s.confianza_lector}${s.dist_metros != null ? ` · ${s.dist_metros}m` : ''}${linkDe(s.url)}`);
  // Con sup4 en 0 hay DOS motivos posibles y conviene no confundirlos en el parte matutino:
  // que no haya nada que juzgar, o que lo que había ya esté confirmado y tagueado.
  if (!sup4.length && !supConfirmadas.some((s) => s.superficie === 4)) {
    console.log(`     (las props cargadas antes del 29-jul no guardan la confianza del lector → no entran acá)`);
  }
  // ── Superficie 4b — el lector dudó y NO hay match ──────────────────────────────
  const sup4bOrd = sup4b.slice().sort((a, b) =>
    (a.confianza_lector === 'baja' ? 0 : 1) - (b.confianza_lector === 'baja' ? 0 : 1) || a.prop_id - b.prop_id);
  const n4bBaja = sup4bOrd.filter((s) => s.confianza_lector === 'baja').length;
  console.log(`  Superficie 4b (el LECTOR dudó y NO hay match): ${sup4bOrd.length}${n4bBaja ? ` · ${n4bBaja} con confianza BAJA` : ''}`);
  if (sup4bOrd.length) {
    console.log(`     ⚠️  REPORTA, NO DECIDE: la duda del lector no dice QUÉ está mal (nombre, precio, área o nada).`);
    console.log(`         Es una cola de lectura priorizada — 'baja' primero. Sin nombre tampoco caen en la superficie 1.`);
    // La primera corrida arrastra todo lo acumulado desde el 29-jul; después es un goteo.
    // Umbral en 15: medido el 22-ago, la corrida más cargada es ZN alquiler con 24.
    if (sup4bOrd.length >= 15) {
      console.log(`     📦 Este número es el BACKLOG ACUMULADO de la primera corrida, no la tasa nocturna.`);
    }
  }
  for (const s of sup4bOrd.slice(0, 20)) {
    console.log(`     ${s.prop_id} [${s.op}] zona ${s.zona || '—'} · método ${s.metodo} · confianza del lector: ${s.confianza_lector}${linkDe(s.url)}`);
  }
  if (sup4bOrd.length > 20) console.log(`     … y ${sup4bOrd.length - 20} más (la lista completa va en el JSON)`);
  // Se DECLARA lo excluido por confirmación previa (mismo criterio que los otros dos filtros).
  if (supConfirmadas.length) {
    const n2 = supConfirmadas.filter((s) => s.superficie === 2).length;
    console.log(`  └─ + ${supConfirmadas.length} match(es) YA confirmados por un juez (NO vuelven al juez): ${n2} de superficie 2 · ${supConfirmadas.length - n2} de superficie 4`);
    for (const s of supConfirmadas.slice(0, 20)) console.log(`        ${s.prop_id} [${s.op}] sup${s.superficie} "${s.nombre_edificio}" → pm ${s.pm_actual} · ${s.confirmado_por}`);
  }
  console.log(`\n  📦 → ${file}`);
  // Marca de "hoy ya se audito con las 4 capturas presentes". La leen los disparos
  // agendados posteriores (--si-falta) para no repetir trabajo. Solo se escribe si el
  // alcance fue COMPLETO: un audit parcial no debe bloquear al que si pueda ver todo.
  if (guardaGlobal?.ok && marcaCompletaGlobal) {
    try {
      writeFileSync(marcaCompletaGlobal, JSON.stringify({
        ts: new Date().toISOString(), fecha: guardaGlobal.hoy, zona: ZONA_ID,
        capturas: guardaGlobal.corrieron, json: file,
      }, null, 2));
    } catch { /* la marca es una optimizacion, no puede tumbar el audit */ }
  }
  // 🔴 El aviso de alcance se REPITE acá: el resumen es lo que se copia al log y lo que se
  // lee a la mañana. Un "0 superficies" al lado de "faltó una captura" se lee distinto que
  // un "0" solo — y ésa es toda la diferencia entre "está limpio" y "no lo miré entero".
  if (AVISO_ALCANCE) {
    console.log(`
  🔴 OJO — ${AVISO_ALCANCE}`);
  }
  console.log(`     Siguiente: sup.1/sup.2/sup.4 → subagentes-lectores (JUEZ). sup.3 → dedup determinístico (revisar y aplicar):`);
  console.log(`       sup.1 → APROBAR(candidato) | PM_NUEVO(nombre_real) | SIN_NOMBRE`);
  console.log(`       sup.2 → CONFIRMAR el pm_actual | CORREGIR(otro pm) | RECHAZAR (nombre no aparece)`);
  console.log(`       sup.3 → UPDATE propiedades_v2 SET duplicado_de=<sobreviviente> WHERE id IN (<duplicados>)`);
  console.log(`       sup.4 → CONFIRMAR | CORREGIR(otro pm) | SIN_NOMBRE — el lector ya dudó; el juez decide`);
  console.log(`     SQL contra propiedades_v2 lo aplica el humano (candado IS NULL / formato-objeto).\n`);
  await termometroTC();
}


// ============================================================================
// TERMÓMETRO DEL TIPO DE CAMBIO — $0, solo lectura, sin juez
// ----------------------------------------------------------------------------
// POR QUÉ EXISTE. La decisión del 28-jul (mig 311: los avisos que dicen "TC 7" NO se
// descuentan, se publican y se avisa) se tomó sobre UNA medición: esos avisos valían
// +3,7% respecto de las otras unidades DE SU MISMO EDIFICIO. Rehecha el 19-ago daba
// +19% en Equipetrol y +20% en Zona Norte. **Cambió tanto en tres semanas y nadie lo
// estaba mirando** — se descubrió de casualidad, porque el founder preguntó por una
// propiedad. Esto hace que se descubra por el log.
//
// NO decide nada ni bloquea nada: imprime 3 números y dice si hay que mirar.
//   1. el test del mismo edificio (el que fundó la 311)
//   2. cuántos avisos anclan al TC viejo, por macrozona
//   3. si el criterio de comparación del badge tiene con qué comparar
// Detalle: docs/reports/AUDITORIA_SENALES_PRECIO_2026-08-19.md
// ============================================================================
async function termometroTC() {
  console.log('\n  TERMOMETRO DEL TIPO DE CAMBIO');
  const { data: rows, error } = await sb
    .from('v_mercado_venta_shadow')
    .select('id_proyecto_master,precio_m2,tipo_cambio_detectado,zona');
  if (error || !rows?.length) { console.log('     (sin datos)'); return; }

  const mz = (z) => (z || '').includes('anillo') ? 'Zona Norte' : 'Equipetrol';
  const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

  // 1) test del mismo edificio: TC7 vs sus vecinas, por macrozona
  const porPM = {};
  for (const r of rows) { if (!r.id_proyecto_master || !r.precio_m2) continue;
    (porPM[r.id_proyecto_master] ??= []).push(r); }
  for (const zona of ['Equipetrol', 'Zona Norte']) {
    const tc7 = [], vec = [];
    for (const u of Object.values(porPM)) {
      const a = u.filter(x => x.tipo_cambio_detectado === 'oficial_viejo' && mz(x.zona) === zona);
      const b = u.filter(x => x.tipo_cambio_detectado !== 'oficial_viejo' && mz(x.zona) === zona);
      if (a.length && b.length) { tc7.push(...a.map(x => +x.precio_m2)); vec.push(...b.map(x => +x.precio_m2)); }
    }
    const mt = mediana(tc7), mv = mediana(vec);
    if (mt && mv) {
      const d = Math.round((mt / mv - 1) * 100);
      // 28-jul: +3,7% (fundó la mig 311) · 19-ago: +19% Eq / +20% ZN
      const alarma = Math.abs(d) >= 30 ? '  🔴 se movió mucho — revisar la decisión de la mig 311' : '';
      console.log(`     ${zona.padEnd(11)} TC7 $${Math.round(mt)}/m² vs sus vecinas $${Math.round(mv)}/m² → ${d > 0 ? '+' : ''}${d}%${alarma}`);
    } else console.log(`     ${zona.padEnd(11)} sin edificios mixtos para comparar`);
  }

  // 2) cuántos anclan al TC viejo
  for (const zona of ['Equipetrol', 'Zona Norte']) {
    const t = rows.filter(r => mz(r.zona) === zona);
    const n = t.filter(r => r.tipo_cambio_detectado === 'oficial_viejo').length;
    console.log(`     ${zona.padEnd(11)} anclan al TC viejo: ${n} de ${t.length} (${(100 * n / t.length).toFixed(1)}%)`);
  }

  // 3) ¿el criterio de comparación del badge tiene con qué comparar?
  const ref = rows.filter(r => ['paralelo', 'oficial'].includes(r.tipo_cambio_detectado)).length;
  console.log(`     criterio de comparación del badge: ${ref} avisos de referencia de ${rows.length}` +
    (ref < rows.length * 0.25 ? '  ⚠️  MUDO (sigue con la lista vieja `paralelo/oficial`)' : ''));
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
