import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Interfaces
interface KPIData {
  total_unidades: number
  proyectos_activos: number
  precio_m2_promedio: number
  ticket_promedio: number
  area_promedio: number
  tc_paralelo: number
  tc_oficial: number
}

interface DormitoriosData {
  dormitorios: number | null
  cantidad: number
  precio_promedio: number
  precio_m2: number
}

interface EstadoConstruccionData {
  estado: string
  cantidad: number
  precio_promedio: number
  precio_m2: number
}

interface ProyectoData {
  proyecto: string
  desarrollador: string | null
  unidades: number
  desde: number
  hasta: number
  precio_m2: number
}

interface ZonaData {
  zona: string
  unidades: number
  precio_m2: number
}

interface SnapshotData {
  fecha: string
  props_total: number
  props_completadas: number
  props_matcheadas: number
  pct_match_completadas: number
  props_creadas_24h: number
}

interface TCHistoricoData {
  fecha: string
  tc_promedio: number
}

export default function MarketPulseDashboard() {
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Data states
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [dormitorios, setDormitorios] = useState<DormitoriosData[]>([])
  const [estadoConstruccion, setEstadoConstruccion] = useState<EstadoConstruccionData[]>([])
  const [topProyectos, setTopProyectos] = useState<ProyectoData[]>([])
  const [zonas, setZonas] = useState<ZonaData[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([])
  const [tcHistorico, setTcHistorico] = useState<TCHistoricoData[]>([])

  // Fetch all data
  const fetchAllData = async () => {
    if (!supabase) return
    setLoading(true)

    try {
      await Promise.all([
        fetchKPIs(),
        fetchDormitorios(),
        fetchEstadoConstruccion(),
        fetchTopProyectos(),
        fetchZonas(),
        fetchSnapshots(),
        fetchTCHistorico()
      ])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching market data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Individual fetch functions
  const fetchKPIs = async () => {
    if (!supabase) return

    const { data: propStats } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, id_proyecto_master')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)

    const { data: tcParalelo } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_paralelo')
      .single()

    const { data: tcOficial } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_oficial')
      .single()

    if (propStats) {
      const validProps = propStats.filter(p => p.precio_usd && p.area_total_m2)
      const totalUnidades = validProps.length
      const proyectosSet = new Set(validProps.map(p => p.id_proyecto_master).filter(Boolean))

      const sumPrecio = validProps.reduce((acc, p) => acc + (parseFloat(p.precio_usd) || 0), 0)
      const sumArea = validProps.reduce((acc, p) => acc + (parseFloat(p.area_total_m2) || 0), 0)
      const sumPrecioM2 = validProps.reduce((acc, p) => {
        const precio = parseFloat(p.precio_usd) || 0
        const area = parseFloat(p.area_total_m2) || 1
        return acc + (precio / area)
      }, 0)

      setKpis({
        total_unidades: totalUnidades,
        proyectos_activos: proyectosSet.size,
        precio_m2_promedio: Math.round(sumPrecioM2 / totalUnidades),
        ticket_promedio: Math.round(sumPrecio / totalUnidades),
        area_promedio: Math.round((sumArea / totalUnidades) * 10) / 10,
        tc_paralelo: parseFloat(tcParalelo?.valor) || 0,
        tc_oficial: parseFloat(tcOficial?.valor) || 0
      })
    }
  }

  const fetchDormitorios = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select('dormitorios, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)

    if (data) {
      const grouped = data.reduce((acc: Record<string, any>, p) => {
        const key = p.dormitorios ?? 'null'
        if (!acc[key]) {
          acc[key] = { dormitorios: p.dormitorios, precios: [], preciosM2: [] }
        }
        if (p.precio_usd) {
          acc[key].precios.push(parseFloat(p.precio_usd))
          if (p.area_total_m2) {
            acc[key].preciosM2.push(parseFloat(p.precio_usd) / parseFloat(p.area_total_m2))
          }
        }
        return acc
      }, {})

      const result: DormitoriosData[] = Object.values(grouped)
        .map((g: any) => ({
          dormitorios: g.dormitorios,
          cantidad: g.precios.length,
          precio_promedio: Math.round(g.precios.reduce((a: number, b: number) => a + b, 0) / g.precios.length),
          precio_m2: Math.round(g.preciosM2.reduce((a: number, b: number) => a + b, 0) / g.preciosM2.length)
        }))
        .filter(d => d.cantidad > 0)
        .sort((a, b) => (a.dormitorios ?? -1) - (b.dormitorios ?? -1))

      setDormitorios(result)
    }
  }

  const fetchEstadoConstruccion = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select('estado_construccion, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('estado_construccion', 'is', null)

    if (data) {
      const grouped = data.reduce((acc: Record<string, any>, p) => {
        const key = p.estado_construccion || 'no_especificado'
        if (!acc[key]) {
          acc[key] = { estado: key, precios: [], preciosM2: [] }
        }
        if (p.precio_usd) {
          acc[key].precios.push(parseFloat(p.precio_usd))
          if (p.area_total_m2) {
            acc[key].preciosM2.push(parseFloat(p.precio_usd) / parseFloat(p.area_total_m2))
          }
        }
        return acc
      }, {})

      const result: EstadoConstruccionData[] = Object.values(grouped)
        .map((g: any) => ({
          estado: g.estado,
          cantidad: g.precios.length,
          precio_promedio: Math.round(g.precios.reduce((a: number, b: number) => a + b, 0) / g.precios.length),
          precio_m2: Math.round(g.preciosM2.reduce((a: number, b: number) => a + b, 0) / g.preciosM2.length)
        }))
        .filter(d => d.cantidad > 0)
        .sort((a, b) => b.cantidad - a.cantidad)

      setEstadoConstruccion(result)
    }
  }

  const fetchTopProyectos = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select(`
        precio_usd,
        area_total_m2,
        proyectos_master!inner (
          nombre_oficial,
          desarrollador
        )
      `)
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('id_proyecto_master', 'is', null)

    if (data) {
      const grouped = data.reduce((acc: Record<string, any>, p: any) => {
        const proyecto = p.proyectos_master?.nombre_oficial || 'Sin nombre'
        if (!acc[proyecto]) {
          acc[proyecto] = {
            proyecto,
            desarrollador: p.proyectos_master?.desarrollador,
            precios: [],
            preciosM2: []
          }
        }
        if (p.precio_usd) {
          acc[proyecto].precios.push(parseFloat(p.precio_usd))
          if (p.area_total_m2) {
            acc[proyecto].preciosM2.push(parseFloat(p.precio_usd) / parseFloat(p.area_total_m2))
          }
        }
        return acc
      }, {})

      const result: ProyectoData[] = Object.values(grouped)
        .map((g: any) => ({
          proyecto: g.proyecto,
          desarrollador: g.desarrollador,
          unidades: g.precios.length,
          desde: Math.round(Math.min(...g.precios)),
          hasta: Math.round(Math.max(...g.precios)),
          precio_m2: Math.round(g.preciosM2.reduce((a: number, b: number) => a + b, 0) / g.preciosM2.length)
        }))
        .filter(d => d.unidades > 0)
        .sort((a, b) => b.unidades - a.unidades)
        .slice(0, 10)

      setTopProyectos(result)
    }
  }

  const fetchZonas = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select('zona, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('zona', 'is', null)

    if (data) {
      const grouped = data.reduce((acc: Record<string, any>, p) => {
        const key = p.zona || 'Sin zona'
        if (!acc[key]) {
          acc[key] = { zona: key, preciosM2: [] }
        }
        if (p.precio_usd && p.area_total_m2) {
          acc[key].preciosM2.push(parseFloat(p.precio_usd) / parseFloat(p.area_total_m2))
        }
        return acc
      }, {})

      const result: ZonaData[] = Object.values(grouped)
        .map((g: any) => ({
          zona: g.zona,
          unidades: g.preciosM2.length,
          precio_m2: Math.round(g.preciosM2.reduce((a: number, b: number) => a + b, 0) / g.preciosM2.length)
        }))
        .filter(d => d.unidades > 0)
        .sort((a, b) => b.unidades - a.unidades)

      setZonas(result)
    }
  }

  const fetchSnapshots = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('auditoria_snapshots')
      .select('fecha, props_total, props_completadas, props_matcheadas, pct_match_completadas, props_creadas_24h')
      .order('fecha', { ascending: true })
      .limit(30)

    if (data) {
      setSnapshots(data)
    }
  }

  const fetchTCHistorico = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('tc_binance_historial')
      .select('timestamp, tc_sell')
      .order('timestamp', { ascending: true })
      .limit(100)

    if (data) {
      // Agrupar por día
      const grouped = data.reduce((acc: Record<string, number[]>, row) => {
        const fecha = new Date(row.timestamp).toISOString().split('T')[0]
        if (!acc[fecha]) acc[fecha] = []
        if (row.tc_sell) acc[fecha].push(parseFloat(row.tc_sell))
        return acc
      }, {})

      const result: TCHistoricoData[] = Object.entries(grouped)
        .map(([fecha, valores]) => ({
          fecha,
          tc_promedio: Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      setTcHistorico(result)
    }
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // Format helpers
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-BO').format(value)
  }

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      'preventa': 'Preventa',
      'entrega_inmediata': 'Entrega Inmediata',
      'nuevo_a_estrenar': 'Nuevo a Estrenar',
      'no_especificado': 'No Especificado',
      'usado': 'Usado'
    }
    return labels[estado] || estado
  }

  const getPrecioM2Color = (precioM2: number) => {
    if (precioM2 < 1800) return 'text-green-600 bg-green-50'
    if (precioM2 > 2100) return 'text-red-600 bg-red-50'
    return 'text-amber-600 bg-amber-50'
  }

  return (
    <>
      <Head>
        <title>Market Pulse | SICI Admin</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Equipetrol Market Pulse</h1>
              <p className="text-slate-400 text-sm" suppressHydrationWarning>
                Última actualización: {lastUpdate.toLocaleTimeString('es-BO')}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchAllData}
                disabled={loading}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">
                Propiedades
              </Link>
              <Link href="/admin/salud" className="text-teal-400 hover:text-teal-300 text-sm font-medium">
                Salud
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-6">
          {/* KPIs Row */}
          {kpis && (
            <div className="grid grid-cols-6 gap-4 mb-8">
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Unidades</p>
                <p className="text-3xl font-bold text-slate-900">{kpis.total_unidades}</p>
                <p className="text-slate-400 text-xs">en venta</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Proyectos</p>
                <p className="text-3xl font-bold text-slate-900">{kpis.proyectos_activos}</p>
                <p className="text-slate-400 text-xs">activos</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-xs uppercase tracking-wide">$/m²</p>
                <p className="text-3xl font-bold text-blue-600">${formatNumber(kpis.precio_m2_promedio)}</p>
                <p className="text-slate-400 text-xs">promedio</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Ticket</p>
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(kpis.ticket_promedio)}</p>
                <p className="text-slate-400 text-xs">promedio</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <p className="text-slate-500 text-xs uppercase tracking-wide">Área</p>
                <p className="text-3xl font-bold text-slate-900">{kpis.area_promedio}</p>
                <p className="text-slate-400 text-xs">m² promedio</p>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-4 shadow-sm text-white">
                <p className="text-amber-100 text-xs uppercase tracking-wide">TC Paralelo</p>
                <p className="text-3xl font-bold">{kpis.tc_paralelo.toFixed(2)}</p>
                <p className="text-amber-200 text-xs">Bs/$ (Oficial: {kpis.tc_oficial})</p>
              </div>
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Distribución por Dormitorios */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Distribución por Dormitorios</h3>
              <div className="space-y-3">
                {dormitorios.map((d, i) => {
                  const maxCantidad = Math.max(...dormitorios.map(x => x.cantidad))
                  const width = (d.cantidad / maxCantidad) * 100
                  const minPrecioM2 = Math.min(...dormitorios.filter(x => x.precio_m2).map(x => x.precio_m2))
                  const isBest = d.precio_m2 === minPrecioM2
                  const isMax = d.cantidad === maxCantidad

                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-16 text-sm font-medium text-slate-700">
                        {d.dormitorios === null ? 'N/A' : d.dormitorios === 0 ? 'Studio' : `${d.dormitorios}D`}
                      </div>
                      <div className="flex-1 h-8 bg-slate-100 rounded-lg overflow-hidden relative">
                        <div
                          className={`h-full rounded-lg transition-all ${
                            isMax ? 'bg-amber-500' : isBest ? 'bg-green-500' : 'bg-blue-500'
                          }`}
                          style={{ width: `${width}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                          {d.cantidad} uds
                        </span>
                      </div>
                      <div className={`w-24 text-right text-sm font-medium px-2 py-1 rounded ${getPrecioM2Color(d.precio_m2)}`}>
                        ${formatNumber(d.precio_m2)}/m²
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-4 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-amber-500 rounded"></span> Más stock
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-500 rounded"></span> Mejor $/m²
                </span>
              </div>
            </div>

            {/* Comparativa Preventa vs Entrega */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Preventa vs Entrega Inmediata</h3>
              {estadoConstruccion.length > 0 && (
                <>
                  <div className="space-y-4">
                    {estadoConstruccion.slice(0, 4).map((e, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-900">{getEstadoLabel(e.estado)}</p>
                          <p className="text-sm text-slate-500">{e.cantidad} unidades</p>
                        </div>
                        <div className="text-right">
                          <p className={`text-lg font-bold ${getPrecioM2Color(e.precio_m2).split(' ')[0]}`}>
                            ${formatNumber(e.precio_m2)}/m²
                          </p>
                          <p className="text-sm text-slate-500">{formatCurrency(e.precio_promedio)} prom.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(() => {
                    const preventa = estadoConstruccion.find(e => e.estado === 'preventa')
                    const entrega = estadoConstruccion.find(e => e.estado === 'entrega_inmediata')
                    if (preventa && entrega) {
                      const ahorro = ((entrega.precio_m2 - preventa.precio_m2) / entrega.precio_m2) * 100
                      return (
                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <p className="text-green-800 font-medium">
                            Ahorro Preventa: {ahorro.toFixed(1)}% (${formatNumber(entrega.precio_m2 - preventa.precio_m2)}/m²)
                          </p>
                          <p className="text-green-600 text-sm">
                            En 80m² ahorras ~${formatNumber((entrega.precio_m2 - preventa.precio_m2) * 80)}
                          </p>
                        </div>
                      )
                    }
                    return null
                  })()}
                </>
              )}
            </div>
          </div>

          {/* Second Row */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            {/* Top Proyectos */}
            <div className="col-span-2 bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Top 10 Proyectos por Inventario</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-2 px-2 font-medium text-slate-500">#</th>
                      <th className="text-left py-2 px-2 font-medium text-slate-500">Proyecto</th>
                      <th className="text-left py-2 px-2 font-medium text-slate-500">Desarrollador</th>
                      <th className="text-center py-2 px-2 font-medium text-slate-500">Uds</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-500">Desde</th>
                      <th className="text-right py-2 px-2 font-medium text-slate-500">$/m²</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topProyectos.map((p, i) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-2 px-2 text-slate-400">{i + 1}</td>
                        <td className="py-2 px-2 font-medium text-slate-900">{p.proyecto}</td>
                        <td className="py-2 px-2 text-slate-600 truncate max-w-[150px]" title={p.desarrollador || ''}>
                          {p.desarrollador || '-'}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                            {p.unidades}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right text-slate-700">{formatCurrency(p.desde)}</td>
                        <td className="py-2 px-2 text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${getPrecioM2Color(p.precio_m2)}`}>
                            ${formatNumber(p.precio_m2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Distribución por Zona */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Distribución por Zona</h3>
              <div className="space-y-3">
                {zonas.map((z, i) => {
                  const total = zonas.reduce((acc, x) => acc + x.unidades, 0)
                  const pct = ((z.unidades / total) * 100).toFixed(0)
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="font-medium text-slate-900">{z.zona}</p>
                        <p className="text-sm text-slate-500">{z.unidades} uds ({pct}%)</p>
                      </div>
                      <div className={`px-2 py-1 rounded text-sm font-medium ${getPrecioM2Color(z.precio_m2)}`}>
                        ${formatNumber(z.precio_m2)}/m²
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Historical Charts Placeholder */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Evolución Histórica */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Evolución del Inventario</h3>
              {snapshots.length > 0 ? (
                <div className="h-64 flex items-end gap-1">
                  {snapshots.slice(-15).map((s, i) => {
                    const maxTotal = Math.max(...snapshots.map(x => x.props_total))
                    const height = (s.props_total / maxTotal) * 100
                    const fecha = new Date(s.fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex flex-col justify-end" style={{ height: '200px' }}>
                          <div
                            className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                            style={{ height: `${height}%` }}
                            title={`${s.props_total} propiedades`}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 rotate-45 origin-left">{fecha}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No hay datos históricos</p>
              )}
              {snapshots.length > 0 && (
                <div className="mt-4 flex justify-between text-sm text-slate-600">
                  <span>Inicio: {snapshots[0]?.props_total || 0}</span>
                  <span className="font-medium text-blue-600">
                    Actual: {snapshots[snapshots.length - 1]?.props_total || 0}
                    {(() => {
                      const first = snapshots[0]?.props_total || 0
                      const last = snapshots[snapshots.length - 1]?.props_total || 0
                      const change = ((last - first) / first * 100).toFixed(1)
                      return ` (+${change}%)`
                    })()}
                  </span>
                </div>
              )}
            </div>

            {/* TC Histórico */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Evolución TC Paralelo</h3>
              {tcHistorico.length > 0 ? (
                <div className="h-64 flex items-end gap-1">
                  {tcHistorico.slice(-15).map((t, i) => {
                    const minTC = Math.min(...tcHistorico.map(x => x.tc_promedio))
                    const maxTC = Math.max(...tcHistorico.map(x => x.tc_promedio))
                    const range = maxTC - minTC || 1
                    const height = ((t.tc_promedio - minTC) / range) * 80 + 20
                    const fecha = new Date(t.fecha).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center">
                        <div className="w-full flex flex-col justify-end" style={{ height: '200px' }}>
                          <div
                            className="w-full bg-amber-500 rounded-t transition-all hover:bg-amber-600"
                            style={{ height: `${height}%` }}
                            title={`${t.tc_promedio} Bs/$`}
                          />
                        </div>
                        <span className="text-[10px] text-slate-500 mt-1 rotate-45 origin-left">{fecha}</span>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">No hay datos de TC</p>
              )}
              {tcHistorico.length > 0 && (
                <div className="mt-4 flex justify-between text-sm text-slate-600">
                  <span>Min: {Math.min(...tcHistorico.map(t => t.tc_promedio)).toFixed(2)} Bs/$</span>
                  <span className="font-medium text-amber-600">
                    Max: {Math.max(...tcHistorico.map(t => t.tc_promedio)).toFixed(2)} Bs/$
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Oportunidades */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Mejores Oportunidades (Menor $/m²)</h3>
            <div className="grid grid-cols-3 gap-4">
              {topProyectos
                .filter(p => p.precio_m2 > 0)
                .sort((a, b) => a.precio_m2 - b.precio_m2)
                .slice(0, 3)
                .map((p, i) => {
                  const avgPrecioM2 = kpis?.precio_m2_promedio || 2000
                  const diff = ((p.precio_m2 - avgPrecioM2) / avgPrecioM2 * 100).toFixed(0)
                  const medals = ['🥇', '🥈', '🥉']
                  return (
                    <div key={i} className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{medals[i]}</span>
                        <div>
                          <p className="font-semibold text-slate-900">{p.proyecto}</p>
                          <p className="text-xs text-slate-500">{p.desarrollador || 'Desarrollador no especificado'}</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-end mt-3">
                        <div>
                          <p className="text-2xl font-bold text-green-600">${formatNumber(p.precio_m2)}/m²</p>
                          <p className="text-sm text-green-700">{diff}% vs promedio</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-600">Desde {formatCurrency(p.desde)}</p>
                          <p className="text-xs text-slate-500">{p.unidades} unidades</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>

            {/* Alertas de precio alto */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <p className="text-sm font-medium text-slate-700 mb-3">Precios Premium (sobre promedio)</p>
              <div className="flex flex-wrap gap-2">
                {topProyectos
                  .filter(p => p.precio_m2 > (kpis?.precio_m2_promedio || 2000) * 1.1)
                  .slice(0, 5)
                  .map((p, i) => {
                    const avgPrecioM2 = kpis?.precio_m2_promedio || 2000
                    const diff = ((p.precio_m2 - avgPrecioM2) / avgPrecioM2 * 100).toFixed(0)
                    return (
                      <span key={i} className="px-3 py-1 bg-red-50 text-red-700 rounded-full text-sm">
                        {p.proyecto}: ${formatNumber(p.precio_m2)}/m² (+{diff}%)
                      </span>
                    )
                  })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-500">
            <p>Fuente: SICI Real Estate Intelligence • Datos de {kpis?.total_unidades || 0} unidades activas</p>
            <p className="mt-1">Solo se muestran propiedades en venta con área ≥ 20m²</p>
          </div>
        </main>
      </div>
    </>
  )
}
