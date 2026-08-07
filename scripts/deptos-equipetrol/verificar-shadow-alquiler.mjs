// Verificación rápida del feed shadow de alquiler (reutilizable en el barrido).
// Uso: node verificar-shadow-alquiler.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: tabla } = await sb.from('propiedades_v2_shadow')
  .select('id,url,precio_mensual_bob,precio_mensual_usd,moneda_original,id_proyecto_master')
  .eq('tipo_operacion', 'alquiler');
const ambas = tabla.filter(r => r.precio_mensual_bob != null && r.precio_mensual_usd != null).length;
const match = tabla.filter(r => r.id_proyecto_master).length;
console.log(`Total alquiler en shadow: ${tabla.length}`);
console.log(`🔴 Ambas columnas de precio pobladas (DEBE SER 0): ${ambas}`);
console.log(`Matching: ${match}/${tabla.length} (${Math.round(100 * match / tabla.length)}%)`);
console.log(`Moneda: BOB ${tabla.filter(r => r.moneda_original === 'BOB').length} · USD ${tabla.filter(r => r.moneda_original === 'USD').length}`);

const { data: feed, error } = await sb.rpc('buscar_unidades_alquiler_shadow', { p_filtros: { limite: 500 } });
if (error) { console.log('RPC error:', error.message); process.exit(0); }
const precios = feed.map(r => Number(r.precio_mensual_usd)).filter(Boolean).sort((a, b) => a - b);
const mediana = precios[Math.floor(precios.length / 2)];
console.log(`\nFeed shadow (RPC): ${feed.length} unidades · Mediana USD $${Math.round(mediana)} · Rango $${Math.round(precios[0])}–$${Math.round(precios[precios.length - 1])}`);

// PENDIENTES: alquileres activos de Equipetrol en prod que NO están en shadow
//
// 🔑 SE CRUZA POR **URL**, NO POR `id` (fix del 7-ago-2026).
// El cruce por id venía reportando "PENDIENTES: 37" todas las noches y el
// faltante REAL era 1. Motivo: una prop capturada por el híbrido recibe un id
// reservado del rango 8M que NO existe en prod, así que el mismo aviso figura
// con id 3677 en prod y 8000xxx en shadow → el cruce por id lo cuenta como
// faltante aunque esté. La identidad estable de un aviso es su URL; es la misma
// lección de `lib/rechazados.mjs` y del plan de cutover.
// Medido el 7-ago: 188 activas en prod · por id "faltan" 37 · por URL falta 1.
//
// ⚠️ Un falso positivo recurrente es peor que no medir: se lee como ruido de
//    fondo, y el día que el número sea real nadie lo va a mirar.
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const { data: prodAlq } = await sb.from('propiedades_v2').select('id,url,fuente')
  .eq('tipo_operacion', 'alquiler').ilike('tipo_propiedad_original', 'departamento')
  .in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true);
const urlsShadow = new Set(tabla.map(r => r.url).filter(Boolean));
const faltan = (prodAlq || []).filter(r => r.url && !urlsShadow.has(r.url));
// El híbrido SOLO captura C21 y Remax. Un aviso de Bien Inmuebles nunca va a estar
// en shadow y contarlo como "pendiente" es medir contra un objetivo que el pipeline
// no persigue. Se separa y se DECLARA — no se filtra en silencio, que sería el mismo
// pecado del cruce por id: un número que parece cobertura y no lo es.
const FUERA_DE_ALCANCE = ['bien_inmuebles'];
const pendientes = faltan.filter(r => !FUERA_DE_ALCANCE.includes(r.fuente));
const fueraAlcance = faltan.filter(r => FUERA_DE_ALCANCE.includes(r.fuente));
const sinUrlEnProd = (prodAlq || []).filter(r => !r.url).length;
console.log(`\nInventario Eq alquiler (cruce por URL): ${prodAlq?.length || 0} activos en prod · ${(prodAlq?.length || 0) - faltan.length - sinUrlEnProd} en shadow · PENDIENTES (C21+Remax, no en shadow): ${pendientes.length}${pendientes.length ? ' → ids prod: ' + pendientes.slice(0, 30).map(r => r.id).join(',') : ' ✅ INVENTARIO CERRADO'}`);
if (fueraAlcance.length) console.log(`   ℹ️  + ${fueraAlcance.length} de fuentes que el híbrido NO captura (${[...new Set(fueraAlcance.map(r => r.fuente))].join(', ')}) → ids: ${fueraAlcance.slice(0, 10).map(r => r.id).join(',')}. No son deuda del pipeline.`);
if (sinUrlEnProd) console.log(`   ⚠️  ${sinUrlEnProd} fila(s) de prod sin URL: no se pueden cruzar y NO se cuentan como pendientes (se declaran acá para no esconderlas).`);
