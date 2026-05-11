// Comparación BD vs scraped para feed /alquileres.
// Buckets de similitud (Levenshtein normalizado) idénticos a venta.
// Flags semánticos Tier A: amoblado, expensas, mascotas, precio.
// Decisión 2026-05-10: limitar a 4 flags de alta señal en alquiler.
// Ver `scripts/auditoria-feed-alquileres/README.md` para el rationale.

const SEMANTIC_TERMS = [
  // Amoblado/sin amoblar — dato comercial central, broker rota frecuentemente
  { key: 'amoblado', pattern: /\b(?:amoblad[oa]s?|amueblad[oa]s?|furnished|equipad[oa]\s+con\s+(?:muebles|mobiliari))\b/i },
  // Expensas — "incluye expensas" ↔ "expensas aparte" cambia precio neto al inquilino
  { key: 'expensas', pattern: /\bexpensas?\b|\bservici[oa]s?\s+inclu/i },
  // Mascotas — dato decisivo para inquilino
  { key: 'mascotas', pattern: /\bmascotas?\b|\bpet[s]?\s+friendly\b|\bse\s+admiten?\s+mascotas?\b|\bno\s+(?:se\s+)?(?:admiten?|permite[n]?)\s+mascotas?\b/i },
  // Precio — números explícitos en BOB o USD
  { key: 'precio', pattern: /\bbs\.?\s?\d{2,}|\b\$\s?us?\.?\s?\d{2,}|\busd?\s?\d{2,}/i },
];

export function compararDescripciones(descBd, descScraped) {
  const a = normalizar(descBd || '');
  const b = normalizar(descScraped || '');
  const lenA = a.length;
  const lenB = b.length;
  const dist = lenA && lenB ? levenshtein(a, b) : Math.max(lenA, lenB);
  const maxLen = Math.max(lenA, lenB) || 1;
  const similitud_pct = Math.round((1 - dist / maxLen) * 1000) / 10;

  const palabrasBd = setPalabras(a);
  const palabrasScr = setPalabras(b);
  const agregadas = [...palabrasScr].filter((p) => !palabrasBd.has(p));
  const quitadas = [...palabrasBd].filter((p) => !palabrasScr.has(p));

  const flags = {};
  for (const { key, pattern } of SEMANTIC_TERMS) {
    const inBd = pattern.test(descBd || '');
    const inScr = pattern.test(descScraped || '');
    if (!inBd && inScr) flags[`${key}_aparecio`] = true;
    else if (inBd && !inScr) flags[`${key}_desaparecio`] = true;
  }

  return {
    similitud_pct,
    len_bd: (descBd || '').length,
    len_scraped: (descScraped || '').length,
    palabras_agregadas: dedupFreq(agregadas).slice(0, 30),
    palabras_quitadas: dedupFreq(quitadas).slice(0, 30),
    flags_semanticos: flags,
    bucket: bucketDeSimilitud(similitud_pct),
    tiene_flag_semantico: Object.keys(flags).length > 0,
  };
}

export function bucketDeSimilitud(pct) {
  if (pct < 70) return 'reescrita';
  if (pct < 90) return 'cambio_relevante';
  if (pct < 99) return 'cambio_menor';
  return 'identicas';
}

function normalizar(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function setPalabras(s) {
  const set = new Set();
  for (const w of s.split(/\s+/)) {
    if (w.length >= 3) set.add(w);
  }
  return set;
}

function dedupFreq(arr) {
  return [...new Set(arr)];
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array(n + 1);
  let curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}
