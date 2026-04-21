import { queryAlquilerBaseline, median, mean, type AlquilerRowBaseline } from '../db-baseline.js'
import type {
  AlquilerMultizonaResult, AlquilerZonaStat, AlquilerDormsAmoblado, AlquilerCompAmoblado,
} from '../types-baseline.js'

const MIN_N_ROBUSTO = 20
const MIN_N_REPORTAR = 3

function categoriaAmoblado(amoblado: string | null): 'amoblado' | 'no_amoblado' | 'sin_declarar' | 'semi' {
  if (!amoblado) return 'sin_declarar'
  const lower = amoblado.toLowerCase().trim()
  if (lower === 'si' || lower === 'sí' || lower === 'amoblado') return 'amoblado'
  if (lower === 'no' || lower === 'no_amoblado') return 'no_amoblado'
  if (lower.includes('semi')) return 'semi'
  return 'sin_declarar'
}

const CATEGORIA_LABELS: Record<string, string> = {
  amoblado: 'Amoblado',
  no_amoblado: 'No amoblado',
  sin_declarar: 'Sin declarar',
  semi: 'Semi amoblado',
}

const DORMS_PARA_AMOBLADO = [1, 2, 3]

export async function alquilerMultizona(zonasIncluidas: string[]): Promise<AlquilerMultizonaResult> {
  const rows = await queryAlquilerBaseline({ zonasIncluidas })

  // --- Por zona ---
  const zonaMap = new Map<string, AlquilerRowBaseline[]>()
  for (const r of rows) {
    const arr = zonaMap.get(r.zona) ?? []
    arr.push(r)
    zonaMap.set(r.zona, arr)
  }

  const porZona: AlquilerZonaStat[] = [...zonaMap.entries()]
    .map(([zona, props]) => ({
      zona,
      n: props.length,
      medianaRenta: Math.round(median(props.map(p => p.precio_mensual))),
      avgRenta: Math.round(mean(props.map(p => p.precio_mensual))),
      muestraMarginal: props.length < MIN_N_ROBUSTO,
    }))
    .sort((a, b) => b.n - a.n)

  // --- Por dorms × categoría amoblado (agregado región) ---
  const porDormsAmoblado: AlquilerDormsAmoblado[] = []
  const categorias: Array<'amoblado' | 'no_amoblado' | 'sin_declarar'> = ['amoblado', 'no_amoblado', 'sin_declarar']
  for (const d of DORMS_PARA_AMOBLADO) {
    for (const cat of categorias) {
      const seg = rows.filter(r => r.dormitorios === d && categoriaAmoblado(r.amoblado) === cat)
      if (seg.length < MIN_N_REPORTAR) continue
      porDormsAmoblado.push({
        dorms: d,
        categoria: cat,
        label: CATEGORIA_LABELS[cat],
        n: seg.length,
        medianaRenta: Math.round(median(seg.map(p => p.precio_mensual))),
      })
    }
  }

  // --- Composición amoblado (global) ---
  const compCounts = new Map<string, number>()
  for (const r of rows) {
    const cat = categoriaAmoblado(r.amoblado)
    compCounts.set(cat, (compCounts.get(cat) ?? 0) + 1)
  }
  const composicionAmoblado: AlquilerCompAmoblado[] = [...compCounts.entries()]
    .map(([categoria, n]) => ({
      categoria,
      label: CATEGORIA_LABELS[categoria] ?? categoria,
      n,
      pct: rows.length > 0 ? Math.round((n / rows.length) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.n - a.n)

  return {
    total: rows.length,
    porZona,
    porDormsAmoblado,
    composicionAmoblado,
  }
}
