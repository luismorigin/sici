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

// ---------------------------------------------------------------------------
// ORDEN DE PALABRAS INVERTIDO — el trigram lo penaliza y pierde el match (17-jul).
// Caso real (prop 3741): el aviso decía "Condominio SIRARI ELITE" y el catálogo tiene
// "Edificio ELITE SIRARI" (pm252, GPS a 1m) → `buscar_proyecto_fuzzy` lo hundió a 0.412 y lo
// dejó TERCERO, detrás de genéricos ("Edificio Sirari" 0.462, "Torre Sirari" 0.462). Con el
// orden correcto da 1.000. El candidato correcto SÍ venía en la lista; lo descartaba el filtro
// `score >= 0.95` de acá. Por eso el fix vive en el matcher (nuestro código) y NO en la RPC:
// `buscar_proyecto_fuzzy` la comparte el matching nocturno de PROD (n8n) → tocarla movería lo
// que se auto-aprueba en producción sin medirlo. Ver ticket de motor en el SQL del audit 17-jul.
//
// Criterio: dos nombres son el MISMO si su CONJUNTO de tokens distintivos (sin genéricos) es
// idéntico, sin importar el orden. Guardas anti-falso-positivo:
//   · exige ≥2 tokens distintivos → "Edificio Sirari" y "Torre Sirari" colapsan ambos a {sirari}
//     (1 token) y NO se dan por iguales; se quedan con su score.
//   · exige conjuntos IGUALES (no subconjunto) → "Elite Sirari" ≠ "Elite Sirari Deluxe".
//   · los números quedan como token → "Stone 3" ≠ "Stone 5" (clusters numerados intactos).
const GENERICOS = new Set(['edificio', 'edif', 'cond', 'condominio', 'torre', 'tower', 'residencia',
  'residencial', 'residence', 'residences', 'suites', 'suite', 'studios', 'studio', 'apartments',
  'apartamentos', 'departamento', 'depto', 'de', 'del', 'la', 'el', 'los', 'las']);

const tokensDe = (s) => new Set(
  (s || '').toString().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w && !GENERICOS.has(w))
);

