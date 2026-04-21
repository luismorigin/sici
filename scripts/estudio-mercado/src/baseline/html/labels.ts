/**
 * Etiquetas compartidas entre secciones. Centralizadas para mantener
 * consistencia vocabulario inmobiliario boliviano.
 */

export function dormLabel(dorms: number): string {
  if (dorms === 0) return 'Mono'
  return `${dorms}D`
}

export function dormLabelLong(dorms: number): string {
  if (dorms === 0) return 'Monoambiente'
  return `${dorms} dormitorio${dorms === 1 ? '' : 's'}`
}

export const ZONA_LONG: Record<string, string> = {
  'Equipetrol Centro': 'Equipetrol Centro',
  'Equipetrol Norte': 'Equipetrol Norte',
  'Equipetrol Oeste': 'Equipetrol Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
  'Eq. 3er Anillo': 'Eq. 3er Anillo',
}

export const ZONA_SHORT: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'V. Brígida',
  'Eq. 3er Anillo': 'Eq. 3er A.',
}

export function zonaLong(z: string): string {
  return ZONA_LONG[z] ?? z
}

export function zonaShort(z: string): string {
  return ZONA_SHORT[z] ?? z
}
