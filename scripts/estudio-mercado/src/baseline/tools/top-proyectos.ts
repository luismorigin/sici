import { queryVentaBaseline, getSupabaseBaseline, type VentaRowBaseline } from '../db-baseline.js'
import type { TopProyectosResult, TopProyecto, DesarrolladoraConcentrada } from '../types-baseline.js'

const SHORT_LABELS: Record<string, string> = {
  'Equipetrol Centro': 'Eq. Centro',
  'Equipetrol Norte': 'Eq. Norte',
  'Equipetrol Oeste': 'Eq. Oeste',
  'Sirari': 'Sirari',
  'Villa Brigida': 'Villa Brígida',
}

function faseDominante(props: VentaRowBaseline[]): string {
  const counts: Record<string, number> = {}
  for (const p of props) {
    const k = p.estado_construccion ?? 'no_especificado'
    counts[k] = (counts[k] ?? 0) + 1
  }
  const ordered = Object.entries(counts).sort((a, b) => b[1] - a[1])
  const top = ordered[0]?.[0]
  const second = ordered[1]?.[1] ?? 0
  // entrega_inmediata ya incluye nuevo_a_estrenar (consolidado en db-baseline)
  if (top === 'entrega_inmediata') return second >= props.length * 0.4 ? 'Mixto' : 'Entrega'
  if (top === 'preventa') return second >= props.length * 0.4 ? 'Mixto' : 'Preventa'
  return 'No esp.'
}

export async function topProyectos(
  zonasIncluidas: string[],
  minUnidades: number = 5
): Promise<TopProyectosResult> {
  const rows = await queryVentaBaseline({ zonasIncluidas })

  // Agrupar por id_proyecto_master (prioridad) o nombre_edificio como fallback
  const proyectoMap = new Map<string, VentaRowBaseline[]>()
  const keysSinMaster = new Set<string>()
  for (const r of rows) {
    let key: string
    if (r.id_proyecto_master !== null) {
      key = `master:${r.id_proyecto_master}`
    } else if (r.nombre_edificio) {
      key = `nombre:${r.nombre_edificio.trim().toLowerCase()}`
      keysSinMaster.add(r.nombre_edificio.trim())
    } else {
      continue // sin ID y sin nombre — no reportable
    }
    const arr = proyectoMap.get(key) ?? []
    arr.push(r)
    proyectoMap.set(key, arr)
  }

  // Filtrar los que cumplen minUnidades y fetch datos maestros
  const proyectosConN = [...proyectoMap.entries()].filter(([, props]) => props.length >= minUnidades)
  const masterIds = proyectosConN
    .filter(([k]) => k.startsWith('master:'))
    .map(([k]) => parseInt(k.replace('master:', ''), 10))

  // Fetch proyectos_master en un solo round trip
  const sb = getSupabaseBaseline()
  const masterMap = new Map<number, { nombre: string | null; desarrolladora: string | null; zona: string | null }>()
  if (masterIds.length > 0) {
    const { data } = await sb
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial, desarrollador, zona')
      .in('id_proyecto_master', masterIds)
    for (const row of data ?? []) {
      masterMap.set(row.id_proyecto_master, {
        nombre: row.nombre_oficial,
        desarrolladora: row.desarrollador,
        zona: row.zona,
      })
    }
  }

  const top: TopProyecto[] = proyectosConN.map(([key, props]) => {
    let nombreProyecto: string
    let desarrolladora: string | null = null
    let zona: string

    if (key.startsWith('master:')) {
      const mid = parseInt(key.replace('master:', ''), 10)
      const m = masterMap.get(mid)
      nombreProyecto = m?.nombre ?? props[0].nombre_edificio ?? `Proyecto ${mid}`
      desarrolladora = m?.desarrolladora ?? null
      zona = m?.zona ?? props[0].zona
    } else {
      nombreProyecto = props[0].nombre_edificio ?? 'Sin nombre'
      zona = props[0].zona
    }

    return {
      nombreProyecto,
      zona: SHORT_LABELS[zona] ?? zona,
      desarrolladora,
      faseDominante: faseDominante(props),
      unidades: props.length,
    }
  }).sort((a, b) => b.unidades - a.unidades)

  // Concentración por desarrolladora
  const devMap = new Map<string, { proyectos: Set<string>; uds: number; submercados: Set<string> }>()
  for (const p of top) {
    if (!p.desarrolladora) continue
    const rec = devMap.get(p.desarrolladora) ?? { proyectos: new Set(), uds: 0, submercados: new Set() }
    rec.proyectos.add(p.nombreProyecto)
    rec.uds += p.unidades
    rec.submercados.add(p.zona)
    devMap.set(p.desarrolladora, rec)
  }

  const concentracion: DesarrolladoraConcentrada[] = [...devMap.entries()]
    .filter(([, r]) => r.proyectos.size >= 2)
    .map(([desarrolladora, r]) => ({
      desarrolladora,
      proyectos: [...r.proyectos],
      unidadesTotal: r.uds,
      submercados: [...r.submercados],
    }))
    .sort((a, b) => b.unidadesTotal - a.unidadesTotal)

  const totalTopUnidades = top.reduce((s, p) => s + p.unidades, 0)
  const pctTopSobreTotal = rows.length > 0
    ? Math.round((totalTopUnidades / rows.length) * 1000) / 10
    : 0

  return {
    minUnidades,
    top,
    concentracion,
    totalTopUnidades,
    pctTopSobreTotal,
  }
}
