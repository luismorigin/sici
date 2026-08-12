// ============================================================================
// CAPTURA DIARIA DEL TC PARALELO (Binance P2P) — reemplaza el workflow n8n muerto
// ----------------------------------------------------------------------------
// Sustituye a "SICI - TC Dinamico Binance v1.1" (n8n/workflows/modulo_2/
// tc_dinamico_binance.json), que dejó de correr el 27-jul-2026 al darse de baja
// el servidor n8n. Supera también a actualizar-tc-binance.mjs, que solo tocaba
// config_global y nunca escribió el historial.
//
// 🔑 LAS TRES DIFERENCIAS CON EL n8n VIEJO (son el pedido del founder)
//
// 1. EL HISTORIAL SE ESCRIBE SIEMPRE. En n8n el INSERT a tc_binance_historial
//    colgaba de la rama TRUE de "IF: TC Valido?": solo se guardaba la fila los
//    días en que el TC se aplicaba. Por eso hay 67 filas en 206 días (32%). La
//    rama FALSE iba a un nodo Code que no escribía nada en la base. La serie no
//    era una serie de TC: era la lista de días en que el TC se movió ≥0,5%.
//    Acá la fila se escribe pase lo que pase — incluso si Binance falla.
//
// 2. SE FUE EL PISO DE 0,5%. validar_tc_binance() rechazaba todo cambio menor a
//    0,5% ("Cambio insignificante"). Existía para no disparar el recálculo en
//    masa del trigger trigger_tc_actualizado, que marcaba ~800 propiedades por
//    UPDATE. Ese trigger quedó DESACTIVADO en el TIEMPO 1 del cutover
//    (11-ago-2026) y el módulo que lo consumía está deprecado desde el 19-jun.
//    El piso perdió su motivo: hoy solo sirve para dejar el TC viejo en la base.
//    Se conservan los dos guardarraíles que sí protegen: rango 8–15 y salto máximo
//    de 10% (un scrape corrupto no debe entrar).
//
// 3. NO PASA POR actualizar_tipo_cambio(). Esa función nombra propiedades_v2, que
//    dejó de existir el 11-ago (renombrada a propiedades_v2_archivo). Llamarla hoy
//    aborta el UPDATE entero. Este script escribe config_global directo.
//
// COMPATIBILIDAD DE LA SERIE: tc_sell = PROMEDIO de los 5 primeros anuncios SELL,
// igual que n8n. En las 67 filas viejas tc_sell == config_global.valor exacto, y
// esa relación se mantiene. La mediana (que usa actualizar-tc-binance.mjs) se
// guarda aparte en raw_response para poder comparar métodos, pero NO manda.
//
// USO
//   node capturar-tc-binance.mjs            -> dry-run: baja, calcula, NO escribe nada
//   node capturar-tc-binance.mjs --apply    -> escribe historial + config_global
//   node capturar-tc-binance.mjs --apply --force   -> re-corre aunque hoy ya se aplicó
// ============================================================================
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const ROOT = 'C:/Users/LUCHO/Desktop/Censo inmobiliario/sici';
dotenv.config({ path: `${ROOT}/simon-mvp/.env.local` });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');

// Guardarraíles heredados de validar_tc_binance(), menos el piso de 0,5%.
const TC_MIN = 8.0;
const TC_MAX = 15.0;
const SALTO_MAX_PCT = 10.0;

const promedio = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const mediana = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r4 = (n) => Math.round(n * 10000) / 10000;
const r2 = (n) => Math.round(n * 100) / 100;

// Fecha calendario en Bolivia (UTC-4). El cron viejo corría a medianoche local y
// la serie está indexada por ese día; usar la fecha UTC correría el corte 4 horas.
const hoyBolivia = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);

