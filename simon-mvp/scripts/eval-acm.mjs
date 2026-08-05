/* Eval del ACM. Corre solo y devuelve números, no impresiones.
 *
 *   cd simon-mvp && npm run dev -- -p 3300     (en otra terminal)
 *   node simon-mvp/scripts/eval-acm.mjs
 *   node simon-mvp/scripts/eval-acm.mjs --base http://localhost:3300 --nivel 1
 *
 * Existe porque la forma en que se verificaba antes —una muestra de uno y generalizar—
 * dejó pasar tres clases de error seguidas: enlaces que abrían otra propiedad, fugas al
 * portal en el documento del cliente y un porcentaje sacado de una grilla que no
 * representaba el uso real. Cada check de acá nació de un bug que llegó al founder.
 *
 * NIVEL 0 · no está roto        — recorre toda la grilla y cuenta errores
 * NIVEL 1 · los números son ciertos — contra la base, no contra sí mismo
 * NIVEL 2 · el flujo cierra     — armar → publicar → abrir → reconstruye idéntico
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const arg = (n, def) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : def; };
const BASE = arg('--base', 'http://localhost:3300');
const PAGINA = `${BASE}/acm-b7k2.html`;
const SOLO = arg('--nivel', null);

const r = []; // resultados
const check = (nivel, nombre, ok, detalle) => { r.push({ nivel, nombre, ok, detalle }); };

function supa() {
  const env = readFileSync(resolve(AQUI, '../.env.local'), 'utf8');
  const val = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();
  return createClient(val('NEXT_PUBLIC_SUPABASE_URL'), val('SUPABASE_SERVICE_ROLE_KEY'));
}

// El endpoint tarda ~2 s en frío y Next compila la primera request: sin calentarlo,
// el prototipo cae a su copia guardada y el eval mide otra cosa.
process.stdout.write('calentando el endpoint… ');
const t0 = Date.now();
const ok = await fetch(`${BASE}/api/acm-pool`).then((r) => r.ok).catch(() => false);
console.log(ok ? `${Math.round((Date.now() - t0) / 100) / 10}s` : 'NO RESPONDE');

const navegador = await chromium.launch();
const CELULAR = { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36' };
const pagina = await navegador.newPage(CELULAR);
const errores = [];
pagina.on('pageerror', (e) => errores.push(String(e.message)));
await pagina.goto(PAGINA, { waitUntil: 'networkidle' });

const origen = await pagina.evaluate(() => POOL_ORIGEN);
check(0, 'el pool llega del servidor (no la copia guardada)', origen === 'vivo', origen);

/* ───────── NIVEL 0 · no está roto ───────── */
if (!SOLO || SOLO === '0') {
  const n0 = await pagina.evaluate(() => {
    const fallos = { corridas: 0, cruzados: 0, fugas: 0, imgsExternas: 0, publicaciones: 0 };
    window.prompt = () => 'motivo de prueba'; window.confirm = () => true;
    const sel = document.getElementById('f-edif');
    const CFG = [[0, '0.20', '0'], [800, '0.30', '1'], [500, '0.20', '0']];
    for (const x of EDIFS) for (const d of [0, 1, 2]) for (const a of [40, 60, 90]) for (const est of ['P', 'E']) {
      sel.value = x.e;
      document.querySelectorAll('#f-dorms button').forEach((b) => b.classList.toggle('on', +b.dataset.v === d));
      MI.d = d;
      document.querySelectorAll('#f-est button').forEach((b) => b.classList.toggle('on', b.dataset.v === est));
      MI.est = est;
      document.getElementById('f-area').value = a;
      document.getElementById('f-precio').value = a * 1900;
      document.getElementById('f-go').click();
      fallos.corridas++;
      const c = CFG[fallos.corridas % CFG.length];
      document.querySelector(`#aj-radio button[data-v="${c[0]}"]`).click();
      document.querySelector(`#aj-tol button[data-v="${c[1]}"]`).click();
      const bt = document.querySelector(`#aj-tip button[data-v="${c[2]}"]`);
      if (!bt.disabled) bt.click();
      if (fallos.corridas % 23 !== 0) continue;
      // el documento del cliente: ni un enlace al portal ni una imagen de otro host
      document.getElementById('f-reco-precio').value = a * 2000;
      document.getElementById('f-reco-txt').value = 'prueba';
      if (COH) tog(0);
      publicar(); fallos.publicaciones++;
      const doc = document.getElementById('resultado');
      fallos.fugas += doc.querySelectorAll('a[href*="c21.com.bo"],a[href*="remax.bo"]').length;
      fallos.imgsExternas += Array.from(doc.querySelectorAll('img')).filter(
        (i) => i.src && !/^data:|^https:\/\/cdn\.21online|^https:\/\/intramax/.test(i.src)).length;
      volverEditar();
    }
    // ningún id de ficha puede corresponder a dos edificios distintos
    const m = {};
    POOL.forEach((p) => { const f = fichaDe(p); if (f) (m[f] = m[f] || []).push(p.e); });
    for (const k of Object.keys(m)) if (new Set(m[k]).size > 1) fallos.cruzados++;
    return fallos;
  });
  check(0, `recorre la grilla completa (${n0.corridas} combinaciones)`, n0.corridas > 2000, `${n0.corridas}`);
  check(0, 'sin errores de consola', errores.length === 0, errores.slice(0, 2).join(' · ') || 'ninguno');
  check(0, 'ningún enlace apunta a otro edificio', n0.cruzados === 0, `${n0.cruzados} cruzados`);
  check(0, 'sin enlaces al portal en el documento del cliente', n0.fugas === 0, `${n0.fugas} en ${n0.publicaciones} publicaciones`);
  check(0, 'sin imágenes de host desconocido', n0.imgsExternas === 0, `${n0.imgsExternas}`);
}

