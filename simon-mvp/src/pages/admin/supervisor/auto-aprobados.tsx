import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAdminAuth } from '@/hooks/useAdminAuth'

interface AutoAprobado {
  id_sugerencia: number
  propiedad_id: number
  url_propiedad: string
  nombre_edificio: string | null
  dormitorios: number | null
  area_m2: number | null
  precio_usd: number | null
  fuente: string
  proyecto_id: number
  proyecto_nombre: string
  metodo_matching: string
  score_confianza: number
  distancia_metros: number | null
  fecha_match: string
  validacion_humana: string | null
}

interface Proyecto {
  id_proyecto_master: number
  nombre_oficial: string
  zona: string | null
}

interface Stats {
  confirmados: number
  corregidos: number
}

export default function SupervisorAutoAprobados() {
  const { admin, loading: authLoading, error: authError } = useAdminAuth(['super_admin', 'supervisor'])
  const [items, setItems] = useState<AutoAprobado[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [procesando, setProcesando] = useState(false)

  // Filtros
  const [filtroMetodo, setFiltroMetodo] = useState<string>('todos')
  const [filtroConfianza, setFiltroConfianza] = useState<string>('todos')
  const [filtroPeriodo, setFiltroPeriodo] = useState<number>(7)

  // Selección
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())

  // Modo corregir
  const [modoCorregir, setModoCorregir] = useState<number | null>(null)
  const [busquedaProyecto, setBusquedaProyecto] = useState('')
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<number | null>(null)

  // Stats de sesión
  const [stats, setStats] = useState<Stats>({ confirmados: 0, corregidos: 0 })

  useEffect(() => {
    fetchAutoAprobados()
    fetchProyectos()
  }, [filtroMetodo, filtroConfianza, filtroPeriodo])

  if (authLoading) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Verificando acceso...</p></div>
  if (!admin) return null

  const fetchAutoAprobados = async () => {
    if (!supabase) return
    setLoading(true)
    setError(null)

    try {
      const confianzaMin = filtroConfianza === '85-89' ? 85 :
                          filtroConfianza === '90-94' ? 90 :
                          filtroConfianza === '95+' ? 95 : 85
      const confianzaMax = filtroConfianza === '85-89' ? 89 :
                          filtroConfianza === '90-94' ? 94 : 100

      const { data, error: err } = await supabase.rpc('obtener_auto_aprobados_para_revision', {
        p_metodo: filtroMetodo === 'todos' ? null : filtroMetodo,
        p_confianza_min: confianzaMin,
        p_confianza_max: confianzaMax,
        p_dias: filtroPeriodo,
        p_solo_sin_revisar: true
      })

      if (err) throw err
      setItems(data || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchProyectos = async () => {
    if (!supabase) return

    const { data } = await supabase
      .from('proyectos_master')
      .select('id_proyecto_master, nombre_oficial, zona')
      .eq('activo', true)
      .order('nombre_oficial')

    if (data) setProyectos(data)
  }

  const handleConfirmar = async (sugerenciaId: number) => {
    if (!supabase) return
    setProcesando(true)

    try {
      const { data, error: err } = await supabase.rpc('procesar_validacion_auto_aprobado', {
        p_sugerencia_id: sugerenciaId,
        p_accion: 'confirmar',
        p_validado_por: 'dashboard_admin'
      })

      if (err) throw err
      if (!data.success) throw new Error(data.error)

      setStats(prev => ({ ...prev, confirmados: prev.confirmados + 1 }))
      setItems(prev => prev.filter(i => i.id_sugerencia !== sugerenciaId))
      setSeleccionados(prev => {
        const next = new Set(prev)
        next.delete(sugerenciaId)
        return next
      })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleConfirmarSeleccionados = async () => {
    if (!supabase || seleccionados.size === 0) return
    setProcesando(true)

    try {
      for (const id of seleccionados) {
        const { data, error: err } = await supabase.rpc('procesar_validacion_auto_aprobado', {
          p_sugerencia_id: id,
          p_accion: 'confirmar',
          p_validado_por: 'dashboard_admin'
        })
        if (err) throw err
        if (!data.success) throw new Error(data.error)
      }

      setStats(prev => ({ ...prev, confirmados: prev.confirmados + seleccionados.size }))
      setItems(prev => prev.filter(i => !seleccionados.has(i.id_sugerencia)))
      setSeleccionados(new Set())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const handleCorregir = async (sugerenciaId: number) => {
    if (!supabase || !proyectoSeleccionado) return
    setProcesando(true)

    try {
      const { data, error: err } = await supabase.rpc('procesar_validacion_auto_aprobado', {
        p_sugerencia_id: sugerenciaId,
        p_accion: 'corregir',
        p_proyecto_alternativo: proyectoSeleccionado,
        p_validado_por: 'dashboard_admin'
      })

      if (err) throw err
      if (!data.success) throw new Error(data.error)

      setStats(prev => ({ ...prev, corregidos: prev.corregidos + 1 }))
      setItems(prev => prev.filter(i => i.id_sugerencia !== sugerenciaId))
      setModoCorregir(null)
      setBusquedaProyecto('')
      setProyectoSeleccionado(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setProcesando(false)
    }
  }

  const toggleSeleccion = (id: number) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const seleccionarTodos = () => {
    if (seleccionados.size === items.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(items.map(i => i.id_sugerencia)))
    }
  }

  const getMetodoBadge = (metodo: string) => {
    const badges: Record<string, string> = {
      'nombre_exacto': 'bg-green-100 text-green-800',
      'url_slug_exacto': 'bg-blue-100 text-blue-800',
      'url_slug_parcial': 'bg-blue-50 text-blue-700',
      'fuzzy_nombre': 'bg-purple-100 text-purple-800',
      'gps_verificado': 'bg-amber-100 text-amber-800',
      'gps_cercano': 'bg-amber-50 text-amber-700'
    }
    return badges[metodo] || 'bg-gray-100 text-gray-800'
  }

  const formatMetodo = (metodo: string) => {
    const labels: Record<string, string> = {
      'nombre_exacto': 'Nombre exacto',
      'url_slug_exacto': 'URL exacta',
      'url_slug_parcial': 'URL parcial',
      'fuzzy_nombre': 'Fuzzy',
      'gps_verificado': 'GPS verificado',
      'gps_cercano': 'GPS cercano'
    }
    return labels[metodo] || metodo
  }

  const proyectosFiltrados = proyectos
    .filter(p =>
      p.nombre_oficial.toLowerCase().includes(busquedaProyecto.toLowerCase()) ||
      (p.zona && p.zona.toLowerCase().includes(busquedaProyecto.toLowerCase()))
    )
    .slice(0, 10)

  return (
    <>
      <Head>
        <title>Auto-Aprobados | Supervisor SICI</title>
      </Head>

      <div className="min-h-screen bg-slate-100">
        {/* Header */}
        <header className="bg-slate-900 text-white py-4 px-6">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Revisión de Auto-Aprobados</h1>
              <p className="text-slate-400 text-sm">
                Validar matches automáticos de alta confianza
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm text-slate-400">
                Sesión: <span className="text-green-400">{stats.confirmados} confirmados</span>
                {stats.corregidos > 0 && (
                  <span className="text-amber-400 ml-2">{stats.corregidos} corregidos</span>
                )}
              </div>
              <button
                onClick={fetchAutoAprobados}
                disabled={loading}
                className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm"
              >
                {loading ? 'Cargando...' : 'Refrescar'}
              </button>
              <Link href="/admin/supervisor" className="text-slate-300 hover:text-white text-sm">
                Supervisor
              </Link>
              <Link href="/admin/salud" className="text-slate-300 hover:text-white text-sm">
                Salud
              </Link>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-6 px-6">
          {/* Error */}
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
              <button onClick={() => setError(null)} className="float-right text-red-500">&times;</button>
            </div>
          )}

          {/* Filtros */}
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Método</label>
                <select
                  value={filtroMetodo}
                  onChange={(e) => setFiltroMetodo(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="todos">Todos</option>
                  <option value="nombre_exacto">Nombre exacto</option>
                  <option value="url_slug_exacto">URL exacta</option>
                  <option value="url_slug_parcial">URL parcial</option>
                  <option value="fuzzy_nombre">Fuzzy</option>
                  <option value="gps_verificado">GPS verificado</option>
                  <option value="gps_cercano">GPS cercano</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Confianza</label>
                <select
                  value={filtroConfianza}
                  onChange={(e) => setFiltroConfianza(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="todos">Todos (85%+)</option>
                  <option value="85-89">85-89%</option>
                  <option value="90-94">90-94%</option>
                  <option value="95+">95%+</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Período</label>
                <select
                  value={filtroPeriodo}
                  onChange={(e) => setFiltroPeriodo(Number(e.target.value))}
                  className="border rounded-lg px-3 py-2 text-sm"
                >
                  <option value={1}>Hoy</option>
                  <option value={7}>Últimos 7 días</option>
                  <option value={30}>Último mes</option>
                  <option value={90}>Últimos 3 meses</option>
                </select>
              </div>
              <div className="flex-1"></div>
              <div className="text-sm text-slate-600">
                {items.length} pendientes de revisión
              </div>
            </div>
          </div>

          {/* Acciones en lote */}
          {seleccionados.size > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 flex items-center justify-between">
              <span className="text-blue-800">
                {seleccionados.size} seleccionado(s)
              </span>
              <button
                onClick={handleConfirmarSeleccionados}
                disabled={procesando}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                Confirmar seleccionados
              </button>
            </div>
          )}

          {/* Lista */}
          {loading ? (
            <div className="text-center py-12 text-slate-500">Cargando...</div>
          ) : items.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <p className="text-green-800 text-lg font-medium">Sin pendientes</p>
              <p className="text-green-600 text-sm mt-1">
                Todos los auto-aprobados han sido validados
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Seleccionar todos */}
              <div className="flex items-center gap-2 px-2">
                <input
                  type="checkbox"
                  checked={seleccionados.size === items.length && items.length > 0}
                  onChange={seleccionarTodos}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-slate-600">Seleccionar todos</span>
              </div>

              {items.map((item) => (
                <div
                  key={item.id_sugerencia}
                  className={`bg-white rounded-xl shadow-sm p-4 border-2 transition-colors ${
                    seleccionados.has(item.id_sugerencia) ? 'border-blue-400' : 'border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <input
                      type="checkbox"
                      checked={seleccionados.has(item.id_sugerencia)}
                      onChange={() => toggleSeleccion(item.id_sugerencia)}
                      className="w-4 h-4 rounded mt-1"
                    />

                    {/* Contenido */}
                    <div className="flex-1">
                      {/* Fila 1: Match */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900">
                          {item.nombre_edificio || 'Sin nombre'}
                        </span>
                        <span className="text-slate-400">→</span>
                        <span className="font-medium text-blue-700">
                          {item.proyecto_nombre}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${getMetodoBadge(item.metodo_matching)}`}>
                          {item.score_confianza}% {formatMetodo(item.metodo_matching)}
                        </span>
                        {item.distancia_metros && (
                          <span className="text-xs text-slate-500">
                            ({Math.round(item.distancia_metros)}m)
                          </span>
                        )}
                      </div>

                      {/* Fila 2: Datos */}
                      <div className="flex items-center gap-3 mt-1 text-sm text-slate-600">
                        <span className="uppercase text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100">
                          {item.fuente}
                        </span>
                        {item.area_m2 && <span>{item.area_m2}m²</span>}
                        {item.dormitorios !== null && <span>{item.dormitorios} dorms</span>}
                        {item.precio_usd && (
                          <span className="font-medium text-green-700">
                            ${item.precio_usd.toLocaleString()}
                          </span>
                        )}
                        <a
                          href={item.url_propiedad}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Ver listing
                        </a>
                      </div>

                      {/* Modo corregir */}
                      {modoCorregir === item.id_sugerencia && (
                        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <label className="block text-sm font-medium text-amber-800 mb-2">
                            Seleccionar proyecto correcto:
                          </label>
                          <input
                            type="text"
                            placeholder="Buscar proyecto..."
                            value={busquedaProyecto}
                            onChange={(e) => setBusquedaProyecto(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                          />
                          {busquedaProyecto && proyectosFiltrados.length > 0 && (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {proyectosFiltrados.map((p) => (
                                <button
                                  key={p.id_proyecto_master}
                                  onClick={() => setProyectoSeleccionado(p.id_proyecto_master)}
                                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
                                    proyectoSeleccionado === p.id_proyecto_master
                                      ? 'bg-amber-200 text-amber-900'
                                      : 'hover:bg-amber-100'
                                  }`}
                                >
                                  {p.nombre_oficial}
                                  {p.zona && <span className="text-amber-600 ml-2">({p.zona})</span>}
                                </button>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2 mt-3">
                            <button
                              onClick={() => handleCorregir(item.id_sugerencia)}
                              disabled={!proyectoSeleccionado || procesando}
                              className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                            >
                              Asignar seleccionado
                            </button>
                            <button
                              onClick={() => {
                                setModoCorregir(null)
                                setBusquedaProyecto('')
                                setProyectoSeleccionado(null)
                              }}
                              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-2 rounded-lg text-sm"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Acciones */}
                    {modoCorregir !== item.id_sugerencia && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmar(item.id_sugerencia)}
                          disabled={procesando}
                          className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          Confirmar
                        </button>
                        <button
                          onClick={() => setModoCorregir(item.id_sugerencia)}
                          disabled={procesando}
                          className="bg-amber-100 hover:bg-amber-200 text-amber-700 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          Corregir
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
