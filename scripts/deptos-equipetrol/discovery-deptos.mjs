// ============================================================================
// DISCOVERY DEPTOS EQUIPETROL — ORQUESTADOR · FASE DRY-RUN (read-only)
// ----------------------------------------------------------------------------
// El front-end de discovery que le FALTABA al híbrido: sale a los portales él
// mismo (NO hereda la discovery de n8n). Contenido a: tipo=departamento ×
// operacion=venta × las 6 microzonas Equipetrol. NO toca casas/terrenos (el
// c21Listado filtra por tipo), NO toca Zona Norte, NO escribe a la BD.
//
// Etapas (todas READ-ONLY):
//   1. Discovery  → c21Listado + remaxListadoSC (tipo=departamento), red ancha 'equipetrol-deptos'
//   2. Zona fina  → get_zona_by_gps por hit → SOLO las 6 microzonas (canónico, no bbox)
//   3. Diff vs BD → nuevas / existentes / desaparecidas (SELECT-only contra propiedades_v2)
//   4. Salida     → consola + output/discovery-deptos-<ts>.json
//
// Etapas PENDIENTES (siguiente fase): detalle de las nuevas → MOAT (lector) →
//   matching → UPSERT a propiedades_v2_shadow (--apply, service_role) + verificador
//   sobre las desaparecidas. Reusa lib/detalle-deptos.mjs + READER_SPEC + matcher.
//
// Uso:
//   node discovery-deptos.mjs            -> dry-run (discovery + zona + diff)
//   node discovery-deptos.mjs --force    -> saltea el cooldown anti-bloqueo
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

const ZONA_KEY = 'equipetrol-deptos';          // red ancha (bbox de las 6 microzonas)
const TIPO = 'departamento';
const ZONAS_EQ = new Set(['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo']);
const FORCE = process.argv.includes('--force');
const log = (m) => console.log(m);

// COOLDOWN anti-stacking (igual que casas): re-crawlear seguido desde tu IP puede bloquearla.
const COOLDOWN_MIN = 20;
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
try {
  const last = readdirSync(OUT).filter((x) => x.startsWith('discovery-deptos')).sort().pop();
  if (last && !FORCE) {
    const ageMin = (Date.now() - statSync(join(OUT, last)).mtimeMs) / 60000;
    if (ageMin < COOLDOWN_MIN) {
      console.log(`\n⏳ Última corrida hace ${ageMin.toFixed(0)} min (< ${COOLDOWN_MIN}). Re-crawlear tan seguido puede bloquear tu IP. Esperá o usá --force.\n`);
      process.exit(0);
    }
  }
} catch { /* primera corrida */ }

// Clasifica una lista de puntos por get_zona_by_gps (en paralelo por chunks para no saturar).
async function clasificarZonas(items) {
  const CHUNK = 20;
  const res = new Map();
  for (let i = 0; i < items.length; i += CHUNK) {
    const slice = items.slice(i, i + CHUNK);
    const out = await Promise.all(slice.map(async (p) => {
      const { data, error } = await sb.rpc('get_zona_by_gps', { p_lat: p.lat, p_lon: p.lon });
      // get_zona_by_gps devuelve una FILA vía PostgREST: [{ zona: '...' }] (no un string).
      return [p.url, error ? null : (Array.isArray(data) ? data[0]?.zona : data?.zona ?? data) ?? null];
    }));
    for (const [url, zona] of out) res.set(url, zona);
  }
  return res;
}

// ============================== MAIN ==============================
log(`\n🏢 DISCOVERY DEPTOS EQUIPETROL — DRY-RUN (read-only) · tipo=${TIPO} · 6 microzonas\n`);

// ---------- 1. DISCOVERY ----------
log('1) Discovery (C21 + Remax, red ancha Equipetrol)…');
const listings = [];
for (const p of await c21Listado(ZONA_KEY, TIPO, { log, step: 0.005 })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'century21' });
for (const p of await remaxListadoSC(TIPO, { log })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'remax' });
const byUrl = new Map();
for (const p of listings) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
const portalBbox = [...byUrl.values()];
log(`   → ${portalBbox.length} deptos únicos por URL dentro del bbox (${listings.length} listings crudos)\n`);

if (circuit.tripped) {
  console.error(`🛑 Discovery INCOMPLETO: circuit breaker (${circuit.fails} fallos) — IP probablemente bloqueada.`);
  console.error(`   Aborto para NO escribir un diff parcial (metería falsas "desaparecidas"). Reintentá en unas horas.\n`);
  process.exit(1);
}

// ---------- 2. ZONA FINA (canónico, no bbox) ----------
log('2) Filtro de zona fina (get_zona_by_gps ∈ 6 microzonas)…');
const zonaDe = await clasificarZonas(portalBbox);
const portal = portalBbox.filter((p) => ZONAS_EQ.has(zonaDe.get(p.url)));
log(`   → ${portal.length} deptos en las 6 microzonas (${portalBbox.length - portal.length} descartados: fuera de Equipetrol / sin zona)\n`);

