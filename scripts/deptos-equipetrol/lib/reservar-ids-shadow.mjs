// ============================================================================
// RESERVA ATÓMICA DE IDs PARA propiedades_v2_shadow
// ----------------------------------------------------------------------------
// Lo comparten los DOS cargadores (venta y alquiler) a propósito: eran gemelos con el
// mismo bloque de código duplicado, y esa duplicación fue parte del problema — el fix del
// 17-jul se pensó una vez y se copió dos, así que el agujero que quedó abierto quedó
// abierto por partida doble. Acá vive una sola vez.
//
// POR QUÉ EXISTE (incidente 24-jul-2026)
// El patrón viejo era leer el máximo y numerar desde ahí:
//     max = SELECT MAX(id) ... ; id = ++max
// Correcto mientras las capturas corran una después de la otra. Esa noche la máquina
// estuvo apagada durante la ventana nocturna y el scheduler lanzó las 3 routines JUNTAS al
// arrancar: venta y alquiler leyeron el mismo máximo (8000197), las dos numeraron desde
// 8000198 y la que escribió última pisó las filas de la otra (2 alquileres perdidos).
//
// `nextval()` en cambio es atómico: dos procesos concurrentes nunca reciben el mismo
// número. No hace el choque menos probable — lo hace imposible. Ver mig 298.
//
// Los ids se piden TODOS JUNTOS al inicio del prep (una sola ida a la base) y se van
// consumiendo del pool. Si un fetch falla, su id queda sin usar: es un hueco en la
// numeración, inofensivo (un id es una etiqueta, no un contador de nada).
// ============================================================================

/**
 * Reserva `cantidad` ids nuevos del rango 8M, de forma atómica.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb  cliente con service_role
 * @param {number} cantidad  cuántos ids apartar (>= 1)
 * @returns {Promise<number[]>} ids ya reservados, en orden ascendente
 */
export async function reservarIdsShadow(sb, cantidad) {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new Error(`reservarIdsShadow: cantidad inválida (${cantidad})`);
  }

  const { data, error } = await sb.rpc('reservar_ids_shadow', { p_cantidad: cantidad });
  if (error) {
    // Falla RUIDOSA a propósito: sin ids no se puede escribir nada, y seguir con un
    // fallback a MAX(id)+1 reintroduciría justo el bug que esta función elimina.
    throw new Error(
      `No se pudieron reservar ${cantidad} ids shadow: ${error.message}. ` +
      `¿Está aplicada la migración 298 (reservar_ids_shadow)?`
    );
  }

  // PostgREST devuelve SETOF bigint como array de escalares, pero según versión puede
  // venir envuelto en objetos ({reservar_ids_shadow: 8000242}) y los bigint como string.
  const ids = (data || [])
    .map((fila) => (fila !== null && typeof fila === 'object' ? Object.values(fila)[0] : fila))
    .map(Number)
    .filter((n) => Number.isFinite(n));

  if (ids.length !== cantidad) {
    throw new Error(
      `reservarIdsShadow: se pidieron ${cantidad} ids y la base devolvió ${ids.length}. ` +
      `Abortado para no escribir con ids inventados.`
    );
  }
  return ids;
}
