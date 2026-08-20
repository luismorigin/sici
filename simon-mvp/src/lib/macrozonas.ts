// Macrozonas — la declaración única de qué es cada zona del feed.
//
// PARA QUÉ: hoy agregar una macrozona (Urubó, Las Palmas, Zona Este) significa
// copiar ~6.000 líneas del feed. Con esto, pasa a ser declarar una entrada acá y
// una página delgada que la pase al componente del feed.
//
// 🔴 SIN VALOR POR DEFECTO, Y EQUIPETROL ES UNA MACROZONA MÁS.
// Hoy Equipetrol es "lo normal" del sistema: está en la raíz de la URL (`/ventas`)
// y es el DEFAULT de `/api/ventas` — una llamada sin `zonas_permitidas` devuelve
// Equipetrol, **no un error**. Esa asimetría causó el incidente del 18-ago-2026:
// el feed de Zona Norte sirvió propiedades de Eq. Centro y V. Brigida en producción,
// con `tsc` y `build` en verde, porque un camino nuevo no pasó las zonas y nadie
// falló. Ver `docs/design/FIX_FEED_ZN_AISLAMIENTO.md`.
// 👉 Acá no hay default: quien quiera un feed declara su macrozona. Si falta, que
// falle ruidosamente en vez de servir la zona equivocada en silencio.
//
// QUÉ VA ACÁ y qué no: acá va lo PROPIO de cada zona —qué muestra y cómo se llama—.
// Cómo se ve y cómo funciona es compartido (el componente del feed).

import { ZONAS_EQUIPETROL_DB, getMicrozonasZN, ZONAS_CANONICAS, ZONAS_ZONA_NORTE, ZONAS_ALQUILER_UI } from './zonas'
import type { ZonaCanonica } from './zonas'

/** Una zona tal como la ofrece el FILTRO del feed de alquiler. */
export interface ZonaFiltroAlquiler {
  /** Lo que viaja en `zonas_permitidas`. 🔴 Equipetrol manda SLUGS y Zona Norte manda
   *  VALORES DE BD — la RPC acepta las dos formas y cada feed conserva exactamente lo
   *  que ya enviaba. Unificarlo es una limpieza aparte, no parte de esta mudanza. */
  id: string
  label: string
  /** Dónde se ofrece: `principal` = chips y pills · `ampliada` = solo en el panel de
   *  filtros completo (Eq. 3er Anillo) · `otras` = nunca se ofrece (`sin_zona`).
   *  Antes esto vivía como `z.id !== 'equipetrol_3er_anillo'` dentro del feed: nombres
   *  de Equipetrol incrustados en un componente que ahora sirve a todas las zonas. */
  rol: 'principal' | 'ampliada' | 'otras'
}

/** Etiqueta legible de una microzona de ZN para los chips del feed.
 *  El `labelCorto` de `zonas.ts` está cifrado ('ZN 2-3 LS/Bz') y sirve para tablas;
 *  en el feed, que es mobile-first y sin hover, se lee '2º-3º · La Salle/Banzer'. */
const RING_ORD: Record<string, string> = { '2do': '2º', '3er': '3º', '4to': '4º', '6to': '6º', '8vo': '8º' }
function chipLabelZN(full: string): string {
  const idx = full.indexOf(' anillo ')
  if (idx === -1) return full
  const ring = full.slice(0, idx).split('-').map(r => RING_ORD[r] || r).join('-')
  const rest = full.slice(idx + ' anillo '.length)
  return `${ring} · ${rest}`
}

/** Los nombres de macrozona tal como viven en la BD: `zona_general` en las vistas
 *  y `macrozona` en los snapshots. Es un tipo CERRADO a proposito — asi una zona
 *  nueva no se puede consultar con un nombre que la base no conoce. */
export type MacrozonaNombre = 'Equipetrol' | 'Zona Norte'

