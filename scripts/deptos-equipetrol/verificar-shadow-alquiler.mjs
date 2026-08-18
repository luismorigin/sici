// Verificación rápida del feed shadow de alquiler (reutilizable en el barrido).
// Uso: node verificar-shadow-alquiler.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: tabla } = await sb.from('propiedades_v2')
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

// ─────────────────────────────────────────────────────────────────────────────
// 🔌 RETIRADO EL 10-ago-2026: el bloque "PENDIENTES" cruzaba contra `propiedades_v2`
// (los alquileres activos de Equipetrol que faltaban en shadow).
//
// Por qué se retira, no se arregla: **prod está congelada desde el 28-jul** (el
// founder dio de baja n8n). Un aviso que el portal bajó el 5-ago sigue figurando
// `es_activa=true` ahí para siempre → el cruce lo cuenta como "pendiente" eterno.
// El número ya no mide cobertura: mide la antigüedad de una foto. Y encima la
// consulta no chequeaba `error`, así que al archivarse la tabla habría reportado
// "0 activos en prod · ✅ INVENTARIO CERRADO" — el peor final posible: un fallo
// que se disfraza de éxito.
//
// 🔑 La lección que dejó (vale para cualquier cruce futuro): **la identidad estable
// de un aviso es su URL, no su `id`.** El cruce por id reportaba "PENDIENTES: 37"
// todas las noches cuando el faltante real era 1, porque el híbrido asigna ids del
// rango 8M que no existen en prod: el mismo aviso figuraba como 3677 y como 8000xxx.
// Corolario: un falso positivo recurrente es peor que no medir — se lee como ruido
// de fondo y el día que el número sea real nadie lo mira.
//
// La cobertura del inventario ahora se mide contra el PORTAL (el discovery, que es
// shadow-relativo), que es la única referencia viva.
// ─────────────────────────────────────────────────────────────────────────────
