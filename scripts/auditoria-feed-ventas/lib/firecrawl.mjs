const FIRECRAWL_URL = 'https://api.firecrawl.dev/v1/scrape';
const DEFAULT_TIMEOUT_MS = 60_000;

export async function scrapeUrl(url, { apiKey, retries = 1 } = {}) {
  if (!apiKey) throw new Error('FIRECRAWL_API_KEY no está seteada');
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(FIRECRAWL_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['html'],
          onlyMainContent: false,
          waitFor: 5000,
          timeout: DEFAULT_TIMEOUT_MS,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Firecrawl ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = await res.json();
      const html = json?.data?.html || json?.data?.rawHtml || '';
      if (!html) throw new Error('Firecrawl devolvió HTML vacío');
      return { html, ok: true };
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  return { html: '', ok: false, error: String(lastErr?.message || lastErr) };
}

export async function scrapeBatch(items, { apiKey, concurrency = 5, onProgress } = {}) {
  const results = new Array(items.length);
  let inFlight = 0;
  let nextIdx = 0;
  let done = 0;
  return new Promise((resolve, reject) => {
    const tick = () => {
      while (inFlight < concurrency && nextIdx < items.length) {
        const idx = nextIdx++;
        const item = items[idx];
        inFlight++;
        scrapeUrl(item.url, { apiKey })
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
    if (items.length === 0) return resolve([]);
    tick();
    setTimeout(() => {}, 0);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
