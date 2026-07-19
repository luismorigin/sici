// ============================================================================
// SONDA DE SOMBRA v2 — Deptos Equipetrol: extractor híbrido vs n8n (contrato completo)
// ----------------------------------------------------------------------------
// Lee una MUESTRA de deptos Eq venta que n8n YA cargó (SELECT read-only a propiedades_v2
// vía service_role) y los fetchea con el EXTRACTOR DEPTO del híbrido (lib/detalle-deptos.mjs).
// Compara campo-por-campo, incluyendo los campos DEPTO que vienen estructurados de la fuente
// (piso/expensas/parqueo/amenidades/TC). 100% READ-ONLY, $0, NO escribe a la BD.
//
// Uso:  node sonda-sombra-deptos.mjs [N_por_portal]   (default 20 c/u = 40)
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pace, circuit } from '../sonda-suelo/lib/fetcher.mjs';
import { fetchDetalleDepto, telNorm } from './lib/detalle-deptos.mjs';
import { cargarTC, clasificarTCporRatio } from './lib/tc.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const OUT = join(__dirname, 'output'); mkdirSync(OUT, { recursive: true });
const N = Number(process.argv[2]) || 20;
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];

// ---------- 1. traer muestra (SELECT read-only) ----------
async function traerMuestra() {
  const { data, error } = await sb
    .from('propiedades_v2')
    .select('id,fuente,url,id_proyecto_master,nombre_edificio,precio_usd,tipo_cambio_detectado,area_total_m2,dormitorios,datos_json_enrichment')
    .eq('tipo_operacion', 'venta')
    .ilike('tipo_propiedad_original', 'departamento')
    .in('zona', ZONAS_EQ)
    .eq('status', 'completado').eq('es_activa', true)
    .in('fuente', ['century21', 'remax'])
    .not('datos_json_enrichment->>agente_telefono', 'is', null)
    .order('id', { ascending: false })
    .limit(200);
  if (error) throw error;
  // balancear: N por portal, mezcla matched/unmatched
  const pick = [];
  for (const f of ['century21', 'remax']) {
    const del = data.filter((d) => d.fuente === f);
    const con = del.filter((d) => d.id_proyecto_master != null).slice(0, Math.ceil(N / 2));
    const sin = del.filter((d) => d.id_proyecto_master == null).slice(0, Math.floor(N / 2));
    pick.push(...con, ...sin);
  }
  return pick;
}

// campos n8n derivados del registro
const n8nDe = (r) => {
  const e = r.datos_json_enrichment || {};
  const llm = e.llm_output || {};
  return {
    tel: e.agente_telefono ?? null,
    fotos: e.cantidad_fotos != null ? Number(e.cantidad_fotos) : null,
    desc_len: (e.descripcion || '').length,
    dorm: r.dormitorios,
    piso: llm.piso ?? null,
    amen: Array.isArray(e.amenities) ? e.amenities.length : 0,
    tc: r.tipo_cambio_detectado,
    precio: r.precio_usd != null ? Number(r.precio_usd) : null,
    pm: r.id_proyecto_master, edif: r.nombre_edificio, area: r.area_total_m2 != null ? Number(r.area_total_m2) : null,
  };
};

// ---------- 2. correr ----------
const mark = (ok) => (ok ? '✓' : '✗');
const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);

const muestra = await traerMuestra();
const TC = await cargarTC(sb); // paralelo VIVO de Binance (config_global)
console.log(`\n🌑 SONDA DE SOMBRA v2 — deptos Equipetrol · extractor híbrido vs n8n`);
console.log(`   Muestra: ${muestra.length} (${muestra.filter(m => m.fuente === 'century21').length} C21 + ${muestra.filter(m => m.fuente === 'remax').length} Remax) · TC vivo: oficial ${TC.oficial} / paralelo ${TC.paralelo} (Binance)\n`);

