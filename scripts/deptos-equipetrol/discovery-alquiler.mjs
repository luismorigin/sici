// ============================================================================
// DISCOVERY DEPTOS ALQUILER EQUIPETROL — ORQUESTADOR · FASE DRY-RUN (read-only)
// ----------------------------------------------------------------------------
// Espeja discovery-deptos.mjs (venta) pero para ALQUILER: sale a los portales él
// mismo (NO hereda la discovery de n8n). tipo=departamento × operacion=alquiler ×
// las 6 microzonas Equipetrol. Encuentra alquileres NUEVOS que el n8n no tiene.
//
//   C21:   operacion='renta'    (token URL de C21)
//   Remax: operacion='alquiler' (alquiler/arriendo/renta, EXCLUYE anticrético)
//
// Etapas (READ-ONLY):
//   1. Discovery  → c21Listado(renta) + remaxListadoSC(alquiler), red ancha
//   2. Zona fina  → get_zona_by_gps → SOLO las 6 microzonas
//   3. Diff vs BD → nuevas / existentes / desaparecidas — filtra tipo_operacion='alquiler'
//                   (sin el filtro compararía contra las URLs de VENTA → todo saldría "nuevo")
//   4. Salida     → output/discovery-alquiler-<ts>.json
//
// Las NUEVAS se procesan con: cargar-alquiler-shadow.mjs --nuevas <este.json>
// (detalle → lector spec v2 → matching → upsert shadow con id reservado 8M).
//
// Uso: node discovery-alquiler.mjs [--force]
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c21Listado, remaxListadoSC } from '../sonda-suelo/lib/portales.mjs';
import { enZona } from '../sonda-suelo/lib/zonas.mjs';
import { circuit, trafico } from '../sonda-suelo/lib/fetcher.mjs';
import { ZONAS_HIBRIDO, resolverZona } from './lib/zonas-hibrido.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ZONA = resolverZona();                   // default equipetrol → sin flags, igual que antes
const ZONA_KEY = ZONA.bboxKey;
const TIPO = 'departamento';
const ZONAS_EQ = new Set(ZONA.zonas);
const FORCE = process.argv.includes('--force');
const log = (m) => console.log(m);

// Cooldown POR ZONA (ver el gemelo de venta): el prefijo de Equipetrol es prefijo de los demás,
// así que hay que excluir explícitamente los de otras zonas o se auto-bloquearía con ellos.
const PREFIJO = `discovery-alquiler${ZONA.sufijoArchivo}-`;
const PREFIJOS_AJENOS = Object.values(ZONAS_HIBRIDO)
  .filter((z) => z.id !== ZONA.id && z.sufijoArchivo)
  .map((z) => `discovery-alquiler${z.sufijoArchivo}-`);
const esDeEstaZona = (f) => f.startsWith(PREFIJO) && !PREFIJOS_AJENOS.some((p) => f.startsWith(p));

const COOLDOWN_MIN = 20;
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
try {
  const last = readdirSync(OUT).filter(esDeEstaZona).sort().pop();
  if (last && !FORCE) {
    const ageMin = (Date.now() - statSync(join(OUT, last)).mtimeMs) / 60000;
    if (ageMin < COOLDOWN_MIN) {
      console.log(`\n⏳ Última corrida hace ${ageMin.toFixed(0)} min (< ${COOLDOWN_MIN}). Re-crawlear tan seguido puede bloquear tu IP. Esperá o usá --force.\n`);
      process.exit(0);
    }
  }
} catch { /* primera corrida */ }

async function clasificarZonas(items) {
  const CHUNK = 20;
  const res = new Map();
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    const out = await Promise.all(slice.map(async (p) => {
      const { data, error } = await sb.rpc('get_zona_by_gps', { p_lat: p.lat, p_lon: p.lon });
      return [p.url, error ? null : (Array.isArray(data) ? data[0]?.zona : data?.zona ?? data) ?? null];
    }));
    for (const [url, zona] of out) res.set(url, zona);
  }
  return res;
}

