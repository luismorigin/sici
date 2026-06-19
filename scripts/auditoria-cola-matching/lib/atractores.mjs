// lib/atractores.mjs — pre-filtro barato (token/regex) para la auditoría de cola.
//
// NO decide el match. Solo PRIORIZA: marca qué sugerencias son sospechosas para que
// el juez (subagente-lector) las mire con más cuidado, y detecta los SIN_NOMBRE obvios
// que ni vale la pena fetchear. El veredicto final SIEMPRE lo da la lectura del anuncio.
//
// Dos patrones de falla del motor, aprendidos auditando ZN (jun-2026):
//  1. ATRACTORES: un pm cuyo distintivo es corto/genérico colapsa en fuzzy y "atrae"
//     decenas de props que son otros edificios (ej. CONDOMINIO ONE, Sky Aqualina, Brickell).
//  2. CLUSTERS NUMERADOS: el motor confunde el número/torre (Macororó 13/14 ≠ 15,
//     Tamisa 2 ≠ III, Galil Parque I ≠ III). normalizeNombre borra romanos → frágil.

// Familias de cluster conocidas en SC (el número/romano manda dentro de la familia).
export const FAMILIAS_CLUSTER = [
  'macororo', 'macororó', 'tamisa', 'brickell', 'portofino', 'portobello', 'stone',
  'galil', 'jazmines', 'vilareal', 'villareal', 'vertical', 'isuto', 'curupau',
  'leblon', 'sky', 'uptown', 'trivento', 'baruc', 'sirari',
];

// Atractores conocidos (pm que históricamente generan falsos positivos por fuzzy).
// Se amplía solo con evidencia de auditoría — no inventar.
export const ATRACTORES_CONOCIDOS = [
  'condominio one', 'sky aqualina', 'brickell', 'portofino beni',
];

// Marca de ubicación / basura que NO es nombre de edificio (para detectar SIN_NOMBRE).
const NO_ES_NOMBRE = /^(venta|alquiler|anticretico|monoambiente|departamento|incluye|excelente|moderno|exclusivo|zona|norte|sur|planta|piso|parqueo|en venta|venta zona|de \d|nuevo|preventa)\b/i;

// Devuelve { es_cluster, familia, numero_pm, distintivo_corto, es_atractor }
export function analizarPm(nombreOficial) {
  const n = (nombreOficial || '').toLowerCase().trim();
  const familia = FAMILIAS_CLUSTER.find((f) => n.includes(f)) || null;
  const numero_pm = extraerNumero(n);
  const es_atractor = ATRACTORES_CONOCIDOS.some((a) => n === a || n.includes(a));
  // distintivo corto: la parte no-genérica del nombre tiene ≤3 letras (ONE, ITO, ZEN…)
  const tokens = n.replace(/condominio|edificio|torre|residence|residenze|condom\.?/gi, '').trim().split(/\s+/).filter(Boolean);
  const distintivo_corto = tokens.some((t) => /^[a-z]{1,3}$/.test(t));
  return { es_cluster: !!familia, familia, numero_pm, distintivo_corto, es_atractor };
}

// Pre-clasifica UNA sugerencia (sin leer el anuncio aún).
// nivel: 'sin_nombre_probable' | 'cluster_riesgo' | 'atractor_riesgo' | 'revisar'
// El juez (subagente) confirma/refuta SIEMPRE; esto solo ordena la cola.
export function preclasificar({ nombreEdificio, tituloDiscovery, pmNombre, score, distMetros }) {
  const pm = analizarPm(pmNombre);
  const ne = (nombreEdificio || '').trim();
  const tieneNombrePropio = ne.length > 3 && !NO_ES_NOMBRE.test(ne);

  let nivel = 'revisar';
  const flags = [];

  if (pm.es_atractor) { nivel = 'atractor_riesgo'; flags.push(`pm "${pmNombre}" es atractor conocido`); }
  if (pm.es_cluster) {
    const numEd = extraerNumero(ne);
    if (pm.numero_pm && numEd && pm.numero_pm !== numEd) {
      nivel = 'cluster_riesgo';
      flags.push(`cluster ${pm.familia}: edificio dice "${numEd}", pm dice "${pm.numero_pm}"`);
    } else if (pm.numero_pm || numEd) {
      flags.push(`cluster numerado (${pm.familia}) — verificar número exacto en anuncio`);
    }
  }
  if (pm.distintivo_corto && Number(score) >= 85) {
    flags.push(`pm con distintivo ≤3 letras + score alto (${score}) — riesgo de colapso fuzzy`);
  }
  if (!tieneNombrePropio && !(distMetros != null && distMetros <= 30)) {
    nivel = 'sin_nombre_probable';
    flags.push('prop sin nombre_edificio propio (verificar si el anuncio lo menciona)');
  }

  return { nivel, flags, pm };
}

// Extrae el número de un nombre de cluster: arábigo, romano o rango "13/14".
export function extraerNumero(s) {
  if (!s) return null;
  const rango = s.match(/\b(\d{1,3})\s*[\/\-]\s*(\d{1,3})\b/);
  if (rango) return `${rango[1]}/${rango[2]}`;
  const arab = s.match(/\b(\d{1,3})\b/);
  if (arab) return arab[1];
  const rom = s.match(/\b(IX|IV|V?I{1,3}|X{1,2}I{0,3})\b/i);
  if (rom) return romanoANumero(rom[1].toUpperCase());
  return null;
}

function romanoANumero(r) {
  const map = { I: 1, V: 5, X: 10 };
  let total = 0, prev = 0;
  for (let i = r.length - 1; i >= 0; i--) {
    const v = map[r[i]] || 0;
    total += v < prev ? -v : v;
    prev = v;
  }
  return total ? String(total) : null;
}
