/**
 * Clasificación canónica de amenidades — FUENTE DE VERDAD ÚNICA (frontend).
 * Fuente estadística: Análisis SICI · Enero 2026 (base 468 propiedades activas).
 *
 * ─── Los 3 tiers ───────────────────────────────────────────────────────────
 *  1. FILTRABLE  (`filtrable:true`)  → diferenciador que además se lista BIEN en
 *     la data. Es el ÚNICO tier que aparece en el pill "Comodidades" de los feeds.
 *  2. ESTÁNDAR   (`esEstandar:true`) → canónica pero COMÚN (casi todos los
 *     edificios la tienen: Ascensor, Seguridad, Terraza…). Solo debe aparecer en
 *     "En el edificio" del modal. NUNCA filtrable (inútil filtrar por algo que
 *     todos tienen) y NUNCA en la cola larga ("Lo que la hace especial").
 *  3. DIFERENCIADOR NO FILTRABLE → distingue pero está subreportado o es raro
 *     (Pet Friendly, Parque Infantil, Jardín, Estac. visitas): se muestra si el
 *     aviso lo lista, pero no se ofrece como filtro (daría resultados vacíos).
 *
 * ─── Contrato con el pipeline (READER_SPEC del híbrido) ─────────────────────
 * El split canónico (`amenities_lista`) vs cola larga (`amenities_extra`) lo hace
 * el reader, NO el cliente. Para que las ESTÁNDAR terminen SIEMPRE en
 * `amenities_lista` (canónico → "En el edificio") y nunca caigan a la cola, el
 * vocabulario canónico del reader debe ser un SUPERCONJUNTO de las claves de este
 * archivo. Al agregar una amenidad nueva: registrarla acá con su tier Y en el
 * READER_SPEC (`scripts/deptos-equipetrol/READER_SPEC.md`, § amenidades_canonico)
 * + su icono en `lib/amenity-icons.tsx`. Este archivo manda; el reader lo mirrorea.
 *
 * Consumo: los feeds derivan su lista de filtro de `AMENIDADES_FILTRABLES` (no
 * hardcodear) — así escala y no hay drift entre ventas y alquileres.
 */

export interface AmenidadMercado {
  porcentaje: number      // % de propiedades que la listan (según publicaciones)
  esDestacado: boolean    // diferenciador de venta (<40% del mercado)
  esEstandar: boolean     // común en Equipetrol (no mostrar %; solo "En el edificio")
  filtrable: boolean      // aparece en el pill "Comodidades" de los feeds
  label: string           // nombre para mostrar
}

export const AMENIDADES_MERCADO: Record<string, AmenidadMercado> = {
  // ── TIER 1 · FILTRABLES ── (orden = orden de los chips en el pill Comodidades)
  'Piscina': { porcentaje: 63, esDestacado: false, esEstandar: false, filtrable: true, label: 'Piscina' },
  'Churrasquera': { porcentaje: 48, esDestacado: false, esEstandar: false, filtrable: true, label: 'Churrasquera' },
  'Gimnasio': { porcentaje: 29, esDestacado: true, esEstandar: false, filtrable: true, label: 'Gimnasio' },
  'Co-working': { porcentaje: 11, esDestacado: true, esEstandar: false, filtrable: true, label: 'Co-working' },
  'Salón de Eventos': { porcentaje: 17, esDestacado: true, esEstandar: false, filtrable: true, label: 'Salón de Eventos' },
  'Sauna/Jacuzzi': { porcentaje: 35, esDestacado: true, esEstandar: false, filtrable: true, label: 'Sauna/Jacuzzi' },
  // ── TIER 3 · DIFERENCIADORES NO FILTRABLES ── (raros o subreportados en la data)
  'Estacionamiento para Visitas': { porcentaje: 21, esDestacado: true, esEstandar: false, filtrable: false, label: 'Parqueo visitas' },
  'Pet Friendly': { porcentaje: 19, esDestacado: true, esEstandar: false, filtrable: false, label: 'Pet Friendly' },
  'Parque Infantil': { porcentaje: 4, esDestacado: true, esEstandar: false, filtrable: false, label: 'Parque Infantil' },
  'Jardín': { porcentaje: 1, esDestacado: true, esEstandar: false, filtrable: false, label: 'Jardín' },
  // ── TIER 2 · ESTÁNDAR ── comunes; solo "En el edificio", nunca filtro nunca %
  'Seguridad 24/7': { porcentaje: 55, esDestacado: false, esEstandar: true, filtrable: false, label: 'Seguridad 24/7' },
  'Terraza/Balcón': { porcentaje: 43, esDestacado: false, esEstandar: true, filtrable: false, label: 'Terraza' },
  'Área Social': { porcentaje: 27, esDestacado: false, esEstandar: true, filtrable: false, label: 'Área Social' },
  'Ascensor': { porcentaje: 26, esDestacado: false, esEstandar: true, filtrable: false, label: 'Ascensor' },
  'Recepción': { porcentaje: 17, esDestacado: false, esEstandar: true, filtrable: false, label: 'Recepción' },
  'Lavadero': { porcentaje: 1, esDestacado: false, esEstandar: true, filtrable: false, label: 'Lavadero' },
}

/**
 * Amenidades que se ofrecen como FILTRO (pill "Comodidades"), en orden de chip.
 * Derivada del flag `filtrable` — ÚNICA fuente. Los feeds NO deben hardcodear.
 */
export const AMENIDADES_FILTRABLES: string[] =
  Object.keys(AMENIDADES_MERCADO).filter(k => AMENIDADES_MERCADO[k].filtrable)

/**
 * Amenidades ESTÁNDAR (comunes). Solo "En el edificio"; nunca filtro ni cola larga.
 * El reader debe mandarlas siempre a `amenities_lista` (canónico).
 */
export const AMENIDADES_ESTANDAR: string[] =
  Object.keys(AMENIDADES_MERCADO).filter(k => AMENIDADES_MERCADO[k].esEstandar)

// Mapeo de innegociables del formulario a nombres de amenidades
export const INNEGOCIABLES_A_AMENIDAD: Record<string, string> = {
  'piscina': 'Piscina',
  'gimnasio': 'Gimnasio',
  'seguridad': 'Seguridad 24/7',
  'estacionamiento': 'Estacionamiento para Visitas',
  'areas_verdes': 'Jardín',
  'pet_friendly': 'Pet Friendly',
  'salon_eventos': 'Salón de Eventos',
  'coworking': 'Co-working',
}

/**
 * Obtiene el % de mercado para una amenidad
 */
export function getPorcentajeMercado(amenidad: string): number | null {
  return AMENIDADES_MERCADO[amenidad]?.porcentaje || null
}

/**
 * Verifica si una amenidad es un diferenciador (< 40% del mercado la tiene)
 */
export function esAmenidadDestacada(amenidad: string): boolean {
  return AMENIDADES_MERCADO[amenidad]?.esDestacado || false
}

/**
 * Verifica si una amenidad es estándar en Equipetrol (no mostrar %)
 */
export function esAmenidadEstandar(amenidad: string): boolean {
  return AMENIDADES_MERCADO[amenidad]?.esEstandar || false
}

/**
 * Verifica si una amenidad se ofrece como filtro en los feeds.
 */
export function esAmenidadFiltrable(amenidad: string): boolean {
  return AMENIDADES_MERCADO[amenidad]?.filtrable || false
}

/**
 * Convierte innegociables del formulario a nombres de amenidades
 */
export function innegociablesToAmenidades(innegociables: string[]): string[] {
  return innegociables
    .map(i => INNEGOCIABLES_A_AMENIDAD[i])
    .filter(Boolean)
}