// ============================== MAIN ==============================
log(`\n🏢 DISCOVERY ALQUILER ${ZONA.nombre.toUpperCase()} — DRY-RUN (read-only) · tipo=${TIPO} · operacion=alquiler · ${ZONA.zonas.length} microzonas\n`);

// ---------- 1. DISCOVERY ----------
log(`1) Discovery (C21 renta + Remax alquiler, red ancha ${ZONA.nombre})…`);
const listings = [];
for (const p of await c21Listado(ZONA_KEY, TIPO, { log, step: 0.005, operacion: 'renta', saltarVacios: ZONA.usaPoligono })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'century21' });
for (const p of await remaxListadoSC(TIPO, { log, operacion: 'alquiler' })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'remax' });
const byUrl = new Map();
for (const p of listings) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
const portalBbox = [...byUrl.values()];
log(`   → ${portalBbox.length} deptos únicos por URL dentro del bbox (${listings.length} listings crudos)\n`);

if (circuit.tripped) {
  // CLASIFICAR antes de avisar (ítem 2c-bis del CUTOVER_DATA_PLAN) — gemelo de discovery-deptos.
  // "IP bloqueada" a secas fue ENGAÑOSO el 20-jul (C21 estaba caído, DNS ENOTFOUND global).
  // Si el corte fue por RELOJ, el DNS no viene al caso (gemelo de discovery-deptos): preguntarlo
  // daría "ambos resuelven → probable bloqueo de IP", que manda a investigar el proxy en vez de
  // la ventana horaria, que es donde está el problema.
  let diag;
  if (circuit.porReloj) {
    diag = `la corrida pasó del límite de tiempo (${circuit.motivo}). Causa típica: la máquina se ` +
      `suspendió a mitad del crawl (Modern Standby corta la red) y el reloj siguió corriendo. ` +
      `NO es el portal ni la IP: revisar que la ventana nocturna esté despierta.`;
  } else {
    const dns = await import('node:dns');
    const resuelve = async (h) => { try { await dns.promises.lookup(h); return true; } catch { return false; } };
    const [c21Ok, remaxOk] = await Promise.all([resuelve('c21.com.bo'), resuelve('remax.bo')]);
    diag = !c21Ok && !remaxOk ? 'NINGUNO de los dos portales resuelve DNS → caídos o problema de red propia'
      : !c21Ok ? 'C21 NO resuelve DNS → C21 caído (no es bloqueo de IP)'
      : !remaxOk ? 'Remax NO resuelve DNS → Remax caído (no es bloqueo de IP)'
      : 'ambos portales resuelven DNS → probable bloqueo de IP/proxy o rate-limit';
  }

  console.error(`🛑 Discovery INCOMPLETO: ${circuit.motivo}.`);
  console.error(`   Diagnóstico: ${diag}`);
  console.error(`   Aborto para NO escribir un diff parcial (metería falsas "desaparecidas"). Reintentá más tarde.\n`);

  const { notificarSlack } = await import('./notificar-slack.mjs');
  await notificarSlack(
    `🛑 *Cron deptos-ALQUILER ABORTADO* (discovery)\n` +
    `Motivo: ${circuit.motivo}.\n` +
    `Diagnóstico: ${diag}\n` +
    `*NO se escribió nada* — se aborta a propósito para no meter bajas falsas.\n` +
    `Se reintenta en la próxima corrida; el inventario no se pierde (el discovery es shadow-relativo).`
  );
  process.exit(1);
}

// ---------- 2. ZONA FINA ----------
log(`2) Filtro de zona fina (get_zona_by_gps ∈ ${ZONA.zonas.length} microzonas)…`);
const zonaDe = await clasificarZonas(portalBbox);
const portal = portalBbox.filter((p) => ZONAS_EQ.has(zonaDe.get(p.url)));
log(`   → ${portal.length} deptos en las ${ZONA.zonas.length} microzonas (${portalBbox.length - portal.length} descartados)\n`);

