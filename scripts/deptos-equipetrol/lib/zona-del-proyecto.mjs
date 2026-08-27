// ============================================================================
// La zona de un aviso matcheado la manda su EDIFICIO, no su pin
// ----------------------------------------------------------------------------
// 🔴 EL PROBLEMA (medido el 27-ago-2026, lo levantó lab-kapso auditando el bot)
// El cargador escribía `zona` calculada desde el GPS **del aviso**, y el pin que
// publican los portales suele estar corrido. Resultado: el mismo edificio aparece
// en zonas distintas. Onix Art By EliTe, 12 anuncios:
//
//        10 → Sirari             (la zona real, la de su proyecto)
//         1 → Eq. 3er Anillo     (id 8000145)
//         1 → Equipetrol Centro  (id 8000110)
//
// En la base viva son **13 proyectos y 21 anuncios** con la zona distinta de la de
// su edificio. El efecto en cualquier cosa que filtre por zona: quien pide
// "Equipetrol Oeste" no ve las unidades de ese edificio que quedaron etiquetadas en
// otra parte. Del mismo edificio, a la misma dirección.
//
// 🔑 EL MATCHER YA DESCONFIABA DE ESA ZONA. `matchearPorNombre()` no bloquea un
// nombre único exacto porque la zona del aviso no coincida — sólo baja la confianza,
// con el comentario "el captador lo pone mal". O sea: el matcher sabía que el dato
// era poco fiable y el cargador lo guardaba igual. Esto cierra esa contradicción.
//
// ⚠️ NO se toca el GPS del aviso. Sigue siendo el del aviso, y está bien: sirve para
// el mapa y para medir distancia al edificio (la alarma de "avisos lejos de su PM"
// depende de eso). Lo único que pasa a heredarse es la ZONA, que es una etiqueta de
// pertenencia y no una coordenada.
// ============================================================================

/** Caché por corrida: un edificio se repite muchas veces en el mismo lote. */
const _cache = new Map();

/**
 * Zona del proyecto master, o `null` si no hay ninguna usable.
 *
 * 🔑 `'Sin zona'` devuelve null A PROPÓSITO — y no es un detalle. Ese valor significa
 * dos cosas distintas: "no se pudo calcular" y "el edificio está fuera de todos los
 * polígonos de cobertura, correctamente". Medido antes de escribir esto: de los
 * proyectos con esa etiqueta, 18 de 19 eran del segundo caso. Heredarla sacaría al
 * aviso del feed sin que nada falle, así que ante la duda se conserva la del aviso.
 */
export async function zonaDelProyecto(sb, pm) {
  if (pm == null) return null;
  if (_cache.has(pm)) return _cache.get(pm);

  const { data, error } = await sb
    .from('proyectos_master')
    .select('zona')
    .eq('id_proyecto_master', pm)
    .maybeSingle();

  // Un fallo de red no debe cambiar la zona: se devuelve null y el llamador se queda
  // con la del aviso, que es el comportamiento de antes.
  if (error) {
    console.warn(`   ⚠️ no se pudo leer la zona del proyecto ${pm}: ${error.message} — queda la del aviso`);
    return null;
  }

  const z = data?.zona && data.zona !== 'Sin zona' ? data.zona : null;
  _cache.set(pm, z);
  return z;
}

/**
 * La zona que se escribe en la fila: la del edificio si la hay, si no la del aviso.
 * Devuelve además si hubo corrección, para poder declararlo en el log — un cambio
 * silencioso de zona es justamente lo que nadie vio durante meses.
 */
export function resolverZonaFila(zonaAviso, zonaPm) {
  if (zonaPm && zonaPm !== zonaAviso) {
    return { zona: zonaPm, corregida: true, desde: zonaAviso ?? '(sin zona)' };
  }
  return { zona: zonaAviso ?? null, corregida: false, desde: null };
}
