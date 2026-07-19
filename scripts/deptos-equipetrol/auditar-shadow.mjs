// ============================================================================
// AUDITORÍA SHADOW — re-lectura por DRIFT del feed híbrido (venta + alquiler)
// ----------------------------------------------------------------------------
// $0, READ-ONLY (no muta nada). Cierra el punto ciego que el híbrido NO tiene y
// n8n cubría por fuerza bruta (re-enrichment nocturno): el anunciante deja la MISMA
// url y el MISMO precio de cabecera, y edita SOLO la descripción (baja el precio en
// el texto, pone "REBAJA", cambia disponible→reservado, cambia condiciones). El
// discovery nocturno no ve nada → el veredicto del reader queda congelado y viejo.
//
// El DRIFT es el disparador de re-lectura (diseño AUDITORIAS_POST_CUTOVER.md §Gap):
//   fetch barato de la desc  →  comparar con la guardada
//      ├─ igual          → nada (cuenta, no molesta)
//      └─ cambió / hay señal contradictoria → al MATERIAL → lo re-juzga un
//         subagente-lector (READER_SPEC) → discrepancias + SQL sugerido (shadow).
//
// Por qué NO reusa /audit-feed-ventas-mensual-fetch tal cual (mismo doc, 2 rupturas):
//   1) COLUMNA DESC: la mensual lee `datos_json_enrichment->>descripcion` (lo poblaba
//      n8n). El híbrido escribe a `datos_json.contenido.descripcion` → la mensual leería
//      NULL y "todo pasa" sin revisar nada. Acá leemos la columna correcta.
//   2) EJE TC: la mensual tiene TC_PARALELO=9.954 / RATIO=1.43 hardcodeados + tags viejos.
//      El régimen shadow usa `oficial_viejo`/`bob`. Acá el .mjs NO clasifica TC: emite el
//      crudo del portal y el juez re-clasifica con READER_SPEC (que sí conoce el régimen).
//
// Baseline de comparación = la fila SE AUTO-AUDITA: `datos_json.senales_portal` (crudo del
// portal AL CARGAR) + `datos_json.contenido.descripcion` (desc AL CARGAR). No depende de
// los materiales de prep (efímeros).
//
// Uso:
//   node auditar-shadow.mjs --op venta            # todo el shadow de venta
//   node auditar-shadow.mjs --op alquiler --limit 40
//   node auditar-shadow.mjs --op venta --ids 3519,3540
// Salida: output/audit-shadow-<op>-<ts>.json (material para el juez) + summary impreso.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';
import { fetchDetalleDepto } from './lib/detalle-deptos.mjs';
import { compararDescripciones } from '../auditoria-feed-ventas/lib/similarity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const TS = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ---- args ----
const argv = process.argv.slice(2);
const opArg = (() => { const i = argv.indexOf('--op'); return i >= 0 ? argv[i + 1] : 'venta'; })();
const OP = opArg === 'alquiler' ? 'alquiler' : 'venta';
const LIMIT = (() => { const i = argv.indexOf('--limit'); return i >= 0 ? Number(argv[i + 1]) : null; })();
const idsArg = (() => { const i = argv.indexOf('--ids'); return i >= 0 ? (argv[i + 1] || '').split(',').map((x) => Number(x.trim())).filter(Boolean) : null; })();

// ---- umbral de cambio de precio (mismo criterio que la mensual): piso 1% para descartar
// redondeo/parseo; ≥10% alta, 3–10% media, 1–3% baja. Nada real ≥1% se esconde. ----
const gradoPrecio = (pct) => (pct >= 10 ? 'alta' : pct >= 3 ? 'media' : pct >= 1 ? 'baja' : null);

