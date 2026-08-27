// ============================================================================
// CARGADOR DEPTOS SHADOW — reader-integrado, UNA pasada (sin baseline ni patch)
// ----------------------------------------------------------------------------
// Flujo en 2 fases con el LECTOR en el medio (no se escribe nada malo, ni transitorio):
//
//   1) node cargar-deptos-shadow.mjs --prep [N | --ids a,b,c]
//        Fetchea material ($0): slug + título + descripción + señales estructuradas +
//        candidatos de matching (buscar_proyecto_fuzzy). NO escribe a la BD. Vuelca
//        output/material-<ts>.json con `veredicto: null` por depto.
//
//   2) EL LECTOR (yo hoy / API mañana) lee el material y llena `veredicto` en cada uno
//        siguiendo READER_SPEC.md (precio/TC/dorms/nombre_canónico/gate).
//
//   3) node cargar-deptos-shadow.mjs --apply output/material-<ts>.json
//        Arma la fila CORRECTA de una (estructurado auto + veredicto) y resuelve el
//        match name-first (matcher.mjs). Escribe UN upsert a propiedades_v2_shadow.
//
// 🔒 PROD INTACTO. Solo muta `propiedades_v2_shadow` (service_role). A prod: solo SELECT
//    + RPC read-only (buscar_proyecto_fuzzy). Los alias sugeridos se REGISTRAN, no se
//    escriben a proyectos_master (invariante fase-shadow: cero escritura a prod).
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pace, circuit, trafico } from '../sonda-suelo/lib/fetcher.mjs';
import { fetchDetalleDepto } from './lib/detalle-deptos.mjs';
import { matchearPorNombre } from './lib/matcher.mjs';
import { reBucket } from './lib/canonicalizar.mjs';
import { reservarIdsShadow } from './lib/reservar-ids-shadow.mjs';
import { resolverZona, conSufijo } from './lib/zonas-hibrido.mjs';
import { zonaDelProyecto, resolverZonaFila } from './lib/zona-del-proyecto.mjs';
import { detalleDesdeBase } from './lib/detalle-desde-base.mjs';
import { leerRechazados, guardarRechazados, TTL_DIAS, UMBRAL_FETCH_FALLIDO, RAZON_FETCH_FALLIDO } from './lib/rechazados.mjs';
import { traerTodo } from './lib/traer-todo.mjs';
import { filtrarAliasSugeridos, declararDescartes } from './lib/filtrar-alias.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const ZONA = resolverZona();                    // default equipetrol → sin flags, igual que antes
const ZONAS_EQ = ZONA.zonas;
const SCRAPER_VERSION = 'hibrido-shadow-v4';  // v4 = 4 cortes de ambigüedad de la validación ciega de 100 (equipado-literal / TC-palabra-sin-número / dos-precios-el-bajo / gate-renta-oferta-vs-pitch). v3 = reader extendido (amenidades/extra/equipamiento/baños/piso/estado/fecha/amoblado/multiproyecto)
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const MODE = argv.includes('--prep') ? 'prep' : argv.includes('--apply') ? 'apply' : argv.includes('--nuevas') ? 'nuevas' : null;
// --local (28-jul-2026): armar el material SIN salir al portal, desde lo ya guardado en
// `datos_json_enrichment`. Nació para Zona Norte, donde ya hay 435 de 445 anuncios con su
// texto guardado por el pipeline viejo: re-leerlos no necesita internet. Es gratis, no
// gasta proxy, no expone la IP, y funciona aunque el anuncio ya no esté publicado.
// ⚠️ Es RE-LECTURA de lo capturado, NO captura fresca: si el anuncio cambió en el portal,
// esto no se entera (para eso está /audit-deptos-shadow, que compara contra el portal).
const LOCAL = argv.includes('--local');
const idsArg = (() => { const i = argv.indexOf('--ids'); return i >= 0 ? (argv[i + 1] || '').split(',').map((x) => Number(x.trim())).filter(Boolean) : null; })();
const N = Number(argv.find((a) => /^\d+$/.test(a))) || 4;
const applyFile = MODE === 'apply' ? argv[argv.indexOf('--apply') + 1] : null;
const nuevasFile = MODE === 'nuevas' ? argv[argv.indexOf('--nuevas') + 1] : null;

// ---- amenidades canónicas (deriva `lista`; cero drift de vocabulario) ----
// SOLO DIFERENCIADORES (esEstandar:false). Las esEstandar (Seguridad/Ascensor/Recepción/Área Social/
// Terraza/Lavandería/Cámaras) se EXCLUYEN a propósito: el spec (§AMENIDADES) las prohíbe en `amenidades`
// (casi todo edificio las tiene, no diferencian). Si el fallback estructural las incluía, poblaba amenidades
// falsas desde el checkbox (auditoría 10-jul: 2674/3343). NO reagregar acá.
const CANON = [
  [/piscina|pool/i, 'Piscina'], [/gimnasio|gym/i, 'Gimnasio'], [/sauna|jacuzzi/i, 'Sauna/Jacuzzi'],
  [/churrasq|parrill|barbacoa|quincho/i, 'Churrasquera'], [/co-?work/i, 'Co-working'],
  [/sal[oó]n.*event|eventos/i, 'Salón de Eventos'], [/pet ?friendly|mascota/i, 'Pet Friendly'],
  [/parque infantil/i, 'Parque Infantil'], [/jard[ií]n/i, 'Jardín'],
  [/estacionamiento.*visita|parqueo.*visita/i, 'Estacionamiento para Visitas'],
];
const canonizar = (arr) => { const s = new Set(); for (const a of arr || []) for (const [re, k] of CANON) if (re.test(a)) s.add(k); return [...s]; };
const slugDe = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '') : null);
// fecha_publicacion protegida: la más ANTIGUA gana (nunca pisar hacia adelante — anti re-scrape/bump)
const fechaDia = (v) => (v ? String(v).slice(0, 10) : null);
const fechaMin = (a, b) => { const xs = [fechaDia(a), fechaDia(b)].filter(Boolean); return xs.length ? xs.sort()[0] : null; };
// Memoria de rechazados (gate) → no reaparecen en lotes frescos (basura: anticrético/baulera/parqueo/multiproyecto).
// Indexada por URL desde el 2-ago-2026 (antes: array de ids, y a cada NUEVA se le reserva un id 8M
// distinto por corrida → el filtro no enganchaba nunca). Ver lib/rechazados.mjs.
const REJ_FILE = join(OUT, 'rechazados.json');

const COLS = 'id,fuente,url,tipo_propiedad_original,estado_construccion,precio_usd,tipo_cambio_detectado,' +
  'moneda_original,area_total_m2,dormitorios,banos,piso,estacionamientos,latitud,longitud,zona,microzona,' +
  'id_proyecto_master,nombre_edificio,fecha_publicacion,score_calidad_dato,es_multiproyecto,duplicado_de,' +
  'baulera,solo_tc_paralelo,datos_json_discovery,datos_json_enrichment' +
  (LOCAL ? ',datos_json' : '');   // solo en --local: es el fallback de la descripción (payload grande)

