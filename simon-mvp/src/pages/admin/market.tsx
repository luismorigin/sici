import { useState, useEffect, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
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
  desarrollador: string | null
  dormitorios: number
  precio_usd: number
  area_m2: number
  precio_m2: number
  estado: string
  amenidades: number
  diff_porcentaje: number
}

interface AmenidadData {
  nombre: string
  cantidad: number
  porcentaje: number
}

interface ProyectoAmenidadesData {
  proyecto: string
  desarrollador: string | null
  amenidades: number
  precio_m2: number
}

interface ZonaKPI {
  zona: string
  unidades: number
  pm2_avg: number
  ticket_avg: number
  area_avg: number
}

interface ZonaTipologia {
  zona: string
  dormitorios: number
  unidades: number
  pm2_avg: number
  pm2_min: number
  pm2_max: number
}

interface DataQuality {
  total: number
  con_zona: number
  con_proyecto: number
  con_precio: number
  con_fotos: number
}

interface OutlierData {
  id: number
  proyecto: string
  zona: string
  dormitorios: number
  precio_m2: number
  avg_zona: number
  z_score: number
  tipo: 'caro' | 'barato'
}

interface EdificioDispersion {
  proyecto: string
  pm2_min: number
  pm2_max: number
  rango: number
  unidades: number
}

interface AntiguedadBucket {
  label: string
  cantidad: number
  porcentaje: number
  color: string
}

