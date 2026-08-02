// ═══════════════════════════════════════════════════════════════════════════
// fetchAllRows() — trae TODAS las filas de un query, paginando.
// ═══════════════════════════════════════════════════════════════════════════
//
// EL PROBLEMA: PostgREST (la capa REST de Supabase) corta en **1.000 filas** por
// defecto. No devuelve error, no avisa: simplemente entrega 1.000 y el código
// sigue como si fueran todas. En una consulta que alimenta KPIs de mercado eso
// no rompe nada visible — solo hace que las medianas, los $/m² y los conteos se
// calculen sobre una parte del inventario y se muestren como si fueran el total.
//
// Se cazó el 2-ago-2026 del lado de los scripts: `propiedades_v2_shadow` pasó
// las 1.000 filas y tres scripts del híbrido quedaron leyendo de menos (los
// cargadores perdían ~376 urls, el chip pet-friendly 47 unidades, el barrido de
// portadas 155 props). Ver la memoria `project_limite_1000_filas_postgrest`.
//
// El frontend NO estaba roto ese día —su consulta más grande iba por 833 de
// 1.000— pero tampoco estaba protegido, y al ritmo medido en los snapshots
// (~2-5 props netas por día) cruzaba el umbral en 1 a 3 meses. Esto lo cierra
// antes de que pase, porque el modo de falla es silencioso: cuando ocurra, los
// números del feed van a estar mal sin que nada lo indique.
//
// 🔑 Señal de alarma barata: un total exactamente redondo (1000, 2000) casi
// siempre es un límite, no un dato.

const PAGINA = 1000

// El builder de supabase-js es "thenable": encadenar .range() sobre la misma
// instancia funciona porque cada await dispara un request nuevo con el header
// Range actualizado. Se tipa laxo a propósito — los helpers de datos ya castean
// el resultado a sus propios tipos (RawPropiedadMercado y compañía).
interface RangeableQuery<T> {
  range(desde: number, hasta: number): PromiseLike<{ data: T[] | null; error: unknown }>
}

/**
 * Pagina un query de Supabase hasta agotar las filas.
 *
 * @param query   query ya construido (con sus .select/.eq/.in aplicados)
 * @param etiqueta nombre para el warning si se alcanza el tope de seguridad
 * @param max     tope duro; evita un bucle infinito si algo devuelve siempre lleno
 */
export async function fetchAllRows<T>(
  query: RangeableQuery<T>,
  etiqueta = 'query',
  max = 20_000,
): Promise<T[]> {
  const filas: T[] = []
  for (let desde = 0; desde < max; desde += PAGINA) {
    const { data, error } = await query.range(desde, desde + PAGINA - 1)
    if (error) throw error
    const lote = data || []
    filas.push(...lote)
    if (lote.length < PAGINA) return filas
  }
  // Preferimos gritar antes que devolver un recorte callado: devolver de menos
  // en silencio es justo el bug que este helper existe para cerrar.
  console.warn(`[fetchAllRows] "${etiqueta}" alcanzó el tope de ${max} filas — subí max o filtrá el query`)
  return filas
}
