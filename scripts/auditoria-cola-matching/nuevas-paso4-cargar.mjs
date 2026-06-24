// Paso 4: merge nuevas-base + nuevas-moat-A/B por key, aplica precio, excluye anticretico/alquiler,
// detecta keys sin MOAT, y CARGA a propiedades_v2 (upsert ignoreDuplicates). Marcador: carga_casas_nuevas_20jun.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SS = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const R = (f) => JSON.parse(fs.readFileSync(`${SS}/${f}`, 'utf8'));
const n = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

const base = R('nuevas-base.json');
const moat = new Map([...R('nuevas-moat-A.json'), ...R('nuevas-moat-B.json')].map((m) => [m.key, m]));

const filas = []; const sinMoat = []; let excl = 0;
for (const b of base) {
  const m = moat.get(b.key);
  if (!m) { sinMoat.push(b.key); continue; }
  if (m.excluir) { excl++; continue; }
  const moneda = m.precio_moneda || 'USD';
  let precio_usd = moneda === 'BOB' ? Math.round((Number(m.precio_valor) / 6.96) * 100) / 100 : Math.round(Number(m.precio_valor) * 100) / 100;
  let tc = m.tc_detectado || 'no_especificado';
  if (moneda === 'BOB' && tc === 'paralelo') tc = 'no_especificado';
  if (!precio_usd || precio_usd < 1000) { sinMoat.push(`${b.key} (precio malo ${precio_usd})`); continue; }
  let area = n(m.dormitorios ? b.area_const_m2 : b.area_const_m2); area = n(b.area_const_m2);
  filas.push({
    url: b.url, fuente: b.fuente, tipo_operacion: 'venta', tipo_propiedad_original: 'casa',
    latitud: n(b.lat), longitud: n(b.lon),
    area_total_m2: n(b.area_const_m2), area_terreno_m2: n(b.area_terreno_m2),
    dormitorios: n(m.dormitorios ?? b.dorms), banos: n(m.banos ?? b.banos),
    precio_usd, moneda_original: moneda, tipo_cambio_detectado: tc, depende_de_tc: tc === 'paralelo',
    status: 'completado', es_activa: true, id_condominio_master: null, metodo_match: 'carga_casas_nuevas_20jun',
    datos_json_enrichment: {
      agente_nombre: b.agente_nombre ?? null, agente_telefono: b.agente_telefono ?? null,
      url_whatsapp: b.url_whatsapp ?? null, oficina_nombre: b.oficina_nombre ?? null,
      contacto_visible: b.contacto_visible ?? null, es_cerrado: m.es_cerrado ?? null,
      estado_construccion: m.estado_construccion ?? null, nombre_condominio_detectado: m.nombre_condominio ?? null,
      amenidades: Array.isArray(m.amenidades) ? m.amenidades : [], fuente_enrichment: 'nuevas_hibrido_20jun',
    },
  });
}
console.log(`A cargar: ${filas.length} | excluidas: ${excl} | sin MOAT/precio: ${sinMoat.length} [${sinMoat.join(', ')}]`);

let total = 0;
for (let i = 0; i < filas.length; i += 50) {
  const { data, error } = await sb.from('propiedades_v2').upsert(filas.slice(i, i + 50), { onConflict: 'url,fuente', ignoreDuplicates: true }).select('id');
  if (error) { console.error(`ERROR ${i}:`, error.message); process.exit(1); }
  total += data.length;
}
console.log(`Insertadas (nuevas reales): ${total}`);
const { count } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true }).eq('metodo_match', 'carga_casas_nuevas_20jun').not('datos_json_enrichment->>agente_telefono', 'is', null);
console.log(`Verif con contacto: ${count}`);
