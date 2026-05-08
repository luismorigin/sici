const SEMANTIC_TERMS = [
  { key: 'amoblado', pattern: /\bamoblad[oa]s?\b|\bamueblad[oa]s?\b|\bequipad[oa]s?\b/i },
  { key: 'preventa', pattern: /\bpreventa\b|\bpre[\s-]?venta\b/i },
  { key: 'entrega_inmediata', pattern: /\bentrega\s+inmediata\b|\bdisponible\s+inmediata/i },
  { key: 'negociable', pattern: /\bnegociable\b|\bse\s+negocia\b/i },
  { key: 'urgente', pattern: /\burgente\b|\bventa\s+urgente\b|\bremate\b/i },
  { key: 'rebajado', pattern: /\brebajad[oa]\b|\boferta\b|\bdescuento\b|\bbaja\s+de\s+precio\b/i },
  { key: 'precio', pattern: /\$\s?\d{2,}|\busd?\s?\d{2,}|\b\d{2,3}\.\d{3}\b/i },
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
