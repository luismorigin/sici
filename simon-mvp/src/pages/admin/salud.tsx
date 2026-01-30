import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface StatsProps {
  completadas: number
  nuevas: number
  inactivo_pending: number
  excluido_operacion: number
  matcheadas: number
  sin_match: number
  ultimas_24h: number
  score_alto: number
  score_medio: number
  score_bajo: number
  sin_zona: number
  sin_dormitorios: number
}

interface MatchingStats {
  sugerencias_24h: number
  aprobadas_24h: number
  rechazadas_24h: number
  pendientes: number
}

interface ProyectosStats {
  activos: number
  gps_verificado: number
  sin_desarrollador: number
}

interface ColasHITL {
  cola_matching: number
  cola_sin_match: number
  cola_excluidas: number
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
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Stats
  const [propStats, setPropStats] = useState<StatsProps | null>(null)
  const [matchStats, setMatchStats] = useState<MatchingStats | null>(null)
  const [proyStats, setProyStats] = useState<ProyectosStats | null>(null)
  const [colas, setColas] = useState<ColasHITL | null>(null)
  const [tcStats, setTCStats] = useState<TCStats | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowHealth[]>([])

  // Alertas
  const [alertas, setAlertas] = useState<string[]>([])

  useEffect(() => {
    fetchAllStats()
  }, [])

  const fetchAllStats = async () => {
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

  const fetchPropiedadesStats = async () => {
    if (!supabase) return

    const { data, error } = await supabase.rpc('pg_execute_query' as any, {
      query: `
        SELECT
          COUNT(*) FILTER (WHERE status = 'completado')::int as completadas,
          COUNT(*) FILTER (WHERE status = 'nueva')::int as nuevas,
          COUNT(*) FILTER (WHERE status = 'inactivo_pending')::int as inactivo_pending,
          COUNT(*) FILTER (WHERE status = 'excluido_operacion')::int as excluido_operacion,
          COUNT(*) FILTER (WHERE id_proyecto_master IS NOT NULL AND status = 'completado')::int as matcheadas,
          COUNT(*) FILTER (WHERE id_proyecto_master IS NULL AND status = 'completado')::int as sin_match,
          COUNT(*) FILTER (WHERE fecha_creacion >= NOW() - INTERVAL '24 hours')::int as ultimas_24h,
          COUNT(*) FILTER (WHERE score_calidad_dato >= 95 AND status = 'completado')::int as score_alto,
          COUNT(*) FILTER (WHERE score_calidad_dato >= 85 AND score_calidad_dato < 95 AND status = 'completado')::int as score_medio,
          COUNT(*) FILTER (WHERE score_calidad_dato < 85 AND status = 'completado')::int as score_bajo,
          COUNT(*) FILTER (WHERE (zona IS NULL OR zona = '') AND status = 'completado')::int as sin_zona,
          COUNT(*) FILTER (WHERE dormitorios IS NULL AND status = 'completado')::int as sin_dormitorios
        FROM propiedades_v2
      `
    })

    // Fallback: direct query
    if (error || !data) {
      const { data: props } = await supabase
        .from('propiedades_v2')
        .select('status, id_proyecto_master, score_calidad_dato, zona, dormitorios, fecha_creacion')

      if (props) {
        const completadas = props.filter(p => p.status === 'completado')
        setPropStats({
          completadas: completadas.length,
          nuevas: props.filter(p => p.status === 'nueva').length,
          inactivo_pending: props.filter(p => p.status === 'inactivo_pending').length,
          excluido_operacion: props.filter(p => p.status === 'excluido_operacion').length,
          matcheadas: completadas.filter(p => p.id_proyecto_master).length,
          sin_match: completadas.filter(p => !p.id_proyecto_master).length,
          ultimas_24h: props.filter(p => {
            const created = new Date(p.fecha_creacion)
            return created > new Date(Date.now() - 24 * 60 * 60 * 1000)
          }).length,
          score_alto: completadas.filter(p => (p.score_calidad_dato || 0) >= 95).length,
          score_medio: completadas.filter(p => (p.score_calidad_dato || 0) >= 85 && (p.score_calidad_dato || 0) < 95).length,
          score_bajo: completadas.filter(p => (p.score_calidad_dato || 0) < 85).length,
          sin_zona: completadas.filter(p => !p.zona).length,
          sin_dormitorios: completadas.filter(p => p.dormitorios === null).length
        })
      }
    } else if (data?.[0]) {
      setPropStats(data[0])
    }
  }

  const fetchMatchingStats = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('matching_sugerencias')
      .select('estado, created_at, fecha_revision')

    if (data) {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      setMatchStats({
        sugerencias_24h: data.filter(d => new Date(d.created_at) > yesterday).length,
        aprobadas_24h: data.filter(d => d.estado === 'aprobado' && d.fecha_revision && new Date(d.fecha_revision) > yesterday).length,
        rechazadas_24h: data.filter(d => d.estado === 'rechazado' && d.fecha_revision && new Date(d.fecha_revision) > yesterday).length,
        pendientes: data.filter(d => d.estado === 'pendiente').length
      })
    }
  }

