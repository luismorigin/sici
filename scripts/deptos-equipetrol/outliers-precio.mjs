// ============================================================================
// OUTLIERS DE PRECIO — ¿qué propiedad se sale del precio de su propio edificio?
// ----------------------------------------------------------------------------
// $0, READ-ONLY. No escribe nada, no re-lee avisos: solo compara lo guardado.
//
// QUÉ CUBRE (el hueco que dejaba `sanity-shadow.mjs`): ese script exige que el
// ÁREA sea absurda como primera señal, así que un precio mal leído con área
// normal le pasa por al lado. Los tres casos reales del 2-ago-2026 tenían área
// perfecta:
//   · 8000111 Sky Eclipse — 832 $/m² con sus dos gemelas de 101 m² en 1.643
//   · 2123 Community Alto Norte — 760 $/m² con tres hermanas idénticas en 1.344
//   · 2808 Lusitano — 1.923 $/m² en un edificio de 969-1.046
// Los tres eran el MISMO error: el portal de C21 publica el precio en bolivianos
// y lo divide por 6,96 (el TC oficial muerto); el lector guardó ese resultado
// como si fueran dólares reales. La regla del READER_SPEC ya lo prohíbe
// ("NUNCA guardes BOB/tasa") pero se aplica mal cada tanto.
//
// 🔑 LA COMPARACIÓN ES POR TIPOLOGÍA, NO CONTRA EL EDIFICIO ENTERO.
// Las unidades grandes valen menos por m² que las chicas — comparar todo junto
// genera falsos positivos garantizados. Medido el 2-ago: contra el edificio
// entero salían 9 casos y 4 eran ruido de tamaño (un penthouse de 127 m² en un
// edificio de 65 m² típicos "parecía barato"). Con la ventana de ±25 % de
// superficie, esos desaparecen y los errores reales quedan.
//
// ⚠️ NO TIENE MEMORIA. Cada corrida vuelve a proponer lo mismo, incluso lo que
// ya se revisó y se dio por bueno (Bizet, Portobello, la preventa 2112...). Por
// eso NO está agendado: es una herramienta para correr a mano cuando se quiera
// mirar. Antes de automatizarlo hay que decidir dónde se registra "este precio
// ya lo revisé" — un tag `precio_confirmado_por` en `datos_json`, con el precio
// guardado al lado para que se invalide solo si el captador lo cambia. Sin eso,
// la alerta repite y termina ignorada (ver `rechazados.json`, el tag
// `confirmado_por` del matching y el dedup de K1: el mismo problema, 3 veces).
//
// LO QUE MIRA ADEMÁS DEL $/m², porque fue lo que decidió cada caso a mano:
//   · ¿el precio está en el TEXTO del aviso? Si no está, sale del portal y es
//     sospecha fuerte (los 3 errores no lo tenían).
//   · días en mercado — barato y parado hace meses es contradictorio.
//   · estado de obra — una preventa lejana vale menos, y eso es legítimo.
//   · amoblado (alquiler) — sube el $/m² con razón.
//
// Uso:  node outliers-precio.mjs                    (venta + alquiler)
//       node outliers-precio.mjs --op venta
//       node outliers-precio.mjs --min-comp 3       (más exigente, menos ruido)
//       node outliers-precio.mjs --bajo 0.75 --alto 1.40
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { traerTodo } from './lib/traer-todo.mjs';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const argv = process.argv.slice(2);
const arg = (f, def) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : def; };
const OPS = arg('--op', 'ambos') === 'venta' ? ['venta'] : arg('--op', 'ambos') === 'alquiler' ? ['alquiler'] : ['venta', 'alquiler'];
const MIN_COMP = Number(arg('--min-comp', 2));     // comparables mínimos, sin contarse a sí misma
const BAJO = Number(arg('--bajo', 0.70));          // < 70 % de la mediana de su tipología
const ALTO = Number(arg('--alto', 1.50));          // > 150 %
const VENTANA = 0.25;                               // ±25 % de superficie = "misma tipología"

const pct = (n) => `${Math.round(n * 100)}%`;
const mediana = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

console.log(`\n💵 OUTLIERS DE PRECIO — contra la tipología del propio edificio (±${VENTANA * 100} % de superficie)`);
console.log(`   umbral: <${pct(BAJO)} o >${pct(ALTO)} de la mediana · mínimo ${MIN_COMP} comparables · READ-ONLY, $0\n`);

