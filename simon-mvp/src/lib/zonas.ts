/**
 * Canonical zone definitions for SICI / Simón
 *
 * 5 zonas canónicas in Equipetrol, Santa Cruz.
 * Source of truth: microzona column (PostGIS) → mapped here for UI.
 */

export interface ZonaCanonica {
  slug: string          // URL-safe identifier (e.g. 'equipetrol_centro')
  db: string            // Primary BD value for venta (proyectos_master.zona)
  dbAlquiler: string[]  // All BD values that map here (alquiler dirty names)
  label: string         // Full display label
  labelCorto: string    // Short label for compact UI (cards, pills)
}

export const ZONAS_CANONICAS: ZonaCanonica[] = [
  {
    slug: 'equipetrol_centro',
    db: 'Equipetrol Centro',
    dbAlquiler: ['Equipetrol Centro', 'Equipetrol', 'Equipetrol Centro'],
    label: 'Equipetrol Centro',
    labelCorto: 'Eq. Centro',
  },
  {
    slug: 'equipetrol_norte',
    db: 'Equipetrol Norte',
    dbAlquiler: ['Equipetrol Norte', 'Equipetrol Norte/Norte', 'Equipetrol Norte/Sur'],
    label: 'Equipetrol Norte',
    labelCorto: 'Eq. Norte',
  },
  {
    slug: 'sirari',
    db: 'Sirari',
    dbAlquiler: ['Sirari'],
    label: 'Sirari',
    labelCorto: 'Sirari',
  },
  {
    slug: 'villa_brigida',
    db: 'Villa Brigida',
    dbAlquiler: ['Villa Brigida', 'Villa Brígida'],
    label: 'Villa Brígida',
    labelCorto: 'V. Brigida',
  },
  {
    slug: 'equipetrol_oeste',
    db: 'Equipetrol Oeste',
    dbAlquiler: ['Equipetrol Oeste', 'Faremafu'],
    label: 'Equipetrol Oeste',
    labelCorto: 'Eq. Oeste',
  },
]

// Build lookup maps once
const dbToZona = new Map<string, ZonaCanonica>()
for (const z of ZONAS_CANONICAS) {
  dbToZona.set(z.db, z)
  for (const alias of z.dbAlquiler) {
    dbToZona.set(alias, z)
  }
}

/**
 * BD value → short label (for alquiler cards, compact UI)
 * Falls back to input or 'Otras'
 */
export function displayZona(zona: string | null | undefined): string {
  if (!zona) return 'Otras'
  // Legacy + current marginal zone names
  if (zona === 'Equipetrol Franja' || zona === 'Eq. 3er Anillo') return 'Eq. 3er Anillo'
  if (zona === 'Sin zona' || zona === 'sin zona') return 'Otras'
  const found = dbToZona.get(zona)
  return found ? found.labelCorto : zona
}

/**
 * BD value → full label (for admin display)
 * Falls back to input or 'Sin zona'
 */
export function getZonaLabel(zona: string | null | undefined): string {
  if (!zona) return 'Sin zona'
  if (zona === 'Equipetrol Franja' || zona === 'Eq. 3er Anillo') return 'Eq. 3er Anillo'
  if (zona === 'Sin zona') return 'Sin zona'
  const found = dbToZona.get(zona)
  return found ? found.label : zona
}

// ===== Derived constants for dropdowns =====

/** Admin venta dropdowns (proyectos_master.zona DB values as IDs) */
export const ZONAS_ADMIN = ZONAS_CANONICAS.map(z => ({
  id: z.db,
  label: z.label,
}))

/** Admin venta filter dropdown (with "Todas las zonas" option) */
export const ZONAS_ADMIN_FILTER = [
  { id: '', label: 'Todas las zonas' },
  ...ZONAS_ADMIN,
]

/** Proyecto editor dropdown (6 zonas reales de zonas_geograficas + Sin zona) */
export const ZONAS_PROYECTO_EDITOR = [
  { id: 'Sin zona', label: 'Sin zona' },
  ...ZONAS_ADMIN,
  { id: 'Eq. 3er Anillo', label: 'Eq. 3er Anillo' },
]

/** Alquiler public UI (slug IDs for RPC) + Franja + Otras */
export const ZONAS_ALQUILER_UI = [
  ...ZONAS_CANONICAS.map(z => ({ id: z.slug, label: z.labelCorto })),
  { id: 'equipetrol_3er_anillo', label: 'Eq. 3er Anillo' },
  { id: 'sin_zona', label: 'Otras' },
]

/** Admin alquiler filter dropdown (DB values + Franja) */
export const ZONAS_ALQUILER_FILTER = [
  { id: '', label: 'Todas las zonas' },
  ...ZONAS_CANONICAS.map(z => ({ id: z.db, label: z.labelCorto })),
  { id: 'Eq. 3er Anillo', label: 'Eq. 3er Anillo' },
]

/** Broker form dropdown (slug IDs) */
export const ZONAS_BROKER = ZONAS_CANONICAS.map(z => ({
  id: z.slug,
  label: z.label,
}))
