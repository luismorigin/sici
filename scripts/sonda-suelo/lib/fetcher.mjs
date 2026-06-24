// Fetch con retry + timeout + rate limit. Para APIs públicas de portales.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function intentar(url, { json, headers }) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

export async function fetchRetry(url, { json = false, headers = {}, retries = 2 } = {}) {
  for (let i = 0; i <= retries; i++) {
    try { return await intentar(url, { json, headers }); }
    catch (e) {
      if (i === retries) { console.warn(`  ⚠️  ${e.message} (${retries + 1} intentos): ${String(url).slice(0, 80)}…`); return null; }
      await sleep(1500);
    }
  }
}
