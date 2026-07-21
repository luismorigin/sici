// ============================================================================
// SANITY CHECK de shadow — ALERTA DE REVISIÓN, nunca rechaza
// ----------------------------------------------------------------------------
// QUÉ CUBRE (el hueco detectado 21-jul): ni el MOAT ni las audits miran si el dato
// GUARDADO es absurdo. El MOAT lee el aviso UNA vez; el drift solo mira si el aviso
// CAMBIÓ; la cola es matching/dedup. Nadie re-mira "esto tiene sentido?".
// Caso real: Lateris entró con 1700 m² (el texto decía 177) y nadie lo cazó.
//
// 🔑 DOS SEÑALES INDEPENDIENTES para no generar falsos positivos:
//   solo alerta si el área está fuera de rango **Y ADEMÁS** el $/m² derivado también
//   lo está. Un penthouse de 450 m² con $/m² coherente NO aparece. Una alerta que
//   grita por todo se ignora a la semana — eso la volvería inútil.
//
// 🔑 USA EL PRECIO NORMALIZADO, nunca `precio_usd` crudo (regla 1 de CLAUDE.md).
//   Medido: chequear con el crudo daba 26 falsos positivos (props con tag `bob`,
//   donde `precio_usd` guarda BOLIVIANOS). Con `precio_norm` de la vista: 0.
//
// NO RECHAZA NADA: imprime la lista para revisión humana. El juicio es del humano.
//
// Uso:  node sanity-shadow.mjs            (venta + alquiler)
//       node sanity-shadow.mjs --op venta
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const opArg = (() => { const i = argv.indexOf('--op'); return i >= 0 ? argv[i + 1] : 'ambos'; })();
const OPS = opArg === 'venta' ? ['venta'] : opArg === 'alquiler' ? ['alquiler'] : ['venta', 'alquiler'];

// Rangos deliberadamente ANCHOS: la 2da señal es la que da precisión, no el umbral.
// (Un umbral fino y solo se llenaría de bordes legítimos.)
const AREA_MIN = 15, AREA_MAX = 400;          // depto: <15 imposible · >400 raro (no imposible)
const M2_MIN_VENTA = 600, M2_MAX_VENTA = 4000; // $/m² NORMALIZADO
const M2_MIN_ALQ = 15, M2_MAX_ALQ = 200;       // Bs/m² mensual

const hallazgos = [];

for (const op of OPS) {
  const vista = op === 'venta' ? 'v_mercado_venta_shadow' : 'v_mercado_alquiler_shadow';
  const cols = op === 'venta'
    ? 'id,nombre_edificio,area_total_m2,precio_norm,precio_m2'
    : 'id,nombre_edificio,area_total_m2,precio_mensual_bob';
  const { data, error } = await sb.from(vista).select(cols);
  if (error) { console.error(`ERROR leyendo ${vista}: ${error.message}`); continue; }

  for (const r of data || []) {
    const area = r.area_total_m2 != null ? Number(r.area_total_m2) : null;
    if (!area) continue;                                    // sin área no hay nada que contrastar
    const areaRara = area < AREA_MIN || area > AREA_MAX;
    if (!areaRara) continue;                                // 1ª señal no disparó → ni miramos

    // 2ª señal: el $/m² derivado (con el precio YA NORMALIZADO de la vista)
    const precio = op === 'venta' ? Number(r.precio_norm) : Number(r.precio_mensual_bob);
    if (!precio) continue;
    const m2 = op === 'venta' ? (r.precio_m2 != null ? Number(r.precio_m2) : precio / area) : precio / area;
    const [lo, hi] = op === 'venta' ? [M2_MIN_VENTA, M2_MAX_VENTA] : [M2_MIN_ALQ, M2_MAX_ALQ];
    const m2Raro = m2 < lo || m2 > hi;
    if (!m2Raro) continue;                                  // área rara pero $/m² coherente → NO alertar

    hallazgos.push({ op, id: r.id, edificio: r.nombre_edificio || '—', area, precio: Math.round(precio), m2: Math.round(m2), unidad: op === 'venta' ? '$/m²' : 'Bs/m²' });
  }
}

console.log(`\n🔍 SANITY SHADOW — alerta de revisión (2 señales: área fuera de rango Y ${'$'}/m² fuera de banda)\n`);
if (!hallazgos.length) {
  console.log('   ✅ Sin hallazgos. Nada para revisar.\n');
  process.exit(0);
}
console.log(`   ⚠️  ${hallazgos.length} para REVISAR (no se rechazó nada — el juicio es humano):\n`);
for (const h of hallazgos) {
  console.log(`     ${String(h.id).padEnd(9)} ${h.op.padEnd(9)} ${String(h.area).padStart(8)} m² · ${String(h.precio).padStart(9)} → ${String(h.m2).padStart(6)} ${h.unidad}  · ${h.edificio}`);
}
console.log(`\n   Probable causa: área mal cargada por el captador (error ×10, 0.01 de placeholder).`);
console.log(`   Cómo se previene de ahora en más: el lector reporta \`area_m2\` del TEXTO y pisa la del portal`);
console.log(`   (READER_SPEC §ÁREA, v4.3). Esto es la red para lo ya guardado y para avisos que no la declaran.\n`);
