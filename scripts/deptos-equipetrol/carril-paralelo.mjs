// ============================================================================
// CARRIL PARALELO — híbrido de deptos vs n8n, SIN tocar producción
// ----------------------------------------------------------------------------
// Corre el híbrido sobre deptos Equipetrol que n8n YA cargó, arma el CONTRATO
// completo (columnas + datos_json, ver CONTRATO_FEED.md) y lo compara campo por
// campo contra la versión de n8n. Escribe SOLO archivos locales en output/.
//
// 🔒 CERO ESCRITURA A LA BASE. La BD se toca solo con SELECT (leer la versión n8n).
//    Ni un INSERT/UPDATE a propiedades_v2. Producción intacta.
//
// Uso:  node carril-paralelo.mjs [N]        (N deptos por portal, default 6 = 12)
// Salida: output/carril-paralelo-<ts>.json  (n8n + híbrido + diff, por depto)
//         + tabla comparativa en consola
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';
import { fetchDetalleDepto, telNorm } from './lib/detalle-deptos.mjs';
import { cargarTC, clasificarTCporRatio } from './lib/tc.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const N = Number(process.argv[2]) || 6;
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- vocabulario canónico de amenidades (única lista, deriva `lista` de acá) ----
const CANON = [
  [/piscina|pool/i, 'Piscina'], [/gimnasio|gym/i, 'Gimnasio'], [/sauna|jacuzzi/i, 'Sauna/Jacuzzi'],
  [/churrasq|parrill|barbacoa|quincho/i, 'Churrasquera'], [/co-?work/i, 'Co-working'],
  [/seguridad|vigilancia|24 ?\/ ?7/i, 'Seguridad 24/7'], [/ascensor|elevador/i, 'Ascensor'],
  [/recepci|lobby/i, 'Recepción'], [/sal[oó]n.*event|eventos/i, 'Salón de Eventos'],
  [/[aá]rea social|social/i, 'Área Social'], [/pet ?friendly|mascota/i, 'Pet Friendly'],
  [/parque infantil|juegos/i, 'Parque Infantil'], [/terraza|balc[oó]n/i, 'Terraza/Balcón'],
  [/estacionamiento.*visita|parqueo.*visita/i, 'Estacionamiento para Visitas'],
  [/lavander|lavado/i, 'Lavandería'], [/c[aá]mara/i, 'Cámaras de seguridad'],
];
const canonizar = (arr) => {
  const set = new Set();
  for (const a of arr || []) for (const [re, key] of CANON) if (re.test(a)) set.add(key);
  return [...set];
};

// ---- arma el CONTRATO que el híbrido ESCRIBIRÍA (columnas + datos_json) ----
// NOTA: precio_usd/tc/nombre_edificio quedan en "pendiente_lector" — los decide el
// agente-lector (yo). Acá se llenan con la señal cruda del extractor para comparar.
function construirContrato(h) {
  const amenCanon = canonizar(h.amenities);
  const estado = {};
  for (const k of amenCanon) estado[k] = { valor: true, fuente: 'structured', confianza: 'alta' };
  return {
    columnas: {
      precio_usd: h.precio_fuente_usd,          // ⚠️ candidato estructurado; el LECTOR confirma
      tipo_cambio_detectado: '(pendiente_lector)',
      area_total_m2: h.area_const_m2,            // (en real viene del discovery)
      dormitorios: h.dormitorios, banos: h.banos,
      piso: h.piso, estacionamientos: h.estacionamientos,
      id_proyecto_master: '(matching_sql + lector)',
    },
    datos_json: {
      agente: { nombre: h.agente_nombre, telefono: h.agente_telefono, oficina_nombre: h.oficina_nombre },
      contenido: { fotos_urls: h.fotos_urls, descripcion: h.descripcion },
      amenities: { lista: amenCanon, estado_amenities: estado, equipamiento: [] },
      parqueo_incluido: h.parqueo_incluido, expensas: h.expensas,
    },
  };
}

// ---- traer muestra n8n (SOLO SELECT) ----
async function traerN8n() {
  const { data, error } = await sb.from('propiedades_v2')
    .select('id,fuente,url,id_proyecto_master,nombre_edificio,precio_usd,tipo_cambio_detectado,area_total_m2,dormitorios,banos,piso,estacionamientos,datos_json,datos_json_enrichment')
    .eq('tipo_operacion', 'venta').ilike('tipo_propiedad_original', 'departamento')
    .in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true)
    .in('fuente', ['century21', 'remax'])
    .not('datos_json_enrichment->>agente_telefono', 'is', null)
    .order('id', { ascending: false }).limit(600);
  if (error) throw error;
  const pick = [];
  for (const f of ['century21', 'remax']) pick.push(...data.filter((d) => d.fuente === f).slice(0, N));
  return pick;
}

// ---- versión n8n normalizada para comparar ----
const n8nDe = (r) => {
  const e = r.datos_json_enrichment || {}, dj = r.datos_json || {};
  const amen = dj.amenities?.lista || e.amenities || [];
  return {
    precio_usd: r.precio_usd != null ? Number(r.precio_usd) : null,
    tipo_cambio_detectado: r.tipo_cambio_detectado,
    area: r.area_total_m2 != null ? Number(r.area_total_m2) : null,
    dorm: r.dormitorios, banos: r.banos, piso: r.piso,
    estacionamientos: r.estacionamientos,
    tel: e.agente_telefono ?? dj.agente?.telefono ?? null,
    agente: e.agente_nombre ?? dj.agente?.nombre ?? null,
    fotos: dj.contenido?.fotos_urls?.length ?? (e.cantidad_fotos != null ? Number(e.cantidad_fotos) : null),
    amen: Array.isArray(amen) ? amen.length : 0,
    pm: r.id_proyecto_master, edif: r.nombre_edificio,
  };
};

