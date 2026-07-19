// ============================================================================
// CLASIFICACIÓN DE TIPO DE CAMBIO (deptos) — paralelo vivo de Binance, no umbral fijo
// ----------------------------------------------------------------------------
// La única etiqueta que cambia el precio del feed es 'paralelo' (precio_normalizado
// infla precio_usd × paralelo/6.96 ≈ ×1.43). 'oficial' y 'no_especificado' → directo.
// Falso-positivo de paralelo = el bug histórico que infló 368 deptos. Por eso el
// clasificador es CONSERVADOR: NUNCA asume paralelo ni oficial desde señal débil.
//
// 🔑 PRECEDENCIA (validado 2-jul con id 3521): el TEXTO es la fuente de verdad de precio+TC.
// Las señales estructuradas (C21 precioFormat = precioVenta/6.96 SIEMPRE; Remax
// exchange_rate_amount = tasa GLOBAL del portal, 9.78 idéntica en TODOS los anuncios;
// Remax price_in_dollars = conversión, puede subvaluar) son CONVENIENCIA y engañan → son
// FALLBACK. El lector lee el texto PRIMERO; el ratio del portal solo desempata si el texto calla.
//   Orden del lector:
//   1) texto dice "paralelo" / "al día"                    → 'paralelo' (precio = USD billete del texto)
//   2) texto dice "TC 7" / "oficial" / "a Bs 7"            → 'oficial' (regla TC 7 = oficial)
//   3) texto CALLA → ratio BOB/USD (o Remax exchange_rate) vs paralelo-vivo: ≈paralelo→'paralelo', ≈6.96→'no_especificado'
//   (ej. 3521: Remax global 9.78 diría paralelo, pero el texto dice "Oficial a Bs 7" → gana oficial)
//
// ⚠️ TRANSICIÓN (2-jul-2026): el TC oficial se está UNIFICANDO en Bolivia. Los anuncios
// viejos siguen cotizando 6.96 / "TC 7" (oficial-viejo) y tardarán en re-alinearse a los
// nuevos valores. El manejo del NUEVO oficial unificado se hará DESPUÉS (post-comparación
// con la base actual), para no ensuciar la comparación. Por ahora 6.96/"TC 7" = oficial-viejo.
// ============================================================================

// Lee los TC vivos de config_global: oficial (BCB, fijo) + paralelo (dinámico Binance P2P).
export async function cargarTC(sb) {
  const { data, error } = await sb.from('config_global').select('clave,valor')
    .in('clave', ['tipo_cambio_oficial', 'tipo_cambio_paralelo']);
  if (error) throw error;
  const m = Object.fromEntries((data || []).map((r) => [r.clave, Number(r.valor)]));
  return { oficial: m.tipo_cambio_oficial || 6.96, paralelo: m.tipo_cambio_paralelo || null };
}

// Clasifica por el ratio BOB/USD que implica el anuncio (Remax: exchange_rate_amount;
// C21: precioVenta_BOB / precio_del_texto), contra el paralelo VIVO.
// Devuelve SOLO 'paralelo' o 'no_especificado' — el 'oficial' explícito lo decide el
// LECTOR desde el texto ("TC 7"/"oficial"), no el ratio (que con 6.96 es el default de C21).
export function clasificarTCporRatio(ratio, { oficial = 6.96, paralelo, tol = 0.06 } = {}) {
  const r = Number(ratio);
  if (!Number.isFinite(r) || r <= 0) return 'no_especificado';
  if (paralelo) {
    if (Math.abs(r - paralelo) / paralelo <= tol) return 'paralelo';   // ≈ paralelo vivo
    if (r >= (oficial + paralelo) / 2) return 'paralelo';              // por encima del punto medio
  }
  return 'no_especificado';                                            // ≈ 6.96 o indeterminado
}
