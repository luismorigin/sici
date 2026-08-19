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
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { detectarDuplicados } from '../auditoria-feed-ventas/lib/dup-checks.mjs';
import { ZONAS_HIBRIDO } from './lib/zonas-hibrido.mjs';

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
async function capturasDeHoyCorrieron() {
  const ahora = new Date(); // la máquina del founder corre en hora de Bolivia
  const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
  const { data, error } = await sb
    .from('market_absorption_snapshots_shadow').select('fecha').eq('fecha', hoy).limit(1);
  // Ante un error de consulta NO bloqueamos: la guarda existe para evitar un audit ciego,
  // no para volverse ella misma un motivo de caída.
  if (error) { console.log(`   ⚠️  No se pudo verificar el snapshot de hoy (${error.message}) — sigo igual.`); return { ok: true, hoy }; }
  return { ok: (data || []).length > 0, hoy };
}

// Métodos que marcan AUTO-MATCH RIESGOSO (surface 2). El matcher híbrido pone confianza 85 +
// metodo 'nombre_unico_zona_dif' cuando el nombre es único exacto pero la zona no corrobora.
const METODOS_RIESGO = new Set(['nombre_unico_zona_dif']);
const slugDe = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '') : null);

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
const COLS = 'id,fuente,url,tipo_operacion,latitud,longitud,zona,nombre_edificio,id_proyecto_master,piso,duplicado_de,campos_bloqueados,precio_usd,precio_mensual_usd,precio_mensual_bob,area_total_m2,fecha_publicacion,fecha_discovery,estado_construccion,datos_json';

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

