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
import { circuit } from '../sonda-suelo/lib/fetcher.mjs';

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
for (const p of await c21Listado(ZONA_KEY, TIPO, { log })) if (p.url && enZona(p.lat, p.lon, ZONA_KEY)) listings.push({ ...p, fuente: 'century21' });
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

// ---------- 3. DIFF vs propiedades_v2 (SELECT-only) ----------
log('3) Diff vs propiedades_v2 (deptos Equipetrol)…');
const dbRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2')
    .select('id, url, status, es_activa, latitud, longitud, zona')
    .ilike('tipo_propiedad_original', 'departamento')
    .in('zona', [...ZONAS_EQ])
    .range(from, from + 999);
  if (error) { console.error('   ERROR leyendo BD:', error.message); process.exit(1); }
  dbRows.push(...data);
  if (data.length < 1000) break;
}
const dbByUrl = new Map(dbRows.map((r) => [r.url, r]));
const portalUrls = new Set(portal.map((p) => p.url));
const nuevas = portal.filter((p) => !dbByUrl.has(p.url));
const existentes = portal.filter((p) => dbByUrl.has(p.url));
// desaparecidas: activas en BD (6 zonas) que el discovery NO vio → CANDIDATAS a baja (verificar, no bajar acá).
const desaparecidas = dbRows.filter((r) => r.es_activa && !portalUrls.has(r.url));
log(`   → en BD (deptos Eq): ${dbRows.length} (${dbRows.filter((r) => r.es_activa).length} activas)`);
log(`   → NUEVAS (portal, no en BD): ${nuevas.length}`);
log(`   → existentes (en ambas): ${existentes.length}`);
log(`   → desaparecidas (activas en BD, no vistas en portal → verificar): ${desaparecidas.length}\n`);

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(OUT, `discovery-deptos-${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), modo: 'DRY-RUN', tipo: TIPO,
  resumen: {
    portal_bbox: portalBbox.length, portal_zona: portal.length,
    bd: dbRows.length, bd_activas: dbRows.filter((r) => r.es_activa).length,
    nuevas: nuevas.length, existentes: existentes.length, desaparecidas: desaparecidas.length,
    por_fuente: {
      c21: portal.filter((p) => p.fuente === 'century21').length,
      remax: portal.filter((p) => p.fuente === 'remax').length,
    },
  },
  nuevas: nuevas.map((p) => ({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, zona: zonaDe.get(p.url), precio_usd: p.precio_usd, dorms: p.dorms })),
  existentes_urls: existentes.map((p) => p.url),
  desaparecidas: desaparecidas.map((r) => ({ id: r.id, url: r.url, status: r.status, zona: r.zona })),
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.`);
log(`  Portal: ${portal.length} (6 microzonas) · BD activas: ${dbRows.filter((r) => r.es_activa).length}`);
log(`  Nuevas: ${nuevas.length} · Desaparecidas a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}\n`);
