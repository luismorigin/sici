/**
 * Iconos de comodidades — mapa canónico + fallback chispita.
 *
 * Modelo UX (modal /ventas, patrón "What's special"):
 *  - "Todas las comodidades" = lo CANÓNICO (amenidades + equipamiento), que el
 *    pipeline ya mapeó a un vocabulario FIJO → cada uno tiene su icono de línea.
 *  - "Lo que la hace especial" = lo NO canónico (`amenidades_extra` /
 *    `equipamiento_otros`, la cola larga distintiva) → chispita (SparkleIcon).
 *
 * La CLASIFICACIÓN (canónico vs extra) la hace el pipeline (READER_SPEC), NO el
 * cliente. Acá solo asignamos el icono por nombre canónico; lo que no matchea
 * cae al fallback (chispita).
 *
 * Vocabulario canónico (fuente de verdad):
 *  - Amenidades: `simon-mvp/src/config/amenidades-mercado.ts`
 *  - Equipamiento: `scripts/deptos-equipetrol/READER_SPEC.md` (§ equipamiento_canonico)
 *
 * Reutilizable en el modal de ventas y en el espejo de alquileres.
 */
import type { ReactNode } from 'react'

const DIACRITICS = new RegExp('[\\u0300-\\u036f]', 'g')
const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(DIACRITICS, '').trim()

const SPARKLE: ReactNode = (
  <><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M18.5 14l.7 1.9 1.8.6-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.6z" /></>
)

const ICONS: Record<string, ReactNode> = {
  // ── Amenidades canónicas (amenidades-mercado.ts) ──
  'piscina': <><path d="M2 16c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1" /><path d="M2 20c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1" /><path d="M8 13V5a2 2 0 0 1 4 0" /><path d="M16 13V5" /></>,
  'seguridad 24/7': <><path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  'churrasquera': <><path d="M12 2c0 2 2 3 2 5.5C14 9.4 13 11 12 11s-2-1.6-2-3.5C10 5 11 4 12 2z" /><path d="M6 12h12l-1.5 6a2 2 0 0 1-2 1.6H9.5a2 2 0 0 1-2-1.6z" /><path d="M9 20v2M15 20v2" /></>,
  'sauna/jacuzzi': <><path d="M8 3c0 1-1 1-1 2s1 1 1 2M12 3c0 1-1 1-1 2s1 1 1 2M16 3c0 1-1 1-1 2s1 1 1 2" /><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" /></>,
  'gimnasio': <><rect x="1.5" y="9" width="3" height="6" rx="1" /><rect x="19.5" y="9" width="3" height="6" rx="1" /><path d="M5 10.5h14v3H5z" /></>,
  'estacionamiento para visitas': <><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2" /><circle cx="6.5" cy="16.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></>,
  'pet friendly': <><circle cx="8" cy="9" r="1.6" /><circle cx="16" cy="9" r="1.6" /><circle cx="5.5" cy="13" r="1.4" /><circle cx="18.5" cy="13" r="1.4" /><path d="M12 13.5c-2.4 0-4.3 1.9-4.3 3.9 0 1.3 1 2.3 2.3 2.3.9 0 1.2-.5 2-.5s1.1.5 2 .5c1.3 0 2.3-1 2.3-2.3 0-2-1.9-3.9-4.3-3.9z" /></>,
  'salon de eventos': <><path d="m3 21 5-12 7 7z" /><path d="M14 7a2 2 0 0 1 2-2M18 3v.02M20.5 7.5a2 2 0 0 0-2 2M21 12v.02" /></>,
  'co-working': <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>,
  'parque infantil': <><circle cx="12" cy="12" r="9" /><path d="M9 10h.02M15 10h.02" /><path d="M8.5 15c1.2 1.2 5.8 1.2 7 0" /></>,
  'jardin': <><path d="M12 22v-6" /><path d="M9.5 16a4.5 4.5 0 0 1-1-8.4 4.5 4.5 0 0 1 9 0 4.5 4.5 0 0 1-1 8.4z" /></>,
  'terraza/balcon': <><path d="M2 10 12 4l10 6" /><path d="M4 10v11M20 10v11M4 21h16" /><path d="M8 21V12M12 21V12M16 21V12" /></>,
  'area social': <><circle cx="9" cy="8" r="2.5" /><circle cx="16" cy="9" r="2" /><path d="M4 19c0-3 2.2-5 5-5s5 2 5 5" /><path d="M14.5 14.2c2 .4 3.5 2.1 3.5 4.8" /></>,
  'ascensor': <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9.5 8 12 5.5 14.5 8" /><path d="M9.5 16 12 18.5 14.5 16" /></>,
  'recepcion': <><path d="M4 20h16" /><path d="M5 20v-6a7 7 0 0 1 14 0v6" /><path d="M12 7V4" /><circle cx="12" cy="3" r="1" /></>,
  'lavadero': <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M7 6h.02M10 6h.02" /></>,
  // ── Equipamiento canónico (READER_SPEC) ──
  'cocina equipada': <><rect x="3" y="9" width="18" height="12" rx="2" /><circle cx="8" cy="15" r="2" /><circle cx="16" cy="15" r="2" /><path d="M6 9V6a2 2 0 0 1 2-2M18 9V6" /></>,
  'heladera': <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M6 9.5h12" /><path d="M9 5.5v1.5M9 12v2.5" /></>,
  'lavadora': <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M7 6h.02M10 6h.02" /></>,
  'secadora': <><rect x="4" y="3" width="16" height="18" rx="2" /><circle cx="12" cy="13" r="4" /><path d="M10 12.5c1-1 3 1 4 0" /><path d="M7 6h.02" /></>,
  'termotanque/calefon': <><rect x="6" y="3" width="12" height="18" rx="3" /><path d="M12 7c.8 1.2 1.6 2 1.6 3.2A1.6 1.6 0 0 1 10.4 10c0-.8.4-1.2.8-2 .2.5.5.7.8.7 0-.8 0-1.2 0-1.7z" /></>,
  'aire acondicionado': <><rect x="2" y="4" width="20" height="9" rx="2" /><path d="M5 9h14" /><path d="M6.5 17c1 1 1 2 0 3M10.5 17c1 1 1 2 0 3M14.5 17c1 1 1 2 0 3M18.5 17c1 1 1 2 0 3" /></>,
  'roperos/closets': <><path d="M12 4a2 2 0 0 0-1 3.7L4 13a2 2 0 0 0 1 3.6h14A2 2 0 0 0 20 13l-7-5.3" /></>,
  'vestidor': <><rect x="4" y="3" width="16" height="18" rx="1" /><path d="M12 3v18" /><path d="M8 8h.02M16 8h.02" /></>,
  'balcon': <><path d="M2 10 12 4l10 6" /><path d="M4 10v11M20 10v11M4 21h16" /><path d="M8 21V12M12 21V12M16 21V12" /></>,
  'terraza propia': <><path d="M2 10 12 4l10 6" /><path d="M4 10v11M20 10v11M4 21h16" /><path d="M8 21V12M12 21V12M16 21V12" /></>,
  'cuarto de servicio': <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M14 12v.02" /></>,
  'box de bano': <><path d="M8 3c0 1-1 1-1 2s1 1 1 2" /><path d="M4 11h16v3a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6z" /><rect x="4" y="3" width="16" height="18" rx="2" fill="none" /></>,
  'chapa digital': <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v3" /></>,
  'domotica': <><path d="M3 11 12 4l9 7" /><path d="M6 10v10h12V10" /><path d="M10 14h4v6h-4z" /></>,
  'video portero': <><rect x="3" y="4" width="12" height="14" rx="2" /><path d="M15 9l6-3v10l-6-3z" /><circle cx="9" cy="9" r="2" /></>,
}

