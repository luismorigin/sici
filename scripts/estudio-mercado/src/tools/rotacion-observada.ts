import { queryRotacion, queryNuevas, median } from '../db.js'
import type { RotacionObservadaResult, PropRotada, RetiroBatch, NuevasResumen } from '../types.js'

const TC_OFICIAL = 6.96
const BATCH_MIN = 3 // 3+ props del mismo proyecto el mismo día = retiro batch

function dormLabel(d: number): string {
  return d === 0 ? 'Mono' : d + 'D'
}

export async function rotacionObservada(
  zona: string,
  dias: number = 30,
  tcParalelo: number = 9.28,
  falsosPositivosIds: number[] = []
): Promise<RotacionObservadaResult> {
  const raw = await queryRotacion(zona, dias)
  const excludeSet = new Set(falsosPositivosIds)

  // Map raw to typed props + keep broker info for batch detection
  const allProps = raw
    .filter((r: any) => !excludeSet.has(r.id))
    .map((r: any) => {
      const area = parseFloat(r.area_total_m2) || 0
      const precioUsd = parseFloat(r.precio_usd) || 0
      const tcDet = r.tipo_cambio_detectado ?? 'no_especificado'
      const precioNorm = tcDet === 'paralelo' ? Math.round(precioUsd * tcParalelo / TC_OFICIAL) : precioUsd
      const precioM2 = area > 0 ? Math.round(precioNorm / area) : 0

      const fechaInicio = r.fecha_publicacion ?? r.fecha_creacion
      const fechaFin = r.primera_ausencia_at
      let diasMercado = 0
      if (fechaInicio && fechaFin) {
        diasMercado = Math.round((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000)
      }

      const fechaSalida = r.primera_ausencia_at ? new Date(r.primera_ausencia_at).toISOString().split('T')[0] : ''

      return {
        prop: {
          id: r.id,
          nombreEdificio: r.nombre_edificio,
          dorms: r.dormitorios,
          areaM2: area,
          precioM2,
          diasEnMercado: diasMercado,
          fechaSalida,
          broker: r.datos_json_enrichment?.agente_nombre ?? null,
        } as PropRotada,
        broker: r.datos_json_enrichment?.agente_nombre ?? null,
        batchKey: `${r.nombre_edificio ?? 'unknown'}|${fechaSalida}`,
      }
    })

  // Detect batch withdrawals: 2+ props del mismo proyecto el mismo día
  const batchGroups = new Map<string, typeof allProps>()
  for (const item of allProps) {
    const arr = batchGroups.get(item.batchKey) ?? []
    arr.push(item)
    batchGroups.set(item.batchKey, arr)
  }

  const batchIds = new Set<number>()
  const retirosBatch: RetiroBatch[] = []

  for (const [, group] of batchGroups) {
    if (group.length >= BATCH_MIN) {
      for (const item of group) batchIds.add(item.prop.id)
      const dorms = [...new Set(group.map(g => g.prop.dorms))].sort().map(d => dormLabel(d)).join(', ')
      const brokers = [...new Set(group.map(g => g.broker).filter(Boolean))]
      retirosBatch.push({
        proyecto: group[0].prop.nombreEdificio ?? 'Sin nombre',
        fecha: group[0].prop.fechaSalida,
        count: group.length,
        dorms,
        broker: brokers.length === 1 ? brokers[0] : (brokers.length > 1 ? `${brokers.length} brokers` : null),
      })
    }
  }

  retirosBatch.sort((a, b) => b.count - a.count)

  const salidasIndividuales = allProps
    .filter(item => !batchIds.has(item.prop.id))
    .map(item => item.prop)
    .sort((a, b) => b.fechaSalida.localeCompare(a.fechaSalida))

  // Nuevas entradas al mercado
  const rawNuevas = await queryNuevas(zona, dias)
  const nuevasM2 = rawNuevas
    .map((r: any) => {
      const area = parseFloat(r.area_total_m2) || 0
      const precioUsd = parseFloat(r.precio_usd) || 0
      const tcDet = r.tipo_cambio_detectado ?? 'no_especificado'
      const pNorm = tcDet === 'paralelo' ? Math.round(precioUsd * tcParalelo / TC_OFICIAL) : precioUsd
      return area > 0 ? pNorm / area : 0
    })
    .filter((m2: number) => m2 > 0)

  const nuevasByDorm = new Map<number, any[]>()
  for (const r of rawNuevas) {
    const arr = nuevasByDorm.get(r.dormitorios) ?? []
    arr.push(r)
    nuevasByDorm.set(r.dormitorios, arr)
  }

  const nuevas: NuevasResumen = {
    total: rawNuevas.length,
    byDorms: [...nuevasByDorm.entries()]
      .map(([dorms, props]) => {
        const m2s = props
          .map((r: any) => {
            const area = parseFloat(r.area_total_m2) || 0
            const precioUsd = parseFloat(r.precio_usd) || 0
            const tcDet = r.tipo_cambio_detectado ?? 'no_especificado'
            const pNorm = tcDet === 'paralelo' ? Math.round(precioUsd * tcParalelo / TC_OFICIAL) : precioUsd
            return area > 0 ? pNorm / area : 0
          })
          .filter((m2: number) => m2 > 0)
          .sort((a: number, b: number) => a - b)
        return {
          dorms,
          count: props.length,
          pct: rawNuevas.length > 0 ? Math.round((props.length / rawNuevas.length) * 100) : 0,
          medianaM2: m2s.length > 0 ? Math.round(m2s[Math.floor(m2s.length / 2)]) : 0,
        }
      })
      .sort((a, b) => b.count - a.count),
    medianaM2: Math.round(median(nuevasM2)),
  }

  return {
    zona,
    dias,
    totalRotadas: allProps.length,
    salidasIndividuales,
    retirosBatch,
    totalIndividuales: salidasIndividuales.length,
    totalBatch: batchIds.size,
    nuevas,
  }
}
