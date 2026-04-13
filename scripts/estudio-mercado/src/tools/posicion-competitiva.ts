import { queryVenta, median, percentileRank } from '../db.js'
import type { ClientConfig, PosicionCompetitivaResult, TypologyPosition, MarketCategory } from '../types.js'

const TC_OFICIAL = 6.96

function categorize(diffPct: number): MarketCategory {
  if (diffPct <= -20) return 'oportunidad'
  if (diffPct <= -10) return 'bajo_promedio'
  if (diffPct <= 10) return 'promedio'
  if (diffPct <= 20) return 'sobre_promedio'
  return 'premium'
}

function normalizePrice(precioM2: number, tcDetectado: string, tcParalelo: number): number {
  if (tcDetectado === 'paralelo' && tcParalelo > 0) {
    return precioM2 * tcParalelo / TC_OFICIAL
  }
  return precioM2
}

export async function posicionCompetitiva(
  config: ClientConfig,
  tc: { paralelo: number; oficial: number }
): Promise<PosicionCompetitivaResult> {
  const rows = await queryVenta(config.zona)

  // Project's $/m2 normalized
  const proyectoM2Norm = normalizePrice(config.precioM2Billete, config.tcDetectado, tc.paralelo)

  // Zone medians
  const allM2 = rows.map(r => r.precio_m2)
  const medianaZonaM2 = median(allM2)
  const diffPctGlobal = medianaZonaM2 > 0
    ? Math.round(((proyectoM2Norm - medianaZonaM2) / medianaZonaM2) * 1000) / 10
    : 0
  const percentilEnZona = percentileRank(allM2, proyectoM2Norm)

  // By typology (each dorm type in inventory)
  const dormTypes = [...new Set(config.inventory.map(u => u.dorms))]
  const byTypology: TypologyPosition[] = dormTypes.map(dorms => {
    const dormsRows = rows.filter(r => r.dormitorios === dorms)
    const medianaM2Dorm = median(dormsRows.map(r => r.precio_m2))
    const diff = medianaM2Dorm > 0
      ? Math.round(((proyectoM2Norm - medianaM2Dorm) / medianaM2Dorm) * 1000) / 10
      : 0
    return {
      dorms,
      proyectoM2: Math.round(proyectoM2Norm),
      medianaZonaM2: Math.round(medianaM2Dorm),
      diffPct: diff,
      categoria: categorize(diff),
      unidadesEnZona: dormsRows.length,
    }
  })

  return {
    categoriaGlobal: categorize(diffPctGlobal),
    diffPctGlobal,
    percentilEnZona,
    proyectoM2: Math.round(proyectoM2Norm),
    medianaZonaM2: Math.round(medianaZonaM2),
    byTypology,
  }
}
