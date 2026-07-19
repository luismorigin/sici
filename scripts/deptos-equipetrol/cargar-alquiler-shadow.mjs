// ============================================================================
// CARGADOR ALQUILER SHADOW — reader-integrado, UNA pasada (espeja cargar-deptos-shadow)
// ----------------------------------------------------------------------------
// Igual que el cargador de VENTA pero para ALQUILER. Difiere SOLO en:
//   · El modelo de PRECIO: mensual, crudo + etiqueta (READER_SPEC_ALQUILER.md).
//   · Las CONDICIONES: expensas, depósito, contrato, amoblado, mascotas, servicios.
//   · tipo_operacion = 'alquiler'. NO hay estado_construccion / plan_pagos / precio_usd.
//   · La misma tabla propiedades_v2_shadow (discriminada por tipo_operacion) + las
//     funciones/vista _alquiler_shadow (migs 274/275). Aislado de venta (regla 6).
//
// 🔴 ANTI-DOBLE-NORMALIZACIÓN: cada aviso llena SOLO la columna de su moneda con el
//    crudo REAL; la otra queda NULL. NUNCA un derivado (el pecado bob/6.96). El crudo
//    de C21 sale del DISCOVERY (precios.contrato) — el detalle ?json=true da el USD
//    derivado (bob/6.96), NO se usa para el precio. La normalización vive solo en
//    precio_normalizado_alquiler() (SQL, al leer). Ver READER_SPEC_ALQUILER §Regla madre.
//
//   node cargar-alquiler-shadow.mjs --prep [N | --ids a,b,c]   → material-alq-<ts>.json
//   (el LECTOR llena "veredicto" según READER_SPEC_ALQUILER.md)
//   node cargar-alquiler-shadow.mjs --apply output/material-alq-<ts>.json
//
// 🔒 PROD INTACTO. Solo muta propiedades_v2_shadow (service_role). A prod: SELECT + RPC read-only.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';
import { fetchDetalleDepto, num, numOrZero } from './lib/detalle-deptos.mjs';
import { matchearPorNombre } from './lib/matcher.mjs';
import { reBucket } from './lib/canonicalizar.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const SCRAPER_VERSION = 'hibrido-alquiler-v1';
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const MODE = argv.includes('--prep') ? 'prep' : argv.includes('--apply') ? 'apply' : argv.includes('--nuevas') ? 'nuevas' : null;
const idsArg = (() => { const i = argv.indexOf('--ids'); return i >= 0 ? (argv[i + 1] || '').split(',').map((x) => Number(x.trim())).filter(Boolean) : null; })();
const N = Number(argv.find((a) => /^\d+$/.test(a))) || 4;
const applyFile = MODE === 'apply' ? argv[argv.indexOf('--apply') + 1] : null;
const nuevasFile = MODE === 'nuevas' ? argv[argv.indexOf('--nuevas') + 1] : null;