async function traerLote() {
  // PENTHOUSE entra igual que departamento (29-jul-2026). El filtro exigía exactamente
  // "departamento" y dejaba afuera 4 props reales — 3 en ZN (mediana $260.000 / 237 m²) y 1 en
  // Equipetrol ($1.040.000 / 699 m²) — que nunca llegaban al feed nuevo. Un penthouse es una
  // unidad dentro de un edificio: mismo dueño, mismo captador, mismo comprador que filtra por
  // dormitorios y precio. Su $/m² cae dentro de la banda ($1.488 el de Equipetrol), así que no
  // distorsiona medianas; y sobre 326 props, cuatro no mueven ningún indicador.
  // `ilike` (no `eq`) porque el valor viene "departamento" de C21 y "Departamento" de Remax.
  let q = sb.from('propiedades_v2').select(COLS)
    .eq('tipo_operacion', 'venta')
    .or('tipo_propiedad_original.ilike.departamento,tipo_propiedad_original.ilike.penthouse')
    .in('fuente', ['century21', 'remax']);
  if (idsArg) { const { data, error } = await q.in('id', idsArg); if (error) throw error; return data; }
  q = q.in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true)
    .not('datos_json_enrichment->>agente_telefono', 'is', null).order('id', { ascending: false }).limit(600);
  const { data, error } = await q;
  // El `--prep` es el barrido DESDE PROD (el drenado del inventario viejo de n8n). El ciclo
  // nocturno NO lo usa desde el 20-jul: captura solo NUEVAS contra el portal (shadow-relativo).
  // Si `propiedades_v2` ya no existe (archivada en el cutover), este modo no tiene sentido —
  // se dice explícito en vez de morir con un error de Postgres que no explica nada.
  if (error) {
    if (/relation .*propiedades_v2.* does not exist|schema cache/i.test(error.message || '')) {
      throw new Error(
        '`--prep` lee de `propiedades_v2` (la base vieja) y ya no está disponible.\n' +
        '   El barrido desde prod se retiró: el inventario se captura del PORTAL con `--nuevas`.\n' +
        '   Si necesitás una prop puntual del archivo, usá `--ids` contra `propiedades_v2_archivo`.'
      );
    }
    throw error;
  }
  // Excluir los ya cargados en shadow → los lotes sucesivos AVANZAN sobre deptos nuevos.
  const { data: yaEn } = await sb.from('propiedades_v2').select('id');
  // + los multiproyecto YA detectados (van a proyectos_detectados, NO a shadow ni a rechazados) —
  //   sin esto reaparecen en cada prep y consumen slots del lote. Se excluyen por url.
  const { data: yaProy } = await sb.from('proyectos_detectados').select('url').eq('macrozona', ZONA.macrozona);
  const urlsProy = new Set((yaProy || []).map((r) => r.url));
  const cargados = new Set([...(yaEn || []).map((r) => r.id), ...leerRechazados(REJ_FILE).ids]);
  const frescos = data.filter((d) => !cargados.has(d.id) && !urlsProy.has(d.url));
  // N = TOTAL agnóstico a la fuente (NO N-por-portal): si un portal tiene mucho más inventario
  // que el otro (C21 278 vs Remax 124), el cap simétrico dejaba la fuente grande atrás. Así drena parejo.
  return frescos.slice(0, N);
}

// ===========================================================================
// FASE 1 — PREP: arma el material de lectura (NO escribe a la BD)
// ===========================================================================
async function prep() {
  const lote = await traerLote();
  // Tasa paralelo ACTUAL (Binance) — una sola para TODO el lote → los lectores convierten
  // el BOB con la MISMA tasa (mata la divergencia C21-BOB). Fuente: config_global.
  const { data: tcRow } = await sb.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single();
  const tasaParalelo = tcRow?.valor != null ? Number(tcRow.valor) : null;
  console.log(`\n🔎 PREP — material de lectura para ${lote.length} deptos${idsArg ? ' (--ids)' : ` (hasta ${N} frescos, agnóstico a fuente)`}. zona=${ZONA.nombre}. tasa_paralelo=${tasaParalelo}. ${LOCAL ? 'MODO LOCAL: desde lo guardado, sin salir al portal.' : ''} NO escribe a la BD.\n`);
  const entradas = [];
  let sinTexto = 0;
  for (const p of lote) {
    if (!LOCAL && circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    if (LOCAL) {
      h = detalleDesdeBase(p);
      if (!h) { sinTexto++; console.log(`   ${p.id} ${p.fuente} ✗ sin descripción guardada → necesita fetch`); continue; }
    } else {
      try { h = await fetchDetalleDepto(p.fuente, p.url); } catch (e) { err = String(e.message); }
      if (!h) { console.log(`   ${p.id} ${p.fuente} ✗ fetch: ${err || ''}`); await pace(400); continue; }
    }

    const disc = p.datos_json_discovery || {};
    // nombre-guess (solo para traer candidatos de referencia; el lector da el canónico)
    // 3er fallback (22-ago-2026): el nombre que C21 esconde en `entity.direccionFormat`.
    // Gemelo del cargador de alquiler — los dos se tocan JUNTOS: la vez pasada
    // (`confianza_lector`, 29-jul) se agregó a uno y se olvidó el otro, y una tanda entera
    // entró sin el campo mientras el audit reportaba "superficie 4 = 0" muy convencido.
    // 🔑 Va como PISTA, no como dato: el LECTOR sigue decidiendo leyendo el aviso.
    const nombreGuess = p.nombre_edificio || (p.datos_json_enrichment?.llm_output?.nombre_edificio) || h.nombre_en_direccion || null;
    const nombreGuessFuente = p.nombre_edificio ? 'columna'
      : (p.datos_json_enrichment?.llm_output?.nombre_edificio ? 'llm'
      : (h.nombre_en_direccion ? 'direccion_portal' : null));
    let candidatos = [];
    if (nombreGuess) {
      const { data } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: nombreGuess, p_umbral_minimo: 0.3, p_limite: 5 });
      candidatos = (data || []).map((c) => ({ pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score) }));
    }

    entradas.push({
      id: p.id, fuente: p.fuente, zona: p.zona,
      // --- PARA LEER (READER_SPEC.md) ---
      slug: slugDe(p.url),
      titulo: disc.encabezado || null, subtitulo: disc.subtitulo || null,
      descripcion: h.descripcion || null,
      senales: {
        precio_candidato: h.precio_fuente_usd, precio_bob_portal: h.precio_bob_portal ?? null,
        tasa_paralelo: tasaParalelo,  // ← tasa Binance del lote; para C21-BOB-sin-precio: precio_usd = precio_bob_portal / tasa_paralelo
        tc_portal: h.tc_portal ?? null, moneda: h.moneda,
        recamaras: h.dormitorios, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        area: p.area_total_m2 != null ? Number(p.area_total_m2) : (h.area_const_m2 ?? h.area_texto ?? null),
        n8n: { precio_usd: p.precio_usd != null ? Number(p.precio_usd) : null, tc: p.tipo_cambio_detectado, dorm: p.dormitorios, pm: p.id_proyecto_master, edif: p.nombre_edificio },
      },
      nombre_guess: nombreGuess, nombre_guess_fuente: nombreGuessFuente,
      direccion_portal: h.direccion_portal ?? null,   // el crudo, para que el lector pueda contrastar
      match_candidatos: candidatos,
      // --- PARA APLICAR (no hace falta leerlo) ---
      _apply: {
        url: p.url, tipo_propiedad_original: p.tipo_propiedad_original, estado_construccion: p.estado_construccion,
        latitud: p.latitud, longitud: p.longitud, microzona: p.microzona,
        // fecha REAL del anuncio: Remax del extractor (date_of_listing); C21 no la trae en el
        // detalle → viene de la DISCOVERY (fecha_alta). Hoy fallback a prod (=discovery de n8n).
        fecha_publicacion: h.fecha_publicacion ?? (p.datos_json_discovery?.fecha_alta) ?? p.fecha_publicacion,
        score_calidad_dato: p.score_calidad_dato,
        es_multiproyecto: p.es_multiproyecto, duplicado_de: p.duplicado_de, baulera: p.baulera, solo_tc_paralelo: p.solo_tc_paralelo,
        area: p.area_total_m2 != null ? Number(p.area_total_m2) : (h.area_const_m2 ?? h.area_texto ?? null),
        moneda: h.moneda, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        agente: { nombre: h.agente_nombre, telefono: h.agente_telefono, oficina_nombre: h.oficina_nombre },
        fotos_urls: h.fotos_urls || [], cantidad_fotos: h.cantidad_fotos || 0,
        amenities: canonizar(h.amenities), parqueo_incluido: !!h.parqueo_incluido, expensas: h.expensas ?? null,
      },
      // --- EL LECTOR LLENA ESTO (schema READER_SPEC.md) ---
      veredicto: null,
    });
    console.log(`   ${p.id} ${p.fuente}  guess="${nombreGuess || '—'}"  cands:${candidatos.length}  slug:${(slugDe(p.url) || '').slice(0, 42)}`);
    if (!LOCAL) await pace(500);
  }
  // El material dice de qué ZONA es y de dónde salió el texto: el lector y el --apply pueden
  // verificar que están trabajando sobre lo que creen (lección del pisado de chunks del 28-jul).
  const file = join(OUT, conSufijo(`material-${TS}.json`, ZONA));
  writeFileSync(file, JSON.stringify({
    generado: TS, spec: 'READER_SPEC.md', zona: ZONA.id, origen: LOCAL ? 'base' : 'portal',
    m2_tipico: ZONA.m2Tipico, total: entradas.length, entradas,
  }, null, 2));
  console.log(`\n💾 ${file}`);
  if (sinTexto) console.log(`   ⚠️  ${sinTexto} sin descripción guardada (quedaron afuera; esas sí necesitan fetch)`);
  console.log(`   📊 Tráfico: ${LOCAL ? 'ninguno — no se salió al portal' : `${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy)' : ' (IP directa, $0)'}`}`);
  console.log(`   → LÉELO y llená "veredicto" en cada depto (READER_SPEC.md), después: node cargar-deptos-shadow.mjs --apply ${file}\n`);
}

