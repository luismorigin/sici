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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ZONA_KEY = 'equipetrol-deptos';
const TIPO = 'departamento';
const ZONAS_EQ = new Set(['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo']);
const FORCE = process.argv.includes('--force');
const log = (m) => console.log(m);

const COOLDOWN_MIN = 20;
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
try {
  const last = readdirSync(OUT).filter((x) => x.startsWith('discovery-alquiler')).sort().pop();
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
log(`\n🏢 DISCOVERY ALQUILER EQUIPETROL — DRY-RUN (read-only) · tipo=${TIPO} · operacion=alquiler · 6 microzonas\n`);

// ---------- 1. DISCOVERY ----------
log('1) Discovery (C21 renta + Remax alquiler, red ancha Equipetrol)…');
const listings = [];
for (const p of await c21Listado(ZONA_KEY, TIPO, { log, step: 0.005, operacion: 'renta' })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'century21' });
for (const p of await remaxListadoSC(TIPO, { log, operacion: 'alquiler' })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'remax' });
const byUrl = new Map();
for (const p of listings) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
const portalBbox = [...byUrl.values()];
log(`   → ${portalBbox.length} deptos únicos por URL dentro del bbox (${listings.length} listings crudos)\n`);

if (circuit.tripped) {
  // CLASIFICAR antes de avisar (ítem 2c-bis del CUTOVER_DATA_PLAN) — gemelo de discovery-deptos.
  // "IP bloqueada" a secas fue ENGAÑOSO el 20-jul (C21 estaba caído, DNS ENOTFOUND global).
  const dns = await import('node:dns');
  const resuelve = async (h) => { try { await dns.promises.lookup(h); return true; } catch { return false; } };
  const [c21Ok, remaxOk] = await Promise.all([resuelve('c21.com.bo'), resuelve('remax.bo')]);
  const diag = !c21Ok && !remaxOk ? 'NINGUNO de los dos portales resuelve DNS → caídos o problema de red propia'
    : !c21Ok ? 'C21 NO resuelve DNS → C21 caído (no es bloqueo de IP)'
    : !remaxOk ? 'Remax NO resuelve DNS → Remax caído (no es bloqueo de IP)'
    : 'ambos portales resuelven DNS → probable bloqueo de IP/proxy o rate-limit';

  console.error(`🛑 Discovery INCOMPLETO: circuit breaker (${circuit.fails} fallos seguidos).`);
  console.error(`   Diagnóstico: ${diag}`);
  console.error(`   Aborto para NO escribir un diff parcial (metería falsas "desaparecidas"). Reintentá más tarde.\n`);

  const { notificarSlack } = await import('./notificar-slack.mjs');
  await notificarSlack(
    `🛑 *Cron deptos-ALQUILER ABORTADO* (discovery)\n` +
    `Circuit breaker: ${circuit.fails} fallos seguidos.\n` +
    `Diagnóstico: ${diag}\n` +
    `*NO se escribió nada* — se aborta a propósito para no meter bajas falsas.\n` +
    `Se reintenta en la próxima corrida; el inventario no se pierde (el discovery es shadow-relativo).`
  );
  process.exit(1);
}

// ---------- 2. ZONA FINA ----------
log('2) Filtro de zona fina (get_zona_by_gps ∈ 6 microzonas)…');
const zonaDe = await clasificarZonas(portalBbox);
const portal = portalBbox.filter((p) => ZONAS_EQ.has(zonaDe.get(p.url)));
log(`   → ${portal.length} deptos en las 6 microzonas (${portalBbox.length - portal.length} descartados)\n`);

