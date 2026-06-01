/**
 * Canonical zone definitions for SICI / Simón
 *
 * Macrozona Equipetrol: 6 zonas (5 residenciales canónicas + Eq. 3er Anillo).
 * Macrozona Zona Norte: 14 microzonas (grilla anillos × avenidas, mig 254).
 * Source of truth: tabla zonas_geograficas (PostGIS) → mapeado acá para UI.
 * Ver docs/canonical/ZONAS_ZONA_NORTE.md para las 14 microzonas ZN.
 */

export interface ZonaCanonica {
  slug: string          // URL-safe identifier (e.g. 'equipetrol_centro')
  db: string            // BD value (proyectos_master.zona, propiedades_v2.zona/microzona)
  label: string         // Full display label
  labelCorto: string    // Short label for compact UI (cards, pills)
}

export const ZONAS_CANONICAS: ZonaCanonica[] = [
  {
    slug: 'equipetrol_centro',
    db: 'Equipetrol Centro',
    label: 'Equipetrol Centro',
    labelCorto: 'Eq. Centro',
  },
  {
    slug: 'equipetrol_norte',
    db: 'Equipetrol Norte',
    label: 'Equipetrol Norte',
    labelCorto: 'Eq. Norte',
  },
  {
    slug: 'sirari',
    db: 'Sirari',
    label: 'Sirari',
    labelCorto: 'Sirari',
  },
  {
    slug: 'villa_brigida',
    db: 'Villa Brigida',
    label: 'Villa Brígida',
    labelCorto: 'V. Brigida',
  },
  {
    slug: 'equipetrol_oeste',
    db: 'Equipetrol Oeste',
    label: 'Equipetrol Oeste',
    labelCorto: 'Eq. Oeste',
  },
]

/**
 * 14 microzonas de la macrozona Zona Norte (mig 254, modelo PLANO).
 * `db` = nombre exacto en zonas_geograficas / propiedades_v2.zona.
 * TODO(ticket #11): reemplazar por fetch dinámico desde /api/zonas cuando
 * se haga el refactor escalable multi-macrozona.
 */
export const ZONAS_ZONA_NORTE: ZonaCanonica[] = [
  { slug: 'zn_2_3_la_salle_banzer',    db: '2do-3er anillo La Salle-Banzer',    label: '2do-3er anillo La Salle/Banzer',    labelCorto: 'ZN 2-3 LS/Bz' },
  { slug: 'zn_2_3_banzer_alemana',     db: '2do-3er anillo Banzer-Alemana',     label: '2do-3er anillo Banzer/Alemana',     labelCorto: 'ZN 2-3 Bz/Al' },
  { slug: 'zn_2_3_alemana_mutualista', db: '2do-3er anillo Alemana-Mutualista', label: '2do-3er anillo Alemana/Mutualista', labelCorto: 'ZN 2-3 Al/Mu' },
  { slug: 'zn_3_4_la_salle_banzer',    db: '3er-4to anillo La Salle-Banzer',    label: '3er-4to anillo La Salle/Banzer',    labelCorto: 'ZN 3-4 LS/Bz' },
  { slug: 'zn_3_4_banzer_alemana',     db: '3er-4to anillo Banzer-Alemana',     label: '3er-4to anillo Banzer/Alemana',     labelCorto: 'ZN 3-4 Bz/Al' },
  { slug: 'zn_3_4_alemana_mutualista', db: '3er-4to anillo Alemana-Mutualista', label: '3er-4to anillo Alemana/Mutualista', labelCorto: 'ZN 3-4 Al/Mu' },
  { slug: 'zn_4_6_radial_26_banzer',   db: '4to-6to anillo Radial 26-Banzer',   label: '4to-6to anillo Radial 26/Banzer',   labelCorto: 'ZN 4-6 R26/Bz' },
  { slug: 'zn_4_6_banzer_alemana',     db: '4to-6to anillo Banzer-Alemana',     label: '4to-6to anillo Banzer/Alemana',     labelCorto: 'ZN 4-6 Bz/Al' },
  { slug: 'zn_4_6_alemana_mutualista', db: '4to-6to anillo Alemana-Mutualista', label: '4to-6to anillo Alemana/Mutualista', labelCorto: 'ZN 4-6 Al/Mu' },
  { slug: 'zn_6_8_radial_26_banzer',   db: '6to-8vo anillo Radial 26-Banzer',   label: '6to-8vo anillo Radial 26/Banzer',   labelCorto: 'ZN 6-8 R26/Bz' },
  { slug: 'zn_6_8_banzer_alemana',     db: '6to-8vo anillo Banzer-Alemana',     label: '6to-8vo anillo Banzer/Alemana',     labelCorto: 'ZN 6-8 Bz/Al' },
  { slug: 'zn_6_8_alemana_mutualista', db: '6to-8vo anillo Alemana-Mutualista', label: '6to-8vo anillo Alemana/Mutualista', labelCorto: 'ZN 6-8 Al/Mu' },
  { slug: 'zn_8_paraiso_radial_26_banzer', db: '8vo anillo Paraiso - Radial 26-Banzer', label: '8vo anillo Paraíso - Radial 26/Banzer', labelCorto: 'ZN 8 Paraíso' },
  { slug: 'zn_8_viru_viru_banzer_g77',     db: '8vo anillo Viru Viru - Banzer-G77',     label: '8vo anillo Viru Viru - Banzer/G77',    labelCorto: 'ZN 8 Viru Viru' },
]

/**
 * Nombres BD de las 6 zonas Equipetrol — default del feed público para NO
 * exponer Zona Norte (dark launch). ZONAS_CANONICAS tiene 5 entradas; la 6ta
 * ('Eq. 3er Anillo') es un caso especial sin entrada en ZONAS_CANONICAS, así
 * que se agrega explícitamente para cubrir el polígono completo de Equipetrol.
 */
export const ZONAS_EQUIPETROL_DB: string[] = [
  ...ZONAS_CANONICAS.map(z => z.db),
  'Eq. 3er Anillo',
]

// Build lookup map once (EQ + ZN microzonas, para displayZona/getZonaLabel)
const dbToZona = new Map<string, ZonaCanonica>()
for (const z of [...ZONAS_CANONICAS, ...ZONAS_ZONA_NORTE]) {
  dbToZona.set(z.db, z)
}

/** Nombres BD de las 14 microzonas ZN (para filtros tipo zona IN (...)). */
export function getMicrozonasZN(): string[] {
  return ZONAS_ZONA_NORTE.map(z => z.db)
}

/**
 * BD value → short label (for alquiler cards, compact UI)
 * Falls back to input or 'Otras'
 */
export function displayZona(zona: string | null | undefined): string {
  if (!zona) return 'Otras'
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

/** Admin venta filter dropdown (with "Todas las zonas" option).
 *  Incluye las 14 microzonas Zona Norte SOLO para admin — no aparecen en
 *  filtros públicos. El filtro admin es multi-select, así que se pueden tocar
 *  varias microzonas ZN a la vez. (Antes de mig 254 había una sola entrada
 *  literal 'Zona Norte (piloto)'; ahora las props ZN viven por microzona.)
 *  Cuando Zona Norte salga de piloto, mover a ZONAS_CANONICAS principal. */
export const ZONAS_ADMIN_FILTER = [
  { id: '', label: 'Todas las zonas' },
  ...ZONAS_ADMIN,
  ...ZONAS_ZONA_NORTE.map(z => ({ id: z.db, label: z.labelCorto })),
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
