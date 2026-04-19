// Lectura/escritura del phone del USUARIO (distinto del broker).
// Reusa ventas_gate_v1 como fallback legacy para usuarios que ya pasaron el gate.

const KEY = 'simon_user_phone'
const GATE_KEY = 'ventas_gate_v1'

export type StoredPhone = { phone: string; consent: boolean }

export function getStoredPhone(): StoredPhone | null {
  if (typeof window === 'undefined') return null
  try {
    const stored = localStorage.getItem(KEY)
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<StoredPhone>
      if (parsed.phone && typeof parsed.phone === 'string') {
        return { phone: parsed.phone, consent: !!parsed.consent }
      }
    }
    const gate = localStorage.getItem(GATE_KEY)
    if (gate) {
      const parsed = JSON.parse(gate) as { telefono?: string }
      if (parsed.telefono && typeof parsed.telefono === 'string') {
        return { phone: parsed.telefono, consent: false }
      }
    }
  } catch {
    // JSON malformado o storage deshabilitado: ignorar
  }
  return null
}

export function setStoredPhone(phone: string, consent: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(KEY, JSON.stringify({ phone, consent, ts: new Date().toISOString() }))
  } catch {
    // storage lleno / bloqueado: silenciar
  }
}
