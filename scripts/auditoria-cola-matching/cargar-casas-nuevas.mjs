// ============================================================================
// CARGAR CASAS NUEVAS ZN — generador de upsert (INSERT-only)  ·  contenido a casas ZN
// ----------------------------------------------------------------------------
// Toma las casas NUEVAS detalladas (output del cron) + el MOAT (moat-output.json)
// y las inserta en propiedades_v2 con el contrato canónico de casas.
//
// SEGURIDAD (esta es la pieza que escribe — diseñada para que un no-técnico
// no tenga que leer SQL):
//   - INSERT-only vía upsert ignoreDuplicates (ON CONFLICT (url,fuente) DO NOTHING):
//     NUNCA pisa deptos ni casas ya cargadas. La constraint frena cualquier dup.
//   - Solo carga casas ACEPTADAS por el gate MOAT y con PRECIO EN EL TEXTO.
//     Las sin precio confiable se RETIENEN para revisión manual (no se inventan precios).
//   - Dry-run por default: imprime resumen legible + escribe upsert-preview.json. NO escribe.
//   - --apply: inserta y verifica (conteos + aislamiento).
//
// Uso:
//   node cargar-casas-nuevas.mjs            -> DRY-RUN (resumen, no escribe)
//   node cargar-casas-nuevas.mjs --apply    -> inserta (service_role) + verifica
//
// moatToRow(): contrato único MOAT -> fila. Ver sql/schema/propiedades_v2_schema.md
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const OUT = join(__dirname, 'output');
const HOY_ISO = new Date().toISOString();
// MOAT estado (texto libre) -> enum estado_construccion_enum de la COLUMNA (lo no-mapeable queda null)
const ESTADO_MAP = { nueva: 'nuevo_a_estrenar', usada: 'usado', remodelada: 'usado', para_demolicion: null };
const slugDe = (u) => { const m = String(u).match(/\/propiedad\/([^?]+)/); return m ? m[1] : String(u).split('/').pop(); };

// ---------- inputs ----------
const cronFile = readdirSync(OUT).filter(x => x.startsWith('cron-casas-dryrun')).sort().pop();
if (!cronFile) { console.error('No hay output del cron. Corré cron-casas-zn.mjs primero.'); process.exit(1); }
const cron = JSON.parse(readFileSync(join(OUT, cronFile), 'utf8'));
const moat = JSON.parse(readFileSync(join(OUT, 'moat-output.json'), 'utf8'));
const detBySlug = new Map(cron.detalladas.filter(d => d.fetch_ok).map(d => [slugDe(d.url), d]));

// ---------- moatToRow: contrato único MOAT + detalle -> fila propiedades_v2 ----------
async function matchCondominio(lat, lon, nombre) {
  const { data, error } = await sb.rpc('matchear_condominio', { p_lat: lat, p_lon: lon, p_nombre: nombre || null });
  if (error) { console.warn(`   ⚠️ matchear_condominio: ${error.message}`); return null; }
  return (data && data.length) ? data[0] : null;
}

async function moatToRow(m, d) {
  const cond = m.es_condominio_cerrado ? await matchCondominio(d.lat, d.lon, m.nombre_condominio_mencionado) : null;
  const tc = m.tipo_cambio_detectado || 'no_especificado';
  const enr = {
    agente_nombre: d.agente_nombre || null,
    agente_telefono: d.agente_telefono || null,
    url_whatsapp: d.url_whatsapp || (d.agente_telefono ? `https://wa.me/${d.agente_telefono.replace('+', '')}` : null),
    oficina_nombre: d.oficina_nombre || null,
    oficina_telefono: d.oficina_telefono || null,
    contacto_visible: d.contacto_visible !== false,
    fotos_urls: d.fotos_urls || [],
    cantidad_fotos: (d.fotos_urls || []).length,
    descripcion: d.descripcion || null,
    codigo_propiedad: d.codigo_propiedad || null,
    fecha_publicacion: d.fecha_publicacion || null,
    estacionamientos: d.estacionamientos ?? null,
    // MOAT (claves canónicas de BD, mapeadas desde v4)
    amenidades: m.amenidades || [],
    amenidades_condominio: m.amenidades_condominio || [],
    caracteristicas_extra: m.caracteristicas_extra || [],
    es_cerrado: !!m.es_condominio_cerrado,
    estado_construccion: m.estado || null,           // string MOAT (la COLUMNA queda null)
    nombre_condominio_detectado: m.nombre_condominio_mencionado || null,
    fuente_enrichment: 'cron_casas_zn',
  };
  const row = {
    url: d.url, fuente: d.fuente, tipo_operacion: 'venta', tipo_propiedad_original: 'casa',
    latitud: d.lat, longitud: d.lon,
    area_total_m2: d.area_const_m2 ?? null, area_terreno_m2: d.area_terreno_m2 ?? null,
    dormitorios: d.dorms ?? null, banos: d.banos ?? null, estacionamientos: d.estacionamientos ?? null,
    precio_usd: m.precio_billete_usd,                 // BILLETE (del MOAT, leído del texto)
    moneda_original: 'USD',
    tipo_cambio_detectado: tc,
    depende_de_tc: tc === 'paralelo' || tc === 'oficial',
    estado_construccion: ESTADO_MAP[m.estado] ?? null, // COLUMNA enum (mapeada del MOAT; null si no mapea)
    // fecha_publicacion: la vista v_mercado_casas filtra dias_en_mercado = CURRENT_DATE
    // - COALESCE(fecha_publicacion, fecha_discovery). SIN esto la casa queda fuera del feed.
    fecha_publicacion: d.fecha_publicacion || null,
    fecha_discovery: HOY_ISO,                          // fallback para que dias_en_mercado compute
    status: 'completado', es_activa: true,
    id_condominio_master: cond ? Number(cond.id_condominio_master) : null,
    metodo_match: 'cron_casas_zn',
    datos_json_enrichment: enr,
  };
  return { row, cond };
}

