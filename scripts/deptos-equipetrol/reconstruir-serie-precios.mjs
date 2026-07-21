// ============================================================================
// BACKFILL de la serie de precios REEXPRESADA al régimen TC nuevo (mig 287)
// ----------------------------------------------------------------------------
// Llama a reconstruir_serie_precios_reexpresada(), que recalcula la historia de
// precios propiedad-por-propiedad desde `precios_historial` (crudo + TC por
// fecha) aplicando el criterio nuevo, y escribe `market_price_reexpresado`.
//
// NO va en el cron: es histórico, no cambia solo. Se corre a mano cuando se
// aplica la mig o cuando se mejora el método. Es idempotente (upsert).
//
// ⚠️ La serie que produce es una ESTIMACIÓN (ver COMMENT de la tabla y el
// header de la mig 287). Sirve para la FORMA DE LA CURVA, no para el nivel
// exacto de una fecha.
//
// Uso:  node reconstruir-serie-precios.mjs
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

console.log('Reconstruyendo serie de precios reexpresada…');
const { data, error } = await sb.rpc('reconstruir_serie_precios_reexpresada');

if (error) {
  console.error('❌ Falló el backfill:', error.message);
  process.exit(1);
}

const r = Array.isArray(data) ? data[0] : data;
console.log(`✅ Serie reconstruida: ${r?.fechas_procesadas ?? '?'} fechas · ${r?.filas_escritas ?? '?'} filas escritas`);
console.log('   Auditar con la query del pie de sql/migrations/287_serie_precios_reexpresada.sql');
