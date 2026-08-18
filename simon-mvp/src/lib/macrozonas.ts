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

import { ZONAS_EQUIPETROL_DB, getMicrozonasZN } from './zonas'

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
  /** ¿se indexa? ZN está en dark launch hasta que se decida lanzarla. */
  indexable: boolean
}

export const EQUIPETROL: Macrozona = {
  id: 'equipetrol',
  nombre: 'Equipetrol',
  zonasDB: ZONAS_EQUIPETROL_DB,
  rutaVenta: '/ventas',
  rutaAlquiler: '/alquileres',
  indexable: true,
}

export const ZONA_NORTE: Macrozona = {
  id: 'zona-norte',
  nombre: 'Zona Norte',
  // 14 microzonas. Se resuelve por función porque la lista vive en `zonas.ts`
  // junto con los polígonos y los alias.
  zonasDB: getMicrozonasZN(),
  rutaVenta: '/zona-norte/ventas',
  rutaAlquiler: '/zona-norte/alquileres',
  indexable: false, // dark launch: `noindex` + fuera del sitemap
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
