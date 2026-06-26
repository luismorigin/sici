// Fetch con retry + timeout + rate limit + anti-bloqueo. Para APIs públicas de portales.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// pace(): pausa con JITTER ±30% → no parecer un bot de intervalo fijo (1.500ms clavado
// es una firma de bot obvia). Usar pace() en vez de sleep() para las pausas entre requests.
export const pace = (ms) => sleep(Math.round(ms * (0.7 + Math.random() * 0.6)));

// CIRCUIT BREAKER: si se acumulan fallos seguidos, la IP probablemente está bloqueada
// → dejar de pegarle (seguir solo profundiza el bloqueo). El caller chequea circuit.tripped
// y aborta la corrida. Se resetea con cualquier éxito (un fallo aislado no lo dispara).
let consecFails = 0;
const CB_THRESHOLD = 5;
export const circuit = {
  get tripped() { return consecFails >= CB_THRESHOLD; },
  get fails() { return consecFails; },
  reset() { consecFails = 0; },
};

async function intentar(url, { json, headers }) {
  const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return json ? res.json() : res.text();
}

export async function fetchRetry(url, { json = false, headers = {}, retries = 2 } = {}) {
  if (circuit.tripped) return null;                 // ya bloqueado → no seguir pegando
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await intentar(url, { json, headers });
      consecFails = 0;                              // éxito → resetea el contador
      return r;
    } catch (e) {
      if (i === retries) {
        consecFails++;
        let msg = `  ⚠️  ${e.message} (${retries + 1} intentos): ${String(url).slice(0, 80)}…`;
        if (circuit.tripped) msg += `\n  🛑 CIRCUIT BREAKER: ${consecFails} fallos seguidos — IP probablemente bloqueada. Abortando esta corrida; reintentá más tarde (horas).`;
        console.warn(msg);
        return null;
      }
      await sleep(1500 * Math.pow(2, i));            // backoff exponencial: 1.5s → 3s
    }
  }
}
