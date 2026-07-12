// Verificación rápida del feed shadow de alquiler (reutilizable en el barrido).
// Uso: node verificar-shadow-alquiler.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: tabla } = await sb.from('propiedades_v2_shadow')
  .select('id,precio_mensual_bob,precio_mensual_usd,moneda_original,id_proyecto_master')
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
const ZONAS_EQ = ['Equipetrol Centro', 'Equipetrol Norte', 'Sirari', 'Villa Brigida', 'Equipetrol Oeste', 'Eq. 3er Anillo'];
const { data: prodAlq } = await sb.from('propiedades_v2').select('id')
  .eq('tipo_operacion', 'alquiler').ilike('tipo_propiedad_original', 'departamento')
  .in('zona', ZONAS_EQ).eq('status', 'completado').eq('es_activa', true);
const enShadow = new Set(tabla.map(r => r.id));
const pendientes = (prodAlq || []).filter(r => !enShadow.has(r.id));
console.log(`\nInventario Eq alquiler: ${prodAlq?.length || 0} activos en prod · ${enShadow.size ? tabla.filter(r => prodAlq?.some(p => p.id === r.id)).length : 0} en shadow · PENDIENTES (no en shadow): ${pendientes.length}${pendientes.length ? ' → ids: ' + pendientes.slice(0, 30).map(r => r.id).join(',') : ' ✅ INVENTARIO CERRADO'}`);
