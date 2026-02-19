import { useState, useEffect, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface StatsProps {
  // Venta
  completadas_venta: number
  nuevas_venta: number
  ultimas_24h_venta: number
  matcheadas_venta: number
  sin_match_venta: number
  inactivo_venta: number
  score_alto: number
  score_medio: number
  score_bajo: number
  // Alquiler
  completadas_alquiler: number
  nuevas_alquiler: number
  ultimas_24h_alquiler: number
  matcheadas_alquiler: number
  sin_match_alquiler: number
  inactivo_alquiler: number
  alq_con_precio: number
  alq_con_agente: number
  alq_con_zona: number
  alq_con_dormitorios: number
  // Globales
  sin_zona: number
  sin_dormitorios: number
}

interface MatchingStats {
  sugerencias_24h_venta: number
  aprobadas_24h_venta: number
  rechazadas_24h_venta: number
  pendientes_venta: number
  sugerencias_24h_alquiler: number
  aprobadas_24h_alquiler: number
  rechazadas_24h_alquiler: number
  pendientes_alquiler: number
}

interface ProyectosStats {
  activos: number
  gps_verificado: number
  sin_desarrollador: number
}

interface ColasHITL {
  cola_matching_venta: number
  cola_matching_alquiler: number
  cola_sin_match_venta: number
  cola_sin_match_alquiler: number
  cola_excluidas: number
  cola_auto_aprobados: number
}

interface TCStats {
  tc_paralelo: string
  tc_oficial: string
  ultima_actualizacion: string | null
}

interface WorkflowHealth {
  workflow_name: string
  ultimo_run: string
  horas_desde_run: number
  ultimo_status: string
}

export default function DashboardSalud() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor', 'viewer'])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Stats
  const [propStats, setPropStats] = useState<StatsProps | null>(null)
  const [matchStats, setMatchStats] = useState<MatchingStats | null>(null)
  const [proyStats, setProyStats] = useState<ProyectosStats | null>(null)
  const [colas, setColas] = useState<ColasHITL | null>(null)
  const [tcStats, setTCStats] = useState<TCStats | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowHealth[]>([])

  const fetchInitiated = useRef(false)

  useEffect(() => {
    if (authLoading || !admin) return
    if (fetchInitiated.current) return
    fetchInitiated.current = true

    fetchAllStats()

    const interval = setInterval(() => {
      fetchAllStats()
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [authLoading, admin])

  // Calcular alertas (useMemo ANTES de early returns — regla de hooks)
  const alertas = useMemo(() => {
    const nuevasAlertas: string[] = []

    if (colas) {
      const totalMatching = colas.cola_matching_venta + colas.cola_matching_alquiler
      if (totalMatching > 10) {
        nuevasAlertas.push(`${totalMatching} matches pendientes de revisión`)
      }
      const totalSinMatch = colas.cola_sin_match_venta + colas.cola_sin_match_alquiler
      if (totalSinMatch > 20) {
        nuevasAlertas.push(`${totalSinMatch} propiedades sin proyecto`)
      }
      if (colas.cola_excluidas > 30) {
        nuevasAlertas.push(`${colas.cola_excluidas} excluidas por revisar`)
      }
    }

    if (propStats) {
      // Matching venta
      const pctMatchVenta = propStats.completadas_venta > 0 ? (propStats.matcheadas_venta / propStats.completadas_venta) * 100 : 0
      if (pctMatchVenta < 85) {
        nuevasAlertas.push(`Matching venta bajo: ${pctMatchVenta.toFixed(1)}%`)
      }
      // Matching alquiler
      const pctMatchAlq = propStats.completadas_alquiler > 0 ? (propStats.matcheadas_alquiler / propStats.completadas_alquiler) * 100 : 0
      if (pctMatchAlq < 75) {
        nuevasAlertas.push(`Matching alquiler bajo: ${pctMatchAlq.toFixed(1)}%`)
      }
      // Score calidad venta
      const pctBajo = propStats.completadas_venta > 0 ? (propStats.score_bajo / propStats.completadas_venta) * 100 : 0
      if (pctBajo > 10) {
        nuevasAlertas.push(`${pctBajo.toFixed(1)}% ventas con calidad baja`)
      }
      // Alquileres sin precio
      const sinPrecio = propStats.completadas_alquiler - propStats.alq_con_precio
      if (sinPrecio > 10) {
        nuevasAlertas.push(`${sinPrecio} alquileres sin precio`)
      }
    }

    const workflowsRequeridos = ['discovery', 'enrichment', 'merge']
    for (const wf of workflowsRequeridos) {
      const found = workflows.find(w => w.workflow_name === wf)
      if (found && found.horas_desde_run > 26) {
        nuevasAlertas.push(`${wf} no corrió en ${found.horas_desde_run.toFixed(0)}h`)
      }
    }

    return nuevasAlertas
  }, [colas, propStats, workflows])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  async function fetchAllStats() {
    if (!supabase) return
    setLoading(true)

    try {
      // Fetch all stats in parallel
      await Promise.all([
        fetchPropiedadesStats(),
        fetchMatchingStats(),
        fetchProyectosStats(),
        fetchColasHITL(),
        fetchTCStats(),
        fetchWorkflowHealth()
      ])

      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchPropiedadesStats() {
    if (!supabase) return

    const esVenta = "COALESCE(tipo_operacion, 'venta') != 'alquiler'"
    const esAlquiler = "tipo_operacion = 'alquiler'"
    const { data, error } = await supabase.rpc('pg_execute_query' as any, {
      query: `
        SELECT
          -- Venta
          COUNT(*) FILTER (WHERE status = 'completado' AND ${esVenta})::int as completadas_venta,
          COUNT(*) FILTER (WHERE status = 'nueva' AND ${esVenta})::int as nuevas_venta,
          COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours' AND ${esVenta})::int as ultimas_24h_venta,
          COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL AND status = 'completado' AND ${esVenta})::int as matcheadas_venta,
          COUNT(*) FILTER (WHERE id_proyecto_master IS NULL AND status = 'completado' AND ${esVenta})::int as sin_match_venta,
          COUNT(*) FILTER (WHERE status IN ('inactivo_pending','inactivo_confirmed') AND ${esVenta})::int as inactivo_venta,
          COUNT(*) FILTER (WHERE score_calidad_dato >= 95 AND status = 'completado' AND ${esVenta})::int as score_alto,
          COUNT(*) FILTER (WHERE score_calidad_dato >= 85 AND score_calidad_dato < 95 AND status = 'completado' AND ${esVenta})::int as score_medio,
          COUNT(*) FILTER (WHERE score_calidad_dato < 85 AND status = 'completado' AND ${esVenta})::int as score_bajo,
          -- Alquiler
          COUNT(*) FILTER (WHERE status = 'completado' AND ${esAlquiler})::int as completadas_alquiler,
          COUNT(*) FILTER (WHERE status = 'nueva' AND ${esAlquiler})::int as nuevas_alquiler,
          COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours' AND ${esAlquiler})::int as ultimas_24h_alquiler,
          COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL AND status = 'completado' AND ${esAlquiler})::int as matcheadas_alquiler,
          COUNT(*) FILTER (WHERE id_proyecto_master IS NULL AND status = 'completado' AND ${esAlquiler})::int as sin_match_alquiler,
          COUNT(*) FILTER (WHERE status IN ('inactivo_pending','inactivo_confirmed') AND ${esAlquiler})::int as inactivo_alquiler,
          COUNT(*) FILTER (WHERE status = 'completado' AND ${esAlquiler} AND precio_mensual_bob IS NOT NULL AND precio_mensual_bob > 0)::int as alq_con_precio,
          COUNT(*) FILTER (WHERE status = 'completado' AND ${esAlquiler} AND datos_json->>'agente_nombre' IS NOT NULL)::int as alq_con_agente,
          COUNT(*) FILTER (WHERE status = 'completado' AND ${esAlquiler} AND zona IS NOT NULL AND zona != '')::int as alq_con_zona,
          COUNT(*) FILTER (WHERE status = 'completado' AND ${esAlquiler} AND dormitorios IS NOT NULL)::int as alq_con_dormitorios,
          -- Globales
          COUNT(*) FILTER (WHERE (zona IS NULL OR zona = '') AND status = 'completado')::int as sin_zona,
          COUNT(*) FILTER (WHERE dormitorios IS NULL AND status = 'completado')::int as sin_dormitorios
        FROM propiedades_v2
      `
    })

    // Fallback: direct query
    if (error || !data) {
      const { data: props } = await supabase
        .from('propiedades_v2')
        .select('status, id_proyecto_master, score_calidad_dato, zona, dormitorios, fecha_creacion, tipo_operacion, precio_mensual_bob, datos_json')

      if (props) {
        const completadas = props.filter((p: any) => p.status === 'completado')
        const venta = completadas.filter((p: any) => (p.tipo_operacion || 'venta') !== 'alquiler')
        const alquiler = completadas.filter((p: any) => p.tipo_operacion === 'alquiler')
        const inactivos = props.filter((p: any) => p.status === 'inactivo_pending' || p.status === 'inactivo_confirmed')
        const nuevas = props.filter((p: any) => p.status === 'nueva')
        const recientes = props.filter((p: any) => {
          const created = new Date(p.fecha_creacion)
          return created > new Date(Date.now() - 24 * 60 * 60 * 1000)
        })

        setPropStats({
          completadas_venta: venta.length,
          nuevas_venta: nuevas.filter((p: any) => (p.tipo_operacion || 'venta') !== 'alquiler').length,
          ultimas_24h_venta: recientes.filter((p: any) => (p.tipo_operacion || 'venta') !== 'alquiler').length,
          matcheadas_venta: venta.filter((p: any) => p.id_proyecto_master).length,
          sin_match_venta: venta.filter((p: any) => !p.id_proyecto_master).length,
          inactivo_venta: inactivos.filter((p: any) => (p.tipo_operacion || 'venta') !== 'alquiler').length,
          score_alto: venta.filter((p: any) => (p.score_calidad_dato || 0) >= 95).length,
          score_medio: venta.filter((p: any) => (p.score_calidad_dato || 0) >= 85 && (p.score_calidad_dato || 0) < 95).length,
          score_bajo: venta.filter((p: any) => (p.score_calidad_dato || 0) < 85).length,
          completadas_alquiler: alquiler.length,
          nuevas_alquiler: nuevas.filter((p: any) => p.tipo_operacion === 'alquiler').length,
          ultimas_24h_alquiler: recientes.filter((p: any) => p.tipo_operacion === 'alquiler').length,
          matcheadas_alquiler: alquiler.filter((p: any) => p.id_proyecto_master).length,
          sin_match_alquiler: alquiler.filter((p: any) => !p.id_proyecto_master).length,
          inactivo_alquiler: inactivos.filter((p: any) => p.tipo_operacion === 'alquiler').length,
          alq_con_precio: alquiler.filter((p: any) => p.precio_mensual_bob && p.precio_mensual_bob > 0).length,
          alq_con_agente: alquiler.filter((p: any) => p.datos_json?.agente_nombre).length,
          alq_con_zona: alquiler.filter((p: any) => p.zona).length,
          alq_con_dormitorios: alquiler.filter((p: any) => p.dormitorios !== null).length,
          sin_zona: completadas.filter((p: any) => !p.zona).length,
          sin_dormitorios: completadas.filter((p: any) => p.dormitorios === null).length
        })
      }
    } else if (data?.[0]) {
      setPropStats(data[0])
    }
  }

  async function fetchMatchingStats() {
    if (!supabase) return

    const { data } = await supabase
      .from('matching_sugerencias')
      .select('estado, created_at, fecha_revision, propiedad_id, propiedades_v2!inner(tipo_operacion)')

    if (data) {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const getTipo = (d: any) => {
        const t = d.propiedades_v2?.tipo_operacion
        return t === 'alquiler' ? 'alquiler' : 'venta'
      }

      const calc = (tipo: string) => {
        const filtered = data.filter(d => getTipo(d) === tipo)
        return {
          sugerencias: filtered.filter(d => new Date(d.created_at) > yesterday).length,
          aprobadas: filtered.filter(d => d.estado === 'aprobado' && d.fecha_revision && new Date(d.fecha_revision) > yesterday).length,
          rechazadas: filtered.filter(d => d.estado === 'rechazado' && d.fecha_revision && new Date(d.fecha_revision) > yesterday).length,
          pendientes: filtered.filter(d => d.estado === 'pendiente').length
        }
      }
      const v = calc('venta')
      const a = calc('alquiler')

      setMatchStats({
        sugerencias_24h_venta: v.sugerencias,
        aprobadas_24h_venta: v.aprobadas,
        rechazadas_24h_venta: v.rechazadas,
        pendientes_venta: v.pendientes,
        sugerencias_24h_alquiler: a.sugerencias,
        aprobadas_24h_alquiler: a.aprobadas,
        rechazadas_24h_alquiler: a.rechazadas,
        pendientes_alquiler: a.pendientes,
      })
    }
  }

  async function fetchProyectosStats() {
    if (!supabase) return

    const { data } = await supabase
      .from('proyectos_master')
      .select('activo, gps_verificado_google, desarrollador')

    if (data) {
      const activos = data.filter(p => p.activo)
      setProyStats({
        activos: activos.length,
        gps_verificado: activos.filter(p => p.gps_verificado_google).length,
        sin_desarrollador: activos.filter(p => !p.desarrollador || p.desarrollador.trim() === '').length
      })
    }
  }

  async function fetchColasHITL() {
    if (!supabase) return

    // Cola matching pendientes con tipo
    const { data: matching } = await supabase
      .from('matching_sugerencias')
      .select('id, propiedades_v2!inner(tipo_operacion)')
      .eq('estado', 'pendiente')

    // Cola sin match con tipo (query directa en vez de RPC para tener tipo_operacion)
    const { data: sinMatch } = await supabase
      .from('propiedades_v2')
      .select('id, tipo_operacion')
      .eq('status', 'completado')
      .is('id_proyecto_master', null)

    // Cola excluidas - usar RPC (global)
    const { data: excluidas } = await supabase.rpc('exportar_propiedades_excluidas')

    // Cola auto-aprobados sin validar (global)
    const { data: autoAprobados } = await supabase.rpc('contar_auto_aprobados_sin_validar')

    const matchVenta = matching?.filter((m: any) => (m.propiedades_v2?.tipo_operacion || 'venta') !== 'alquiler').length || 0
    const matchAlq = matching?.filter((m: any) => m.propiedades_v2?.tipo_operacion === 'alquiler').length || 0
    const smVenta = sinMatch?.filter((p: any) => (p.tipo_operacion || 'venta') !== 'alquiler').length || 0
    const smAlq = sinMatch?.filter((p: any) => p.tipo_operacion === 'alquiler').length || 0

    setColas({
      cola_matching_venta: matchVenta,
      cola_matching_alquiler: matchAlq,
      cola_sin_match_venta: smVenta,
      cola_sin_match_alquiler: smAlq,
      cola_excluidas: excluidas?.length || 0,
      cola_auto_aprobados: autoAprobados || 0
    })
  }

  async function fetchTCStats() {
    if (!supabase) return

    // TC Paralelo (lowercase, actualizado por Binance)
    const { data: paralelo } = await supabase
      .from('config_global')
      .select('valor, fecha_actualizacion')
      .eq('clave', 'tipo_cambio_paralelo')
      .single()

    // TC Oficial (lowercase)
    const { data: oficial } = await supabase
      .from('config_global')
      .select('valor')
      .eq('clave', 'tipo_cambio_oficial')
      .single()

    if (paralelo || oficial) {
      setTCStats({
        tc_paralelo: paralelo?.valor || '-',
        tc_oficial: oficial?.valor || '-',
        ultima_actualizacion: paralelo?.fecha_actualizacion || null
      })
    }
  }

  async function fetchWorkflowHealth() {
    if (!supabase) return

    // Workflows recurrentes que queremos monitorear
    const workflowsRecurrentes = [
      'discovery', 'discovery_remax', 'discovery_century21',
      'enrichment', 'merge', 'matching_nocturno',
      'tc_dinamico_binance', 'auditoria_diaria'
    ]

    const { data } = await supabase
      .from('workflow_executions')
      .select('workflow_name, finished_at, status')
      .order('finished_at', { ascending: false })
      .limit(200) // Solo los últimos 200 para mejor rendimiento

    if (data) {
      // Agrupar por workflow, quedarse con el más reciente
      // Filtrar solo workflows recurrentes (no migraciones)
      const workflowMap = new Map<string, WorkflowHealth>()
      const now = new Date()

      // Workflows deprecados (reemplazados por admin dashboard)
      const workflowsDeprecados = [
        'matching_supervisor', 'supervisor_sin_match', 'exportar_sin_match'
      ]

      for (const row of data) {
        // Excluir migraciones, scripts one-time, y workflows deprecados
        const nombreLower = row.workflow_name.toLowerCase()
        if (nombreLower.includes('migracion') || nombreLower.includes('migration') ||
            nombreLower.includes('fix_') || nombreLower.includes('script_') ||
            workflowsDeprecados.includes(row.workflow_name)) {
          continue
        }

        if (!workflowMap.has(row.workflow_name)) {
          const finishedAt = new Date(row.finished_at)
          const horasDiff = (now.getTime() - finishedAt.getTime()) / (1000 * 60 * 60)

          workflowMap.set(row.workflow_name, {
            workflow_name: row.workflow_name,
            ultimo_run: row.finished_at,
            horas_desde_run: Math.round(horasDiff * 10) / 10,
            ultimo_status: row.status
          })
        }
      }

      // Ordenar por horario programado
      const ordenWorkflows: Record<string, number> = {
        'discovery_remax': 1,
        'discovery_century21': 2,
        'enrichment': 3,
        'merge': 4,
        'matching_nocturno': 5,
        'auditoria_diaria': 6,
        'tc_dinamico_binance': 7
      }

      const workflowsSorted = Array.from(workflowMap.values()).sort((a, b) => {
        const ordenA = ordenWorkflows[a.workflow_name] ?? 99
        const ordenB = ordenWorkflows[b.workflow_name] ?? 99
        return ordenA - ordenB
      })

      setWorkflows(workflowsSorted)
    }
  }

  const formatHace = (isoDate: string) => {
    if (!isoDate) return '-'
    const diff = Date.now() - new Date(isoDate).getTime()
    const horas = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (horas > 24) return `${Math.floor(horas / 24)}d`
    if (horas > 0) return `${horas}h`
    return `${mins}min`
  }

  const getWorkflowIcon = (wf: WorkflowHealth) => {
    if (wf.horas_desde_run > 26) return '🔴'
    if (wf.horas_desde_run > 12) return '🟡'
    return '✅'
  }

  // Horarios programados de cada workflow (hora Bolivia)
  const workflowSchedule: Record<string, string> = {
    'discovery_remax': '02:00 AM',
    'discovery_century21': '02:30 AM',
    'enrichment': '03:00 AM',
    'merge': '03:30 AM',
    'matching_nocturno': '04:00 AM',
    'auditoria_diaria': '08:00 AM',
    'tc_dinamico_binance': 'cada 1h'
  }

  const getSchedule = (workflowName: string): string => {
    return workflowSchedule[workflowName] || '-'
  }

  return (
    <>
      <Head>
        <title>Salud del Sistema | SICI Admin</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Salud del Sistema SICI</h1>
              <p className="text-slate-400 text-sm" suppressHydrationWarning>
                Última actualización: {lastUpdate.toLocaleTimeString('es-BO')}
                <span className="text-slate-500 ml-2">(auto-refresh cada 5 min)</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={fetchAllStats}
                disabled={loading}
                className="bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {loading ? 'Cargando...' : 'Actualizar'}
              </button>
              <Link href="/admin/propiedades" className="text-slate-300 hover:text-white text-sm">
                Propiedades
              </Link>
              <Link href="/admin/supervisor" className="text-slate-300 hover:text-white text-sm">
                Supervisor
              </Link>
              <Link href="/admin/market" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
                Market Pulse
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 px-6">
          {/* Alertas */}
          {alertas.length > 0 && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-red-800 font-semibold mb-2">Alertas</h3>
              <ul className="space-y-1">
                {alertas.map((alerta, idx) => (
                  <li key={idx} className="text-red-700 text-sm flex items-center gap-2">
                    <span>🚨</span> {alerta}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Grid de Stats */}
          <div className="grid grid-cols-3 gap-6">
            {/* Inventario */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>📊</span> Inventario
              </h2>
              {propStats && (
                <div className="text-sm">
                  {/* Header columnas */}
                  <div className="grid grid-cols-3 gap-2 mb-2 pb-2 border-b">
                    <span className="text-slate-400 text-xs"></span>
                    <span className="text-xs font-semibold text-slate-500 text-right">Venta</span>
                    <span className="text-xs font-semibold text-blue-500 text-right">Alquiler</span>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Activas</span>
                      <span className="font-semibold text-right">{propStats.completadas_venta}</span>
                      <span className="font-semibold text-right">{propStats.completadas_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Matcheadas</span>
                      <span className="font-semibold text-green-600 text-right">
                        {propStats.matcheadas_venta} <span className="text-xs text-slate-400">({propStats.completadas_venta > 0 ? ((propStats.matcheadas_venta / propStats.completadas_venta) * 100).toFixed(0) : 0}%)</span>
                      </span>
                      <span className="font-semibold text-green-600 text-right">
                        {propStats.matcheadas_alquiler} <span className="text-xs text-slate-400">({propStats.completadas_alquiler > 0 ? ((propStats.matcheadas_alquiler / propStats.completadas_alquiler) * 100).toFixed(0) : 0}%)</span>
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Sin match</span>
                      <span className="font-semibold text-orange-600 text-right">{propStats.sin_match_venta}</span>
                      <span className="font-semibold text-orange-600 text-right">{propStats.sin_match_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Nuevas</span>
                      <span className="font-semibold text-blue-600 text-right">{propStats.nuevas_venta}</span>
                      <span className="font-semibold text-blue-600 text-right">{propStats.nuevas_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Últimas 24h</span>
                      <span className="font-semibold text-purple-600 text-right">+{propStats.ultimas_24h_venta}</span>
                      <span className="font-semibold text-purple-600 text-right">+{propStats.ultimas_24h_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Inactivas</span>
                      <span className="text-slate-500 text-right">{propStats.inactivo_venta}</span>
                      <span className="text-slate-500 text-right">{propStats.inactivo_alquiler}</span>
                    </div>
                  </div>
                  {/* Totales */}
                  <div className="mt-3 pt-2 border-t">
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600 font-semibold">Total activas</span>
                      <span className="font-bold text-right col-span-2">{propStats.completadas_venta + propStats.completadas_alquiler}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Calidad */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>📈</span> Calidad de Datos
              </h2>
              {propStats && (
                <div className="text-sm">
                  {/* Venta - Score */}
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Venta — Score calidad</p>
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Alto (≥95)</span>
                      <span className="font-semibold text-green-600">
                        {propStats.score_alto} ({propStats.completadas_venta > 0 ? ((propStats.score_alto / propStats.completadas_venta) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Medio (85-94)</span>
                      <span className="font-semibold text-amber-600">
                        {propStats.score_medio} ({propStats.completadas_venta > 0 ? ((propStats.score_medio / propStats.completadas_venta) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Bajo (&lt;85)</span>
                      <span className="font-semibold text-red-600">
                        {propStats.score_bajo} ({propStats.completadas_venta > 0 ? ((propStats.score_bajo / propStats.completadas_venta) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                  </div>
                  {/* Alquiler - Cobertura */}
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-2 pt-3 border-t">Alquiler — Cobertura datos</p>
                  <div className="space-y-1.5 mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Con precio</span>
                      <span className={`font-semibold ${propStats.alq_con_precio < propStats.completadas_alquiler * 0.9 ? 'text-amber-600' : 'text-green-600'}`}>
                        {propStats.alq_con_precio} ({propStats.completadas_alquiler > 0 ? ((propStats.alq_con_precio / propStats.completadas_alquiler) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Con agente</span>
                      <span className={`font-semibold ${propStats.alq_con_agente < propStats.completadas_alquiler * 0.8 ? 'text-amber-600' : 'text-green-600'}`}>
                        {propStats.alq_con_agente} ({propStats.completadas_alquiler > 0 ? ((propStats.alq_con_agente / propStats.completadas_alquiler) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Con zona</span>
                      <span className={`font-semibold ${propStats.alq_con_zona < propStats.completadas_alquiler * 0.9 ? 'text-amber-600' : 'text-green-600'}`}>
                        {propStats.alq_con_zona} ({propStats.completadas_alquiler > 0 ? ((propStats.alq_con_zona / propStats.completadas_alquiler) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Con dormitorios</span>
                      <span className={`font-semibold ${propStats.alq_con_dormitorios < propStats.completadas_alquiler * 0.9 ? 'text-amber-600' : 'text-green-600'}`}>
                        {propStats.alq_con_dormitorios} ({propStats.completadas_alquiler > 0 ? ((propStats.alq_con_dormitorios / propStats.completadas_alquiler) * 100).toFixed(0) : 0}%)
                      </span>
                    </div>
                  </div>
                  {/* Globales */}
                  <div className="pt-3 border-t space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sin zona (total)</span>
                      <span className="text-orange-600">{propStats.sin_zona}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sin dormitorios (total)</span>
                      <span className="text-orange-600">{propStats.sin_dormitorios}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Matching */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>🔗</span> Matching (24h)
              </h2>
              {matchStats && (
                <div className="text-sm">
                  <div className="grid grid-cols-3 gap-2 mb-2 pb-2 border-b">
                    <span className="text-slate-400 text-xs"></span>
                    <span className="text-xs font-semibold text-slate-500 text-right">Venta</span>
                    <span className="text-xs font-semibold text-blue-500 text-right">Alquiler</span>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Sugerencias</span>
                      <span className="font-semibold text-right">{matchStats.sugerencias_24h_venta}</span>
                      <span className="font-semibold text-right">{matchStats.sugerencias_24h_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Aprobadas</span>
                      <span className="font-semibold text-green-600 text-right">{matchStats.aprobadas_24h_venta}</span>
                      <span className="font-semibold text-green-600 text-right">{matchStats.aprobadas_24h_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <span className="text-slate-600">Rechazadas</span>
                      <span className="font-semibold text-red-600 text-right">{matchStats.rechazadas_24h_venta}</span>
                      <span className="font-semibold text-red-600 text-right">{matchStats.rechazadas_24h_alquiler}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                      <span className="text-slate-600">Pendientes</span>
                      <span className={`font-semibold text-right ${matchStats.pendientes_venta > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                        {matchStats.pendientes_venta}
                      </span>
                      <span className={`font-semibold text-right ${matchStats.pendientes_alquiler > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                        {matchStats.pendientes_alquiler}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Colas HITL */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>👤</span> Colas Revisión Humana
              </h2>
              {colas && (
                <div className="space-y-3">
                  <Link
                    href="/admin/supervisor/matching"
                    className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-700">Matching pendientes</span>
                      <span className="text-slate-400">→</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className={`font-bold ${colas.cola_matching_venta > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                        V: {colas.cola_matching_venta}
                      </span>
                      <span className={`font-bold ${colas.cola_matching_alquiler > 10 ? 'text-red-600' : 'text-blue-600'}`}>
                        A: {colas.cola_matching_alquiler}
                      </span>
                    </div>
                  </Link>
                  <Link
                    href="/admin/supervisor/sin-match"
                    className="block p-3 bg-slate-50 rounded-lg hover:bg-slate-100"
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-slate-700">Sin proyecto (huérfanas)</span>
                      <span className="text-slate-400">→</span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span className={`font-bold ${colas.cola_sin_match_venta > 20 ? 'text-red-600' : 'text-orange-600'}`}>
                        V: {colas.cola_sin_match_venta}
                      </span>
                      <span className={`font-bold ${colas.cola_sin_match_alquiler > 20 ? 'text-red-600' : 'text-blue-600'}`}>
                        A: {colas.cola_sin_match_alquiler}
                      </span>
                    </div>
                  </Link>
                  <Link
                    href="/admin/supervisor/excluidas"
                    className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100"
                  >
                    <span className="text-slate-700">Excluidas por revisar</span>
                    <span className="font-bold text-slate-600">
                      {colas.cola_excluidas} →
                    </span>
                  </Link>
                  <Link
                    href="/admin/supervisor/auto-aprobados"
                    className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100"
                  >
                    <span className="text-slate-700">Auto-aprobados sin validar</span>
                    <span className={`font-bold ${colas.cola_auto_aprobados > 50 ? 'text-amber-600' : 'text-green-600'}`}>
                      {colas.cola_auto_aprobados} →
                    </span>
                  </Link>
                </div>
              )}
            </div>

            {/* Proyectos */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>🏗️</span> Proyectos Master
              </h2>
              {proyStats && (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Activos</span>
                    <span className="font-semibold">{proyStats.activos}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">GPS verificado</span>
                    <span className="font-semibold text-green-600">
                      {proyStats.gps_verificado} ({proyStats.activos > 0 ? ((proyStats.gps_verificado / proyStats.activos) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Sin desarrollador</span>
                    <span className="font-semibold text-orange-600">{proyStats.sin_desarrollador}</span>
                  </div>
                  <div className="pt-3 border-t">
                    <Link href="/admin/proyectos" className="text-blue-600 hover:text-blue-800 text-sm">
                      Ver todos los proyectos →
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* TC Dinámico */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>💱</span> Tipo de Cambio
              </h2>
              {tcStats ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">TC Paralelo</span>
                    <span className="font-semibold text-green-600">{tcStats.tc_paralelo} Bs/$</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">TC Oficial</span>
                    <span className="font-semibold">{tcStats.tc_oficial} Bs/$</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-slate-600">Última consulta</span>
                    <span className="text-slate-500">{tcStats.ultima_actualizacion ? formatHace(tcStats.ultima_actualizacion) : 'N/A'}</span>
                  </div>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No hay datos de TC</p>
              )}
            </div>
          </div>

          {/* Health Workflows */}
          <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span>⚙️</span> Health Check - Workflows
            </h2>
            {workflows.length > 0 ? (
              <div className="grid grid-cols-4 gap-4">
                {workflows.map((wf) => (
                  <div
                    key={wf.workflow_name}
                    className={`p-3 rounded-lg border ${
                      wf.horas_desde_run > 26
                        ? 'bg-red-50 border-red-200'
                        : wf.horas_desde_run > 12
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-green-50 border-green-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{getWorkflowIcon(wf)}</span>
                      <span className="font-medium text-sm capitalize">
                        {wf.workflow_name.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      hace {formatHace(wf.ultimo_run)}
                    </p>
                    <p className="text-xs text-slate-400">
                      🕐 {getSchedule(wf.workflow_name)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-sm">No hay datos de ejecuciones</p>
            )}
          </div>
        </main>
      </div>
    </>
  )
}