const results = [];
const dump = { century21: false, remax: false };
for (const r of muestra) {
  if (circuit.tripped) { console.log('🛑 circuit breaker — corto acá.'); break; }
  const n = n8nDe(r);
  let h = null, err = null;
  try { h = await fetchDetalleDepto(r.fuente, r.url); } catch (e) { err = String(e.message); }
  if (!h) {
    console.log(`  ${pad(r.id, 5)} ${pad(r.fuente, 9)} ✗ FETCH FALLÓ ${err ? '(' + err + ')' : ''}`);
    results.push({ id: r.id, fuente: r.fuente, fetch_ok: false, error: err });
    await pace(400); continue;
  }
  if (!dump[r.fuente]) { writeFileSync(join(OUT, `contrato-${r.fuente}-${r.id}.json`), JSON.stringify({ n8n: n, hibrido: h }, null, 2)); dump[r.fuente] = true; }

  const cmp = {
    id: r.id, fuente: r.fuente, pm: n.pm, fetch_ok: true,
    tel: { ok: telNorm(n.tel) === h.agente_telefono, n8n: n.tel, hib: h.agente_telefono },
    fotos: { ok: h.cantidad_fotos >= (n.fotos || 0), n8n: n.fotos, hib: h.cantidad_fotos },
    desc: { ok: h.descripcion.length >= n.desc_len * 0.8, n8n: n.desc_len, hib: h.descripcion.length },
    dorm: { ok: h.dormitorios === n.dorm, n8n: n.dorm, hib: h.dormitorios },
    amen: { n8n: n.amen, hib: h.amenities.length },
    // campos DEPTO que el híbrido saca ESTRUCTURADOS (el valor nuevo)
    piso_hib: h.piso, expensas_hib: h.expensas, parqueo_hib: h.parqueo_incluido,
    // TC: Remax clasifica por señal cruda vs paralelo vivo; C21 lo decide el LECTOR (texto)
    tc_n8n: n.tc,
    tc_hib: r.fuente === 'remax' ? clasificarTCporRatio(h.tc_portal, TC) : '(lector)',
    tc_portal: h.tc_portal,
    precio_hib: h.precio_fuente_usd, precio_n8n: n.precio,
  };
  results.push(cmp);
  console.log(
    `  ${pad(r.id, 5)} ${pad(r.fuente, 9)} ${n.pm ? 'M' : ' '} ` +
    `tel:${mark(cmp.tel.ok)} fotos:${mark(cmp.fotos.ok)}(${h.cantidad_fotos}/${n.fotos}) ` +
    `desc:${mark(cmp.desc.ok)} dorm:${mark(cmp.dorm.ok)}(${h.dormitorios}/${n.dorm}) ` +
    `piso:${h.piso ?? '—'} exp:${h.expensas ?? '—'} parq:${h.parqueo_incluido ? 'sí' : '—'} ` +
    `amen:${h.amenities.length} tc:${cmp.tc_hib}${h.tc_portal ? '(' + h.tc_portal + ')' : ''} [n8n:${n.tc}]`
  );
  await pace(500);
}

// ---------- 3. veredicto ----------
const ok = results.filter((r) => r.fetch_ok);
const rate = (sel) => `${ok.filter(sel).length}/${ok.length}`;
const nC21 = ok.filter((r) => r.fuente === 'century21');
const nRmx = ok.filter((r) => r.fuente === 'remax');
console.log(`\n📊 VEREDICTO (sobre ${ok.length} fetch OK de ${muestra.length}):`);
console.log(`   contacto (tel):     ${rate((r) => r.tel.ok)}`);
console.log(`   fotos (híbrido ≥):  ${rate((r) => r.fotos.ok)}`);
console.log(`   descripción (≥80%): ${rate((r) => r.desc.ok)}`);
console.log(`   dorms (exacto):     ${rate((r) => r.dorm.ok)}`);
console.log(`\n🎁 CAMPOS DEPTO ESTRUCTURADOS que el híbrido agrega (n8n los sacaba por LLM o no los tenía):`);
console.log(`   C21  piso:      ${nC21.filter((r) => r.piso_hib != null).length}/${nC21.length}`);
console.log(`   C21  expensas:  ${nC21.filter((r) => r.expensas_hib != null).length}/${nC21.length}`);
console.log(`   parqueo (bool): ${ok.filter((r) => r.parqueo_hib).length}/${ok.length}`);
console.log(`   amenidades>0:   ${ok.filter((r) => r.amen.hib > 0).length}/${ok.length}`);
console.log(`   Remax TC portal:${nRmx.filter((r) => r.tc_portal != null).length}/${nRmx.length} (señal paralelo/oficial estructurada)`);

// divergencias de precio a revisar (híbrido vs n8n > 15%)
const divPrecio = ok.filter((r) => r.precio_hib && r.precio_n8n && Math.abs(r.precio_hib - r.precio_n8n) / r.precio_n8n > 0.15);
if (divPrecio.length) {
  console.log(`\n⚠️  DIVERGENCIAS DE PRECIO (híbrido vs n8n >15%, revisar cuál es correcto):`);
  for (const d of divPrecio) console.log(`   ${d.id} ${d.fuente}: híbrido $${d.precio_hib} vs n8n $${d.precio_n8n}`);
}

writeFileSync(join(OUT, 'sombra-deptos-v2.json'), JSON.stringify(results, null, 2), 'utf8');
console.log(`\n💾 Detalle en output/sombra-deptos-v2.json · contrato de muestra en output/contrato-*.json\n`);