// ---------- 3. DIFF (SELECT-only, SOLO alquiler) — SHADOW-AWARE ----------
// El híbrido vive en SHADOW: NUEVAS excluyen lo ya cargado en shadow (sin esto se reprocesan cada
// corrida); DESAPARECIDAS se miden contra SHADOW, no contra prod (prod acumula stale → ruido).
log('3) Diff SHADOW-AWARE alquiler (shadow filtra ya-cargadas + mide desaparecidas)…');
// 🔌 DESENGANCHADO DE PROD (10-ago-2026) — gemelo del de venta y por el mismo motivo: la lectura
// de `propiedades_v2` era informativa (prod dejó de clasificar el 20-jul) pero su
// `if (error) process.exit(1)` **abortaba la captura entera**. Con la tabla vieja congelada desde
// el 28-jul y a punto de archivarse, era una atadura que podía frenar el pipeline vivo.
// SHADOW (alquiler): lo que el híbrido YA cargó (existentes migradas + nuevas con id 8M)
// 🔒 FILTRADO POR ZONA (28-jul-2026) — gemelo del de venta y por el mismo motivo: las
// `desaparecidas` son las que están en shadow y este crawl no vio, así que sin filtro el
// discovery de una zona daría de baja las props de la otra.
// ⚠️ En alquiler el filtro SÍ cambia un número (en venta no cambiaba ninguno): shadow alquiler
// tiene 270 filas y UNA es de Zona Norte (id 3674, "Torre Moderna", 4to-6to Banzer-Alemana).
// Hoy el crawl de Equipetrol no la ve nunca — está fuera de su bbox — así que figura como
// "desaparecida" TODAS las noches y se la chequea por HTTP al pedo (no se da de baja porque el
// verificador exige 2 señales). Con el filtro sale del universo de Equipetrol, que es lo correcto:
// la va a levantar el discovery de su propia zona cuando ZN entre al híbrido.
const shadowTodas = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2')
    .select('id, url, es_activa, zona').eq('tipo_operacion', 'alquiler').range(from, from + 999);
  if (error) { console.error('   ERROR leyendo shadow:', error.message); process.exit(1); }
  shadowTodas.push(...data);
  if (data.length < 1000) break;
}
const shadowRows = shadowTodas.filter((r) => ZONAS_EQ.has(r.zona));
const ajenas = shadowTodas.length - shadowRows.length;
const sinZona = shadowTodas.filter((r) => !r.zona).length;
if (ajenas) log(`   ℹ️  ${ajenas} props de otras zonas en shadow alquiler → fuera de este diff (las verifica su zona)`);
if (sinZona) log(`   ⚠️  ${sinZona} props en shadow SIN zona → fuera del diff (no se verifican). Revisar.`);
// Multiproyecto ya clasificados (mismo criterio que el cargador, línea ~192): van a
// `proyectos_detectados`, NO a shadow. Sin excluirlos reaparecen como "nuevas" cada corrida. (20-jul)
const { data: proyRows, error: errProy } = await sb.from('proyectos_detectados')
  .select('url').eq('macrozona', ZONA.macrozona);
if (errProy) { console.error('   ERROR leyendo proyectos_detectados:', errProy.message); process.exit(1); }
const proyUrls = new Set((proyRows || []).map((r) => r.url));

const shadowUrls = new Set(shadowRows.map((r) => r.url));
const portalUrls = new Set(portal.map((p) => p.url));
// NUEVAS = en el portal y NO en shadow (ni multiproyecto). SHADOW-RELATIVO: prod NO clasifica (mismo
// criterio que ventas, 20-jul). El portal es la fuente de verdad; se captura todo lo que shadow no tiene.
const nuevas = portal.filter((p) => !shadowUrls.has(p.url) && !proyUrls.has(p.url));

