// Carga escalada de casas ZN (190) a propiedades_v2. Autorizado founder 20-jun.
// Marcador rollback: metodo_match='carga_casas_escala_20jun'. Todas individuales (id_condominio_master=NULL).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const fin = JSON.parse(fs.readFileSync('C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo/carga-escala-final.json', 'utf8'));
const n = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

const filas = fin.map((f) => ({
  url: f.url, fuente: f.fuente, tipo_operacion: 'venta', tipo_propiedad_original: 'casa',
  latitud: n(f.lat), longitud: n(f.lon),
  area_total_m2: n(f.area_total_m2), area_terreno_m2: n(f.area_terreno_m2),
  dormitorios: n(f.dormitorios), banos: n(f.banos),
  precio_usd: n(f.precio_usd), moneda_original: f.moneda_original,
  tipo_cambio_detectado: f.tipo_cambio_detectado, depende_de_tc: !!f.depende_de_tc,
  status: 'completado', es_activa: true, id_condominio_master: null,
  metodo_match: 'carga_casas_escala_20jun',
  datos_json_enrichment: {
    agente_nombre: f.agente_nombre ?? null, agente_telefono: f.agente_telefono ?? null,
    url_whatsapp: f.url_whatsapp ?? null, oficina_nombre: f.oficina_nombre ?? null,
    contacto_visible: f.contacto_visible ?? null, es_cerrado: f.es_cerrado ?? null,
    estado_construccion: f.estado_construccion ?? null,
    nombre_condominio_detectado: f.nombre_condominio_detectado ?? null,
    amenidades: Array.isArray(f.amenidades) ? f.amenidades : [],
    fuente_enrichment: 'escala_hibrido_20jun',
  },
}));

let total = 0;
for (let i = 0; i < filas.length; i += 50) {
  const chunk = filas.slice(i, i + 50);
  const { data, error } = await sb.from('propiedades_v2')
    .upsert(chunk, { onConflict: 'url,fuente', ignoreDuplicates: true }).select('id');
  if (error) { console.error(`ERROR chunk ${i}:`, error.message); process.exit(1); }
  total += data.length;
  console.log(`  insertadas ${total}/${filas.length}`);
}
const { count: cargadas } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true }).eq('metodo_match', 'carga_casas_escala_20jun');
const { count: conTel } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true }).eq('metodo_match', 'carga_casas_escala_20jun').not('datos_json_enrichment->>agente_telefono', 'is', null);
console.log(`VERIFICACION → cargadas=${cargadas} | con_contacto=${conTel}`);
