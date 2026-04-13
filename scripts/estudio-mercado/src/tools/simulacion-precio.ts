import { queryVenta, median } from '../db.js'
import type { ClientConfig, SimulacionPrecioResult, SimulacionEscenario, MarketCategory } from '../types.js'

const TC_OFICIAL = 6.96

function categorize(diffPct: number): MarketCategory {
  if (diffPct <= -20) return 'oportunidad'
  if (diffPct <= -10) return 'bajo_promedio'
  if (diffPct <= 10) return 'promedio'
  if (diffPct <= 20) return 'sobre_promedio'
  return 'premium'
}

export async function simulacionPrecio(
  config: ClientConfig,
  tc: { paralelo: number; oficial: number }
): Promise<SimulacionPrecioResult> {
  const rows = await queryVenta(config.zona)

  // Medianas de referencia por dorms
  const dormTypes = [...new Set(config.inventory.map(u => u.dorms))]
  const medianasReferencia: Record<number, number> = {}
  for (const d of dormTypes) {
    const dormsRows = rows.filter(r => r.dormitorios === d)
    medianasReferencia[d] = Math.round(median(dormsRows.map(r => r.precio_norm)))
  }

  const precioEscenarios = config.precioEscenarios ?? [config.precioM2Billete]
  const tcEscenarios = config.tcEscenarios ?? [tc.paralelo]

  const escenarios: SimulacionEscenario[] = []

  for (const precioM2 of precioEscenarios) {
    for (const tcVal of tcEscenarios) {
      const byUnit = config.inventory.map(u => {
        const ticketUsd = Math.round(u.m2 * precioM2)
        // Normalize: if paralelo TC, the buyer pays in billete but the market comparison uses norm
        const ticketNorm = config.tcDetectado === 'paralelo'
          ? Math.round(ticketUsd * tcVal / TC_OFICIAL)
          : ticketUsd
        const medianaRef = medianasReferencia[u.dorms] ?? 0
        const diffVsMediana = medianaRef > 0
          ? Math.round(((ticketNorm - medianaRef) / medianaRef) * 1000) / 10
          : 0
        return {
          dpto: u.dpto,
          dorms: u.dorms,
          m2: u.m2,
          ticketUsd,
          ticketNorm,
          diffVsMediana,
          categoria: categorize(diffVsMediana),
        }
      })

      const tickets = byUnit.map(u => u.ticketNorm)
      const diffs = byUnit.map(u => u.diffVsMediana)

      escenarios.push({
        precioM2,
        tc: tcVal,
        byUnit,
        promedioTicket: Math.round(tickets.reduce((s, t) => s + t, 0) / tickets.length),
        promedioDiff: Math.round(diffs.reduce((s, d) => s + d, 0) / diffs.length * 10) / 10,
      })
    }
  }

  return { escenarios, medianasReferencia }
}