async function main() {
  console.log(`\n🔎 AUDIT MATCHING SHADOW — ops: ${OPS.join('+')}${LIMIT ? ` (limit ${LIMIT}/op)` : ''}. READ-ONLY, $0 (sin fetch).\n`);

  const guarda = await capturasDeHoyCorrieron();
  if (!guarda.ok) {
    if (!SIN_GUARDA) {
      console.error(
        `\n🛑 ABORTADO — las capturas de hoy (${guarda.hoy}) todavía no corrieron.\n` +
        `   No hay snapshot shadow de hoy, así que este audit estaría revisando el inventario de ayer\n` +
        `   y reportaría "nada que aplicar" sin haber visto lo de esta noche (pasó el 24-jul-2026).\n\n` +
        `   Qué hacer:\n` +
        `     · Si las routines se dispararon desordenadas, corré primero las capturas y después este audit.\n` +
        `     · Si querés auditar el inventario actual igual: node auditar-matching-shadow.mjs --sin-guarda\n`
      );
      process.exit(2);
    }
    console.log(`   ⚠️  --sin-guarda: las capturas de hoy (${guarda.hoy}) no corrieron. Audito el inventario tal como está.\n`);
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
      if (!k || p.id_proyecto_master == null) continue;
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
    const RUIDO_METROS = 200;
    sup2Auto = sup2.filter((s) => s.pm_nombre && (s.gps_placeholder || (s.dist_metros != null && s.dist_metros < RUIDO_METROS)));
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
    }));
    for (const c of detectarDuplicados(props)) {
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

  const file = join(OUT, `audit-matching-shadow-${TS}.json`);
  writeFileSync(file, JSON.stringify({
    generado: TS, ops: OPS, total_filas: filas.length,
    resumen: { superficie_1_sin_match_con_nombre: sup1.length, superficie_1_ruido_conocido: sup1Ruido.length, superficie_2_automatch_riesgoso: sup2.length, superficie_2_autoconfirmados_ruido: sup2Auto.length, superficie_3_clusters_duplicados: sup3.length, superficie_3_props_a_deduplicar: sup3.reduce((a, c) => a + c.duplicados.length, 0), superficie_4_lector_dudoso: sup4.length, superficie_5_distancia_sospechosa: sup5.length, superficie_6_estado_obra_contradictorio: sup6.length, superficie_6_props_afectadas: sup6.reduce((a, c) => a + c.props_afectadas, 0), superficie_7_brecha_precio: sup7.length, superficie_7_props_afectadas: sup7.reduce((a, c) => a + c.n, 0), ya_confirmados_por_auditor: supConfirmadas.length },
    superficie_7_umbral_brecha_pct: BRECHA_SOSPECHOSA_PCT,
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
      console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio || '—'}" → pm ${s.pm_actual} "${s.pm_nombre || '?'}"  ${(s.dist_metros / 1000).toFixed(1)} km`);
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
  console.log(`  Superficie 1 (sin match + con nombre → PM_NUEVO/fuzzy): ${sup1.length}`);
  for (const s of sup1.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}"  cands:${s.candidatos.length}${s.candidatos[0] ? ` (mejor ${s.candidatos[0].nombre} ${s.candidatos[0].score})` : ''}`);
  // Se DECLARA lo filtrado (regla 3 de NOMBRES_NO_EDIFICIO): un descarte invisible se lee
  // como "no había nada". Estas props siguen sin match — que es el veredicto correcto —,
  // lo único que se evita es re-juzgarlas cada noche.
  if (sup1Ruido.length) {
    console.log(`  └─ + ${sup1Ruido.length} con nombre YA juzgado no-edificio (NO van al juez, siguen sin match):`);
    for (const s of sup1Ruido.slice(0, 20)) console.log(`        ${s.prop_id} [${s.op}] "${s.nombre_edificio}" · ${s.ruido.tipo} (decidido ${s.ruido.decidido})`);
  }
  console.log(`  Superficie 2 (auto-match riesgoso nombre_unico_zona_dif): ${sup2.length}`);
  for (const s of sup2.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre || '?'}, zona ${s.pm_zona || '?'} vs ${s.zona}) dist ${s.dist_metros ?? '?'}m`);
  // Se DECLARA lo silenciado: un filtro que no se ve es un filtro que nadie audita.
  if (sup2Auto.length) {
    const nPin = sup2Auto.filter((s) => s.gps_placeholder).length;
    console.log(`  └─ + ${sup2Auto.length} auto-confirmadas por ruido geográfico (NO van al juez): ${nPin} por pin genérico · ${sup2Auto.length - nPin} por borde de zona <200m`);
    for (const s of sup2Auto.slice(0, 20)) console.log(`        ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre}) · ${s.gps_placeholder ? 'pin genérico' : `${s.dist_metros}m`}`);
  }
  const dupProps = sup3.reduce((a, c) => a + c.duplicados.length, 0);
  console.log(`  Superficie 3 (duplicados apart-hotel/republicación): ${sup3.length} clusters · ${dupProps} props a deduplicar`);
  for (const c of sup3.slice(0, 20)) console.log(`     [${c.op}] "${c.edificio}"${c.pm ? ` pm${c.pm}` : ''} $${c.precio} ${c.area}m² → sobrevive ${c.sobreviviente}, duplicados: ${c.duplicados.join(',')} (${c.n} avisos)${c.por_clave_fuerte ? ` · ⚑ por PISO ${c.piso}+área+precio (textos DIFIEREN) · publicados ${c.fechas_pub.length === 1 ? `el MISMO día (${c.fechas_pub[0]}) → fuerte` : `en fechas DISTINTAS (${c.fechas_pub.join(' vs ')}) → mirar`}` : ''}`);
  console.log(`  Superficie 4 (el LECTOR fijó el pm, con dudas): ${sup4.length}`);
  for (const s of sup4.slice(0, 20)) console.log(`     ${s.prop_id} [${s.op}] "${s.nombre_edificio}" → pm ${s.pm_actual} (${s.pm_nombre || '?'})  confianza del lector: ${s.confianza_lector}${s.dist_metros != null ? ` · ${s.dist_metros}m` : ''}`);
  // Con sup4 en 0 hay DOS motivos posibles y conviene no confundirlos en el parte matutino:
  // que no haya nada que juzgar, o que lo que había ya esté confirmado y tagueado.
  if (!sup4.length && !supConfirmadas.some((s) => s.superficie === 4)) {
    console.log(`     (las props cargadas antes del 29-jul no guardan la confianza del lector → no entran acá)`);
  }
  // Se DECLARA lo excluido por confirmación previa (mismo criterio que los otros dos filtros).
  if (supConfirmadas.length) {
    const n2 = supConfirmadas.filter((s) => s.superficie === 2).length;
    console.log(`  └─ + ${supConfirmadas.length} match(es) YA confirmados por un juez (NO vuelven al juez): ${n2} de superficie 2 · ${supConfirmadas.length - n2} de superficie 4`);
    for (const s of supConfirmadas.slice(0, 20)) console.log(`        ${s.prop_id} [${s.op}] sup${s.superficie} "${s.nombre_edificio}" → pm ${s.pm_actual} · ${s.confirmado_por}`);
  }
  console.log(`\n  📦 → ${file}`);
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