let totalHallazgos = 0;

for (const op of OPS) {
  const vista = op === 'venta' ? 'v_mercado_venta_shadow' : 'v_mercado_alquiler_shadow';
  const cols = op === 'venta'
    ? 'id,id_proyecto_master,nombre_edificio,area_total_m2,precio_norm,precio_m2,dormitorios,dias_en_mercado,estado_construccion,url,datos_json'
    : 'id,id_proyecto_master,nombre_edificio,area_total_m2,precio_mensual,dormitorios,dias_en_mercado,amoblado,url,datos_json';

  // paginado: shadow pasó las 1.000 filas y PostgREST corta ahí sin avisar (lib/traer-todo.mjs)
  const filas = await traerTodo(sb.from(vista).select(cols).not('id_proyecto_master', 'is', null));

  const props = filas
    .map((p) => {
      const area = Number(p.area_total_m2) || 0;
      const unit = op === 'venta'
        ? Number(p.precio_m2) || 0
        : (Number(p.precio_mensual) || 0) / (area || 1);
      const desc = p.datos_json?.contenido?.descripcion || '';
      return {
        id: p.id, pm: p.id_proyecto_master, edif: p.nombre_edificio || '—',
        area, unit, dorms: p.dormitorios, dias: p.dias_en_mercado,
        precio: op === 'venta' ? Number(p.precio_norm) : Number(p.precio_mensual),
        estado: p.estado_construccion || null, amoblado: p.amoblado || null,
        // tell que se repitió en los 3 errores reales: el precio no figuraba en el aviso
        precioEnTexto: /precio|\$us|USD|bs\.? ?[0-9]/i.test(desc),
        url: p.url,
      };
    })
    .filter((p) => p.area > 0 && p.unit > 0);

  const porPm = new Map();
  for (const p of props) { if (!porPm.has(p.pm)) porPm.set(p.pm, []); porPm.get(p.pm).push(p); }

  const hallazgos = [];
  for (const p of props) {
    // comparables: mismo edificio, superficie parecida, sin contarse a sí misma
    const comp = (porPm.get(p.pm) || []).filter(
      (o) => o.id !== p.id && o.area >= p.area * (1 - VENTANA) && o.area <= p.area * (1 + VENTANA),
    );
    if (comp.length < MIN_COMP) continue;
    const med = mediana(comp.map((o) => o.unit));
    if (!med) continue;
    const ratio = p.unit / med;
    if (ratio >= BAJO && ratio <= ALTO) continue;
    hallazgos.push({ ...p, med, ratio, nComp: comp.length });
  }

  hallazgos.sort((a, b) => a.ratio - b.ratio);
  const unidad = op === 'venta' ? '$/m²' : '$/m²/mes';
  console.log(`── ${op.toUpperCase()} · ${props.length} props con edificio asignado · ${hallazgos.length} fuera de banda\n`);
  if (!hallazgos.length) { console.log('   ✅ ninguna.\n'); continue; }

  for (const h of hallazgos) {
    const señales = [];
    if (!h.precioEnTexto) señales.push('🔴 el precio NO está en el texto del aviso');
    if (h.estado === 'preventa' || h.estado === 'en_construccion') señales.push(`preventa (explica descuento)`);
    if (h.amoblado === 'si') señales.push('amoblado (sube el $/m²)');
    if (h.dias > 150) señales.push(`${h.dias} días en mercado`);
    console.log(`   ${String(h.id).padEnd(9)} ${h.edif.slice(0, 26).padEnd(27)} ${String(h.area).padStart(6)} m² · ${h.dorms ?? '?'}d`);
    console.log(`      ${Math.round(h.unit).toString().padStart(6)} ${unidad}  vs  ${Math.round(h.med)} de su tipología (${h.nComp} comparables)  →  ${pct(h.ratio)}`);
    if (señales.length) console.log(`      ${señales.join(' · ')}`);
    console.log(`      ${h.url}`);
  }
  console.log('');
  totalHallazgos += hallazgos.length;
}

console.log(`   ${totalHallazgos} para revisar. NO se tocó nada — el juicio es humano.`);
console.log(`   Si el precio resulta correcto, hoy no queda registrado: volverá a salir en la próxima corrida.\n`);
