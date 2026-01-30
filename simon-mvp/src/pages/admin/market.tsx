import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, AreaChart, Area, ScatterChart, Scatter, ZAxis,
  PieChart, Pie, Legend
} from 'recharts'

// ============================================================================
// INTERFACES
// ============================================================================

interface KPIData {
  total_unidades: number
  proyectos_activos: number
  precio_m2_promedio: number
  ticket_promedio: number
  area_promedio: number
  tc_paralelo: number
  tc_oficial: number
}

interface TipologiaData {
  dormitorios: number | null
  cantidad: number
  porcentaje: number
  precio_promedio: number
  area_promedio: number
  precio_m2: number
  precio_min: number
  precio_max: number
}

interface ProyectoData {
  proyecto: string
  desarrollador: string | null
  unidades: number
  desde: number
  hasta: number
  precio_m2: number
}

interface EstadoData {
  estado: string
  cantidad: number
  precio_m2: number
}

interface SnapshotData {
  fecha: string
  props_total: number
  props_completadas: number
  pct_match_completadas: number
}

interface TCHistoricoData {
  fecha: string
  tc_promedio: number
}

interface OportunidadData {
  proyecto: string
  dormitorios: number
  precio_usd: number
  area_m2: number
  precio_m2: number
  diff_porcentaje: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MarketPulseDashboard() {
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Data states
  const [kpis, setKpis] = useState<KPIData | null>(null)
  const [tipologias, setTipologias] = useState<TipologiaData[]>([])
  const [topProyectos, setTopProyectos] = useState<ProyectoData[]>([])
  const [estados, setEstados] = useState<EstadoData[]>([])
  const [snapshots, setSnapshots] = useState<SnapshotData[]>([])
  const [tcHistorico, setTcHistorico] = useState<TCHistoricoData[]>([])
  const [oportunidades, setOportunidades] = useState<OportunidadData[]>([])
  const [premium, setPremium] = useState<OportunidadData[]>([])

  // ============================================================================
  // FETCH FUNCTIONS
  // ============================================================================

  const fetchAllData = async () => {
    if (!supabase) return
    setLoading(true)

    try {
      await Promise.all([
        fetchKPIs(),
        fetchTipologias(),
        fetchTopProyectos(),
        fetchEstados(),
        fetchSnapshots(),
        fetchTCHistorico(),
        fetchOportunidades()
      ])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching market data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchKPIs = async () => {
    if (!supabase) return

    // Fetch properties
    const { data: props } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, id_proyecto_master')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)

    // Fetch TC
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

    if (props) {
      const validProps = props.filter(p => p.precio_usd && p.area_total_m2 && parseFloat(p.precio_usd) > 0)
      const totalUnidades = validProps.length
      const proyectosSet = new Set(validProps.map(p => p.id_proyecto_master).filter(Boolean))

      let sumPrecio = 0
      let sumArea = 0
      let sumPrecioM2 = 0

      validProps.forEach(p => {
        const precio = parseFloat(p.precio_usd) || 0
        const area = parseFloat(p.area_total_m2) || 1
        sumPrecio += precio
        sumArea += area
        sumPrecioM2 += precio / area
      })

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

  const fetchTipologias = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select('dormitorios, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)

    if (data) {
      const validData = data.filter(p => p.precio_usd && parseFloat(p.precio_usd) > 1000)
      const totalCount = validData.length

      const grouped: Record<string, {
        dormitorios: number | null
        precios: number[]
        areas: number[]
        preciosM2: number[]
      }> = {}

      validData.forEach(p => {
        const key = String(p.dormitorios ?? 'null')
        if (!grouped[key]) {
          grouped[key] = { dormitorios: p.dormitorios, precios: [], areas: [], preciosM2: [] }
        }
        const precio = parseFloat(p.precio_usd)
        const area = parseFloat(p.area_total_m2) || 1
        grouped[key].precios.push(precio)
        grouped[key].areas.push(area)
        grouped[key].preciosM2.push(precio / area)
      })

      const result: TipologiaData[] = Object.values(grouped)
        .filter(g => g.precios.length > 0)
        .map(g => ({
          dormitorios: g.dormitorios,
          cantidad: g.precios.length,
          porcentaje: Math.round((g.precios.length / totalCount) * 100),
          precio_promedio: Math.round(g.precios.reduce((a, b) => a + b, 0) / g.precios.length),
          area_promedio: Math.round((g.areas.reduce((a, b) => a + b, 0) / g.areas.length) * 10) / 10,
          precio_m2: Math.round(g.preciosM2.reduce((a, b) => a + b, 0) / g.preciosM2.length),
          precio_min: Math.round(Math.min(...g.precios)),
          precio_max: Math.round(Math.max(...g.precios))
        }))
        .sort((a, b) => b.cantidad - a.cantidad)

      setTipologias(result)
    }
  }

  const fetchTopProyectos = async () => {
    if (!supabase) return

    // Fetch all properties with project IDs
    const { data: props } = await supabase
      .from('propiedades_v2')
      .select('id_proyecto_master, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('id_proyecto_master', 'is', null)

    if (!props || props.length === 0) return

    // Get unique project IDs
    const projectIds = [...new Set(props.map(p => p.id_proyecto_master).filter(Boolean))]

    // Fetch project details
    const { data: projects } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial, desarrollador')
      .in('id_proyecto_master', projectIds)

    if (!projects) return

    // Create project lookup
    const projectMap = new Map(projects.map(p => [p.id_proyecto_master, p]))

    // Group properties by project
    const grouped: Record<string, {
      proyecto: string
      desarrollador: string | null
      precios: number[]
      preciosM2: number[]
    }> = {}

    props.forEach(p => {
      const proj = projectMap.get(p.id_proyecto_master)
      if (!proj) return

      const key = proj.nombre_oficial
      if (!grouped[key]) {
        grouped[key] = {
          proyecto: proj.nombre_oficial,
          desarrollador: proj.desarrollador,
          precios: [],
          preciosM2: []
        }
      }

      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2) || 1
      if (precio > 1000) {
        grouped[key].precios.push(precio)
        grouped[key].preciosM2.push(precio / area)
      }
    })

    const result: ProyectoData[] = Object.values(grouped)
      .filter(g => g.precios.length > 0)
      .map(g => ({
        proyecto: g.proyecto,
        desarrollador: g.desarrollador,
        unidades: g.precios.length,
        desde: Math.round(Math.min(...g.precios)),
        hasta: Math.round(Math.max(...g.precios)),
        precio_m2: Math.round(g.preciosM2.reduce((a, b) => a + b, 0) / g.preciosM2.length)
      }))
      .sort((a, b) => b.unidades - a.unidades)
      .slice(0, 15)

    setTopProyectos(result)
  }

  const fetchEstados = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select('estado_construccion, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('estado_construccion', 'is', null)

    if (data) {
      const grouped: Record<string, { estado: string; preciosM2: number[] }> = {}

      data.forEach(p => {
        const key = p.estado_construccion || 'no_especificado'
        if (!grouped[key]) {
          grouped[key] = { estado: key, preciosM2: [] }
        }
        const precio = parseFloat(p.precio_usd)
        const area = parseFloat(p.area_total_m2) || 1
        if (precio > 1000) {
          grouped[key].preciosM2.push(precio / area)
        }
      })

      const result: EstadoData[] = Object.values(grouped)
        .filter(g => g.preciosM2.length > 0)
        .map(g => ({
          estado: g.estado,
          cantidad: g.preciosM2.length,
          precio_m2: Math.round(g.preciosM2.reduce((a, b) => a + b, 0) / g.preciosM2.length)
        }))
        .sort((a, b) => b.cantidad - a.cantidad)

      setEstados(result)
    }
  }

  const fetchSnapshots = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('auditoria_snapshots')
      .select('fecha, props_total, props_completadas, pct_match_completadas')
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
      .limit(200)

    if (data) {
      const grouped: Record<string, number[]> = {}
      data.forEach(row => {
        const fecha = new Date(row.timestamp).toISOString().split('T')[0]
        if (!grouped[fecha]) grouped[fecha] = []
        if (row.tc_sell) grouped[fecha].push(parseFloat(row.tc_sell))
      })

      const result: TCHistoricoData[] = Object.entries(grouped)
        .map(([fecha, valores]) => ({
          fecha,
          tc_promedio: Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100
        }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha))

      setTcHistorico(result)
    }
  }

  const fetchOportunidades = async () => {
    if (!supabase) return

    // Fetch all valid properties with projects
    const { data: props } = await supabase
      .from('propiedades_v2')
      .select('id_proyecto_master, dormitorios, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('id_proyecto_master', 'is', null)

    if (!props) return

    // Get project names
    const projectIds = [...new Set(props.map(p => p.id_proyecto_master).filter(Boolean))]
    const { data: projects } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial')
      .in('id_proyecto_master', projectIds)

    if (!projects) return

    const projectMap = new Map(projects.map(p => [p.id_proyecto_master, p.nombre_oficial]))

    // Calculate average price/m2
    const validProps = props.filter(p => {
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2)
      return precio > 10000 && area >= 20 // Filter out corrupt data
    })

    const avgPrecioM2 = validProps.reduce((acc, p) => {
      return acc + parseFloat(p.precio_usd) / parseFloat(p.area_total_m2)
    }, 0) / validProps.length

    // Map all properties with price/m2
    const allOportunidades: OportunidadData[] = validProps.map(p => {
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2)
      const precioM2 = precio / area
      return {
        proyecto: projectMap.get(p.id_proyecto_master) || 'Desconocido',
        dormitorios: p.dormitorios || 0,
        precio_usd: precio,
        area_m2: area,
        precio_m2: Math.round(precioM2),
        diff_porcentaje: Math.round(((precioM2 - avgPrecioM2) / avgPrecioM2) * 100)
      }
    })

    // Get best deals (lowest price/m2)
    const sortedByLow = [...allOportunidades].sort((a, b) => a.precio_m2 - b.precio_m2)
    // Group by project and get unique
    const seenProjects = new Set<string>()
    const uniqueOportunidades: OportunidadData[] = []
    for (const op of sortedByLow) {
      if (!seenProjects.has(op.proyecto)) {
        seenProjects.add(op.proyecto)
        uniqueOportunidades.push(op)
      }
      if (uniqueOportunidades.length >= 5) break
    }
    setOportunidades(uniqueOportunidades)

    // Get premium (highest price/m2)
    const sortedByHigh = [...allOportunidades].sort((a, b) => b.precio_m2 - a.precio_m2)
    const seenPremium = new Set<string>()
    const uniquePremium: OportunidadData[] = []
    for (const op of sortedByHigh) {
      if (!seenPremium.has(op.proyecto)) {
        seenPremium.add(op.proyecto)
        uniquePremium.push(op)
      }
      if (uniquePremium.length >= 5) break
    }
    setPremium(uniquePremium)
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // ============================================================================
  // HELPERS
  // ============================================================================

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('es-BO').format(value)
  }

  const getDormLabel = (dorm: number | null) => {
    if (dorm === null) return 'N/A'
    if (dorm === 0) return 'Studio'
    return `${dorm}D`
  }

  const getEstadoLabel = (estado: string) => {
    const labels: Record<string, string> = {
      'preventa': 'Preventa',
      'entrega_inmediata': 'Entrega Inmediata',
      'nuevo_a_estrenar': 'Nuevo',
      'no_especificado': 'No Especificado'
    }
    return labels[estado] || estado
  }

  const getPrecioM2Color = (precioM2: number): string => {
    if (precioM2 < 1800) return '#10b981' // green
    if (precioM2 > 2100) return '#ef4444' // red
    return '#f59e0b' // amber
  }

  const getPrecioM2Badge = (precioM2: number) => {
    if (precioM2 < 1800) return 'bg-green-100 text-green-700'
    if (precioM2 > 2100) return 'bg-red-100 text-red-700'
    return 'bg-amber-100 text-amber-700'
  }

  // Computed insights
  const insights = useMemo(() => {
    if (tipologias.length === 0 || !kpis) return []

    const insights: string[] = []

    // Most common typology
    const mostCommon = tipologias[0]
    if (mostCommon) {
      insights.push(`${getDormLabel(mostCommon.dormitorios)} domina el mercado (${mostCommon.porcentaje}%)`)
    }

    // Best value typology
    const bestValue = [...tipologias].sort((a, b) => a.precio_m2 - b.precio_m2)[0]
    if (bestValue && bestValue.dormitorios !== mostCommon?.dormitorios) {
      insights.push(`${getDormLabel(bestValue.dormitorios)} mejor valor: $${formatNumber(bestValue.precio_m2)}/m²`)
    }

    // Preventa vs Entrega
    const preventa = estados.find(e => e.estado === 'preventa')
    const entrega = estados.find(e => e.estado === 'entrega_inmediata')
    if (preventa && entrega && preventa.precio_m2 < entrega.precio_m2) {
      const ahorro = Math.round(((entrega.precio_m2 - preventa.precio_m2) / entrega.precio_m2) * 100)
      insights.push(`Ahorro preventa: ${ahorro}% vs entrega inmediata`)
    }

    return insights
  }, [tipologias, estados, kpis])

  // Scatter data for chart
  const scatterData = useMemo(() => {
    return topProyectos.slice(0, 10).map(p => ({
      x: p.unidades,
      y: p.precio_m2,
      z: p.desde,
      name: p.proyecto
    }))
  }, [topProyectos])

  // ============================================================================
  // CUSTOM TOOLTIP COMPONENTS
  // ============================================================================

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-sm">
          <p className="font-medium">{label}</p>
          {payload.map((p: any, i: number) => (
            <p key={i} style={{ color: p.color }}>
              {p.name}: {typeof p.value === 'number' ? formatNumber(p.value) : p.value}
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  const ScatterTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="bg-slate-900 text-white px-3 py-2 rounded-lg shadow-xl text-sm">
          <p className="font-bold">{data.name}</p>
          <p>Stock: {data.x} unidades</p>
          <p>$/m²: ${formatNumber(data.y)}</p>
          <p>Desde: {formatCurrency(data.z)}</p>
        </div>
      )
    }
    return null
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <Head>
        <title>Market Pulse | SICI Admin</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200">
        {/* Header */}
        <header className="bg-gradient-to-r from-slate-900 to-slate-800 text-white py-4 px-6 shadow-lg">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Equipetrol Market Pulse</h1>
              <p className="text-slate-400 text-sm" suppressHydrationWarning>
                Última actualización: {lastUpdate.toLocaleTimeString('es-BO')} • Fuente: SICI Real Estate Intelligence
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchAllData}
                disabled={loading}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium shadow-lg transition-all"
              >
                {loading ? 'Cargando...' : '🔄 Actualizar'}
              </button>
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm transition-colors">
                Propiedades
              </Link>
              <Link href="/admin/proyectos" className="text-slate-300 hover:text-white text-sm transition-colors">
                Proyectos
              </Link>
              <Link href="/admin/salud" className="text-teal-400 hover:text-teal-300 text-sm font-medium transition-colors">
                Salud
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-6">
          {/* KPIs Row */}
          {kpis && (
            <div className="grid grid-cols-6 gap-4 mb-8">
              <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Unidades</p>
                <p className="text-4xl font-bold text-slate-900 mt-1">{kpis.total_unidades}</p>
                <p className="text-slate-400 text-sm mt-1">en venta activas</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Proyectos</p>
                <p className="text-4xl font-bold text-slate-900 mt-1">{kpis.proyectos_activos}</p>
                <p className="text-slate-400 text-sm mt-1">con inventario</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">$/m² Promedio</p>
                <p className="text-4xl font-bold text-blue-600 mt-1">${formatNumber(kpis.precio_m2_promedio)}</p>
                <p className="text-slate-400 text-sm mt-1">mercado</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Ticket Promedio</p>
                <p className="text-4xl font-bold text-slate-900 mt-1">{formatCurrency(kpis.ticket_promedio)}</p>
                <p className="text-slate-400 text-sm mt-1">por unidad</p>
              </div>
              <div className="bg-white rounded-xl p-5 shadow-lg border border-slate-200 hover:shadow-xl transition-shadow">
                <p className="text-slate-500 text-xs uppercase tracking-wide font-medium">Área Promedio</p>
                <p className="text-4xl font-bold text-slate-900 mt-1">{kpis.area_promedio}</p>
                <p className="text-slate-400 text-sm mt-1">m² construidos</p>
              </div>
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl p-5 shadow-lg text-white hover:shadow-xl transition-shadow">
                <p className="text-amber-100 text-xs uppercase tracking-wide font-medium">TC Paralelo</p>
                <p className="text-4xl font-bold mt-1">{kpis.tc_paralelo.toFixed(2)}</p>
                <p className="text-amber-200 text-sm mt-1">Bs/$ (Oficial: {kpis.tc_oficial})</p>
              </div>
            </div>
          )}

          {/* Insights Bar */}
          {insights.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-8">
              <div className="flex items-center gap-6">
                <span className="text-blue-600 font-semibold text-sm">💡 Insights:</span>
                {insights.map((insight, i) => (
                  <span key={i} className="text-blue-800 text-sm">
                    • {insight}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Main Grid */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            {/* Tipologías - Full width table */}
            <div className="col-span-2 bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                📊 Análisis por Tipología
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Tipo</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Stock</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">% Mercado</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Precio Prom</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">$/m²</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Área Prom</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Rango</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tipologias.map((t, i) => {
                      const maxCantidad = Math.max(...tipologias.map(x => x.cantidad))
                      const barWidth = (t.cantidad / maxCantidad) * 100
                      const isTopStock = t.cantidad === maxCantidad
                      const isBestValue = t.precio_m2 === Math.min(...tipologias.map(x => x.precio_m2))

                      return (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-2">
                            <span className="font-bold text-slate-900 flex items-center gap-1">
                              {getDormLabel(t.dormitorios)}
                              {isTopStock && <span title="Más stock">⭐</span>}
                              {isBestValue && <span title="Mejor $/m²">💎</span>}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">
                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">
                              {t.cantidad}
                            </span>
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all bg-gradient-to-r from-blue-500 to-blue-600"
                                  style={{ width: `${barWidth}%` }}
                                />
                              </div>
                              <span className="text-xs text-slate-500 w-8">{t.porcentaje}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right font-medium text-slate-700">
                            {formatCurrency(t.precio_promedio)}
                          </td>
                          <td className="py-3 px-2 text-right">
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getPrecioM2Badge(t.precio_m2)}`}>
                              ${formatNumber(t.precio_m2)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right text-slate-600">
                            {t.area_promedio} m²
                          </td>
                          <td className="py-3 px-2 text-right text-slate-500 text-xs">
                            {formatCurrency(t.precio_min)} - {formatCurrency(t.precio_max)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">⭐ Más stock</span>
                <span className="flex items-center gap-1">💎 Mejor $/m²</span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-green-500 rounded"></span> &lt;$1,800/m²
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-amber-500 rounded"></span> $1,800-2,100
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 bg-red-500 rounded"></span> &gt;$2,100/m²
                </span>
              </div>
            </div>

            {/* Preventa vs Entrega */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">🏗️ Preventa vs Entrega</h3>
              {estados.length > 0 && (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={estados.slice(0, 4)} layout="vertical">
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="estado"
                      tickFormatter={getEstadoLabel}
                      width={100}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="precio_m2" name="$/m²" radius={[0, 4, 4, 0]}>
                      {estados.slice(0, 4).map((entry, index) => (
                        <Cell key={index} fill={getPrecioM2Color(entry.precio_m2)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {(() => {
                const preventa = estados.find(e => e.estado === 'preventa')
                const entrega = estados.find(e => e.estado === 'entrega_inmediata')
                if (preventa && entrega && preventa.precio_m2 < entrega.precio_m2) {
                  const ahorro = ((entrega.precio_m2 - preventa.precio_m2) / entrega.precio_m2) * 100
                  const ahorroM2 = entrega.precio_m2 - preventa.precio_m2
                  return (
                    <div className="mt-4 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                      <p className="text-green-800 font-bold text-lg">
                        💰 Ahorro Preventa: {ahorro.toFixed(1)}%
                      </p>
                      <p className="text-green-700 text-sm mt-1">
                        ${formatNumber(ahorroM2)}/m² menos • En 80m² = ${formatNumber(ahorroM2 * 80)} de ahorro
                      </p>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          </div>

          {/* Second Row: Top Projects & Scatter */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Top Proyectos */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">🏆 Top 10 Proyectos por Inventario</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {topProyectos.slice(0, 10).map((p, i) => {
                  const medals = ['🥇', '🥈', '🥉']
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{medals[i] || `${i + 1}.`}</span>
                        <div>
                          <p className="font-semibold text-slate-900">{p.proyecto}</p>
                          <p className="text-xs text-slate-500">{p.desarrollador || 'Sin desarrollador'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">
                          {p.unidades} uds
                        </span>
                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-700">{formatCurrency(p.desde)}+</p>
                          <p className={`text-xs font-bold ${p.precio_m2 < 1800 ? 'text-green-600' : p.precio_m2 > 2100 ? 'text-red-600' : 'text-amber-600'}`}>
                            ${formatNumber(p.precio_m2)}/m²
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Scatter Chart: Stock vs Price */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">📈 Posicionamiento: Stock vs Precio</h3>
              <ResponsiveContainer width="100%" height={350}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <XAxis
                    type="number"
                    dataKey="x"
                    name="Stock"
                    label={{ value: 'Unidades en stock →', position: 'bottom', fontSize: 11 }}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="number"
                    dataKey="y"
                    name="$/m²"
                    label={{ value: '$/m² →', angle: -90, position: 'left', fontSize: 11 }}
                    tick={{ fontSize: 10 }}
                    domain={['dataMin - 200', 'dataMax + 200']}
                  />
                  <ZAxis type="number" dataKey="z" range={[100, 500]} />
                  <Tooltip content={<ScatterTooltip />} />
                  <Scatter name="Proyectos" data={scatterData}>
                    {scatterData.map((entry, index) => (
                      <Cell key={index} fill={getPrecioM2Color(entry.y)} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
              <div className="mt-2 text-xs text-slate-500 text-center">
                Tamaño del punto = precio de entrada • Color = posición $/m²
              </div>
            </div>
          </div>

          {/* Oportunidades Row */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Best Deals */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 shadow-lg border border-green-200">
              <h3 className="text-lg font-bold text-green-800 mb-4">🟢 Mejores Oportunidades (Menor $/m²)</h3>
              <div className="space-y-3">
                {oportunidades.map((o, i) => {
                  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                  return (
                    <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{medals[i]}</span>
                        <div>
                          <p className="font-semibold text-slate-900">{o.proyecto}</p>
                          <p className="text-xs text-slate-500">{o.dormitorios}D • {o.area_m2.toFixed(0)}m²</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-600">${formatNumber(o.precio_m2)}/m²</p>
                        <p className="text-xs text-green-700">{o.diff_porcentaje}% vs prom</p>
                      </div>
                    </div>
                  )
                })}
              </div>
              {oportunidades[0] && kpis && (
                <div className="mt-4 p-3 bg-green-100 rounded-lg">
                  <p className="text-green-800 text-sm">
                    💡 En 80m² de <strong>{oportunidades[0].proyecto}</strong> ahorras{' '}
                    <strong>${formatNumber((kpis.precio_m2_promedio - oportunidades[0].precio_m2) * 80)}</strong>{' '}
                    vs promedio de mercado
                  </p>
                </div>
              )}
            </div>

            {/* Premium */}
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-6 shadow-lg border border-red-200">
              <h3 className="text-lg font-bold text-red-800 mb-4">🔴 Precios Premium (Mayor $/m²)</h3>
              <div className="space-y-3">
                {premium.map((o, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg shadow-sm">
                    <div className="flex items-center gap-3">
                      <span className="text-xl">⚠️</span>
                      <div>
                        <p className="font-semibold text-slate-900">{o.proyecto}</p>
                        <p className="text-xs text-slate-500">{o.dormitorios}D • {o.area_m2.toFixed(0)}m²</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-red-600">${formatNumber(o.precio_m2)}/m²</p>
                      <p className="text-xs text-red-700">+{o.diff_porcentaje}% vs prom</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 p-3 bg-red-100 rounded-lg">
                <p className="text-red-800 text-sm">
                  ⚠️ Precios premium pueden justificarse por ubicación, amenities o calidad de acabados
                </p>
              </div>
            </div>
          </div>

          {/* Historical Charts */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Inventory Evolution */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">📈 Evolución del Inventario (28 días)</h3>
              {snapshots.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={snapshots.slice(-15)}>
                      <defs>
                        <linearGradient id="colorInventario" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="fecha"
                        tickFormatter={(v) => new Date(v).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis tick={{ fontSize: 10 }} domain={['dataMin - 10', 'dataMax + 10']} />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="props_total"
                        name="Propiedades"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#colorInventario)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex justify-between text-sm text-slate-600">
                    <span>Inicio: {snapshots[0]?.props_total || 0}</span>
                    <span className="font-medium text-blue-600">
                      Actual: {snapshots[snapshots.length - 1]?.props_total || 0}
                      {(() => {
                        const first = snapshots[0]?.props_total || 1
                        const last = snapshots[snapshots.length - 1]?.props_total || 0
                        const change = ((last - first) / first * 100).toFixed(1)
                        return ` (${parseFloat(change) >= 0 ? '+' : ''}${change}%)`
                      })()}
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-center py-12">No hay datos históricos</p>
              )}
            </div>

            {/* TC Evolution */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">💱 Evolución TC Paralelo</h3>
              {tcHistorico.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={tcHistorico.slice(-15)}>
                      <defs>
                        <linearGradient id="colorTC" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="fecha"
                        tickFormatter={(v) => new Date(v).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        domain={[
                          (dataMin: number) => Math.floor(dataMin * 10) / 10,
                          (dataMax: number) => Math.ceil(dataMax * 10) / 10
                        ]}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Area
                        type="monotone"
                        dataKey="tc_promedio"
                        name="TC"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        fill="url(#colorTC)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                  <div className="mt-4 flex justify-between text-sm text-slate-600">
                    <span>Min: {Math.min(...tcHistorico.map(t => t.tc_promedio)).toFixed(2)} Bs/$</span>
                    <span className="font-medium text-amber-600">
                      Max: {Math.max(...tcHistorico.map(t => t.tc_promedio)).toFixed(2)} Bs/$
                    </span>
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-center py-12">No hay datos de TC</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-500 bg-white rounded-xl p-4 shadow-sm">
            <p>
              <strong>Fuente:</strong> SICI Real Estate Intelligence •{' '}
              <strong>{kpis?.total_unidades || 0}</strong> unidades activas •{' '}
              <strong>{kpis?.proyectos_activos || 0}</strong> proyectos
            </p>
            <p className="mt-1 text-xs">
              Solo propiedades en venta con área ≥ 20m² • Datos actualizados en tiempo real
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
