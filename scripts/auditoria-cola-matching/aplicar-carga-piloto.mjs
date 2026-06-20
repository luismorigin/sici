// Ejecuta la carga del lote piloto de casas a propiedades_v2 (service_role).
// Autorizado por el founder 20-jun. Marcador rollback: metodo_match='carga_piloto_casas_20jun'.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const SS = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const lote = JSON.parse(fs.readFileSync(`${SS}/lote-piloto-casas.json`, 'utf8'));
const enr = [0, 1, 2, 3].flatMap((n) => JSON.parse(fs.readFileSync(`${SS}/lote-piloto-enriquecido-${n}.json`, 'utf8')));
const loteByIdx = new Map(lote.map((c) => [c.idx, c]));
const EXCLUIR = new Set([1]); // anticretico
const numOrNull = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));

const filas = [];
for (const e of enr) {
  if (EXCLUIR.has(e.idx)) continue;
  const l = loteByIdx.get(e.idx);
  if (!l) continue;
  const moneda = e.precio_moneda || l.moneda || 'USD';
  let precio_usd = moneda === 'BOB'
    ? Math.round((Number(e.precio_valor) / 6.96) * 100) / 100
    : Math.round(Number(e.precio_valor) * 100) / 100;
  let tc = e.tc_detectado || 'no_especificado';
  if (moneda === 'BOB' && tc === 'paralelo') tc = 'no_especificado';
  filas.push({
    url: l.url, fuente: l.fuente, tipo_operacion: 'venta', tipo_propiedad_original: 'casa',
    latitud: numOrNull(l.lat), longitud: numOrNull(l.lon),
    area_total_m2: numOrNull(e.area_construida_m2 != null ? e.area_construida_m2 : l.area_const_m2),
    area_terreno_m2: numOrNull(e.area_terreno_m2),
    dormitorios: numOrNull(e.dormitorios), banos: numOrNull(e.banos),
    precio_usd, moneda_original: moneda, tipo_cambio_detectado: tc, depende_de_tc: tc === 'paralelo',
    status: 'completado', es_activa: true, id_condominio_master: null,
    metodo_match: 'carga_piloto_casas_20jun',
    datos_json_enrichment: {
      agente_nombre: e.agente_nombre ?? null, agente_telefono: e.agente_telefono ?? null,
      url_whatsapp: e.url_whatsapp ?? null, oficina_nombre: e.oficina_nombre ?? null,
      contacto_visible: e.contacto_visible ?? null, es_cerrado: e.es_cerrado ?? null,
      estado_construccion: e.estado_construccion ?? null,
      nombre_condominio_detectado: e.nombre_condominio ?? null,
      amenidades: Array.isArray(e.amenidades) ? e.amenidades : [],
      fuente_enrichment: 'piloto_lector_20jun',
    },
  });
}
console.log(`Insertando ${filas.length} casas…`);
const { data, error } = await sb.from('propiedades_v2').insert(filas).select('id');
if (error) { console.error('ERROR insert:', error); process.exit(1); }
console.log(`OK insertadas: ${data.length}`);

// Verificacion
const { count: cargadas } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true }).eq('metodo_match', 'carga_piloto_casas_20jun');
const { count: conContacto } = await sb.from('propiedades_v2').select('id', { count: 'exact', head: true }).eq('metodo_match', 'carga_piloto_casas_20jun').not('datos_json_enrichment->>agente_telefono', 'is', null);
const ids = data.map((r) => r.id);
const { data: enFeed } = await sb.from('v_mercado_venta').select('id').in('id', ids);
console.log(`VERIFICACION → cargadas=${cargadas} | con_contacto=${conContacto} | contaminan_feed=${enFeed ? enFeed.length : '?'}`);
