// ============================================================================
// MUESTRA · casa × ALQUILER × Zona Norte — EXTRACCIÓN COMPLETA (read-only, SIN BD)
// ----------------------------------------------------------------------------
// Prueba acotada: descubre pocas casas en alquiler en ZN (C21 operacion_renta) y
// les saca el DETALLE COMPLETO (descripción, WhatsApp del captador, fotos, área,
// dorms, baños, código, fecha). NO escribe a la BD — vuelca a un JSON local para
// inspección. Pensado para "ver qué pasa" antes de armar la extracción completa.
//
//   node muestra-alquiler-zn.mjs            -> muestra de 3 (default)
//   node muestra-alquiler-zn.mjs --n=5      -> muestra de 5
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bboxDe, enZona } from '../sonda-suelo/lib/zonas.mjs';
import { fetchRetry, pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';
import { clasificarUso } from './clasificar-uso.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ZONA = 'zona-norte', STEP = 0.02;
const N = (() => { const a = process.argv.find(x => x.startsWith('--n=')); return a ? Math.max(1, Number(a.split('=')[1])) : 3; })();
const POOL = N + 3; // junto algunas extra por si alguna no cae en el polígono
const log = (m) => console.log(m);

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36', accept: 'application/json' };
const C21H = () => ({ ...UA, cookie: `PHPSESSID=muestra_${Math.random().toString(36).slice(2, 10)}` });
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const telNorm = (t) => { if (!t) return null; let d = String(t).replace(/[^0-9]/g, ''); if (d.startsWith('591')) d = d.slice(3); d = d.replace(/^0+/, ''); return d.length >= 7 ? `+591${d}` : null; };
const uniq = (a) => [...new Set(a.filter(Boolean))];
const fechaDesdeDias = (dias) => { const n = Number(dias); if (!Number.isFinite(n) || n < 0 || n > 3000) return null; return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); };
// Clasificador uso_inmueble (residencial/mixto/comercial + posible_depto) → ./clasificar-uso.mjs

// Detalle C21 para ALQUILER: mismo endpoint que venta, pero el precio NO usa la
// heurística $/m² de venta (en alquiler el mensual es chico) → muestro crudo.
async function detalleC21Alquiler(url) {
  const j = await fetchRetry(`${url}?json=true`, { json: true, headers: C21H() });
  if (!j) throw new Error('fetch C21 falló (timeout/HTTP)');
  const e = j.entity || j.data?.entity || j;
  const fotos = uniq((Array.isArray(j.fotos) && j.fotos.length ? j.fotos : (j.fotosNew || [])).map(f => f.large || f.large1 || f.path));
  return {
    descripcion: (e.descripcion || j.descripcionMeta || '').trim() || null,
    area_const_m2: num(e.m2C), area_terreno_m2: num(e.m2T),
    dorms: num(e.recamaras), banos: num(e.banios ?? e.banos),
    estacionamientos: Number(e.estacionamientos) || (e.estacionamientos === 0 ? 0 : null),
    precio_raw: num(e.precio) ?? num(e.precioVenta), moneda: (e.moneda || '').toUpperCase() || null,
    agente_nombre: [e.usname, e.apellidoP, e.apellidoM].filter(Boolean).join(' ').trim() || null,
    agente_telefono: telNorm(e.whatsapp || e.usuatelMovil),
    oficina_nombre: e.nombreOfna || null,
    contacto_visible: e.mostrarTelCelularEnInternet !== false,
    fotos_urls: fotos, cantidad_fotos: fotos.length,
    fecha_publicacion: fechaDesdeDias(e.dias) || (e.fechaModificacion?.date ? e.fechaModificacion.date.slice(0, 10) : null),
    codigo_propiedad: e.clave || (e.id != null ? String(e.id) : null),
  };
}

// ----- 1. DISCOVERY alquiler (corta apenas junta POOL props) -----
log(`\n🔎 MUESTRA casa × alquiler × ${ZONA} — extracción completa (read-only, SIN BD)`);
log(`   objetivo: ${N} casas con detalle · pool de descubrimiento: ${POOL}\n`);
log('1) Discovery C21 (operacion_renta, cuadrantes ZN, corte temprano)…');
const b = bboxDe(ZONA), cuad = [];
for (let lat = b.S; lat < b.N; lat += STEP) for (let lon = b.O; lon < b.E; lon += STEP)
  cuad.push({ N: Math.min(lat + STEP, b.N), E: Math.min(lon + STEP, b.E), S: lat, O: lon });

