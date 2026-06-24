// Backfill de los 5 campos faltantes en las 306 casas ZN (espeja el contrato de deptos).
// Re-fetchea el detalle real de cada casa y completa: fotos_urls + cantidad_fotos, descripcion,
// estacionamientos, fecha_publicacion, codigo_propiedad, oficina_telefono.
//
// La funcion extraerCampos() es REUSABLE: la misma logica se cablea al flujo nocturno futuro.
//
// Uso:
//   node backfill-campos-casas.mjs            -> DRY-RUN (no escribe; muestra muestra + cobertura)
//   node backfill-campos-casas.mjs --apply    -> aplica UPDATE a propiedades_v2 (service_role)
//   node backfill-campos-casas.mjs --limit=6  -> limita N casas (para probar)
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const APPLY = process.argv.includes('--apply');
const LIMIT = (() => { const a = process.argv.find((x) => x.startsWith('--limit=')); return a ? Number(a.split('=')[1]) : null; })();
const MARCADORES = ['carga_piloto_casas_19jun', 'carga_piloto_casas_20jun', 'carga_casas_escala_20jun', 'carga_casas_nuevas_20jun'];

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' };
const dec = (s) => s.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const telNorm = (t) => { if (!t) return null; let d = String(t).replace(/[^0-9]/g, ''); if (d.startsWith('591')) d = d.slice(3); d = d.replace(/^0+/, ''); return d.length >= 7 ? `+591${d}` : null; };
const uniq = (a) => [...new Set(a.filter(Boolean))];
// fecha_publicacion para C21: se deriva de e.dias (dias en mercado). Se sella con la fecha de corrida.
const HOY = '2026-06-21';
const fechaDesdeDias = (dias) => {
  const n = Number(dias);
  if (!Number.isFinite(n) || n < 0 || n > 3000) return null;
  const ms = new Date(`${HOY}T12:00:00Z`).getTime() - n * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
};

// ---------- EXTRACTORES (reusables para el flujo) ----------
async function extraerC21(url) {
  const r = await fetch(`${url}?json=true`, { headers: UA });
  const j = await r.json();
  const e = j.entity || j.data?.entity || j;
  const fotos = uniq((Array.isArray(j.fotos) && j.fotos.length ? j.fotos : (j.fotosNew || [])).map((f) => f.large || f.large1 || f.path));
  return {
    fotos_urls: fotos,
    cantidad_fotos: fotos.length,
    descripcion: (e.descripcion || j.descripcionMeta || '').trim() || null,
    estacionamientos: Number(e.estacionamientos) || (e.estacionamientos === 0 ? 0 : null),
    fecha_publicacion: fechaDesdeDias(e.dias) || (e.fechaModificacion?.date ? e.fechaModificacion.date.slice(0, 10) : null),
    codigo_propiedad: e.clave || (e.id != null ? String(e.id) : null),
    oficina_telefono: telNorm(e.telefonoOfna || e.usuatelOfna),
  };
}
async function extraerRemax(url) {
  const r = await fetch(url, { headers: UA });
  const html = await r.text();
  const m = html.match(/data-page="([^"]+)"/); if (!m) throw new Error('sin data-page');
  const props = JSON.parse(dec(m[1])).props;
  const l = props.listing || {};
  const fotos = uniq((l.multimedias || []).map((x) => x.large_url || x.link));
  return {
    fotos_urls: fotos,
    cantidad_fotos: fotos.length,
    descripcion: (l.description_website || l.marketing_description || '').trim() || null,
    estacionamientos: null, // Remax no expone parking estructurado (campo fantasma) -> del texto via LLM
    fecha_publicacion: l.date_of_listing || (l.created_at ? l.created_at.slice(0, 10) : null),
    codigo_propiedad: l.MLSID || l.reference || l.key || null,
    oficina_telefono: null, // Remax no expone tel de oficina (solo el del agente, ya capturado)
  };
}
const extraerCampos = (url, fuente) => (fuente === 'c21' ? extraerC21(url) : extraerRemax(url));