async function bajarLado(tradeType) {
  const r = await fetch('https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    body: JSON.stringify({ asset: 'USDT', fiat: 'BOB', tradeType, page: 1, rows: 10, publisherType: null, payTypes: [] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.ok) throw new Error(`Binance ${tradeType} HTTP ${r.status}`);
  const j = await r.json();
  const data = j?.data || [];
  const precios = data.map((d) => parseFloat(d?.adv?.price)).filter((x) => Number.isFinite(x) && x > 0);
  const volumenes = data
    .map((d) => parseFloat(d?.adv?.surplusAmount ?? d?.adv?.tradableQuantity))
    .filter((x) => Number.isFinite(x) && x > 0);
  return { precios, volumenes, n: data.length };
}

// Escribe la fila del día. Se llama SIEMPRE, en éxito y en fracaso: es el punto
// donde el silencio del n8n viejo se convierte en registro.
async function registrar(fila) {
  const { error } = await sb.from('tc_binance_historial').insert(fila);
  if (error) {
    console.error(`\n❌ NO PUDE ESCRIBIR EL HISTORIAL: ${error.message}`);
    console.error('   La captura queda sin rastro. Esto es lo que había que evitar — revisar ya.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
async function main() {
  const hoy = hoyBolivia();

  // ¿Ya se aplicó hoy? Una segunda corrida tras un fallo SÍ se permite; duplicar
  // una aplicación exitosa, no (el cron puede dispararse dos veces tras un apagón).
  const { data: yaHoy } = await sb
    .from('tc_binance_historial')
    .select('id,timestamp,aplicado_a_config')
    .gte('timestamp', `${hoy}T04:00:00Z`)
    .eq('aplicado_a_config', true)
    .limit(1);

  if (yaHoy?.length && !FORCE) {
    console.log(`\n⏭️  Ya hay una captura APLICADA hoy (${hoy}, id=${yaHoy[0].id}). Nada que hacer.`);
    console.log('   Para forzar otra: --force\n');
    return;
  }

  // --- Bajar Binance -------------------------------------------------------
  let sell, buy;
  try {
    [sell, buy] = await Promise.all([bajarLado('SELL'), bajarLado('BUY')]);
  } catch (e) {
    console.error(`\n❌ Binance no respondió: ${e.message}`);
    if (APPLY) await registrar({ razon_no_aplicado: `fetch falló: ${e.message}` });
    console.error('   Fila de fallo registrada. El TC de config_global queda como estaba.\n');
    process.exit(1);
  }

  if (sell.precios.length < 3) {
    const razon = `Binance devolvió solo ${sell.precios.length} anuncios SELL — no confiable`;
    console.error(`\n❌ ${razon}`);
    if (APPLY) await registrar({ num_anuncios_sell: sell.n, num_anuncios_buy: buy.n, razon_no_aplicado: razon });
    process.exit(1);
  }

  // --- Calcular (método n8n: promedio de los 5 primeros) --------------------
  const top5sell = sell.precios.slice(0, 5);
  const top5buy = buy.precios.slice(0, 5);
  const tcSell = r4(promedio(top5sell));
  const tcBuy = top5buy.length ? r4(promedio(top5buy)) : null;
  const spread = tcBuy ? r2((100 * (tcSell - tcBuy)) / tcBuy) : null;
  const volumen = sell.volumenes.length ? r2(promedio(sell.volumenes.slice(0, 5))) : null;

  const { data: cfg, error: eCfg } = await sb
    .from('config_global')
    .select('valor,fecha_actualizacion,actualizado_por')
    .eq('clave', 'tipo_cambio_paralelo')
    .single();
  if (eCfg) throw new Error(`No pude leer config_global: ${eCfg.message}`);
  const tcActual = Number(cfg.valor);
  const difPct = r2((100 * (tcSell - tcActual)) / tcActual);

  const diasCongelado = Math.floor((Date.now() - new Date(cfg.fecha_actualizacion + 'Z').getTime()) / 86400000);

  console.log(`\n💱 TC PARALELO — Binance P2P (USDT/BOB) · ${hoy}`);
  console.log(`   SELL top5: ${top5sell.join(', ')}  → promedio ${tcSell} (mediana ${r4(mediana(top5sell))})`);
  console.log(`   BUY  top5: ${top5buy.join(', ') || '—'}  → promedio ${tcBuy ?? '—'} · spread ${spread ?? '—'}%`);
  console.log(`   volumen medio ofertado: ${volumen ?? '—'} USDT · anuncios ${sell.n} SELL / ${buy.n} BUY`);
  console.log(`   config_global: ${tcActual} (${cfg.actualizado_por}, hace ${diasCongelado} días)`);
  console.log(`   diferencia: ${difPct > 0 ? '+' : ''}${difPct}%`);

  // --- Guardarraíles -------------------------------------------------------
  let razonNoAplicado = null;
  if (tcSell < TC_MIN || tcSell > TC_MAX) {
    razonNoAplicado = `TC fuera de rango (${tcSell} no está entre ${TC_MIN} y ${TC_MAX})`;
  } else if (Math.abs(difPct) > SALTO_MAX_PCT) {
    razonNoAplicado = `Salto excesivo (${difPct}% > ${SALTO_MAX_PCT}%) — posible scrape corrupto`;
  }

  const raw = {
    sell: top5sell,
    buy: top5buy,
    mediana_sell: r4(mediana(top5sell)),
    metodo: 'promedio_top5_sell',
    tc_anterior: tcActual,
    dias_congelado: diasCongelado,
    version: 'capturar-tc-binance.mjs v1.0',
  };

  const fila = {
    tc_sell: tcSell,
    tc_buy: tcBuy,
    spread_pct: spread,
    num_anuncios_sell: sell.n,
    num_anuncios_buy: buy.n,
    promedio_volumen: volumen,
    raw_response: raw,
  };

  if (!APPLY) {
    console.log(`\n🔒 DRY-RUN — no escribí nada.`);
    console.log(`   Con --apply: ${razonNoAplicado ? `historial SÍ, config NO (${razonNoAplicado})` : `historial + config_global ${tcActual} → ${tcSell}`}\n`);
    return;
  }

  // --- Aplicar -------------------------------------------------------------
  // El UPDATE va primero para que el historial registre lo que REALMENTE pasó.
  // Si un trigger lo aborta (pasó con trigger_tc_actualizado apuntando a la tabla
  // renombrada), el error queda escrito en razon_no_aplicado en vez de perderse.
  let aplicado = false;
  if (!razonNoAplicado) {
    const { error } = await sb
      .from('config_global')
      .update({ valor: String(tcSell), actualizado_por: 'binance_p2p_hibrido', fecha_actualizacion: new Date().toISOString() })
      .eq('clave', 'tipo_cambio_paralelo');
    if (error) {
      razonNoAplicado = `UPDATE config_global falló: ${error.message}`;
      console.error(`\n❌ ${razonNoAplicado}`);
    } else {
      aplicado = true;
    }
  }

  await registrar({ ...fila, aplicado_a_config: aplicado, razon_no_aplicado: razonNoAplicado });

  if (aplicado) {
    console.log(`\n✅ config_global.tipo_cambio_paralelo: ${tcActual} → ${tcSell}`);
    console.log(`   Fila de historial escrita (aplicado_a_config=true).\n`);
  } else {
    console.log(`\n⚠️  TC NO aplicado: ${razonNoAplicado}`);
    console.log(`   Fila de historial escrita igual, con la razón. config_global sigue en ${tcActual}.\n`);
    process.exit(1);
  }
}

await main();
