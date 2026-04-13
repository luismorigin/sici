import { queryVenta, median, type VentaRow } from '../db.js'
import type { PanoramaMercadoResult, ZonaStat, DormStat } from '../types.js'

export async function panoramaMercado(tc: { paralelo: number; oficial: number }): Promise<PanoramaMercadoResult> {
  const rows = await queryVenta()

  const medianaM2Global = median(rows.map(r => r.precio_m2))
  const medianaTicketGlobal = median(rows.map(r => r.precio_norm))

  // By zona
  const zonaMap = new Map<string, VentaRow[]>()
  for (const r of rows) {
    if (!r.zona) continue
    const arr = zonaMap.get(r.zona) ?? []
    arr.push(r)
    zonaMap.set(r.zona, arr)
  }

  const byZona: ZonaStat[] = [...zonaMap.entries()]
    .map(([zona, props]) => ({
      zona,
      uds: props.length,
      medianaM2: Math.round(median(props.map(p => p.precio_m2))),
      medianaTicket: Math.round(median(props.map(p => p.precio_norm))),
      avgArea: Math.round(props.reduce((s, p) => s + p.area_total_m2, 0) / props.length),
      medianaDias: Math.round(median(props.map(p => p.dias_en_mercado))),
    }))
    .sort((a, b) => b.uds - a.uds)

  // By dorms
  const dormMap = new Map<number, VentaRow[]>()
  for (const r of rows) {
    const arr = dormMap.get(r.dormitorios) ?? []
    arr.push(r)
    dormMap.set(r.dormitorios, arr)
  }

  const byDorms: DormStat[] = [...dormMap.entries()]
    .map(([dorms, props]) => ({
      dorms,
      uds: props.length,
      medianaM2: Math.round(median(props.map(p => p.precio_m2))),
      medianaTicket: Math.round(median(props.map(p => p.precio_norm))),
    }))
    .sort((a, b) => a.dorms - b.dorms)

  return {
    totalUnidades: rows.length,
    medianaM2Global: Math.round(medianaM2Global),
    medianaTicketGlobal: Math.round(medianaTicketGlobal),
    tcParalelo: tc.paralelo,
    tcOficial: tc.oficial,
    byZona,
    byDorms,
  }
}