const vistos = new Set(), candidatas = [];
for (const c of cuad) {
  if (circuit.tripped) { log(`   🛑 circuit breaker (${circuit.fails} fallos) — IP probablemente bloqueada, corte`); break; }
  if (candidatas.length >= POOL) break; // ya tengo suficientes → no seguir pegando
  const coord = `coordenadas_${c.N.toFixed(6)},${c.E.toFixed(6)},${c.S.toFixed(6)},${c.O.toFixed(6)}`;
  const url = `https://c21.com.bo/v/resultados/tipo_casa/operacion_renta/layout_mapa/${coord},15?json=true`;
  const j = await fetchRetry(url, { json: true, headers: C21H() });
  let props = []; if (Array.isArray(j)) props = j; else if (j?.results) props = j.results; else if (j?.datas?.results) props = j.datas.results;
  for (const p of props) {
    const id = String(p.id ?? ''); if (!id || vistos.has(id)) continue; vistos.add(id);
    const lat = parseFloat(p.lat), lon = parseFloat(p.lon);
    const urlProp = p.urlCorrectaPropiedad ? `https://c21.com.bo${p.urlCorrectaPropiedad}` : null;
    if (urlProp && enZona(lat, lon, ZONA)) candidatas.push({ fuente: 'century21', id, lat, lon, precio_listado: num(p.precio), moneda_listado: (p.moneda || '').toUpperCase() || null, url: urlProp });
  }
  await pace(1500);
}
log(`   → ${candidatas.length} casas alquiler ZN candidatas (de ${vistos.size} crudas vistas)\n`);

// ----- 2. DETALLE COMPLETO de las primeras N -----
const target = candidatas.slice(0, N);
log(`2) Detalle completo de ${target.length}…`);
const detalladas = [];
for (const [i, p] of target.entries()) {
  try {
    const d = await detalleC21Alquiler(p.url);
    const cls = clasificarUso({ descripcion: d.descripcion, titulo: (p.url.split('/propiedad/').pop() || '').replace(/^\d+_/, '').replace(/-/g, ' ') });
    detalladas.push({ ...p, ...d, ...cls, fetch_ok: true });
  } catch (e) {
    detalladas.push({ ...p, fetch_ok: false, error: e.message });
  }
  if (circuit.tripped) { log(`   🛑 corte por circuit breaker (${circuit.fails} fallos)`); break; }
  await pace(800);
}

// ----- 3. SALIDA: archivo local + resumen legible (NADA a la BD) -----
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(__dirname, 'output'); mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `muestra-alquiler-zn-${ts}.json`);
writeFileSync(outPath, JSON.stringify({ generado: new Date().toISOString(), zona: ZONA, operacion: 'alquiler', modo: 'MUESTRA · read-only · SIN BD', n_objetivo: N, candidatas: candidatas.length, detalladas }, null, 2), 'utf8');

const EMOJI = { residencial: '🟢', mixto: '🟡', comercial: '🔴', revisar: '⚪' };
const ok = detalladas.filter(d => d.fetch_ok);
log('\n' + '='.repeat(64));
log(`  MUESTRA lista. NO se escribió NADA a la BD.`);
for (const clase of ['residencial', 'mixto', 'comercial', 'revisar']) {
  const grupo = ok.filter(d => d.clase === clase); if (!grupo.length) continue;
  log(`\n${EMOJI[clase]} ${clase.toUpperCase()} (${grupo.length})`);
  for (const d of grupo) {
    log(`  · ${d.dorms_texto ? d.dorms_texto + ' dorm-txt' : '0 dorm-txt'} · ${d.area_const_m2 ?? '?'}m²c · ${d.descripcion ? '"' + d.descripcion.slice(0, 70).replace(/\s+/g, ' ') + '…"' : '(s/desc)'}`);
    log(`    ${d.motivo}${d.a_agente ? '  → 🤖 a capa 2 (agente-lector)' : ''}`);
    log(`    ${d.url}`);
  }
}
const fallos = detalladas.filter(d => !d.fetch_ok);
if (fallos.length) log(`\n❌ fallos de fetch: ${fallos.length}`);
// ---- SPLIT ----
const split = ok.reduce((a, d) => (a[d.clase] = (a[d.clase] || 0) + 1, a), {});
const aAgente = ok.filter(d => d.a_agente).length;
log('\n' + '='.repeat(64));
log(`  SPLIT capa 1 (regex, solo ordena):  ` + ['residencial', 'mixto', 'comercial', 'revisar'].map(c => `${EMOJI[c]}${split[c] || 0} ${c}`).join('  ·  '));
log(`  → ${ok.length - aAgente} clasificadas en firme por capa 1  ·  ${aAgente} ambiguas (mixto+revisar) van al agente-lector`);
log(`  💾 JSON completo: ${outPath}\n`);
