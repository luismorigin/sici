// Backfill del contacto del captador en las 23 casas cargadas sin el (piloto 19-jun).
// Merge en datos_json_enrichment, no pisa lo existente. Autorizado founder 20-jun.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';

dotenv.config({ path: 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/simon-mvp/.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const SS = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici/scripts/sonda-suelo';
const contactos = [
  ...JSON.parse(fs.readFileSync(`${SS}/backfill-contacto-A.json`, 'utf8')),
  ...JSON.parse(fs.readFileSync(`${SS}/backfill-contacto-B.json`, 'utf8')),
];

let ok = 0, sinTel = 0;
for (const c of contactos) {
  if (!c.agente_telefono) { sinTel++; continue; }
  const { data: cur } = await sb.from('propiedades_v2').select('datos_json_enrichment').eq('id', c.id).single();
  const base = cur?.datos_json_enrichment && typeof cur.datos_json_enrichment === 'object' ? cur.datos_json_enrichment : {};
  const merged = {
    ...base,
    agente_nombre: c.agente_nombre ?? null,
    agente_telefono: c.agente_telefono,
    url_whatsapp: c.url_whatsapp ?? null,
    oficina_nombre: c.oficina_nombre ?? null,
    contacto_visible: c.contacto_visible ?? null,
    fuente_enrichment: base.fuente_enrichment || 'backfill_contacto_20jun',
  };
  const { error } = await sb.from('propiedades_v2').update({ datos_json_enrichment: merged }).eq('id', c.id);
  if (error) { console.error(`ERROR id ${c.id}:`, error.message); continue; }
  ok++;
}
console.log(`Actualizadas: ${ok} | sin tel: ${sinTel}`);

// Verificacion: las casas del piloto 19jun con contacto
const { count } = await sb.from('propiedades_v2')
  .select('id', { count: 'exact', head: true })
  .like('metodo_match', 'carga_piloto_casas_19jun')
  .not('datos_json_enrichment->>agente_telefono', 'is', null);
console.log(`Casas 19jun con contacto ahora: ${count}`);