// ---------- clasificar las MOAT-aceptadas ----------
const aCargar = [], retenidas = [], rechazadas = [], sinDetalle = [];
for (const m of moat.resultados) {
  if (!m.gate?.acepta) { rechazadas.push(m); continue; }
  const d = detBySlug.get(m.slug);
  if (!d) { sinDetalle.push(m); continue; }                 // MOAT aceptada pero no en el detalle actual
  if (!m.precio_en_texto || !m.precio_billete_usd) { retenidas.push({ m, d }); continue; } // sin precio confiable
  aCargar.push({ m, d });
}

console.log(`\n🏠 CARGAR CASAS NUEVAS ZN — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
console.log(`   input cron: ${cronFile}  ·  MOAT aceptadas: ${moat.resultados.filter(r => r.gate?.acepta).length}\n`);

// ---------- construir filas + reporte legible ----------
const filas = [];
for (const { m, d } of aCargar) {
  const { row, cond } = await moatToRow(m, d);
  filas.push(row);
  const condTxt = cond ? `condominio ${cond.nombre_oficial} (#${cond.id_condominio_master})` : (m.es_condominio_cerrado ? 'cerrado SIN match (curar catálogo)' : 'individual');
  console.log(`  ✅ ${row.dormitorios ?? '?'}dorm · ${row.area_total_m2 ?? '?'}m² constr · ${row.area_terreno_m2 ?? '?'}m² terr · $us ${row.precio_usd?.toLocaleString('en-US')} (${row.tipo_cambio_detectado}) · ${condTxt} · ${row.datos_json_enrichment.cantidad_fotos} fotos · tel ${row.datos_json_enrichment.agente_telefono ? 'sí' : 'NO'}`);
  console.log(`     ${row.url}`);
}

console.log(`\n  RESUMEN: ${filas.length} a cargar · ${retenidas.length} retenidas (sin precio en texto) · ${sinDetalle.length} sin detalle · ${rechazadas.length} rechazadas por gate`);
if (retenidas.length) console.log(`  ⏸️  Retenidas (revisar a mano): ${retenidas.map(r => r.m.slug).join(', ')}`);

writeFileSync(join(OUT, 'upsert-preview.json'), JSON.stringify({ generado: new Date().toISOString(), a_cargar: filas, retenidas: retenidas.map(r => r.m.slug) }, null, 2));
console.log(`  💾 preview: output/upsert-preview.json`);

// ---------- APPLY ----------
if (!APPLY) {
  console.log(`\n  (DRY-RUN: no se escribió nada. Revisar el resumen y correr con --apply.)\n`);
  process.exit(0);
}

// baseline ANTES de escribir (para verificar por delta que las nuevas llegan al feed)
const { count: feedAntes } = await sb.from('v_mercado_casas').select('*', { count: 'exact', head: true });

console.log(`\n  Escribiendo (INSERT-only, ON CONFLICT DO NOTHING)…`);
let ins = 0, skip = 0, err = 0; const insertedUrls = [];
for (const row of filas) {
  const { data, error } = await sb.from('propiedades_v2')
    .upsert(row, { onConflict: 'url,fuente', ignoreDuplicates: true })
    .select('id');
  if (error) { console.error(`   ✖ ${row.url}: ${error.message}`); err++; }
  else if (data && data.length) { ins++; insertedUrls.push(row.url); }
  else skip++;  // ya existía (DO NOTHING)
}
console.log(`   insertadas: ${ins} · ya existían (skip): ${skip} · errores: ${err}`);

// VERIFICACIÓN: las insertadas DEBEN aparecer en el feed (delta) y NO contaminar deptos.
const { count: feedDespues } = await sb.from('v_mercado_casas').select('*', { count: 'exact', head: true });
const { count: enFeedDeptos } = await sb.from('v_mercado_venta').select('*', { count: 'exact', head: true }).eq('tipo_propiedad_original', 'casa');
const { data: enFeed } = insertedUrls.length
  ? await sb.from('v_mercado_casas').select('url').in('url', insertedUrls)
  : { data: [] };
const llegaron = (enFeed || []).length;
const delta = (feedDespues ?? 0) - (feedAntes ?? 0);
console.log(`\n  VERIFICACIÓN:`);
console.log(`   feed v_mercado_casas: ${feedAntes} → ${feedDespues}  (delta ${delta >= 0 ? '+' : ''}${delta})`);
console.log(`   insertadas que YA aparecen en el feed: ${llegaron}/${ins}  ${llegaron === ins ? '✅' : '⚠️ FALTAN — revisar fecha/zona/area'}`);
console.log(`   casas en feed de deptos: ${enFeedDeptos}  ${enFeedDeptos === 0 ? '✅' : '🔴 CONTAMINACIÓN'}\n`);