// ---- amenidades canónicas (idéntico a venta; cero drift de vocabulario) ----
const CANON = [
  [/piscina|pool/i, 'Piscina'], [/gimnasio|gym/i, 'Gimnasio'], [/sauna|jacuzzi/i, 'Sauna/Jacuzzi'],
  [/churrasq|parrill|barbacoa|quincho/i, 'Churrasquera'], [/co-?work/i, 'Co-working'],
  [/sal[oó]n.*event|eventos/i, 'Salón de Eventos'], [/pet ?friendly|mascota/i, 'Pet Friendly'],
  [/parque infantil/i, 'Parque Infantil'], [/jard[ií]n/i, 'Jardín'],
  [/estacionamiento.*visita|parqueo.*visita/i, 'Estacionamiento para Visitas'],
];
const canonizar = (arr) => { const s = new Set(); for (const a of arr || []) for (const [re, k] of CANON) if (re.test(a)) s.add(k); return [...s]; };
const slugDe = (url) => (url ? String(url).replace(/^https?:\/\/[^/]+\//, '').replace(/^propiedad\//, '') : null);
const fechaDia = (v) => (v ? String(v).slice(0, 10) : null);
const fechaMin = (a, b) => { const xs = [fechaDia(a), fechaDia(b)].filter(Boolean); return xs.length ? xs.sort()[0] : null; };
const REJ_FILE = join(OUT, 'rechazados-alquiler.json');
const leerRechazados = () => { try { return new Set(JSON.parse(readFileSync(REJ_FILE, 'utf8'))); } catch { return new Set(); } };

// ---- PRECIO CRUDO de alquiler: de la fila de prod (columna de su moneda) + respaldo del discovery ----
// Anti-doble-norm: el crudo REAL vive en la columna que corresponde a moneda_original.
//   · C21 (BOB): precio_mensual_bob es el crudo Bs (precio_mensual_usd = bob/6.96 = DERIVADO, se ignora).
//   · Remax (USD): precio_mensual_usd es el crudo USD (precio_mensual_bob = usd×6.96 = DERIVADO, se ignora).
// Respaldo estructurado del discovery: C21 precios.contrato {moneda, precio}; Remax price {amount, currency_id}.
function precioCrudoAlquiler(p) {
  const disc = p.datos_json_discovery || {};
  let contrato = null;
  if (p.fuente === 'century21') {
    const c = disc.precios?.contrato;
    if (c && num(c.precio)) contrato = { precio: num(c.precio), moneda: (c.moneda || '').toUpperCase() || null };
  } else if (p.fuente === 'remax') {
    const pr = disc.price;
    if (pr && (num(pr.amount) || num(pr.price_in_dollars))) {
      contrato = { precio: num(pr.amount) ?? num(pr.price_in_dollars), moneda: pr.currency_id === 1 ? 'BOB' : pr.currency_id === 2 ? 'USD' : null };
    }
  }
  // fuente de verdad = columna de la moneda de prod; respaldo = contrato del discovery
  const moneda = (p.moneda_original || contrato?.moneda || '').toUpperCase() || null;
  let crudo = null;
  if (moneda === 'BOB') crudo = num(p.precio_mensual_bob) ?? contrato?.precio ?? null;
  else if (moneda === 'USD') crudo = num(p.precio_mensual_usd) ?? contrato?.precio ?? null;
  else { crudo = num(p.precio_mensual_bob) ?? num(p.precio_mensual_usd) ?? contrato?.precio ?? null; }
  return { precio_crudo: crudo, moneda_original: moneda, contrato };
}

const COLS = 'id,fuente,url,tipo_propiedad_original,precio_mensual_bob,precio_mensual_usd,moneda_original,' +
  'monto_expensas_bob,deposito_meses,contrato_minimo_meses,amoblado,acepta_mascotas,servicios_incluidos,' +
  'area_total_m2,dormitorios,banos,piso,estacionamientos,baulera,latitud,longitud,zona,microzona,' +
  'id_proyecto_master,nombre_edificio,fecha_publicacion,score_calidad_dato,es_multiproyecto,duplicado_de,' +
  'datos_json_discovery,datos_json_enrichment';

async function traerLote() {
  let q = sb.from('propiedades_v2').select(COLS)
    .eq('tipo_operacion', 'alquiler').ilike('tipo_propiedad_original', 'departamento').in('fuente', ['century21', 'remax']);
  if (idsArg) { const { data, error } = await q.in('id', idsArg); if (error) throw error; return data; }
  q = q.in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true)
    .order('id', { ascending: false }).limit(600);
  const { data, error } = await q; if (error) throw error;
  const { data: yaEn } = await sb.from('propiedades_v2_shadow').select('id').eq('tipo_operacion', 'alquiler');
  const cargados = new Set([...(yaEn || []).map((r) => r.id), ...leerRechazados()]);
  const frescos = data.filter((d) => !cargados.has(d.id));
  return frescos.slice(0, N);
}

// ===========================================================================
// FASE 1 — PREP: material de lectura (NO escribe a la BD)
// ===========================================================================
async function prep() {
  const lote = await traerLote();
  const { data: tcRow } = await sb.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single();
  const tasaParalelo = tcRow?.valor != null ? Number(tcRow.valor) : null;
  console.log(`\n🔎 PREP ALQUILER — material para ${lote.length} deptos${idsArg ? ' (--ids)' : ` (hasta ${N} frescos)`}. tasa_paralelo=${tasaParalelo}. NO escribe a la BD.\n`);
  const entradas = [];
  for (const p of lote) {
    if (circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    try { h = await fetchDetalleDepto(p.fuente, p.url); } catch (e) { err = String(e.message); }
    if (!h) { console.log(`   ${p.id} ${p.fuente} ✗ fetch: ${err || ''}`); await pace(400); continue; }

    const disc = p.datos_json_discovery || {};
    const precio = precioCrudoAlquiler(p);
    const nombreGuess = p.nombre_edificio || (p.datos_json_enrichment?.llm_output?.nombre_edificio) || null;
    let candidatos = [];
    if (nombreGuess) {
      const { data } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: nombreGuess, p_umbral_minimo: 0.3, p_limite: 5 });
      candidatos = (data || []).map((c) => ({ pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score) }));
    }

    entradas.push({
      id: p.id, fuente: p.fuente, zona: p.zona,
      // --- PARA LEER (READER_SPEC_ALQUILER.md) ---
      slug: slugDe(p.url),
      titulo: disc.encabezado || null, subtitulo: disc.subtitulo || null,
      descripcion: h.descripcion || null,
      senales: {
        // PRECIO MENSUAL crudo (de la columna de su moneda; NUNCA el e.precio del detalle C21 = derivado)
        precio_mensual_crudo: precio.precio_crudo, moneda_original: precio.moneda_original,
        precio_contrato_discovery: precio.contrato,   // respaldo estructurado {moneda, precio}
        tasa_paralelo: tasaParalelo,                  // referencia (la conversión la hace el SQL al leer)
        // condiciones estructuradas (el TEXTO manda; esto es base)
        expensas: h.expensas ?? null, expensas_incluidas: h.expensas_incluidas ?? null,
        mascotas_portal: disc.mascotas ?? null,
        recamaras: h.dormitorios, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        area: p.area_total_m2 != null ? Number(p.area_total_m2) : (h.area_const_m2 ?? h.area_texto ?? null),
        n8n: { precio_mensual_bob: num(p.precio_mensual_bob), precio_mensual_usd: num(p.precio_mensual_usd), moneda: p.moneda_original, amoblado: p.amoblado, dorm: p.dormitorios, pm: p.id_proyecto_master, edif: p.nombre_edificio },
      },
      nombre_guess: nombreGuess, match_candidatos: candidatos,
      // --- PARA APLICAR ---
      _apply: {
        url: p.url, tipo_propiedad_original: p.tipo_propiedad_original,
        latitud: p.latitud, longitud: p.longitud, microzona: p.microzona,
        fecha_publicacion: h.fecha_publicacion ?? (p.datos_json_discovery?.fecha_alta) ?? p.fecha_publicacion,
        score_calidad_dato: p.score_calidad_dato,
        es_multiproyecto: p.es_multiproyecto, duplicado_de: p.duplicado_de, baulera: p.baulera,
        area: p.area_total_m2 != null ? Number(p.area_total_m2) : (h.area_const_m2 ?? h.area_texto ?? null),
        banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        agente: { nombre: h.agente_nombre, telefono: h.agente_telefono, oficina_nombre: h.oficina_nombre },
        fotos_urls: h.fotos_urls || [], cantidad_fotos: h.cantidad_fotos || 0,
        amenities: canonizar(h.amenities), parqueo_incluido: !!h.parqueo_incluido,
        expensas: h.expensas ?? null,
        mascotas_portal: typeof disc.mascotas === 'boolean' ? disc.mascotas : null,  // v2: checkbox portal (fallback de acepta_mascotas)
      },
      // --- EL LECTOR LLENA ESTO (schema READER_SPEC_ALQUILER.md) ---
      veredicto: null,
    });
    console.log(`   ${p.id} ${p.fuente}  crudo=${precio.precio_crudo} ${precio.moneda_original || '?'}  guess="${nombreGuess || '—'}"  cands:${candidatos.length}  slug:${(slugDe(p.url) || '').slice(0, 40)}`);
    await pace(500);
  }
  const file = join(OUT, `material-alq-${TS}.json`);
  writeFileSync(file, JSON.stringify({ generado: TS, spec: 'READER_SPEC_ALQUILER.md', total: entradas.length, entradas }, null, 2));
  console.log(`\n💾 ${file}`);
  console.log(`   → LÉELO y llená "veredicto" (READER_SPEC_ALQUILER.md), después: node cargar-alquiler-shadow.mjs --apply ${file}\n`);
}

