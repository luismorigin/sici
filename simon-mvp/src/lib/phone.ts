// Normalización + validación de teléfonos bolivianos.
// Acepta: +59170000000, 59170000000, 70000000. Rechaza el resto.
// Celular Bolivia: 8 dígitos empezando en 6 o 7.

export function normalizePhone(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  const clean = input.replace(/[\s\-()]/g, '')
  let normalized = clean
  if (!clean.startsWith('+')) {
    if (clean.startsWith('591')) normalized = '+' + clean
    else if (clean.startsWith('7') || clean.startsWith('6')) normalized = '+591' + clean
    else return null
  }
  if (!/^\+591[67]\d{7}$/.test(normalized)) return null
  return normalized
}

export function isValidBolivianPhone(input: string): boolean {
  return normalizePhone(input) !== null
}
