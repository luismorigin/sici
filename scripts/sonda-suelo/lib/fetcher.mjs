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

// PROXY OPT-IN: si existe PROXY_URL en el entorno, todo el fetch sale por ahí (IP rotativa);
// si NO existe, se comporta exactamente como antes (fetch directo). Lectura PEREZOSA a propósito:
// los scripts llaman dotenv.config() DESPUÉS de los imports, así que leer la env al cargar el
// módulo daría undefined siempre. Se resuelve en el primer fetch y se memoiza.
// ⚠️ UN AGENTE NUEVO POR REQUEST — no es derroche, es lo que hace que la IP ROTE.
// Medido (20-jul, 4 requests): agente reutilizado → 2 IPs · sin keep-alive → 1 IP ·
// agente nuevo por request → 4 IPs. undici poolea la conexión TCP y el proxy le sostiene
// la misma IP de salida a esa sesión; conexión nueva = IP nueva. El costo (un handshake TLS
// por request) es irrelevante acá: entre requests ya hay pace() de ~1,5s.
let _ProxyAgent, _avisado = false;
// EXPORTADA: el verificador la usa para su fetch propio (necesita `redirect: manual` + ver el status
// crudo → no puede pasar por fetchRetry). Así sus chequeos salen por el MISMO proxy rotativo, no por la
// IP real. Devuelve un agente nuevo por llamada (rotación) o null si no hay proxy. Cerralo con .close().
export async function crearAgente() {
  const proxy = process.env.PROXY_URL;
  if (!proxy) return null;
  if (!_ProxyAgent) ({ ProxyAgent: _ProxyAgent } = await import('undici'));
  if (!_avisado) { console.log(`  🔀 proxy activo (${new URL(proxy).host})`); _avisado = true; }  // host:puerto, NUNCA credenciales
  return new _ProxyAgent(proxy);
}

// CONTADOR DE TRÁFICO: los proxies residenciales se cobran por GB → medir cuánto consume una
// corrida real es lo que dice qué paquete comprar. Siempre activo (contar no cuesta nada).
export const trafico = {
  bytes: 0,
  requests: 0,
  get mb() { return +(this.bytes / 1048576).toFixed(2); },
  resumen() { return `${this.requests} requests · ${this.mb} MB`; },
  reset() { this.bytes = 0; this.requests = 0; },
};

async function intentar(url, { json, headers }) {
  const opts = { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(30000) };
  const agente = await crearAgente();
  if (agente) opts.dispatcher = agente;
  try {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const texto = await res.text();                  // texto SIEMPRE: para pesar la respuesta (y leerla ENTERA antes de cerrar el agente)
    trafico.bytes += Buffer.byteLength(texto);
    trafico.requests++;
    return json ? JSON.parse(texto) : texto;
  } finally {
    if (agente) await agente.close().catch(() => {});  // cerrar SIEMPRE (incluso si falló) — si no, quedan conexiones colgadas
  }
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