// ---- matching-lite: ¿el nombre del edificio (shadow) aún aparece en el anuncio de hoy? ----
const GENERICOS = /^(condominio|edificio|torre|residencia|residence|residencial|suites?|studios?|apartments?|tower|departamento|depto)$/i;
const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
function nombreApareceEnAnuncio(nombre, textos) {
  if (!nombre) return null; // sin nombre → no aplica
  const heno = norm(textos.filter(Boolean).join(' · '));
  const toks = norm(nombre).split(' ').filter((w) => w.length >= 3 && !GENERICOS.test(w));
  if (!toks.length) return null; // solo genéricos → no discrimina, no flagear
  // aparece si TODOS los tokens distintivos están (edificio de 1 token: ese token)
  return toks.every((t) => heno.includes(t));
}

// ---- fila shadow → baseline + decisión del reader (según operación) ----
const COLS_VENTA = 'id,fuente,url,precio_usd,tipo_cambio_detectado,moneda_original,dormitorios,banos,piso,nombre_edificio,id_proyecto_master,estado_construccion,es_activa,status,datos_json';
// `equipado` NO es columna de shadow (vive en datos_json.equipado) → se lee del JSON en el snapshot.
const COLS_ALQ = 'id,fuente,url,precio_mensual_bob,precio_mensual_usd,moneda_original,amoblado,acepta_mascotas,dormitorios,banos,nombre_edificio,id_proyecto_master,es_activa,status,datos_json';