interface ZonaEstado {
  zona: string
  estado: string
  cantidad: number
  pm2: number
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function MarketPulseDashboard() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor', 'viewer'])
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
  const [rankingAmenidades, setRankingAmenidades] = useState<AmenidadData[]>([])
  const [topProyectosAmenidades, setTopProyectosAmenidades] = useState<ProyectoAmenidadesData[]>([])
  const [zonaKpis, setZonaKpis] = useState<ZonaKPI[]>([])
  const [zonaTipologias, setZonaTipologias] = useState<ZonaTipologia[]>([])
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null)
  const [outliers, setOutliers] = useState<OutlierData[]>([])
  const [edificioDispersion, setEdificioDispersion] = useState<EdificioDispersion[]>([])
  const [antiguedad, setAntiguedad] = useState<AntiguedadBucket[]>([])
  const [zonaEstados, setZonaEstados] = useState<ZonaEstado[]>([])

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
        fetchOportunidades(),
        fetchRankingAmenidades(),
        fetchZonaAnalysis(),
        fetchDataQuality(),
        fetchAntiguedad()
      ])
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching market data:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fecha límite: solo propiedades de los últimos 300 días
  const cutoffDate = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString()

  const fetchKPIs = async () => {
    if (!supabase) return

    // Fetch properties
    const { data: props } = await supabase
      .from('propiedades_v2')
      .select('precio_usd, area_total_m2, id_proyecto_master')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

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
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

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
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

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
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

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

    // Fetch all valid properties with projects, estado and amenidades
    const { data: props } = await supabase
      .from('propiedades_v2')
      .select('id_proyecto_master, dormitorios, precio_usd, area_total_m2, estado_construccion, datos_json')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .not('id_proyecto_master', 'is', null)
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

    if (!props) return

    // Get project names and developers
    const projectIds = [...new Set(props.map(p => p.id_proyecto_master).filter(Boolean))]
    const { data: projects } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial, desarrollador')
      .in('id_proyecto_master', projectIds)

    if (!projects) return

    const projectMap = new Map(projects.map(p => [p.id_proyecto_master, { nombre: p.nombre_oficial, desarrollador: p.desarrollador }]))

    // Calculate average price/m2 for reference
    const validProps = props.filter(p => {
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2)
      return precio > 10000 && area >= 20
    })

    const avgPrecioM2 = validProps.reduce((acc, p) => {
      return acc + parseFloat(p.precio_usd) / parseFloat(p.area_total_m2)
    }, 0) / validProps.length

    // Helper to count amenidades
    const contarAmenidades = (datosJson: any): number => {
      try {
        const lista = datosJson?.amenities?.lista
        if (Array.isArray(lista)) return lista.length
        return 0
      } catch {
        return 0
      }
    }

    // Helper to check if precio_sospechoso
    const esPrecioSospechoso = (datosJson: any): boolean => {
      try {
        return datosJson?.calidad?.precio_sospechoso === true
      } catch {
        return false
      }
    }

    // Filter for REAL opportunities based on system criteria:
    // - $/m² between $800-$1,500 (not too low = data error, not too high = not opportunity)
    // - Estado: entrega_inmediata or preventa (known delivery status)
    // - Amenidades ≥ 5 (real value)
    // - NOT precio_sospechoso (exclude data errors)
    const oportunidadesReales = props.filter(p => {
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2)
      if (!precio || !area) return false

      const precioM2 = precio / area
      const amenidades = contarAmenidades(p.datos_json)
      const estadosValidos = ['entrega_inmediata', 'preventa', 'nuevo_a_estrenar']

      return (
        precioM2 >= 800 &&
        precioM2 <= 1500 &&
        estadosValidos.includes(p.estado_construccion || '') &&
        amenidades >= 5 &&
        !esPrecioSospechoso(p.datos_json)
      )
    })

    // Map to OportunidadData
    const mappedOportunidades: OportunidadData[] = oportunidadesReales.map(p => {
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2)
      const precioM2 = precio / area
      const projData = projectMap.get(p.id_proyecto_master)

      return {
        proyecto: projData?.nombre || 'Desconocido',
        desarrollador: projData?.desarrollador || null,
        dormitorios: p.dormitorios || 0,
        precio_usd: precio,
        area_m2: area,
        precio_m2: Math.round(precioM2),
        estado: p.estado_construccion || 'no_especificado',
        amenidades: contarAmenidades(p.datos_json),
        diff_porcentaje: Math.round(((precioM2 - avgPrecioM2) / avgPrecioM2) * 100)
      }
    })

    // Sort by lowest price/m2 and get unique projects
    const sortedByLow = [...mappedOportunidades].sort((a, b) => a.precio_m2 - b.precio_m2)
    const seenProjects = new Set<string>()
    const uniqueOportunidades: OportunidadData[] = []

    for (const op of sortedByLow) {
      if (!seenProjects.has(op.proyecto)) {
        seenProjects.add(op.proyecto)
        uniqueOportunidades.push(op)
      }
      if (uniqueOportunidades.length >= 8) break
    }

    setOportunidades(uniqueOportunidades)
  }

  const fetchRankingAmenidades = async () => {
    if (!supabase) return

    // Fetch properties with amenidades
    const { data: props } = await supabase
      .from('propiedades_v2')
      .select('id_proyecto_master, datos_json, precio_usd, area_total_m2')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

    if (!props) return

    const totalProps = props.length

    // Count amenidades frequency
    const amenidadCount: Record<string, number> = {}

    props.forEach(p => {
      try {
        const lista = p.datos_json?.amenities?.lista
        if (Array.isArray(lista)) {
          lista.forEach((amenidad: string) => {
            amenidadCount[amenidad] = (amenidadCount[amenidad] || 0) + 1
          })
        }
      } catch {
        // Skip invalid data
      }
    })

    // Convert to sorted array
    const ranking: AmenidadData[] = Object.entries(amenidadCount)
      .map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        porcentaje: Math.round((cantidad / totalProps) * 100)
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10)

    setRankingAmenidades(ranking)

    // Get projects with most amenidades
    const projectIds = [...new Set(props.map(p => p.id_proyecto_master).filter(Boolean))]
    const { data: projects } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial, desarrollador')
      .in('id_proyecto_master', projectIds)

    if (!projects) return

    const projectMap = new Map(projects.map(p => [p.id_proyecto_master, { nombre: p.nombre_oficial, desarrollador: p.desarrollador }]))

    // Group by project and calculate avg amenidades
    const projectAmenidades: Record<number, { amenidades: number[], preciosM2: number[] }> = {}

    props.forEach(p => {
      if (!p.id_proyecto_master) return

      if (!projectAmenidades[p.id_proyecto_master]) {
        projectAmenidades[p.id_proyecto_master] = { amenidades: [], preciosM2: [] }
      }

      try {
        const lista = p.datos_json?.amenities?.lista
        if (Array.isArray(lista)) {
          projectAmenidades[p.id_proyecto_master].amenidades.push(lista.length)
        }

        const precio = parseFloat(p.precio_usd)
        const area = parseFloat(p.area_total_m2)
        if (precio && area) {
          projectAmenidades[p.id_proyecto_master].preciosM2.push(precio / area)
        }
      } catch {
        // Skip
      }
    })

    // Calculate averages and sort
    const topProyectos: ProyectoAmenidadesData[] = Object.entries(projectAmenidades)
      .filter(([_, data]) => data.amenidades.length > 0)
      .map(([projectId, data]) => {
        const projData = projectMap.get(parseInt(projectId))
        const avgAmenidades = data.amenidades.reduce((a, b) => a + b, 0) / data.amenidades.length
        const avgPrecioM2 = data.preciosM2.length > 0
          ? data.preciosM2.reduce((a, b) => a + b, 0) / data.preciosM2.length
          : 0

        return {
          proyecto: projData?.nombre || 'Desconocido',
          desarrollador: projData?.desarrollador || null,
          amenidades: Math.round(avgAmenidades * 10) / 10,
          precio_m2: Math.round(avgPrecioM2)
        }
      })
      .sort((a, b) => b.amenidades - a.amenidades)
      .slice(0, 5)

    setTopProyectosAmenidades(topProyectos)
  }

  const fetchZonaAnalysis = async () => {
    if (!supabase) return

    // One big query for zona analysis, outliers, dispersion, and zona×estado
    // Usa microzona (fuente de verdad por GPS, alineada con filtros)
    const { data } = await supabase
      .from('propiedades_v2')
      .select('id, microzona, dormitorios, precio_usd, area_total_m2, estado_construccion, id_proyecto_master')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .is('duplicado_de', null)
      .not('microzona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')
      .gte('fecha_publicacion', cutoffDate)

    if (!data) return

    const validData = data.filter(p => p.precio_usd && parseFloat(p.precio_usd) > 1000)

    // Helper: mapear microzona BD → zona canónica display (combina Norte/Norte + Norte/Sur)
    const toZona = (mz: string): string => MICROZONA_DISPLAY[mz] || mz

    // --- 1. Zona KPIs ---
    const zonaGroups: Record<string, { precios: number[]; areas: number[]; preciosM2: number[] }> = {}
    validData.forEach(p => {
      const z = toZona(p.microzona || 'Sin zona')
      if (!zonaGroups[z]) zonaGroups[z] = { precios: [], areas: [], preciosM2: [] }
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2) || 1
      zonaGroups[z].precios.push(precio)
      zonaGroups[z].areas.push(area)
      zonaGroups[z].preciosM2.push(precio / area)
    })

    const zonaKpiResult: ZonaKPI[] = Object.entries(zonaGroups)
      .map(([zona, g]) => ({
        zona,
        unidades: g.precios.length,
        pm2_avg: Math.round(g.preciosM2.reduce((a, b) => a + b, 0) / g.preciosM2.length),
        ticket_avg: Math.round(g.precios.reduce((a, b) => a + b, 0) / g.precios.length),
        area_avg: Math.round((g.areas.reduce((a, b) => a + b, 0) / g.areas.length) * 10) / 10
      }))
      .sort((a, b) => b.unidades - a.unidades)

    setZonaKpis(zonaKpiResult)

    // --- 2. Zona × Tipología heatmap ---
    const ztGroups: Record<string, { preciosM2: number[] }> = {}
    validData.forEach(p => {
      if (p.dormitorios === null || p.dormitorios === undefined) return
      const key = `${toZona(p.microzona)}|${p.dormitorios}`
      if (!ztGroups[key]) ztGroups[key] = { preciosM2: [] }
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2) || 1
      ztGroups[key].preciosM2.push(precio / area)
    })

    const ztResult: ZonaTipologia[] = Object.entries(ztGroups)
      .filter(([_, g]) => g.preciosM2.length >= 2)
      .map(([key, g]) => {
        const [zona, dorms] = key.split('|')
        return {
          zona,
          dormitorios: parseInt(dorms),
          unidades: g.preciosM2.length,
          pm2_avg: Math.round(g.preciosM2.reduce((a, b) => a + b, 0) / g.preciosM2.length),
          pm2_min: Math.round(Math.min(...g.preciosM2)),
          pm2_max: Math.round(Math.max(...g.preciosM2))
        }
      })
      .sort((a, b) => a.zona.localeCompare(b.zona) || a.dormitorios - b.dormitorios)

    setZonaTipologias(ztResult)

    // --- 3. Outliers (z-score > 1.8 por zona+dorms) ---
    // Get project names
    const projectIds = [...new Set(validData.map(p => p.id_proyecto_master).filter(Boolean))]
    let projectMap = new Map<number, string>()
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('proyectos_master')
        .select('id_proyecto_master, nombre_oficial')
        .in('id_proyecto_master', projectIds)
      if (projects) {
        projectMap = new Map(projects.map(p => [p.id_proyecto_master, p.nombre_oficial]))
      }
    }

    const statsGroups: Record<string, { preciosM2: number[]; items: typeof validData }> = {}
    validData.forEach(p => {
      if (p.dormitorios === null || p.dormitorios === undefined) return
      const key = `${toZona(p.microzona)}|${p.dormitorios}`
      if (!statsGroups[key]) statsGroups[key] = { preciosM2: [], items: [] }
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2) || 1
      statsGroups[key].preciosM2.push(precio / area)
      statsGroups[key].items.push(p)
    })

    const outlierResults: OutlierData[] = []
    Object.entries(statsGroups).forEach(([key, group]) => {
      if (group.preciosM2.length < 3) return
      const avg = group.preciosM2.reduce((a, b) => a + b, 0) / group.preciosM2.length
      const variance = group.preciosM2.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / group.preciosM2.length
      const stddev = Math.sqrt(variance)
      if (stddev === 0) return

      group.items.forEach((item, i) => {
        const pm2 = group.preciosM2[i]
        const z = (pm2 - avg) / stddev
        if (Math.abs(z) > 1.8) {
          outlierResults.push({
            id: item.id,
            proyecto: projectMap.get(item.id_proyecto_master) || 'Desconocido',
            zona: toZona(item.microzona),
            dormitorios: item.dormitorios,
            precio_m2: Math.round(pm2),
            avg_zona: Math.round(avg),
            z_score: Math.round(z * 100) / 100,
            tipo: z > 0 ? 'caro' : 'barato'
          })
        }
      })
    })

    setOutliers(outlierResults.sort((a, b) => Math.abs(b.z_score) - Math.abs(a.z_score)).slice(0, 15))

    // --- 4. Dispersión de precios por edificio ---
    const edificioGroups: Record<string, { preciosM2: number[] }> = {}
    validData.forEach(p => {
      const projName = projectMap.get(p.id_proyecto_master)
      if (!projName) return
      if (!edificioGroups[projName]) edificioGroups[projName] = { preciosM2: [] }
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2) || 1
      edificioGroups[projName].preciosM2.push(precio / area)
    })

    const dispersionResult: EdificioDispersion[] = Object.entries(edificioGroups)
      .filter(([_, g]) => g.preciosM2.length >= 3)
      .map(([proyecto, g]) => ({
        proyecto,
        pm2_min: Math.round(Math.min(...g.preciosM2)),
        pm2_max: Math.round(Math.max(...g.preciosM2)),
        rango: Math.round(Math.max(...g.preciosM2) - Math.min(...g.preciosM2)),
        unidades: g.preciosM2.length
      }))
      .sort((a, b) => b.rango - a.rango)
      .slice(0, 10)

    setEdificioDispersion(dispersionResult)

    // --- 5. Preventa vs Entrega por Zona ---
    const zeGroups: Record<string, { preciosM2: number[] }> = {}
    validData.forEach(p => {
      if (!p.estado_construccion) return
      const key = `${toZona(p.microzona)}|${p.estado_construccion}`
      if (!zeGroups[key]) zeGroups[key] = { preciosM2: [] }
      const precio = parseFloat(p.precio_usd)
      const area = parseFloat(p.area_total_m2) || 1
      zeGroups[key].preciosM2.push(precio / area)
    })

    const zeResult: ZonaEstado[] = Object.entries(zeGroups)
      .filter(([_, g]) => g.preciosM2.length >= 2)
      .map(([key, g]) => {
        const [zona, estado] = key.split('|')
        return {
          zona,
          estado,
          cantidad: g.preciosM2.length,
          pm2: Math.round(g.preciosM2.reduce((a, b) => a + b, 0) / g.preciosM2.length)
        }
      })
      .sort((a, b) => a.zona.localeCompare(b.zona))

    setZonaEstados(zeResult)
  }

  const fetchDataQuality = async () => {
    if (!supabase) return

    // Query WITHOUT zona filter to measure data quality
    const { data } = await supabase
      .from('propiedades_v2')
      .select('zona, id_proyecto_master, precio_usd, datos_json')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .is('duplicado_de', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')

    if (!data) return

    const total = data.length
    const con_zona = data.filter(p => p.zona).length
    const con_proyecto = data.filter(p => p.id_proyecto_master).length
    const con_precio = data.filter(p => p.precio_usd && parseFloat(p.precio_usd) > 1000).length
    const con_fotos = data.filter(p => {
      try {
        const fotos = p.datos_json?.contenido?.fotos_urls
        return Array.isArray(fotos) && fotos.length > 0
      } catch { return false }
    }).length

    setDataQuality({ total, con_zona, con_proyecto, con_precio, con_fotos })
  }

  const fetchAntiguedad = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('propiedades_v2')
      .select('fecha_publicacion')
      .eq('status', 'completado')
      .eq('tipo_operacion', 'venta')
      .gte('area_total_m2', 20)
      .is('duplicado_de', null)
      .not('zona', 'is', null)
      .not('tipo_propiedad_original', 'in', '("parqueo","baulera")')

    if (!data) return

    const now = new Date()
    const buckets = [
      { label: '<30 días', min: 0, max: 30, cantidad: 0, color: '#10b981' },
      { label: '30-90 días', min: 30, max: 90, cantidad: 0, color: '#3b82f6' },
      { label: '90-180 días', min: 90, max: 180, cantidad: 0, color: '#f59e0b' },
      { label: '180-300 días', min: 180, max: 300, cantidad: 0, color: '#ef4444' },
      { label: 'Sin fecha', min: -1, max: -1, cantidad: 0, color: '#94a3b8' }
    ]

    data.forEach(p => {
      if (!p.fecha_publicacion) {
        buckets[4].cantidad++
        return
      }
      const days = Math.floor((now.getTime() - new Date(p.fecha_publicacion).getTime()) / (1000 * 60 * 60 * 24))
      if (days < 30) buckets[0].cantidad++
      else if (days < 90) buckets[1].cantidad++
      else if (days < 180) buckets[2].cantidad++
      else buckets[3].cantidad++
    })

    const total = data.length
    setAntiguedad(buckets.filter(b => b.cantidad > 0).map(b => ({
      label: b.label,
      cantidad: b.cantidad,
      porcentaje: Math.round((b.cantidad / total) * 100),
      color: b.color
    })))
  }

  useEffect(() => {
    fetchAllData()
  }, [])

  // ============================================================================
  // HELPERS
  // ============================================================================

  // Mapeo canónico: microzona BD → display (alineado con FilterBarPremium)
  const MICROZONA_DISPLAY: Record<string, string> = {
    'Equipetrol': 'Eq. Centro',
    'Sirari': 'Sirari',
    'Faremafu': 'Eq. Oeste',
    'Equipetrol Norte/Norte': 'Eq. Norte',
    'Equipetrol Norte/Sur': 'Eq. Norte',
    'Villa Brigida': 'Villa Brigida'
  }

  const getZonaLabel = (zona: string): string => {
    return MICROZONA_DISPLAY[zona] || zona
  }

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

  // Early returns AFTER all hooks
  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

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

          {/* Análisis por Zona */}
          {zonaKpis.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">📍 Análisis por Zona</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-slate-200">
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Zona</th>
                      <th className="text-center py-3 px-2 font-semibold text-slate-600">Unidades</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">$/m² Avg</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Ticket Avg</th>
                      <th className="text-right py-3 px-2 font-semibold text-slate-600">Área Avg</th>
                      <th className="text-left py-3 px-2 font-semibold text-slate-600">Participación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zonaKpis.map((z, i) => {
                      const totalUnidades = zonaKpis.reduce((a, b) => a + b.unidades, 0)
                      const pct = Math.round((z.unidades / totalUnidades) * 100)
                      return (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                          <td className="py-3 px-2 font-bold text-slate-900">{getZonaLabel(z.zona)}</td>
                          <td className="py-3 px-2 text-center">
                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-bold">{z.unidades}</span>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getPrecioM2Badge(z.pm2_avg)}`}>
                              ${formatNumber(z.pm2_avg)}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-medium text-slate-700">{formatCurrency(z.ticket_avg)}</td>
                          <td className="py-3 px-2 text-right text-slate-600">{z.area_avg} m²</td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 w-8">{pct}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
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

            {/* Preventa vs Entrega por Zona */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">🏗️ Preventa vs Entrega por Zona</h3>
              {zonaEstados.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-slate-200">
                        <th className="text-left py-2 px-2 font-semibold text-slate-600">Zona</th>
                        <th className="text-left py-2 px-2 font-semibold text-slate-600">Estado</th>
                        <th className="text-center py-2 px-2 font-semibold text-slate-600">Uds</th>
                        <th className="text-right py-2 px-2 font-semibold text-slate-600">$/m²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {zonaEstados.map((ze, i) => (
                        <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2 px-2 font-medium text-slate-900 text-xs">{getZonaLabel(ze.zona)}</td>
                          <td className="py-2 px-2 text-xs">{getEstadoLabel(ze.estado)}</td>
                          <td className="py-2 px-2 text-center text-xs">{ze.cantidad}</td>
                          <td className="py-2 px-2 text-right">
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${getPrecioM2Badge(ze.pm2)}`}>
                              ${formatNumber(ze.pm2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8 text-sm">Cargando...</p>
              )}
              {(() => {
                const preventa = estados.find(e => e.estado === 'preventa')
                const entrega = estados.find(e => e.estado === 'entrega_inmediata')
                if (preventa && entrega && preventa.precio_m2 < entrega.precio_m2) {
                  const ahorro = ((entrega.precio_m2 - preventa.precio_m2) / entrega.precio_m2) * 100
                  const ahorroM2 = entrega.precio_m2 - preventa.precio_m2
                  return (
                    <div className="mt-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                      <p className="text-green-800 font-bold text-sm">
                        💰 Ahorro Preventa: {ahorro.toFixed(1)}%
                      </p>
                      <p className="text-green-700 text-xs mt-1">
                        ${formatNumber(ahorroM2)}/m² menos • 80m² = ${formatNumber(ahorroM2 * 80)} ahorro
                      </p>
                    </div>
                  )
                }
                return null
              })()}
            </div>
          </div>

          {/* Heat Map Zona × Tipología */}
          {zonaTipologias.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">🗺️ Mapa de Calor: Zona × Tipología ($/m²)</h3>
              <div className="overflow-x-auto">
                {(() => {
                  const zonas = [...new Set(zonaTipologias.map(zt => zt.zona))].sort()
                  const dorms = [...new Set(zonaTipologias.map(zt => zt.dormitorios))].sort((a, b) => a - b)
                  const lookup = new Map(zonaTipologias.map(zt => [`${zt.zona}|${zt.dormitorios}`, zt]))

                  return (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-slate-200">
                          <th className="text-left py-3 px-2 font-semibold text-slate-600">Zona</th>
                          {dorms.map(d => (
                            <th key={d} className="text-center py-3 px-2 font-semibold text-slate-600">{getDormLabel(d)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {zonas.map(zona => (
                          <tr key={zona} className="border-b border-slate-100">
                            <td className="py-3 px-2 font-bold text-slate-900 text-xs">{getZonaLabel(zona)}</td>
                            {dorms.map(d => {
                              const cell = lookup.get(`${zona}|${d}`)
                              if (!cell) return <td key={d} className="py-3 px-2 text-center text-slate-300">-</td>
                              const bg = cell.pm2_avg < 1800 ? 'bg-green-100 text-green-800'
                                : cell.pm2_avg > 2100 ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                              return (
                                <td key={d} className="py-3 px-2 text-center">
                                  <div className={`inline-block px-2 py-1 rounded-lg ${bg}`}>
                                    <span className="font-bold text-xs">${formatNumber(cell.pm2_avg)}</span>
                                    <span className="block text-[10px] opacity-70">{cell.unidades} uds</span>
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-200 rounded"></span> &lt;$1,800/m²</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-200 rounded"></span> $1,800-2,100</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-200 rounded"></span> &gt;$2,100/m²</span>
                <span className="text-slate-400 ml-2">Mínimo 2 unidades por celda</span>
              </div>
            </div>
          )}

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

            {/* Dispersión de Precios por Edificio */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">📊 Dispersión $/m² por Edificio</h3>
              {edificioDispersion.length > 0 ? (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {edificioDispersion.map((e, i) => {
                    const maxRange = edificioDispersion[0]?.rango || 1
                    const globalMin = Math.min(...edificioDispersion.map(d => d.pm2_min))
                    const globalMax = Math.max(...edificioDispersion.map(d => d.pm2_max))
                    const range = globalMax - globalMin || 1
                    const leftPct = ((e.pm2_min - globalMin) / range) * 100
                    const widthPct = Math.max(((e.pm2_max - e.pm2_min) / range) * 100, 2)
                    const barColor = e.rango > 500 ? '#ef4444' : e.rango > 300 ? '#f59e0b' : '#10b981'

                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-28 text-xs font-medium text-slate-700 truncate" title={e.proyecto}>{e.proyecto}</div>
                        <div className="flex-1 h-6 bg-slate-100 rounded relative">
                          <div
                            className="absolute h-full rounded opacity-80"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%`, backgroundColor: barColor }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-700">
                            ${formatNumber(e.pm2_min)} - ${formatNumber(e.pm2_max)}
                          </div>
                        </div>
                        <div className="text-right w-16">
                          <span className="text-xs text-slate-500">{e.unidades} uds</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8 text-sm">Cargando...</p>
              )}
              <div className="mt-3 flex gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded"></span> Rango &lt;$300</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-500 rounded"></span> $300-500</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded"></span> &gt;$500</span>
              </div>
            </div>
          </div>

          {/* Scatter Chart: Stock vs Price */}
          <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-8">
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

          {/* Oportunidades Reales */}
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 shadow-lg border border-green-200 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-green-800">🎯 Oportunidades Reales de Inversión</h3>
              <div className="flex gap-2 text-xs">
                <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">$800-1,500/m²</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full">≥5 amenidades</span>
                <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full">Entrega conocida</span>
              </div>
            </div>

            {oportunidades.length > 0 ? (
              <div className="grid grid-cols-4 gap-4">
                {oportunidades.map((o, i) => {
                  const medals = ['🥇', '🥈', '🥉']
                  const estadoLabels: Record<string, string> = {
                    'entrega_inmediata': '🏠 Entrega Ya',
                    'preventa': '📋 Preventa',
                    'nuevo_a_estrenar': '✨ Nuevo'
                  }
                  return (
                    <div key={i} className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{medals[i] || `${i + 1}.`}</span>
                        <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded">
                          {estadoLabels[o.estado] || o.estado}
                        </span>
                      </div>
                      <p className="font-bold text-slate-900 text-sm line-clamp-1">{o.proyecto}</p>
                      <p className="text-xs text-slate-500 mb-2">{o.desarrollador || 'Sin desarrollador'}</p>
                      <div className="flex justify-between items-end">
                        <div>
                          <p className="text-2xl font-bold text-green-600">${formatNumber(o.precio_m2)}</p>
                          <p className="text-xs text-slate-500">/m²</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-slate-600">{o.dormitorios}D • {Math.round(o.area_m2)}m²</p>
                          <p className="text-xs text-slate-500">{o.amenidades} amenidades</p>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-t border-slate-100">
                        <p className="text-xs text-green-700 font-medium">
                          {o.diff_porcentaje}% vs promedio • Ahorro: ${formatNumber(Math.abs(o.diff_porcentaje) * o.area_m2 * 0.01 * (kpis?.precio_m2_promedio || 2000))}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <p>No hay oportunidades que cumplan todos los criterios</p>
                <p className="text-xs mt-1">Criterios: $/m² $800-1,500 • ≥5 amenidades • Estado conocido • Sin precio sospechoso</p>
              </div>
            )}

            {oportunidades.length > 0 && kpis && (
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <p className="text-green-800 text-sm">
                  💡 <strong>Criterios de filtro:</strong> $/m² entre $800-$1,500 (excluye errores de datos) •
                  Estado de entrega conocido • Mínimo 5 amenidades • Sin alertas de precio sospechoso
                </p>
              </div>
            )}
          </div>

          {/* Detector de Outliers */}
          {outliers.length > 0 && (
            <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-xl p-6 shadow-lg border border-orange-200 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-orange-800">⚠️ Detector de Outliers en Vivo</h3>
                <span className="text-xs text-orange-600 bg-orange-100 px-2 py-1 rounded-full">Z-score &gt; 1.8</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-orange-200">
                      <th className="text-left py-2 px-2 font-semibold text-orange-700">ID</th>
                      <th className="text-left py-2 px-2 font-semibold text-orange-700">Proyecto</th>
                      <th className="text-left py-2 px-2 font-semibold text-orange-700">Zona</th>
                      <th className="text-center py-2 px-2 font-semibold text-orange-700">Dorms</th>
                      <th className="text-right py-2 px-2 font-semibold text-orange-700">$/m²</th>
                      <th className="text-right py-2 px-2 font-semibold text-orange-700">Avg Zona</th>
                      <th className="text-center py-2 px-2 font-semibold text-orange-700">Z-Score</th>
                      <th className="text-center py-2 px-2 font-semibold text-orange-700">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outliers.map((o, i) => (
                      <tr key={i} className="border-b border-orange-100 hover:bg-orange-50">
                        <td className="py-2 px-2 text-xs font-mono text-slate-600">{o.id}</td>
                        <td className="py-2 px-2 text-xs font-medium text-slate-900 max-w-[120px] truncate">{o.proyecto}</td>
                        <td className="py-2 px-2 text-xs text-slate-600">{getZonaLabel(o.zona)}</td>
                        <td className="py-2 px-2 text-center text-xs">{o.dormitorios}D</td>
                        <td className="py-2 px-2 text-right text-xs font-bold">${formatNumber(o.precio_m2)}</td>
                        <td className="py-2 px-2 text-right text-xs text-slate-500">${formatNumber(o.avg_zona)}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${Math.abs(o.z_score) > 2.5 ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                            {o.z_score > 0 ? '+' : ''}{o.z_score}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${o.tipo === 'caro' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            {o.tipo === 'caro' ? '🔴 CARO' : '🔵 BARATO'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 p-3 bg-orange-100 rounded-lg">
                <p className="text-orange-800 text-xs">
                  💡 Outliers calculados por zona + dormitorios. Z-score mide desviaciones estándar respecto al promedio del grupo.
                  Revisar en <strong>/admin/propiedades</strong> para corregir datos erróneos.
                </p>
              </div>
            </div>
          )}

          {/* Ranking de Amenidades */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            {/* Top Amenidades del Mercado */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">🏊 Ranking de Amenidades del Mercado</h3>
              {rankingAmenidades.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {rankingAmenidades.map((a, i) => {
                      const maxCantidad = rankingAmenidades[0]?.cantidad || 1
                      const barWidth = (a.cantidad / maxCantidad) * 100
                      const iconos: Record<string, string> = {
                        'Piscina': '🏊',
                        'Seguridad 24/7': '🔒',
                        'Churrasquera': '🍖',
                        'Terraza/Balcón': '🌅',
                        'Sauna/Jacuzzi': '🧖',
                        'Gimnasio': '🏋️',
                        'Ascensor': '🛗',
                        'Área Social': '👥',
                        'Pet Friendly': '🐕',
                        'Recepción': '🛎️',
                        'Salón de Eventos': '🎉',
                        'Cowork': '💻',
                        'Co-working': '💻',
                        'Sala TV/Cine': '🎬',
                        'Estacionamiento para Visitas': '🅿️'
                      }
                      return (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-lg w-6">{iconos[a.nombre] || '✨'}</span>
                          <div className="flex-1">
                            <div className="flex justify-between text-sm mb-1">
                              <span className="text-slate-700">{a.nombre}</span>
                              <span className="text-slate-500 font-medium">{a.porcentaje}%</span>
                            </div>
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all"
                                style={{ width: `${barWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="mt-4 p-3 bg-slate-50 rounded-lg">
                    <p className="text-slate-600 text-xs">
                      📊 Porcentaje = % de propiedades que incluyen esta amenidad
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-slate-500 text-center py-8">Cargando amenidades...</p>
              )}
            </div>

            {/* Top Proyectos con Más Amenidades */}
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 mb-4">⭐ Proyectos con Más Amenidades</h3>
              {topProyectosAmenidades.length > 0 ? (
                <div className="space-y-3">
                  {topProyectosAmenidades.map((p, i) => {
                    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
                    return (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-xl">{medals[i]}</span>
                          <div>
                            <p className="font-semibold text-slate-900">{p.proyecto}</p>
                            <p className="text-xs text-slate-500">{p.desarrollador || 'Sin desarrollador'}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-indigo-600">{p.amenidades}</p>
                          <p className="text-xs text-slate-500">amenidades</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-center py-8">Cargando proyectos...</p>
              )}
              <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                <p className="text-indigo-800 text-xs">
                  💡 Más amenidades = mayor valor percibido y diferenciación competitiva
                </p>
              </div>
            </div>
          </div>

          {/* Antigüedad del Inventario */}
          {antiguedad.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">📅 Antigüedad del Inventario</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={antiguedad}
                        dataKey="cantidad"
                        nameKey="label"
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={90}
                        strokeWidth={2}
                      >
                        {antiguedad.map((entry, index) => (
                          <Cell key={index} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend formatter={(value) => <span className="text-xs text-slate-600">{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-col justify-center space-y-3">
                  {antiguedad.map((b, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: b.color }} />
                      <div className="flex-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-700 font-medium">{b.label}</span>
                          <span className="text-slate-900 font-bold">{b.cantidad}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div className="h-full rounded-full" style={{ width: `${b.porcentaje}%`, backgroundColor: b.color }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 w-8">{b.porcentaje}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

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

          {/* Calidad de Datos */}
          {dataQuality && (
            <div className="bg-white rounded-xl p-6 shadow-lg border border-slate-200 mb-8">
              <h3 className="text-lg font-bold text-slate-900 mb-4">🔍 Indicador de Calidad de Datos</h3>
              <p className="text-slate-500 text-xs mb-4">Base: {dataQuality.total} propiedades completadas (venta, área ≥20m², sin duplicados, sin parqueos/bauleras)</p>
              <div className="grid grid-cols-4 gap-6">
                {[
                  { label: 'Con Zona', value: dataQuality.con_zona, color: '#10b981' },
                  { label: 'Con Proyecto', value: dataQuality.con_proyecto, color: '#3b82f6' },
                  { label: 'Con Precio Válido', value: dataQuality.con_precio, color: '#8b5cf6' },
                  { label: 'Con Fotos', value: dataQuality.con_fotos, color: '#f59e0b' }
                ].map((item, i) => {
                  const pct = Math.round((item.value / dataQuality.total) * 100)
                  const missing = dataQuality.total - item.value
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 font-medium">{item.label}</span>
                        <span className="font-bold" style={{ color: item.color }}>{pct}%</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: item.color }} />
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{item.value}/{dataQuality.total} • {missing > 0 ? `${missing} sin dato` : 'Completo'}</p>
                    </div>
                  )
                })}
              </div>
              {(() => {
                const avgQuality = Math.round(((dataQuality.con_zona + dataQuality.con_proyecto + dataQuality.con_precio + dataQuality.con_fotos) / (dataQuality.total * 4)) * 100)
                const bg = avgQuality >= 90 ? 'bg-green-50 border-green-200 text-green-800' : avgQuality >= 75 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-red-50 border-red-200 text-red-800'
                return (
                  <div className={`mt-4 p-3 border rounded-lg ${bg}`}>
                    <p className="text-sm font-bold">Score General: {avgQuality}%</p>
                    <p className="text-xs mt-1">Promedio de los 4 indicadores de completitud</p>
                  </div>
                )
              })()}
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center text-sm text-slate-500 bg-white rounded-xl p-4 shadow-sm">
            <p>
              <strong>Fuente:</strong> SICI Real Estate Intelligence •{' '}
              <strong>{kpis?.total_unidades || 0}</strong> unidades activas •{' '}
              <strong>{kpis?.proyectos_activos || 0}</strong> proyectos
            </p>
            <p className="mt-1 text-xs">
              Solo venta • Área ≥ 20m² • Con zona • Sin duplicados • Sin parqueos/bauleras
            </p>
          </div>
        </main>
      </div>
    </>
  )
}
