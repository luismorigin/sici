import { queryVentaBaseline, median, percentile, type VentaRowBaseline } from '../db-baseline.js'
import type { RotacionMultizonaResult, RotacionZonaDorms, InventarioSplitZona } from '../types-baseline.js'

const DORMS_RANGE = [1, 2, 3]  // 0D excluido del chart de antigüedad (no aparece en §5 chartDias)
const MIN_N_REPORTAR = 3

export async function rotacionMultizona(zonasIncluidas: string[]): Promise<RotacionMultizonaResult> {
  const rows = await queryVentaBaseline({ zonasIncluidas })

  // Agrupar por zona
  const zonaMap = new Map<string, VentaRowBaseline[]>()
  for (const r of rows) {
    const arr = zonaMap.get(r.zona) ?? []
    arr.push(r)
    zonaMap.set(r.zona, arr)
  }

  // Orden por inventario desc (paridad con panorama)
  const zonasOrdenadas = [...zonaMap.entries()].sort((a, b) => b[1].length - a[1].length)

  // --- Antigüedad listado por zona × dorms ---
  const porZonaDorms: RotacionZonaDorms[] = []
  for (const [zona, props] of zonasOrdenadas) {
    for (const d of DORMS_RANGE) {
      const seg = props.filter(p => p.dormitorios === d)
      if (seg.length < MIN_N_REPORTAR) {
        // No reportable, pero guardamos n=0 marker para el chart sepa que no hay data
        porZonaDorms.push({ zona, dorms: d, n: seg.length, medianaDias: 0, p25Dias: 0, p75Dias: 0 })
        continue
      }
      const dias = seg.map(p => p.dias_en_mercado)
      porZonaDorms.push({
        zona,
        dorms: d,
        n: seg.length,
        medianaDias: Math.round(median(dias)),
        p25Dias: Math.round(percentile(dias, 25)),
        p75Dias: Math.round(percentile(dias, 75)),
      })
    }
  }

  // --- Split inventario por estado (para chart §4) ---
  // entrega_inmediata ya incluye nuevo_a_estrenar (consolidado en db-baseline)
  const splitInventario: InventarioSplitZona[] = zonasOrdenadas.map(([zona, props]) => {
    const entrega = props.filter(p => p.estado_construccion === 'entrega_inmediata').length
    const preventa = props.filter(p => p.estado_construccion === 'preventa').length
    const nuevoONoEsp = props.filter(p =>
      p.estado_construccion === null ||
      p.estado_construccion === 'no_especificado'
    ).length
    return { zona, entrega, preventa, nuevoONoEsp }
  })

  return { porZonaDorms, splitInventario }
}