  const fetchProyectosStats = async () => {
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

  const fetchColasHITL = async () => {
    if (!supabase) return

    // Cola matching
    const { data: matching } = await supabase
      .from('matching_sugerencias')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')

    // Cola sin match - usar RPC
    const { data: sinMatch } = await supabase.rpc('obtener_sin_match_para_exportar', { p_limit: 1000 })

    // Cola excluidas - usar RPC
    const { data: excluidas } = await supabase.rpc('exportar_propiedades_excluidas')

    setColas({
      cola_matching: matching?.length || 0,
      cola_sin_match: sinMatch?.length || 0,
      cola_excluidas: excluidas?.length || 0
    })
  }

  const fetchTCStats = async () => {
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

  const fetchWorkflowHealth = async () => {
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

  // Calcular alertas
  useEffect(() => {
    const nuevasAlertas: string[] = []

    if (colas) {
      if (colas.cola_matching > 10) {
        nuevasAlertas.push(`${colas.cola_matching} matches pendientes de revisión`)
      }
      if (colas.cola_sin_match > 20) {
        nuevasAlertas.push(`${colas.cola_sin_match} propiedades sin proyecto`)
      }
      if (colas.cola_excluidas > 30) {
        nuevasAlertas.push(`${colas.cola_excluidas} excluidas por revisar`)
      }
    }

    if (propStats) {
      const pctMatch = propStats.completadas > 0 ? (propStats.matcheadas / propStats.completadas) * 100 : 0
      if (pctMatch < 85) {
        nuevasAlertas.push(`Cobertura matching baja: ${pctMatch.toFixed(1)}%`)
      }

      const pctBajo = propStats.completadas > 0 ? (propStats.score_bajo / propStats.completadas) * 100 : 0
      if (pctBajo > 10) {
        nuevasAlertas.push(`${pctBajo.toFixed(1)}% con calidad baja`)
      }
    }

    // Verificar workflows críticos
    const workflowsRequeridos = ['discovery', 'enrichment', 'merge']
    for (const wf of workflowsRequeridos) {
      const found = workflows.find(w => w.workflow_name === wf)
      if (found && found.horas_desde_run > 26) {
        nuevasAlertas.push(`${wf} no corrió en ${found.horas_desde_run.toFixed(0)}h`)
      }
    }

    setAlertas(nuevasAlertas)
  }, [colas, propStats, workflows])

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
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Completadas</span>
                    <span className="font-semibold">{propStats.completadas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Nuevas (sin procesar)</span>
                    <span className="font-semibold text-blue-600">{propStats.nuevas}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Matcheadas</span>
                    <span className="font-semibold text-green-600">
                      {propStats.matcheadas} ({propStats.completadas > 0 ? ((propStats.matcheadas / propStats.completadas) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Sin match</span>
                    <span className="font-semibold text-orange-600">{propStats.sin_match}</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t">
                    <span className="text-slate-600">Últimas 24h</span>
                    <span className="font-semibold text-purple-600">+{propStats.ultimas_24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Inactivas pending</span>
                    <span className="text-slate-500">{propStats.inactivo_pending}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Excluidas operación</span>
                    <span className="text-slate-500">{propStats.excluido_operacion}</span>
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
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Score alto (≥95)</span>
                    <span className="font-semibold text-green-600">
                      {propStats.score_alto} ({propStats.completadas > 0 ? ((propStats.score_alto / propStats.completadas) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Score medio (85-94)</span>
                    <span className="font-semibold text-amber-600">
                      {propStats.score_medio} ({propStats.completadas > 0 ? ((propStats.score_medio / propStats.completadas) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Score bajo (&lt;85)</span>
                    <span className="font-semibold text-red-600">
                      {propStats.score_bajo} ({propStats.completadas > 0 ? ((propStats.score_bajo / propStats.completadas) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                  <div className="pt-3 border-t space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sin zona</span>
                      <span className="text-orange-600">{propStats.sin_zona}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Sin dormitorios</span>
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
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Sugerencias</span>
                    <span className="font-semibold">{matchStats.sugerencias_24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Aprobadas</span>
                    <span className="font-semibold text-green-600">{matchStats.aprobadas_24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Rechazadas</span>
                    <span className="font-semibold text-red-600">{matchStats.rechazadas_24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tasa aprobación</span>
                    <span className="font-semibold">
                      {matchStats.sugerencias_24h > 0
                        ? ((matchStats.aprobadas_24h / matchStats.sugerencias_24h) * 100).toFixed(0)
                        : '-'}%
                    </span>
                  </div>
                  <div className="pt-3 border-t">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Pendientes revisión</span>
                      <span className={`font-semibold ${matchStats.pendientes > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                        {matchStats.pendientes}
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
                    className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100"
                  >
                    <span className="text-slate-700">Matching pendientes</span>
                    <span className={`font-bold ${colas.cola_matching > 10 ? 'text-red-600' : 'text-amber-600'}`}>
                      {colas.cola_matching} →
                    </span>
                  </Link>
                  <Link
                    href="/admin/supervisor/sin-match"
                    className="flex justify-between items-center p-3 bg-slate-50 rounded-lg hover:bg-slate-100"
                  >
                    <span className="text-slate-700">Sin proyecto (huérfanas)</span>
                    <span className={`font-bold ${colas.cola_sin_match > 20 ? 'text-red-600' : 'text-orange-600'}`}>
                      {colas.cola_sin_match} →
                    </span>
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
                    <span className="text-slate-500">{formatHace(tcStats.ultima_actualizacion)}</span>
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