/* ───────── NIVEL 1 · los números son ciertos ───────── */
if (!SOLO || SOLO === '1') {
  const db = supa();
  const pool = await pagina.evaluate(() => POOL.map((p) => ({ id: +p.id, e: p.e, a: p.a, p: p.p, dias: p.dias })));

  // 1a · cada comparable existe en la base con el mismo precio y superficie
  const desfasados = [];
  for (let i = 0; i < pool.length; i += 200) {
    const tanda = pool.slice(i, i + 200);
    const { data } = await db.from('v_mercado_venta_shadow')
      .select('id,nombre_edificio,area_total_m2,precio_norm,dias_en_mercado')
      .in('id', tanda.map((x) => x.id));
    const porId = new Map((data ?? []).map((d) => [d.id, d]));
    for (const c of tanda) {
      const d = porId.get(c.id);
      if (!d) { desfasados.push(`${c.id} no está en la vista`); continue; }
      if (Math.round(+d.precio_norm) !== c.p || Math.round(+d.area_total_m2) !== c.a)
        desfasados.push(`${c.id} ${c.e}: doc ${c.p}/${c.a}m² vs base ${Math.round(+d.precio_norm)}/${Math.round(+d.area_total_m2)}m²`);
      if (d.dias_en_mercado !== c.dias) desfasados.push(`${c.id} días ${c.dias} vs ${d.dias_en_mercado}`);
    }
  }
  check(1, `cada comparable coincide con la base (${pool.length})`, desfasados.length === 0,
    desfasados.slice(0, 3).join(' · ') || 'todos');

  // 1b · el rango del documento = el mismo cálculo hecho en SQL.
  //      Si esto da igual, portar el motor al servidor es mecánico. Si difiere, hay una
  //      definición ambigua escondida en algún lado.
  // Los casos salen del propio pool: escribir nombres a mano falla en cuanto cambia
  // la fuente ("Maré" en la vista, "Condominio Maré" en el pool congelado).
  const casos = await pagina.evaluate(() => {
    const elegido = [];
    for (const d of [0, 1, 2]) {
      const cand = POOL.filter((p) => p.d === d && p.dias <= 180 &&
        (p.est === 'P' || p.est === 'E') && p.e !== '(sin edificio)');
      if (cand.length) elegido.push({ e: cand[0].e, d, a: cand[0].a, est: cand[0].est });
    }
    return elegido;
  });
  const difs = [];
  for (const caso of casos) {
    const doc = await pagina.evaluate((c) => {
      AJ = { radio: 800, tol: 0.20, tipVecinas: false };
      document.getElementById('f-edif').value = c.e;
      document.querySelectorAll('#f-dorms button').forEach((b) => b.classList.toggle('on', +b.dataset.v === c.d));
      MI.d = c.d;
      document.querySelectorAll('#f-est button').forEach((b) => b.classList.toggle('on', b.dataset.v === c.est));
      MI.est = c.est;
      document.getElementById('f-area').value = c.a;
      document.getElementById('f-precio').value = '';
      document.getElementById('f-go').click();
      if (!COH) return null;
      const s = stats();
      return { n: s.n, radio: COH.radio, mismoEstado: COH.mismoEstado,
               p25: Math.round(s.p25), p75: Math.round(s.p75),
               ids: COH.frescos.map((p) => +p.id).sort((x, y) => x - y) };
    }, caso);
    if (!doc) { difs.push(`${caso.e}: el documento no emite`); continue; }

    // el mismo cohorte, armado con SQL
    const { data } = await db.rpc('acm_eval_cohorte', {}).then(() => ({ data: null })).catch(() => ({ data: null }));
    // no hay RPC: se recalcula acá con los mismos criterios, leyendo de la vista
    const { data: todos } = await db.from('v_mercado_venta_shadow')
      .select('id,nombre_edificio,latitud,longitud,dormitorios,area_total_m2,precio_norm,precio_m2,dias_en_mercado,estado_construccion')
      .in('zona', ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'])
      .lte('dormitorios', 2).gte('area_total_m2', 20).not('latitud', 'is', null);
    const delEdificio = (todos ?? []).filter((x) => (x.nombre_edificio || '').trim() === caso.e);
    if (!delEdificio.length) { difs.push(`${caso.e}: no está en la base`); continue; }
    const lat = delEdificio.reduce((s, x) => s + +x.latitud, 0) / delEdificio.length;
    const lon = delEdificio.reduce((s, x) => s + +x.longitud, 0) / delEdificio.length;
    const distM = (aLat, aLon, bLat, bLon) => {
      const kx = 111320 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180);
      return Math.hypot((aLon - bLon) * kx, (aLat - bLat) * 110570);
    };
    const estDe = (x) => x.estado_construccion === 'preventa' || x.estado_construccion === 'pozo' ? 'P'
      : x.estado_construccion === 'entrega_inmediata' ? 'E' : '-';
    let cand = (todos ?? []).filter((x) =>
      x.dormitorios === caso.d &&
      Math.round(+x.area_total_m2) >= caso.a * 0.8 && Math.round(+x.area_total_m2) <= caso.a * 1.2 &&
      x.dias_en_mercado <= 180 &&
      distM(lat, lon, +x.latitud, +x.longitud) <= 800);
    if (doc.mismoEstado) cand = cand.filter((x) => estDe(x) === caso.est);
    const ids = cand.map((x) => x.id).sort((a, b) => a - b);
    const pctl = (arr, q) => { const s = arr.slice().sort((a, b) => a - b); const i = q * (s.length - 1);
      const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); };
    const m2 = cand.map((x) => Math.round(+x.precio_m2));
    const sql = { n: cand.length, p25: Math.round(pctl(m2, 0.25)), p75: Math.round(pctl(m2, 0.75)) };
    if (sql.n !== doc.n) difs.push(`${caso.e}: n doc ${doc.n} vs sql ${sql.n}`);
    else if (JSON.stringify(ids) !== JSON.stringify(doc.ids)) difs.push(`${caso.e}: distintos comparables`);
    else if (sql.p25 !== doc.p25 || sql.p75 !== doc.p75)
      difs.push(`${caso.e}: rango doc ${doc.p25}-${doc.p75} vs sql ${sql.p25}-${sql.p75}`);
  }
  check(1, `el motor del documento = el mismo cálculo en SQL (${casos.length} casos)`,
    difs.length === 0, difs.join(' · ') || 'idénticos');
}

