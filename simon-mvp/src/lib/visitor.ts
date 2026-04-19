// Visitor UUID cross-session. Persiste en localStorage.
// SOLO para uso client-side (useEffect). NUNCA en SSR.

const KEY = 'simon_visitor_id'

export function getVisitorId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = localStorage.getItem(KEY)
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      localStorage.setItem(KEY, id)
    }
    return id
  } catch {
    return ''
  }
}
