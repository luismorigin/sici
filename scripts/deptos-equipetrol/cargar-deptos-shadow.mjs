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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const SCRAPER_VERSION = 'hibrido-shadow-v4';  // v4 = 4 cortes de ambigüedad de la validación ciega de 100 (equipado-literal / TC-palabra-sin-número / dos-precios-el-bajo / gate-renta-oferta-vs-pitch). v3 = reader extendido (amenidades/extra/equipamiento/baños/piso/estado/fecha/amoblado/multiproyecto)
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const MODE = argv.includes('--prep') ? 'prep' : argv.includes('--apply') ? 'apply' : argv.includes('--nuevas') ? 'nuevas' : null;
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
// Memoria de rechazados (gate) → no reaparecen en lotes frescos (basura: anticrético/baulera/parqueo/multiproyecto)
const REJ_FILE = join(OUT, 'rechazados.json');
const leerRechazados = () => { try { return new Set(JSON.parse(readFileSync(REJ_FILE, 'utf8'))); } catch { return new Set(); } };

const COLS = 'id,fuente,url,tipo_propiedad_original,estado_construccion,precio_usd,tipo_cambio_detectado,' +
  'moneda_original,area_total_m2,dormitorios,banos,piso,estacionamientos,latitud,longitud,zona,microzona,' +
  'id_proyecto_master,nombre_edificio,fecha_publicacion,score_calidad_dato,es_multiproyecto,duplicado_de,' +
  'baulera,solo_tc_paralelo,datos_json_discovery,datos_json_enrichment';

