import { useState, useEffect, useRef, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'
import type { PropiedadSalud } from '@/types/db-responses'

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

interface ProyectosStats {
  activos: number
  gps_verificado: number
  sin_desarrollador: number
}

interface TCStats {
  tc_paralelo: string
  tc_oficial: string
  ultima_actualizacion: string | null
}

export default function DashboardSalud() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor', 'viewer'])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Stats
  const [propStats, setPropStats] = useState<StatsProps | null>(null)
  const [proyStats, setProyStats] = useState<ProyectosStats | null>(null)
  const [tcStats, setTCStats] = useState<TCStats | null>(null)
  const [chatStats, setChatStats] = useState<{ total: { messages: number; sessions: number; input_tokens: number; output_tokens: number; errors: number; cost_usd: number }; days: Array<{ date: string; messages: number; sessions: number; cost_usd: number }> } | null>(null)

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

    return nuevasAlertas
  }, [propStats])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  async function fetchAllStats() {
    if (!supabase) return
    setLoading(true)

    try {
      // Fetch all stats in parallel
      await Promise.all([
        fetchPropiedadesStats(),
        fetchProyectosStats(),
        fetchTCStats(),
        fetchChatStats(),
      ])

      setLastUpdate(new Date())
    } catch (err) {
      console.error('Error fetching stats:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchChatStats() {
    try {
      const res = await fetch('/api/chat-alquileres')
      if (res.ok) setChatStats(await res.json())
    } catch { /* silently fail — bot might not be deployed */ }
  }

  async function fetchPropiedadesStats() {
    if (!supabase) return

    const esVenta = "COALESCE(tipo_operacion, 'venta') != 'alquiler'"
    const esAlquiler = "tipo_operacion = 'alquiler'"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPC not in Supabase typegen
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
        const rows = props as PropiedadSalud[]
        const completadas = rows.filter(p => p.status === 'completado')
        const venta = completadas.filter(p => (p.tipo_operacion || 'venta') !== 'alquiler')
        const alquiler = completadas.filter(p => p.tipo_operacion === 'alquiler')
        const inactivos = rows.filter(p => p.status === 'inactivo_pending' || p.status === 'inactivo_confirmed')
        const nuevas = rows.filter(p => p.status === 'nueva')
        const recientes = rows.filter(p => {
          const created = new Date(p.fecha_creacion)
          return created > new Date(Date.now() - 24 * 60 * 60 * 1000)
        })

        setPropStats({
          completadas_venta: venta.length,
          nuevas_venta: nuevas.filter(p => (p.tipo_operacion || 'venta') !== 'alquiler').length,
          ultimas_24h_venta: recientes.filter(p => (p.tipo_operacion || 'venta') !== 'alquiler').length,
          matcheadas_venta: venta.filter(p => p.id_proyecto_master).length,
          sin_match_venta: venta.filter(p => !p.id_proyecto_master).length,
          inactivo_venta: inactivos.filter(p => (p.tipo_operacion || 'venta') !== 'alquiler').length,
          score_alto: venta.filter(p => (p.score_calidad_dato || 0) >= 95).length,
          score_medio: venta.filter(p => (p.score_calidad_dato || 0) >= 85 && (p.score_calidad_dato || 0) < 95).length,
          score_bajo: venta.filter(p => (p.score_calidad_dato || 0) < 85).length,
          completadas_alquiler: alquiler.length,
          nuevas_alquiler: nuevas.filter(p => p.tipo_operacion === 'alquiler').length,
          ultimas_24h_alquiler: recientes.filter(p => p.tipo_operacion === 'alquiler').length,
          matcheadas_alquiler: alquiler.filter(p => p.id_proyecto_master).length,
          sin_match_alquiler: alquiler.filter(p => !p.id_proyecto_master).length,
          inactivo_alquiler: inactivos.filter(p => p.tipo_operacion === 'alquiler').length,
          alq_con_precio: alquiler.filter(p => p.precio_mensual_bob && p.precio_mensual_bob > 0).length,
          alq_con_agente: alquiler.filter(p => p.datos_json?.agente_nombre).length,
          alq_con_zona: alquiler.filter(p => p.zona).length,
          alq_con_dormitorios: alquiler.filter(p => p.dormitorios !== null).length,
          sin_zona: completadas.filter(p => !p.zona).length,
          sin_dormitorios: completadas.filter(p => p.dormitorios === null).length
        })
      }
    } else if (data?.[0]) {
      setPropStats(data[0])
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

  const formatHace = (isoDate: string) => {
    if (!isoDate) return '-'
    const diff = Date.now() - new Date(isoDate).getTime()
    const horas = Math.floor(diff / (1000 * 60 * 60))
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

    if (horas > 24) return `${Math.floor(horas / 24)}d`
    if (horas > 0) return `${horas}h`
    return `${mins}min`
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
              <Link href="/admin/market" className="text-purple-400 hover:text-purple-300 text-sm font-medium">
                Market Venta
              </Link>
              <Link href="/admin/market-alquileres" className="text-teal-400 hover:text-teal-300 text-sm font-medium">
                Market Alquileres
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 px-6">
          {/* Qué mide y qué NO — 31-ago-2026.
              Se retiraron 3 tarjetas que leían fuentes CONGELADAS desde el 28-jul y por eso
              pintaban en verde: "Matching (24h)" y "Colas Revisión Humana" (matching_sugerencias,
              del supervisor HITL retirado el 20-ago) y "Health Check - Workflows"
              (workflow_executions, el pipeline de n8n que NO vuelve).
              🔑 Un panel que dice "sano" leyendo una tabla muerta es peor que no tener panel.
              Lo que queda lee fuentes vivas: propiedades_v2, proyectos_master y config_global.
              El estado de las capturas nocturnas NO se mira acá: se mira con /revisar-routines,
              que lee los LOGS de las 5 routines, no la BD. */}
          <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Mide las fuentes <strong>vivas</strong>: inventario, calidad de datos, proyectos, bot y tipo de cambio.
            <br />
            El estado de las capturas nocturnas no se ve acá — eso es <code className="text-slate-800">/revisar-routines</code>, que lee los logs de cada corrida.
          </div>

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

            {/* Simón Bot */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <span>💬</span> Simón Bot
              </h2>
              {chatStats ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Mensajes (hoy)</span>
                    <span className="font-semibold">{chatStats.days.find(d => d.date === new Date().toISOString().slice(0, 10))?.messages ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Sesiones (hoy)</span>
                    <span className="font-semibold">{chatStats.days.find(d => d.date === new Date().toISOString().slice(0, 10))?.sessions ?? 0}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-slate-600">Total mensajes</span>
                    <span className="font-semibold">{chatStats.total.messages}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total sesiones</span>
                    <span className="font-semibold">{chatStats.total.sessions}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Tokens (in/out)</span>
                    <span className="text-slate-500">{(chatStats.total.input_tokens / 1000).toFixed(1)}K / {(chatStats.total.output_tokens / 1000).toFixed(1)}K</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Errores</span>
                    <span className={chatStats.total.errors > 0 ? 'text-red-600 font-semibold' : 'text-slate-500'}>{chatStats.total.errors}</span>
                  </div>
                  <div className="flex justify-between pt-3 border-t">
                    <span className="text-slate-600">Costo estimado</span>
                    <span className="font-semibold text-green-600">${chatStats.total.cost_usd.toFixed(4)}</span>
                  </div>
                  <p className="text-xs text-slate-400 pt-1">In-memory — se resetea con cada deploy</p>
                </div>
              ) : (
                <p className="text-slate-500 text-sm">Bot no activo</p>
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
        </main>
      </div>
    </>
  )
}
