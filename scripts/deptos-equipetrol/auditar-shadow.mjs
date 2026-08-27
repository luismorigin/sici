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

// 🔴 POR DEFECTO SOLO LAS ACTIVAS (27-ago-2026). Hasta hoy barría TODO, incluidas las
// dadas de baja: **502 de 1.770, el 28%**. Ir a buscar la descripción de un aviso que
// ya sabemos muerto es gasto puro — devuelve 404 y su baja ya está registrada. El
// drift existe para detectar que un aviso VIVO cambió por dentro, no para reconfirmar
// defunciones. Con `--incluir-bajas` vuelve al comportamiento anterior, por si alguna
// vez hay que revisar si una baja fue un falso positivo.
const INCLUIR_BAJAS = argv.includes('--incluir-bajas');
const idsArg = (() => { const i = argv.indexOf('--ids'); return i >= 0 ? (argv[i + 1] || '').split(',').map((x) => Number(x.trim())).filter(Boolean) : null; })();

// ---- umbral de cambio de precio (mismo criterio que la mensual): piso 1% para descartar
// redondeo/parseo; ≥10% alta, 3–10% media, 1–3% baja. Nada real ≥1% se esconde. ----
const gradoPrecio = (pct) => (pct >= 10 ? 'alta' : pct >= 3 ? 'media' : pct >= 1 ? 'baja' : null);

// ---- matching-lite: ¿el nombre del edificio (shadow) aún aparece en el anuncio de hoy? ----
const GENERICOS = /^(condominio|edificio|torre|residencia|residence|residencial|suites?|studios?|apartments?|tower|departamento|depto)$/i;
// 🔑 `NFKD` ANTES de `toLowerCase()`, y ese orden importa tanto como la forma.
// Los captadores escriben el nombre del edificio en unicode matemático decorativo
// (𝐄𝐝𝐢𝐟𝐢𝐜𝐢𝐨 𝐒𝐭𝐨𝐧𝐞 𝟑, 𝐌𝐀𝐑𝐄, 𝑵𝒂𝒏𝒐𝒕𝒆𝒄): son codepoints U+1D400+, no letras ASCII, así que el
// filtro `[^a-z0-9\s]` se los comía enteros y el nombre "no aparecía" aunque estuviera en la
// primera línea. Con `NFD` no alcanza —no descompone compatibilidad—; hace falta `NFKD`.
// Y con `toLowerCase()` primero tampoco: 𝐒 (bold capital) no tiene minúscula, sobrevive al
// lower, NFKD lo pliega a "S" mayúscula y el filtro la borra igual → quedaba "tone" en vez de
// "stone", una letra menos por palabra. Medido sobre la corrida del 3-ago: 14 de los 43
// `nombre_no_aparece` (33 %) eran este falso positivo, incluidas las 7 props de Maré.
const norm = (s) => (s || '').normalize('NFKD').toLowerCase().replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
function nombreApareceEnAnuncio(nombre, textos) {
  if (!nombre) return null; // sin nombre → no aplica
  const heno = norm(textos.filter(Boolean).join(' · '));
  const toks = norm(nombre).split(' ').filter((w) => w.length >= 3 && !GENERICOS.test(w));
  if (!toks.length) return null; // solo genéricos → no discrimina, no flagear
  // aparece si TODOS los tokens distintivos están (edificio de 1 token: ese token)
  return toks.every((t) => heno.includes(t));
}

// ---- fila shadow → baseline + decisión del reader (según operación) ----
// `primera_ausencia_at` se trae SOLO para el corte de posibles bajas (ver §RESIDUAL más abajo):
// es la señal de si el verificador ya tiene esa prop en su cola.
const COLS_VENTA = 'id,fuente,url,precio_usd,tipo_cambio_detectado,moneda_original,dormitorios,banos,piso,nombre_edificio,id_proyecto_master,estado_construccion,es_activa,status,primera_ausencia_at,datos_json';
// `equipado` NO es columna de shadow (vive en datos_json.equipado) → se lee del JSON en el snapshot.
const COLS_ALQ = 'id,fuente,url,precio_mensual_bob,precio_mensual_usd,moneda_original,amoblado,acepta_mascotas,dormitorios,banos,nombre_edificio,id_proyecto_master,es_activa,status,primera_ausencia_at,datos_json';

