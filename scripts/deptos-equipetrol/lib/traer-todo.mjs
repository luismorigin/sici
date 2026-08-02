// ═══════════════════════════════════════════════════════════════════════════
// traerTodo() — pagina un select de Supabase hasta agotar las filas.
// ═══════════════════════════════════════════════════════════════════════════
//
// EL BUG QUE CIERRA (2-ago-2026): PostgREST corta en **1.000 filas** por
// defecto, sin error y sin aviso. `propiedades_v2_shadow` pasó ese umbral
// (1.376 filas) y varios scripts quedaron viendo solo una parte, creyendo que
// veían todo. Es la misma falla en la dirección peligrosa que ya se cazó dos
// veces este mes (el audit sin `--zona`, el verificador cruzando por id):
// **lo no mirado se lee como limpio**.
//
// Cómo se descubrió: `chequear-portadas.mjs` reportó "revisadas: 1000" —un
// número sospechosamente redondo— y 3 portadas rotas del Condominio K1, cuando
// en la base había 14. Faltaban 155 props del barrido.
//
// El más caro no era ese: `prepNuevas()` de los dos cargadores hace
// `select('url')` sobre TODA la tabla para saber qué ya está cargado. Con 1.376
// filas traía 1.000 → ~376 props existentes quedaban invisibles y podían
// volver a fetchearse como si fueran nuevas.
//
// Uso:  const filas = await traerTodo(sb.from('t').select('a,b').eq('x', 1));
// El query se clona en cada página (los builders de supabase-js son
// encadenables pero de un solo uso por `await`), así que NO reutilizar la
// misma instancia afuera.

export const PAGINA = 1000;

export async function traerTodo(query, { pagina = PAGINA, max = 100_000 } = {}) {
  const filas = [];
  for (let desde = 0; desde < max; desde += pagina) {
    const { data, error } = await query.range(desde, desde + pagina - 1);
    if (error) throw error;
    const lote = data || [];
    filas.push(...lote);
    if (lote.length < pagina) return filas;   // última página
  }
  // Si se llega acá el dataset supera `max`: mejor gritar que devolver un
  // recorte silencioso, que es justo el bug que este helper existe para cerrar.
  throw new Error(`traerTodo: se superó el máximo de ${max} filas — subí \`max\` o filtrá el query`);
}