/* ───────── NIVEL 2 · el flujo cierra ───────── */
if (!SOLO || SOLO === '2') {
  const armado = await pagina.evaluate(() => {
    window.prompt = () => 'piso bajo, frente a la avenida'; window.confirm = () => true;
    AJ = { radio: 0, tol: 0.20, tipVecinas: false };
    document.getElementById('f-edif').value = 'Lofty Island';
    document.querySelectorAll('#f-dorms button').forEach((b) => b.classList.toggle('on', b.dataset.v === '1'));
    MI.d = 1;
    document.querySelectorAll('#f-est button').forEach((b) => b.classList.toggle('on', b.dataset.v === 'P'));
    MI.est = 'P';
    document.getElementById('f-area').value = '51';
    document.getElementById('f-precio').value = '95000';
    document.getElementById('f-broker').value = 'Eval';
    document.getElementById('f-go').click();
    tog(0);
    document.getElementById('f-reco-precio').value = '104000';
    document.getElementById('f-reco-txt').value = 'Saldría en 104.000.';
    publicar();
    return { link: linkAcm(), rango: document.getElementById('rango-txt').innerText,
             n: stats().n, radio: COH.radio, corte: META_ACM.corte,
             excl: document.getElementById('excl-dec').textContent.length > 0,
             reco: document.querySelector('.reco .rp').innerText,
             wa: document.getElementById('btn-hablar').href };
  });

  // se abre en una pestaña limpia, como lo haría el cliente
  const pag2 = await navegador.newPage(CELULAR);
  const errores2 = [];
  pag2.on('pageerror', (e) => errores2.push(String(e.message)));
  await pag2.goto(armado.link, { waitUntil: 'networkidle' });
  const abierto = await pag2.evaluate(() => ({
    rango: document.getElementById('rango-txt').innerText, n: stats().n, radio: COH.radio,
    corte: META_ACM.corte, congelado: !!COH.congelado, modo: MODO,
    excl: document.getElementById('excl-dec').textContent.length > 0,
    reco: (document.querySelector('.reco .rp') || {}).innerText,
    portales: document.getElementById('resultado').querySelectorAll('a[href*="c21.com.bo"],a[href*="remax.bo"]').length,
  }));

  check(2, 'el enlace reconstruye el mismo rango', abierto.rango === armado.rango, `${armado.rango} → ${abierto.rango}`);
  check(2, 'los mismos comparables y radio', abierto.n === armado.n && abierto.radio === armado.radio,
    `n ${armado.n}→${abierto.n}, radio ${armado.radio}→${abierto.radio}`);
  check(2, 'el cohorte viaja congelado', abierto.congelado === true, String(abierto.congelado));
  check(2, 'la exclusión y su motivo sobreviven', abierto.excl === true && armado.excl === true, String(abierto.excl));
  check(2, 'la recomendación del broker sobrevive', abierto.reco === armado.reco, `${armado.reco} → ${abierto.reco}`);
  check(2, 'abre en vista del cliente, sin enlaces al portal', abierto.modo === 'lectura' && abierto.portales === 0,
    `${abierto.modo}, ${abierto.portales} portales`);
  check(2, 'sin errores al abrir el compartido', errores2.length === 0, errores2.slice(0, 2).join(' · ') || 'ninguno');
  check(2, 'el mensaje de WhatsApp lleva el análisis', /wa\.me\/\?text=.+/.test(armado.wa), 'sí');

  // cada ficha abre la propiedad correcta, no el feed entero
  // 🔴 /ventas es una SPA: buscar el id en el HTML del SSR no prueba nada — el
  // spotlight lo resuelve el cliente. Hay que abrirla y leer lo que quedó en pantalla.
  // Y en el celular, que es como la abre el cliente; en escritorio el feed muestra otra cosa.
  //
  // Este check pega contra PRODUCCIÓN, así que va despacio y con un reintento: seis
  // navegaciones seguidas hacen que el feed devuelva "No se pudo cargar" y eso sería
  // un rojo del feed, no del ACM. Si igual falla, lo dice sin adornos.
  const fichas = await pagina.evaluate(() =>
    POOL.filter((p) => fichaDe(p)).slice(0, 3).map((p) => ({ id: +p.id, url: fichaDe(p), e: p.e })));
  const malas = [];
  for (const f of fichas) {
    let visto = '';
    for (let intento = 1; intento <= 2; intento++) {
      try {
        await pag2.goto(f.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await pag2.waitForFunction((id) => document.body.innerText.includes(`#${id}`),
          f.id, { timeout: 30000 });
        visto = ''; break;
      } catch (e) {
        visto = await pag2.evaluate(() => document.body.innerText
          .split(String.fromCharCode(10)).filter((l) => l.trim()).slice(0, 5).join(' | '))
          .catch(() => '?');
        if (intento < 2) await new Promise((r) => setTimeout(r, 4000));
      }
    }
    if (visto) malas.push(`${f.id} (${f.e}) → ${visto.slice(0, 80)}`);
    await new Promise((r) => setTimeout(r, 2500)); // no atropellar producción
  }
  check(2, `las fichas abren la propiedad en el celular (${fichas.length}, contra producción)`,
    malas.length === 0, malas.slice(0, 2).join(' · ') || 'todas');
}

await navegador.close();

/* ───────── informe ───────── */
const ancho = Math.max(...r.map((x) => x.nombre.length));
let ultimo = -1;
for (const x of r) {
  if (x.nivel !== ultimo) { console.log(`\n── NIVEL ${x.nivel} ──`); ultimo = x.nivel; }
  console.log(`${x.ok ? ' OK ' : 'FALLA'}  ${x.nombre.padEnd(ancho)}  ${x.detalle ?? ''}`);
}
const fallas = r.filter((x) => !x.ok).length;
console.log(`\n${fallas === 0 ? '✓ todo en verde' : `✗ ${fallas} de ${r.length} en rojo`}`);
process.exit(fallas === 0 ? 0 : 1);