async function traerFilas() {
  let q = sb.from('propiedades_v2_shadow').select(OP === 'venta' ? COLS_VENTA : COLS_ALQ).eq('tipo_operacion', OP);
  if (idsArg) q = q.in('id', idsArg);
  q = q.order('id', { ascending: true });
  if (LIMIT && !idsArg) q = q.limit(LIMIT);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// Precio "comparable" del portal (crudo, en la moneda de la fila) — para detectar CAMBIO, no valor.
// venta: USD → precio_fuente_usd · BOB → precio_bob_portal
// alquiler: USD → precio_fuente_usd · BOB → precio_bob_portal (el fetcher da ambos candidatos)
const comparablePortal = (h, moneda) => (moneda === 'BOB' ? (h.precio_bob_portal ?? null) : (h.precio_fuente_usd ?? null));
// Baseline: lo que dijo el portal AL CARGAR (senales_portal). Nombres distintos venta/alq.
function comparableBaseline(sp, moneda) {
  if (!sp) return null;
  if (OP === 'venta') return moneda === 'BOB' ? (sp.precio_bob_portal ?? null) : (sp.precio_candidato ?? null);
  // alquiler: senales_portal.precio_mensual_crudo está en su moneda_original
  return sp.precio_mensual_crudo ?? null;
}

async function main() {
  const filas = await traerFilas();
  console.log(`\n🔎 AUDIT SHADOW (${OP}) — ${filas.length} filas${idsArg ? ' (--ids)' : LIMIT ? ` (limit ${LIMIT})` : ''}. READ-ONLY, $0.\n`);
  if (!filas.length) { console.log('   (shadow vacío para esta operación — nada que auditar)\n'); return; }

  const material = [];          // los que van al JUEZ (drift / precio / matching / baja)
  const buckets = { identicas: 0, cambio_menor: 0, cambio_relevante: 0, reescrita: 0, fetch_fallo: 0 };
  const bajas = [], preciosCambio = [], matchingSospecha = [], sinMatchConNombre = [];

  for (const p of filas) {
    if (circuit.tripped) { console.log('🛑 circuit breaker — IP probablemente bloqueada. Cortando; reintentá en horas.\n'); break; }
    const dj = p.datos_json || {};
    const descGuardada = dj.contenido?.descripcion || '';
    const sp = dj.senales_portal || null;
    const moneda = p.moneda_original || (OP === 'venta' ? null : null);

    let h = null, err = null;
    try { h = await fetchDetalleDepto(p.fuente, p.url); } catch (e) { err = String(e.message); }
    if (!h) {
      buckets.fetch_fallo++;
      bajas.push({ id: p.id, fuente: p.fuente, url: p.url, motivo: err || 'sin respuesta' });
      console.log(`   ${p.id} ${p.fuente} ✗ fetch (posible baja — cruzar con verificador): ${(err || '').slice(0, 40)}`);
      await pace(400);
      continue;
    }

    // 1) DRIFT de descripción (guardada al cargar vs portal hoy)
    const drift = compararDescripciones(descGuardada, h.descripcion || '');
    buckets[drift.bucket] = (buckets[drift.bucket] || 0) + 1;

    // 2) CAMBIO DE PRECIO en el portal (cabecera cruda) — lo que el discovery no ve
    const base = comparableBaseline(sp, moneda);
    const hoy = comparablePortal(h, moneda);
    let precioFlag = null;
    if (base != null && hoy != null && base > 0) {
      const pct = Math.round(Math.abs(hoy - base) / base * 1000) / 10;
      const grado = gradoPrecio(pct);
      if (grado) { precioFlag = { base, hoy, pct, grado, dir: hoy < base ? 'baja' : 'suba', moneda: moneda || '?' }; preciosCambio.push({ id: p.id, ...precioFlag }); }
    }

    // 3) MATCHING-lite: ¿el nombre del edificio aún aparece en el anuncio de hoy?
    const slug = (p.url || '').replace(/^https?:\/\/[^/]+\//, '');
    const aparece = nombreApareceEnAnuncio(p.nombre_edificio, [h.descripcion, slug]);
    let matchFlag = null;
    if (p.nombre_edificio && aparece === false) { matchFlag = 'nombre_no_aparece'; matchingSospecha.push({ id: p.id, edif: p.nombre_edificio }); }
    if (p.id_proyecto_master == null && p.nombre_edificio) sinMatchConNombre.push({ id: p.id, edif: p.nombre_edificio });

    // ¿va al juez? drift fuerte, o cambio de precio, o sospecha de matching.
    const revisar = drift.bucket === 'reescrita' || drift.bucket === 'cambio_relevante' || precioFlag || matchFlag || drift.tiene_flag_semantico;
    if (revisar) {
      material.push({
        id: p.id, fuente: p.fuente, url: p.url,
        // qué disparó la revisión (para el juez y para el reporte)
        motivos: [drift.bucket !== 'identicas' && drift.bucket !== 'cambio_menor' ? `drift:${drift.bucket}` : null,
                  precioFlag ? `precio:${precioFlag.dir}${precioFlag.pct}%` : null,
                  matchFlag, drift.tiene_flag_semantico ? 'flags:' + Object.keys(drift.flags_semanticos).join(',') : null].filter(Boolean),
        drift: { bucket: drift.bucket, similitud_pct: drift.similitud_pct, flags_semanticos: drift.flags_semanticos, palabras_agregadas: drift.palabras_agregadas, palabras_quitadas: drift.palabras_quitadas },
        precio_portal: precioFlag,
        // decisión ACTUAL del reader en shadow (lo que hay que re-validar contra el anuncio de hoy)
        shadow: OP === 'venta'
          ? { precio_usd: p.precio_usd, tipo_cambio_detectado: p.tipo_cambio_detectado, moneda_original: p.moneda_original, dormitorios: p.dormitorios, banos: p.banos, piso: p.piso, nombre_edificio: p.nombre_edificio, id_proyecto_master: p.id_proyecto_master, estado_construccion: p.estado_construccion }
          : { precio_mensual_bob: p.precio_mensual_bob, precio_mensual_usd: p.precio_mensual_usd, moneda_original: p.moneda_original, amoblado: p.amoblado, equipado: dj.equipado ?? null, acepta_mascotas: p.acepta_mascotas, dormitorios: p.dormitorios, banos: p.banos, nombre_edificio: p.nombre_edificio, id_proyecto_master: p.id_proyecto_master },
        // material FRESCO para re-leer (READER_SPEC / READER_SPEC_ALQUILER)
        anuncio_hoy: {
          descripcion: h.descripcion || null,
          senales: { precio_fuente_usd: h.precio_fuente_usd, precio_bob_portal: h.precio_bob_portal ?? null, tc_portal: h.tc_portal ?? null, moneda: h.moneda, dormitorios: h.dormitorios, banos: h.banos, piso: h.piso, estacionamientos: h.estacionamientos, amenities: h.amenities || [] },
        },
        // EL JUEZ LLENA ESTO: ¿la decisión shadow sigue valiendo contra el anuncio de hoy?
        //   { sigue_valido: bool, correccion: { precio_usd?, tipo_cambio_detectado?, dormitorios?, nombre_edificio?, estado?, ... }, nota }
        veredicto_audit: null,
      });
    }
    const tag = [drift.bucket, precioFlag ? `💲${precioFlag.dir}${precioFlag.pct}%` : '', matchFlag ? '🏷️' : ''].filter(Boolean).join(' ');
    console.log(`   ${p.id} ${p.fuente} ${tag}${revisar ? '  → JUEZ' : ''}`);
    await pace(500);
  }

  // ---- persistir material + summary ----
  const revisados = filas.length - (buckets.fetch_fallo || 0);
  const driftPct = revisados ? Math.round((buckets.reescrita + buckets.cambio_relevante) / revisados * 1000) / 10 : 0;
  const file = join(OUT, `audit-shadow-${OP}-${TS}.json`);
  writeFileSync(file, JSON.stringify({
    generado: TS, operacion: OP, spec: OP === 'venta' ? 'READER_SPEC.md' : 'READER_SPEC_ALQUILER.md',
    total: filas.length, revisados, buckets, drift_pct: driftPct,
    resumen: { al_juez: material.length, posibles_bajas: bajas.length, cambios_precio: preciosCambio.length, matching_sospecha: matchingSospecha.length, sin_match_con_nombre: sinMatchConNombre.length },
    material, bajas, sin_match_con_nombre: sinMatchConNombre,
  }, null, 2));

  console.log(`\n────────── RESUMEN AUDIT SHADOW (${OP}) ──────────`);
  console.log(`  Filas: ${filas.length}  ·  revisadas: ${revisados}  ·  fetch falló (posible baja): ${buckets.fetch_fallo}`);
  console.log(`  Drift: identicas ${buckets.identicas} · menor ${buckets.cambio_menor} · relevante ${buckets.cambio_relevante} · reescrita ${buckets.reescrita}  (drift ${driftPct}%)`);
  console.log(`  💲 Cambios de precio en portal: ${preciosCambio.length}${preciosCambio.length ? '  → ' + preciosCambio.slice(0, 12).map((x) => `${x.id}(${x.dir}${x.pct}%)`).join(', ') : ''}`);
  console.log(`  🏷️  Matching sospechoso (nombre no aparece): ${matchingSospecha.length}${matchingSospecha.length ? '  → ' + matchingSospecha.slice(0, 12).map((x) => `${x.id}(${x.edif})`).join(', ') : ''}`);
  console.log(`  ⚠️  Sin match pero con nombre (cola PM_NUEVO/fuzzy): ${sinMatchConNombre.length}`);
  console.log(`  💀 Posibles bajas (fetch falló): ${bajas.length}${bajas.length ? '  → ids: ' + bajas.slice(0, 20).map((b) => b.id).join(',') : ''}`);
  console.log(`\n  📦 ${material.length} al JUEZ → ${file}`);
  console.log(`     Siguiente: partí el material en chunks y lanzá subagentes-lectores (READER_SPEC${OP === 'alquiler' ? '_ALQUILER' : ''}.md).`);
  console.log(`     Cada uno re-lee anuncio_hoy y llena veredicto_audit (sigue_valido + correccion). Read-only: el SQL de corrección lo aplica el humano.\n`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
