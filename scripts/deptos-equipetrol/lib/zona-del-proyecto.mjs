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
  const VACIO = { zona: null, latitud: null, longitud: null };
  if (pm == null) return VACIO;
  if (_cache.has(pm)) return _cache.get(pm);

  const { data, error } = await sb
    .from('proyectos_master')
    .select('zona, latitud, longitud')
    .eq('id_proyecto_master', pm)
    .maybeSingle();

  // Un fallo de red no debe cambiar la zona: se devuelve vacío y el llamador se queda
  // con la del aviso, que es el comportamiento de antes.
  if (error) {
    console.warn(`   ⚠️ no se pudo leer el proyecto ${pm}: ${error.message} — queda la zona del aviso`);
    return VACIO;
  }

  const r = {
    zona: data?.zona && data.zona !== 'Sin zona' ? data.zona : null,
    latitud: data?.latitud ?? null,
    longitud: data?.longitud ?? null,
  };
  _cache.set(pm, r);
  return r;
}

/** Distancia en km entre dos puntos. Null si falta alguna coordenada. */
function km(lat1, lon1, lat2, lon2) {
  if ([lat1, lon1, lat2, lon2].some((v) => v == null || Number.isNaN(Number(v)))) return null;
  const R = 6371, rad = (d) => (Number(d) * Math.PI) / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 🔴 A MÁS DE ESTO, NO SE HEREDA. Un pin del portal se corre unos metros o un par de
 * cuadras; no se va a 4 km. Medido sobre las 86 filas que había que corregir el
 * 27-ago: 39 a menos de 500 m, 25 hasta 1 km, 16 hasta 2 km — y **6 entre 2,7 y 4,0
 * km**, todas de Zona Norte y todas con el GPS del edificio VERIFICADO VISUALMENTE.
 *
 * Si el edificio está bien ubicado y el aviso queda a 4 km, lo que falla no es el
 * pin: es el MATCH. Heredar ahí no arregla nada — le pone al aviso la etiqueta de un
 * edificio que no es el suyo, y encima consolida un match dudoso haciéndolo parecer
 * coherente. Se deja la zona del aviso y que lo levante el audit, que para eso está
 * la superficie de "avisos lejos de su edificio".
 */
const KM_MAX_PARA_HEREDAR = 2;

/**
 * La zona que se escribe en la fila: la del edificio si la hay y si el aviso está
 * razonablemente cerca de él; si no, la del aviso.
 *
 * Devuelve además si hubo corrección y si se frenó por distancia, para declararlo en
 * el log — un cambio silencioso de zona es justamente lo que nadie vio durante meses,
 * y un cambio *no* hecho en silencio sería igual de opaco.
 *
 * @param {object} [gps] {latAviso, lonAviso, latPm, lonPm} — sin esto no hay control
 *   de distancia y se hereda igual (comportamiento de cuando falta el dato).
 */
export function resolverZonaFila(zonaAviso, zonaPm, gps = null) {
  if (!zonaPm || zonaPm === zonaAviso) {
    return { zona: zonaAviso ?? null, corregida: false, desde: null, lejos: null };
  }

  const d = gps ? km(gps.latAviso, gps.lonAviso, gps.latPm, gps.lonPm) : null;
  if (d != null && d > KM_MAX_PARA_HEREDAR) {
    // No se hereda, pero SÍ se reporta: es un match para mirar, no un caso cerrado.
    return { zona: zonaAviso ?? null, corregida: false, desde: null, lejos: Number(d.toFixed(2)) };
  }

  return { zona: zonaPm, corregida: true, desde: zonaAviso ?? '(sin zona)', lejos: null };
}
