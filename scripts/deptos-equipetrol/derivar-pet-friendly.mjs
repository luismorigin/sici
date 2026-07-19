// Refresca proyectos_master.pet_friendly (mig 278) desde las unidades shadow.
// Determinístico + idempotente: recalcula TODO (venta+alquiler juntos). Se corre
// al final de los crons (/cron-deptos-ventas y /cron-deptos-alquiler) para que el
// chip pet-friendly del edificio quede al día cuando entran props nuevas.
//
// pet_friendly = true si CUALQUIER unidad shadow del edificio da señal POSITIVA:
//   acepta_mascotas = true  (alquiler)  o  amenidad "Pet Friendly"  (venta/alquiler).
// Solo positivos: un "no" de un dueño NO implica que el edificio prohíba.
//
// Escribe SOLO proyectos_master.pet_friendly (columna que prod ignora: el feed real
// no la devuelve). NO es un juicio → se automatiza (a diferencia de alias/PMs).
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const tienePet = (p) =>
  p.acepta_mascotas === true ||
  (Array.isArray(p.datos_json?.amenities?.lista) && p.datos_json.amenities.lista.includes('Pet Friendly'));

async function main() {
  const { data, error } = await sb
    .from('propiedades_v2_shadow')
    .select('id_proyecto_master, acepta_mascotas, datos_json')
    .eq('es_activa', true)
    .not('id_proyecto_master', 'is', null);
  if (error) { console.error('ERROR leyendo shadow:', error.message); process.exit(1); }

  const conUnidades = new Set();   // edificios con unidades en shadow (se evalúan)
  const conSenal = new Set();      // edificios con señal pet positiva
  for (const p of data) {
    conUnidades.add(p.id_proyecto_master);
    if (tienePet(p)) conSenal.add(p.id_proyecto_master);
  }
  const trueIds = [...conSenal];
  const falseIds = [...conUnidades].filter((id) => !conSenal.has(id));

  // recompute: true para los con señal, false para los que tienen unidades pero sin señal
  if (trueIds.length) {
    const { error: e1 } = await sb.from('proyectos_master').update({ pet_friendly: true }).in('id_proyecto_master', trueIds);
    if (e1) { console.error('ERROR update true:', e1.message); process.exit(1); }
  }
  if (falseIds.length) {
    const { error: e2 } = await sb.from('proyectos_master').update({ pet_friendly: false }).in('id_proyecto_master', falseIds);
    if (e2) { console.error('ERROR update false:', e2.message); process.exit(1); }
  }

  console.log(`🐾 pet_friendly derivado: ${trueIds.length} edificios true, ${falseIds.length} false (de ${conUnidades.size} con unidades en shadow).`);
}

main();