export function mismoTokenSet(a, b) {
  const A = tokensDe(a), B = tokensDe(b);
  if (A.size < 2 || A.size !== B.size) return false;   // <2 tokens = demasiado genérico para decidir
  for (const t of A) if (!B.has(t)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// NUMERAL DE CLUSTER — romanos y arábigos son la MISMA cifra (29-jul-2026).
// `buscar_proyecto_fuzzy` trata los romanos como ruido y devuelve score 1.000 apuntando al
// edificio EQUIVOCADO del mismo cluster. Medido:
//     "Portofino IV"    → "Portofino V" 1.000 · "Condominio Portofino" 1.000   (el correcto,
//                          "CONDOMINIO PORTOFINO 4", quedaba 0.750 y afuera del umbral)
//     "Galil Parque II" → "GALIL PARQUE III" 1.000 · "Galil Parque I" 1.000
//     "Macororo 14"     → "Macororo 15" 0.667      (con arábigos el número SÍ distingue)
// Como el matcher auto-aprueba desde 0.95, un cluster con un solo edificio cargado enganchaba
// al equivocado EN SILENCIO. Lo cazó un lector el 29-jul (prop 843, Portofino IV).
//
// El fix vive acá y no en la RPC, por la misma razón de siempre: `buscar_proyecto_fuzzy` la
// comparte el matching nocturno de PROD (n8n) y tocarla movería auto-aprobaciones sin medirlas.
const ROMANOS = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12 };

/** Cifras de cluster de un nombre, con los romanos ya convertidos. "Portofino IV" → {4} */
export function numeralesDe(s) {
  const out = new Set();
  for (const t of tokensDe(s)) {
    if (/^\d{1,3}$/.test(t)) out.add(Number(t));            // "Macororo 16/17" → {16,17}
    else if (ROMANOS[t] !== undefined) out.add(ROMANOS[t]);  // "Limco II" → {2}
  }
  return out;
}

/**
 * ¿Pueden ser el mismo edificio, mirando SOLO el numeral?
 *  · ninguno tiene numeral            → sí (no aporta información)
 *  · los dos tienen y coinciden       → sí — acá es donde "Portofino 4" ↔ "PORTOFINO IV" se unen
 *  · difieren, o uno tiene y otro no  → NO. "Portofino IV" contra el genérico "Condominio
 *    Portofino" tampoco pasa: sin saber qué fase representa el genérico, adivinarlo es el
 *    falso positivo que esto viene a evitar (caso 2019, "CONDOMINIO ONE 1" vs "CONDOMINIO ONE").
 */
export function numeralCompatible(a, b) {
  const A = numeralesDe(a), B = numeralesDe(b);
  if (A.size === 0 && B.size === 0) return true;
  if (A.size !== B.size) return false;
  for (const n of A) if (!B.has(n)) return false;
  return true;
}

/**
 * @returns {Promise<{pm:number|null, confianza:number, metodo:string, auto:boolean, candidatos:Array, motivo:string}>}
 */
export async function matchearPorNombre(sb, { nombre, zona, lat, lon } = {}) {
  const nom = (nombre || '').toString().trim();
  if (!nom) {
    return { pm: null, confianza: 0, metodo: 'sin_nombre', auto: false, candidatos: [], motivo: 'el lector no extrajo nombre de edificio' };
  }

  // p_limite 15 (no 5): `mismoTokenSet` re-scorea SOLO lo que la RPC devuelve, y el trigram hunde a
  // los de orden invertido (caso pm252: vino TERCERO con 0.412). Con un top-5 el candidato correcto
  // puede quedar fuera y el fix ni lo ve. Pedir más candidatos es gratis (read-only, misma llamada) y
  // no afecta a prod: el que filtra es este matcher, no la RPC.
  const { data, error } = await sb.rpc('buscar_proyecto_fuzzy', { p_nombre: nom, p_umbral_minimo: 0.3, p_limite: 15 });
  if (error) throw error;
  const candidatos = (data || []).map((c) => ({
    pm: c.id_proyecto, nombre: c.nombre, zona: c.zona, score: Number(c.score), tipo: c.match_tipo,
  })).sort((a, b) => b.score - a.score);

  if (!candidatos.length) {
    return { pm: null, confianza: 0, metodo: 'sin_match', auto: false, candidatos: [], motivo: `"${nom}" no está en el catálogo → candidato a PM_NUEVO` };
  }

  // FUERTE = score alto del trigram  O  mismo conjunto de tokens distintivos (orden invertido).
  // `por_tokens` queda marcado para trazabilidad (el motivo lo explicita).
  for (const c of candidatos) c.por_tokens = c.score < SCORE_FUERTE && mismoTokenSet(nom, c.nombre);
  // …pero el NUMERAL manda por encima del score: el trigram da 1.000 a "Portofino V" para un
  // aviso que dice "Portofino IV". Un candidato con cifra distinta NO es fuerte, por más score
  // que traiga; y "Portofino 4" ↔ "PORTOFINO IV" sí se unen, que antes no pasaba.
  for (const c of candidatos) c.numeral_ok = numeralCompatible(nom, c.nombre);
  const fuertes = candidatos.filter((c) => (c.score >= SCORE_FUERTE || c.por_tokens) && c.numeral_ok);
  const enZona = fuertes.filter((c) => normZona(c.zona) === normZona(zona));

  // 1 fuerte ÚNICO → auto SIEMPRE (el nombre manda; el GPS es secundario y el anunciante
  // lo pone mal → la zona NO bloquea un nombre único exacto, solo baja la confianza y lo nota).
  if (fuertes.length === 1) {
    const c = fuertes[0];
    const zonaOk = !zona || normZona(c.zona) === normZona(zona);
    const via = c.por_tokens ? ` [mismos tokens, orden invertido: "${nom}" ↔ "${c.nombre}", trigram ${c.score.toFixed(2)}]` : '';
    return {
      pm: c.pm, confianza: zonaOk ? 95 : 85, metodo: zonaOk ? 'nombre_zona' : 'nombre_unico_zona_dif',
      auto: true, candidatos,
      motivo: (zonaOk
        ? `nombre exacto "${c.nombre}" + zona ${c.zona}`
        : `nombre ÚNICO exacto "${c.nombre}" (zona pm ${c.zona} ≠ depto ${zona}; el nombre manda, GPS secundario)`) + via,
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
