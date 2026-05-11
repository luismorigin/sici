// Fetcher curl-only para alquileres — sin Firecrawl.
// Los 3 portales (C21, Remax, BI) sirven HTML estático suficiente para extraer
// la descripción cruda. Ver investigación 2026-05-10:
// - C21: og:description = descripción literal del listing
// - Remax: data-page (Inertia JSON) → description_website
// - BI: <div class="block-body"> después de <h4>Descripción</h4>

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 20_000;

export async function fetchUrl(url, { retries = 1, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': UA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-BO,es;q=0.9,en;q=0.8',
        },
        signal: ctrl.signal,
        redirect: 'follow',
      });
      clearTimeout(timer);
      if (!res.ok) {
        return { html: '', ok: false, status: res.status, error: `HTTP ${res.status}` };
      }
      // Algunos sitios bolivianos declaran charset utf-8 pero sirven latin-1.
      // Probamos UTF-8 y si encontramos replacement chars en exceso, fallback a latin-1.
      const buf = await res.arrayBuffer();
      let html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      if (looksLikeBadEncoding(html)) {
        html = new TextDecoder('windows-1252', { fatal: false }).decode(buf);
      }
      if (!html || html.length < 200) {
        return { html: '', ok: false, status: res.status, error: 'HTML vacío' };
      }
      return { html, ok: true, status: res.status };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await sleep(800 * (attempt + 1));
    }
  }
  return { html: '', ok: false, error: String(lastErr?.message || lastErr) };
}

export async function fetchBatch(items, { concurrency = 6, onProgress } = {}) {
  const results = new Array(items.length);
  let inFlight = 0;
  let nextIdx = 0;
  let done = 0;
  return new Promise((resolve) => {
    if (items.length === 0) return resolve([]);
    const tick = () => {
      while (inFlight < concurrency && nextIdx < items.length) {
        const idx = nextIdx++;
        const item = items[idx];
        inFlight++;
        fetchUrl(item.url)
          .then((r) => {
            results[idx] = { ...item, ...r };
          })
          .catch((err) => {
            results[idx] = { ...item, html: '', ok: false, error: String(err) };
          })
          .finally(() => {
            inFlight--;
            done++;
            onProgress?.(done, items.length);
            if (done === items.length) resolve(results);
            else tick();
          });
      }
    };
    tick();
  });
}

function looksLikeBadEncoding(s) {
  if (!s) return false;
  // contar replacement chars (U+FFFD). Si >1% del total, encoding malo.
  const replChars = (s.match(/�/g) || []).length;
  return replChars > 5 && replChars / s.length > 0.001;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
