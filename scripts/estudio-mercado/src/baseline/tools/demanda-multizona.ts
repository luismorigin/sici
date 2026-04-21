import { queryVentaBaseline, median, type VentaRowBaseline } from '../db-baseline.js'
import type {
  DemandaMultizonaResult, InventarioZonaDorms, TamanoZonaDorms, MixEstadoZona,
} from '../types-baseline.js'

const DORMS_RANGE = [0, 1, 2, 3]

export async function demandaMultizona(zonasIncluidas: string[]): Promise<DemandaMultizonaResult> {
  const rows = await queryVentaBaseline({ zonasIncluidas })

  // Agrupar por zona
  const zonaMap = new Map<string, VentaRowBaseline[]>()
  for (const r of rows) {
    const arr = zonaMap.get(r.zona) ?? []
    arr.push(r)
    zonaMap.set(r.zona, arr)
  }

  // Ordenar zonas por inventario desc (paridad con panorama)
  const zonasOrdenadas = [...zonaMap.entries()].sort((a, b) => b[1].length - a[1].length)

  // --- Inventario por zona × dorms ---
  const inventarioPorZonaDorms: InventarioZonaDorms[] = zonasOrdenadas.map(([zona, props]) => {
    const porDorms: Record<number, number> = {}
    for (const d of DORMS_RANGE) {
      porDorms[d] = props.filter(p => p.dormitorios === d).length
    }
    return { zona, porDorms, total: props.length }
  })

  // --- Tamaño mediano por zona × dorms ---
  const tamanoPorZonaDorms: TamanoZonaDorms[] = zonasOrdenadas.map(([zona, props]) => {
    const medianaM2PorDorms: Record<number, number> = {}
    for (const d of DORMS_RANGE) {
      const seg = props.filter(p => p.dormitorios === d)
      medianaM2PorDorms[d] = seg.length > 0 ? Math.round(median(seg.map(p => p.area_total_m2))) : 0
    }
    return { zona, medianaM2PorDorms }
  })

  // --- Mix entrega / preventa por zona ---
  // entrega_inmediata ya incluye nuevo_a_estrenar (consolidado en db-baseline)
  const mixEstadoPorZona: MixEstadoZona[] = zonasOrdenadas.map(([zona, props]) => {
    const entrega = props.filter(p => p.estado_construccion === 'entrega_inmediata').length
    const preventa = props.filter(p => p.estado_construccion === 'preventa').length
    const noEsp = props.filter(p => p.estado_construccion === null || p.estado_construccion === 'no_especificado').length
    const pctEntrega = props.length > 0 ? Math.round((entrega / props.length) * 100) : 0
    return { zona, entrega, preventa, noEsp, pctEntrega }
  }).sort((a, b) => b.pctEntrega - a.pctEntrega)

  // --- Totales ---
  const totalPorDorms: Record<number, number> = {}
  for (const d of DORMS_RANGE) {
    totalPorDorms[d] = rows.filter(r => r.dormitorios === d).length
  }

  return {
    inventarioPorZonaDorms,
    tamanoPorZonaDorms,
    mixEstadoPorZona,
    totalPorDorms,
    totalGeneral: rows.length,
  }
}