async function traerFilas() {
  let q = sb.from('propiedades_v2')
    .select((OP === 'venta' ? COLS_VENTA : COLS_ALQ) + ',fecha_creacion')
    .eq('tipo_operacion', OP);
  // Las bajas no se re-fetchean salvo que se pidan (ver INCLUIR_BAJAS arriba).
  // Con `--ids` mandan los ids: si alguien pide una puntual, se trae aunque esté de baja.
  if (!INCLUIR_BAJAS && !idsArg) q = q.eq('es_activa', true);
  if (idsArg) q = q.in('id', idsArg);

  // 🔑 ORDEN POR ANTIGÜEDAD DE CAPTURA, no por id. El híbrido lee cada aviso UNA vez,
  // al capturarlo, así que la que más falta le hace releerse es la que hace más tiempo
  // que nadie mira. Ordenar por `id` traía las de número más bajo — las viejas de n8n,
  // muchas ya muertas — justo al revés de lo que necesita un `--limit`.
  // Medido el 27-ago: 780 de 1.098 props del feed llevaban +24 días sin releerse, con
  // 28 de promedio y la más vieja del 9-jul.
  q = q.order('fecha_creacion', { ascending: true, nullsFirst: true });
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

  // Qué se está auditando, dicho antes de empezar. Un `--limit` corta en silencio y
  // sin esta línea no hay forma de saber qué quedó afuera ni cuán viejo es lo que entró.
  const dias = (f) => f.fecha_creacion ? Math.round((Date.now() - new Date(f.fecha_creacion)) / 86400e3) : null;
  const edades = filas.map(dias).filter((d) => d != null).sort((a, b) => b - a);
  const alcance = idsArg ? '--ids' : (INCLUIR_BAJAS ? 'activas + dadas de baja' : 'solo ACTIVAS');
  console.log(`\n🔎 AUDIT SHADOW (${OP}) — ${filas.length} filas · ${alcance}${LIMIT && !idsArg ? ` · limit ${LIMIT}, las más viejas primero` : ''}. READ-ONLY, $0.`);
  if (edades.length) {
    console.log(`   antigüedad de la lectura: la más vieja ${edades[0]} d · mediana ${edades[Math.floor(edades.length / 2)]} d`);
  }
  console.log('');
  if (!filas.length) { console.log('   (shadow vacío para esta operación — nada que auditar)\n'); return; }

  const material = [];          // los que van al JUEZ (drift / precio / matching / baja)
  const buckets = { identicas: 0, cambio_menor: 0, cambio_relevante: 0, reescrita: 0, fetch_fallo: 0 };
  const bajas = [], preciosCambio = [], matchingSospecha = [], sinMatchConNombre = [], fotosRotas = [];
  const precioBajoElPortal = [];   // ver §COPIA MAL más abajo

  for (const p of filas) {
    if (circuit.tripped) { console.log('🛑 circuit breaker — IP probablemente bloqueada. Cortando; reintentá en horas.\n'); break; }
    const dj = p.datos_json || {};
    const descGuardada = dj.contenido?.descripcion || '';
    const sp = dj.senales_portal || null;
    const moneda = p.moneda_original || (OP === 'venta' ? null : null);

    // ── §COPIA MAL — el único chequeo que NO necesita el portal de hoy ──────────────────
    // Todo el resto de este audit compara "el portal de hoy" contra "el portal del día que
    // capturamos": vigila si el MUNDO cambió. Esto vigila si NOSOTROS copiamos mal, y por eso
    // es estructuralmente ciego para el resto: el error vive entre lo que el portal decía y lo
    // que el lector guardó, en la misma fila, desde el día uno. Re-leer el anuncio mil veces
    // nunca lo va a mostrar — siempre va a coincidir consigo mismo.
    //   Caso testigo: 8000432 (K1) guardado a $82.692 con el portal cobrando $88.027.
    //
    // VENTA ÚNICAMENTE, y no por decisión: al 3-ago-2026 **ninguna** fila de alquiler tiene
    // `senales_portal.precio_candidato` (0 de 340) → no hay testigo contra qué comparar.
    //
    // La banda 3–15% por DEBAJO es angosta a propósito. Diferencias grandes hacia arriba o
    // hacia abajo son casi siempre el lector corrigiendo bien un "USD" que el portal fabricó
    // dividiendo bolivianos por 6,96 — el MOAT haciendo su trabajo (108 de 498 difieren >3%).
    // Guardar POR DEBAJO del portal en ese rango no tiene explicación de moneda: o se comió un
    // dígito o leyó el número equivocado.
    //
    // Corre ANTES del fetch a propósito: no lo necesita, y así una ficha muerta igual se chequea.
    if (OP === 'venta') {
      const testigo = Number(sp?.precio_candidato) || null;
      const guardado = Number(p.precio_usd) || null;
      if (testigo && guardado && guardado < testigo) {
        const pct = (testigo - guardado) / testigo;
        if (pct >= 0.03 && pct <= 0.15) {
          // 🔑 MEMORIA. Sin esto la alerta repite cada noche lo que ya decidiste y muere de ruido
          // en una semana — el mismo agujero que ya se tapó tres veces este mes (rechazados.json
          // por URL, `confirmado_por` del matching, la 6ta reincidencia del dedup de K1).
          // El tag guarda el precio del momento de la confirmación: si el captador lo cambia,
          // deja de coincidir y el caso VUELVE solo. Una marca de "ya revisado" sin esa condición
          // es peor que nada — te tapa un error nuevo en una prop que miraste hace tres meses.
          const conf = dj.precio_confirmado_por || null;
          const vigente = conf && Number(conf.precio) === guardado;
          if (!vigente) {
            precioBajoElPortal.push({
              id: p.id, edificio: p.nombre_edificio || null, url: p.url,
              guardado, dice_el_portal: testigo, pct: Math.round(pct * 1000) / 10,
              area_total_m2: p.area_total_m2 ?? null,
              confirmacion_vencida: conf ? { ...conf, precio_actual: guardado } : null,
            });
          }
        }
      }
    }

    let h = null, err = null;
    try { h = await fetchDetalleDepto(p.fuente, p.url); } catch (e) { err = String(e.message); }
    if (!h) {
      buckets.fetch_fallo++;
      // El cruce con el verificador se hace ACÁ, no "después a mano" (ver §RESIDUAL en el resumen).
      const cubierta = !p.es_activa ? 'ya_inactiva' : (p.primera_ausencia_at ? 'en_cola' : null);
      bajas.push({
        id: p.id, fuente: p.fuente, url: p.url, motivo: err || 'sin respuesta',
        es_activa: p.es_activa, primera_ausencia_at: p.primera_ausencia_at || null,
        cubierta_por_verificador: cubierta,          // null = NADIE la está mirando
      });
      console.log(`   ${p.id} ${p.fuente} ✗ fetch${cubierta ? ` (${cubierta === 'ya_inactiva' ? 'ya de baja' : 'ya en cola del verificador'})` : ' 🔴 RESIDUAL — activa y fuera del radar del verificador'}: ${(err || '').slice(0, 40)}`);
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

    // 4) FOTOS PODRIDAS (28-jul-2026) — el punto ciego que encontró la revisión de marketing.
    // Caso real: 8 preventas de Rhodium con el placeholder vacío en /ventas. El aviso seguía
    // VIVO (HTTP 200, 10 fotos), pero el captador REEMPLAZÓ las imágenes: las que teníamos
    // guardadas fueron borradas del CDN de C21 y devuelven 403 AccessDenied. Ningún chequeo
    // lo veía: el discovery mira la lista de URLs del portal, el verificador mira si el aviso
    // existe, y el drift mira el TEXTO. Nadie miraba si la foto todavía carga.
    //
    // Cuesta CERO pedidos extra: el detalle que ya bajamos trae las fotos de hoy, así que
    // alcanza con cruzar las dos listas. Solo si NINGUNA de las guardadas sigue publicada se
    // gasta 1 request para confirmar que de verdad están rotas (y no que el portal reordenó).
    // 🔑 Lo que decide es la PORTADA, no el conjunto. Medido en Rhodium 8000209: de 11 fotos
    // guardadas 8 SIGUEN vivas — pero la PRIMERA no, y esa es la única que pinta la card del
    // feed. Por eso la tarjeta sale vacía mientras el contador dice "1/11": el número sale del
    // largo de la lista guardada, la imagen sale de la primera URL. Un criterio de "ninguna
    // sobrevive" no habría detectado ni uno solo de los 8 casos reportados.
    const fotosGuardadas = Array.isArray(dj.contenido?.fotos_urls) ? dj.contenido.fotos_urls : [];
    const fotosHoy = Array.isArray(h.fotos_urls) ? h.fotos_urls : [];
    let fotosFlag = null;
    if (fotosGuardadas.length > 0 && fotosHoy.length > 0) {
      const hoySet = new Set(fotosHoy);
      const portadaSigue = hoySet.has(fotosGuardadas[0]);
      if (!portadaSigue) {
        // Confirmar que está rota de verdad (y no que el captador solo reordenó las fotos):
        // 1 request, solo en los casos sospechosos.
        let httpPortada = null;
        try {
          const r = await fetch(fotosGuardadas[0], { headers: { 'User-Agent': 'Mozilla/5.0' } });
          httpPortada = r.status;
        } catch { httpPortada = 'sin respuesta'; }
        if (httpPortada !== 200) {
          const vivas = fotosGuardadas.filter((u) => hoySet.has(u)).length;
          fotosFlag = { guardadas: fotosGuardadas.length, en_el_portal_hoy: fotosHoy.length, otras_que_siguen_vivas: vivas, http_portada: httpPortada, portada_del_portal_hoy: fotosHoy[0] };
          fotosRotas.push({ id: p.id, fuente: p.fuente, edif: p.nombre_edificio, ...fotosFlag });
          console.log(`   ${p.id} ${p.fuente} 📷 PORTADA ROTA (HTTP ${httpPortada}) — la card sale vacía. ${vivas}/${fotosGuardadas.length} fotos siguen vivas → re-leer`);
        }
      }
    }

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
  // ── §RESIDUAL — el corte que hace útil la lista de posibles bajas ────────────────────
  // Antes esto era una lista cruda de "fetch falló" con la nota "cruzar con verificador", y ese
  // cruce no lo hacía nadie. Medido el 3-ago-2026 sobre esta misma corrida: de 53 fichas que no
  // respondían, **36 ya estaban de baja** y **15 ya estaban en la cola del verificador** (se cierran
  // solas con la gracia de 2d). Solo **2** eran el hallazgo. Con 51/53 de ruido, la lista se ignora.
  //
  // El residual es el punto ciego real: la ficha no responde, la prop SIGUE ACTIVA y el verificador
  // NUNCA la va a mirar, porque su universo es `desaparecidas del discovery OR primera_ausencia_at
  // no nulo` — y el portal la sigue mostrando en su LISTADO aunque la ficha ya no exista. Lo que
  // cae ahí no sale nunca: `8000009` (Element Sirari) llevaba **83 días** en el feed de alquiler
  // siendo un aviso inexistente, y `3821` (Cozumel) encima había pasado a venta.
  //
  // Este audit NO da de baja: eso es autoridad del verificador (2 señales + gracia). Acá solo se
  // SEÑALA lo que nadie está mirando, para que el humano lo confirme.
  const bajasResidual = bajas.filter((b) => !b.cubierta_por_verificador);
  const bajasEnCola = bajas.filter((b) => b.cubierta_por_verificador === 'en_cola');
  const bajasYaInactivas = bajas.filter((b) => b.cubierta_por_verificador === 'ya_inactiva');

  const file = join(OUT, `audit-shadow-${OP}-${TS}.json`);
  writeFileSync(file, JSON.stringify({
    generado: TS, operacion: OP, spec: OP === 'venta' ? 'READER_SPEC.md' : 'READER_SPEC_ALQUILER.md',
    total: filas.length, revisados, buckets, drift_pct: driftPct,
    resumen: {
      al_juez: material.length, posibles_bajas: bajas.length,
      bajas_residual: bajasResidual.length, bajas_en_cola: bajasEnCola.length, bajas_ya_inactivas: bajasYaInactivas.length,
      cambios_precio: preciosCambio.length, matching_sospecha: matchingSospecha.length, sin_match_con_nombre: sinMatchConNombre.length, fotos_rotas: fotosRotas.length,
      precio_bajo_el_portal: precioBajoElPortal.length,
    },
    material, bajas, bajas_residual: bajasResidual, sin_match_con_nombre: sinMatchConNombre, fotos_rotas: fotosRotas,
    precio_bajo_el_portal: precioBajoElPortal,
  }, null, 2));

  console.log(`\n────────── RESUMEN AUDIT SHADOW (${OP}) ──────────`);
  console.log(`  Filas: ${filas.length}  ·  revisadas: ${revisados}  ·  fetch falló (posible baja): ${buckets.fetch_fallo}`);
  console.log(`  Drift: identicas ${buckets.identicas} · menor ${buckets.cambio_menor} · relevante ${buckets.cambio_relevante} · reescrita ${buckets.reescrita}  (drift ${driftPct}%)`);
  console.log(`  💲 Cambios de precio en portal: ${preciosCambio.length}${preciosCambio.length ? '  → ' + preciosCambio.slice(0, 12).map((x) => `${x.id}(${x.dir}${x.pct}%)`).join(', ') : ''}`);
  console.log(`  🏷️  Matching sospechoso (nombre no aparece): ${matchingSospecha.length}${matchingSospecha.length ? '  → ' + matchingSospecha.slice(0, 12).map((x) => `${x.id}(${x.edif})`).join(', ') : ''}`);
  console.log(`  ⚠️  Sin match pero con nombre (cola PM_NUEVO/fuzzy): ${sinMatchConNombre.length}`);
  // La lista cruda queda como contexto (chica, entre paréntesis); lo que se GRITA es el residual.
  console.log(`  💀 Fichas que no responden: ${bajas.length}  (ya de baja: ${bajasYaInactivas.length} · ya en cola del verificador: ${bajasEnCola.length} · se cierran solas)`);
  if (bajasResidual.length) {
    console.log(`  🔴 BAJAS QUE NADIE ESTÁ MIRANDO: ${bajasResidual.length} — activas, ficha muerta, y FUERA del radar del verificador`);
    for (const b of bajasResidual) console.log(`       ${b.id} ${b.fuente}  ${b.url}`);
    console.log(`     → El portal las sigue mostrando en su LISTADO aunque la ficha ya no exista, así que`);
    console.log(`       nunca entran a la cola del verificador y NO se van a arreglar solas.`);
    console.log(`       Confirmá el status HTTP (C21: 404 · Remax: 302) y dales de baja a mano.`);
  } else {
    console.log(`  ✅ Sin bajas residuales: todo lo que no responde ya está de baja o en cola del verificador.`);
  }
  if (OP === 'venta') {
    if (precioBajoElPortal.length) {
      console.log(`  💰 PRECIO GUARDADO POR DEBAJO DEL PORTAL (3-15%): ${precioBajoElPortal.length} — sospecha de dígito comido al LEER, no de cambio en el aviso`);
      for (const x of precioBajoElPortal) {
        console.log(`       ${x.id} ${(x.edificio || '—').slice(0, 26).padEnd(27)} guardado $${x.guardado}  ·  el portal dice $${Math.round(x.dice_el_portal)}  (−${x.pct}%)${x.confirmacion_vencida ? '  ⚠️ confirmación VENCIDA: el precio cambió desde que se revisó' : ''}`);
      }
      console.log(`     → Este chequeo NO sale al portal: compara la fila contra su propio testigo. Es el único`);
      console.log(`       error que el drift no puede ver (nació entre el portal y el lector, no en el aviso).`);
      console.log(`       Al resolver cada caso, tagueá para que no vuelva cada noche:`);
      console.log(`       datos_json.precio_confirmado_por = {quien, cuando, precio: <el precio_usd de ese momento>}`);
    } else {
      console.log(`  ✅ Sin precios por debajo del portal sin revisar.`);
    }
  }
  console.log(`  📷 Fotos reemplazadas por el captador (card sale VACÍA en el feed): ${fotosRotas.length}${fotosRotas.length ? '  → ids: ' + fotosRotas.slice(0, 20).map((f) => f.id).join(',') : ''}`);
  if (fotosRotas.length) console.log(`     → se arregla re-leyendo esos avisos: el portal ya tiene las fotos nuevas.`);
  console.log(`\n  📦 ${material.length} al JUEZ → ${file}`);
  console.log(`     Siguiente: partí el material en chunks y lanzá subagentes-lectores (READER_SPEC${OP === 'alquiler' ? '_ALQUILER' : ''}.md).`);
  console.log(`     Cada uno re-lee anuncio_hoy y llena veredicto_audit (sigue_valido + correccion). Read-only: el SQL de corrección lo aplica el humano.\n`);
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
