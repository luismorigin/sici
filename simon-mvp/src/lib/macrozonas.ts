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

import { ZONAS_EQUIPETROL_DB, getMicrozonasZN, ZONAS_CANONICAS, ZONAS_ZONA_NORTE } from './zonas'
import type { ZonaCanonica } from './zonas'

export interface Macrozona {
  /** id estable, para logs y evals */
  id: 'equipetrol' | 'zona-norte'
  /** nombre para mostrar y para el SEO ("en Equipetrol", "en Zona Norte") */
  nombre: string
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
}

export const ZONA_NORTE: Macrozona = {
  id: 'zona-norte',
  nombre: 'Zona Norte',
  // 14 microzonas. Se resuelve por función porque la lista vive en `zonas.ts`
  // junto con los polígonos y los alias.
  zonasDB: getMicrozonasZN(),
  rutaVenta: '/zona-norte/ventas',
  rutaAlquiler: '/zona-norte/alquileres',
  rutaMercado: null, // TODO backlog: crear /mercado/zona-norte y apuntarla acá
  indexable: false, // dark launch: `noindex` + fuera del sitemap
  zonasCanonicas: ZONAS_ZONA_NORTE,
  ejemplosBusqueda: ['2 dorm en Banzer', 'Hasta 120 mil', 'Preventa en Alemana', 'Monoambiente con parqueo', 'Entrega inmediata'],
  ejemplosPlaceholder: ['1 dorm en Banzer hasta 150 mil', 'preventa en Alemana', '2 dormitorios con piscina', 'monoambiente hasta 80 mil', 'depto en Zona Norte con parqueo'],
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