// ── SLUG REESCRITO POR C21 (4-ago-2026) — espejo de discovery-deptos.mjs ─────
// C21 arma la URL como /propiedad/<codigo>_<slug> y REESCRIBE el slug cuando el captador
// edita el aviso. Cambia la URL → entra como NUEVA y el mismo depto queda dos veces.
// 🔴 NO se filtran: se CAPTURAN (el precio nuevo es el vigente) y se marcan con
// `reemplaza_a`; el cargador deduplica la vieja al aplicar. Evidencia: 8/8 casos del
// histórico eran el mismo aviso, cero falsos positivos (verificado por HTTP el 4-ago).
const codigoC21 = (url) => (String(url || '').match(/\/propiedad\/(\d+)[_-]/) || [])[1] || null;
const porCodigoC21 = new Map();
for (const r of shadowTodas) {
  const c = codigoC21(r.url);
  if (c && !porCodigoC21.has(c)) porCodigoC21.set(c, r);
}
let reescritos = 0;
for (const nv of nuevas) {
  if (nv.fuente !== 'century21') continue;
  const c = codigoC21(nv.url);
  if (!c) continue;
  const vieja = porCodigoC21.get(c);
  if (!vieja || vieja.url === nv.url) continue;
  nv.reemplaza_a = { id: vieja.id, url: vieja.url, codigo_c21: c, zona_vieja: vieja.zona ?? null };
  reescritos++;
}
if (reescritos) {
  log(`   🔁 ${reescritos} con SLUG REESCRITO por C21 (mismo código, URL nueva) → se capturan y reemplazan a la vieja:`);
  for (const nv of nuevas.filter((n) => n.reemplaza_a)) {
    const cruzaZona = nv.reemplaza_a.zona_vieja && nv.reemplaza_a.zona_vieja !== zonaDe.get(nv.url);
    log(`      cod ${nv.reemplaza_a.codigo_c21}: id ${nv.reemplaza_a.id} → nueva URL${cruzaZona ? `  ⚠️ cambió de zona (${nv.reemplaza_a.zona_vieja} → ${zonaDe.get(nv.url)}), revisar` : ''}`);
  }
}

const desaparecidas = shadowRows.filter((r) => r.es_activa && !portalUrls.has(r.url)); // activas en SHADOW
const shadowActivas = shadowRows.filter((r) => r.es_activa).length;
log(`   → shadow alquiler: ${shadowRows.length} (${shadowActivas} activas) · multiproyecto ya clasificados: ${proyUrls.size}`);
log(`   → NUEVAS (portal, NO en shadow ni multiproyecto → se capturan): ${nuevas.length}`);
log(`   → desaparecidas (activas en SHADOW, no vistas → verificar): ${desaparecidas.length}\n`);

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(OUT, `${PREFIJO}${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), modo: 'DRY-RUN', tipo: TIPO, operacion: 'alquiler',
  // La zona viaja DENTRO del archivo: el verificador la chequea antes de dar bajas.
  zona: ZONA.id, zona_nombre: ZONA.nombre, microzonas: ZONA.zonas,
  resumen: {
    portal_bbox: portalBbox.length, portal_zona: portal.length,
    shadow: shadowRows.length, shadow_activas: shadowActivas,
    nuevas: nuevas.length, desaparecidas: desaparecidas.length,
    por_fuente: {
      c21: portal.filter((p) => p.fuente === 'century21').length,
      remax: portal.filter((p) => p.fuente === 'remax').length,
    },
  },
  // precio_raw + moneda = el CRUDO del listado (para el cargador --nuevas: alquiler NUNCA usa el precio_usd derivado)
  nuevas: nuevas.map((p) => ({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, zona: zonaDe.get(p.url), precio_raw: p.precio_raw, moneda: p.moneda, precio_usd: p.precio_usd, dorms: p.dorms, fecha_alta: p.fecha_alta ?? null, ...(p.reemplaza_a ? { reemplaza_a: p.reemplaza_a } : {}) })),
  desaparecidas: desaparecidas.map((r) => ({ id: r.id, url: r.url, zona: r.zona })),
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.`);
log(`  Portal: ${portal.length} (${ZONA.zonas.length} microzonas) · shadow alquiler activas (${ZONA.nombre}): ${shadowActivas}`);
log(`  Nuevas (no están en shadow): ${nuevas.length}${reescritos ? ` (${reescritos} son slug reescrito por C21 → reemplazan a una existente)` : ''} · Desaparecidas del híbrido a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}`);
log(`  📊 Tráfico: ${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy — se descuenta de los GB)' : ' (IP directa, $0)'}\n`);
