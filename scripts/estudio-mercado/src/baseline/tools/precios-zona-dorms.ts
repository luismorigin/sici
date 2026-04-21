import { queryVentaBaseline, median, percentile, type VentaRowBaseline } from '../db-baseline.js'
import type { PreciosZonaDormsResult, PrecioSegmento } from '../types-baseline.js'

const DORMS_RANGE = [0, 1, 2, 3]
const MIN_N_ROBUSTO = 20
const SHORT_LABELS: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'V. Brígida',
  'Eq. 3er Anillo': 'Eq. 3er A.',
}

// Umbral mínimo de n para reportar un segmento (aun marginal). <5 se omite totalmente.
const MIN_N_REPORTAR = 5

export async function preciosZonaDorms(zonasIncluidas: string[]): Promise<PreciosZonaDormsResult> {
  const rows = await queryVentaBaseline({ zonasIncluidas })

  // Agrupar por zona × dorms
  const zonaMap = new Map<string, VentaRowBaseline[]>()
  for (const r of rows) {
    const arr = zonaMap.get(r.zona) ?? []
    arr.push(r)
    zonaMap.set(r.zona, arr)
  }

  // Ordenar por inventario zona desc
  const zonasOrdenadas = [...zonaMap.entries()].sort((a, b) => b[1].length - a[1].length)

  const segmentos: PrecioSegmento[] = []
  for (const [zona, propsZona] of zonasOrdenadas) {
    for (const d of DORMS_RANGE) {
      const seg = propsZona.filter(p => p.dormitorios === d)
      if (seg.length < MIN_N_REPORTAR) continue
      const precios = seg.map(p => p.precio_norm)
      const m2 = seg.map(p => p.precio_m2)
      segmentos.push({
        zona,
        dorms: d,
        n: seg.length,
        mediana: Math.round(median(precios)),
        p25: Math.round(percentile(precios, 25)),
        p75: Math.round(percentile(precios, 75)),
        medianaM2: Math.round(median(m2)),
        muestraMarginal: seg.length < MIN_N_ROBUSTO,
      })
    }
  }

  // Chart P25-P75 solo segmentos robustos (n >= 20)
  const rangosChart = segmentos
    .filter(s => !s.muestraMarginal)
    .map(s => ({
      label: `${SHORT_LABELS[s.zona] ?? s.zona} · ${s.dorms}D`,
      p25: s.p25,
      med: s.mediana,
      p75: s.p75,
    }))

  return { segmentos, rangosChart }
}
