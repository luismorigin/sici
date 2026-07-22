// Atribución de origen — persiste los UTM durante toda la sesión.
//
// El problema que resuelve: antes se leían los UTM de `window.location.search`
// en el momento del click de WhatsApp. Si el visitante llegaba a `/?utm_source=instagram`
// y navegaba (el buscador de la home arma la URL destino desde cero), los UTM
// se perdían y el lead quedaba en BD con utm_source vacío. Era ~40% de los leads.
//
// Ahora se capturan UNA vez al entrar y se leen de sessionStorage. sessionStorage
// (no localStorage) a propósito: el origen pertenece a ESTA visita. Si la persona
// vuelve mañana por otro lado, es otro origen — atribuirle el viejo sería mentir.
//
// SOLO client-side (usa sessionStorage). Nunca en SSR.

const KEY = 'simon_utm'

export interface Utms {
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
}

const CAMPOS: (keyof Utms)[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']

/**
 * Lee los UTM de la URL actual y los guarda si hay alguno.
 * Llamar una vez por navegación (desde _app). Idempotente.
 *
 * Solo pisa lo guardado si la URL nueva trae utm_source — así un click interno
 * hacia una URL sin UTM no borra el origen real de la sesión.
 */
export function capturarUtms(): void {
  if (typeof window === 'undefined') return
  try {
    const sp = new URLSearchParams(window.location.search)
    if (!sp.get('utm_source')) return
    const utms: Utms = {}
    for (const c of CAMPOS) {
      const v = sp.get(c)
      if (v) utms[c] = v.slice(0, 200)
    }
    sessionStorage.setItem(KEY, JSON.stringify(utms))
  } catch { /* modo privado / storage lleno: seguimos sin atribución */ }
}

/** Los UTM de esta sesión. `{}` si la persona llegó directo. */
export function getUtms(): Utms {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Utms
    // Fallback: primera carga, por si el consumidor corre antes que capturarUtms()
    const sp = new URLSearchParams(window.location.search)
    const utms: Utms = {}
    for (const c of CAMPOS) {
      const v = sp.get(c)
      if (v) utms[c] = v.slice(0, 200)
    }
    return utms
  } catch {
    return {}
  }
}
