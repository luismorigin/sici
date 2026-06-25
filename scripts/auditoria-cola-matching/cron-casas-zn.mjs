// ============================================================================
// CRON CASAS ZN (venta) — ORQUESTADOR · FASE DRY-RUN (read-only)
// ----------------------------------------------------------------------------
// Contenido a: tipo=casa × operacion=venta × zona=Zona Norte. NO toca deptos,
// NO toca Equipetrol, NO toca terrenos, NO toca otras macrozonas.
//
// Etapas implementadas (todas READ-ONLY, no escriben a la BD):
//   1. Discovery  → c21Listado + remaxListadoSC, filtrado por polígono ZN (reusa sonda-suelo/lib)
//   2. Diff vs BD → nuevas / existentes / desaparecidas (select-only contra propiedades_v2)
//   3. Detalle    → de las NUEVAS: descripción + contacto + precio + fotos/fecha/código
//   4. Reporte    → consola + output/cron-casas-dryrun-<ts>.json
//
// Etapas PENDIENTES (fase siguiente, requieren agente y/o service_role):
//   5. MOAT (agente-lector) sobre las nuevas → amenidades/condominio/precio_billete/TC
//   6. matchear_condominio(lat,lon,nombre)
//   7. UPSERT a propiedades_v2 (onConflict url,fuente, respetando candados)  ← --apply, service_role
//   8. Verificador sobre las "desaparecidas" (baja real solo tras confirmar)
//
// Uso:
//   node cron-casas-zn.mjs                 -> dry-run completo (discovery + diff + detalle de nuevas)
//   node cron-casas-zn.mjs --limit=10      -> limita el fetch de detalle de nuevas (test rápido)
//   node cron-casas-zn.mjs --no-detalle    -> solo discovery + diff (sin fetch de detalle)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { c21Listado, remaxListadoSC } from '../sonda-suelo/lib/portales.mjs';
import { enZona } from '../sonda-suelo/lib/zonas.mjs';
import { sleep } from '../sonda-suelo/lib/fetcher.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const ZONA = 'zona-norte';
const NO_DET = process.argv.includes('--no-detalle');
const LIMIT = (() => { const a = process.argv.find(x => x.startsWith('--limit=')); return a ? Number(a.split('=')[1]) : null; })();
const log = (m) => console.log(m);

// ---------- helpers de extracción de detalle (lógica probada de nuevas-paso2 + extraerCampos) ----------
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const telNorm = (t) => { if (!t) return null; let d = String(t).replace(/[^0-9]/g, ''); if (d.startsWith('591')) d = d.slice(3); d = d.replace(/^0+/, ''); return d.length >= 7 ? `+591${d}` : null; };
const uniq = (a) => [...new Set(a.filter(Boolean))];
const numOr = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };
const fechaDesdeDias = (dias) => {
  const n = Number(dias);
  if (!Number.isFinite(n) || n < 0 || n > 3000) return null;
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
};
// C21: el precio del listado/detalle puede venir corrupto en la moneda → elegir candidato con $/m² coherente
const pickPrecioC21 = (e) => {
  const m2 = Number(e.m2C) || Number(e.m2T) || 0;
  const c = [Number(e.precio), Number(e.precioVenta), Number(e.precioVenta) / 6.96].filter(v => v > 1000);
  if (!m2) return c.sort((a, b) => b - a)[0] ?? null;
  const ok = c.filter(v => v / m2 >= 400 && v / m2 <= 2500);
  return (ok.length ? ok.sort((a, b) => b - a)[0] : (c.sort((a, b) => b - a)[0] ?? null));
};

async function detalleC21(url) {
  const r = await fetch(`${url}?json=true`, { headers: UA });
  const j = await r.json();
  const e = j.entity || j.data?.entity || j;
  const tel = telNorm(e.whatsapp || e.usuatelMovil);
  const fotos = uniq((Array.isArray(j.fotos) && j.fotos.length ? j.fotos : (j.fotosNew || [])).map(f => f.large || f.large1 || f.path));
  return {
    descripcion: (e.descripcion || j.descripcionMeta || '').trim() || null,
    area_const_m2: numOr(e.m2C), area_terreno_m2: numOr(e.m2T),
    dorms: numOr(e.recamaras), banos: numOr(e.banios ?? e.banos),
    agente_nombre: [e.usname, e.apellidoP, e.apellidoM].filter(Boolean).join(' ').trim() || null,
    agente_telefono: tel, oficina_nombre: e.nombreOfna || null, oficina_telefono: telNorm(e.telefonoOfna || e.usuatelOfna),
    contacto_visible: e.mostrarTelCelularEnInternet !== false,
    precio_fuente_usd: pickPrecioC21(e),
    fotos_urls: fotos, cantidad_fotos: fotos.length,
    fecha_publicacion: fechaDesdeDias(e.dias) || (e.fechaModificacion?.date ? e.fechaModificacion.date.slice(0, 10) : null),
    codigo_propiedad: e.clave || (e.id != null ? String(e.id) : null),
    estacionamientos: Number(e.estacionamientos) || (e.estacionamientos === 0 ? 0 : null),
  };
}
async function detalleRemax(url) {
  const r = await fetch(url, { headers: UA });
  const html = await r.text();
  const m = html.match(/data-page="([^"]+)"/); if (!m) throw new Error('sin data-page');
  const props = JSON.parse(dec(m[1])).props;
  const l = props.listing || {}; const a = props.agent || {}; const li = l.listing_information || {};
  const tel = telNorm(a.user?.phone_number);
  const fotos = uniq((l.multimedias || []).map(x => x.large_url || x.link));
  return {
    descripcion: (l.description_website || l.marketing_description || '').trim() || null,
    area_const_m2: numOr(li.construction_area_m), area_terreno_m2: numOr(li.land_m2),
    dorms: numOr(li.number_bedrooms), banos: numOr(li.number_bathrooms),
    agente_nombre: a.user?.name_to_show || null, agente_telefono: tel,
    oficina_nombre: a.office?.name || null, oficina_telefono: null, contacto_visible: true,
    precio_fuente_usd: l.price != null ? numOr(l.price) : null,
    fotos_urls: fotos, cantidad_fotos: fotos.length,
    fecha_publicacion: l.date_of_listing || (l.created_at ? l.created_at.slice(0, 10) : null),
    codigo_propiedad: l.MLSID || l.reference || l.key || null,
    estacionamientos: null,
  };
}
const detalleCasa = (url, fuente) => (fuente === 'c21' ? detalleC21(url) : detalleRemax(url));