// ===========================================================================
// FASE 1b — PREP NUEVAS (incremento 2): deptos del DISCOVERY que NO están en prod.
// No hay fila de prod → se baja el detalle desde la URL (no por id) y se les asigna un
// id RESERVADO en shadow (rango 8M, no choca con ids de prod). Al cutover el id lo da prod.
// ===========================================================================
async function prepNuevas(discoveryFile, n) {
  const disc = JSON.parse(readFileSync(discoveryFile, 'utf8'));
  // EXCLUIR por URL lo que YA está en shadow (y los rechazados por gate) ANTES del slice(n).
  // Sin esto, `slice(0,n)` reprocesaba SIEMPRE las mismas primeras N: re-fetch inútil y, peor, les
  // asignaba un id 8M nuevo → 2 filas para la misma url → viola el unique de `url` en el --apply.
  // Con el filtro, corridas sucesivas AVANZAN sobre el inventario nuevo (mismo criterio que traerLote).
  // + los multiproyecto YA detectados (viven en proyectos_detectados, NO en shadow): sin esto se
  //   re-fetchean los mismos brochures en cada corrida y consumen slots del lote (mismo criterio que traerLote).
  // 🔴 PAGINADO: shadow pasó las 1.000 filas y PostgREST corta ahí sin avisar. Sin esto el
  // filtro "ya está cargado" veía ~1.000 de 1.376 urls → props existentes volvían a fetchearse
  // como si fueran nuevas. Ver lib/traer-todo.mjs.
  const yaEn = await traerTodo(sb.from('propiedades_v2').select('url'));
  const { data: yaProy } = await sb.from('proyectos_detectados').select('url').eq('macrozona', ZONA.macrozona);
  const urlsShadow = new Set([...yaEn.map((r) => r.url), ...(yaProy || []).map((r) => r.url)]);
  // + los RECHAZADOS por gate, por URL (2-ago-2026). Acá estaba el agujero: la memoria de rechazos se
  // consultaba por `id` (en traerLote), pero una NUEVA todavía no tiene id de prod — se le reserva uno
  // del rango 8M distinto en cada corrida. Así, un anticrético o un alquiler mal tipeado volvía a
  // fetchearse y a leerse TODAS las noches. El 2-ago fue el 100% de la tanda de venta ZN y de alquiler ZN.
  // Caduca a los TTL_DIAS: si el captador corrige el aviso, vuelve a evaluarse solo (ver lib/rechazados.mjs).
  const rej = leerRechazados(REJ_FILE);
  const pendientes = (disc.nuevas || []).filter((nv) => !urlsShadow.has(nv.url) && !rej.urls.has(nv.url));
  const yaCargadas = (disc.nuevas || []).length - pendientes.length;
  const salteadasPorRechazo = (disc.nuevas || []).filter((nv) => !urlsShadow.has(nv.url) && rej.urls.has(nv.url)).length;
  if (salteadasPorRechazo) console.log(`   ⏭️  ${salteadasPorRechazo} salteadas por memoria de RECHAZO (ya juzgadas y rechazadas por gate; se re-evalúan a los ${TTL_DIAS}d)`);
  if (rej.vencidas) console.log(`   ♻️  ${rej.vencidas} rechazos vencidos (>${TTL_DIAS}d) vuelven a evaluarse`);
  const nuevas = pendientes.slice(0, n);
  const { data: tcRow } = await sb.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single();
  const tasaParalelo = tcRow?.valor != null ? Number(tcRow.valor) : null;
  if (yaCargadas) console.log(`   (${yaCargadas} de las ${(disc.nuevas || []).length} del discovery ya están en shadow → se saltean; quedan ${pendientes.length} pendientes)`);
  // 🔴 Los ids salen de una SECUENCIA ATÓMICA (mig 298), NO de MAX(id)+1.
  // Historia de este renglón, en dos capas:
  //   1) `8_000_000 + i` reiniciaba la numeración en cada corrida y colisionaba con las nuevas
  //      de corridas previas (17-jul: 29 colisiones, ej. 8000001 = Sky Luxury vs Sky Equinox).
  //      Se arregló arrancando desde el máximo ya usado.
  //   2) Pero leer-el-máximo-y-después-escribir NO es atómico: el 24-jul las 3 routines
  //      dispararon juntas (catch-up con la máquina apagada), venta y alquiler leyeron el mismo
  //      máximo (8000197), ambas numeraron desde 8000198 y venta pisó 2 alquileres ya escritos.
  // `nextval()` cierra las dos: dos procesos concurrentes nunca reciben el mismo id.
  // Se reserva el bloque entero acá; si un fetch falla su id queda como hueco (inofensivo).
  const poolIds = nuevas.length ? await reservarIdsShadow(sb, nuevas.length) : [];
  console.log(`\n🌱 PREP NUEVAS — ${nuevas.length} deptos del discovery (no en prod). tasa_paralelo=${tasaParalelo}. ids reservados ${poolIds.length ? `${poolIds[0]}–${poolIds[poolIds.length - 1]}` : '(ninguno)'}. NO escribe a la BD.\n`);
  const entradas = [];
  // 7-ago-2026: los avisos que NO se pueden descargar también dejan rastro. Antes
  // este `continue` era mudo → un aviso muerto (404) se re-intentaba todas las
  // noches para siempre. No se saltean desde la primera vez (puede ser un hipo del
  // portal): ver UMBRAL_FETCH_FALLIDO en lib/rechazados.mjs.
  const fallosFetch = [];
  for (const nv of nuevas) {
    if (circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    try { h = await fetchDetalleDepto(nv.fuente, nv.url); } catch (e) { err = String(e.message); }
    if (!h) {
      console.log(`   ✗ fetch ${nv.url.slice(0, 55)}: ${err || ''}`);
      fallosFetch.push({ url: nv.url, razon: RAZON_FETCH_FALLIDO });
      await pace(400); continue;
    }
    const id = poolIds.shift();                     // id ya reservado en la BD (TEMPORAL; al cutover lo da prod)
    if (id == null) { console.log('   ✗ se agotó el pool de ids reservados — corto acá.'); break; }
    const area = h.area_const_m2 ?? h.area_texto ?? null;
    entradas.push({
      id, fuente: nv.fuente, zona: nv.zona || null, slug: slugDe(nv.url),
      titulo: null, subtitulo: null, descripcion: h.descripcion || null,
      senales: {
        precio_candidato: h.precio_fuente_usd, precio_bob_portal: h.precio_bob_portal ?? null,
        tasa_paralelo: tasaParalelo, tc_portal: h.tc_portal ?? null, moneda: h.moneda,
        recamaras: h.dormitorios, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        area, n8n: null,                            // NUEVA: sin referencia n8n (no la trajo el pipeline viejo)
      },
      nombre_guess: null, match_candidatos: [],     // el lector da el nombre; el matcher lo resuelve en --apply
      _apply: {
        url: nv.url, tipo_propiedad_original: 'departamento', estado_construccion: null,
        latitud: nv.lat ?? null, longitud: nv.lon ?? null, microzona: null,
        // fecha_publicacion (DOM real): Remax date_of_listing (h) · C21 fecha_alta del listado (nv.fecha_alta, ISO).
        // fecha_discovery=hoy queda de FALLBACK (la vista usa COALESCE). El verificador NO usa estas fechas para
        // dar de baja (usa primera_ausencia_at) → corregir la fecha no lo afecta.
        fecha_publicacion: h.fecha_publicacion ?? fechaDia(nv.fecha_alta), fecha_discovery: new Date().toISOString().slice(0, 10),
        score_calidad_dato: null,
        es_multiproyecto: false, duplicado_de: null, baulera: null, solo_tc_paralelo: null,
        // C21 reescribió el slug de un aviso que ya teníamos: esta fila es la versión
        // VIGENTE y la vieja pasa a duplicada al aplicar. Viaja en `_apply` para que el
        // veredicto del lector no lo pise. Ver discovery-deptos.mjs (slug reescrito).
        ...(nv.reemplaza_a ? { reemplaza_a: nv.reemplaza_a } : {}),
        area, moneda: h.moneda, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        agente: { nombre: h.agente_nombre, telefono: h.agente_telefono, oficina_nombre: h.oficina_nombre },
        fotos_urls: h.fotos_urls || [], cantidad_fotos: h.cantidad_fotos || 0,
        amenities: canonizar(h.amenities), parqueo_incluido: !!h.parqueo_incluido, expensas: h.expensas ?? null,
      },
      veredicto: null,
    });
    console.log(`   ${id} ${nv.fuente} nueva  zona=${nv.zona}  precio_cand=${h.precio_fuente_usd}  slug:${(slugDe(nv.url) || '').slice(0, 44)}`);
    await pace(500);
  }
  if (fallosFetch.length) {
    const m = guardarRechazados(REJ_FILE, fallosFetch);
    console.log(`   📝 ${fallosFetch.length} fallo(s) de fetch registrados (${m.repetidos} ya venían de noches anteriores).`
      + ` A partir de la ${UMBRAL_FETCH_FALLIDO}ª noche seguida dejan de re-intentarse; vuelven a los ${TTL_DIAS}d.`);
  }
  // 🔴 `zona` + `m2_tipico` + sufijo de zona, IGUAL que el `--prep` de arriba (bug cazado 30-jul-2026,
  // en el estreno de `/cron-deptos-ventas-zn`). Este modo nació cuando shadow era 100% Equipetrol y
  // quedó sin la perilla: escribía `material-nuevas-<ts>.json` sin declarar de qué zona era.
  // Dos daños, los dos SILENCIOSOS:
  //   1. `partir-lectura.mjs` hace `doc.zona || 'equipetrol'` → con `zona` undefined los chunks de ZN
  //      salían llamándose `lectura-venta-<fecha>-cN.json`, exactamente el nombre que usa Equipetrol
  //      → vuelve la colisión que se arregló el 28-jul (el que escribe segundo pisa al primero).
  //   2. Sin `m2_tipico` el lector se queda SIN la banda de $/m² de su zona y juzga el TC contra la
  //      de Equipetrol ($1.700-2.200) cuando la de ZN es $1.280-1.900 → un precio correcto de ZN
  //      parece bajo y el lector puede "corregirlo" mal. Es error de DATOS, no de archivo.
  const file = join(OUT, conSufijo(`material-nuevas-${TS}.json`, ZONA));
  writeFileSync(file, JSON.stringify({
    generado: TS, spec: 'READER_SPEC.md', zona: ZONA.id, origen: 'discovery-nuevas',
    m2_tipico: ZONA.m2Tipico, total: entradas.length, entradas,
  }, null, 2));
  console.log(`\n💾 ${file}`);
  console.log(`   📊 Tráfico: ${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy)' : ' (IP directa, $0)'}`);
  console.log(`   → LÉELO y llená "veredicto" (READER_SPEC.md), después: node cargar-deptos-shadow.mjs --apply ${file}\n`);
}

// ===========================================================================
// FASE 3 — APPLY: escribe la fila correcta de una + resuelve match name-first
// ===========================================================================
function construirFila(e, v, match) {
  const a = e._apply;
  // AMENIDADES: el LECTOR manda (diferenciadores + extra + equipamiento). Fallback al
  // estructurado (canonizar) SOLO si el lector no trajo lista.
  const usaLector = Array.isArray(v.amenidades) && v.amenidades.length > 0;
  const amenLista = usaLector ? v.amenidades : (a.amenities || []);
  // canonicalizar + re-bucketear (determinístico: colapsa variantes/acentos al canónico, no depende del string del lector)
  const nb = reBucket({ amen: amenLista, amenExtra: v.amenidades_extra || [], eq: v.equipamiento_canonico || v.equipamiento_unidad || [], eqOtros: v.equipamiento_otros || [] });
  const estado_amenities = {};
  for (const k of nb.amen) estado_amenities[k] = { valor: true, fuente: usaLector ? 'lector' : 'structured', confianza: 'alta' };
  // parqueo/baulera: el TEXTO (veredicto) manda. v4 — APARTE ⟺ NO incluido; el flag estructurado del portal
  // (a.parqueo_incluido) MIENTE (contradictorio entre duplicados, true cuando el texto dice "aparte") → NO usarlo.
  const estac = v.estacionamientos_incluidos ?? a.estacionamientos ?? null;
  const parqueoIncl = v.parqueo_precio_adicional_usd != null ? false        // hay precio aparte → NO incluido
                      : estac == null ? null                                // sin señal → null (no inventar "incluido")
                      : estac > 0;
  const bauleraIncl = v.baulera_precio_adicional_usd != null ? false        // ídem baulera
                      : (v.baulera_incluida ?? a.baulera ?? null);
  return {
    id: e.id, url: a.url, fuente: e.fuente,
    tipo_operacion: 'venta', tipo_propiedad_original: a.tipo_propiedad_original || 'Departamento',
    // El LECTOR manda: null = "el aviso no declara estado". NO heredar el de prod/n8n
    // (a.estado_construccion) — el `||` perpetuaba el entrega_inmediata inventado por n8n.
    estado_construccion: v.estado_construccion ?? null,
    // tag "bob" → el crudo (precio_usd) está en BOLIVIANOS; moneda_original lo documenta y la normalización divide vivo.
    precio_usd: v.precio_usd, tipo_cambio_detectado: v.tipo_cambio_detectado,
    moneda_original: v.tipo_cambio_detectado === 'bob' ? 'BOB' : (a.moneda || null),
    // ÁREA: el VEREDICTO pisa (v4.3) — era el ÚNICO campo donde la lectura del texto se descartaba,
    // mientras baños/piso/parqueo sí la respetan. Caso real 21-jul: el portal dio 1700 m² para un depto
    // cuyo texto dice 177 (error ×10 del captador) → entró al feed y su $/m² salía absurdo. Si el aviso
    // no declara superficie, `v.area_m2` viene null y queda la del portal, como antes.
    area_total_m2: v.area_m2 ?? a.area, dormitorios: v.dormitorios,
    banos: v.banos ?? a.banos ?? (v.dormitorios != null && v.dormitorios <= 1 ? 1 : null),  // ← veredicto manda; red: ≤1 dorm sin señal → 1 (definicional); 2+ → null (honesto)
    piso: v.piso != null ? Number(v.piso)
          : (a.piso != null && /^\d+$/.test(String(a.piso)) ? Number(a.piso) : null),   // ← veredicto manda
    estacionamientos: estac,                                                    // ← veredicto manda
    // 🔑 La ZONA la manda el EDIFICIO, no el pin del aviso (27-ago-2026). El GPS sigue
    // siendo el del aviso — sólo la etiqueta de pertenencia se hereda. Si el proyecto no
    // tiene zona usable, `match.zona_pm` viene null y queda la del aviso, como antes.
    // Ver lib/zona-del-proyecto.mjs.
    latitud: a.latitud, longitud: a.longitud,
    zona: resolverZonaFila(e.zona, match?.zona_pm).zona, microzona: a.microzona,
    id_proyecto_master: match.pm, nombre_edificio: v.nombre_edificio_canonico || null,
    fecha_publicacion: a.fecha_publicacion, fecha_discovery: a.fecha_discovery ?? null, score_calidad_dato: a.score_calidad_dato,
    es_multiproyecto: v.es_multiproyecto ?? a.es_multiproyecto ?? false,        // ← taguea multiproyecto (no rechaza)
    duplicado_de: a.duplicado_de ?? null,
    baulera: bauleraIncl, solo_tc_paralelo: a.solo_tc_paralelo ?? null, parqueo_incluido: parqueoIncl,
    // 🔴 9-ago-2026 — ESTOS CUATRO SE ESCRIBÍAN **SOLO DENTRO DE `datos_json`** (ver abajo), y las
    // columnas del mismo nombre quedaban NULL. El dato no se perdía: quedaba en un lugar que NADIE
    // consulta. Medido en shadow: `parqueo_precio_adicional` 92 en el JSON / **0** en la columna ·
    // `amoblado` 150 / **1** · `baulera_incluido` 253 / **0**.
    // Las vistas de mercado, las RPC del feed, los estudios y el ACM leen COLUMNAS, no el JSON.
    // Caso que lo destapó: Edificio Jana (8000714) publicaba el garaje a $10.500 aparte; el lector
    // lo leyó bien y quedó invisible → el depto parecía $8.000 más barato que uno con parqueo
    // incluido, cuando en realidad sale $2.500 más caro.
    // 🔑 El gemelo de ALQUILER ya escribía `amoblado` como columna (línea ~352) — la asimetría entre
    // los dos cargadores es lo que hizo que el bug pasara desapercibido en venta.
    // Se AGREGAN a las columnas y se DEJAN también en `datos_json` (no se saca nada: puede haber
    // consumidores del JSON, y quitarlo sería cambiar dos cosas a la vez).
    // ⚠️ CONVERSIÓN OBLIGATORIA, no es un `?? null` como los otros: los DOS specs definen
    //    `amoblado` distinto y la columna es TEXT.
    //      · READER_SPEC (venta):    boolean — true si el texto dice AMOBLADO, null si calla.
    //      · READER_SPEC_ALQUILER:   texto   — "si" | "no" | "semi" | null.
    //    La columna guarda la escala de alquiler ('si' 212 · 'semi' 18 · 'no' 8). Sin este map,
    //    venta escribiría la cadena 'true' y quedaría fuera de cualquier filtro por amoblado.
    //    ('semi' no existe en el spec de venta → no se puede producir acá, y está bien: no se
    //     inventa un matiz que el lector no juzgó.)
    amoblado: v.amoblado === true ? 'si' : v.amoblado === false ? 'no' : null,
    parqueo_precio_adicional: v.parqueo_precio_adicional_usd ?? null,
    baulera_incluido: bauleraIncl,
    baulera_precio_adicional: v.baulera_precio_adicional_usd ?? null,
    status: 'completado', es_activa: true, es_para_matching: true, scraper_version: SCRAPER_VERSION,
    datos_json: {
      agente: a.agente,
      contenido: { fotos_urls: a.fotos_urls, descripcion: e.descripcion || '', cantidad_fotos: a.cantidad_fotos },
      // amenities: lista (diferenciadores) + estado + extra (no-canónicas) + equipamiento (canónico + otros)
      amenities: {
        lista: nb.amen, estado_amenities, extra: nb.amenExtra,
        equipamiento: nb.eq,                     // canónico filtrable (canonicalizado)
        equipamiento_otros: nb.eqOtros,          // cola larga (mostrar, no filtrar)
      },
      parqueo_incluido: parqueoIncl, parqueo_precio_adicional: v.parqueo_precio_adicional_usd ?? null,
      baulera_incluido: bauleraIncl, baulera_precio_adicional: v.baulera_precio_adicional_usd ?? null,
      fecha_entrega: v.fecha_entrega_estimada ?? null,
      amoblado: v.amoblado ?? null, equipado: v.equipado ?? null,   // ← flags de decisión
      expensas: a.expensas,
      // 🔎 CRUDO del portal (provenance para auditoría $0): lo que dijo el portal en bruto, ANTES del juicio del
      // lector → cada prop se vuelve auto-auditable sin depender de los materiales de prep (efímeros).
      senales_portal: e.senales ?? null,
      // `confianza_lector` se guarda desde el 29-jul-2026: sin esto el audit no puede distinguir
      // un match que el lector fijó seguro de uno que fijó con dudas, y los `lector_fijo` no
      // entran en ninguna de sus 3 superficies → nadie los revisa nunca. Medido en ZN: 51 matches
      // del lector por tanda, 15 con confianza media. Un juez sobre esos 15 corrigió 2 falsos
      // positivos que ya iban camino a la base. Es lo que alimenta la superficie 4 del audit.
      trazabilidad: { scraper_version: SCRAPER_VERSION, fuente_precio: 'lector', fuente_amenidades: usaLector ? 'lector' : 'structured', metodo_match: match.metodo, confianza_lector: v.confianza ?? null },
    },
  };
}

// ── GATE: basura estructural vs operación mal tipeada ─────────────────────────────────────────
// El lector rechaza DOS cosas muy distintas: (1) anexos sueltos (baulera/parqueo publicados como
// "departamento") = basura REAL que nunca es una unidad; (2) deptos reales tipeados en otra operación
// (alquiler/anticrético como venta). SOLO la (1) se materializa como DESCARTE en shadow: así su URL
// queda registrada y el discovery deja de re-proponerla al MOAT cada noche. La (2) se sigue rechazando
// (podría corregirla el captador → recapturar). razon_gate real: "baulera suelta 3 m²",
// "parqueo suelto 12,50 m²", "operación alquiler tipeada como venta…". Ver /revisar-routines.
const _RE_OTRA_OP = /\btipead|alquiler|anticr[eé]tico/i;
const _RE_ANEXO = /\b(baulera|parqueo|garaje|dep[oó]sito)\b/i;
function esBasuraEstructural(v) {
  const r = v?.razon_gate || '';
  if (_RE_OTRA_OP.test(r)) return false;                       // operación mal tipeada → NO tocar
  const area = v?.area_m2 ?? null;
  return _RE_ANEXO.test(r) || (area != null && area < 20);      // anexo suelto o superficie de anexo
}
// Fila de DESCARTE: mínima, fuera del feed POR DISEÑO (tipo baulera/parqueo → la vista la excluye;
// area<20 la excluye igual; es_activa=false + razon_inactiva documentan el descarte). NO es inventario.
function construirFilaDescarte(e, v) {
  const a = e._apply;
  const tipoAnexo = /parqueo|garaje/i.test(v?.razon_gate || '') ? 'parqueo' : 'baulera';
  return {
    id: e.id, url: a.url, fuente: e.fuente,
    tipo_operacion: 'venta', tipo_propiedad_original: tipoAnexo,
    area_total_m2: v.area_m2 ?? a.area ?? null,
    latitud: a.latitud ?? null, longitud: a.longitud ?? null, zona: e.zona ?? null, microzona: a.microzona ?? null,
    status: 'completado', es_activa: false, es_para_matching: false, id_proyecto_master: null,
    razon_inactiva: 'descarte_gate_basura_estructural', scraper_version: SCRAPER_VERSION,
    datos_json: {
      contenido: { descripcion: e.descripcion || '' },
      senales_portal: e.senales ?? null,
      trazabilidad: { scraper_version: SCRAPER_VERSION, metodo_match: 'descarte_basura_estructural', razon_gate: v.razon_gate ?? null },
    },
  };
}

async function apply(file) {
  const doc = JSON.parse(readFileSync(file, 'utf-8'));
  const conVer = doc.entradas.filter((e) => e.veredicto);
  const sinVer = doc.entradas.filter((e) => !e.veredicto);
  console.log(`\n✍️  APPLY — ${conVer.length}/${doc.entradas.length} con veredicto${sinVer.length ? ` (faltan ${sinVer.length}: ${sinVer.map((e) => e.id).join(',')})` : ''}\n`);

  const filas = [], rechazados = [], aliasSugeridos = [], reporte = [], proyectos = [], descartes = [];
  const areasAbsurdas = [], preciosSospechosos = [], zonasCorregidas = [];
  for (const e of conVer) {
    const v = e.veredicto;
    if (v.gate === 'rechazar') {
      // Basura estructural (baulera/parqueo suelto) → se escribe como DESCARTE (no vuelve al MOAT cada
      // noche; la vista la excluye). Operación mal tipeada → se sigue rechazando como antes.
      if (esBasuraEstructural(v)) { descartes.push(construirFilaDescarte(e, v)); continue; }
      // La URL es la identidad estable del aviso; el id de una NUEVA cambia en cada corrida.
      rechazados.push({ id: e.id, url: e._apply?.url ?? e.url ?? null, razon: v.razon_gate }); continue;
    }

    // MULTIPROYECTO → NO va a propiedades_v2_shadow (viola check_multiproperty_completo_v2 y el
    // feed lo excluye igual). Se guarda la CRUDA en proyectos_detectados (mig 273) para el
    // despliegue diferido de tipologías. Ver READER_SPEC §GATE + MULTIPROYECTO.
    if (v.es_multiproyecto) {
      proyectos.push({
        url: e._apply.url, fuente: e.fuente, codigo_propiedad: slugDe(e._apply.url),
        descripcion_cruda: e.descripcion || null,
        datos_json: { senales: e.senales, veredicto: v },
        // La ESCRITURA también va por la perilla. Se me pasó en la primera migración: quedó
        // 'equipetrol' fijo mientras las lecturas ya usaban ZONA.macrozona → los 2 brochures de
        // la primera tanda de ZN se registraron como Equipetrol. Daño concreto: el discovery de
        // ZN los busca por su macrozona, no los encuentra, y los reporta como "nuevas" todas las
        // noches (el bug que esta tabla existía para evitar). Corregido 28-jul-2026.
        zona: e.zona || null, macrozona: ZONA.macrozona,
        latitud: e._apply.latitud ?? null, longitud: e._apply.longitud ?? null,
        nombre_proyecto: v.nombre_edificio_canonico || null, estado: 'pendiente',
      });
      continue;
    }

    // MATCH name-first (matcher.mjs). El lector puede fijar pm a mano (id_proyecto_master).
    let match = { pm: null, metodo: 'sin_nombre', motivo: '', auto: false };
    if (v.id_proyecto_master != null) {
      match = { pm: v.id_proyecto_master, metodo: 'lector_fijo', motivo: 'pm fijado por el lector', auto: true };
    } else if (v.nombre_edificio_canonico) {
      match = await matchearPorNombre(sb, { nombre: v.nombre_edificio_canonico, zona: e.zona, lat: e._apply.latitud, lon: e._apply.longitud });
      if (!match.auto) match.pm = null; // ambiguo/débil → sin match (lo levanta el audit); no forzar
    }
    // La zona sale del EDIFICIO cuando hay match. Se resuelve acá, después del matcher,
    // porque también aplica al `lector_fijo` (pm puesto a mano, que no pasa por el matcher).
    if (match.pm != null) match.zona_pm = await zonaDelProyecto(sb, match.pm);
    const _z = resolverZonaFila(e.zona, match.zona_pm);
    if (_z.corregida) zonasCorregidas.push({ id: e.id, de: _z.desde, a: _z.zona, edif: v.nombre_edificio_canonico || `pm ${match.pm}` });

    if (v.alias_sugerido && match.pm) aliasSugeridos.push({ pm: match.pm, alias: v.alias_sugerido, edif: v.nombre_edificio_canonico, metodo: match.metodo });

    // ── GUARDRAIL DE ÁREA (29-jul-2026) ──────────────────────────────────────
    // El veredicto ya pisa la del portal cuando el texto declara superficie (v4.3). Lo que
    // faltaba es el caso en que el texto NO la declara y la del portal es absurda: la prop
    // 2262 entró con **127.800 m²** (error ×1000 del captador) y daba $1,33 el m². Ningún
    // filtro la frenaba porque `area >= 20` la deja pasar por arriba.
    // Se anula en vez de adivinar: sin área la vista la excluye (exige >= 20) y no ensucia
    // ningún corte. Corregirla es una decisión humana, no una división por 1000 automática.
    const areaEfectiva = v.area_m2 ?? e._apply.area;
    if (areaEfectiva != null && (Number(areaEfectiva) > 1000 || Number(areaEfectiva) < 10)) {
      areasAbsurdas.push({ id: e.id, area: areaEfectiva, deTexto: v.area_m2 != null });
      v.area_m2 = null; e._apply.area = null;
    }

    // ── DETECTOR DE PRECIO EN BOLIVIANOS TRUNCADO (29-jul-2026) ──────────────
    // La prop 2123 llegó con `precio_bob_portal = 504` cuando el real era 504.000: el portal
    // corta los miles. El lector lo reconstruyó leyendo el aviso, pero si no lo hubiera notado
    // entraba un depto a Bs 504 (~US$43). Un depto de 20 m² o más por menos de Bs 50.000
    // (~US$4.300) no existe en estas zonas.
    if (v.tipo_cambio_detectado === 'bob' && v.precio_usd != null && Number(v.precio_usd) < 50000
        && (areaEfectiva == null || Number(areaEfectiva) >= 20)) {
      preciosSospechosos.push({ id: e.id, bs: v.precio_usd, area: areaEfectiva });
    }

    filas.push(construirFila(e, v, match));
    reporte.push({ id: e.id, precio: v.precio_usd, tc: v.tipo_cambio_detectado, dorm: v.dormitorios, edif: v.nombre_edificio_canonico, pm: match.pm, match: match.metodo, motivo: match.motivo });
  }

  // Proteger fecha_publicacion: LEAST(existente en shadow, nueva) → nunca la pisa hacia adelante
  // (anti re-scrape y anti-bump del broker). El híbrido la canda, no confía en que nadie la toque.
  //
  // 🔒 Y RESPETAR `campos_bloqueados` (11-ago-2026, regla #1 "Manual > Automatic").
  // El upsert es por `id`: en la nocturna normal solo entran NUEVAS, así que inserta y no pisa
  // nada. Pero al RE-PROCESAR una prop existente (`--ids`, relectura, barrido) sobrescribía TODAS
  // las columnas — incluidas las que un humano había corregido y trabado. O sea: el candado
  // fallaba exactamente en el caso para el que se puso. El audit y el cron de casas ya lo
  // respetaban; los cargadores de deptos no.
  // 🔑 Solo cuenta el candado en formato OBJETO con `bloqueado === true`: un string no protege
  // (memoria `feedback_candado_formato_objeto`) y hay candados corruptos con claves numéricas.
  let protegidas = 0;
  const candadosRespetados = [];
  if (filas.length) {
    const { data: prev } = await sb.from('propiedades_v2')
      .select('id,fecha_publicacion,campos_bloqueados').in('id', filas.map((f) => f.id));
    const prevById = new Map((prev || []).map((r) => [r.id, r]));
    for (const f of filas) {
      const ex = prevById.get(f.id);
      const min = fechaMin(ex?.fecha_publicacion, f.fecha_publicacion);
      if (ex?.fecha_publicacion && min !== fechaDia(f.fecha_publicacion)) protegidas++;
      f.fecha_publicacion = min;

      const cb = ex?.campos_bloqueados;
      if (cb && typeof cb === 'object' && !Array.isArray(cb)) {
        for (const [campo, info] of Object.entries(cb)) {
          if (info && typeof info === 'object' && info.bloqueado === true && campo in f) {
            delete f[campo];   // el valor humano se queda como está
            candadosRespetados.push({ id: f.id, campo });
          }
        }
      }
    }
  }
  if (candadosRespetados.length) {
    const porCampo = candadosRespetados.reduce((a, c) => { a[c.campo] = (a[c.campo] || 0) + 1; return a; }, {});
    console.log(`   🔒 candados respetados: ${candadosRespetados.length} en ${new Set(candadosRespetados.map((c) => c.id)).size} props — ` +
      Object.entries(porCampo).map(([k, v]) => `${k}×${v}`).join(' · '));
  }
  // Upsert RESILIENTE (fila-por-fila): una fila que viole un constraint NO tira el lote entero
  // (ej. multiproyecto sin rangos → check_multiproperty_completo_v2). Se reporta, no se aborta.
  const fallidas = [];
  for (const f of filas) {
    const { error } = await sb.from('propiedades_v2').upsert(f, { onConflict: 'id' });
    if (error) fallidas.push({ id: f.id, mp: f.es_multiproyecto, motivo: (error.message.split('\n')[0] || '').slice(0, 70) });
  }
  const escritas = filas.length - fallidas.length;
  // ── SLUG REESCRITO POR C21: marcar la vieja como duplicada de la nueva ───────
  // La nueva ya está escrita arriba (es la versión vigente: precio/tipología/nombre
  // actualizados). Acá se cierra el círculo dejando la vieja fuera del feed.
  // Candado `duplicado_de IS NULL` + se salta si la fila nueva falló: nunca se
  // deduplica contra algo que no llegó a escribirse.
  const okIds = new Set(filas.filter((f) => !fallidas.some((x) => x.id === f.id)).map((f) => f.id));
  const reemplazos = conVer
    .filter((e) => e._apply?.reemplaza_a?.id && okIds.has(e.id) && e._apply.reemplaza_a.id !== e.id)
    .map((e) => ({ nueva: e.id, vieja: e._apply.reemplaza_a.id, cod: e._apply.reemplaza_a.codigo_c21 }));
  let deduplicadas = 0;
  if (reemplazos.length) {
    // 🔴 `datos_json` se MERGEA, no se pisa: un update con objeto plano reemplaza la
    // columna entera y borraría la trazabilidad del match, el TC y todo lo demás.
    const { data: previas } = await sb.from('propiedades_v2')
      .select('id, datos_json, duplicado_de').in('id', reemplazos.map((r) => r.vieja));
    const prevById = new Map((previas || []).map((p) => [p.id, p]));
    for (const r of reemplazos) {
      const prev = prevById.get(r.vieja);
      if (!prev) { console.log(`⚠️  dedup slug-reescrito: la vieja ${r.vieja} no existe en shadow, se saltea`); continue; }
      if (prev.duplicado_de != null) continue;   // ya deduplicada por otra vía
      const dj = prev.datos_json && typeof prev.datos_json === 'object' ? prev.datos_json : {};
      const traza = dj.trazabilidad && typeof dj.trazabilidad === 'object' ? dj.trazabilidad : {};
      const { error } = await sb.from('propiedades_v2')
        .update({
          duplicado_de: r.nueva,
          datos_json: { ...dj, trazabilidad: { ...traza,
            dedup_metodo: 'codigo_c21_identico_slug_reescrito',
            dedup_evidencia: `C21 reescribio el slug del aviso ${r.cod}: esta fila quedo con la URL vieja y los datos desactualizados. La version vigente es ${r.nueva}. Detectado automaticamente en el discovery.`,
            dedup_por: 'cargador_slug_reescrito',
            dedup_fecha: new Date().toISOString().slice(0, 10),
          } },
          fecha_actualizacion: new Date().toISOString(),
        })
        .eq('id', r.vieja).is('duplicado_de', null);
      if (error) console.log(`⚠️  dedup slug-reescrito ${r.vieja}→${r.nueva} NO aplicado: ${(error.message.split('\n')[0] || '').slice(0, 70)}`);
      else deduplicadas++;
    }
  }
  if (reemplazos.length) {
    console.log(`🔁 slug reescrito por C21: ${deduplicadas}/${reemplazos.length} viejas marcadas como duplicadas ${reemplazos.map((r) => `${r.vieja}→${r.nueva}`).join(', ')}`);
  }
  // Descartes (basura estructural) → upsert aparte para NO contarlos como "unidades". Resiliente.
  let descartadas = 0;
  for (const d of descartes) {
    const { error } = await sb.from('propiedades_v2').upsert(d, { onConflict: 'id' });
    if (!error) descartadas++; else console.log(`⚠️  descarte ${d.id} NO escrito: ${(error.message.split('\n')[0] || '').slice(0, 70)}`);
  }
  if (rechazados.length) {
    const m = guardarRechazados(REJ_FILE, rechazados);
    const sinUrl = rechazados.filter((r) => !r.url).length;
    console.log(`   🧠 memoria de rechazos: ${m.total} entradas (${m.urls_con_url} con URL)${m.repetidos ? ` · ${m.repetidos} ya estaban (re-lectura que el filtro debería evitar)` : ''}${sinUrl ? ` · ⚠️ ${sinUrl} sin URL (no van a filtrar)` : ''}`);
  }
  console.log(`✅ ${escritas} escritos en propiedades_v2.  Rechazados (gate): ${rechazados.length}${rechazados.length ? ' → ' + rechazados.map((r) => `${r.id}(${r.razon})`).join(', ') : ''}${descartes.length ? `  ·  Descartes basura (baulera/parqueo, fuera del feed): ${descartadas}/${descartes.length}` : ''}${protegidas ? `  ·  fecha_publicacion protegida (LEAST) en ${protegidas}` : ''}`);
  if (fallidas.length) console.log(`⚠️  ${fallidas.length} NO escritas (constraint): ${fallidas.map((f) => `${f.id}${f.mp ? '[multiproyecto]' : ''}(${f.motivo})`).join(', ')}`);
  // Multiproyectos → cola proyectos_detectados (mig 273; upsert por url+fuente → la cruda no se pierde)
  if (proyectos.length) {
    const { error } = await sb.from('proyectos_detectados').upsert(proyectos, { onConflict: 'url,fuente' });
    if (error) console.error(`❌ proyectos_detectados:`, error.message);
    else console.log(`📦 ${proyectos.length} multiproyecto(s) → proyectos_detectados (cruda guardada, feed los excluye): ${proyectos.map((p) => p.nombre_proyecto || slugDe(p.url)).join(', ')}`);
  }
  console.log('');
  for (const r of reporte) console.log(`   ${r.id}  $${r.precio} ${r.tc}  ${r.dorm}d  edif="${r.edif || '—'}" → pm ${r.pm ?? '—'} [${r.match}]${r.motivo ? '  ·  ' + r.motivo : ''}`);
  // ── ALIAS SUGERIDOS → ARCHIVO SQL (29-jul-2026) ──────────────────────────────
  // Antes SOLO se imprimían. "Registrados para el cutover" era una intención, no un hecho:
  // no había registro en ningún lado y se perdían al cerrar la terminal. Cada alias perdido
  // es trabajo que se repite — en ZN, 111 de 199 matches los tuvo que hacer el LECTOR
  // (leyendo el aviso) en vez del matcher, y cada aviso nuevo del mismo edificio con esa
  // grafía vuelve a la cola del audit y termina otra vez en el escritorio del founder.
  // Sigue sin escribirse solo: `proyectos_master` es PROD y el invariante shadow es no
  // tocarlo. Lo que cambia es que ahora queda un .sql listo para que el humano lo aplique.
  // 🔎 FILTRO (20-ago-2026): el cargador revisa sus propios alias contra el catálogo
  // ANTES de proponerlos. Medido 18/19/20-ago: de 30 propuestos en tres noches, 15 servían;
  // el resto ya estaba cargado o repetía el nombre oficial. Y uno (pm 223 ← "Edificio Ónix")
  // venía de un auto-match que este mismo cargador había marcado como riesgoso: el error de
  // la noche pidiendo quedar grabado en el catálogo, donde afecta a TODOS los avisos futuros.
  // Se muta el array para no tocar el resto del bloque. Lo descartado se DECLARA siempre.
  {
    const { aplicables, descartados } = await filtrarAliasSugeridos(sb, aliasSugeridos);
    declararDescartes(descartados);
    aliasSugeridos.length = 0;
    aliasSugeridos.push(...aplicables);
  }
  if (aliasSugeridos.length) {
    console.log(`\n🏷️  Alias sugeridos (${aliasSugeridos.length}):`);
    for (const a of aliasSugeridos) console.log(`   pm ${a.pm} (${a.edif}) ← alias "${a.alias}"`);

    // Dedup por (pm, alias): la misma grafía aparece una vez por propiedad del edificio.
    const porPm = new Map();
    for (const a of aliasSugeridos) {
      if (!porPm.has(a.pm)) porPm.set(a.pm, { edif: a.edif, alias: new Set() });
      porPm.get(a.pm).alias.add(a.alias);
    }
    const fecha = new Date().toISOString().slice(0, 10);
    const sqlFile = join(OUT, conSufijo(`alias-sugeridos-${fecha}.sql`, ZONA));
    const esc = (s) => String(s).replace(/'/g, "''");
    const sql = [
      `-- Alias sugeridos por el --apply de ${fecha} · zona: ${ZONA.nombre}`,
      `-- Los propuso el LECTOR al reconocer el edificio; sin esto, el proximo aviso con la`,
      `-- misma grafia vuelve a caer sin match y hay que leerlo de nuevo.`,
      `-- Revisar antes de aplicar: un alias equivocado ata avisos al edificio incorrecto.`,
      `-- proyectos_master es PROD (compartido con n8n y ZN): es aditivo, no cambia matches existentes.`,
      '',
      'BEGIN;',
      '',
      ...[...porPm.entries()].map(([pm, { edif, alias }]) => {
        const nuevos = [...alias];
        return [
          `-- pm ${pm} — ${edif}`,
          // UNION contra los que ya están: idempotente de verdad. Un `array_cat` con candado
          // `AND NOT (a AND b)` parece equivalente pero NO lo es — si uno de los alias ya existe
          // y el otro no, el candado deja pasar el UPDATE y duplica el que ya estaba.
          `UPDATE proyectos_master SET`,
          `  alias_conocidos = (SELECT array_agg(DISTINCT a) FROM (`,
          `      SELECT unnest(COALESCE(alias_conocidos,'{}')) AS a`,
          `      UNION SELECT unnest(ARRAY[${nuevos.map((a) => `'${esc(a)}'`).join(', ')}])`,
          `  ) t),`,
          `  updated_at = NOW()`,
          `WHERE id_proyecto_master = ${pm};`,
          '',
        ].join('\n');
      }),
      `SELECT id_proyecto_master, nombre_oficial, alias_conocidos FROM proyectos_master`,
      `WHERE id_proyecto_master IN (${[...porPm.keys()].join(', ')});`,
      '',
      'COMMIT;',
      '',
    ].join('\n');
    writeFileSync(sqlFile, sql);
    console.log(`   📄 SQL listo (${porPm.size} edificios): ${sqlFile}`);
    console.log(`      Aplicarlo evita que estos edificios vuelvan a la cola en la proxima tanda.`);
  }

  if (areasAbsurdas.length) {
    console.log(`\n📐 ÁREA ABSURDA — anulada para que no ensucie el feed (corregir a mano si importa):`);
    for (const a of areasAbsurdas) console.log(`   ${a.id}: ${a.area} m² (${a.deTexto ? 'del texto del aviso' : 'del portal'}) → guardada como NULL`);
  }
  if (preciosSospechosos.length) {
    console.log(`\n💰 PRECIO EN BOLIVIANOS SOSPECHOSAMENTE BAJO (¿miles truncados por el portal?):`);
    for (const p of preciosSospechosos) console.log(`   ${p.id}: Bs ${p.bs}${p.area ? ` / ${p.area} m²` : ''} — verificar contra el aviso`);
  }
  if (zonasCorregidas.length) {
    // Se declara SIEMPRE: el pin del portal manda al aviso a otra zona y, sin esta línea,
    // el mismo edificio termina repartido en tres zonas sin que nada falle. Que aparezca
    // seguido es lo esperado; que aparezca el MISMO edificio todas las noches significa
    // que su GPS de proyecto puede estar mal y vale mirarlo.
    console.log(`\n🗺️  ZONA HEREDADA DEL EDIFICIO (el pin del aviso decía otra cosa):`);
    for (const z of zonasCorregidas) console.log(`   ${z.id}: ${z.de} → ${z.a}   (${z.edif})`);
  }
  const sinMatch = reporte.filter((r) => r.pm == null && r.edif);
  if (sinMatch.length) console.log(`\n⚠️  Con nombre pero sin auto-match (revisar o al audit): ${sinMatch.map((r) => `${r.id}(${r.edif})`).join(', ')}`);
}

// ---------------------------------------------------------------------------
if (MODE === 'prep') await prep();
else if (MODE === 'nuevas') { if (!nuevasFile) { console.error('Falta la ruta: --nuevas <discovery-*.json> [N]'); process.exit(1); } await prepNuevas(nuevasFile, N); }
else if (MODE === 'apply') { if (!applyFile) { console.error('Falta la ruta: --apply <material.json>'); process.exit(1); } await apply(applyFile); }
else console.error('Uso: --prep [N | --ids a,b,c]   |   --nuevas <discovery-*.json> [N]   |   --apply <output/material-*.json>');