export interface Macrozona {
  /** id estable, para logs y evals */
  id: 'equipetrol' | 'zona-norte'
  /** nombre para mostrar y para el SEO ("en Equipetrol", "en Zona Norte").
   *  Es TAMBIEN el valor con el que se consulta la base (`zona_general` / `macrozona`). */
  nombre: MacrozonaNombre
  /** las zonas tal como están en la BD. Es EL filtro: sin esto no hay aislamiento. */
  zonasDB: string[]
  /** ruta del feed de venta */
  rutaVenta: string
  /** ruta del feed de alquiler */
  rutaAlquiler: string
  /** Ruta de la página de mercado, o `null` si esta macrozona TODAVÍA NO TIENE.
   *  🔑 El nav oculta el enlace cuando es `null`. Es la forma de no mentir: hasta el
   *  18-ago el feed de Zona Norte enlazaba a `/mercado/equipetrol` — el usuario veía
   *  las medianas de ZN, tocaba "ver mercado completo" y aterrizaba en otro mercado,
   *  sin aviso. Declarar `null` es más honesto que apuntar a la zona de al lado. */
  rutaMercado: string | null
  /** ¿se indexa? ZN está en dark launch hasta que se decida lanzarla. */
  indexable: boolean
  /** Las zonas que ofrece el FILTRO. Sin esto, el feed de una macrozona lista las
   *  zonas de otra — el usuario ve "Sirari" en Zona Norte y filtra a cero. */
  zonasCanonicas: ZonaCanonica[]
  /** Chips de ejemplo del buscador natural. Nombran zonas REALES de esta macrozona:
   *  si dicen "Sirari" en el feed de Zona Norte, el usuario busca algo que no existe ahí. */
  ejemplosBusqueda: string[]
  /** Ejemplos del placeholder animado del buscador (el que "se escribe solo").
   *  Igual que los chips: si nombran zonas de otra macrozona, invitan a buscar
   *  algo que en este feed no existe. */
  ejemplosPlaceholder: string[]
  /** Las zonas del filtro del feed de ALQUILER. Va aparte de `zonasCanonicas` porque
   *  alquiler filtra por otros ids y suma zonas que venta no ofrece. */
  zonasAlquilerUI: ZonaFiltroAlquiler[]
  /** Chips de ejemplo bajo el buscador del feed de ALQUILER. Nombran zonas REALES de
   *  esta macrozona: en ZN decían "Sirari" y "2 dorm en Eq. Centro" — invitaciones a
   *  buscar algo que en ese feed no existe (y lo que marcó el eval como contaminación). */
  ejemplosBusquedaAlquiler: string[]
  /** Ejemplos del placeholder del buscador en el feed de ALQUILER. Van aparte de los de
   *  venta porque el alquiler se piensa en Bs y por mes: reusar los de venta pondría
   *  "hasta 150 mil" en un feed donde los precios son de 3.000 Bs. */
  ejemplosPlaceholderAlquiler: string[]
  /** Nombre con ciudad y país para el SEO y el Schema.org `Place`. Google y los
   *  buscadores de IA lo usan para ubicar la zona: "Zona Norte" a secas existe en
   *  media docena de ciudades. */
  nombreSEO: string
  /** Centro geográfico para el `GeoCoordinates` del Schema.org. NO es un punto
   *  elegido a ojo: es la mediana del GPS de las propiedades activas de la
   *  macrozona (medido el 20-ago-2026 sobre `v_mercado_venta_shadow`). */
  geo: { lat: number; lon: number }
  /** Fecha de la primera publicación de la página de mercado, para el
   *  `datePublished` del Schema.org. Una zona nueva no puede heredar la de otra:
   *  declarar que se publicó en marzo algo que salió en agosto es falso. */
  mercadoDesde: string
}

export const EQUIPETROL: Macrozona = {
  id: 'equipetrol',
  nombre: 'Equipetrol',
  zonasDB: ZONAS_EQUIPETROL_DB,
  rutaVenta: '/ventas',
  rutaAlquiler: '/alquileres',
  rutaMercado: '/mercado/equipetrol',
  indexable: true,
  zonasCanonicas: ZONAS_CANONICAS,
  ejemplosBusqueda: ['2 dorm en Sirari', 'Hasta 120 mil', 'Preventa en Eq. Norte', 'Monoambiente con parqueo', 'Entrega inmediata'],
  ejemplosPlaceholder: ['1 dorm en Sirari hasta 150 mil', 'preventa en Eq. Norte', '2 dormitorios con piscina', 'monoambiente hasta 80 mil', 'depto en Equipetrol con parqueo'],
  // Derivado de `ZONAS_ALQUILER_UI` para que siga siendo la MISMA lista que ya servía
  // el feed (mismos ids, mismo orden): esta mudanza no debe mover ni un filtro.
  ejemplosBusquedaAlquiler: ['1 dorm amoblado', 'Hasta Bs 4.500', 'Sirari', 'Con parqueo', '2 dorm en Eq. Centro'],
  ejemplosPlaceholderAlquiler: [
    '2 dorm amoblado hasta 4.200 bs',
    '1 dorm en Sirari',
    'pet friendly con parqueo',
    'monoambiente hasta 3 mil bs',
    'depto sin amoblar en Eq. Norte',
  ],
  zonasAlquilerUI: ZONAS_ALQUILER_UI.map(z => ({
    ...z,
    rol: z.id === 'sin_zona' ? 'otras' as const
       : z.id === 'equipetrol_3er_anillo' ? 'ampliada' as const
       : 'principal' as const,
  })),
  nombreSEO: 'Equipetrol, Santa Cruz de la Sierra, Bolivia',
  geo: { lat: -17.765, lon: -63.196 },
  mercadoDesde: '2026-03-09',
}

