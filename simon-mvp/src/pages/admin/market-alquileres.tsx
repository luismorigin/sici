import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts'

// ============================================================================
// INTERFACES
// ============================================================================

interface RentalProperty {
  id: number
  zona: string | null
  dormitorios: number | null
  precio_mensual_bob: number | null
  area_total_m2: number | null
  id_proyecto_master: number | null
  fuente: string | null
}

interface KPIData {
  total_unidades: number
  renta_mediana_bs: number
  bs_m2_promedio: number
  edificios_con_oferta: number
  fuentes: { century21: number; remax: number }
}

interface ZonaTipologiaCell {
  zona: string
  dormitorios: number
  mediana_bs: number
  count: number
}

interface TopEdificio {
  proyecto: string
  zona: string | null
  unidades: number
  precio_min: number
  precio_max: number
  tipologias: string
}

interface PrecioBucket {
  label: string
  count: number
  color: string
}

interface ZonaBsM2 {
  zona: string
  bs_m2: number
  count: number
}

interface YieldRow {
  zona: string
  renta_m2_bs: number
  venta_m2_usd: number
  yield_anual: number
  unidades_alquiler: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MarketAlquileresDashboard() {
  const { admin, loading: authLoading } = useAdminAuth(['super_admin', 'supervisor', 'viewer'])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Raw data
  const [rentalProps, setRentalProps] = useState<RentalProperty[]>([])
  const [ventaZonaData, setVentaZonaData] = useState<{ zona: string; usd_m2: number }[]>([])
  const [projectMap, setProjectMap] = useState<Map<number, { nombre: string; zona: string | null }>>(new Map())
  const [tcParalelo, setTcParalelo] = useState(0)

  // ============================================================================
  // FETCH
  // ============================================================================

  const fetchAllData = async () => {
    if (!supabase) return
    setLoading(true)
    try {
      await Promise.all([
        fetchRentalData(),
        fetchVentaData(),
        fetchTC()
      ])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching rental market data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchRentalData = async () => {
    if (!supabase) return

    const { data: raw, error } = await supabase
      .from('propiedades_v2')
      .select('id, zona, dormitorios, precio_mensual_bob, area_total_m2, id_proyecto_master, fuente')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'alquiler')
      .is('duplicado_de', null)

    if (error || !raw) { console.error('fetchRentalData error:', error); return }

    // Parse numeric strings from Supabase + filter in JS
    const parsed: RentalProperty[] = raw
      .map((p: any) => ({
        ...p,
        precio_mensual_bob: p.precio_mensual_bob ? parseFloat(p.precio_mensual_bob) : null,
        area_total_m2: p.area_total_m2 ? parseFloat(p.area_total_m2) : null,
      }))
      .filter((p: RentalProperty) =>
        p.precio_mensual_bob && p.precio_mensual_bob > 0 && p.precio_mensual_bob < 50000 &&
        p.area_total_m2 && p.area_total_m2 >= 20
      )
    setRentalProps(parsed)

    // Fetch project names for props that have projects
    const projectIds = [...new Set(parsed.map(p => p.id_proyecto_master).filter(Boolean))] as number[]
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial, zona')
        .in('id_proyecto_master', projectIds)

      if (projects) {
        const map = new Map<number, { nombre: string; zona: string | null }>()
        projects.forEach(p => map.set(p.id_proyecto_master, { nombre: p.nombre_oficial, zona: p.zona }))
        setProjectMap(map)
      }
    }
  }

  const fetchVentaData = async () => {
    if (!supabase) return

    const { data, error } = await supabase
      .from('propiedades_v2')
      .select('zona, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .is('duplicado_de', null)
      .gt('precio_usd', 0)
      .gte('area_total_m2', 20)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')

    if (error) { console.error('fetchVentaData error:', error); return }
    if (!data) return
    console.log(`fetchVentaData: ${data.length} venta props loaded`)

    // Group by zona and compute avg $/m²
    const grouped: Record<string, { sum: number; count: number }> = {}
    data.forEach(p => {
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2)
      if (!precio || !area || area < 20) return
      const z = p.zona || 'Sin zona'
      if (!grouped[z]) grouped[z] = { sum: 0, count: 0 }
      grouped[z].sum += precio / area
      grouped[z].count++
    })

    setVentaZonaData(
      Object.entries(grouped).map(([zona, v]) => ({
        zona,
        usd_m2: Math.round(v.sum / v.count)
      }))
    )
  }

  const fetchTC = async () => {
    if (!supabase) return
    const { data } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_paralelo')
      .single()
    if (data) setTcParalelo(parseFloat(data.valor) || 0)
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // ============================================================================
  // COMPUTED DATA
  // ============================================================================

  // Zona display mapping for alquiler (nombres viejos)
  const ZONA_DISPLAY: Record<string, string> = {
    'Equipetrol': 'Equipetrol',
    'Sirari': 'Sirari',
    'Equipetrol Norte/Norte': 'Eq. Norte/Norte',
    'Equipetrol Norte/Sur': 'Eq. Norte/Sur',
    'Faremafu': 'Faremafu',
    'Villa Brigida': 'Villa Brigida',
    'Equipetrol Centro': 'Eq. Centro',
    'Equipetrol Franja': 'Eq. Franja',
    'Equipetrol Norte': 'Eq. Norte',
    'Sin zona': 'Sin zona'
  }

  const getZonaLabel = (zona: string): string => ZONA_DISPLAY[zona] || zona

  const formatNumber = (value: number) => new Intl.NumberFormat('es-BO').format(value)

  const formatBs = (value: number) => `Bs ${formatNumber(Math.round(value))}`

  const median = (arr: number[]): number => {
    if (arr.length === 0) return 0
    const sorted = [...arr].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }

  // KPIs
  const kpis = useMemo<KPIData | null>(() => {
    if (rentalProps.length === 0) return null

    const precios = rentalProps
      .map(p => p.precio_mensual_bob || 0)
      .filter(p => p > 0)
    const bsM2 = rentalProps
      .filter(p => p.precio_mensual_bob && p.area_total_m2 && p.area_total_m2 > 0)
      .map(p => (p.precio_mensual_bob as number) / (p.area_total_m2 as number))

    const proyectosSet = new Set(rentalProps.map(p => p.id_proyecto_master).filter(Boolean))

    return {
      total_unidades: rentalProps.length,
      renta_mediana_bs: Math.round(median(precios)),
      bs_m2_promedio: Math.round(bsM2.reduce((a, b) => a + b, 0) / bsM2.length * 10) / 10,
      edificios_con_oferta: proyectosSet.size,
      fuentes: {
        century21: rentalProps.filter(p => p.fuente === 'century21').length,
        remax: rentalProps.filter(p => p.fuente === 'remax').length
      }
    }
  }, [rentalProps])

  // Zona + tipología pivot
  const zonaTipologia = useMemo<ZonaTipologiaCell[]>(() => {
    const cells: Record<string, { precios: number[]; zona: string; dorm: number }> = {}
    rentalProps.forEach(p => {
      if (p.zona == null || p.dormitorios == null || !p.precio_mensual_bob) return
      const key = `${p.zona}__${p.dormitorios}`
      if (!cells[key]) cells[key] = { precios: [], zona: p.zona, dorm: p.dormitorios }
      cells[key].precios.push(p.precio_mensual_bob)
    })
    return Object.values(cells).map(c => ({
      zona: c.zona,
      dormitorios: c.dorm,
      mediana_bs: Math.round(median(c.precios)),
      count: c.precios.length
    }))
  }, [rentalProps])

  // Unique zonas sorted by total count
  const zonasOrdered = useMemo(() => {
    const counts: Record<string, number> = {}
    zonaTipologia.forEach(c => {
      counts[c.zona] = (counts[c.zona] || 0) + c.count
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(e => e[0])
  }, [zonaTipologia])

  const dormitoriosSet = [0, 1, 2, 3]

  // Top 10 edificios
  const topEdificios = useMemo<TopEdificio[]>(() => {
    const grouped: Record<number, RentalProperty[]> = {}
    rentalProps.forEach(p => {
      if (!p.id_proyecto_master) return
      if (!grouped[p.id_proyecto_master]) grouped[p.id_proyecto_master] = []
      grouped[p.id_proyecto_master].push(p)
    })

    return Object.entries(grouped)
      .map(([idStr, props]) => {
        const id = parseInt(idStr)
        const proj = projectMap.get(id)
        const precios = props.map(p => p.precio_mensual_bob || 0).filter(p => p > 0)
        const dorms = [...new Set(props.map(p => p.dormitorios).filter(d => d !== null))] as number[]
        dorms.sort((a, b) => a - b)
        return {
          proyecto: proj?.nombre || `ID ${id}`,
          zona: proj?.zona || props[0]?.zona || null,
          unidades: props.length,
          precio_min: precios.length ? Math.min(...precios) : 0,
          precio_max: precios.length ? Math.max(...precios) : 0,
          tipologias: dorms.map(d => d === 0 ? 'S' : `${d}D`).join(', ')
        }
      })
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 10)
  }, [rentalProps, projectMap])

  // Distribución de precios (histograma)
  const precioBuckets = useMemo<PrecioBucket[]>(() => {
    const buckets: PrecioBucket[] = [
      { label: '< 3K', count: 0, color: '#10b981' },
      { label: '3-5K', count: 0, color: '#3b82f6' },
      { label: '5-8K', count: 0, color: '#8b5cf6' },
      { label: '8-12K', count: 0, color: '#f59e0b' },
      { label: '12K+', count: 0, color: '#ef4444' }
    ]
    rentalProps.forEach(p => {
      const precio = p.precio_mensual_bob || 0
      if (precio < 3000) buckets[0].count++
      else if (precio < 5000) buckets[1].count++
      else if (precio < 8000) buckets[2].count++
      else if (precio < 12000) buckets[3].count++
      else buckets[4].count++
    })
    return buckets
  }, [rentalProps])

  // Bs/m² por zona
  const zonaBsM2 = useMemo<ZonaBsM2[]>(() => {
    const grouped: Record<string, { sum: number; count: number }> = {}
    rentalProps.forEach(p => {
      if (!p.zona || !p.precio_mensual_bob || !p.area_total_m2 || p.area_total_m2 <= 0) return
      if (!grouped[p.zona]) grouped[p.zona] = { sum: 0, count: 0 }
      grouped[p.zona].sum += p.precio_mensual_bob / p.area_total_m2
      grouped[p.zona].count++
    })
    return Object.entries(grouped)
      .map(([zona, v]) => ({
        zona: getZonaLabel(zona),
        bs_m2: Math.round(v.sum / v.count * 10) / 10,
        count: v.count
      }))
      .sort((a, b) => b.bs_m2 - a.bs_m2)
  }, [rentalProps])

  // Yield mapping: alquiler zona → venta zona
  const ALQUILER_TO_VENTA_ZONA: Record<string, string> = {
    'Equipetrol': 'Equipetrol Centro',
    'Sirari': 'Sirari',
    'Equipetrol Norte/Norte': 'Equipetrol Norte',
    'Equipetrol Norte/Sur': 'Equipetrol Norte',
    'Faremafu': 'Equipetrol Oeste',
    'Villa Brigida': 'Villa Brígida',
    'Equipetrol Centro': 'Equipetrol Centro',
    'Equipetrol Franja': 'Equipetrol Oeste',
    'Equipetrol Norte': 'Equipetrol Norte'
  }

  const yieldData = useMemo<YieldRow[]>(() => {
    if (!tcParalelo || ventaZonaData.length === 0) return []

    // Group rental Bs/m² by zona
    const rentalByZona: Record<string, { sum: number; count: number }> = {}
    rentalProps.forEach(p => {
      if (!p.zona || !p.precio_mensual_bob || !p.area_total_m2 || p.area_total_m2 <= 0) return
      if (!rentalByZona[p.zona]) rentalByZona[p.zona] = { sum: 0, count: 0 }
      rentalByZona[p.zona].sum += p.precio_mensual_bob / p.area_total_m2
      rentalByZona[p.zona].count++
    })

    // Build venta lookup
    const ventaLookup: Record<string, number> = {}
    ventaZonaData.forEach(v => { ventaLookup[v.zona] = v.usd_m2 })

    const rows: YieldRow[] = []
    Object.entries(rentalByZona).forEach(([zona, rental]) => {
      if (rental.count < 3) return // Need at least 3 for meaningful data
      const ventaZona = ALQUILER_TO_VENTA_ZONA[zona]
      if (!ventaZona || !ventaLookup[ventaZona]) return

      const rentaM2Bs = rental.sum / rental.count
      const ventaM2Usd = ventaLookup[ventaZona]
      const ventaM2Bs = ventaM2Usd * tcParalelo
      const yieldAnual = (rentaM2Bs * 12 / ventaM2Bs) * 100

      rows.push({
        zona,
        renta_m2_bs: Math.round(rentaM2Bs * 10) / 10,
        venta_m2_usd: ventaM2Usd,
        yield_anual: Math.round(yieldAnual * 100) / 100,
        unidades_alquiler: rental.count
      })
    })

    return rows.sort((a, b) => b.yield_anual - a.yield_anual)
  }, [rentalProps, ventaZonaData, tcParalelo])

  // ============================================================================
  // HELPERS
  // ============================================================================

  const getCellColor = (count: number) => {
    if (count >= 5) return 'bg-emerald-50 text-emerald-800'
    if (count >= 2) return 'bg-amber-50 text-amber-800'
    return 'bg-red-50 text-red-700'
  }

  const getYieldColor = (y: number) => {
    if (y >= 7) return 'text-emerald-600 font-bold'
    if (y >= 5) return 'text-blue-600 font-semibold'
    return 'text-slate-600'
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800" />
      </div>
    )
  }

  if (!admin) return null

  return (
    <>
      <Head>
        <title>Market Alquileres | SICI Admin</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white py-4 px-6 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Equipetrol Rental Pulse</h1>
              <p className="text-slate-400 text-sm" suppressHydrationWarning>
                Última actualización: {lastUpdate.toLocaleTimeString('es-BO')} • Fuente: SICI Real Estate Intelligence
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchAllData}
                disabled={loading}
                className="bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-lg transition-all"
              >
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
              <Link href="/admin/market" className="text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors">
                Market Venta
              </Link>
              <Link href="/admin/salud" className="text-teal-400 hover:text-teal-300 text-sm font-medium transition-colors">
                Salud
              </Link>
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm transition-colors">
                Propiedades
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-6">
          {loading && rentalProps.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-800" />
            </div>
          ) : (
            <>
              {/* KPIs Row */}
              {kpis && (
                <div className="grid grid-cols-5 gap-4 mb-8">
                  <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                    <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Inventario</p>
                    <p className="text-4xl font-bold text-slate-900 mt-1">{kpis.total_unidades}</p>
                    <p className="text-slate-400 text-sm mt-1">unidades en alquiler</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                    <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Renta Mediana</p>
                    <p className="text-4xl font-bold text-teal-600 mt-1">{formatBs(kpis.renta_mediana_bs)}</p>
                    <p className="text-slate-400 text-sm mt-1">mensual</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                    <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Bs/m²</p>
                    <p className="text-4xl font-bold text-blue-600 mt-1">{kpis.bs_m2_promedio}</p>
                    <p className="text-slate-400 text-sm mt-1">promedio</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                    <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Edificios</p>
                    <p className="text-4xl font-bold text-slate-900 mt-1">{kpis.edificios_con_oferta}</p>
                    <p className="text-slate-400 text-sm mt-1">con oferta</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                    <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Fuentes</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">
                      C21: {kpis.fuentes.century21}
                    </p>
                    <p className="text-slate-400 text-sm mt-1">Remax: {kpis.fuentes.remax}</p>
                  </div>
                </div>
              )}

              {/* Main Grid: Pivot + Top Edificios */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                {/* Tabla Pivot: Precios por zona + tipología */}
                <div className="col-span-2 bg-white rounded-xl p-6 shadow-lg border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Renta Mediana por Zona + Tipología (Bs/mes)</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-slate-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-600">Zona</th>
                          {dormitoriosSet.map(d => (
                            <th key={d} className="text-center py-3 px-2 font-semibold text-slate-600">
                              {d === 0 ? 'Studio' : `${d}D`}
                            </th>
                          ))}
                          <th className="text-center py-3 px-2 font-semibold text-slate-600">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {zonasOrdered.filter(z => z !== 'Sin zona' && z !== null).map((zona, i) => {
                          const totalCount = zonaTipologia.filter(c => c.zona === zona).reduce((a, c) => a + c.count, 0)
                          return (
                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                              <td className="py-3 px-2 font-bold text-slate-900">{getZonaLabel(zona)}</td>
                              {dormitoriosSet.map(d => {
                                const cell = zonaTipologia.find(c => c.zona === zona && c.dormitorios === d)
                                if (!cell) return <td key={d} className="py-3 px-2 text-center text-slate-300">-</td>
                                return (
                                  <td key={d} className="py-3 px-2 text-center">
                                    <div className={`inline-block rounded-lg px-3 py-1 ${getCellColor(cell.count)}`}>
                                      <span className="font-bold">{formatNumber(cell.mediana_bs)}</span>
                                      <span className="text-xs ml-1 opacity-70">({cell.count})</span>
                                    </div>
                                  </td>
                                )
                              })}
                              <td className="py-3 px-2 text-center">
                                <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-full text-xs font-bold">{totalCount}</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    <p className="text-xs text-slate-400 mt-3">
                      Colores: <span className="text-emerald-700">verde</span> = 5+ unidades,{' '}
                      <span className="text-amber-700">ámbar</span> = 2-4,{' '}
                      <span className="text-red-700">rojo</span> = 1
                    </p>
                  </div>
                </div>

                {/* Top 10 edificios */}
                <div className="col-span-1 bg-white rounded-xl p-6 shadow-lg border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Top 10 Edificios</h3>
                  <div className="space-y-3">
                    {topEdificios.map((e, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                          i < 3 ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">{e.proyecto}</p>
                          <p className="text-xs text-slate-500">
                            {e.zona ? getZonaLabel(e.zona) : '-'} • {e.tipologias}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            <span className="font-semibold">{e.unidades} ud.</span>
                            {' • '}
                            {formatBs(e.precio_min)} - {formatBs(e.precio_max)}
                          </p>
                        </div>
                      </div>
                    ))}
                    {topEdificios.length === 0 && (
                      <p className="text-slate-400 text-sm text-center py-4">Sin datos</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-2 gap-6 mb-8">
                {/* Distribución de precios */}
                <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Distribución de Precios (Bs/mes)</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={precioBuckets} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        formatter={(value: any) => [`${value} unidades`, 'Cantidad']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {precioBuckets.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Bs/m² por zona */}
                <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-900 mb-4">Bs/m² por Zona</h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={zonaBsM2} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis dataKey="zona" type="category" tick={{ fontSize: 11 }} width={75} />
                      <Tooltip
                        formatter={(value: any) => [`Bs ${value}/m²`, 'Promedio']}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0' }}
                      />
                      <Bar dataKey="bs_m2" fill="#0d9488" radius={[0, 6, 6, 0]}>
                        {zonaBsM2.map((_, idx) => (
                          <Cell key={idx} fill={idx === 0 ? '#0d9488' : '#5eead4'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Yield Table */}
              {yieldData.length > 0 && (
                <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-8">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Yield Estimado por Zona (ROI Alquiler)</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Fórmula: (Renta/m² mensual x 12) / (Precio venta/m² x TC {tcParalelo.toFixed(2)}) x 100. Mínimo 3 unidades alquiler por zona.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-slate-200">
                          <th className="text-left py-3 px-3 font-semibold text-slate-600">Zona</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600">Renta Bs/m²</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600">Venta $/m²</th>
                          <th className="text-right py-3 px-3 font-semibold text-slate-600">Yield Anual</th>
                          <th className="text-center py-3 px-3 font-semibold text-slate-600">Muestra</th>
                        </tr>
                      </thead>
                      <tbody>
                        {yieldData.map((row, i) => (
                          <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="py-3 px-3 font-bold text-slate-900">{getZonaLabel(row.zona)}</td>
                            <td className="py-3 px-3 text-right text-slate-700">Bs {row.renta_m2_bs}</td>
                            <td className="py-3 px-3 text-right text-slate-700">${formatNumber(row.venta_m2_usd)}</td>
                            <td className={`py-3 px-3 text-right ${getYieldColor(row.yield_anual)}`}>
                              {row.yield_anual.toFixed(2)}%
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs">{row.unidades_alquiler} ud.</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Placeholders */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl mb-2">&#128337;</span>
                  <h4 className="font-bold text-slate-700 mb-1">Historial de Precios</h4>
                  <p className="text-xs text-slate-500">Disponible cuando haya 60+ días de datos de snapshots de alquiler</p>
                </div>
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl mb-2">&#128337;</span>
                  <h4 className="font-bold text-slate-700 mb-1">Absorción Alquiler</h4>
                  <p className="text-xs text-slate-500">Datos limpios a partir de ~14 Mar 2026 (backlog contaminado)</p>
                </div>
                <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl p-6 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl mb-2">&#128337;</span>
                  <h4 className="font-bold text-slate-700 mb-1">Mapa de Calor GPS</h4>
                  <p className="text-xs text-slate-500">En desarrollo — visualización geoespacial de oferta y precios</p>
                </div>
              </div>

              {/* Footer */}
              <p className="text-center text-xs text-slate-400">
                SICI Real Estate Intelligence • Pipeline alquiler activo desde 12 Feb 2026 • TC Paralelo: Bs {tcParalelo.toFixed(2)}/$
              </p>
            </>
          )}
        </main>
      </div>
    </>
  )
}
