import {
  queryVentaBaseline, queryAlquilerBaseline, median,
  pasaFiltroAntiguedadVenta, getSupabaseBaseline,
  type VentaRowBaseline,
} from '../db-baseline.js'
import type { PanoramaMultizonaResult, PanoramaZonaStat, PanoramaEstadoObra, PanoramaFuente } from '../types-baseline.js'

const ESTADO_LABELS: Record<string, string> = {
  entrega_inmediata: 'Entrega inmediata',
  preventa: 'Preventa / en construcción',
  no_especificado: 'No especificado',
}

const FUENTE_LABELS: Record<string, string> = {
  century21: 'Century21',
  remax: 'Remax',
  bien_inmuebles: 'Bien Inmuebles',
}

/**
 * Calcula cuántos listings portal-observables quedaron fuera por el filtro de antigüedad.
 * Usado para el disclaimer "inventario estancado" de §2.
 */
async function contarInventarioEstancado(zonasIncluidas: string[]): Promise<number> {
  const sb = getSupabaseBaseline()
  const { data } = await sb.from('propiedades_v2')
    .select('id, zona, estado_construccion, es_multiproyecto, tipo_propiedad_original, fecha_publicacion, fecha_discovery, duplicado_de, status, area_total_m2')
    .eq('tipo_operacion', 'venta')
    .in('status', ['completado', 'actualizado'])
    .is('duplicado_de', null)
    .not('zona', 'is', null)
    .gte('area_total_m2', 20)
    .limit(10000)
  if (!data) return 0
  const tiposExcluidos = ['baulera', 'parqueo', 'garaje', 'deposito']
  return data.filter((r: any) => {
    if (r.es_multiproyecto === true) return false
    if (tiposExcluidos.includes(r.tipo_propiedad_original ?? '')) return false
    if (!zonasIncluidas.includes(r.zona) && !zonasIncluidas.includes(r.zona === 'Villa Brígida' ? 'Villa Brigida' : r.zona)) return false
    const fecha = r.fecha_publicacion ?? r.fecha_discovery
    if (!fecha) return false
    const dias = Math.round((Date.now() - new Date(fecha).getTime()) / 86400000)
    return !pasaFiltroAntiguedadVenta(dias, r.estado_construccion)
  }).length
}

export async function panoramaMultizona(zonasIncluidas: string[]): Promise<PanoramaMultizonaResult> {
  const [rowsVenta, rowsAlquiler, estancadoCount] = await Promise.all([
    queryVentaBaseline({ zonasIncluidas }),
    queryAlquilerBaseline({ zonasIncluidas }),
    contarInventarioEstancado(zonasIncluidas),
  ])

  const medianaM2Global = Math.round(median(rowsVenta.map(r => r.precio_m2)))
  const medianaTicketGlobal = Math.round(median(rowsVenta.map(r => r.precio_norm)))

  // --- byZona ---
  const zonaMap = new Map<string, VentaRowBaseline[]>()
  for (const r of rowsVenta) {
    const arr = zonaMap.get(r.zona) ?? []
    arr.push(r)
    zonaMap.set(r.zona, arr)
  }

  const byZona: PanoramaZonaStat[] = [...zonaMap.entries()]
    .map(([zona, props]) => {
      const medianaPorDorm = (d: number) => {
        const seg = props.filter(p => p.dormitorios === d)
        return seg.length >= 3 ? Math.round(median(seg.map(p => p.dias_en_mercado))) : 0
      }
      return {
        zona,
        inventario: props.length,
        medianaM2: Math.round(median(props.map(p => p.precio_m2))),
        medianaTicket: Math.round(median(props.map(p => p.precio_norm))),
        medianaDias1D: medianaPorDorm(1),
        medianaDiasGlobal: Math.round(median(props.map(p => p.dias_en_mercado))),
        medianaDiasPorDorm: {
          1: medianaPorDorm(1),
          2: medianaPorDorm(2),
          3: medianaPorDorm(3),
        },
        avgArea: Math.round(props.reduce((s, p) => s + p.area_total_m2, 0) / props.length),
      }
    })
    .sort((a, b) => b.inventario - a.inventario)

  // --- byEstado ---
  const estadoCounts = new Map<string, number>()
  for (const r of rowsVenta) {
    const key = r.estado_construccion ?? 'no_especificado'
    estadoCounts.set(key, (estadoCounts.get(key) ?? 0) + 1)
  }
  const byEstado: PanoramaEstadoObra[] = [...estadoCounts.entries()]
    .map(([estado, uds]) => ({
      estado,
      label: ESTADO_LABELS[estado] ?? estado,
      uds,
      pctTotal: Math.round((uds / rowsVenta.length) * 1000) / 10,
    }))
    .sort((a, b) => b.uds - a.uds)

  // --- byFuente ---
  const fuenteCounts = new Map<string, number>()
  for (const r of rowsVenta) {
    fuenteCounts.set(r.fuente, (fuenteCounts.get(r.fuente) ?? 0) + 1)
  }
  const byFuente: PanoramaFuente[] = [...fuenteCounts.entries()]
    .map(([fuente, uds]) => ({
      fuente,
      label: FUENTE_LABELS[fuente] ?? fuente,
      uds,
      pctTotal: Math.round((uds / rowsVenta.length) * 1000) / 10,
    }))
    .sort((a, b) => b.uds - a.uds)

  const totalCorpusPortal = rowsVenta.length + estancadoCount
  const inventarioEstancadoPct = totalCorpusPortal > 0
    ? Math.round((estancadoCount / totalCorpusPortal) * 1000) / 10
    : 0

  return {
    totalVenta: rowsVenta.length,
    totalAlquiler: rowsAlquiler.length,
    totalZonas: byZona.length,
    medianaM2Global,
    medianaTicketGlobal,
    byZona,
    byEstado,
    byFuente,
    inventarioEstancado: estancadoCount,
    inventarioEstancadoPct,
  }
}