// ---------- 3. DIFF (SELECT-only, SOLO alquiler) — SHADOW-AWARE ----------
// El híbrido vive en SHADOW: NUEVAS excluyen lo ya cargado en shadow (sin esto se reprocesan cada
// corrida); DESAPARECIDAS se miden contra SHADOW, no contra prod (prod acumula stale → ruido).
log('3) Diff SHADOW-AWARE alquiler (prod clasifica nuevas/existentes; shadow filtra ya-cargadas + mide desaparecidas)…');
const dbRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2')
    .select('url, es_activa').eq('tipo_operacion', 'alquiler')
    .ilike('tipo_propiedad_original', 'departamento')
    .in('zona', [...ZONAS_EQ]).range(from, from + 999);
  if (error) { console.error('   ERROR leyendo prod:', error.message); process.exit(1); }
  dbRows.push(...data);
  if (data.length < 1000) break;
}
// SHADOW (alquiler): lo que el híbrido YA cargó (existentes migradas + nuevas con id 8M)
const shadowRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2_shadow')
    .select('id, url, es_activa, zona').eq('tipo_operacion', 'alquiler').range(from, from + 999);
  if (error) { console.error('   ERROR leyendo shadow:', error.message); process.exit(1); }
  shadowRows.push(...data);
  if (data.length < 1000) break;
}
// Multiproyecto ya clasificados (mismo criterio que el cargador, línea ~192): van a
// `proyectos_detectados`, NO a shadow. Sin excluirlos reaparecen como "nuevas" cada corrida. (20-jul)
const { data: proyRows, error: errProy } = await sb.from('proyectos_detectados')
  .select('url').eq('macrozona', 'equipetrol');
if (errProy) { console.error('   ERROR leyendo proyectos_detectados:', errProy.message); process.exit(1); }
const proyUrls = new Set((proyRows || []).map((r) => r.url));

const dbUrls = new Set(dbRows.map((r) => r.url));
const shadowUrls = new Set(shadowRows.map((r) => r.url));
const portalUrls = new Set(portal.map((p) => p.url));
// NUEVAS = en el portal y NO en shadow (ni multiproyecto). SHADOW-RELATIVO: prod NO clasifica (mismo
// criterio que ventas, 20-jul). El portal es la fuente de verdad; se captura todo lo que shadow no tiene.
const nuevas = portal.filter((p) => !shadowUrls.has(p.url) && !proyUrls.has(p.url));
const existentes = portal.filter((p) => dbUrls.has(p.url));  // informativo (prod ya no clasifica)
const desaparecidas = shadowRows.filter((r) => r.es_activa && !portalUrls.has(r.url)); // activas en SHADOW
const dbActivas = dbRows.filter((r) => r.es_activa).length;
const shadowActivas = shadowRows.filter((r) => r.es_activa).length;
log(`   → shadow alquiler: ${shadowRows.length} (${shadowActivas} activas) · multiproyecto ya clasificados: ${proyUrls.size} · [info] prod: ${dbRows.length} (${dbActivas} activas)`);
log(`   → NUEVAS (portal, NO en shadow ni multiproyecto → se capturan): ${nuevas.length}`);
log(`   → [info] del portal ya en prod (no afecta la captura): ${existentes.length}`);
log(`   → desaparecidas (activas en SHADOW, no vistas → verificar): ${desaparecidas.length}\n`);

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(OUT, `discovery-alquiler-${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), modo: 'DRY-RUN', tipo: TIPO, operacion: 'alquiler',
  resumen: {
    portal_bbox: portalBbox.length, portal_zona: portal.length,
    prod: dbRows.length, prod_activas: dbActivas, shadow: shadowRows.length, shadow_activas: shadowActivas,
    nuevas: nuevas.length, existentes: existentes.length, desaparecidas: desaparecidas.length,
    por_fuente: {
      c21: portal.filter((p) => p.fuente === 'century21').length,
      remax: portal.filter((p) => p.fuente === 'remax').length,
    },
  },
  // precio_raw + moneda = el CRUDO del listado (para el cargador --nuevas: alquiler NUNCA usa el precio_usd derivado)
  nuevas: nuevas.map((p) => ({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, zona: zonaDe.get(p.url), precio_raw: p.precio_raw, moneda: p.moneda, precio_usd: p.precio_usd, dorms: p.dorms, fecha_alta: p.fecha_alta ?? null })),
  existentes_urls: existentes.map((p) => p.url),
  desaparecidas: desaparecidas.map((r) => ({ id: r.id, url: r.url, zona: r.zona })),
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.`);
log(`  Portal: ${portal.length} (6 microzonas) · shadow alquiler activas: ${shadowActivas}`);
log(`  Nuevas (ni prod ni shadow): ${nuevas.length} · Desaparecidas del híbrido a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}`);
log(`  📊 Tráfico: ${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy — se descuenta de los GB)' : ' (IP directa, $0)'}\n`);