// ---------- 3. DIFF (SELECT-only) — SHADOW-AWARE ----------
// El híbrido vive en SHADOW, no en prod. Por eso: (a) las NUEVAS excluyen lo ya cargado en
// shadow (sin esto se reprocesan cada corrida); (b) las DESAPARECIDAS se miden contra SHADOW,
// no contra prod (prod acumula stale + otras operaciones → 91% era ruido, medido 13-jul).
log('3) Diff SHADOW-AWARE (prod clasifica nuevas/existentes; shadow filtra ya-cargadas y mide desaparecidas)…');
const dbRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2')
    .select('url, es_activa').ilike('tipo_propiedad_original', 'departamento')
    .in('zona', [...ZONAS_EQ]).range(from, from + 999);
  if (error) { console.error('   ERROR leyendo prod:', error.message); process.exit(1); }
  dbRows.push(...data);
  if (data.length < 1000) break;
}
// SHADOW (venta): lo que el híbrido YA cargó (existentes migradas + nuevas con id 8M)
const shadowRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2_shadow')
    .select('id, url, es_activa, zona').eq('tipo_operacion', 'venta').range(from, from + 999);
  if (error) { console.error('   ERROR leyendo shadow:', error.message); process.exit(1); }
  shadowRows.push(...data);
  if (data.length < 1000) break;
}
// MULTIPROYECTO YA CLASIFICADOS: los avisos-proyecto (brochures) NO van a shadow — van a
// `proyectos_detectados` (mig 273). Sin excluirlos acá reaparecen como "nuevas" TODAS las noches,
// para siempre, y el conteo crece solo (medido 20-jul: 38 de 40 "nuevas" eran esto → el reporte
// mentía 20×). El CARGADOR ya los excluía (cargar-deptos-shadow.mjs, --nuevas); el discovery no.
const { data: proyRows, error: errProy } = await sb.from('proyectos_detectados')
  .select('url').eq('macrozona', 'equipetrol');
if (errProy) { console.error('   ERROR leyendo proyectos_detectados:', errProy.message); process.exit(1); }
const proyUrls = new Set((proyRows || []).map((r) => r.url));

const dbUrls = new Set(dbRows.map((r) => r.url));
const shadowUrls = new Set(shadowRows.map((r) => r.url));
const portalUrls = new Set(portal.map((p) => p.url));
// NUEVAS = en el portal y NO en shadow (ni multiproyecto ya clasificado). SHADOW-RELATIVO: prod NO
// participa de la clasificación. El portal es la fuente de verdad; el híbrido captura todo lo que el
// portal muestra y shadow no tiene todavía — sin depender del inventario viejo de n8n. Antes se excluía
// `!dbUrls` (en prod) → los ~18 que estaban en prod pero no en shadow quedaban huérfanos, esperando al
// `--prep`. Al sacar esa exclusión, entran por `--nuevas` y el drenado desde prod se retira. (20-jul)
const nuevas = portal.filter((p) => !shadowUrls.has(p.url) && !proyUrls.has(p.url));
// existentes-en-prod: informativo (no afecta la captura; prod ya no clasifica). Útil solo para ver
// cuánto del portal coincide con el inventario viejo mientras n8n siga vivo.
const existentes = portal.filter((p) => dbUrls.has(p.url));
// DESAPARECIDAS = activas en SHADOW no vistas en el portal (lo del híbrido; NO la stale de prod)
const desaparecidas = shadowRows.filter((r) => r.es_activa && !portalUrls.has(r.url));
const dbActivas = dbRows.filter((r) => r.es_activa).length;
const shadowActivas = shadowRows.filter((r) => r.es_activa).length;
log(`   → shadow venta: ${shadowRows.length} (${shadowActivas} activas) · multiproyecto ya clasificados: ${proyUrls.size} · [info] prod: ${dbRows.length} (${dbActivas} activas)`);
log(`   → NUEVAS (portal, NO en shadow ni multiproyecto → se capturan): ${nuevas.length}`);
log(`   → [info] del portal ya en prod (no afecta la captura): ${existentes.length}`);
log(`   → desaparecidas (activas en SHADOW, no vistas → verificar): ${desaparecidas.length}\n`);

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(OUT, `discovery-deptos-${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), modo: 'DRY-RUN', tipo: TIPO,
  resumen: {
    portal_bbox: portalBbox.length, portal_zona: portal.length,
    prod: dbRows.length, prod_activas: dbActivas, shadow: shadowRows.length, shadow_activas: shadowActivas,
    nuevas: nuevas.length, existentes: existentes.length, desaparecidas: desaparecidas.length,
    por_fuente: {
      c21: portal.filter((p) => p.fuente === 'century21').length,
      remax: portal.filter((p) => p.fuente === 'remax').length,
    },
  },
  nuevas: nuevas.map((p) => ({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, zona: zonaDe.get(p.url), precio_usd: p.precio_usd, dorms: p.dorms, fecha_alta: p.fecha_alta ?? null })),
  existentes_urls: existentes.map((p) => p.url),
  desaparecidas: desaparecidas.map((r) => ({ id: r.id, url: r.url, zona: r.zona })),
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.`);
log(`  Portal: ${portal.length} (6 microzonas) · shadow venta activas: ${shadowActivas}`);
log(`  Nuevas (ni prod ni shadow): ${nuevas.length} · Desaparecidas del híbrido a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}`);
log(`  📊 Tráfico: ${trafico.resumen()}${process.env.PROXY_URL ? ' (por proxy — se descuenta de los GB)' : ' (IP directa, $0)'}\n`);
