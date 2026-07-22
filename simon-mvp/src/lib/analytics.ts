// Google Analytics Event Tracking
// ID: G-Q8CRRJD6SL
//
// ═══════════════════════════════════════════════════════════════════════════
// EL EMBUDO CANÓNICO — 7 eventos, la operación como PARÁMETRO
// ═══════════════════════════════════════════════════════════════════════════
//
// El problema que resuelve: los eventos estaban duplicados por sección
// (`open_detail` vs `open_detail_venta` vs `open_detail_casa`), así que GA4 no
// podía armar UN embudo ni comparar venta contra alquiler. El costo era real y
// medible: `scripts/check_ga4_metrics.py` reportaba "conversión total 0.87%"
// persiguiendo los nombres de alquileres e **ignorando las 442 aperturas de
// ficha de ventas** del mismo período.
//
//   feed_view          { operacion, macrozona, n_resultados }
//   buscar             { operacion, texto, n_resultados, origen }
//   ficha_abrir        { operacion, property_id, zona, precio }
//   favorito           { operacion, property_id, accion }
//   contacto_whatsapp  { operacion, property_id, zona, precio, ubicacion }  ← LA conversión
//   lead_gate          { operacion, property_id }
//   puente_click       — lo emite el server en /api/ir, no pasa por acá
//
// CÓMO se emiten: NO se tocaron los ~25 call-sites repartidos en 9 archivos
// (superficie enorme, riesgo de romper los feeds para un cambio de nombres).
// En cambio esta capa **traduce**: cuando un call-site dispara un evento legacy
// del embudo, se emiten LOS DOS — el legacy conserva la serie histórica y el
// canónico alimenta el embudo. Cuando el embudo esté asentado (~1 mes) se
// pueden retirar los legacy borrando el mapa de abajo, sin tocar los feeds.
//
// ⚠️ `source`, `medium`, `campaign`, `term` y `content` son nombres RESERVADOS
// de GA4: mandarlos como parámetro pisa la fuente de tráfico de la sesión.
// El parámetro de "en qué parte de la UI pasó" se llama `origen` / `ubicacion`.
// Ver docs/meta/GA4_EVENTOS.md y docs/backlog/MEDICION_FUNNEL_PLAN.md.

export const GA_ID = 'G-Q8CRRJD6SL'

export type Operacion = 'venta' | 'alquiler'

export type EventoCanonico =
  | 'feed_view' | 'buscar' | 'ficha_abrir' | 'favorito'
  | 'contacto_whatsapp' | 'lead_gate' | 'puente_click'

// Acepta `null` porque los feeds lo pasan de verdad (`precio: p.precio ?? null`)
// y su `trackEvent` local lo tipaba `any`, así que nadie se enteraba: hoy esos
// null viajan a GA4 y quedan como parámetros vacíos. `enviar()` los descarta.
interface EventParams {
  [key: string]: string | number | boolean | null | undefined
}

// Casas es VENTA (feed /ventas/casas). Todo lo que no lleva sufijo es alquiler,
// que fue el feed original y por eso quedó sin marcar.
const operacionDe = (nombre: string): Operacion =>
  /_venta$|_casa$/.test(nombre) ? 'venta' : 'alquiler'

/** Qué evento legacy alimenta qué paso del embudo. */
const CANONICO: Record<string, EventoCanonico> = {
  page_enter_alquiler: 'feed_view',

  open_detail: 'ficha_abrir',
  open_detail_venta: 'ficha_abrir',
  open_detail_casa: 'ficha_abrir',

  toggle_favorite: 'favorito',
  toggle_favorite_venta: 'favorito',

  // Los 4 caminos al mismo hecho de negocio: la persona escribió por WhatsApp.
  click_whatsapp: 'contacto_whatsapp',
  click_whatsapp_broker: 'contacto_whatsapp',
  click_whatsapp_venta: 'contacto_whatsapp',
  click_whatsapp_casa: 'contacto_whatsapp',

  lead_gate: 'lead_gate',
  lead_gate_venta: 'lead_gate',
}