// ============================== MAIN ==============================
log(`\n🏠 CRON CASAS ZN — DRY-RUN (read-only)  ·  zona=${ZONA} · tipo=casa · operacion=venta\n`);

// ---------- 1. DISCOVERY ----------
log('1) Discovery (C21 + Remax, filtrado por polígono ZN)…');
const listings = [];
for (const p of await c21Listado(ZONA, 'casa', { log })) if (p.url && enZona(p.lat, p.lon, ZONA)) listings.push({ ...p, fuente: 'c21' });
for (const p of await remaxListadoSC('casa', { log })) if (p.url && enZona(p.lat, p.lon, ZONA)) listings.push({ ...p, fuente: 'remax' });
const byUrl = new Map();
for (const p of listings) if (!byUrl.has(p.url)) byUrl.set(p.url, p);
const portal = [...byUrl.values()];
log(`   → portal: ${portal.length} casas ZN únicas por URL (${listings.length} listings crudos)\n`);

// ---------- 2. DIFF vs BD (select-only) ----------
log('2) Diff vs propiedades_v2 (casas)…');
const { data: dbRows, error } = await sb.from('propiedades_v2')
  .select('id, url, status, es_activa').eq('tipo_propiedad_original', 'casa');
if (error) { console.error('   ERROR leyendo BD:', error.message); process.exit(1); }
const dbByUrl = new Map(dbRows.map(r => [r.url, r]));
const portalUrls = new Set(portal.map(p => p.url));
const nuevas = portal.filter(p => !dbByUrl.has(p.url));
const existentes = portal.filter(p => dbByUrl.has(p.url));
const desaparecidas = dbRows.filter(r => r.es_activa && !portalUrls.has(r.url));
log(`   → en BD (casas): ${dbRows.length} (${dbRows.filter(r => r.es_activa).length} activas)`);
log(`   → NUEVAS (en portal, no en BD): ${nuevas.length}`);
log(`   → existentes (en ambas): ${existentes.length}`);
log(`   → desaparecidas (activas en BD, no vistas en portal → CANDIDATAS A BAJA, verificar): ${desaparecidas.length}\n`);

// ---------- 3. DETALLE de las NUEVAS ----------
let detalladas = [];
if (!NO_DET && nuevas.length) {
  const target = LIMIT ? nuevas.slice(0, LIMIT) : nuevas;
  log(`3) Detalle de ${target.length} nuevas${LIMIT ? ` (--limit=${LIMIT})` : ''}…`);
  let okTel = 0, okDesc = 0, okFotos = 0;
  for (const [i, p] of target.entries()) {
    try {
      const d = await detalleCasa(p.url, p.fuente);
      const rec = { ...p, ...d, fetch_ok: true };
      detalladas.push(rec);
      if (d.agente_telefono) okTel++;
      if ((d.descripcion || '').length > 50) okDesc++;
      if (d.fotos_urls.length) okFotos++;
    } catch (e) {
      detalladas.push({ url: p.url, fuente: p.fuente, lat: p.lat, lon: p.lon, fetch_ok: false, error: e.message });
    }
    if ((i + 1) % 20 === 0) log(`   …${i + 1}/${target.length}`);
    await sleep(300);
  }
  const n = detalladas.filter(d => d.fetch_ok).length || 1;
  log(`   → detalle OK: ${detalladas.filter(d => d.fetch_ok).length}/${target.length}  ·  con tel: ${okTel} (${Math.round(okTel / n * 100)}%)  ·  desc>50: ${okDesc}  ·  con fotos: ${okFotos}\n`);
} else {
  log('3) Detalle SALTADO (--no-detalle o 0 nuevas)\n');
}

// ---------- 4. SALIDA ----------
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = join(__dirname, 'output'); mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `cron-casas-dryrun-${ts}.json`);
writeFileSync(outPath, JSON.stringify({
  generado: new Date().toISOString(), zona: ZONA, modo: 'DRY-RUN',
  resumen: { portal: portal.length, bd_casas: dbRows.length, bd_activas: dbRows.filter(r => r.es_activa).length,
    nuevas: nuevas.length, existentes: existentes.length, desaparecidas: desaparecidas.length },
  nuevas, existentes_urls: existentes.map(p => p.url),
  desaparecidas: desaparecidas.map(r => ({ id: r.id, url: r.url, status: r.status })),
  detalladas,
}, null, 2), 'utf8');

log('='.repeat(64));
log(`  DRY-RUN listo. NO se escribió nada a la BD.`);
log(`  Nuevas a cargar: ${nuevas.length} · Desaparecidas a verificar: ${desaparecidas.length}`);
log(`  💾 ${outPath}`);
log(`\n  Siguiente fase (NO en este script): MOAT (agente) sobre las nuevas → amenidades/condominio/precio_billete/TC,`);
log(`  matchear_condominio, y UPSERT (--apply, service_role) + verificador sobre las desaparecidas.\n`);