// ===========================================================================
// FASE 1b — PREP NUEVAS: deptos del DISCOVERY que NO están en prod (id reservado shadow 8M).
// No hay fila de prod → detalle desde la URL (no por id). Crudo de precio = del LISTADO del
// discovery (precio_raw + moneda), NO del detalle (C21 detalle da el USD derivado = crudo-falso).
// ===========================================================================
async function prepNuevas(discoveryFile, n) {
  const disc = JSON.parse(readFileSync(discoveryFile, 'utf8'));
  // EXCLUIR por URL lo ya cargado (shadow + multiproyectos detectados) ANTES del slice, e id 8M
  // ARRANCANDO DESDE EL MÁXIMO ya en shadow — mismo fix que venta (cargar-deptos-shadow.mjs, 17-jul).
  // Con `slice(0,n)` + `8_000_000+i` cada corrida reprocesaba las mismas y reiniciaba los ids →
  // colisión que PISA props reales en el upsert (el rango 8M lo comparten venta y alquiler).
  const { data: yaEn } = await sb.from('propiedades_v2_shadow').select('url');
  const { data: yaProy } = await sb.from('proyectos_detectados').select('url').eq('macrozona', 'equipetrol');
  const urlsShadow = new Set([...(yaEn || []).map((r) => r.url), ...(yaProy || []).map((r) => r.url)]);
  const pendientes = (disc.nuevas || []).filter((nv) => !urlsShadow.has(nv.url));
  const yaCargadas = (disc.nuevas || []).length - pendientes.length;
  const nuevas = pendientes.slice(0, n);
  const { data: tcRow } = await sb.from('config_global').select('valor').eq('clave', 'tipo_cambio_paralelo').single();
  const tasaParalelo = tcRow?.valor != null ? Number(tcRow.valor) : null;
  const { data: maxRow } = await sb.from('propiedades_v2_shadow').select('id').gte('id', 8_000_000)
    .order('id', { ascending: false }).limit(1);
  let idSeq = Math.max(8_000_000, maxRow?.[0]?.id ?? 8_000_000);
  if (yaCargadas) console.log(`   (${yaCargadas} de las ${(disc.nuevas || []).length} del discovery ya están en shadow → se saltean; quedan ${pendientes.length} pendientes)`);
  console.log(`\n🌱 PREP NUEVAS ALQUILER — ${nuevas.length} deptos del discovery (no en prod). tasa_paralelo=${tasaParalelo}. ids reservados desde ${idSeq + 1}. NO escribe a la BD.\n`);
  const entradas = [];
  for (const nv of nuevas) {
    if (circuit.tripped) { console.log('🛑 circuit breaker.'); break; }
    let h = null, err = null;
    try { h = await fetchDetalleDepto(nv.fuente, nv.url); } catch (e) { err = String(e.message); }
    if (!h) { console.log(`   ✗ fetch ${nv.url.slice(0, 55)}: ${err || ''}`); await pace(400); continue; }
    const id = ++idSeq;                                     // id reservado shadow (TEMPORAL; al cutover lo da prod)
    const area = h.area_const_m2 ?? h.area_texto ?? null;
    const moneda = (nv.moneda || '').toUpperCase() || null; // crudo del LISTADO (no del detalle)
    const crudo = num(nv.precio_raw);
    entradas.push({
      id, fuente: nv.fuente, zona: nv.zona || null, slug: slugDe(nv.url),
      titulo: null, subtitulo: null, descripcion: h.descripcion || null,
      senales: {
        precio_mensual_crudo: crudo, moneda_original: moneda,
        precio_contrato_discovery: crudo != null ? { precio: crudo, moneda } : null,
        tasa_paralelo: tasaParalelo,
        expensas: h.expensas ?? null, expensas_incluidas: h.expensas_incluidas ?? null,
        mascotas_portal: null,
        recamaras: h.dormitorios, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        area, n8n: null,                                    // NUEVA: sin referencia n8n (no la trajo el pipeline viejo)
      },
      nombre_guess: null, match_candidatos: [],             // el lector da el nombre; el matcher lo resuelve en --apply
      _apply: {
        url: nv.url, tipo_propiedad_original: 'departamento',
        latitud: nv.lat ?? null, longitud: nv.lon ?? null, microzona: null,
        fecha_publicacion: h.fecha_publicacion ?? fechaDia(nv.fecha_alta),
        score_calidad_dato: null,
        es_multiproyecto: false, duplicado_de: null, baulera: null,
        area, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos,
        agente: { nombre: h.agente_nombre, telefono: h.agente_telefono, oficina_nombre: h.oficina_nombre },
        fotos_urls: h.fotos_urls || [], cantidad_fotos: h.cantidad_fotos || 0,
        amenities: canonizar(h.amenities), parqueo_incluido: !!h.parqueo_incluido,
        expensas: h.expensas ?? null,
        mascotas_portal: null,
      },
      veredicto: null,
    });
    console.log(`   ${id} ${nv.fuente} nueva  crudo=${crudo} ${moneda || '?'}  slug:${(slugDe(nv.url) || '').slice(0, 44)}`);
    await pace(500);
  }
  const file = join(OUT, `material-alq-nuevas-${TS}.json`);
  writeFileSync(file, JSON.stringify({ generado: TS, spec: 'READER_SPEC_ALQUILER.md', origen: 'discovery-nuevas', total: entradas.length, entradas }, null, 2));
  console.log(`\n💾 ${file}\n   → LÉELO y llená "veredicto" (READER_SPEC_ALQUILER.md), después: node cargar-alquiler-shadow.mjs --apply ${file}\n`);
}