async function traerLote() {
  let q = sb.from('propiedades_v2').select(COLS)
    .eq('tipo_operacion', 'venta').ilike('tipo_propiedad_original', 'departamento').in('fuente', ['century21', 'remax']);
  if (idsArg) { const { data, error } = await q.in('id', idsArg); if (error) throw error; return data; }
  q = q.in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true)
    .not('datos_json_enrichment->>agente_telefono', 'is', null).order('id', { ascending: false }).limit(600);
  const { data, error } = await q; if (error) throw error;
  // Excluir los ya cargados en shadow → los lotes sucesivos AVANZAN sobre deptos nuevos.
  const { data: yaEn } = await sb.from('propiedades_v2_shadow').select('id');
  // + los multiproyecto YA detectados (van a proyectos_detectados, NO a shadow ni a rechazados) —
  //   sin esto reaparecen en cada prep y consumen slots del lote. Se excluyen por url.
  const { data: yaProy } = await sb.from('proyectos_detectados').select('url').eq('macrozona', 'equipetrol');
  const urlsProy = new Set((yaProy || []).map((r) => r.url));
  const cargados = new Set([...(yaEn || []).map((r) => r.id), ...leerRechazados()]);
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
  console.log(`\n🔎 PREP — material de lectura para ${lote.length} deptos${idsArg ? ' (--ids)' : ` (hasta ${N} frescos, agnóstico a fuente)`}. tasa_paralelo=${tasaParalelo}. NO escribe a la BD.\n`);
  const entradas = [];
  for (const p of lote) {
    if (circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    try { h = await fetchDetalleDepto(p.fuente, p.url); } catch (e) { err = String(e.message); }
    if (!h) { console.log(`   ${p.id} ${p.fuente} ✗ fetch: ${err || ''}`); await pace(400); continue; }

    const disc = p.datos_json_discovery || {};
    // nombre-guess (solo para traer candidatos de referencia; el lector da el canónico)
    const nombreGuess = p.nombre_edificio || (p.datos_json_enrichment?.llm_output?.nombre_edificio) || null;
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
      nombre_guess: nombreGuess, match_candidatos: candidatos,
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
    await pace(500);
  }
  const file = join(OUT, `material-${TS}.json`);
  writeFileSync(file, JSON.stringify({ generado: TS, spec: 'READER_SPEC.md', total: entradas.length, entradas }, null, 2));
  console.log(`\n💾 ${file}`);
  console.log(`   📊 Tráfico: ${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy)' : ' (IP directa, $0)'}`);
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
  const { data: yaEn } = await sb.from('propiedades_v2_shadow').select('url');
  const { data: yaProy } = await sb.from('proyectos_detectados').select('url').eq('macrozona', 'equipetrol');
  const urlsShadow = new Set([...(yaEn || []).map((r) => r.url), ...(yaProy || []).map((r) => r.url)]);
  const pendientes = (disc.nuevas || []).filter((nv) => !urlsShadow.has(nv.url));
  const yaCargadas = (disc.nuevas || []).length - pendientes.length;
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
  for (const nv of nuevas) {
    if (circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    try { h = await fetchDetalleDepto(nv.fuente, nv.url); } catch (e) { err = String(e.message); }
    if (!h) { console.log(`   ✗ fetch ${nv.url.slice(0, 55)}: ${err || ''}`); await pace(400); continue; }
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
  const file = join(OUT, `material-nuevas-${TS}.json`);
  writeFileSync(file, JSON.stringify({ generado: TS, spec: 'READER_SPEC.md', origen: 'discovery-nuevas', total: entradas.length, entradas }, null, 2));
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
    latitud: a.latitud, longitud: a.longitud, zona: e.zona, microzona: a.microzona,
    id_proyecto_master: match.pm, nombre_edificio: v.nombre_edificio_canonico || null,
    fecha_publicacion: a.fecha_publicacion, fecha_discovery: a.fecha_discovery ?? null, score_calidad_dato: a.score_calidad_dato,
    es_multiproyecto: v.es_multiproyecto ?? a.es_multiproyecto ?? false,        // ← taguea multiproyecto (no rechaza)
    duplicado_de: a.duplicado_de ?? null,
    baulera: bauleraIncl, solo_tc_paralelo: a.solo_tc_paralelo ?? null, parqueo_incluido: parqueoIncl,
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
      trazabilidad: { scraper_version: SCRAPER_VERSION, fuente_precio: 'lector', fuente_amenidades: usaLector ? 'lector' : 'structured', metodo_match: match.metodo },
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
  for (const e of conVer) {
    const v = e.veredicto;
    if (v.gate === 'rechazar') {
      // Basura estructural (baulera/parqueo suelto) → se escribe como DESCARTE (no vuelve al MOAT cada
      // noche; la vista la excluye). Operación mal tipeada → se sigue rechazando como antes.
      if (esBasuraEstructural(v)) { descartes.push(construirFilaDescarte(e, v)); continue; }
      rechazados.push({ id: e.id, razon: v.razon_gate }); continue;
    }

    // MULTIPROYECTO → NO va a propiedades_v2_shadow (viola check_multiproperty_completo_v2 y el
    // feed lo excluye igual). Se guarda la CRUDA en proyectos_detectados (mig 273) para el
    // despliegue diferido de tipologías. Ver READER_SPEC §GATE + MULTIPROYECTO.
    if (v.es_multiproyecto) {
      proyectos.push({
        url: e._apply.url, fuente: e.fuente, codigo_propiedad: slugDe(e._apply.url),
        descripcion_cruda: e.descripcion || null,
        datos_json: { senales: e.senales, veredicto: v },
        zona: e.zona || null, macrozona: 'equipetrol',
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
    if (v.alias_sugerido && match.pm) aliasSugeridos.push({ pm: match.pm, alias: v.alias_sugerido, edif: v.nombre_edificio_canonico });

    filas.push(construirFila(e, v, match));
    reporte.push({ id: e.id, precio: v.precio_usd, tc: v.tipo_cambio_detectado, dorm: v.dormitorios, edif: v.nombre_edificio_canonico, pm: match.pm, match: match.metodo, motivo: match.motivo });
  }

  // Proteger fecha_publicacion: LEAST(existente en shadow, nueva) → nunca la pisa hacia adelante
  // (anti re-scrape y anti-bump del broker). El híbrido la canda, no confía en que nadie la toque.
  let protegidas = 0;
  if (filas.length) {
    const { data: prev } = await sb.from('propiedades_v2_shadow').select('id,fecha_publicacion').in('id', filas.map((f) => f.id));
    const prevById = new Map((prev || []).map((r) => [r.id, r.fecha_publicacion]));
    for (const f of filas) {
      const ex = prevById.get(f.id);
      const min = fechaMin(ex, f.fecha_publicacion);
      if (ex && min !== fechaDia(f.fecha_publicacion)) protegidas++;
      f.fecha_publicacion = min;
    }
  }
  // Upsert RESILIENTE (fila-por-fila): una fila que viole un constraint NO tira el lote entero
  // (ej. multiproyecto sin rangos → check_multiproperty_completo_v2). Se reporta, no se aborta.
  const fallidas = [];
  for (const f of filas) {
    const { error } = await sb.from('propiedades_v2_shadow').upsert(f, { onConflict: 'id' });
    if (error) fallidas.push({ id: f.id, mp: f.es_multiproyecto, motivo: (error.message.split('\n')[0] || '').slice(0, 70) });
  }
  const escritas = filas.length - fallidas.length;
  // Descartes (basura estructural) → upsert aparte para NO contarlos como "unidades". Resiliente.
  let descartadas = 0;
  for (const d of descartes) {
    const { error } = await sb.from('propiedades_v2_shadow').upsert(d, { onConflict: 'id' });
    if (!error) descartadas++; else console.log(`⚠️  descarte ${d.id} NO escrito: ${(error.message.split('\n')[0] || '').slice(0, 70)}`);
  }
  if (rechazados.length) { const prev = leerRechazados(); for (const r of rechazados) prev.add(r.id); writeFileSync(REJ_FILE, JSON.stringify([...prev])); }
  console.log(`✅ ${escritas} escritos en propiedades_v2_shadow.  Rechazados (gate): ${rechazados.length}${rechazados.length ? ' → ' + rechazados.map((r) => `${r.id}(${r.razon})`).join(', ') : ''}${descartes.length ? `  ·  Descartes basura (baulera/parqueo, fuera del feed): ${descartadas}/${descartes.length}` : ''}${protegidas ? `  ·  fecha_publicacion protegida (LEAST) en ${protegidas}` : ''}`);
  if (fallidas.length) console.log(`⚠️  ${fallidas.length} NO escritas (constraint): ${fallidas.map((f) => `${f.id}${f.mp ? '[multiproyecto]' : ''}(${f.motivo})`).join(', ')}`);
  // Multiproyectos → cola proyectos_detectados (mig 273; upsert por url+fuente → la cruda no se pierde)
  if (proyectos.length) {
    const { error } = await sb.from('proyectos_detectados').upsert(proyectos, { onConflict: 'url,fuente' });
    if (error) console.error(`❌ proyectos_detectados:`, error.message);
    else console.log(`📦 ${proyectos.length} multiproyecto(s) → proyectos_detectados (cruda guardada, feed los excluye): ${proyectos.map((p) => p.nombre_proyecto || slugDe(p.url)).join(', ')}`);
  }
  console.log('');
  for (const r of reporte) console.log(`   ${r.id}  $${r.precio} ${r.tc}  ${r.dorm}d  edif="${r.edif || '—'}" → pm ${r.pm ?? '—'} [${r.match}]${r.motivo ? '  ·  ' + r.motivo : ''}`);
  if (aliasSugeridos.length) {
    console.log(`\n🏷️  Alias sugeridos (NO se escriben a prod en fase shadow — registrados para el cutover/audit):`);
    for (const a of aliasSugeridos) console.log(`   pm ${a.pm} (${a.edif}) ← alias "${a.alias}"`);
  }
  const sinMatch = reporte.filter((r) => r.pm == null && r.edif);
  if (sinMatch.length) console.log(`\n⚠️  Con nombre pero sin auto-match (revisar o al audit): ${sinMatch.map((r) => `${r.id}(${r.edif})`).join(', ')}`);
}

// ---------------------------------------------------------------------------
if (MODE === 'prep') await prep();
else if (MODE === 'nuevas') { if (!nuevasFile) { console.error('Falta la ruta: --nuevas <discovery-*.json> [N]'); process.exit(1); } await prepNuevas(nuevasFile, N); }
else if (MODE === 'apply') { if (!applyFile) { console.error('Falta la ruta: --apply <material.json>'); process.exit(1); } await apply(applyFile); }
else console.error('Uso: --prep [N | --ids a,b,c]   |   --nuevas <discovery-*.json> [N]   |   --apply <output/material-*.json>');