// ---------- MAIN ----------
let casas = [];
{
  const { data, error } = await sb.from('propiedades_v2')
    .select('id, url, fuente, datos_json_enrichment')
    .in('metodo_match', MARCADORES);
  if (error) { console.error('ERROR leyendo casas:', error.message); process.exit(1); }
  casas = LIMIT ? data.slice(0, LIMIT) : data;
}
console.log(`Casas a procesar: ${casas.length}  | modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

const cob = { fotos: 0, descripcion: 0, estac: 0, fecha: 0, codigo: 0, ofitel: 0 };
let ok = 0, fail = 0, escritas = 0;
const muestra = [];

for (const c of casas) {
  try {
    const x = await extraerCampos(c.url, c.fuente);
    if (x.fotos_urls.length) cob.fotos++;
    if (x.descripcion) cob.descripcion++;
    if (x.estacionamientos != null) cob.estac++;
    if (x.fecha_publicacion) cob.fecha++;
    if (x.codigo_propiedad) cob.codigo++;
    if (x.oficina_telefono) cob.ofitel++;
    ok++;
    if (muestra.length < 4) muestra.push({ id: c.id, fuente: c.fuente, fotos: x.fotos_urls.length, desc: (x.descripcion || '').length, estac: x.estacionamientos, fecha: x.fecha_publicacion, cod: x.codigo_propiedad, ofi: x.oficina_telefono });

    if (APPLY) {
      const enr = { ...(c.datos_json_enrichment || {}) };
      enr.fotos_urls = x.fotos_urls;
      enr.cantidad_fotos = x.cantidad_fotos;
      enr.descripcion = x.descripcion;
      enr.codigo_propiedad = x.codigo_propiedad;
      enr.oficina_telefono = x.oficina_telefono;
      enr.estacionamientos = x.estacionamientos;
      enr.fecha_publicacion = x.fecha_publicacion;
      enr.fuente_backfill = 'backfill_campos_21jun';
      const patch = { datos_json_enrichment: enr };
      if (x.estacionamientos != null) patch.estacionamientos = x.estacionamientos;
      if (x.fecha_publicacion) patch.fecha_publicacion = x.fecha_publicacion;
      const { error } = await sb.from('propiedades_v2').update(patch).eq('id', c.id);
      if (error) { console.error(`  UPDATE id ${c.id} ERROR: ${error.message}`); fail++; } else { escritas++; }
    }
  } catch (err) {
    console.error(`  id ${c.id} (${c.fuente}) FALLO: ${err.message}`);
    fail++;
  }
  await new Promise((res) => setTimeout(res, 250));
}

const pct = (n) => `${n}/${ok} (${Math.round((n / ok) * 100)}%)`;
console.log('\n=== MUESTRA (primeras 4) ===');
for (const m of muestra) console.log(`  id ${m.id} [${m.fuente}] fotos=${m.fotos} desc=${m.desc}c estac=${m.estac} fecha=${m.fecha} cod=${m.cod} ofi=${m.ofi}`);
console.log('\n=== COBERTURA ===');
console.log(`  ok=${ok} fail=${fail}`);
console.log(`  fotos_urls:    ${pct(cob.fotos)}`);
console.log(`  descripcion:   ${pct(cob.descripcion)}`);
console.log(`  estacionamientos: ${pct(cob.estac)}  (Remax no expone -> esperado bajo)`);
console.log(`  fecha_publicacion: ${pct(cob.fecha)}`);
console.log(`  codigo_propiedad:  ${pct(cob.codigo)}`);
console.log(`  oficina_telefono:  ${pct(cob.ofitel)}  (Remax no expone -> esperado bajo)`);
if (APPLY) console.log(`\n  >>> ESCRITAS: ${escritas} filas actualizadas`);
else console.log('\n  (DRY-RUN: no se escribio nada. Correr con --apply para aplicar.)');