// ===========================================================================
// FASE 3 — APPLY: fila correcta + match name-first
// ===========================================================================
function construirFila(e, v, match) {
  const a = e._apply;
  const usaLector = Array.isArray(v.amenidades) && v.amenidades.length > 0;
  const amenLista = usaLector ? v.amenidades : (a.amenities || []);
  // canonicalizar + re-bucketear (determinístico: colapsa variantes/acentos al canónico, no depende del string del lector)
  const nb = reBucket({ amen: amenLista, amenExtra: v.amenidades_extra || [], eq: v.equipamiento_canonico || [], eqOtros: v.equipamiento_otros || [] });
  const estado_amenities = {};
  for (const k of nb.amen) estado_amenities[k] = { valor: true, fuente: usaLector ? 'lector' : 'structured', confianza: 'alta' };
  const estac = v.estacionamientos_incluidos ?? a.estacionamientos ?? null;
  const parqueoIncl = v.parqueo_precio_adicional_bob != null ? false : estac == null ? null : estac > 0;
  const bauleraIncl = v.baulera_precio_adicional_bob != null ? false : (v.baulera_incluida ?? a.baulera ?? null);

  // 🔴 ANTI-DOBLE-NORMALIZACIÓN — keyed en el tag (igual que la función SQL):
  //   tag 'bob' → crudo en BOLIVIANOS → precio_mensual_bob; usd = NULL.
  //   resto (no_especificado/paralelo/oficial_viejo) → crudo en USD → precio_mensual_usd; bob = NULL.
  // NUNCA rellenar la otra columna con un derivado.
  const esBob = v.tipo_cambio_detectado === 'bob';
  const crudo = v.precio_mensual != null ? Number(v.precio_mensual) : null;

  return {
    id: e.id, url: a.url, fuente: e.fuente,
    tipo_operacion: 'alquiler', tipo_propiedad_original: a.tipo_propiedad_original || 'Departamento',
    precio_mensual_bob: esBob ? crudo : null,
    precio_mensual_usd: esBob ? null : crudo,
    moneda_original: esBob ? 'BOB' : 'USD',
    tipo_cambio_detectado: v.tipo_cambio_detectado,
    monto_expensas_bob: v.expensas_bob ?? null,
    deposito_meses: v.deposito_meses ?? null,
    contrato_minimo_meses: v.contrato_minimo_meses ?? null,
    amoblado: v.amoblado ?? null,                 // v3.1: null cuando el texto calla (no default "no"); alineado con venta + equipado/mascotas
    // v2: el veredicto manda; fallback al checkbox del portal (mascotas_portal) si el lector no trajo señal
    acepta_mascotas: v.acepta_mascotas ?? (typeof a.mascotas_portal === 'boolean' ? a.mascotas_portal : null),
    servicios_incluidos: Array.isArray(v.servicios_incluidos) ? v.servicios_incluidos : [],
    area_total_m2: a.area, dormitorios: v.dormitorios,
    banos: v.banos ?? a.banos ?? (v.dormitorios != null && v.dormitorios <= 1 ? 1 : null),  // red: ≤1 dorm sin señal → 1 (definicional); 2+ → null (honesto)
    piso: v.piso != null ? Number(v.piso) : (a.piso != null && /^\d+$/.test(String(a.piso)) ? Number(a.piso) : null),
    estacionamientos: estac,
    baulera: bauleraIncl,
    latitud: a.latitud, longitud: a.longitud, zona: e.zona, microzona: a.microzona,
    id_proyecto_master: match.pm, nombre_edificio: v.nombre_edificio_canonico || null,
    fecha_publicacion: a.fecha_publicacion, score_calidad_dato: a.score_calidad_dato,
    es_multiproyecto: v.es_multiproyecto ?? a.es_multiproyecto ?? false,
    duplicado_de: a.duplicado_de ?? null,
    parqueo_incluido: parqueoIncl,
    status: 'completado', es_activa: true, es_para_matching: true, scraper_version: SCRAPER_VERSION,
    datos_json: {
      agente: a.agente,
      contenido: { fotos_urls: a.fotos_urls, descripcion: e.descripcion || '', cantidad_fotos: a.cantidad_fotos },
      amenities: {
        lista: nb.amen, estado_amenities, extra: nb.amenExtra,
        equipamiento: nb.eq, equipamiento_otros: nb.eqOtros,
      },
      parqueo_incluido: parqueoIncl, parqueo_precio_adicional: v.parqueo_precio_adicional_bob ?? null,
      baulera_incluido: bauleraIncl, baulera_precio_adicional: v.baulera_precio_adicional_bob ?? null,
      expensas_incluidas: v.expensas_incluidas ?? null,
      equipado: v.equipado ?? null,                          // v2: flag electrodomésticos (separado de amoblado)
      uso_inmueble: v.uso_inmueble ?? 'residencial',         // v2: residencial | mixto (filtro, no exclusión)
      // 🔎 CRUDO del portal (provenance para auditoría $0): lo que dijo el portal en bruto, ANTES del juicio del
      // lector. Guardar el checkbox/estructurado al lado del texto → cada prop se vuelve auto-auditable sin depender
      // de los materiales de prep (efímeros). Ej: comparar acepta_mascotas vs senales_portal.mascotas_portal.
      senales_portal: e.senales ?? null,
      trazabilidad: { scraper_version: SCRAPER_VERSION, fuente_precio: 'lector', fuente_amenidades: usaLector ? 'lector' : 'structured', metodo_match: match.metodo },
    },
  };
}