// ---------------------------------------------------------------------------
const mark = (ok) => (ok ? '✓' : ok === null ? '·' : '✗');
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) / (b || 1) <= tol;

const muestra = await traerN8n();
const TC = await cargarTC(sb);
console.log(`\n🔒 CARRIL PARALELO — híbrido vs n8n (CERO escritura a la base)`);
console.log(`   Muestra: ${muestra.length} deptos · TC vivo: oficial ${TC.oficial} / paralelo ${TC.paralelo} (Binance)\n`);
console.log(`   ${pad('id', 6)}${pad('fuente', 9)} tel  fotos  área  dorm  piso   n8n_pm  ${'híbrido (señal cruda)'}`);
console.log('   ' + '─'.repeat(92));

const registros = [];
for (const r of muestra) {
  if (circuit.tripped) { console.log('🛑 circuit breaker — corto acá.'); break; }
  const n = n8nDe(r);
  let h = null, err = null;
  try { h = await fetchDetalleDepto(r.fuente, r.url); } catch (e) { err = String(e.message); }
  if (!h) {
    console.log(`   ${pad(r.id, 6)}${pad(r.fuente, 9)} ✗ FETCH FALLÓ ${err || ''}`);
    registros.push({ id: r.id, fuente: r.fuente, fetch_ok: false, error: err });
    await pace(400); continue;
  }
  const contrato = construirContrato(h);
  const cmp = {
    tel: telNorm(n.tel) === h.agente_telefono,
    fotos: h.cantidad_fotos >= (n.fotos || 0) ? (near(h.cantidad_fotos, n.fotos, 0.05) ? true : null) : false,
    area: near(h.area_const_m2 ?? h.area_texto, n.area, 0.05),  // detalle estructurado o fallback de texto
    dorm: h.dormitorios === n.dorm,
    piso: (h.piso ?? null) === (n.piso ?? null) ? true : (h.piso != null && n.piso == null ? null : false),
  };
  const tc_hib = r.fuente === 'remax' ? clasificarTCporRatio(h.tc_portal, TC) : '(lector)';
  registros.push({
    id: r.id, fuente: r.fuente, fetch_ok: true,
    n8n: n, hibrido_senal: { ...cmp, tc_hib, tc_portal: h.tc_portal, precio_estructurado: h.precio_fuente_usd },
    contrato_hibrido: contrato,
  });
  console.log(
    `   ${pad(r.id, 6)}${pad(r.fuente, 9)} ${mark(cmp.tel)}    ${mark(cmp.fotos)}(${pad(h.cantidad_fotos + '/' + n.fotos, 5)}) ` +
    `${mark(cmp.area)}    ${mark(cmp.dorm)}     ${pad(h.piso ?? '—', 4)}   ${pad(n.pm ?? '—', 6)}  ` +
    `tc:${tc_hib}${h.tc_portal ? '(' + h.tc_portal + ')' : ''} amen:${contrato.datos_json.amenities.lista.length}`
  );
  await pace(500);
}

// ---- veredicto + archivo ----
const ok = registros.filter((r) => r.fetch_ok);
const rate = (f) => `${ok.filter((r) => r.hibrido_senal[f] === true).length}/${ok.length}`;
console.log(`\n📊 COMPARACIÓN híbrido vs n8n (${ok.length} OK de ${muestra.length}):`);
console.log(`   contacto tel: ${rate('tel')}   ·   área: ${rate('area')}   ·   dorm: ${rate('dorm')}   ·   fotos ≥ n8n: ${ok.filter(r => r.hibrido_senal.fotos !== false).length}/${ok.length}`);
console.log(`\n   precio/TC/matching = los decide el LECTOR (yo), no el script — se comparan aparte leyendo el texto.`);

// ---- PARA EL LECTOR: lista acotada (no leo los 100, solo lo que diverge) ----
const divPrecio = ok.filter((r) => r.hibrido_senal.precio_estructurado && r.n8n.precio_usd
  && Math.abs(r.hibrido_senal.precio_estructurado - r.n8n.precio_usd) / r.n8n.precio_usd > 0.15);
const tcMismatch = ok.filter((r) => r.fuente === 'remax' && r.hibrido_senal.tc_hib !== '(lector)'
  && r.hibrido_senal.tc_hib !== r.n8n.tipo_cambio_detectado);
const sinMatchConNombre = ok.filter((r) => r.n8n.pm == null && r.n8n.edif); // candidatos a recuperar edificio
const total = new Set([...divPrecio, ...tcMismatch, ...sinMatchConNombre].map((r) => r.id)).size;
console.log(`\n📋 PARA EL LECTOR (${total} de ${ok.length} — solo estos leo, el resto el script ya lo comparó):`);
console.log(`   • precio divergente >15% (${divPrecio.length}): ${divPrecio.map((d) => d.id).join(', ') || '—'}`);
console.log(`   • TC Remax señal ≠ n8n (${tcMismatch.length}): ${tcMismatch.map((d) => `${d.id}[${d.n8n.tipo_cambio_detectado}→${d.hibrido_senal.tc_hib}]`).join(', ') || '—'}`);
console.log(`   • sin match pero con nombre_edificio (${sinMatchConNombre.length}, candidatos a recuperar): ${sinMatchConNombre.map((d) => d.id).join(', ') || '—'}`);

const file = join(OUT, `carril-paralelo-${TS}.json`);
writeFileSync(file, JSON.stringify({ generado: TS, tc_vivo: TC, nota: 'CERO escritura a la base. Solo lectura + archivos locales.', registros }, null, 2));
console.log(`\n💾 ${file}`);
console.log(`   (contiene, por depto: la versión n8n + el CONTRATO que el híbrido escribiría + el diff)\n`);
