import { queryVenta } from '../db.js'
import type { DemandaTipologiaResult, DemandaTipologiaItem, ScarcityLevel } from '../types.js'

function classifyScarcity(pct: number): ScarcityLevel {
  if (pct < 3) return 'CRITICA'
  if (pct < 10) return 'ALTA'
  if (pct < 20) return 'MEDIA'
  return 'BAJA'
}

export async function demandaTipologia(zona: string): Promise<DemandaTipologiaResult> {
  const rows = await queryVenta(zona)
  const totalZona = rows.length

  const dormCount = new Map<number, number>()
  for (const r of rows) {
    dormCount.set(r.dormitorios, (dormCount.get(r.dormitorios) ?? 0) + 1)
  }

  const byDorms: DemandaTipologiaItem[] = [...dormCount.entries()]
    .map(([dorms, uds]) => {
      const pctOfTotal = totalZona > 0 ? Math.round((uds / totalZona) * 1000) / 10 : 0
      return {
        dorms,
        uds,
        pctOfTotal,
        nivel: classifyScarcity(pctOfTotal),
      }
    })
    .sort((a, b) => a.dorms - b.dorms)

  return { zona, totalZona, byDorms }
}