async function apply(file) {
  const doc = JSON.parse(readFileSync(file, 'utf-8'));
  const conVer = doc.entradas.filter((e) => e.veredicto);
  const sinVer = doc.entradas.filter((e) => !e.veredicto);
  console.log(`\n✍️  APPLY ALQUILER — ${conVer.length}/${doc.entradas.length} con veredicto${sinVer.length ? ` (faltan ${sinVer.length}: ${sinVer.map((e) => e.id).join(',')})` : ''}\n`);

  const filas = [], rechazados = [], aliasSugeridos = [], reporte = [];
  for (const e of conVer) {
    const v = e.veredicto;
    if (v.gate === 'rechazar') { rechazados.push({ id: e.id, razon: v.razon_gate }); continue; }

    let match = { pm: null, metodo: 'sin_nombre', motivo: '', auto: false };
    if (v.id_proyecto_master != null) {
      match = { pm: v.id_proyecto_master, metodo: 'lector_fijo', motivo: 'pm fijado por el lector', auto: true };
    } else if (v.nombre_edificio_canonico) {
      match = await matchearPorNombre(sb, { nombre: v.nombre_edificio_canonico, zona: e.zona, lat: e._apply.latitud, lon: e._apply.longitud });
      if (!match.auto) match.pm = null;
    }
    if (v.alias_sugerido && match.pm) aliasSugeridos.push({ pm: match.pm, alias: v.alias_sugerido, edif: v.nombre_edificio_canonico });

    filas.push(construirFila(e, v, match));
    reporte.push({ id: e.id, crudo: v.precio_mensual, moneda: v.tipo_cambio_detectado === 'bob' ? 'BOB' : 'USD', tc: v.tipo_cambio_detectado, dorm: v.dormitorios, edif: v.nombre_edificio_canonico, pm: match.pm, match: match.metodo, motivo: match.motivo });
  }

  // Proteger fecha_publicacion (LEAST) — nunca hacia adelante
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
  const fallidas = [];
  for (const f of filas) {
    const { error } = await sb.from('propiedades_v2_shadow').upsert(f, { onConflict: 'id' });
    if (error) fallidas.push({ id: f.id, motivo: (error.message.split('\n')[0] || '').slice(0, 80) });
  }
  const escritas = filas.length - fallidas.length;
  if (rechazados.length) { const prev = leerRechazados(); for (const r of rechazados) prev.add(r.id); writeFileSync(REJ_FILE, JSON.stringify([...prev])); }
  console.log(`✅ ${escritas} escritos en propiedades_v2_shadow (alquiler).  Rechazados (gate): ${rechazados.length}${rechazados.length ? ' → ' + rechazados.map((r) => `${r.id}(${r.razon})`).join(', ') : ''}${protegidas ? `  ·  fecha protegida (LEAST) en ${protegidas}` : ''}`);
  if (fallidas.length) console.log(`⚠️  ${fallidas.length} NO escritas (constraint): ${fallidas.map((f) => `${f.id}(${f.motivo})`).join(', ')}`);
  console.log('');
  for (const r of reporte) console.log(`   ${r.id}  ${r.crudo} ${r.moneda} [${r.tc}]  ${r.dorm}d  edif="${r.edif || '—'}" → pm ${r.pm ?? '—'} [${r.match}]${r.motivo ? '  ·  ' + r.motivo : ''}`);
  if (aliasSugeridos.length) {
    console.log(`\n🏷️  Alias sugeridos (NO se escriben a prod en fase shadow):`);
    for (const a of aliasSugeridos) console.log(`   pm ${a.pm} (${a.edif}) ← alias "${a.alias}"`);
  }
  const sinMatch = reporte.filter((r) => r.pm == null && r.edif);
  if (sinMatch.length) console.log(`\n⚠️  Con nombre pero sin auto-match: ${sinMatch.map((r) => `${r.id}(${r.edif})`).join(', ')}`);
}

// ---------------------------------------------------------------------------
if (MODE === 'prep') await prep();
else if (MODE === 'nuevas') { if (!nuevasFile) { console.error('Falta la ruta: --nuevas <discovery-alquiler-*.json> [N]'); process.exit(1); } await prepNuevas(nuevasFile, N); }
else if (MODE === 'apply') { if (!applyFile) { console.error('Falta la ruta: --apply <material-alq-*.json>'); process.exit(1); } await apply(applyFile); }
else console.error('Uso: --prep [N | --ids a,b,c]   |   --nuevas <discovery-alquiler-*.json> [N]   |   --apply <output/material-alq-*.json>');