export const ZONA_NORTE: Macrozona = {
  id: 'zona-norte',
  nombre: 'Zona Norte',
  // 14 microzonas. Se resuelve por función porque la lista vive en `zonas.ts`
  // junto con los polígonos y los alias.
  zonasDB: getMicrozonasZN(),
  rutaVenta: '/zona-norte/ventas',
  rutaAlquiler: '/zona-norte/alquileres',
  rutaMercado: '/mercado/zona-norte', // creada el 20-ago-2026 (sigue noindex: `indexable: false`)
  indexable: false, // dark launch: `noindex` + fuera del sitemap
  // 🔑 El feed muestra el label LEGIBLE ('2º-3º · La Salle/Banzer'), no el cifrado de
  //    `zonas.ts` ('ZN 2-3 LS/Bz'). El cifrado nació para tablas del admin, donde el
  //    ancho manda y quien lee ya conoce el código; en el feed lo lee alguien que
  //    busca departamento y no tiene por qué descifrar 'R26/Bz'. El feed de alquiler
  //    de ZN ya lo hacía así y se entendía mejor — esto lo empareja.
  //    El resto del sistema (admin, tablas) sigue viendo el `labelCorto` original.
  zonasCanonicas: ZONAS_ZONA_NORTE.map(z => ({ ...z, labelCorto: chipLabelZN(z.label) })),
  ejemplosBusqueda: ['2 dorm en Banzer', 'Hasta 120 mil', 'Preventa en Alemana', 'Monoambiente con parqueo', 'Entrega inmediata'],
  ejemplosPlaceholder: ['1 dorm en Banzer hasta 150 mil', 'preventa en Alemana', '2 dormitorios con piscina', 'monoambiente hasta 80 mil', 'depto en Zona Norte con parqueo'],
  ejemplosBusquedaAlquiler: ['1 dorm amoblado', 'Hasta Bs 4.500', 'Banzer', 'Con parqueo', '2 dorm en Alemana'],
  ejemplosPlaceholderAlquiler: [
    '2 dorm amoblado hasta 4.200 bs',
    '1 dorm en Banzer',
    'pet friendly con parqueo',
    'monoambiente hasta 3 mil bs',
    'depto sin amoblar en Alemana',
  ],
  // ZN filtra por VALOR DE BD (es lo que hacía su feed antes de la mudanza) y usa el
  // label legible, no el cifrado. Sin 'Otras' ni 3er anillo: son de Equipetrol.
  zonasAlquilerUI: ZONAS_ZONA_NORTE.map(z => ({ id: z.db, label: chipLabelZN(z.label), rol: 'principal' as const })),
  nombreSEO: 'Zona Norte, Santa Cruz de la Sierra, Bolivia',
  // Mediana del GPS de las 376 props activas de ZN (medido 20-ago-2026).
  geo: { lat: -17.748, lon: -63.177 },
  mercadoDesde: '2026-08-20',
}

/** Todas las macrozonas declaradas. Agregar una nueva es sumarla acá. */
export const MACROZONAS: Macrozona[] = [EQUIPETROL, ZONA_NORTE]

/**
 * Busca una macrozona por id.
 * 🔴 LANZA si no existe, a propósito: el modo de falla que hay que evitar es
 * "devolver Equipetrol en silencio", que es exactamente lo que rompió el feed de
 * ZN el 18-ago. Mejor romper fuerte que servir la zona equivocada.
 */
export function macrozonaPorId(id: string): Macrozona {
  const m = MACROZONAS.find(x => x.id === id)
  if (!m) throw new Error(`macrozonaPorId: "${id}" no existe. Declarada en lib/macrozonas.ts.`)
  return m
}

/** El título SEO del feed de venta. Cada zona dice lo suyo. */
export function tituloVenta(m: Macrozona, total: number, desde: string): string {
  return `${total} Departamentos en Venta en ${m.nombre} — Desde ${desde} | Simon`
}
