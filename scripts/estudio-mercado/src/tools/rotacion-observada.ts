import { queryRotacion } from '../db.js'
import type { RotacionObservadaResult, PropRotada } from '../types.js'

const TC_OFICIAL = 6.96

export async function rotacionObservada(
  zona: string,
  dias: number = 30,
  tcParalelo: number = 9.28,
  falsosPositivosIds: number[] = []
): Promise<RotacionObservadaResult> {
  const raw = await queryRotacion(zona, dias)
  const excludeSet = new Set(falsosPositivosIds)

  // Filtros de calidad ya aplicados en queryRotacion (alineados con migración 211)
  // Excluir falsos positivos confirmados por HTTP check
  const props: PropRotada[] = raw
    .filter((r: any) => !excludeSet.has(r.id))
    .map((r: any) => {
      const area = parseFloat(r.area_total_m2) || 0
      const precioUsd = parseFloat(r.precio_usd) || 0
      const tcDet = r.tipo_cambio_detectado ?? 'no_especificado'
      const precioNorm = tcDet === 'paralelo' ? Math.round(precioUsd * tcParalelo / TC_OFICIAL) : precioUsd
      const precioM2 = area > 0 ? Math.round(precioNorm / area) : 0

      // dias_en_mercado: from fecha_publicacion or fecha_creacion to primera_ausencia_at
      const fechaInicio = r.fecha_publicacion ?? r.fecha_creacion
      const fechaFin = r.primera_ausencia_at
      let diasMercado = 0
      if (fechaInicio && fechaFin) {
        diasMercado = Math.round((new Date(fechaFin).getTime() - new Date(fechaInicio).getTime()) / 86400000)
      }

      return {
        id: r.id,
        nombreEdificio: r.nombre_edificio,
        dorms: r.dormitorios,
        areaM2: area,
        precioM2,
        diasEnMercado: diasMercado,
        fechaSalida: r.primera_ausencia_at ? new Date(r.primera_ausencia_at).toISOString().split('T')[0] : '',
      }
    })
    .sort((a: PropRotada, b: PropRotada) => b.diasEnMercado - a.diasEnMercado)

  return {
    zona,
    dias,
    totalRotadas: props.length,
    props,
  }
}
