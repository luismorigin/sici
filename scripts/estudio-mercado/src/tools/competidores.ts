import { queryVenta, median, type VentaRow } from '../db.js'
import type { CompetidoresResult, CompetidorInfo } from '../types.js'

function classifySignal(medianaDias: number): CompetidorInfo['signal'] {
  if (medianaDias >= 150) return 'ESTANCADO'
  if (medianaDias >= 90) return 'PROLONGADO'
  if (medianaDias < 45) return 'NUEVO'
  return 'ACTIVO'
}

export async function competidores(
  zona: string,
  topN: number = 15
): Promise<CompetidoresResult> {
  const rows = await queryVenta(zona)

  // Group by nombre_edificio
  const byEdificio = new Map<string, VentaRow[]>()
  for (const r of rows) {
    const name = r.nombre_edificio ?? 'Sin nombre'
    const arr = byEdificio.get(name) ?? []
    arr.push(r)
    byEdificio.set(name, arr)
  }

  const top: CompetidorInfo[] = [...byEdificio.entries()]
    .map(([proyecto, props]) => {
      // Estado más frecuente del proyecto
      const estadoCount = new Map<string, number>()
      for (const p of props) {
        const e = p.estado_construccion ?? 'sin_dato'
        estadoCount.set(e, (estadoCount.get(e) ?? 0) + 1)
      }
      const estado = [...estadoCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
      return {
        proyecto,
        uds: props.length,
        medianaM2: Math.round(median(props.map(p => p.precio_m2))),
        medianaDias: Math.round(median(props.map(p => p.dias_en_mercado))),
        signal: classifySignal(Math.round(median(props.map(p => p.dias_en_mercado)))),
        estado: estado === 'sin_dato' ? null : estado,
      }
    })
    .filter(c => c.uds >= 3)
    .sort((a, b) => b.medianaM2 - a.medianaM2)
    .slice(0, topN)

  return {
    zona,
    totalProyectos: byEdificio.size,
    totalUnidades: rows.length,
    top,
  }
}