/**
 * Unifica los nombres de parámetro que cada feed inventó por su cuenta
 * (`zona`/`zone`, `precio`/`precio_usd`/`price`) para que el embudo pueda
 * leerlos igual en venta y en alquiler.
 */
function normalizar(nombre: string, p: EventParams = {}): EventParams {
  const out: EventParams = {
    operacion: (p.operacion as Operacion) || operacionDe(nombre),
    property_id: p.property_id,
    zona: p.zona ?? p.zone,
    precio: p.precio ?? p.precio_usd ?? p.price,
    ubicacion: p.origen ?? p.ubicacion,
    accion: p.accion ?? p.action,
  }
  // GA4 cobra por parámetro: no mandar los vacíos.
  Object.keys(out).forEach(k => out[k] === undefined && delete out[k])
  return out
}

// ─── Cola de eventos previos a la carga de GA ──────────────────────────────
// GA se inyecta con `strategy="lazyOnload"` (después de window.onload + idle),
// pero los eventos de entrada —`feed_view`, `page_enter_alquiler`— se disparan
// en el mount, MUCHO antes. Hasta ahora `trackEvent` era no-op si `gtag` no
// existía todavía: esos eventos simplemente se perdían.
//
// No es teórico, está en los datos: `/alquileres` tuvo 202 sesiones en 28 días
// y `page_enter_alquiler` registró solo 23 usuarios. El primer paso del embudo
// estaba sub-reportado ~10x, y por eso todas las conversiones "desde el feed"
// parecían mejores de lo que eran (el denominador faltaba).
//
// Se encolan y se drenan apenas gtag aparece. Tope de 50 para que una página
// sin GA (o con bloqueador) no acumule memoria indefinidamente.
const cola: Array<[string, Record<string, unknown>]> = []
const COLA_MAX = 50
let esperando = false

function drenarCuandoCargue() {
  if (esperando || typeof window === 'undefined') return
  esperando = true
  const iv = setInterval(() => {
    if (!window.gtag) return
    clearInterval(iv)
    clearTimeout(limite)
    esperando = false
    while (cola.length) {
      const [n, p] = cola.shift()!
      window.gtag('event', n, p)
    }
  }, 250)
  // Si GA nunca carga (bloqueador, red caída), soltar la cola y no seguir mirando.
  const limite = setTimeout(() => {
    clearInterval(iv)
    esperando = false
    cola.length = 0
  }, 30_000)
}

function enviar(nombre: string, params?: EventParams) {
  if (typeof window === 'undefined') return
  // GA4 tiene un tope de parámetros por evento y cobra cardinalidad: un
  // `precio: null` no informa nada y ocupa un slot. Se descartan vacíos.
  const limpio: Record<string, unknown> = {}
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== null && v !== undefined && v !== '') limpio[k] = v
    }
  }
  if (!window.gtag) {
    if (cola.length < COLA_MAX) cola.push([nombre, limpio])
    drenarCuandoCargue()
    return
  }
  window.gtag('event', nombre, limpio)
}

// Enviar evento a Google Analytics — acepta cualquier nombre de evento.
// Si el evento forma parte del embudo, emite además su equivalente canónico.
export function trackEvent(eventName: string, params?: EventParams) {
  const canonico = CANONICO[eventName]
  if (!canonico) return enviar(eventName, params)

  const normalizado = normalizar(eventName, params)

  // `lead_gate` (alquiler) ya se llama igual que su canónico: emitirlo dos
  // veces duplicaría el paso del embudo. Se emite una sola vez, enriquecido.
  if (canonico === eventName) return enviar(eventName, { ...params, ...normalizado })

  enviar(eventName, params)        // serie histórica
  enviar(canonico, normalizado)    // embudo
}

/** Identidad estable entre GA4, la BD y (a futuro) WhatsApp. Ver lib/visitor.ts. */
export function setUsuarioGA(visitorId: string) {
  if (!visitorId) return
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('set', { user_id: visitorId })
  }
}

// Declarar gtag en window para TypeScript
declare global {
  interface Window {
    gtag: (
      command: 'event' | 'config' | 'js' | 'set',
      targetId: string | Date | Record<string, unknown>,
      params?: Record<string, unknown>
    ) => void
    dataLayer: unknown[]
  }
}
