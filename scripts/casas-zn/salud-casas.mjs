// ============================================================================
// SALUD CASAS ZN — chequeo read-only del estado del feed + pipeline
// ----------------------------------------------------------------------------
// Responde "¿está todo OK?" sin tener que leer SQL. Corre cuando quieras:
//   node salud-casas.mjs
// Es el paso de cierre de /cron-casas (informe final) y también un chequeo suelto.
// SOLO LEE (SELECT + lee el log). No escribe nada nunca.
//
// Veredicto:
//   🔴 ROTO    → contaminación a deptos, casas atascadas en pending, o feed vacío.
//   🟡 REVISAR → algo para mirar (muchas en gracia, contacto/fotos bajos).
//   ✅ TODO OK → integridad y calidad dentro de lo esperado.
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const HYBRID = 'metodo_match.like.carga_%,metodo_match.eq.cron_casas_zn';
const cnt = async (builder) => (await builder).count ?? 0;          // builder ya con .select(count,head) + filtros
const head = (t) => sb.from(t).select('*', { count: 'exact', head: true });
const casasHibrido = (t) => head(t).eq('tipo_propiedad_original', 'casa').or(HYBRID);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

const problemas = [], avisos = [];

// ---------- 1. INTEGRIDAD ----------
const feed = await cnt(head('v_mercado_casas'));
const contaminacion = await cnt(head('v_mercado_venta').eq('tipo_propiedad_original', 'casa'));
const atascadas = await cnt(casasHibrido('propiedades_v2').eq('status', 'inactivo_pending'));
const activas = await cnt(casasHibrido('propiedades_v2').eq('es_activa', true).eq('status', 'completado'));
const enGracia = await cnt(casasHibrido('propiedades_v2').eq('status', 'completado').not('primera_ausencia_at', 'is', null));

if (feed === 0) problemas.push('feed v_mercado_casas vacío (0)');
if (contaminacion > 0) problemas.push(`${contaminacion} casa(s) contaminando el feed de deptos`);
if (atascadas > 0) problemas.push(`${atascadas} casa(s) atascadas en inactivo_pending`);
if (activas > 0 && enGracia / activas > 0.25) avisos.push(`${enGracia} en gracia (${pct(enGracia, activas)}% de activas) — crawl flojo o portal raro`);

// ---------- 2. BAJAS RECIENTES (info) ----------
const { data: bajas } = await sb.from('propiedades_v2')
  .select('id, fecha_inactivacion, razon_inactiva')
  .eq('tipo_propiedad_original', 'casa').or(HYBRID).eq('status', 'inactivo_confirmed')
  .gte('fecha_inactivacion', new Date(Date.now() - 7 * 86400000).toISOString())
  .order('fecha_inactivacion', { ascending: false });
const bajas7d = (bajas || []).length;

// ---------- 3. CALIDAD DEL FEED ----------
const { data: rows } = await sb.from('v_mercado_casas')
  .select('id, precio_usd, area_total_m2, dormitorios, id_condominio_master, datos_json_enrichment');
const N = (rows || []).length;
let conFoto = 0, conTel = 0, conDorms = 0, conArea = 0, enCond = 0;
for (const r of rows || []) {
  const dj = r.datos_json_enrichment || {};
  if ((dj.cantidad_fotos || (dj.fotos_urls || []).length) > 0) conFoto++;
  if (dj.agente_telefono) conTel++;
  if (r.dormitorios != null) conDorms++;
  if (r.area_total_m2 > 0) conArea++;
  if (r.id_condominio_master != null) enCond++;
}
if (N > 0 && pct(conTel, N) < 80) avisos.push(`solo ${pct(conTel, N)}% con teléfono de contacto`);
if (N > 0 && pct(conFoto, N) < 90) avisos.push(`solo ${pct(conFoto, N)}% con fotos`);

// ---------- 4. ÚLTIMA CORRIDA (del log) ----------
let ultimaCorrida = '(sin log)';
try {
  const log = readFileSync(join(__dirname, 'cron-casas-log.md'), 'utf8').trim().split('\n');
  const filas = log.filter(l => l.startsWith('| 2'));
  if (filas.length) ultimaCorrida = filas[filas.length - 1].split('|').map(s => s.trim()).filter(Boolean).slice(0, 6).join(' · ');
} catch {}

// ============================== INFORME ==============================
const ok = (c) => c ? '✅' : '🔴';
console.log(`\n🏠 SALUD CASAS ZN  ·  ${new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' })}\n`);
console.log('  INTEGRIDAD');
console.log(`   ${ok(feed > 0)} feed activo (v_mercado_casas): ${feed}`);
console.log(`   ${ok(contaminacion === 0)} aislamiento (casas en feed de deptos): ${contaminacion}  ${contaminacion === 0 ? '' : '🔴'}`);
console.log(`   ${ok(atascadas === 0)} casas atascadas en pending: ${atascadas}`);
console.log(`   ·  activas: ${activas}  ·  en gracia (ausentes, aún en feed): ${enGracia}  ·  bajas últimos 7d: ${bajas7d}`);
console.log('\n  CALIDAD DEL FEED (' + N + ' casas)');
console.log(`   ·  con fotos:    ${conFoto}/${N} (${pct(conFoto, N)}%)`);
console.log(`   ·  con teléfono: ${conTel}/${N} (${pct(conTel, N)}%)`);
console.log(`   ·  con dorms:    ${conDorms}/${N} (${pct(conDorms, N)}%)`);
console.log(`   ·  con área:     ${conArea}/${N} (${pct(conArea, N)}%)`);
console.log(`   ·  en condominio matcheado: ${enCond}/${N} (${pct(enCond, N)}%)`);
console.log(`\n  ÚLTIMA CORRIDA: ${ultimaCorrida}`);

console.log('\n' + '='.repeat(60));
if (problemas.length) {
  console.log('  🔴 ROTO — revisar YA:');
  problemas.forEach(p => console.log(`     - ${p}`));
} else if (avisos.length) {
  console.log('  🟡 REVISAR (no rompe, pero mirá):');
  avisos.forEach(a => console.log(`     - ${a}`));
} else {
  console.log('  ✅ TODO OK — integridad y calidad dentro de lo esperado.');
}
console.log('='.repeat(60) + '\n');
