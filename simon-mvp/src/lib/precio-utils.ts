/**
 * Normalización de precio — LAS DOS, porque conviven dos regímenes de tipo de cambio.
 *
 * 🔴 Antes de usar una, mirá de qué TABLA sale el dato:
 *   · `propiedades_v2_archivo` (la base vieja, congelada el 28-jul-2026) → `normalizarPrecio`
 *   · `propiedades_v2_shadow`  (la base VIVA, la que ve el cliente)      → `precioDelFeed`
 *
 * Usar la equivocada no da error: da un número creíble y falso, con ~67% de diferencia.
 */

// ─────────────────────────────────────────────────────────────────────────────
// RÉGIMEN VIEJO — dos tipos de cambio conviviendo (oficial 6,96 vs paralelo)
// ─────────────────────────────────────────────────────────────────────────────

/** El TC oficial que Bolivia tuvo clavado durante años. Hoy es una constante histórica. */
export const TC_OFICIAL = 6.96

/**
 * Propiedades con `tipo_cambio_detectado = 'paralelo'` guardaban USD físicos (billete).
 * Para compararlas con las de TC oficial se las multiplicaba por el spread.
 *
 * ⚠️ SOLO para datos de `propiedades_v2_archivo`. Sobre la base viva infla ~47%.
 */
export function normalizarPrecio(
  precioUsd: number,
  tcDetectado: string | null,
  tcParalelo: number
): number {
  if (tcDetectado === 'paralelo' && tcParalelo > 0) {
    return Math.round(precioUsd * tcParalelo / TC_OFICIAL)
  }
  return precioUsd
}

// ─────────────────────────────────────────────────────────────────────────────
// RÉGIMEN NUEVO — un solo TC (Bolivia unificó oficial y paralelo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * El precio tal como lo ve el cliente en el feed. Réplica en JS de
 * `precio_normalizado_shadow()` (migs 272 + 311) — ver `TC_NUEVO_DECISION.md`.
 *
 * El principio: la BD guarda el CRUDO con su etiqueta de moneda y convierte AL LEER.
 * Esta función existe para las pantallas que consultan la tabla directamente (el admin,
 * que necesita ver también lo que el feed esconde) y tienen que mostrar el mismo número.
 *
 *   `bob`  → el aviso publica en bolivianos → crudo ÷ TC del día
 *   resto  → crudo, sin tocar
 *
 * 🔴 `oficial_viejo` NO SE CONVIERTE — y esto se corrigió el 20-ago-2026.
 * Esta función nacía descontándolo (`crudo × 6,96 ÷ TC`), pero la **mig 311 (28-jul)**
 * ya había decidido lo contrario en la BD: que el aviso mencione el rate viejo no prueba
 * que el precio en dólares salga de ahí, y medido contra las vecinas del mismo edificio
 * vale igual sin descontar. Se publica lo que dice el anuncio y se enciende el badge
 * "Cotiza a Bs 7 · confirmar".
 *
 * El desfase costaba 40% en 129 propiedades: el cliente veía $100.581 de promedio y el
 * admin mostraba $60.526. Justo en las pantallas que el paso 1 arregló PARA que mostraran
 * el mismo número que el feed.
 *
 * 🔑 Esta función es una RÉPLICA de `precio_normalizado_shadow()`. Cuando una migración
 * cambie esa función, hay que tocar acá también — no hay nada que lo fuerce, y por eso
 * conviene verificar contra `pg_get_functiondef` antes de confiar en ella.
 *
 * @param tcDelDia `config_global.tipo_cambio_paralelo` (Binance, cron diario).
 * @returns `null` si hace falta convertir y no hay TC — para **declararlo**, no inventarlo.
 */
export function precioDelFeed(
  crudo: number | null | undefined,
  tag: string | null | undefined,
  tcDelDia: number | null | undefined
): number | null {
  const valor = Number(crudo) || 0
  if (!valor) return 0
  if (tag === 'bob') {
    if (!tcDelDia) return null
    return Math.round(valor / tcDelDia)
  }
  // `oficial_viejo` cae acá a propósito: se devuelve el crudo, igual que la BD.
  return valor
}
