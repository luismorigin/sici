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

// PROXY OPT-IN, STICKY POR LOTES: si existe PROXY_URL sale por ahí; si no, fetch directo como antes.
// Lectura PEREZOSA (dotenv.config() corre DESPUÉS de los imports → leer la env al cargar el módulo daría
// undefined; se resuelve en el 1er fetch).
//
// ⚠️ POR QUÉ STICKY POR LOTES (no IP-nueva-por-request):
// - IP-por-request (versión vieja): abría conexión + handshake TLS CADA vez (~7-10s/request) → LENTO, y
//   algunas IPs del pool fallaban → crawls PARCIALES (bug del 20-jul).
// - Sticky por lotes: MISMA IP durante un LOTE de N requests → reusa la conexión (rápido, sin handshake
//   por request); IP NUEVA al siguiente lote → ninguna IP llega al umbral de bloqueo (~200 medido en C21).
//   IPRoyal: `_session-<id>` en el password fija la IP (mismo id = misma IP); `_lifetime` su duración; si
//   la IP muere, IPRoyal cambia sola (silencioso) → el lote no se corta. Ver docs.iproyal.com rotation.
// PROXY_LOTE = requests por IP (perilla; mantener <200). Default 50 (margen amplio; medido el umbral, subir).
let _ProxyAgent, _avisado = false;
let _agente = null, _enLote = 0, _sesion = null;
const LOTE = Math.max(1, Number(process.env.PROXY_LOTE || 50));

function _nuevaSesion() {                                    // 8 alfanuméricos (formato IPRoyal)
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = ''; for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}
function _urlConSesion(proxy, sesion) {                      // _session-<id>_lifetime-30m al password
  const u = new URL(proxy);
  u.password = `${u.password}_session-${sesion}_lifetime-30m`;
  return u.toString();
}

// EXPORTADA: devuelve el agente del LOTE actual (REUSADO). Rota a IP nueva cada LOTE requests.
// ⚠️ NO cerrar el agente devuelto — lo gestiona el lote. Al terminar el script, llamar cerrarProxy().
// El verificador la usa para su fetch propio (necesita `redirect: manual` + status crudo → no pasa por
// fetchRetry) y así sale por el MISMO proxy sticky. Devuelve null si no hay PROXY_URL.
export async function crearAgente() {
  const proxy = process.env.PROXY_URL;
  if (!proxy) return null;
  if (!_ProxyAgent) ({ ProxyAgent: _ProxyAgent } = await import('undici'));
  if (!_agente || _enLote >= LOTE) {                         // lote lleno (o primer request) → rotar IP
    if (_agente) await _agente.close().catch(() => {});
    _sesion = _nuevaSesion();
    _agente = new _ProxyAgent(_urlConSesion(proxy, _sesion));
    _enLote = 0;
    if (!_avisado) { console.log(`  🔀 proxy sticky, lotes de ${LOTE} (${new URL(proxy).host})`); _avisado = true; }  // host:puerto, NUNCA credenciales
  }
  _enLote++;
  return _agente;
}

// Cerrar la conexión del último lote al terminar el script (si no, la keep-alive puede demorar el exit).
export async function cerrarProxy() { if (_agente) { await _agente.close().catch(() => {}); _agente = null; _enLote = 0; } }

// Fuerza IP NUEVA en el próximo crearAgente. Se llama cuando un request FALLA: sticky se queda pegado
// a la IP del lote, así que si esa IP viene mala, 5 fallos seguidos disparan el circuit breaker y muere
// la corrida (bug 20-jul: 1ª IP mala → 0 listings). Rotando en el fallo: IP buena se mantiene (rápido),
// IP mala se descarta al instante (resiliente). El breaker ahora solo salta si VARIAS IPs seguidas fallan
// = bloqueo real / portal caído, no una IP suelta.
export function rotarSesion() { _enLote = LOTE; }

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
  const agente = await crearAgente();                // agente del LOTE (reusado) — NO cerrar acá
  if (agente) opts.dispatcher = agente;
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const texto = await res.text();                    // texto SIEMPRE: para pesar la respuesta
  trafico.bytes += Buffer.byteLength(texto);
  trafico.requests++;
  return json ? JSON.parse(texto) : texto;
}

export async function fetchRetry(url, { json = false, headers = {}, retries = 2 } = {}) {
  if (circuit.tripped) return null;                 // ya bloqueado → no seguir pegando
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await intentar(url, { json, headers });
      consecFails = 0;                              // éxito → resetea el contador
      return r;
    } catch (e) {
      rotarSesion();                                 // la IP falló → IP NUEVA en el próximo intento (si hay proxy)
      if (i === retries) {
        consecFails++;
        let msg = `  ⚠️  ${e.message} (${retries + 1} intentos, rotando IP): ${String(url).slice(0, 80)}…`;
        if (circuit.tripped) msg += `\n  🛑 CIRCUIT BREAKER: ${consecFails} fallos seguidos (${retries + 1} IPs c/u) — bloqueo real o portal caído. Abortando; reintentá más tarde.`;
        console.warn(msg);
        return null;
      }
      await sleep(1500 * Math.pow(2, i));            // backoff exponencial: 1.5s → 3s (con IP nueva)
    }
  }
}
