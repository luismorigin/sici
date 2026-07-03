// ============================================================================
// MATCHER NAME-FIRST (deptos) — matchea por NOMBRE leído, GPS secundario
// ----------------------------------------------------------------------------
// Replica lo que hace el lector a mano: recibe el nombre CANÓNICO que el lector
// extrajo del texto (slug/título/descripción, ya normalizado — "Stone III"→"Stone 3"),
// busca por nombre en el catálogo (`buscar_proyecto_fuzzy`, RPC read-only) y corrobora
// con la ZONA. El GPS NO maneja (los anunciantes lo ponen mal) — a lo sumo desempata.
//
// Reglas (alineadas al CONTRATO_FEED "Matching de edificios"):
//   • NOMBRE primero. `buscar_proyecto_fuzzy` da candidatos con score (alias_exacto/
//     nombre_normalizado = 1.0/0.95; trigram < según similitud) + zona.
//   • AUTO solo si hay UN candidato "fuerte" (score ≥ 0.95) y la zona corrobora
//     (o es el único fuerte). Todo lo demás → al LECTOR (no adivina el script).
//   • Sin nombre → 'sin_nombre' (NUNCA forzar por GPS). Lo levanta el audit/lector.
//
// NO escribe nada. Devuelve la decisión; el que llama la aplica.
// ============================================================================

const SCORE_FUERTE = 0.95; // alias_exacto (1.0) o nombre_normalizado (0.95) = match de nombre real

// Normaliza para comparar zonas (tolera acentos/caso). Las zonas del depto y del pm
// deberían coincidir textualmente (mismas 6 zonas Equipetrol), pero por las dudas.
const normZona = (z) => (z || '').toString().trim().toLowerCase()
  .normalize('NFD').replace(/\p{Diacritic}/gu, '');

/**
 * @returns {Promise<{pm:number|null, confianza:number, metodo:string, auto:boolean, candidatos:Array, motivo:string}>}
 */
export async function matchearPorNombre(sb, { nombre, zona, lat, lon } = {}) {
  const nom = (nombre || '').toString().trim();
  if (!nom) {
    return { pm: null, confianza: 0, metodo: 'sin_nombre', auto: false, candidatos: [], motivo: 'el lector no extrajo nombre de edificio' };
  }

  const { data, error } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: nom, p_umbral_minimo: 0.3, p_limite: 5 });
  if (error) throw error;
  const candidatos = (data || []).map((c) => ({
    pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score), tipo: c.match_tipo,
  })).sort((a, b) => b.score - a.score);

  if (!candidatos.length) {
    return { pm: null, confianza: 0, metodo: 'sin_match', auto: false, candidatos: [], motivo: `"${nom}" no está en el catálogo → candidato a PM_NUEVO` };
  }

  const fuertes = candidatos.filter((c) => c.score >= SCORE_FUERTE);
  const enZona = fuertes.filter((c) => normZona(c.zona) === normZona(zona));

  // 1 fuerte ÚNICO → auto SIEMPRE (el nombre manda; el GPS es secundario y el anunciante
  // lo pone mal → la zona NO bloquea un nombre único exacto, solo baja la confianza y lo nota).
  if (fuertes.length === 1) {
    const c = fuertes[0];
    const zonaOk = !zona || normZona(c.zona) === normZona(zona);
    return {
      pm: c.pm, confianza: zonaOk ? 95 : 85, metodo: zonaOk ? 'nombre_zona' : 'nombre_unico_zona_dif',
      auto: true, candidatos,
      motivo: zonaOk
        ? `nombre exacto "${c.nombre}" + zona ${c.zona}`
        : `nombre ÚNICO exacto "${c.nombre}" (zona pm ${c.zona} ≠ depto ${zona}; el nombre manda, GPS secundario)`,
    };
  }
  // varios fuertes (mismo nombre en distintas zonas) → la ZONA desempata
  if (fuertes.length > 1) {
    if (enZona.length === 1) {
      const c = enZona[0];
      return { pm: c.pm, confianza: 95, metodo: 'nombre_zona_desempate', auto: true, candidatos, motivo: `${fuertes.length} "${c.nombre}"; desempata zona ${c.zona}` };
    }
    return { pm: null, confianza: 0, metodo: 'ambiguo', auto: false, candidatos, motivo: `${fuertes.length} candidatos fuertes, zona no desempata → lector` };
  }
  // ningún fuerte (solo trigram < 0.95) → el lector decide entre candidatos
  return { pm: null, confianza: Math.round(candidatos[0].score * 100), metodo: 'fuzzy_debil', auto: false, candidatos, motivo: `sin match exacto (mejor ${candidatos[0].nombre} ${candidatos[0].score}) → lector` };
}
