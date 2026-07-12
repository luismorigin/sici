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
import { circuit } from '../sonda-suelo/lib/fetcher.mjs';

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
  console.error(`🛑 Discovery INCOMPLETO: circuit breaker (${circuit.fails} fallos) — IP probablemente bloqueada.`);
  console.error(`   Aborto para NO escribir un diff parcial (metería falsas "desaparecidas"). Reintentá en unas horas.\n`);
  process.exit(1);
}

// ---------- 2. ZONA FINA ----------
log('2) Filtro de zona fina (get_zona_by_gps ∈ 6 microzonas)…');
const zonaDe = await clasificarZonas(portalBbox);
const portal = portalBbox.filter((p) => ZONAS_EQ.has(zonaDe.get(p.url)));
log(`   → ${portal.length} deptos en las 6 microzonas (${portalBbox.length - portal.length} descartados)\n`);

// ---------- 3. DIFF vs propiedades_v2 (SELECT-only, SOLO alquiler) ----------
log('3) Diff vs propiedades_v2 (deptos ALQUILER Equipetrol)…');
const dbRows = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('propiedades_v2')
    .select('id, url, status, es_activa, latitud, longitud, zona')
    .eq('tipo_operacion', 'alquiler')                       // ← clave: solo alquiler (venta tiene otras URLs)
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
const desaparecidas = dbRows.filter((r) => r.es_activa && !portalUrls.has(r.url));
log(`   → en BD (alquiler Eq): ${dbRows.length} (${dbRows.filter((r) => r.es_activa).length} activas)`);
log(`   → NUEVAS (portal, no en BD): ${nuevas.length}`);
log(`   → existentes (en ambas): ${existentes.length}`);
log(`   → desaparecidas (activas en BD, no vistas → verificar): ${desaparecidas.length}\n`);

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outPath = join(OUT, `discovery-alquiler-${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), modo: 'DRY-RUN', tipo: TIPO, operacion: 'alquiler',
  resumen: {
    portal_bbox: portalBbox.length, portal_zona: portal.length,
    bd: dbRows.length, bd_activas: dbRows.filter((r) => r.es_activa).length,
    nuevas: nuevas.length, existentes: existentes.length, desaparecidas: desaparecidas.length,
    por_fuente: {
      c21: portal.filter((p) => p.fuente === 'century21').length,
      remax: portal.filter((p) => p.fuente === 'remax').length,
    },
  },
  nuevas: nuevas.map((p) => ({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, zona: zonaDe.get(p.url), precio_usd: p.precio_usd, dorms: p.dorms, fecha_alta: p.fecha_alta ?? null })),
  existentes_urls: existentes.map((p) => p.url),
  desaparecidas: desaparecidas.map((r) => ({ id: r.id, url: r.url, status: r.status, zona: r.zona })),
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.`);
log(`  Portal: ${portal.length} (6 microzonas) · BD alquiler activas: ${dbRows.filter((r) => r.es_activa).length}`);
log(`  Nuevas: ${nuevas.length} · Desaparecidas a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}\n`);