// Alias: nombres pelados que el feed usa sueltos → misma clave canónica con barra.
// Así "Terraza"/"Balcón" reconocen el estándar (→ van a "En el edificio"), pero
// "Terraza panorámica"/"Terraza Zen" NO matchean (son distintivos → "especial").
Object.assign(ICONS, {
  'terraza': ICONS['terraza/balcon'],
  'sauna': ICONS['sauna/jacuzzi'],
  'jacuzzi': ICONS['sauna/jacuzzi'],
  'roperos': ICONS['roperos/closets'],
  'closets': ICONS['roperos/closets'],
  'ropero': ICONS['roperos/closets'],
  'closet': ICONS['roperos/closets'],
  'termotanque': ICONS['termotanque/calefon'],
  'calefon': ICONS['termotanque/calefon'],
  // Seguridad y Ascensor son ESTÁNDAR (casi todo edificio los tiene) → deben ir
  // a "En el edificio", NUNCA a "Lo que la hace especial". El reader los deja en
  // la cola larga con muchas variantes; sin estos alias, las que no son la clave
  // exacta ("seguridad 24/7"/"ascensor") caen a "especial" con chispita. Variantes
  // reales de la data (buscar_extras_shadow).
  'seguridad': ICONS['seguridad 24/7'],
  'sistema de seguridad': ICONS['seguridad 24/7'],
  'seguridad 24 horas': ICONS['seguridad 24/7'],
  'seguridad 24h': ICONS['seguridad 24/7'],
  'seguridad 24hs': ICONS['seguridad 24/7'],
  'porteria': ICONS['seguridad 24/7'],
  'vigilancia': ICONS['seguridad 24/7'],
  'ascensores': ICONS['ascensor'],
  'ascensor social': ICONS['ascensor'],
  'ascensores sociales': ICONS['ascensor'],
  'ascensor de servicio': ICONS['ascensor'],
})

/** ¿Está en el catálogo canónico (y por ende tiene icono propio)? */
export const hasCanonicalIcon = (name: string) => norm(name) in ICONS

/**
 * Icono de una comodidad. Canónico → su icono de línea; no canónico → chispita.
 * Hereda color y tamaño del contenedor (stroke=currentColor).
 */
export function AmenityIcon({ name, className }: { name: string; className?: string }) {
  const inner = ICONS[norm(name)] ?? SPARKLE
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {inner}
    </svg>
  )
}

/** Chispita suelta — marcador de "Lo que la hace especial". */
export function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {SPARKLE}
    </svg>
  )
}
